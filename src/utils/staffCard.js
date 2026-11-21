// staffCard.js
// Renders the "Daftar Admin & Staff" board (PNG) with @napi-rs/canvas.
// Pure renderer: takes plain data (no discord.js objects) so it can be previewed on its own.

import { createCanvas } from '@napi-rs/canvas';
import {
    ensureFonts,
    fetchImage,
    hashSeed,
    rng,
    hexToRgba,
    roundedRectPath,
    drawBlurredCover,
    setFont,
    ellipsize,
    fitText,
    spacedWidth,
    drawSpaced,
    drawSparkle,
} from './welcomeCard.js';

export const STAFF_CARD_WIDTH = 1024;

const PALETTE = {
    bgStart: '#0a1020',
    bgEnd: '#16223d',
    accentMain: '#7aa7e0',
    accentSoft: '#b4d0f2',
    text: '#f1f6fc',
    textSoft: 'rgba(214, 228, 245, 0.72)',
    textMute: 'rgba(170, 195, 225, 0.48)',
};

export const STATUS_COLORS = {
    online: '#3ba55d',
    idle: '#f0b232',
    dnd: '#ed4245',
    offline: '#6b7686',
};

const STATUS_LABEL = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'Sibuk',
    offline: 'Offline',
};

// Fallback accents for roles without a colour (role.color === 0)
const FALLBACK_ACCENTS = ['#f2c15b', '#7aa7e0', '#a78bfa', '#5fd0b5', '#f08aa8', '#6ec1f2', '#f0a35e'];

// ── layout constants ──
const PAD = 36;
const HEADER_H = 232;
const GROUP_GAP = 26;
const GROUP_HEAD_H = 92;
const CARD_H = 76;
const CARD_GAP = 12;
const COLS = 2;
const FOOTER_H = 74;
const EMPTY_H = 56;

// ── avatar cache (avoids re-downloading the same avatars on every live refresh) ──
const avatarCache = new Map(); // url -> { image, at }
const AVATAR_TTL_MS = 10 * 60 * 1000;

async function loadAvatar(member) {
    if (member.avatarImage) return member.avatarImage;
    if (!member.avatarUrl) return null;
    const hit = avatarCache.get(member.avatarUrl);
    if (hit && Date.now() - hit.at < AVATAR_TTL_MS) return hit.image;
    try {
        const image = await fetchImage(member.avatarUrl);
        avatarCache.set(member.avatarUrl, { image, at: Date.now() });
        if (avatarCache.size > 120) avatarCache.delete(avatarCache.keys().next().value);
        return image;
    } catch {
        return null;
    }
}

function accentFor(group, index) {
    if (group.color && /^#?[0-9a-f]{6}$/i.test(String(group.color))) {
        return String(group.color).startsWith('#') ? group.color : `#${group.color}`;
    }
    return FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length];
}

function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth) {
            line = test;
        } else {
            if (line) lines.push(line);
            line = word;
            if (lines.length === maxLines) break;
        }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length === maxLines) {
        const consumed = lines.join(' ').split(/\s+/).length;
        if (consumed < words.length) {
            lines[maxLines - 1] = ellipsize(ctx, `${lines[maxLines - 1]} …`, maxWidth);
        }
    }
    return lines;
}

function computeHeight(groups) {
    let h = HEADER_H;
    for (const g of groups) {
        h += GROUP_HEAD_H;
        const rows = Math.ceil(g.members.length / COLS);
        h += rows > 0 ? rows * CARD_H + (rows - 1) * CARD_GAP : EMPTY_H;
        h += GROUP_GAP;
    }
    return h + FOOTER_H;
}

/**
 * @typedef {object} StaffMember
 * @property {string} id
 * @property {string} name            Display name
 * @property {string} [username]
 * @property {string} [avatarUrl]
 * @property {object} [avatarImage]   Pre-loaded image (preview/testing)
 * @property {'online'|'idle'|'dnd'|'offline'} [status]
 *
 * @typedef {object} StaffGroup
 * @property {string} name
 * @property {string} [desc]
 * @property {string} [color]         Hex colour (usually the live role colour)
 * @property {StaffMember[]} members
 *
 * @param {object} opts
 * @param {string} opts.guildName
 * @param {string} [opts.guildIconUrl]
 * @param {object} [opts.guildIconImage]
 * @param {StaffGroup[]} opts.groups
 * @param {Date} [opts.updatedAt]
 * @returns {Promise<Buffer>}
 */
export async function renderStaffCard(opts) {
    ensureFonts();

    const W = STAFF_CARD_WIDTH;
    const groups = (opts.groups || []).map((g) => ({ ...g, members: g.members || [] }));
    const H = computeHeight(groups);

    const totalStaff = groups.reduce((n, g) => n + g.members.length, 0);
    const onlineCount = groups.reduce(
        (n, g) => n + g.members.filter((m) => m.status && m.status !== 'offline').length,
        0,
    );

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Load every image up-front, in parallel
    const guildIcon =
        opts.guildIconImage ||
        (opts.guildIconUrl ? await fetchImage(opts.guildIconUrl).catch(() => null) : null);
    const allMembers = groups.flatMap((g) => g.members);
    const avatars = new Map();
    await Promise.all(
        allMembers.map(async (m) => {
            avatars.set(m.id, await loadAvatar(m));
        }),
    );

    // ───────── 1. background ─────────
    const base = ctx.createLinearGradient(0, 0, W * 0.6, H);
    base.addColorStop(0, PALETTE.bgStart);
    base.addColorStop(1, PALETTE.bgEnd);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    if (guildIcon) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        drawBlurredCover(ctx, guildIcon, 0, 0, W, HEADER_H + 40, 30);
        ctx.restore();
        const fade = ctx.createLinearGradient(0, 0, 0, HEADER_H + 60);
        fade.addColorStop(0, hexToRgba(PALETTE.bgStart, 0.55));
        fade.addColorStop(1, hexToRgba(PALETTE.bgStart, 0));
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, W, HEADER_H + 60);
    }

    const glowA = ctx.createRadialGradient(W * 0.9, 60, 0, W * 0.9, 60, 460);
    glowA.addColorStop(0, hexToRgba(PALETTE.accentMain, 0.24));
    glowA.addColorStop(1, hexToRgba(PALETTE.accentMain, 0));
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, W, H);

    const glowB = ctx.createRadialGradient(W * 0.05, H * 0.55, 0, W * 0.05, H * 0.55, 520);
    glowB.addColorStop(0, hexToRgba('#6f5bd6', 0.13));
    glowB.addColorStop(1, hexToRgba('#6f5bd6', 0));
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, W, H);

    const rand = rng(hashSeed(`staff:${opts.guildName || 'guild'}`));
    const starCount = Math.min(140, Math.round(H / 14));
    for (let i = 0; i < starCount; i++) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(210, 230, 250, ${0.04 + rand() * 0.2})`;
        ctx.arc(rand() * W, rand() * H, 0.7 + rand() * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // outer frame
    ctx.save();
    roundedRectPath(ctx, 14, 14, W - 28, H - 28, 30);
    ctx.lineWidth = 1.6;
    const frame = ctx.createLinearGradient(0, 0, W, H);
    frame.addColorStop(0, hexToRgba(PALETTE.accentSoft, 0.5));
    frame.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    frame.addColorStop(1, hexToRgba(PALETTE.accentMain, 0.5));
    ctx.strokeStyle = frame;
    ctx.stroke();
    ctx.restore();

    // ───────── 2. header ─────────
    const iconR = 62;
    const iconX = PAD + 24 + iconR;
    const iconY = 112;

    ctx.save();
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR + 9, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(PALETTE.accentMain, 0.32);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR + 3, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.accentSoft;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (guildIcon) {
        ctx.drawImage(guildIcon, iconX - iconR, iconY - iconR, iconR * 2, iconR * 2);
    } else {
        ctx.fillStyle = '#1e3557';
        ctx.fillRect(iconX - iconR, iconY - iconR, iconR * 2, iconR * 2);
        setFont(ctx, 800, 60);
        ctx.fillStyle = '#dcebfa';
        ctx.textAlign = 'center';
        ctx.fillText(String(opts.guildName || '?')[0].toUpperCase(), iconX, iconY + 21);
        ctx.textAlign = 'left';
    }
    ctx.restore();

    const hx = iconX + iconR + 44;
    const hMaxW = W - hx - PAD - 20;

    setFont(ctx, 800, 16);
    ctx.fillStyle = PALETTE.accentMain;
    drawSpaced(ctx, 'ADMIN & STAFF LIST', hx, 74, 5);

    const title = fitText(ctx, String(opts.guildName || 'Server'), hMaxW, {
        weight: 800,
        start: 52,
        min: 30,
    });
    setFont(ctx, 800, title.size);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(title.text, hx, 134);

    const rule = ctx.createLinearGradient(hx, 0, hx + hMaxW, 0);
    rule.addColorStop(0, hexToRgba(PALETTE.accentMain, 0.8));
    rule.addColorStop(1, hexToRgba(PALETTE.accentMain, 0));
    ctx.fillStyle = rule;
    roundedRectPath(ctx, hx, 152, hMaxW, 3, 1.5);
    ctx.fill();

    // chips
    const chips = [
        { label: `${totalStaff} STAFF`, dot: PALETTE.accentMain },
        { label: `${onlineCount} AKTIF`, dot: STATUS_COLORS.online },
        { label: 'REALTIME', dot: '#f0b232' },
    ];
    let cx = hx;
    const cy = 172;
    const chH = 38;
    for (const chip of chips) {
        setFont(ctx, 700, 15);
        const tw = spacedWidth(ctx, chip.label, 1.4);
        const cw = tw + 52;
        if (cx + cw > hx + hMaxW + 20) break;
        roundedRectPath(ctx, cx, cy, cw, chH, chH / 2);
        ctx.fillStyle = 'rgba(122, 167, 224, 0.12)';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = hexToRgba(PALETTE.accentSoft, 0.38);
        ctx.stroke();
        ctx.fillStyle = chip.dot;
        ctx.beginPath();
        ctx.arc(cx + 21, cy + chH / 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e6f0fa';
        drawSpaced(ctx, chip.label, cx + 35, cy + chH / 2 + 5.5, 1.4);
        cx += cw + 12;
    }

    drawSparkle(ctx, W - 92, 70, 10, PALETTE.accentSoft, 0.7);
    drawSparkle(ctx, W - 134, 96, 5, PALETTE.accentMain, 0.5);
    drawSparkle(ctx, W - 70, 112, 4, PALETTE.accentSoft, 0.4);

    // ───────── 3. groups ─────────
    const innerW = W - PAD * 2;
    const cardW = (innerW - CARD_GAP * (COLS - 1)) / COLS;
    let y = HEADER_H;

    for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const accent = accentFor(g, gi);

        // group header: accent bar + name + count pill + description
        roundedRectPath(ctx, PAD, y + 4, 6, 58, 3);
        ctx.fillStyle = accent;
        ctx.fill();

        setFont(ctx, 800, 27);
        ctx.fillStyle = PALETTE.text;
        const nameText = String(g.name || 'Staff').toUpperCase();
        const nameW = spacedWidth(ctx, nameText, 2.2);
        const countLabel = `${g.members.length} MEMBER`;
        setFont(ctx, 700, 13);
        const countW = spacedWidth(ctx, countLabel, 1.4) + 30;

        const maxNameW = innerW - 24 - countW - 18;
        setFont(ctx, 800, 27);
        let nameDraw = nameText;
        if (nameW > maxNameW) {
            while (nameDraw.length > 3 && spacedWidth(ctx, `${nameDraw}…`, 2.2) > maxNameW) {
                nameDraw = nameDraw.slice(0, -1);
            }
            nameDraw = `${nameDraw}…`;
        }
        ctx.fillStyle = PALETTE.text;
        drawSpaced(ctx, nameDraw, PAD + 22, y + 30, 2.2);
        const nameDrawW = spacedWidth(ctx, nameDraw, 2.2);

        // count pill
        const pillX = PAD + 22 + nameDrawW + 18;
        roundedRectPath(ctx, pillX, y + 9, countW, 28, 14);
        ctx.fillStyle = hexToRgba(accent, 0.16);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = hexToRgba(accent, 0.55);
        ctx.stroke();
        setFont(ctx, 700, 13);
        ctx.fillStyle = hexToRgba(accent, 1);
        drawSpaced(ctx, countLabel, pillX + 15, y + 28, 1.4);

        // description (max 2 lines)
        if (g.desc) {
            setFont(ctx, 500, 16);
            ctx.fillStyle = PALETTE.textSoft;
            const lines = wrapLines(ctx, g.desc, innerW - 24, 2);
            lines.forEach((ln, li) => ctx.fillText(ln, PAD + 22, y + 54 + li * 21));
        }

        y += GROUP_HEAD_H;

        // members
        if (g.members.length === 0) {
            roundedRectPath(ctx, PAD, y, innerW, EMPTY_H - 8, 16);
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fill();
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = 'rgba(180,208,242,0.22)';
            ctx.stroke();
            ctx.setLineDash([]);
            setFont(ctx, 600, 17);
            ctx.fillStyle = PALETTE.textMute;
            ctx.textAlign = 'center';
            ctx.fillText('Belum ada member di divisi ini', W / 2, y + (EMPTY_H - 8) / 2 + 6);
            ctx.textAlign = 'left';
            y += EMPTY_H;
        } else {
            const rows = Math.ceil(g.members.length / COLS);
            g.members.forEach((m, i) => {
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const x = PAD + col * (cardW + CARD_GAP);
                const cyCard = y + row * (CARD_H + CARD_GAP);
                drawMemberCard(ctx, m, avatars.get(m.id), x, cyCard, cardW, CARD_H, accent);
            });
            y += rows * CARD_H + (rows - 1) * CARD_GAP;
        }

        y += GROUP_GAP;
    }

    // ───────── 4. footer ─────────
    const fy = H - FOOTER_H + 6;
    ctx.fillStyle = 'rgba(180,208,242,0.14)';
    ctx.fillRect(PAD + 10, fy - 14, innerW - 20, 1.5);

    const stamp = (opts.updatedAt instanceof Date ? opts.updatedAt : new Date()).toLocaleString(
        'id-ID',
        {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta',
        },
    );
    setFont(ctx, 600, 14);
    ctx.fillStyle = PALETTE.textMute;
    drawSpaced(ctx, `DIPERBARUI OTOMATIS  •  ${stamp} WIB`.toUpperCase(), PAD + 14, fy + 20, 1.6);

    // status legend (right)
    const legend = ['online', 'idle', 'dnd', 'offline'];
    setFont(ctx, 600, 14);
    let lx = W - PAD - 14;
    for (let i = legend.length - 1; i >= 0; i--) {
        const label = STATUS_LABEL[legend[i]];
        const lw = ctx.measureText(label).width;
        lx -= lw;
        ctx.fillStyle = PALETTE.textSoft;
        ctx.fillText(label, lx, fy + 20);
        lx -= 18;
        ctx.fillStyle = STATUS_COLORS[legend[i]];
        ctx.beginPath();
        ctx.arc(lx + 5, fy + 15, 5, 0, Math.PI * 2);
        ctx.fill();
        lx -= 18;
    }

    return canvas.encode('png');
}

function drawMemberCard(ctx, m, avatar, x, y, w, h, accent) {
    const status = STATUS_COLORS[m.status] ? m.status : 'offline';
    const sColor = STATUS_COLORS[status];
    const dim = status === 'offline';

    // glass card
    roundedRectPath(ctx, x, y, w, h, 20);
    const cardFill = ctx.createLinearGradient(x, y, x + w, y + h);
    cardFill.addColorStop(0, 'rgba(255,255,255,0.07)');
    cardFill.addColorStop(1, 'rgba(255,255,255,0.025)');
    ctx.fillStyle = cardFill;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = hexToRgba(accent, dim ? 0.2 : 0.38);
    ctx.stroke();

    // avatar
    const ar = 26;
    const ax = x + 18 + ar;
    const ay = y + h / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 3, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(accent, dim ? 0.35 : 0.9);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, ax - ar, ay - ar, ar * 2, ar * 2);
    } else {
        ctx.fillStyle = '#1e3557';
        ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
        setFont(ctx, 800, 26);
        ctx.fillStyle = '#dcebfa';
        ctx.textAlign = 'center';
        ctx.fillText(String(m.name || '?')[0].toUpperCase(), ax, ay + 9);
        ctx.textAlign = 'left';
    }
    if (dim) {
        ctx.fillStyle = 'rgba(10,16,32,0.38)';
        ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
    }
    ctx.restore();

    // status dot (bottom-right of avatar)
    const dx = ax + ar * 0.72;
    const dy = ay + ar * 0.72;
    ctx.fillStyle = '#101a30';
    ctx.beginPath();
    ctx.arc(dx, dy, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sColor;
    ctx.beginPath();
    ctx.arc(dx, dy, 7, 0, Math.PI * 2);
    ctx.fill();

    // text
    const tx = ax + ar + 20;
    const maxW = x + w - tx - 18;

    const nm = fitText(ctx, String(m.name || 'Member'), maxW, { weight: 700, start: 23, min: 16 });
    setFont(ctx, 700, nm.size);
    ctx.fillStyle = dim ? 'rgba(241,246,252,0.7)' : PALETTE.text;
    ctx.fillText(nm.text, tx, y + 34);

    setFont(ctx, 500, 15);
    ctx.fillStyle = PALETTE.textMute;
    const sub = m.username ? `@${m.username}` : STATUS_LABEL[status];
    const subText = ellipsize(ctx, sub, maxW - 84);
    ctx.fillText(subText, tx, y + 58);

    // tiny status label, right-aligned
    setFont(ctx, 700, 12);
    const sl = STATUS_LABEL[status].toUpperCase();
    const slW = spacedWidth(ctx, sl, 1.2);
    ctx.fillStyle = sColor;
    drawSpaced(ctx, sl, x + w - 18 - slW, y + 58, 1.2);
}
