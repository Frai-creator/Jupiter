// supporter.js
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import {
    getSupporterConfig,
    saveSupporterConfig,
} from '../../services/supporterRoleService.js';
import { renderSupporterCard } from '../../utils/supporterCard.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

const SOFT_BLUE_HEX = 0x6ba4d9;

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('supporter')
        .setDescription('Kelola sistem role supporter (Server Tag & Link Server)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription('Atur role reward, channel log, dan syarat tag/link')
                .addRoleOption((opt) =>
                    opt.setName('role').setDescription('Role yang diberikan ke supporter').setRequired(true)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('log_channel')
                        .setDescription('Channel untuk log pasang & lepas role')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('link_server')
                        .setDescription('Kata kunci link server (contoh: discord.gg/namaserver)')
                        .setRequired(false)
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName('wajib_tag')
                        .setDescription('Wajib memakai Server Tag? (Default: Ya)')
                        .setRequired(false)
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName('wajib_link')
                        .setDescription('Wajib mencantumkan link server di status? (Default: Tidak)')
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('panel')
                .setDescription('Kirim panel Claim Role Supporter beserta gambar Canvas ke channel ini')
        )
        .addSubcommand((sub) =>
            sub
                .setName('preview')
                .setDescription('Lihat preview kartu Canvas (tampilan pasang & lepas role)')
        ),

    async execute(interaction, config, client) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (sub === 'setup') {
            const role = interaction.options.getRole('role');
            const logChannel = interaction.options.getChannel('log_channel');
            const inviteKeyword = interaction.options.getString('link_server') || '';
            const requireTag = interaction.options.getBoolean('wajib_tag') ?? true;
            const requireInvite = interaction.options.getBoolean('wajib_link') ?? false;

            const botHighest = guild.members.me?.roles.highest;
            if (botHighest && role.position >= botHighest.position) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'Posisi role supporter harus berada di bawah role tertinggi bot.',
                });
            }

            await saveSupporterConfig(client, guild.id, {
                enabled: true,
                roleId: role.id,
                logChannelId: logChannel.id,
                inviteKeyword,
                requireTag,
                requireInvite,
            });

            return await InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Supporter Role Configured',
                        [
                            `**Role Reward:** ${role}`,
                            `**Channel Log:** ${logChannel}`,
                            `**Wajib Server Tag:** ${requireTag ? 'Ya' : 'Tidak'}`,
                            `**Wajib Link Server:** ${requireInvite ? `Ya (\`${inviteKeyword}\`)` : 'Tidak'}`,
                        ].join('\n')
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (sub === 'preview') {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const guildConfig = await getGuildConfig(client, guild.id);
            const cfg = getSupporterConfig(guildConfig);
            const role = cfg.roleId ? guild.roles.cache.get(cfg.roleId) : null;

            const claimedBuf = await renderSupporterCard({
                action: 'claimed',
                username: interaction.member.displayName,
                avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
                roleName: role?.name || 'Supporter',
                serverTag: guild.name.slice(0, 4).toUpperCase(),
                reason: `Memasang Server Tag & ${cfg.inviteKeyword || 'discord.gg/server'}`,
                guildName: guild.name,
                seed: interaction.user.id,
            });

            const removedBuf = await renderSupporterCard({
                action: 'removed',
                username: interaction.member.displayName,
                avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
                roleName: role?.name || 'Supporter',
                serverTag: null,
                reason: 'Melepas Server Tag / Link Server dari profil',
                guildName: guild.name,
                seed: `${interaction.user.id}-remove`,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                content: '**Preview Kartu Log Canvas (Biru Kalem):**\n1️⃣ Saat member memasang tag/link\n2️⃣ Saat member melepas tag/link',
                files: [
                    new AttachmentBuilder(claimedBuf, { name: 'preview-claimed.png' }),
                    new AttachmentBuilder(removedBuf, { name: 'preview-removed.png' }),
                ],
            });
        }

        if (sub === 'panel') {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const guildConfig = await getGuildConfig(client, guild.id);
            const cfg = getSupporterConfig(guildConfig);

            if (!cfg.enabled || !cfg.roleId) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: 'Jalankan `/supporter setup` terlebih dahulu sebelum mengirim panel.',
                });
            }

            const role = guild.roles.cache.get(cfg.roleId);
            const bannerBuf = await renderSupporterCard({
                action: 'preview',
                username: `${guild.name} Supporter`,
                avatarUrl: guild.iconURL({ extension: 'png', size: 256 }),
                roleName: role?.name || 'Supporter',
                serverTag: cfg.requireTag ? 'SERVER TAG' : 'LINK BIO',
                reason: 'Pasang Server Tag & Link Server untuk klaim role otomatis',
                guildName: guild.name,
                seed: guild.id,
            });

            const panelEmbed = new EmbedBuilder()
                .setColor(SOFT_BLUE_HEX)
                .setTitle('💠 Supporter Role Perk')
                .setDescription(
                    [
                        `Dapatkan role eksklusif ${role || '**Supporter**'} dengan mendukung server ini!`,
                        '',
                        '**Syarat:**',
                        cfg.requireTag ? `• Pasang **Server Tag** dari **${guild.name}**` : null,
                        cfg.requireInvite && cfg.inviteKeyword
                            ? `• Cantumkan \`${cfg.inviteKeyword}\` di profil / status kamu`
                            : null,
                        '',
                        '> *Role akan otomatis terpasang/terlepas jika kamu mengubah tag, atau klik tombol di bawah untuk klaim instan.*',
                    ]
                        .filter(Boolean)
                        .join('\n')
                )
                .setImage('attachment://supporter-panel.png');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('supporter_claim')
                    .setLabel('Claim / Sync Role')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💠')
            );

            await interaction.channel.send({
                embeds: [panelEmbed],
                files: [new AttachmentBuilder(bannerBuf, { name: 'supporter-panel.png' })],
                components: [row],
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Panel Terkirim', 'Panel Supporter Role berhasil dikirim ke channel ini.')],
            });
        }
    },
};
