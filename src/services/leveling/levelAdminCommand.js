// levelAdminCommand.js
// Shared execution flow for /leveladd, /levelremove and /levelset.

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getLevelingConfig } from './leveling.js';
import { buildDisabledEmbed, buildLevelChangeEmbed } from './levelEmbeds.js';

/**
 * @param {object} interaction
 * @param {object} client
 * @param {object} spec
 * @param {string} spec.title                     Embed title.
 * @param {(interaction) => number} spec.readAmount  Pulls the numeric option from the interaction.
 * @param {(client, guildId, userId, amount) => Promise<object>} spec.apply  Service call.
 * @param {string} spec.logVerb                   e.g. "added 3 levels to".
 */
export async function runLevelAdminCommand(interaction, client, { title, readAmount, apply, logVerb }) {
  await InteractionHelper.safeDefer(interaction);

  const allowed = await checkUserPermissions(
    interaction,
    PermissionFlagsBits.ManageGuild,
    'You need the **Manage Server** permission to use this command.',
  );
  if (!allowed) return;

  const levelingConfig = await getLevelingConfig(client, interaction.guildId);
  if (!levelingConfig.enabled) {
    await InteractionHelper.safeEditReply(interaction, { embeds: [buildDisabledEmbed()] });
    return;
  }

  const targetUser = interaction.options.getUser('user');
  if (!targetUser) {
    throw new TitanBotError('No target user supplied', ErrorTypes.USER_INPUT, 'Please mention or provide a member.');
  }
  if (targetUser.bot) {
    throw new TitanBotError(`Target ${targetUser.id} is a bot`, ErrorTypes.USER_INPUT, 'Bots do not earn XP.');
  }

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    throw new TitanBotError(
      `User ${targetUser.id} not found in this guild`,
      ErrorTypes.USER_INPUT,
      'The specified user is not in this server.',
    );
  }

  const amount = readAmount(interaction);
  if (!Number.isInteger(amount)) {
    throw new TitanBotError('Level amount is not an integer', ErrorTypes.USER_INPUT, 'Please provide a whole number of levels.');
  }

  const result = await apply(client, interaction.guildId, targetUser.id, amount);

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [buildLevelChangeEmbed({ title, target: member.toString(), previousLevel: result.previousLevel, result })],
  });

  logger.info(`[ADMIN] ${interaction.user.tag} ${logVerb} ${targetUser.tag ?? targetUser.id} in guild ${interaction.guildId}`);
}
