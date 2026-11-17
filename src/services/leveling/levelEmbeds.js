// levelEmbeds.js
// All user-facing leveling embeds in one place so commands stay thin and the look stays consistent.

import { EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getSortedRoleRewards } from './levelConfig.js';
import {
  MAX_LEVEL,
  xpToNextLevel,
  progressPercent,
  progressBar,
  formatNumber,
  compactNumber,
} from './levelMath.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function buildDisabledEmbed() {
  return new EmbedBuilder()
    .setColor(getColor('warning'))
    .setDescription('The leveling system is currently disabled on this server.');
}

/** The next reward role above `level`, or null. */
function findNextReward(config, level) {
  return getSortedRoleRewards(config).find((r) => r.level > level) ?? null;
}

export function buildRankEmbed({ member, data, rank, total, config }) {
  const need = xpToNextLevel(data.level);
  const maxed = data.level >= MAX_LEVEL;
  const percent = progressPercent(data.xp, data.level);

  const embed = new EmbedBuilder()
    .setColor(getColor('info'))
    .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `## Level ${data.level}`,
        rank ? `**Rank #${formatNumber(rank)}** of ${formatNumber(total)} ranked members` : '**Unranked** — send a few messages to get started!',
      ].join('\n'),
    )
    .addFields(
      { name: 'Total XP', value: formatNumber(data.totalXp), inline: true },
      {
        name: maxed ? 'Status' : 'Current XP',
        value: maxed ? '**MAX LEVEL**' : `${formatNumber(data.xp)} / ${formatNumber(need)}`,
        inline: true,
      },
      {
        name: maxed ? '\u200B' : 'Remaining',
        value: maxed ? '\u200B' : `${formatNumber(need - data.xp)} XP`,
        inline: true,
      },
      {
        name: maxed ? 'Progress' : `Progress to level ${data.level + 1}`,
        value: `${progressBar(percent, 16)} **${percent}%**`,
      },
    );

  const next = findNextReward(config, data.level);
  if (next) {
    const levelsLeft = next.level - data.level;
    embed.addFields({
      name: '🏆 Next reward',
      value: `<@&${next.roleId}> at level **${next.level}** (${levelsLeft} level${levelsLeft === 1 ? '' : 's'} to go)`,
    });
  }

  return embed.setFooter({ text: member.guild.name }).setTimestamp();
}

export function buildLeaderboardEmbed({ guild, pageData, perPage = 10, viewerRank = null }) {
  const { entries, page, totalPages, total } = pageData;

  const embed = new EmbedBuilder()
    .setColor(getColor('info'))
    .setTitle(`🏆 ${guild.name} — Leaderboard`)
    .setTimestamp();

  if (guild.iconURL?.()) embed.setThumbnail(guild.iconURL());

  if (entries.length === 0) {
    return embed.setDescription('No one is on the leaderboard yet. Start chatting to earn XP!');
  }

  const lines = entries.map((entry) => {
    const marker = entry.rank <= 3 ? MEDALS[entry.rank - 1] : `\`#${String(entry.rank).padStart(2, ' ')}\``;
    return `${marker} <@${entry.userId}> · Lv **${entry.level}** · ${compactNumber(entry.totalXp)} XP`;
  });

  embed.setDescription(lines.join('\n'));

  const footer = [`Page ${page}/${totalPages}`, `${formatNumber(total)} ranked`];
  if (viewerRank) footer.push(`Your rank: #${formatNumber(viewerRank)}`);
  return embed.setFooter({ text: footer.join(' • ') });
}

const SKIP_REASONS = {
  hierarchy: 'move my highest role above it so I can manage it',
  missing: 'the role no longer exists',
  error: 'Discord rejected the change',
};

export function buildLevelChangeEmbed({ title, color = 'success', target, previousLevel, result }) {
  const embed = new EmbedBuilder()
    .setColor(getColor(color))
    .setTitle(title)
    .setDescription(`${target}'s level was changed.`)
    .addFields(
      { name: 'Level', value: `${previousLevel} ➜ **${result.level}**`, inline: true },
      { name: 'Total XP', value: formatNumber(result.totalXp), inline: true },
    );

  const { added = [], removed = [], skipped = [] } = result.roles ?? {};
  if (added.length) embed.addFields({ name: '➕ Roles granted', value: added.map((id) => `<@&${id}>`).join(' ') });
  if (removed.length) embed.addFields({ name: '➖ Roles removed', value: removed.map((id) => `<@&${id}>`).join(' ') });
  if (skipped.length) {
    embed.addFields({
      name: '⚠️ Roles skipped',
      value: skipped.map((s) => `<@&${s.roleId}> — ${SKIP_REASONS[s.reason] ?? 'unknown issue'}`).join('\n'),
    });
  }

  return embed.setTimestamp();
}
