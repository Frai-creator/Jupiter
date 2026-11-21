import { Events } from 'discord.js';
import { syncSupporterMember } from '../services/supporterRoleService.js';
import { logger } from '../utils/logger.js';
import { isStaffMember, isStaffListActive, scheduleStaffRefresh, DELAY_PRESENCE_MS } from '../services/staffListService.js';

export default {
  name: Events.PresenceUpdate,
  once: false,

  async execute(oldPresence, newPresence) {
    try {
      const member = newPresence?.member;
      const guild = newPresence?.guild;
      if (!guild || !member || member.user?.bot) return;

      // Staff list realtime: hanya kalau status (online/idle/dnd/offline) staff berubah
      if (
        isStaffListActive(guild.id) &&
        oldPresence?.status !== newPresence?.status &&
        isStaffMember(member)
      ) {
        scheduleStaffRefresh(newPresence.client, guild.id, { delayMs: DELAY_PRESENCE_MS });
      }

      await syncSupporterMember(newPresence.client, guild, member, { source: 'presenceUpdate' });
    } catch (error) {
      logger.error('Error in presenceUpdate event:', error);
    }
  }
};
