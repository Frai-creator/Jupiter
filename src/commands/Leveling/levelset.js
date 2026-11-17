import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { setUserLevel } from '../../services/leveling/leveling.js';
import { runLevelAdminCommand } from '../../services/leveling/levelAdminCommand.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelset')
    .setDescription("Set a member's level to a specific value")
    .addUserOption((option) => option.setName('user').setDescription('The member to set the level for').setRequired(true))
    .addIntegerOption((option) =>
      option.setName('level').setDescription('The level to set').setRequired(true).setMinValue(0).setMaxValue(1000),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await runLevelAdminCommand(interaction, client, {
      title: '🎚️ Level Set',
      readAmount: (i) => i.options.getInteger('level'),
      apply: setUserLevel,
      logVerb: 'set the level of',
    });
  },
};
