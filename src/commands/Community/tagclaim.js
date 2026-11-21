import {
    SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, AttachmentBuilder, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import {
    getConfig, saveConfig, parseInviteCode, displayLink, checkRoleAssignable, hasPresenceIntent,
    buildPanelImage, getHistory, sweepGuild, MODES,
} from '../../services/tagClaim/tagClaimService.js';

const MODE_NAMES = {
    both: 'Tag + link (keduanya wajib)',
    either: 'Salah satu (tag atau link)',
    tag: 'Tag server saja',
    link: 'Link server saja',
};
const KIND_LABEL = {
    tag_add: 'Tag dipasang', tag_remove: 'Tag dilepas', link_add: 'Link dipasang',
    link_remove: 'Link dilepas', claim: 'Role diklaim', role_remove: 'Role dicabut',
};

export default {
    data: new SlashCommandBuilder()
        .setName('tagclaim')
        .setDescription('Claim role untuk member yang pakai tag server dan link server di status')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s.setName('setup').setDescription('Atur role, link, mode, dan channel log')
            .addRoleOption(o => o.setName('role').setDescription('Role hadiah').setRequired(true))
            .addStringOption(o => o.setName('link').setDescription('Link/kode invite server, mis. discord.gg/jupiter').setRequired(true))
            .addStringOption(o => o.setName('mode').setDescription('Syarat claim (default: keduanya wajib)')
                .addChoices(...MODES.map(m => ({ name: MODE_NAMES[m], value: m }))))
            .addChannelOption(o => o.setName('log-channel').setDescription('Channel log pasang/lepas')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addStringOption(o => o.setName('tag-text').setDescription('Teks tag server untuk tampilan panel, mis. JPTR').setMaxLength(4)))
        .addSubcommand(s => s.setName('panel').setDescription('Kirim panel claim (gambar + tombol)')
            .addChannelOption(o => o.setName('channel').setDescription('Channel tujuan (default: channel ini)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
        .addSubcommand(s => s.setName('status').setDescription('Lihat pengaturan dan kesehatan sistem'))
        .addSubcommand(s => s.setName('history').setDescription('Lihat 10 riwayat terakhir (pasang/lepas/claim)'))
        .addSubcommand(s => s.setName('scan').setDescription('Pindai semua member sekarang (catat baseline & cabut role yang tidak valid)'))
        .addSubcommand(s => s.setName('disable').setDescription('Matikan sistem tag claim')),

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const { guild } = interaction;
        const sub = interaction.options.getSubcommand();

        if (sub === 'setup') {
            const role = interaction.options.getRole('role');
            const code = parseInviteCode(interaction.options.getString('link'));
            if (!code) {
                return replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Link tidak valid. Contoh: `discord.gg/jupiter`.' });
            }
            const problem = checkRoleAssignable(guild, role);
            if (problem) return replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: problem });

            const mode = interaction.options.getString('mode') || 'both';
            const logChannel = interaction.options.getChannel('log-channel');
            const tagText = interaction.options.getString('tag-text');

            await saveConfig(client, guild.id, {
                enabled: true,
                roleId: role.id,
                link: code,
                mode,
                ...(logChannel ? { logChannelId: logChannel.id } : {}),
                ...(tagText ? { tagText: tagText.toUpperCase() } : {}),
            });

            const needsPresence = (mode === 'both' || mode === 'link' || mode === 'either') && !hasPresenceIntent(client);
            const lines = [
                `Role: ${role}`,
                `Link: \`${displayLink(code)}\``,
                `Mode: **${MODE_NAMES[mode]}**`,
                `Log: ${logChannel ? logChannel : 'belum diatur (pakai `log-channel`)'}`,
                '',
                'Langkah berikutnya: jalankan `/tagclaim panel`, lalu `/tagclaim scan`.',
            ];
            if (needsPresence) {
                lines.push('', '**Perhatian:** cek link di status butuh intent *Presence*. Aktifkan "Presence Intent" di Developer Portal, lalu set `ENABLE_PRESENCE_INTENT=true` di `.env` dan restart bot.');
            }
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [new EmbedBuilder().setColor(getColor('info')).setTitle('Tag Claim siap').setDescription(lines.join('\n'))],
            });
        }

        const cfg = await getConfig(client, guild.id);

        if (sub === 'disable') {
            await saveConfig(client, guild.id, { enabled: false });
            return InteractionHelper.safeEditReply(interaction, { content: 'Tag Claim dimatikan. Role yang sudah diberikan tidak dicabut.' });
        }

        if (!cfg.roleId || !cfg.link) {
            return replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'Jalankan `/tagclaim setup` dulu.' });
        }

        if (sub === 'panel') {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const role = guild.roles.cache.get(cfg.roleId);
            if (!role) return replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'Role hadiah sudah dihapus. Jalankan `/tagclaim setup` lagi.' });

            const png = await buildPanelImage(guild, cfg, role);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tagclaim_claim').setLabel('Claim Role').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('tagclaim_check').setLabel('Cek Syarat').setStyle(ButtonStyle.Secondary),
            );
            const msg = await channel.send({
                files: [new AttachmentBuilder(png, { name: 'tagclaim-panel.png' })],
                components: [row],
            });
            await saveConfig(client, guild.id, { enabled: true, panel: { channelId: channel.id, messageId: msg.id } });
            return InteractionHelper.safeEditReply(interaction, { content: `Panel dikirim ke ${channel}.` });
        }

        if (sub === 'status') {
            const role = guild.roles.cache.get(cfg.roleId);
            const logCh = cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'belum diatur';
            const problem = role ? checkRoleAssignable(guild, role) : 'Role hadiah tidak ditemukan';
            const presence = hasPresenceIntent(client);
            const embed = new EmbedBuilder().setColor(getColor('info')).setTitle('Status Tag Claim').addFields(
                { name: 'Sistem', value: cfg.enabled ? 'Aktif' : 'Mati', inline: true },
                { name: 'Mode', value: MODE_NAMES[cfg.mode], inline: true },
                { name: 'Role', value: role ? `${role}` : 'hilang', inline: true },
                { name: 'Link', value: `\`${displayLink(cfg.link)}\``, inline: true },
                { name: 'Log', value: logCh, inline: true },
                { name: 'Panel', value: cfg.panel.channelId ? `<#${cfg.panel.channelId}>` : 'belum dikirim', inline: true },
                { name: 'Presence Intent', value: presence ? 'Aktif (link status terbaca)' : 'Mati (link status TIDAK terbaca)' },
                { name: 'Izin role', value: problem || 'OK' },
            );
            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (sub === 'history') {
            const list = await getHistory(client, guild.id, 10);
            const text = list.length
                ? list.map(h => `<t:${Math.floor(h.at / 1000)}:R> · **${KIND_LABEL[h.kind] || h.kind}** · <@${h.userId}>${h.detail ? ` · ${h.detail}` : ''}`).join('\n')
                : 'Belum ada riwayat.';
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [new EmbedBuilder().setColor(getColor('info')).setTitle('Riwayat Tag Claim').setDescription(text)],
            });
        }

        if (sub === 'scan') {
            const n = await sweepGuild(client, guild, { fetchAll: true });
            return InteractionHelper.safeEditReply(interaction, { content: `Selesai memindai ${n} member.` });
        }
    },
};
