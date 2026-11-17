// leveling.js
// Public leveling API: config + per-user storage, leaderboard, admin level changes.
// XP gain (messages, level-ups, announcements) lives in xpSystem.js.

import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../config/guildConfig.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { Mutex } from '../../utils/mutex.js';
import { getUserLevelKey, getUserLevelPrefix } from '../../utils/database/keys.js';
import {
  MAX_LEVEL,
  MIN_LEVEL,
  xpToNextLevel,
  totalXpForLevel,
  levelFromTotalXp,
} from './levelMath.js';
import { normalizeLevelingConfig } from './levelConfig.js';
import { syncRoleRewards } from './levelRoles.js';

export { MAX_LEVEL, MIN_LEVEL };
export { DEFAULT_LEVELING_CONFIG, normalizeLevelingConfig } from './levelConfig.js';

/* ------------------------------------------------------------------ */
/* Math wrappers (kept for backwards compatibility with old imports)   */
/* ------------------------------------------------------------------ */

/** XP needed to go from `level` to `level + 1`. Throws on invalid input. */
export function getXpForLevel(level) {
  if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new TitanBotError(
      `Invalid level: ${level}. Must be between ${MIN_LEVEL} and ${MAX_LEVEL}`,
      ErrorTypes.VALIDATION,
      'The level must be a valid number.',
    );
  }
  return xpToNextLevel(level);
}

export function getLevelFromXp(xp) {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new TitanBotError(`Invalid XP: ${xp}`, ErrorTypes.VALIDATION, 'XP must be a non-negative number.');
  }
  return levelFromTotalXp(xp);
}

export function calculateTotalXp(level, currentXp = 0) {
  return totalXpForLevel(level) + Math.max(0, currentXp);
}

export const levelLockKey = (guildId, userId) => `leveling:${guildId}:${userId}`;

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export async function getLevelingConfig(client, guildId) {
  try {
    const guildConfig = await getGuildConfig(client, guildId);
    return normalizeLevelingConfig(guildConfig?.leveling);
  } catch (error) {
    logger.error(`Error getting leveling config for guild ${guildId}:`, error);
    return normalizeLevelingConfig(null);
  }
}

export async function saveLevelingConfig(client, guildId, config) {
  try {
    if (!guildId || !config) {
      throw new TitanBotError('Guild ID and config are required', ErrorTypes.VALIDATION);
    }

    if (config.xpCooldown !== undefined && (config.xpCooldown < 0 || config.xpCooldown > 3600)) {
      throw new TitanBotError(
        'XP cooldown must be between 0 and 3600 seconds',
        ErrorTypes.VALIDATION,
        'Cooldown must be between 0 and 3600 seconds.',
      );
    }

    const range = config.xpRange ?? config.xpPerMessage;
    if (range && (range.min < 1 || range.max < 1 || range.min > range.max)) {
      throw new TitanBotError(
        'Invalid XP range configuration',
        ErrorTypes.VALIDATION,
        'Minimum XP must be less than maximum XP, and both must be positive.',
      );
    }

    const guildConfig = await getGuildConfig(client, guildId);
    guildConfig.leveling = normalizeLevelingConfig(config);
    await setGuildConfig(client, guildId, guildConfig);

    logger.info(`Leveling config updated for guild ${guildId}`);
  } catch (error) {
    logger.error(`Error saving leveling config for guild ${guildId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to save config: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not save configuration at this time.',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Per-user storage                                                    */
/* ------------------------------------------------------------------ */

const boardCache = new Map(); // guildId -> { at, entries }
const BOARD_TTL_MS = 30_000;

export function invalidateLeaderboardCache(guildId) {
  boardCache.delete(guildId);
}

function requireIds(guildId, userId) {
  if (!guildId || !userId) {
    throw new TitanBotError('Guild ID and User ID are required', ErrorTypes.VALIDATION);
  }
}

export async function getUserLevelData(client, guildId, userId) {
  try {
    requireIds(guildId, userId);
    const data = await client.db.get(getUserLevelKey(guildId, userId));

    return {
      xp: Math.max(0, Number(data?.xp) || 0),
      level: Math.max(MIN_LEVEL, Math.min(Number(data?.level) || 0, MAX_LEVEL)),
      totalXp: Math.max(0, Number(data?.totalXp) || 0),
      lastMessage: Number(data?.lastMessage) || 0,
      rank: Number(data?.rank) || 0,
    };
  } catch (error) {
    logger.error(`Error getting user level data for ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to fetch user data: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not fetch level data at this time.',
    );
  }
}

export async function saveUserLevelData(client, guildId, userId, data) {
  try {
    requireIds(guildId, userId);
    if (!data || typeof data !== 'object') {
      throw new TitanBotError('Invalid user level data', ErrorTypes.VALIDATION);
    }

    await client.db.set(getUserLevelKey(guildId, userId), {
      xp: Math.max(0, Number(data.xp) || 0),
      level: Math.max(MIN_LEVEL, Math.min(Number(data.level) || 0, MAX_LEVEL)),
      totalXp: Math.max(0, Number(data.totalXp) || 0),
      lastMessage: Number(data.lastMessage) || 0,
      rank: Number(data.rank) || 0,
    });
    invalidateLeaderboardCache(guildId);
  } catch (error) {
    logger.error(`Error saving user level data for ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to save user data: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not save level data at this time.',
    );
  }
}

export async function deleteUserLevelData(client, guildId, userId) {
  try {
    requireIds(guildId, userId);
    await client.db.delete(getUserLevelKey(guildId, userId));
    invalidateLeaderboardCache(guildId);
    logger.debug(`Deleted level data for user ${userId} in guild ${guildId}`);
  } catch (error) {
    logger.warn(`Could not delete level data for user ${userId} in guild ${guildId}: ${error.message}`);
  }
}

/** IDs of every user that has stored level data in a guild (current + legacy key layouts). */
export async function listLevelUserIds(client, guildId) {
  if (!client.db?.list) return [];

  const prefixes = [getUserLevelPrefix(guildId), `${guildId}:leveling:users:`];
  const userIds = new Set();

  for (const prefix of prefixes) {
    let keys = await client.db.list(prefix).catch(() => []);
    if (!Array.isArray(keys)) {
      keys = typeof keys === 'object' && keys !== null ? Object.keys(keys) : [];
    }
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const userId = key.slice(prefix.length);
      if (/^\d{17,20}$/.test(userId)) userIds.add(userId);
    }
  }

  return [...userIds];
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

async function loadRankedEntries(client, guildId) {
  const cached = boardCache.get(guildId);
  if (cached && Date.now() - cached.at < BOARD_TTL_MS) return cached.entries;

  const userIds = await listLevelUserIds(client, guildId);
  const entries = [];

  const CHUNK = 25;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const rows = await Promise.all(
      chunk.map((userId) => getUserLevelData(client, guildId, userId).then((d) => ({ userId, ...d })).catch(() => null)),
    );
    for (const row of rows) {
      if (row && (row.totalXp > 0 || row.level > 0)) entries.push(row);
    }
  }

  entries.sort((a, b) => b.totalXp - a.totalXp || b.level - a.level || a.userId.localeCompare(b.userId));
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  boardCache.set(guildId, { at: Date.now(), entries });
  return entries;
}

/**
 * One page of the leaderboard.
 * @returns {{ entries: object[], page: number, totalPages: number, total: number }}
 */
export async function getLeaderboardPage(client, guildId, page = 1, perPage = 10) {
  if (!guildId || typeof guildId !== 'string') {
    throw new TitanBotError('Invalid guild ID', ErrorTypes.VALIDATION, 'Guild ID is required.');
  }

  const all = await loadRankedEntries(client, guildId);
  const size = Math.max(1, Math.min(25, Math.floor(perPage) || 10));
  const totalPages = Math.max(1, Math.ceil(all.length / size));
  const safePage = Math.max(1, Math.min(Math.floor(page) || 1, totalPages));
  const start = (safePage - 1) * size;

  return { entries: all.slice(start, start + size), page: safePage, totalPages, total: all.length };
}

export async function getLeaderboard(client, guildId, limit = 10) {
  const { entries } = await getLeaderboardPage(client, guildId, 1, Math.min(Math.max(limit, 1), 25));
  return entries;
}

/** A member's position on the leaderboard. `rank` is null when they have no XP yet. */
export async function getUserRank(client, guildId, userId) {
  const all = await loadRankedEntries(client, guildId);
  const index = all.findIndex((entry) => entry.userId === userId);
  return { rank: index === -1 ? null : index + 1, total: all.length };
}

/* ------------------------------------------------------------------ */
/* Admin level changes (add / remove / set)                            */
/* ------------------------------------------------------------------ */

async function assertLevelingEnabled(client, guildId) {
  const config = await getLevelingConfig(client, guildId);
  if (!config.enabled) {
    throw new TitanBotError(
      'Leveling system is disabled on this server',
      ErrorTypes.CONFIGURATION,
      'The leveling system is currently disabled on this server.',
    );
  }
  return config;
}

/** Shared flow: lock, compute new level, persist, then re-sync reward roles. */
async function changeUserLevel(client, guildId, userId, computeLevel, logLabel) {
  const config = await assertLevelingEnabled(client, guildId);

  const { userData, previousLevel } = await Mutex.runExclusive(levelLockKey(guildId, userId), async () => {
    const data = await getUserLevelData(client, guildId, userId);
    const before = data.level;
    const newLevel = computeLevel(before);

    data.level = newLevel;
    data.xp = 0;
    data.totalXp = totalXpForLevel(newLevel);
    await saveUserLevelData(client, guildId, userId, data);

    return { userData: data, previousLevel: before };
  });

  let roles = { added: [], removed: [], skipped: [] };
  try {
    const guild = client.guilds.cache.get(guildId);
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    if (guild && member) {
      roles = await syncRoleRewards(guild, member, userData.level, config, {
        reason: `Level changed by an administrator (${logLabel})`,
        strict: true,
      });
    }
  } catch (error) {
    logger.warn(`Role sync after level change failed for ${userId} in ${guildId}: ${error.message}`);
  }

  logger.info(`${logLabel}: user ${userId} in guild ${guildId} ${previousLevel} -> ${userData.level}`);
  return { ...userData, previousLevel, roles };
}

export async function addLevels(client, guildId, userId, levels) {
  if (!Number.isInteger(levels) || levels <= 0) {
    throw new TitanBotError(
      `Invalid level amount: ${levels}`,
      ErrorTypes.VALIDATION,
      'You must add a positive number of levels.',
    );
  }

  return changeUserLevel(
    client,
    guildId,
    userId,
    (current) => {
      if (current + levels > MAX_LEVEL) {
        throw new TitanBotError(
          `Level ${current + levels} exceeds maximum level ${MAX_LEVEL}`,
          ErrorTypes.VALIDATION,
          `Maximum level is ${MAX_LEVEL}.`,
        );
      }
      return current + levels;
    },
    `Added ${levels} level(s)`,
  );
}

export async function removeLevels(client, guildId, userId, levels) {
  if (!Number.isInteger(levels) || levels <= 0) {
    throw new TitanBotError(
      `Invalid level amount: ${levels}`,
      ErrorTypes.VALIDATION,
      'You must remove a positive number of levels.',
    );
  }

  return changeUserLevel(client, guildId, userId, (current) => Math.max(MIN_LEVEL, current - levels), `Removed ${levels} level(s)`);
}

export async function setUserLevel(client, guildId, userId, level) {
  if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new TitanBotError(
      `Invalid level: ${level}`,
      ErrorTypes.VALIDATION,
      `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}.`,
    );
  }

  return changeUserLevel(client, guildId, userId, () => level, `Set level to ${level}`);
}
