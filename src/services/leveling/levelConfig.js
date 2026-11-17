// levelConfig.js
// Leveling config defaults, normalisation and message templating. Pure (no I/O).

export const DEFAULT_LEVELING_CONFIG = Object.freeze({
  configured: false,
  enabled: true,
  xpRange: Object.freeze({ min: 15, max: 25 }),
  xpCooldown: 60,
  xpMultiplier: 1,
  levelUpMessage: '{user} has leveled up to level {level}!',
  levelUpChannel: null, // null -> the channel where the member levelled up
  levelUpStyle: 'embed', // 'embed' | 'text'
  announceLevelUp: true,
  roleRewards: {}, // { "<level>": "<roleId>" }
  roleRewardMode: 'stack', // 'stack' keeps every earned role, 'replace' keeps only the highest
  ignoredChannels: [],
  ignoredRoles: [],
  blacklistedUsers: [],
});

export const LEVEL_UP_PLACEHOLDERS = Object.freeze([
  '{user}',
  '{username}',
  '{level}',
  '{oldLevel}',
  '{xp}',
  '{xpNeeded}',
  '{totalXp}',
  '{server}',
]);

const toInt = (value, fallback, min, max) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const toIdList = (value) =>
  Array.isArray(value) ? [...new Set(value.filter((v) => typeof v === 'string' && v))] : [];

/**
 * Merge stored config with defaults and coerce every field into a safe shape.
 * Understands the legacy `xpPerMessage` field and always emits `xpRange`.
 */
export function normalizeLevelingConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_LEVELING_CONFIG;

  const legacyRange = src.xpRange ?? src.xpPerMessage ?? {};
  const min = toInt(legacyRange.min, d.xpRange.min, 1, 5000);
  const max = Math.max(min, toInt(legacyRange.max, d.xpRange.max, 1, 5000));

  const multiplier = Number(src.xpMultiplier);

  const roleRewards = {};
  if (src.roleRewards && typeof src.roleRewards === 'object') {
    for (const [lvl, roleId] of Object.entries(src.roleRewards)) {
      const level = Number(lvl);
      if (Number.isInteger(level) && level >= 1 && typeof roleId === 'string' && roleId) {
        roleRewards[String(level)] = roleId;
      }
    }
  }

  return {
    // A config that has been saved before is considered configured (keeps old guilds working).
    configured: src.configured === true,
    enabled: src.enabled !== false,
    xpRange: { min, max },
    xpCooldown: toInt(src.xpCooldown, d.xpCooldown, 0, 3600),
    xpMultiplier: Number.isFinite(multiplier) ? Math.max(0.1, Math.min(10, multiplier)) : 1,
    levelUpMessage:
      typeof src.levelUpMessage === 'string' && src.levelUpMessage.trim()
        ? src.levelUpMessage.slice(0, 500)
        : d.levelUpMessage,
    levelUpChannel: typeof src.levelUpChannel === 'string' && src.levelUpChannel ? src.levelUpChannel : null,
    levelUpStyle: src.levelUpStyle === 'text' ? 'text' : 'embed',
    announceLevelUp: src.announceLevelUp !== false,
    roleRewards,
    roleRewardMode: src.roleRewardMode === 'replace' ? 'replace' : 'stack',
    ignoredChannels: toIdList(src.ignoredChannels),
    ignoredRoles: toIdList(src.ignoredRoles),
    blacklistedUsers: toIdList(src.blacklistedUsers),
  };
}

/** Role rewards as a sorted [{ level, roleId }] list. */
export function getSortedRoleRewards(config) {
  return Object.entries(config?.roleRewards ?? {})
    .map(([level, roleId]) => ({ level: Number(level), roleId }))
    .filter((r) => Number.isInteger(r.level) && r.roleId)
    .sort((a, b) => a.level - b.level);
}

/** Single-pass placeholder replacement (values can never be re-interpreted as placeholders). */
export function renderTemplate(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/** Pick a random XP amount for one message, honouring range and multiplier. */
export function rollMessageXp(config, random = Math.random) {
  const { min, max } = config.xpRange;
  const base = Math.floor(random() * (max - min + 1)) + min;
  return Math.max(1, Math.floor(base * config.xpMultiplier));
}
