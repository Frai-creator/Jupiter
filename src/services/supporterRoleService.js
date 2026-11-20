// supporterRoleService.js
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import { renderSupporterCard } from '../utils/supporterCard.js';
import { logger } from '../utils/logger.js';

const SOFT_BLUE_HEX = 0x6ba4d9;
const SOFT_RED_HEX = 0xd9777f;

export function getSupporterConfig(guildConfig) {
    return {
        enabled: false,
        roleId: null,
        logChannelId: null,
        inviteKeyword: '',
        requireTag: true,
        requireInvite: false,
        ...guildConfig?.supporterRole,
    };
}

export async function saveSupporterConfig(client, guildId, updates) {
    return await patchGuildConfig(client, guildId, {
        supporterRole: updates,
    });
}

export async function evaluateMemberEligibility(guild, member, cfg) {
    const freshUser = await member.user.fetch(true).catch(() => member.user);

    const primaryGuild = freshUser.primaryGuild;
    const hasServerTag =
        Boolean(primaryGuild?.identityEnabled) &&
        primaryGuild?.identityGuildId === guild.id;

    const tagText = hasServerTag ? primaryGuild.tag || 'Server Tag' : null;

    const keyword = String(cfg.inviteKeyword || '').trim().toLowerCase();
    let hasInviteLink = false;

    if (keyword) {
        const customActivity = member.presence?.activities?.find((a) => a.type === 4);
        const statusText = String(customActivity?.state || '').toLowerCase();
        if (statusText.includes(keyword)) {
            hasInviteLink = true;
        }
    }

    const tagOk = cfg.requireTag ? hasServerTag : true;
    const inviteOk = cfg.requireInvite && keyword ? hasInviteLink : true;
    const eligible = tagOk && inviteOk;

    return {
        eligible,
        hasServerTag,
        hasInviteLink,
        tagText,
    };
}

export async function syncSupporterMember(client, guild, member, { source = 'auto' } = {}) {
    if (!guild || !member || member.user?.bot) return { status: 'ignored' };

    const guildConfig = await getGuildConfig(client, guild.id);
    const cfg = getSupporterConfig(guildConfig);

    if (!cfg.enabled || !cfg.roleId) {
        return { status: 'disabled' };
    }

    const role = guild.roles.cache.get(cfg.roleId);
    if (!role) return { status: 'role_missing' };

    const check = await evaluateMemberEligibility(guild, member, cfg);
    const alreadyHasRole = member.roles.cache.has(role.id);

    if (check.eligible && !alreadyHasRole) {
        await member.roles.add(role.id, `Supporter Reward (${source})`);

        const reasonParts = [];
        if (check.hasServerTag) reasonParts.push(`Tag [${check.tagText}]`);
        if (check.hasInviteLink) reasonParts.push(`Link [${cfg.inviteKeyword}]`);
        const reasonSummary = `Memasang ${reasonParts.join(' & ') || 'syarat supporter'}`;

        await sendSupporterLog(client, guild, member, {
            action: 'claimed',
            role,
            serverTag: check.tagText,
            reason: reasonSummary,
            cfg,
        });

        return { status: 'claimed', roleName: role.name, check };
    }

    if (!check.eligible && alreadyHasRole) {
        await member.roles.remove(role.id, `Supporter Reward revoked (${source})`);

        const missingParts = [];
        if (cfg.requireTag && !check.hasServerTag) missingParts.push('Server Tag dilepas');
        if (cfg.requireInvite && !check.hasInviteLink) missingParts.push('Link server tidak terdeteksi');
        const reasonSummary = missingParts.join(' • ') || 'Syarat supporter dilepas';

        await sendSupporterLog(client, guild, member, {
            action: 'removed',
            role,
            serverTag: null,
            reason: reasonSummary,
            cfg,
        });

        return { status: 'removed', roleName: role.name, check };
    }

    return {
        status: check.eligible ? 'already_claimed' : 'not_eligible',
        roleName: role.name,
        check,
    };
}

export async function sendSupporterLog(client, guild, member, { action, role, serverTag, reason, cfg }) {
    if (!cfg?.logChannelId) return;

    const logChannel = guild.channels.cache.get(cfg.logChannelId);
    if (!logChannel?.isTextBased()) return;

    try {
        const buffer = await renderSupporterCard({
            action,
            username: member.displayName || member.user.username,
            userTag: member.user.tag,
            avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
            roleName: role.name,
            serverTag,
            reason,
            guildName: guild.name,
            seed: member.id,
        });

        const attachment = new AttachmentBuilder(buffer, { name: `supporter-${action}.png` });
        const isRemoved = action === 'removed';

        const embed = new EmbedBuilder()
            .setColor(isRemoved ? SOFT_RED_HEX : SOFT_BLUE_HEX)
            .setTitle(isRemoved ? '📤 Supporter Role Dilepas' : '📥 Supporter Role Dipasang')
            .setDescription(
                [
                    `**Member:** ${member} (\`${member.user.id}\`)`,
                    `**Role:** ${role}`,
                    `**Keterangan:** ${reason}`,
                ].join('\n')
            )
            .setImage(`attachment://supporter-${action}.png`)
            .setTimestamp();

        await logChannel.send({ embeds: [embed], files: [attachment] });
    } catch (err) {
        logger.error('Failed to send supporter log card:', err);
    }
}
