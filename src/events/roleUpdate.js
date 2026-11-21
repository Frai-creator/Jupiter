import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { STAFF_ROLE_IDS } from '../config/staffGroups.js';
import { isStaffListActive, scheduleStaffRefresh } from '../services/staffListService.js';

export default {
  name: Events.GuildRoleUpdate,
  once: false,

  // Warna role staff berubah -> aksen divisi di panel ikut berubah
  async execute(oldRole, newRole) {
    try {
      if (!newRole.guild || !STAFF_ROLE_IDS.has(newRole.id)) return;
      if (!isStaffListActive(newRole.guild.id)) return;
      if (oldRole.color === newRole.color && oldRole.name === newRole.name) return;
      scheduleStaffRefresh(newRole.client, newRole.guild.id);
    } catch (error) {
      logger.error('Error in roleUpdate event:', error);
    }
  },
};
