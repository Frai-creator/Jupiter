import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { syncSupporterMember } from '../services/supporterRoleService.js';
import { isStaffMember, isStaffListActive, scheduleStaffRefresh } from '../services/staffListService.js';

export default {
  name: Events.UserUpdate,
  once: false,

  async execute(oldUser, newUser) {
    try {
      if (oldUser.bot) return;

      // Staff list realtime: username / nama tampilan / avatar staff berubah
      if (
        oldUser.username !== newUser.username ||
        oldUser.globalName !== newUser.globalName ||
        oldUser.avatar !== newUser.avatar
      ) {
        for (const guild of newUser.client.guilds.cache.values()) {
          if (!isStaffListActive(guild.id)) continue;
          const cached = guild.members.cache.get(newUser.id);
          if (cached && isStaffMember(cached)) scheduleStaffRefresh(newUser.client, guild.id);
        }
      }

      const usernameChanged = oldUser.username !== newUser.username;
      const discriminatorChanged = oldUser.discriminator !== newUser.discriminator;

      const allGuilds = [...newUser.client.guilds.cache.values()];
      for (const guild of allGuilds) {
        const member = guild.members.cache.get(newUser.id) || await guild.members.fetch(newUser.id).catch(() => null);
        if (member) {
          await syncSupporterMember(newUser.client, guild, member, { source: 'userUpdate' });
        }
      }

      if (!usernameChanged && !discriminatorChanged) return;

      const fields = [];

      if (usernameChanged) {
        fields.push({
          name: '🏷️ Old Username',
          value: oldUser.username,
          inline: true
        });
        fields.push({
          name: '🏷️ New Username',
          value: newUser.username,
          inline: true
        });
      }

      if (discriminatorChanged) {
        fields.push({
          name: '🔢 Old Tag',
          value: `#${oldUser.discriminator}`,
          inline: true
        });
        fields.push({
          name: '🔢 New Tag',
          value: `#${newUser.discriminator}`,
          inline: true
        });
      }

      const guilds = [...newUser.client.guilds.cache.values()];
      for (const guild of guilds) {
        if (!guild.members.cache.has(newUser.id)) continue;

        await logEvent({
          client: newUser.client,
          guildId: guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            description: `${newUser.tag} updated their username`,
            userId: newUser.id,
            fields: [
              {
                name: '👤 User',
                value: `${newUser.tag} (${newUser.id})`,
                inline: true
              },
              ...fields
            ]
          }
        });
      }

      logger.debug(`Processed userUpdate for ${newUser.id} across ${guilds.length} guild(s)`);
    } catch (error) {
      logger.error('Error in userUpdate event:', error);
    }
  }
};