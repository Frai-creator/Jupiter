// staffListService.js
// Daftar admin & staff yang selalu up-to-date.
//
// Alur: event (role / nama / foto / status berubah) -> scheduleStaffRefresh (debounce)
//       -> refreshStaffList -> render canvas -> edit pesan panel yang sama.
// Selama tidak ada perubahan, pesan tidak diedit (hash snapshot dibandingkan dulu).

import crypto from 'node:crypto';
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';
import { getGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import { renderStaffCard } from '../utils/staffCard.js';
import { DEFAULT_STAFF_GROUPS, STAFF_ROLE_IDS } from '../config/staffGroups.js';
import { Mutex } from '../utils/mutex.js';
import { logger } from '../utils/logger.js';

export const STAFF_REFRESH_BUTTON_ID = 'staff_list_refresh';

const EMBED_COLOR = 0x7aa7e0;
const FILE_NAME = 'staff-list.png';

const MEMBER_FETCH_TTL_MS = 10 * 60 * 1000; // sinkron penuh daftar member tiap 10 menit
const MIN_EDIT_GAP_MS = 10 * 1000;          // jarak minimum antar edit pesan
export const DELAY_PROFILE_MS = 4 * 1000;   // role / nama / foto berubah
export const DELAY_PRESENCE_MS = 20 * 1000; // status online / idle / dnd berubah

const activeGuilds = new Set();     // guild yang panel staff-nya aktif
const lastHash = new Map();         // guildId -> hash snapshot terakhir yang sudah tampil
const lastEditAt = new Map();       // guildId -> timestamp edit terakhir
const lastMemberFetch = new Map();  // guildId -> timestamp fetch penuh terakhir
const timers = new Map();           // guildId -> { timer, dueAt }

// ───────────────────────── config ─────────────────────────

export function getStaffListConfig(guildConfig) {
    return {
        enabled: false,
        channelId: null,
        messageId: null,
        ...guildConfig?.staffList,
    };
}

async function saveStaffListConfig(client, guildId, updates) {
    return await patchGuildConfig(client, guildId, { staffList: updates });
}

export function isStaffMember(member) {
    if (!member?.roles?.cache) return false;
    for (const roleId of STAFF_ROLE_IDS) {
        if (member.roles.cache.has(roleId)) return true;
    }
    return false;
}

export function isStaffListActive(guildId) {
    return activeGuilds.has(guildId);
}

// ───────────────────────── snapshot ─────────────────────────

function cleanName(raw, fallback) {
    // Canvas tidak punya font emoji -> buang emoji & simbol aneh biar tidak jadi kotak.
    const cleaned = String(raw || '')
        .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
}

function decimalToHex(n) {
    return n ? `#${n.toString(16).padStart(6, '0')}` : null;
}

async function ensureMembersFetched(guild, { force = false } = {}) {
    const last = lastMemberFetch.get(guild.id) || 0;
    if (!force && Date.now() - last < MEMBER_FETCH_TTL_MS) return;
    try {
        await guild.members.fetch();
        lastMemberFetch.set(guild.id, Date.now());
    } catch (error) {
        logger.warn(`Staff list: gagal sinkron member guild ${guild.id}: ${error.message}`);
    }
}

export async function buildStaffSnapshot(guild, { forceFetch = false } = {}) {
    await ensureMembersFetched(guild, { force: forceFetch });

    const seen = new Set();
    const groups = [];

    for (const def of DEFAULT_STAFF_GROUPS) {
        const role = guild.roles.cache.get(def.roleId);
        const members = [];

        if (role) {
            for (const member of role.members.values()) {
                if (member.user.bot || seen.has(member.id)) continue;
                seen.add(member.id);

                const rawStatus = member.presence?.status;
                members.push({
                    id: member.id,
                    name: cleanName(member.displayName, member.user.username),
                    username: member.user.username,
                    avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true }),
                    status: ['online', 'idle', 'dnd'].includes(rawStatus) ? rawStatus : 'offline',
                });
            }
        }

        members.sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

        groups.push({
            name: def.name,
            desc: def.desc,
            roleId: def.roleId,
            color: role ? decimalToHex(role.color) : null,
            members,
        });
    }

    const guildIconUrl = guild.iconURL({ extension: 'png', size: 256, forceStatic: true });

    const hash = crypto
        .createHash('sha1')
        .update(
            JSON.stringify({
                g: guild.name,
                i: guildIconUrl,
                groups: groups.map((g) => [
                    g.name,
                    g.color,
                    g.members.map((m) => [m.id, m.name, m.avatarUrl, m.status]),
                ]),
            }),
        )
        .digest('hex');

    return { groups, guildIconUrl, hash };
}

// ───────────────────────── message payload ─────────────────────────

export async function buildStaffPayload(guild, snapshot) {
    const buffer = await renderStaffCard({
        guildName: guild.name,
        guildIconUrl: snapshot.guildIconUrl,
        groups: snapshot.groups,
        updatedAt: new Date(),
    });

    const attachment = new AttachmentBuilder(buffer, { name: FILE_NAME });
    const unix = Math.floor(Date.now() / 1000);

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(`🔄 Terakhir diperbarui <t:${unix}:R>`)
        .setImage(`attachment://${FILE_NAME}`)
        .setFooter({ text: 'Update otomatis saat role, nama, foto, atau status staff berubah' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(STAFF_REFRESH_BUTTON_ID)
            .setLabel('Refresh')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], files: [attachment], components: [row] };
}

// ───────────────────────── post & refresh ─────────────────────────

async function fetchPanelMessage(guild, cfg) {
    if (!cfg.channelId || !cfg.messageId) return { channel: null, message: null };
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel?.isTextBased()) return { channel: null, message: null };
    const message = await channel.messages.fetch(cfg.messageId).catch(() => null);
    return { channel, message };
}

/**
 * Kirim panel staff baru ke `channel`. Panel lama (kalau ada) dihapus.
 */
export async function postStaffPanel(client, guild, channel) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const cfg = getStaffListConfig(guildConfig);

    const snapshot = await buildStaffSnapshot(guild, { forceFetch: true });
    const payload = await buildStaffPayload(guild, snapshot);
    const message = await channel.send(payload);

    if (cfg.messageId) {
        const { message: old } = await fetchPanelMessage(guild, cfg);
        if (old && old.id !== message.id) await old.delete().catch(() => {});
    }

    await saveStaffListConfig(client, guild.id, {
        enabled: true,
        channelId: channel.id,
        messageId: message.id,
    });

    activeGuilds.add(guild.id);
    lastHash.set(guild.id, snapshot.hash);
    lastEditAt.set(guild.id, Date.now());

    return { message, snapshot };
}

/**
 * Render ulang & edit panel. Dilewati kalau tidak ada yang berubah (kecuali force).
 * @returns {Promise<{status: 'updated'|'unchanged'|'reposted'|'disabled'|'error', total?: number}>}
 */
export async function refreshStaffList(client, guildId, { force = false } = {}) {
    return Mutex.runExclusive(`staff-list:${guildId}`, async () => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return { status: 'disabled' };

        try {
            const guildConfig = await getGuildConfig(client, guildId);
            const cfg = getStaffListConfig(guildConfig);

            if (!cfg.enabled || !cfg.channelId) {
                activeGuilds.delete(guildId);
                return { status: 'disabled' };
            }
            activeGuilds.add(guildId);

            const snapshot = await buildStaffSnapshot(guild, { forceFetch: force });
            const total = snapshot.groups.reduce((n, g) => n + g.members.length, 0);

            if (!force && lastHash.get(guildId) === snapshot.hash) {
                return { status: 'unchanged', total };
            }

            const { channel, message } = await fetchPanelMessage(guild, cfg);
            const payload = await buildStaffPayload(guild, snapshot);

            if (message) {
                await message.edit({ ...payload, attachments: [] });
                lastHash.set(guildId, snapshot.hash);
                lastEditAt.set(guildId, Date.now());
                return { status: 'updated', total };
            }

            // Pesan panel hilang (terhapus) -> kirim ulang otomatis kalau channel-nya masih ada.
            const targetChannel =
                channel || (await guild.channels.fetch(cfg.channelId).catch(() => null));
            if (!targetChannel?.isTextBased()) {
                logger.warn(`Staff list: channel panel guild ${guildId} tidak ditemukan.`);
                return { status: 'error' };
            }

            const sent = await targetChannel.send(payload);
            await saveStaffListConfig(client, guildId, { messageId: sent.id });
            lastHash.set(guildId, snapshot.hash);
            lastEditAt.set(guildId, Date.now());
            return { status: 'reposted', total };
        } catch (error) {
            logger.warn(`Staff list: refresh gagal untuk guild ${guildId}: ${error.message}`);
            return { status: 'error' };
        }
    });
}

// ───────────────────────── scheduling (realtime) ─────────────────────────

/**
 * Jadwalkan refresh dengan debounce. Banyak event beruntun -> satu kali render.
 */
export function scheduleStaffRefresh(client, guildId, { delayMs = DELAY_PROFILE_MS } = {}) {
    if (!activeGuilds.has(guildId)) return;

    const sinceLastEdit = Date.now() - (lastEditAt.get(guildId) || 0);
    const wait = Math.max(delayMs, MIN_EDIT_GAP_MS - sinceLastEdit);
    const dueAt = Date.now() + wait;

    const existing = timers.get(guildId);
    if (existing && existing.dueAt <= dueAt) return; // sudah ada jadwal yang lebih cepat
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
        timers.delete(guildId);
        refreshStaffList(client, guildId).catch((error) =>
            logger.warn(`Staff list: refresh terjadwal gagal: ${error.message}`),
        );
    }, wait);
    timer.unref?.();

    timers.set(guildId, { timer, dueAt });
}

/**
 * Dipanggil saat bot ready: tandai guild aktif lalu sinkron sekali.
 */
export async function initStaffLists(client) {
    let active = 0;
    for (const guild of client.guilds.cache.values()) {
        try {
            const cfg = getStaffListConfig(await getGuildConfig(client, guild.id));
            if (!cfg.enabled || !cfg.channelId) continue;
            activeGuilds.add(guild.id);
            active += 1;
            await refreshStaffList(client, guild.id, { force: true });
        } catch (error) {
            logger.warn(`Staff list: init gagal untuk guild ${guild.id}: ${error.message}`);
        }
    }
    return { activeGuilds: active };
}

/**
 * Jaring pengaman (cron): kalau ada event yang terlewat, daftar tetap dikoreksi.
 */
export async function refreshAllStaffLists(client) {
    for (const guildId of [...activeGuilds]) {
        await refreshStaffList(client, guildId);
    }
}
