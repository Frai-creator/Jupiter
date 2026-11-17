import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { removeLevels } from '../../services/leveling/leveling.js';
import { runLevelAdminCommand } from '../../services/leveling/levelAdminCommand.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelremove')
    .setDescription('Remove levels from a member')
    .addUserOption((option) => option.setName('user').setDescription('The member to remove levels from').setRequired(true))
    .addIntegerOption((option) =>
      option.setName('levels').setDescription('Number of levels to remove').setRequired(true).setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await runLevelAdminCommand(interaction, client, {
      title: '⬇️ Levels Removed',
      color: 'warning',
      readAmount: (i) => i.options.getInteger('levels'),
      apply: removeLevels,
      logVerb: 'removed levels from',
    });
  },
};
