import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  buildPanel,
  COLORS,
  getConfessConfig,
  missingPermissions,
  saveConfessConfig,
  setConfessCounter,
} from '../../services/confessService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-confess')
    .setDescription('💌 Atur sistem confession & kirim panelnya ke channel ini')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('📮 Channel tempat confession diposting')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addChannelOption((o) =>
      o
        .setName('log')
        .setDescription('📋 Channel log khusus staff (opsional)')
        .addChannelTypes(ChannelType.GuildText),
    )
    .addIntegerOption((o) =>
      o
        .setName('mulai')
        .setDescription('🔢 Nomor confession pertama (default: lanjut dari yang ada)')
        .setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Fitur ini cuma bisa dipakai di dalam server ya!',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getChannel('channel', true);
    const log = interaction.options.getChannel('log');
    const start = interaction.options.getInteger('mulai');
    const me = interaction.guild.members.me;

    // Cek izin bot di channel tujuan (dan log)
    const problems = [];
    const missingTarget = missingPermissions(target, me);
    if (missingTarget.length) problems.push(`📮 ${target}: \`${missingTarget.join('`, `')}\``);
    if (log) {
      const perms = log.permissionsFor(me);
      const missingLog = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'].filter(
        (p) => !perms?.has(PermissionFlagsBits[p]),
      );
      if (missingLog.length) problems.push(`📋 ${log}: \`${missingLog.join('`, `')}\``);
    }
    if (problems.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle('⚠️ Izin bot belum lengkap')
            .setDescription(`Beri izin berikut ke bot dulu, lalu jalankan ulang:\n\n${problems.join('\n')}`),
        ],
      });
    }

    const previous = await getConfessConfig(interaction.guild.id);
    await saveConfessConfig(interaction.guild.id, {
      ...(previous ?? {}),
      channelId: target.id,
      logChannelId: log?.id ?? null,
    });
    if (start) await setConfessCounter(interaction.guild.id, start - 1);

    await interaction.channel.send(buildPanel({ staffCanReview: Boolean(log) }));

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('✅ Confession berhasil diatur!')
          .addFields(
            { name: '📮 Channel confession', value: `${target}`, inline: true },
            { name: '📋 Channel log', value: log ? `${log}` : 'Tidak dipakai', inline: true },
            {
              name: '🚩 Fitur laporan',
              value: log ? 'Aktif (masuk ke channel log)' : 'Nonaktif — isi `log` untuk mengaktifkan',
              inline: true,
            },
            ...(start ? [{ name: '🔢 Nomor pertama', value: `#${start}`, inline: true }] : []),
          )
          .setDescription('Panel sudah dikirim ke channel ini 💌'),
      ],
    });
  },
};
