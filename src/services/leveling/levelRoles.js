// levelRoles.js
// Single place that decides which reward roles a member should hold for a given level.

import { logger } from '../../utils/logger.js';
import { getSortedRoleRewards } from './levelConfig.js';

async function resolveRole(guild, roleId) {
  return guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
}

/**
 * Bring a member's reward roles in line with their level.
 *
 * - stack mode   : every reward at or below `level` is granted.
 * - replace mode : only the highest reward at or below `level` is kept; lower reward roles are removed.
 * - strict       : (admin level changes) additionally removes reward roles for levels the member no longer has.
 *
 * Never throws; problems are reported in `skipped`.
 * @returns {Promise<{ added: string[], removed: string[], skipped: { roleId: string, reason: string }[] }>}
 */
export async function syncRoleRewards(guild, member, level, config, { reason = 'Level reward', strict = false } = {}) {
  const result = { added: [], removed: [], skipped: [] };
  const rewards = getSortedRoleRewards(config);
  if (!guild || !member || rewards.length === 0) return result;

  const eligible = rewards.filter((r) => r.level <= level);
  const ineligible = rewards.filter((r) => r.level > level);
  const replaceMode = config.roleRewardMode === 'replace';

  const shouldHave = new Set(
    replaceMode ? (eligible.length ? [eligible[eligible.length - 1].roleId] : []) : eligible.map((r) => r.roleId),
  );

  const toRemove = new Set();
  if (replaceMode) eligible.slice(0, -1).forEach((r) => toRemove.add(r.roleId));
  if (strict) {
    ineligible.forEach((r) => toRemove.add(r.roleId));
    // In strict + replace mode, lower roles of the eligible set are already covered above.
  }
  for (const roleId of shouldHave) toRemove.delete(roleId);

  for (const roleId of shouldHave) {
    if (member.roles.cache.has(roleId)) continue;
    const role = await resolveRole(guild, roleId);
    if (!role) {
      result.skipped.push({ roleId, reason: 'missing' });
      continue;
    }
    if (!role.editable) {
      result.skipped.push({ roleId, reason: 'hierarchy' });
      continue;
    }
    try {
      await member.roles.add(role, reason);
      result.added.push(roleId);
    } catch (error) {
      result.skipped.push({ roleId, reason: 'error' });
      logger.warn(`Could not add reward role ${roleId} to ${member.id} in ${guild.id}: ${error.message}`);
    }
  }

  for (const roleId of toRemove) {
    if (!member.roles.cache.has(roleId)) continue;
    const role = await resolveRole(guild, roleId);
    if (!role || !role.editable) {
      if (role) result.skipped.push({ roleId, reason: 'hierarchy' });
      continue;
    }
    try {
      await member.roles.remove(role, reason);
      result.removed.push(roleId);
    } catch (error) {
      result.skipped.push({ roleId, reason: 'error' });
      logger.warn(`Could not remove reward role ${roleId} from ${member.id} in ${guild.id}: ${error.message}`);
    }
  }

  return result;
}
