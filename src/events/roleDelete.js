import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { STAFF_ROLE_IDS } from '../config/staffGroups.js';
import { isStaffListActive, scheduleStaffRefresh } from '../services/staffListService.js';
import { buildRoleAuditLines } from '../utils/logging/logEmbeds.js';

export default {
  name: Events.GuildRoleDelete,
  once: false,

  async execute(role) {
    try {
      if (!role.guild) return;

      if (STAFF_ROLE_IDS.has(role.id) && isStaffListActive(role.guild.id)) {
        scheduleStaffRefresh(role.client, role.guild.id);
      }

      const lines = buildRoleAuditLines(role, { includeMemberCount: true });

      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_DELETE,
        data: {
          title: 'Role Deleted',
          headline: `**${role.name}** was deleted`,
          lines,
        },
      });

    } catch (error) {
      logger.error('Error in roleDelete event:', error);
    }
  }
};