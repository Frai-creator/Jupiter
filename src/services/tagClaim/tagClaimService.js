// tagClaimService.js
// Claim role untuk member yang memakai tag server dan menaruh link server di status.
//
// Catatan penting soal "bio": API Discord TIDAK memberi bot akses ke bio ("About Me") user.
// Yang bisa dibaca bot hanya custom status (lewat presence, butuh intent GuildPresences).
// Jadi pengecekan link dilakukan di custom status.

import { ActivityType, AttachmentBuilder, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { renderClaimPanel, renderClaimResult, renderLogCard } from './tagClaimCard.js';

// ───────────────────────── key & config ─────────────────────────

const cfgKey = (guildId) => `guild:${guildId}:tagclaim:config`;
const memberKey = (guildId, userId) => `guild:${guildId}:tagclaim:member:${userId}`;
const historyKey = (guildId) => `guild:${guildId}:tagclaim:history`;

export const MODES = ['both', 'either', 'tag', 'link'];
const HISTORY_LIMIT = 100;

export const DEFAULT_CONFIG = {
    enabled: false,
    roleId: null,
    link: null,          // kode invite, mis. "jupiter"
    mode: 'both',        // both | either | tag | link
    logChannelId: null,
    tagText: null,       // teks tag server untuk tampilan panel, mis. "JPTR"
    panel: { channelId: null, messageId: null },
};

const cfgCache = new Map(); // guildId -> { at, value }
const CFG_TTL_MS = 15_000;

export async function getConfig(client, guildId) {
    const hit = cfgCache.get(guildId);
    if (hit && Date.now() - hit.at < CFG_TTL_MS) return hit.value;

    let stored = {};
    try {
        stored = (await client.db?.get(cfgKey(guildId), {})) || {};
    } catch (error) {
        logger.error(`[TagClaim] gagal membaca config ${guildId}:`, error);
    }
    const value = { ...DEFAULT_CONFIG, ...stored, panel: { ...DEFAULT_CONFIG.panel, ...(stored.panel || {}) } };
    cfgCache.set(guildId, { at: Date.now(), value });
    return value;
}

export async function saveConfig(client, guildId, patch) {
    const current = await getConfig(client, guildId);
    const next = { ...current, ...patch, panel: { ...current.panel, ...(patch.panel || {}) } };
    await client.db.set(cfgKey(guildId), next);
    cfgCache.set(guildId, { at: Date.now(), value: next });
    return next;
}

// ───────────────────────── link & evaluasi ─────────────────────────

/** "https://discord.gg/jupiter", "discord.gg/jupiter", ".gg/jupiter" atau "jupiter" -> "jupiter" */
export function parseInviteCode(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const match = raw.match(/(?:discord\.gg|discord(?:app)?\.com\/invite|\.gg)\/([A-Za-z0-9-]{2,32})/i);
    if (match) return match[1];
    return /^[A-Za-z0-9-]{2,32}$/.test(raw) ? raw : null;
}

export function displayLink(code) {
    return code ? `discord.gg/${code}` : 'link server';
}

function linkInText(text, code) {
    if (!text || !code) return false;
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:discord\\.gg|discord(?:app)?\\.com\\/invite|\\.gg)\\/${escaped}(?![A-Za-z0-9-])`, 'i');
    return re.test(text);
}

export function hasPresenceIntent(client) {
    try {
        return client.options.intents.has(GatewayIntentBits.GuildPresences);
    } catch {
        return false;
    }
}

/**
 * Evaluasi satu member.
 * @returns {{tag:boolean, tagText:string|null, link:boolean, linkKnown:boolean}}
 *   linkKnown = false kalau status tidak bisa dibaca (tanpa intent, atau user offline/invisible)
 */
export function evaluateMember(member, cfg) {
    const user = member.user;
    const pg = user?.primaryGuild;
    const tag = Boolean(pg && pg.identityEnabled && pg.identityGuildId === member.guild.id);
    const tagText = tag ? (pg.tag || null) : null;

    const presence = member.presence;
    const online = Boolean(presence && presence.status && presence.status !== 'offline');
    const custom = presence?.activities?.find((a) => a.type === ActivityType.Custom);
    const link = online ? linkInText(custom?.state || '', cfg.link) : false;

    return { tag, tagText, link, linkKnown: online };
}

export function meetsRequirement(mode, checks) {
    switch (mode) {
        case 'tag': return checks.tag;
        case 'link': return checks.link;
        case 'either': return checks.tag || checks.link;
        case 'both':
        default: return checks.tag && checks.link;
    }
}

// ───────────────────────── state per member ─────────────────────────

const stateCache = new Map(); // "guild:user" -> state
const locks = new Map();

async function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    locks.set(key, run);
    try {
        return await run;
    } finally {
        if (locks.get(key) === run) locks.delete(key);
    }
}

async function loadState(client, guildId, userId) {
    const k = `${guildId}:${userId}`;
    if (stateCache.has(k)) return stateCache.get(k);
    let state = null;
    try {
        state = await client.db.get(memberKey(guildId, userId), null);
    } catch (error) {
        logger.warn(`[TagClaim] gagal baca state ${k}: ${error.message}`);
    }
    if (state) stateCache.set(k, state);
    return state;
}

async function saveState(client, guildId, userId, state) {
    const k = `${guildId}:${userId}`;
    stateCache.set(k, state);
    if (stateCache.size > 20_000) stateCache.delete(stateCache.keys().next().value);
    try {
        await client.db.set(memberKey(guildId, userId), state);
    } catch (error) {
        logger.warn(`[TagClaim] gagal simpan state ${k}: ${error.message}`);
    }
}

// ───────────────────────── log ─────────────────────────

async function pushHistory(client, guildId, entry) {
    try {
        const list = (await client.db.get(historyKey(guildId), [])) || [];
        list.unshift(entry);
        await client.db.set(historyKey(guildId), list.slice(0, HISTORY_LIMIT));
    } catch (error) {
        logger.warn(`[TagClaim] gagal simpan riwayat: ${error.message}`);
    }
}

export async function getHistory(client, guildId, limit = 10) {
    try {
        const list = (await client.db.get(historyKey(guildId), [])) || [];
        return list.slice(0, limit);
    } catch {
        return [];
    }
}

const KIND_TEXT = {
    tag_add: 'memasang tag server',
    tag_remove: 'melepas tag server',
    link_add: 'memasang link di status',
    link_remove: 'melepas link dari status',
    claim: 'mengklaim role',
    role_remove: 'kehilangan role',
};

async function sendLog(client, guild, cfg, { kind, member, detail = null, roleLine = null, tagText = null }) {
    await pushHistory(client, guild.id, {
        at: Date.now(),
        kind,
        userId: member.id,
        username: member.user.username,
        detail,
    });

    if (!cfg.logChannelId) return;
    const channel = guild.channels.cache.get(cfg.logChannelId) || await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    try {
        const png = await renderLogCard({
            kind,
            username: member.displayName || member.user.username,
            userId: member.id,
            avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
            detail,
            roleLine,
            tagText,
        });
        const file = new AttachmentBuilder(png, { name: `tagclaim-${kind}.png` });
        await channel.send({ files: [file], allowedMentions: { parse: [] } });
    } catch (error) {
        logger.warn(`[TagClaim] kartu log gagal dirender, pakai teks: ${error.message}`);
        await channel.send({
            content: `**${member.user.username}** (\`${member.id}\`) ${KIND_TEXT[kind] || kind}${detail ? ` · ${detail}` : ''}`,
            allowedMentions: { parse: [] },
        }).catch(() => {});
    }
}

// ───────────────────────── role helper ─────────────────────────

export function checkRoleAssignable(guild, role) {
    const me = guild.members.me;
    if (!role) return 'Role tidak ditemukan.';
    if (role.managed) return 'Role itu dikelola integrasi/bot, tidak bisa dipakai.';
    if (role.id === guild.id) return 'Role @everyone tidak bisa dipakai.';
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return 'Bot butuh izin **Manage Roles**.';
    if (role.position >= me.roles.highest.position) return 'Role itu lebih tinggi dari role tertinggi bot. Naikkan role bot di atasnya.';
    return null;
}

async function refreshMember(guild, userId, client) {
    const opts = { user: userId, force: true };
    if (hasPresenceIntent(client)) opts.withPresences = true;
    const member = await guild.members.fetch(opts).catch(() => null);
    // user (untuk primaryGuild) diambil segar dari API
    if (member) await client.users.fetch(userId, { force: true }).catch(() => {});
    return member;
}

// ───────────────────────── claim ─────────────────────────

/**
 * Dipanggil dari tombol Claim / Cek.
 * @param {boolean} apply  true = beri role kalau lolos, false = hanya cek
 */
export async function claimRole(client, guild, userId, { apply = true } = {}) {
    const cfg = await getConfig(client, guild.id);
    if (!cfg.enabled || !cfg.roleId) return { status: 'disabled' };

    const role = guild.roles.cache.get(cfg.roleId) || await guild.roles.fetch(cfg.roleId).catch(() => null);
    if (!role) return { status: 'role_missing' };

    const member = await refreshMember(guild, userId, client);
    if (!member) return { status: 'no_member' };

    const checks = evaluateMember(member, cfg);
    const meets = meetsRequirement(cfg.mode, checks);
    const hasRole = member.roles.cache.has(role.id);
    const base = { cfg, role, member, checks };

    if (!apply) return { ...base, status: 'check', meets, hasRole };

    if (hasRole) {
        // pastikan state ikut "claimed" supaya role dicabut kalau syarat lepas
        await withLock(`${guild.id}:${userId}`, async () => {
            const prev = await loadState(client, guild.id, userId);
            await saveState(client, guild.id, userId, {
                tag: checks.tag,
                link: checks.linkKnown ? checks.link : (prev?.link ?? checks.link),
                claimed: true,
                updatedAt: Date.now(),
            });
        });
        return { ...base, status: 'already', meets };
    }

    if (!meets) return { ...base, status: 'failed', meets };

    const problem = checkRoleAssignable(guild, role);
    if (problem) return { ...base, status: 'cannot_assign', problem };

    await member.roles.add(role, 'Tag Claim: syarat terpenuhi');

    await withLock(`${guild.id}:${userId}`, async () => {
        const prev = await loadState(client, guild.id, userId);
        await saveState(client, guild.id, userId, {
            tag: checks.tag,
            link: checks.linkKnown ? checks.link : (prev?.link ?? checks.link),
            claimed: true,
            claimedAt: Date.now(),
            updatedAt: Date.now(),
        });
    });

    await sendLog(client, guild, cfg, {
        kind: 'claim',
        member,
        tagText: checks.tagText,
        detail: `Klaim role @${role.name}`,
    });

    return { ...base, status: 'claimed', meets };
}

// ───────────────────────── sinkronisasi (deteksi pasang/lepas) ─────────────────────────

/**
 * Bandingkan kondisi member sekarang dengan yang terakhir diketahui.
 * Dipanggil dari guildMemberUpdate, presenceUpdate, dan sweep berkala.
 * Saat pertama kali melihat member, hanya mencatat baseline (tanpa log) supaya tidak banjir log.
 */
export async function syncMember(client, member) {
    if (!member?.guild || member.user?.bot) return;
    const guild = member.guild;
    const cfg = await getConfig(client, guild.id);
    if (!cfg.enabled || !cfg.roleId) return;

    await withLock(`${guild.id}:${member.id}`, async () => {
        const prev = await loadState(client, guild.id, member.id);
        const cur = evaluateMember(member, cfg);

        // status offline/invisible = tidak terbaca, jangan dianggap "link dilepas"
        const link = cur.linkKnown ? cur.link : (prev?.link ?? false);
        const next = {
            tag: cur.tag,
            link,
            claimed: prev?.claimed ?? false,
            updatedAt: Date.now(),
        };

        if (!prev) {
            await saveState(client, guild.id, member.id, next);
            return;
        }

        const events = [];
        if (prev.tag !== cur.tag) events.push(cur.tag ? 'tag_add' : 'tag_remove');
        if (cfg.link && cur.linkKnown && prev.link !== cur.link) events.push(cur.link ? 'link_add' : 'link_remove');

        // role dicabut kalau sebelumnya sudah klaim tapi syarat tidak lagi terpenuhi
        let roleRemoved = null;
        const roleId = cfg.roleId;
        if (prev.claimed) {
            const stillOk = meetsRequirement(cfg.mode, { tag: next.tag, link: next.link });
            if (!stillOk) {
                const role = guild.roles.cache.get(roleId);
                if (role && member.roles.cache.has(roleId) && !checkRoleAssignable(guild, role)) {
                    try {
                        await member.roles.remove(role, 'Tag Claim: syarat tidak lagi terpenuhi');
                        roleRemoved = role;
                    } catch (error) {
                        logger.warn(`[TagClaim] gagal cabut role ${member.id}: ${error.message}`);
                    }
                }
                // member sudah tidak punya role / sudah dicabut -> claim selesai, harus klaim ulang
                if (roleRemoved || !member.roles.cache.has(roleId)) next.claimed = false;
            }
        }

        await saveState(client, guild.id, member.id, next);

        for (let i = 0; i < events.length; i += 1) {
            const kind = events[i];
            const isLast = i === events.length - 1;
            await sendLog(client, guild, cfg, {
                kind,
                member,
                tagText: cur.tagText || null,
                detail: {
                    tag_add: cur.tagText ? `Memasang tag server ${cur.tagText}` : 'Memasang tag server',
                    tag_remove: 'Tag server tidak lagi ditampilkan',
                    link_add: `Menaruh ${displayLink(cfg.link)} di status`,
                    link_remove: `${displayLink(cfg.link)} hilang dari status`,
                }[kind],
                roleLine: isLast && roleRemoved ? `Role @${roleRemoved.name} dicabut otomatis` : null,
            });
        }

        if (!events.length && roleRemoved) {
            await sendLog(client, guild, cfg, {
                kind: 'role_remove',
                member,
                detail: 'Syarat tidak lagi terpenuhi',
                roleLine: `Role @${roleRemoved.name} dicabut otomatis`,
            });
        }
    });
}

/** Sweep seluruh member yang ada di cache (dipanggil saat start & berkala). */
export async function sweepGuild(client, guild, { fetchAll = false } = {}) {
    const cfg = await getConfig(client, guild.id);
    if (!cfg.enabled || !cfg.roleId) return 0;

    if (fetchAll) {
        try {
            await guild.members.fetch(hasPresenceIntent(client) ? { withPresences: true } : undefined);
        } catch (error) {
            logger.warn(`[TagClaim] gagal fetch member ${guild.id}: ${error.message}`);
        }
    }

    let count = 0;
    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        try {
            await syncMember(client, member);
            count += 1;
        } catch (error) {
            logger.warn(`[TagClaim] sync ${member.id} gagal: ${error.message}`);
        }
    }
    return count;
}

export async function sweepAll(client, opts) {
    for (const guild of client.guilds.cache.values()) {
        await sweepGuild(client, guild, opts);
    }
}

// ───────────────────────── render helper untuk command/button ─────────────────────────

export async function buildPanelImage(guild, cfg, role) {
    return renderClaimPanel({
        serverName: guild.name,
        roleName: role?.name || 'Role',
        mode: cfg.mode,
        link: cfg.link ? displayLink(cfg.link) : null,
        tagText: cfg.tagText || 'TAG',
        iconUrl: guild.iconURL({ extension: 'png', size: 128 }),
    });
}

export async function buildResultImage(result) {
    const { member, cfg, role, checks, status } = result;
    return renderClaimResult({
        status,
        username: member.displayName || member.user.username,
        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
        roleName: role.name,
        mode: cfg.mode,
        checks,
        tagText: checks.tagText || 'TAG',
        linkHint: cfg.link ? displayLink(cfg.link) : null,
    });
}
