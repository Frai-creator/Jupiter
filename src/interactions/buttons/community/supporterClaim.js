// supporterClaim.js
import { MessageFlags } from 'discord.js';
import { syncSupporterMember, getSupporterConfig } from '../../../services/supporterRoleService.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export default {
    name: 'supporter_claim',
    async execute(interaction, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const member = interaction.member;
        const guildConfig = await getGuildConfig(client, guild.id);
        const cfg = getSupporterConfig(guildConfig);

        const result = await syncSupporterMember(client, guild, member, { source: 'button_claim' });

        if (result.status === 'claimed') {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '💠 Role Berhasil Diklaim!',
                        `Terima kasih sudah mendukung **${guild.name}**! Role **${result.roleName}** telah dipasang.`
                    ),
                ],
            });
        }

        if (result.status === 'already_claimed') {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '💠 Role Sudah Aktif',
                        `Kamu sudah memiliki role **${result.roleName}** dan syarat supporter kamu masih aktif.`
                    ),
                ],
            });
        }

        if (result.status === 'removed') {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `Syarat supporter tidak lagi terpenuhi, sehingga role **${result.roleName}** dilepas otomatis.`,
            });
        }

        const syarat = [];
        if (cfg.requireTag) syarat.push(`• Pasang **Server Tag** milik **${guild.name}**`);
        if (cfg.requireInvite && cfg.inviteKeyword) {
            syarat.push(`• Masukkan \`${cfg.inviteKeyword}\` di status profil`);
        }

        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: `Kamu belum memenuhi syarat supporter:\n${syarat.join('\n')}`,
        });
    },
};
