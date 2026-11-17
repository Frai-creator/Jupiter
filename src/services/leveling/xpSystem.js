// xpSystem.js
// Awarding XP: message gating, cooldown, level-ups, reward roles, announcements.

import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { logEvent, EVENT_TYPES } from '../loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { Mutex } from '../../utils/mutex.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';
import { getLevelingConfig, getUserLevelData, saveUserLevelData, levelLockKey } from './leveling.js';
import { MAX_LEVEL, xpToNextLevel, progressPercent, progressBar, formatNumber } from './levelMath.js';
import { renderTemplate, rollMessageXp } from './levelConfig.js';
import { syncRoleRewards } from './levelRoles.js';

/**
 * Award XP to a member.
 *
 * @param {object} [options]
 * @param {object} [options.config]       Pre-fetched leveling config (saves a DB read).
 * @param {number} [options.cooldownMs]   Skip (return null) if the member earned XP more recently than this.
 * @param {object} [options.channel]      Channel to fall back to for the level-up announcement.
 * @returns {Promise<null | { level, xp, totalXp, xpNeeded, leveledUp, oldLevel, roles }>}
 *          null when XP was skipped (disabled / invalid amount / cooldown).
 */
export const addXp = wrapServiceBoundary(async function addXp(client, guild, member, xpToAdd, options = {}) {
  if (!xpToAdd || xpToAdd <= 0) return null;

  const config = options.config ?? (await getLevelingConfig(client, guild.id));
  if (!config.enabled) return null;

  // Everything that touches the stored XP happens under one lock, including the cooldown check,
  // so two messages arriving at the same time cannot both be rewarded.
  const outcome = await Mutex.runExclusive(levelLockKey(guild.id, member.user.id), async () => {
    const data = await getUserLevelData(client, guild.id, member.user.id);
    const now = Date.now();

    if (options.cooldownMs && now - data.lastMessage < options.cooldownMs) return null;

    const oldLevel = data.level;
    data.lastMessage = now;

    if (data.level >= MAX_LEVEL) {
      // Level cap: keep counting lifetime XP, but there is no progress bar left to fill.
      data.totalXp += xpToAdd;
      data.xp = 0;
    } else {
      data.xp += xpToAdd;
      data.totalXp += xpToAdd;
      while (data.level < MAX_LEVEL && data.xp >= xpToNextLevel(data.level)) {
        data.xp -= xpToNextLevel(data.level);
        data.level += 1;
      }
      if (data.level >= MAX_LEVEL) data.xp = 0;
    }

    await saveUserLevelData(client, guild.id, member.user.id, data);
    return { data: { ...data }, oldLevel };
  });

  if (!outcome) return null;

  const { data, oldLevel } = outcome;
  const leveledUp = data.level > oldLevel;
  let roles = { added: [], removed: [], skipped: [] };

  // Side effects run outside the lock so slow Discord calls never block XP for this user.
  if (leveledUp) {
    logger.info(`🎉 ${member.user.tag} leveled up ${oldLevel} -> ${data.level} in ${guild.name}`);

    roles = await syncRoleRewards(guild, member, data.level, config, {
      reason: `Level ${data.level} reward`,
    });

    if (config.announceLevelUp) {
      await sendLevelUpAnnouncement({ guild, member, data, oldLevel, config, roles, fallbackChannel: options.channel });
    }

    try {
      await logEvent({
        client,
        guildId: guild.id,
        eventType: EVENT_TYPES.LEVELING_LEVELUP,
        data: {
          title: 'Level Up',
          lines: [
            formatLogLine('Member', `${member.user.tag} (\`${member.user.id}\`)`),
            formatLogLine('New Level', String(data.level)),
            formatLogLine('Levels Gained', String(data.level - oldLevel)),
            formatLogLine('Total XP', String(data.totalXp)),
          ],
          userId: member.user.id,
        },
      });
    } catch (logError) {
      logger.debug('Failed to log leveling event:', logError.message);
    }
  }

  return {
    level: data.level,
    xp: data.xp,
    totalXp: data.totalXp,
    xpNeeded: xpToNextLevel(data.level),
    leveledUp,
    oldLevel,
    roles,
  };
}, {
  service: 'xpSystem',
  operation: 'addXp',
  userMessage: 'Failed to award XP. Please try again.',
});

/**
 * Entry point for the messageCreate event: applies every rule (ignored channels/roles,
 * blacklist, cooldown, multiplier) and awards XP for a normal chat message.
 */
export async function awardMessageXp(client, message) {
  const { guild, author } = message;
  if (!guild || author.bot || !message.content?.trim()) return null;

  const config = await getLevelingConfig(client, guild.id);
  if (!config.enabled) return null;
  if (config.ignoredChannels.includes(message.channelId)) return null;
  if (config.blacklistedUsers.includes(author.id)) return null;

  const member = message.member ?? (await guild.members.fetch(author.id).catch(() => null));
  if (!member) return null;

  if (config.ignoredRoles.length > 0 && member.roles.cache.some((role) => config.ignoredRoles.includes(role.id))) {
    return null;
  }

  const result = await addXp(client, guild, member, rollMessageXp(config), {
    config,
    cooldownMs: config.xpCooldown * 1000,
    channel: message.channel,
  });

  return result;
}

async function sendLevelUpAnnouncement({ guild, member, data, oldLevel, config, roles, fallbackChannel }) {
  try {
    const wantsEmbed = config.levelUpStyle !== 'text';
    const required = wantsEmbed ? ['SendMessages', 'EmbedLinks'] : ['SendMessages'];

    const candidates = [
      config.levelUpChannel ? guild.channels.cache.get(config.levelUpChannel) : null,
      fallbackChannel,
      guild.systemChannel,
    ];
    const channel = candidates.find(
      (c) => c?.isTextBased?.() && c.permissionsFor(guild.members.me)?.has(required),
    );

    if (!channel) {
      logger.warn(`No channel available to announce level-up in guild ${guild.id}`);
      return;
    }

    const need = xpToNextLevel(data.level);
    const percent = progressPercent(data.xp, data.level);

    const text = renderTemplate(config.levelUpMessage, {
      user: member.toString(),
      username: member.displayName,
      level: data.level,
      oldLevel,
      xp: data.xp,
      xpNeeded: Number.isFinite(need) ? need : 0,
      totalXp: data.totalXp,
      server: guild.name,
    });

    const allowedMentions = { users: [member.id], roles: [], parse: [] };

    if (!wantsEmbed) {
      await channel.send({ content: text, allowedMentions });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(getColor('success'))
      .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
      .setTitle('🎉 Level Up!')
      .setDescription(text)
      .addFields(
        { name: 'Level', value: oldLevel + 1 === data.level ? `**${data.level}**` : `${oldLevel} ➜ **${data.level}**`, inline: true },
        { name: 'Total XP', value: formatNumber(data.totalXp), inline: true },
        {
          name: data.level >= MAX_LEVEL ? 'Max level reached' : `Progress to level ${data.level + 1}`,
          value: `${progressBar(percent)} **${percent}%**\n${formatNumber(data.xp)} / ${formatNumber(need)} XP`,
        },
      )
      .setTimestamp();

    if (roles.added.length > 0) {
      embed.addFields({ name: '🏆 Reward unlocked', value: roles.added.map((id) => `<@&${id}>`).join(' ') });
    }

    await channel.send({ embeds: [embed], allowedMentions });
  } catch (error) {
    logger.error('Error sending level up announcement:', error);
  }
}
