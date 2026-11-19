import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  buildPanel,
  canMakeThreads,
  COLORS,
  getIntro,
  getIntroConfig,
  missingPermissions,
  removeIntro,
  renderStoredCard,
  saveIntroConfig,
} from '../../services/introductionService.js';

const needManageGuild = (interaction) =>
  interaction.reply({
    content: '🔒 Perintah ini butuh izin **Manage Server**.',
    flags: MessageFlags.Ephemeral,
  });

export default {
  data: new SlashCommandBuilder()
    .setName('introduction')
    .setDescription('📝 Sistem kartu introduction member')
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('⚙️ Atur sistem & kirim panel introduction ke channel ini (admin)')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('📮 Channel tempat kartu introduction diposting')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('🎖️ Role yang diberikan setelah member mengisi introduction (opsional)'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('lihat')
        .setDescription('🪪 Lihat kartu introduction seseorang')
        .addUserOption((o) => o.setName('member').setDescription('Member yang ingin dilihat (default: kamu)')),
    )
    .addSubcommand((s) =>
      s
        .setName('hapus')
        .setDescription('🗑️ Hapus introduction seorang member (admin)')
        .addUserOption((o) => o.setName('member').setDescription('Member yang introduction-nya dihapus').setRequired(true)),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Fitur ini cuma bisa dipakai di dalam server ya!',
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    /* ───── /introduction setup ───── */
    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return needManageGuild(interaction);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const target = interaction.options.getChannel('channel', true);
      const role = interaction.options.getRole('role');
      const me = interaction.guild.members.me;

      const problems = [];
      const missing = missingPermissions(target, me);
      if (missing.length) problems.push(`📮 ${target}: \`${missing.join('`, `')}\``);
      if (role && (role.managed || role.position >= me.roles.highest.position)) {
        problems.push(`🎖️ ${role}: posisi role bot harus **lebih tinggi** dari role ini`);
      }
      if (problems.length) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle('⚠️ Pengaturan belum lengkap')
              .setDescription(`Perbaiki hal berikut, lalu jalankan ulang:\n\n${problems.join('\n')}`),
          ],
        });
      }

      const config = { ...((await getIntroConfig(interaction.guild.id)) ?? {}), channelId: target.id, roleId: role?.id ?? null };
      await saveIntroConfig(interaction.guild.id, config);

      await interaction.channel.send(await buildPanel(interaction.guild, config));

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ Introduction berhasil diatur!')
            .setDescription('Panel sudah dikirim ke channel ini 📝')
            .addFields(
              { name: '📮 Channel kartu', value: `${target}`, inline: true },
              { name: '🎖️ Role otomatis', value: role ? `${role}` : 'Tidak dipakai', inline: true },
              {
                name: '🧵 Thread sapaan',
                value: canMakeThreads(target, me) ? 'Aktif' : 'Nonaktif — beri bot izin `Create Public Threads` & `Send Messages in Threads`',
                inline: true,
              },
            ),
        ],
      });
    }

    /* ───── /introduction lihat ───── */
    if (sub === 'lihat') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const user = interaction.options.getUser('member') ?? interaction.user;
      const record = await getIntro(interaction.guild.id, user.id);
      if (!record) {
        return interaction.editReply({
          content: user.id === interaction.user.id
            ? '📭 Kamu belum mengisi introduction. Tekan tombol **Isi Formulir Introduction** di panel ya!'
            : `📭 ${user} belum mengisi introduction.`,
          allowedMentions: { parse: [] },
        });
      }
      try {
        const file = await renderStoredCard(interaction.guild, user, record);
        return interaction.editReply({ files: [file] });
      } catch {
        return interaction.editReply({ content: '❌ Kartu gagal dibuat, coba lagi nanti.' });
      }
    }

    /* ───── /introduction hapus ───── */
    if (sub === 'hapus') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return needManageGuild(interaction);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const user = interaction.options.getUser('member', true);
      const done = await removeIntro(interaction.client, interaction.guild.id, user.id);
      return interaction.editReply({
        content: done ? `🗑️ Introduction ${user} sudah dihapus.` : `📭 ${user} belum punya introduction.`,
        allowedMentions: { parse: [] },
      });
    }
  },
};
