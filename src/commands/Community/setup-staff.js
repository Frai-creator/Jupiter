import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { postStaffPanel } from '../../services/staffListService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('setup-staff')
        .setDescription('Kirim panel daftar admin & staff (canvas, update otomatis realtime)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((opt) =>
            opt
                .setName('channel')
                .setDescription('Channel tujuan panel (default: channel ini)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false),
        ),

    async execute(interaction, config, client) {
        if (!interaction.guild) {
            return await InteractionHelper.safeReply(interaction, {
                content: 'Fitur ini cuma bisa dipakai di dalam server ya!',
                flags: MessageFlags.Ephemeral,
            });
        }

        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        const me = guild.members.me;
        const perms = channel.permissionsFor(me);
        const missing = [
            ['ViewChannel', 'Lihat Channel'],
            ['SendMessages', 'Kirim Pesan'],
            ['EmbedLinks', 'Sematkan Tautan'],
            ['AttachFiles', 'Lampirkan File'],
        ]
            .filter(([flag]) => !perms?.has(PermissionFlagsBits[flag]))
            .map(([, label]) => label);

        if (missing.length) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: `Bot butuh izin **${missing.join(', ')}** di ${channel}.`,
            });
        }

        try {
            const { message, snapshot } = await postStaffPanel(client, guild, channel);
            const total = snapshot.groups.reduce((n, g) => n + g.members.length, 0);

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Panel Staff Terkirim',
                        [
                            `**Channel:** ${channel}`,
                            `**Total staff:** ${total} orang`,
                            `**Panel:** [lihat pesan](${message.url})`,
                            '',
                            'Panel ini akan **update otomatis** setiap ada perubahan role, nama, foto, atau status staff.',
                        ].join('\n'),
                    ),
                ],
            });
        } catch (error) {
            logger.error('Gagal mengirim panel staff:', error);
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Gagal mengirim panel staff. Cek izin bot di channel tujuan lalu coba lagi.',
            });
        }
    },
};
