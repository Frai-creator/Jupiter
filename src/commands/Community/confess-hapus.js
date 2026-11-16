import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { COLORS, deleteConfession } from '../../services/confessService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('confess-hapus')
    .setDescription('🗑️ Hapus confession (beserta thread balasannya)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName('nomor').setDescription('🔢 Nomor confession yang mau dihapus').setRequired(true).setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Fitur ini cuma bisa dipakai di dalam server ya!',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const number = interaction.options.getInteger('nomor', true);
    const ok = await deleteConfession(interaction.client, interaction.guild.id, number, interaction.user);

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(ok ? COLORS.success : COLORS.error)
          .setTitle(ok ? '🗑️ Confession dihapus' : '❌ Gagal menghapus')
          .setDescription(
            ok
              ? `Confession **#${number}** dan thread balasannya sudah dihapus.`
              : `Confession **#${number}** tidak ditemukan atau sudah dihapus.`,
          ),
      ],
    });
  },
};
