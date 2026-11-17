import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getUserLevelData, getLevelingConfig, getUserRank } from '../../services/leveling/leveling.js';
import { buildRankEmbed, buildDisabledEmbed } from '../../services/leveling/levelEmbeds.js';
import { renderRankCard } from '../../services/leveling/levelCard.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Check your or another member's level, XP and server rank")
    .addUserOption((option) =>
      option.setName('user').setDescription('The member to check (defaults to you)').setRequired(false),
    )
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig.enabled) {
      await InteractionHelper.safeEditReply(interaction, { embeds: [buildDisabledEmbed()] });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    if (targetUser.bot) {
      throw new TitanBotError(
        `Rank requested for bot ${targetUser.id}`,
        ErrorTypes.USER_INPUT,
        'Bots do not earn XP.',
      );
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      throw new TitanBotError(
        `User ${targetUser.id} not found in guild`,
        ErrorTypes.USER_INPUT,
        'Could not find the specified user in this server.',
      );
    }

    const [data, { rank, total }] = await Promise.all([
      getUserLevelData(client, interaction.guildId, targetUser.id),
      getUserRank(client, interaction.guildId, targetUser.id),
    ]);

    // Image card first; if canvas/fonts are unavailable fall back to the embed so /rank never breaks.
    try {
      const png = await renderRankCard({
        username: member.displayName,
        avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
        data,
        rank,
      });
      await InteractionHelper.safeEditReply(interaction, {
        files: [new AttachmentBuilder(png, { name: 'rank.png' })],
      });
    } catch (error) {
      logger.warn(`Rank card render failed, using embed instead: ${error.message}`);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildRankEmbed({ member, data, rank, total, config: levelingConfig })],
      });
    }
    logger.debug(`Rank checked for user ${targetUser.id} in guild ${interaction.guildId}`);
  },
};
