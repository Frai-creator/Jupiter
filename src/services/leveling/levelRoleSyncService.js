import { logger } from '../../utils/logger.js';
import {
    getLevelingConfig,
    getUserLevelData,
    saveLevelingConfig,
    listLevelUserIds,
} from './leveling.js';
import { syncRoleRewards } from './levelRoles.js';

/**
 * Startup reconciliation: prune reward entries whose role no longer exists, then make sure
 * every tracked member holds the reward roles their stored level entitles them to.
 */
export async function reconcileLevelRoles(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        prunedRewardEntries: 0,
        rolesReAwarded: 0,
        errors: 0,
    };

    const guilds = guildId
        ? [client.guilds.cache.get(guildId)].filter(Boolean)
        : [...client.guilds.cache.values()];

    for (const guild of guilds) {
        summary.scannedGuilds += 1;

        try {
            const cfg = await getLevelingConfig(client, guild.id);
            if (!cfg.enabled) continue;
            if (Object.keys(cfg.roleRewards).length === 0) continue;

            let configChanged = false;
            for (const [level, roleId] of Object.entries(cfg.roleRewards)) {
                const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
                if (!role) {
                    delete cfg.roleRewards[level];
                    configChanged = true;
                    summary.prunedRewardEntries += 1;
                    logger.warn(`Removed missing level ${level} reward role ${roleId} from config in guild ${guild.id}`);
                }
            }

            if (configChanged) await saveLevelingConfig(client, guild.id, cfg);
            if (Object.keys(cfg.roleRewards).length === 0) continue;

            for (const userId of await listLevelUserIds(client, guild.id)) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) continue;

                const levelData = await getUserLevelData(client, guild.id, userId);
                const result = await syncRoleRewards(guild, member, levelData.level, cfg, {
                    reason: 'Level reward (startup sync)',
                });
                summary.rolesReAwarded += result.added.length;
                summary.errors += result.skipped.filter((s) => s.reason === 'error').length;
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Level role sync failed for guild ${guild.id}:`, error.message);
        }
    }

    return summary;
}
