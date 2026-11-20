import { Events } from 'discord.js';
import { syncSupporterMember } from '../services/supporterRoleService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.PresenceUpdate,
  once: false,

  async execute(oldPresence, newPresence) {
    try {
      const member = newPresence?.member;
      const guild = newPresence?.guild;
      if (!guild || !member || member.user?.bot) return;

      await syncSupporterMember(newPresence.client, guild, member, { source: 'presenceUpdate' });
    } catch (error) {
      logger.error('Error in presenceUpdate event:', error);
    }
  }
};
