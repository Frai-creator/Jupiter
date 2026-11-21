// staffListRefresh.js — tombol "Refresh" di panel staff (ada cooldown per server)
import { MessageFlags } from 'discord.js';
import { refreshStaffList, STAFF_REFRESH_BUTTON_ID } from '../../../services/staffListService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const COOLDOWN_MS = 30 * 1000;
const lastManualRefresh = new Map(); // guildId -> timestamp

export default {
    name: STAFF_REFRESH_BUTTON_ID,
    async execute(interaction, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        const guildId = interaction.guild.id;
        const remaining = COOLDOWN_MS - (Date.now() - (lastManualRefresh.get(guildId) || 0));

        if (remaining > 0) {
            return await InteractionHelper.safeEditReply(interaction, {
                content: `⏳ Panel baru saja diperbarui. Coba lagi dalam **${Math.ceil(remaining / 1000)} detik**.`,
            });
        }

        lastManualRefresh.set(guildId, Date.now());
        const result = await refreshStaffList(client, guildId, { force: true });

        const text =
            result.status === 'updated' || result.status === 'reposted'
                ? `✅ Daftar staff diperbarui (${result.total} staff).`
                : '⚠️ Gagal memperbarui panel. Coba lagi sebentar lagi.';

        return await InteractionHelper.safeEditReply(interaction, { content: text });
    },
};
