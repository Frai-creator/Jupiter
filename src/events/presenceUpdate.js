import { Events } from 'discord.js';
import { syncMember } from '../services/tagClaim/tagClaimService.js';
import { logger } from '../utils/logger.js';

// Hanya terpicu kalau intent GuildPresences aktif (ENABLE_PRESENCE_INTENT=true).
export default {
  name: Events.PresenceUpdate,
  once: false,

  async execute(oldPresence, newPresence, client) {
    try {
      const member = newPresence?.member;
      if (!member) return;
      await syncMember(client || member.client, member);
    } catch (error) {
      logger.error('Error in presenceUpdate event:', error);
    }
  },
};
