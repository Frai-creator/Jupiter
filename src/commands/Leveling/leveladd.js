import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { addLevels } from '../../services/leveling/leveling.js';
import { runLevelAdminCommand } from '../../services/leveling/levelAdminCommand.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leveladd')
    .setDescription('Add levels to a member')
    .addUserOption((option) => option.setName('user').setDescription('The member to add levels to').setRequired(true))
    .addIntegerOption((option) =>
      option.setName('levels').setDescription('Number of levels to add').setRequired(true).setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await runLevelAdminCommand(interaction, client, {
      title: '⬆️ Levels Added',
      readAmount: (i) => i.options.getInteger('levels'),
      apply: addLevels,
      logVerb: 'added levels to',
    });
  },
};
