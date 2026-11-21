import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { claimRole, buildResultImage, displayLink, hasPresenceIntent } from '../../../services/tagClaim/tagClaimService.js';

const TEXT = {
    disabled: 'Sistem claim sedang tidak aktif.',
    role_missing: 'Role hadiah sudah dihapus. Hubungi admin.',
    no_member: 'Data kamu tidak bisa dimuat. Coba lagi sebentar lagi.',
};

async function handle(interaction, client, apply) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    try {
        if (!interaction.guild) return;
        const result = await claimRole(client, interaction.guild, interaction.user.id, { apply });

        if (TEXT[result.status]) return await interaction.editReply({ content: TEXT[result.status] });
        if (result.status === 'cannot_assign') {
            return await interaction.editReply({ content: `Syarat terpenuhi, tapi bot tidak bisa memberi role: ${result.problem}` });
        }

        const png = await buildResultImage(result);
        const note = [];
        if (result.status === 'failed' || result.status === 'check') {
            if (!hasPresenceIntent(client) && result.cfg.mode !== 'tag') {
                note.push('Catatan: bot belum bisa membaca status (Presence Intent mati), hubungi admin.');
            } else if (!result.checks.linkKnown && result.cfg.mode !== 'tag') {
                note.push(`Status kamu tidak terbaca (Invisible/offline). Tulis ${displayLink(result.cfg.link)} di custom status lalu coba lagi.`);
            }
            if (result.status === 'check' && result.meets && !result.hasRole) note.push('Syarat sudah lengkap, tekan **Claim Role**.');
        }
        await interaction.editReply({
            content: note.join('\n') || undefined,
            files: [new AttachmentBuilder(png, { name: 'tagclaim-result.png' })],
        });
    } catch (error) {
        logger.error('[TagClaim] error tombol:', error);
        await interaction.editReply({ content: 'Terjadi kesalahan, coba lagi nanti.' }).catch(() => {});
    }
}

export default [
    { name: 'tagclaim_claim', execute: (interaction, client) => handle(interaction, client, true) },
    { name: 'tagclaim_check', execute: (interaction, client) => handle(interaction, client, false) },
];
