import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getLeaderboardPage, getLevelingConfig, getUserRank } from '../../services/leveling/leveling.js';
import { buildLeaderboardEmbed, buildDisabledEmbed } from '../../services/leveling/levelEmbeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const PER_PAGE = 10;
const IDLE_MS = 120_000;

function buildButtons(id, page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lb_first_${id}`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page <= 1),
    new ButtonBuilder().setCustomId(`lb_prev_${id}`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(disabled || page <= 1),
    new ButtonBuilder().setCustomId(`lb_next_${id}`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled || page >= totalPages),
    new ButtonBuilder().setCustomId(`lb_last_${id}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level leaderboard")
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Page to open (default: 1)').setMinValue(1).setRequired(false),
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

    const guildId = interaction.guildId;
    const { rank: viewerRank } = await getUserRank(client, guildId, interaction.user.id);

    const render = async (requestedPage) => {
      const pageData = await getLeaderboardPage(client, guildId, requestedPage, PER_PAGE);
      return {
        pageData,
        payload: {
          embeds: [buildLeaderboardEmbed({ guild: interaction.guild, pageData, perPage: PER_PAGE, viewerRank })],
          components: pageData.totalPages > 1 ? [buildButtons(interaction.id, pageData.page, pageData.totalPages)] : [],
        },
      };
    };

    let { pageData, payload } = await render(interaction.options.getInteger('page') ?? 1);
    await InteractionHelper.safeEditReply(interaction, payload);
    logger.debug(`Leaderboard displayed for guild ${guildId}`);

    if (pageData.totalPages <= 1) return;

    const message = await interaction.fetchReply().catch(() => null);
    if (!message?.createMessageComponentCollector) return;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      idle: IDLE_MS,
      filter: (i) => i.customId.endsWith(`_${interaction.id}`) && i.customId.startsWith('lb_'),
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: 'Only the person who opened this leaderboard can flip pages.', ephemeral: true }).catch(() => {});
        return;
      }

      const action = i.customId.split('_')[1];
      const target =
        action === 'first' ? 1 : action === 'prev' ? pageData.page - 1 : action === 'next' ? pageData.page + 1 : pageData.totalPages;

      try {
        ({ pageData, payload } = await render(target));
        await i.update(payload);
      } catch (error) {
        logger.error('Leaderboard pagination failed:', error);
        await i.deferUpdate().catch(() => {});
      }
    });

    collector.on('end', async () => {
      await message
        .edit({ components: [buildButtons(interaction.id, pageData.page, pageData.totalPages, true)] })
        .catch(() => {});
    });
  },
};
