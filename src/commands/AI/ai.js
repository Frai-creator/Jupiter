import {
    SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags, InteractionContextType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { PERSONAS, getPersona } from '../../services/ai/aiPersonas.js';
import { getProviderInfo } from '../../services/ai/aiProvider.js';
import {
    getAiConfig, saveAiConfig, resetAiConfig, clearMemory, safeChat, buildReplyEmbed, syncTriggerMode,
    TRIGGER_MODES, LANGUAGES, LENGTHS, STYLES, LABELS,
} from '../../services/ai/aiService.js';
import { buildStatusEmbed, promptPersonaModal, runDashboard } from './modules/aiDashboard.js';

const choices = (list, labels) => list.map((v) => ({ name: labels[v], value: v }));

const note = (title, description, color = 'success') =>
    new EmbedBuilder().setColor(getColor(color)).setTitle(title).setDescription(description);

export default {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Atur sistem AI server: personality, channel, gaya jawaban, dan lainnya')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((s) => s.setName('panel').setDescription('Buka dashboard pengaturan AI (paling gampang)'))
        .addSubcommand((s) => s.setName('status').setDescription('Lihat semua pengaturan AI saat ini'))
        .addSubcommand((s) => s.setName('aktif').setDescription('Nyalakan atau matikan AI di server ini')
            .addBooleanOption((o) => o.setName('nilai').setDescription('true = nyala, false = mati').setRequired(true)))
        .addSubcommand((s) => s.setName('personality').setDescription('Pilih personality AI dari preset')
            .addStringOption((o) => o.setName('preset').setDescription('Personality yang dipakai').setRequired(true)
                .addChoices(...Object.entries(PERSONAS).map(([id, p]) => ({ name: `${p.emoji} ${p.label}`, value: id })))))
        .addSubcommand((s) => s.setName('tulis-persona').setDescription('Tulis nama, personality, dan info server sendiri (form)'))
        .addSubcommandGroup((g) => g.setName('channel').setDescription('Atur channel tempat AI membalas semua pesan')
            .addSubcommand((s) => s.setName('tambah').setDescription('Jadikan channel ini channel AI')
                .addChannelOption((o) => o.setName('channel').setDescription('Channel teks').setRequired(true)
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
            .addSubcommand((s) => s.setName('hapus').setDescription('Hapus channel dari daftar channel AI')
                .addChannelOption((o) => o.setName('channel').setDescription('Channel teks').setRequired(true)
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
            .addSubcommand((s) => s.setName('daftar').setDescription('Lihat daftar channel AI')))
        .addSubcommand((s) => s.setName('set').setDescription('Ubah banyak pengaturan sekaligus (isi yang mau diubah saja)')
            .addStringOption((o) => o.setName('nama').setDescription('Nama AI (maks 24 karakter)').setMaxLength(24))
            .addStringOption((o) => o.setName('trigger').setDescription('Kapan AI membalas')
                .addChoices(...choices(TRIGGER_MODES, LABELS.trigger)))
            .addStringOption((o) => o.setName('bahasa').setDescription('Bahasa jawaban')
                .addChoices(...choices(LANGUAGES, LABELS.language)))
            .addStringOption((o) => o.setName('panjang').setDescription('Panjang jawaban')
                .addChoices(...choices(LENGTHS, LABELS.length)))
            .addStringOption((o) => o.setName('gaya').setDescription('Tampilan balasan')
                .addChoices(...choices(STYLES, LABELS.style)))
            .addNumberOption((o) => o.setName('kreativitas').setDescription('0.1 = kaku & konsisten, 1.5 = liar & kreatif').setMinValue(0.1).setMaxValue(1.5))
            .addIntegerOption((o) => o.setName('memori').setDescription('Berapa giliran obrolan yang diingat (0-20)').setMinValue(0).setMaxValue(20))
            .addIntegerOption((o) => o.setName('cooldown').setDescription('Jeda antar pesan per user, detik (0-60)').setMinValue(0).setMaxValue(60))
            .addIntegerOption((o) => o.setName('konteks').setDescription('Jumlah pesan channel terakhir yang ikut dibaca (0-10)').setMinValue(0).setMaxValue(10))
            .addBooleanOption((o) => o.setName('emoji').setDescription('Boleh pakai emoji?'))
            .addBooleanOption((o) => o.setName('gambar').setDescription('Boleh membaca gambar yang dikirim user?'))
            .addRoleOption((o) => o.setName('role').setDescription('Batasi pemakaian AI hanya untuk role ini'))
            .addBooleanOption((o) => o.setName('semua-boleh').setDescription('true = hapus batasan role')))
        .addSubcommand((s) => s.setName('preview').setDescription('Coba ngobrol dengan AI memakai pengaturan sekarang')
            .addStringOption((o) => o.setName('pesan').setDescription('Pesan percobaan').setMaxLength(500)))
        .addSubcommand((s) => s.setName('reset-memori').setDescription('Hapus memori percakapan AI')
            .addUserOption((o) => o.setName('user').setDescription('Hapus memori satu user saja (kosongkan = semua)')))
        .addSubcommand((s) => s.setName('reset-config').setDescription('Kembalikan semua pengaturan AI ke default')
            .addBooleanOption((o) => o.setName('konfirmasi').setDescription('Isi true untuk benar-benar mereset').setRequired(true))),

    async execute(interaction, config, client) {
        const { guild } = interaction;
        if (!guild) {
            return replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Command ini hanya bisa dipakai di server.' });
        }

        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();

        // Form harus ditampilkan sebelum interaksi di-defer.
        if (sub === 'tulis-persona') {
            const res = await promptPersonaModal(interaction, client, guild.id);
            if (!res) return;
            return res.submitted.reply({
                embeds: [note('✏️ Persona disimpan', `Nama AI sekarang **${res.cfg.name}** dengan personality **${getPersona(res.cfg.persona).label}**.`), buildStatusEmbed(res.cfg, guild)],
                flags: MessageFlags.Ephemeral,
            });
        }

        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (sub === 'panel') return runDashboard(interaction, client);

        const cfg = await getAiConfig(client, guild.id);

        if (sub === 'status') {
            return interaction.editReply({ embeds: [buildStatusEmbed(cfg, guild)] });
        }

        if (sub === 'aktif') {
            const enabled = interaction.options.getBoolean('nilai');
            const next = await saveAiConfig(client, guild.id, { enabled });
            const hints = [];
            if (enabled) {
                const provider = getProviderInfo();
                if (provider.keys === 0) hints.push('⚠️ `GEMINI_API_KEY` belum diisi di `.env`, jadi AI memakai mesin fallback yang kurang stabil.');
                if (next.triggerMode !== 'mention' && next.channels.length === 0) hints.push('ℹ️ Belum ada channel AI. Tambah dengan `/ai channel tambah`, atau pakai mention bot.');
                if (next.triggerMode === 'mention') hints.push(`Panggil dengan mention ${client.user} atau reply ke jawaban AI.`);
            }
            return interaction.editReply({
                embeds: [note(enabled ? '🟢 AI dinyalakan' : '🔴 AI dimatikan', hints.join('\n') || 'Pengaturan lainnya tidak berubah.')],
            });
        }

        if (sub === 'personality') {
            const preset = interaction.options.getString('preset');
            const next = await saveAiConfig(client, guild.id, { persona: preset });
            const p = getPersona(preset);
            const extra = preset === 'custom' && !next.customPrompt
                ? '\n\nPersonality custom masih kosong. Jalankan `/ai tulis-persona` untuk menulisnya.'
                : '';
            return interaction.editReply({
                embeds: [note(`${p.emoji} Personality diubah`, `Sekarang AI memakai **${p.label}**.\n${p.desc}${extra}`)],
            });
        }

        if (group === 'channel') {
            let channels = [...cfg.channels];

            if (sub === 'daftar') {
                return interaction.editReply({
                    embeds: [note('📍 Channel AI', channels.length ? channels.map((id) => `• <#${id}>`).join('\n') : 'Belum ada channel AI.', 'info')],
                });
            }

            const channel = interaction.options.getChannel('channel');

            if (sub === 'tambah') {
                if (channels.includes(channel.id)) {
                    return interaction.editReply({ embeds: [note('Sudah terdaftar', `${channel} sudah menjadi channel AI.`, 'info')] });
                }
                if (channels.length >= 10) {
                    return replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Maksimal 10 channel AI. Hapus salah satu dulu.' });
                }
                channels.push(channel.id);
            } else {
                if (!channels.includes(channel.id)) {
                    return interaction.editReply({ embeds: [note('Tidak ditemukan', `${channel} bukan channel AI.`, 'info')] });
                }
                channels = channels.filter((id) => id !== channel.id);
            }

            const next = await saveAiConfig(client, guild.id, {
                channels,
                triggerMode: syncTriggerMode(channels, cfg.triggerMode),
            });
            return interaction.editReply({
                embeds: [note(
                    sub === 'tambah' ? '✅ Channel AI ditambahkan' : '🗑️ Channel AI dihapus',
                    `${channel}\nTrigger sekarang: **${LABELS.trigger[next.triggerMode]}**\n\n` +
                    'Tips: awali pesan dengan `//` kalau mau ngobrol di channel AI tanpa dijawab AI.',
                )],
            });
        }

        if (sub === 'set') {
            const o = interaction.options;
            const patch = {};
            const lines = [];

            const GETTERS = {
                string: (k) => o.getString(k),
                number: (k) => o.getNumber(k),
                integer: (k) => o.getInteger(k),
                boolean: (k) => o.getBoolean(k),
            };
            const yesNo = (v) => (v ? 'On' : 'Off');
            // [opsi slash, key config, tipe, label, format tampilan]
            const FIELDS = [
                ['nama', 'name', 'string', 'Nama', (v) => v],
                ['trigger', 'triggerMode', 'string', 'Trigger', (v) => LABELS.trigger[v]],
                ['bahasa', 'language', 'string', 'Bahasa', (v) => LABELS.language[v]],
                ['panjang', 'length', 'string', 'Panjang', (v) => LABELS.length[v]],
                ['gaya', 'style', 'string', 'Gaya', (v) => LABELS.style[v]],
                ['kreativitas', 'creativity', 'number', 'Kreativitas', (v) => v],
                ['memori', 'memory', 'integer', 'Memori', (v) => `${v} giliran`],
                ['cooldown', 'cooldown', 'integer', 'Cooldown', (v) => `${v} detik`],
                ['konteks', 'contextMessages', 'integer', 'Konteks channel', (v) => (v ? `${v} pesan` : 'Mati')],
                ['emoji', 'emoji', 'boolean', 'Emoji', yesNo],
                ['gambar', 'vision', 'boolean', 'Baca gambar', yesNo],
            ];

            for (const [option, cfgKey, type, label, format] of FIELDS) {
                const value = GETTERS[type](option);
                if (value === null || value === undefined) continue;
                patch[cfgKey] = value;
                lines.push(`• **${label}:** ${format(value)}`);
            }

            const role = o.getRole('role');
            if (role) {
                patch.allowedRoleId = role.id;
                lines.push(`• **Akses:** hanya ${role}`);
            }
            if (o.getBoolean('semua-boleh')) {
                patch.allowedRoleId = null;
                lines.push('• **Akses:** semua member');
            }

            if (!lines.length) {
                return interaction.editReply({
                    embeds: [note('Tidak ada yang diubah', 'Isi minimal satu opsi, atau pakai `/ai panel` untuk dashboard.', 'info')],
                });
            }

            await saveAiConfig(client, guild.id, patch);
            return interaction.editReply({ embeds: [note('✅ Pengaturan disimpan', lines.join('\n'))] });
        }

        if (sub === 'preview') {
            const text = interaction.options.getString('pesan') || 'Halo! Perkenalkan dirimu dalam 2-3 kalimat sesuai kepribadianmu.';
            const result = await safeChat({
                guild,
                channel: interaction.channel ?? { id: interaction.channelId, name: 'preview' },
                userId: interaction.user.id,
                displayName: interaction.member?.displayName || interaction.user.username,
                cfg,
                text,
                useMemory: false,
            });
            return interaction.editReply({
                content: '🧪 **Preview** (tidak disimpan ke memori, tidak terpengaruh status aktif/nonaktif)',
                embeds: [buildReplyEmbed(cfg, result.text)],
            });
        }

        if (sub === 'reset-memori') {
            const user = interaction.options.getUser('user');
            clearMemory(guild.id, user?.id ?? null);
            return interaction.editReply({
                embeds: [note('🧹 Memori dihapus', user ? `Memori percakapan ${user} sudah dihapus.` : 'Memori percakapan semua member sudah dihapus.')],
            });
        }

        if (sub === 'reset-config') {
            if (!interaction.options.getBoolean('konfirmasi')) {
                return interaction.editReply({ embeds: [note('Dibatalkan', 'Isi `konfirmasi: true` kalau kamu yakin mau mereset semua pengaturan AI.', 'info')] });
            }
            await resetAiConfig(client, guild.id);
            return interaction.editReply({ embeds: [note('♻️ Pengaturan direset', 'Semua pengaturan AI kembali ke default. AI dalam keadaan nonaktif.')] });
        }
    },
};
