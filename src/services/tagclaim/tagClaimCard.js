// tagClaimCard.js
// Kartu canvas untuk sistem Tag Claim: panel claim, hasil claim/cek, dan kartu log.
// Sengaja tidak meng-import apa pun dari bot supaya bisa dirender/diuji sendiri.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

// ───────────────────────── palet (biru kalem, bukan biru terang) ─────────────────────────
export const PALETTE = {
    bgFrom: '#12161f',
    bgTo: '#1b2231',
    surface: '#202839',
    surfaceHi: '#27314a',
    border: 'rgba(143, 170, 214, 0.16)',
    accent: '#7ba3dc',
    accentSoft: '#9db9e2',
    accentDeep: '#4f78b5',
    text: '#e9eef6',
    muted: '#94a1b7',
    ok: '#78c8aa',
    bad: '#d98d96',
    warn: '#d9b47a',
};

const FONT_FAMILY = 'JupiterInter';
const FONT = `"${FONT_FAMILY}", "Inter", "Segoe UI", "DejaVu Sans", Arial, sans-serif`;
const FONT_DIR = fileURLToPath(new URL('../../../assets/fonts/', import.meta.url));

let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return;
    fontsReady = true;
    try {
        if (!fs.existsSync(FONT_DIR)) return;
        for (const file of fs.readdirSync(FONT_DIR)) {
            if (/\.(ttf|otf)$/i.test(file)) GlobalFonts.registerFromPath(`${FONT_DIR}${file}`, FONT_FAMILY);
        }
    } catch {
        // font opsional, fallback ke font sistem
    }
}

// ───────────────────────── helper gambar ─────────────────────────

function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function fitText(ctx, text, maxWidth, size, weight = 700) {
    let px = size;
    ctx.font = `${weight} ${px}px ${FONT}`;
    while (ctx.measureText(text).width > maxWidth && px > 12) {
        px -= 1;
        ctx.font = `${weight} ${px}px ${FONT}`;
    }
    if (ctx.measureText(text).width > maxWidth) {
        let t = text;
        while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
        return `${t}…`;
    }
    return text;
}

async function loadAvatar(source) {
    if (!source) return null;
    try {
        if (Buffer.isBuffer(source)) return await loadImage(source);
        const res = await fetch(source, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        return await loadImage(Buffer.from(await res.arrayBuffer()));
    } catch {
        return null;
    }
}

function drawBackground(ctx, W, H, accent = PALETTE.accent) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, PALETTE.bgFrom);
    bg.addColorStop(1, PALETTE.bgTo);
    roundedRect(ctx, 0, 0, W, H, 26);
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.save();
    roundedRect(ctx, 0, 0, W, H, 26);
    ctx.clip();

    const glow = ctx.createRadialGradient(W - 60, -20, 10, W - 60, -20, W * 0.55);
    glow.addColorStop(0, `${accent}40`);
    glow.addColorStop(1, `${accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const glow2 = ctx.createRadialGradient(0, H + 30, 10, 0, H + 30, W * 0.45);
    glow2.addColorStop(0, `${PALETTE.accentDeep}30`);
    glow2.addColorStop(1, `${PALETTE.accentDeep}00`);
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    roundedRect(ctx, 1, 1, W - 2, H - 2, 25);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.border;
    ctx.stroke();
}

function drawAvatar(ctx, image, cx, cy, r, ring, initial = '?') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (image) {
        ctx.drawImage(image, cx - r, cy - r, r * 2, r * 2);
    } else {
        const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        g.addColorStop(0, PALETTE.surfaceHi);
        g.addColorStop(1, PALETTE.accentDeep);
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = PALETTE.text;
        ctx.font = `700 ${Math.round(r * 0.9)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(initial).slice(0, 1).toUpperCase(), cx, cy + 2);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';
}

function drawChip(ctx, x, y, text, { color = PALETTE.accent, size = 17, padX = 14, h = 34, filled = true } = {}) {
    ctx.font = `700 ${size}px ${FONT}`;
    const w = Math.ceil(ctx.measureText(text).width + padX * 2);
    roundedRect(ctx, x, y, w, h, h / 2);
    if (filled) {
        ctx.fillStyle = `${color}26`;
        ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `${color}88`;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padX, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    return w;
}

function drawStatusDot(ctx, cx, cy, ok) {
    const color = ok ? PALETTE.ok : PALETTE.bad;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = `${color}26`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (ok) {
        ctx.moveTo(cx - 6, cy + 0.5);
        ctx.lineTo(cx - 1.5, cy + 5);
        ctx.lineTo(cx + 7, cy - 5);
    } else {
        ctx.moveTo(cx - 5.5, cy - 5.5);
        ctx.lineTo(cx + 5.5, cy + 5.5);
        ctx.moveTo(cx + 5.5, cy - 5.5);
        ctx.lineTo(cx - 5.5, cy + 5.5);
    }
    ctx.stroke();
}

function drawTagBadge(ctx, x, y, tagText) {
    // lencana kecil yang meniru "server tag" di samping nama
    const text = String(tagText || 'TAG').slice(0, 4).toUpperCase();
    ctx.font = `800 15px ${FONT}`;
    const w = Math.ceil(ctx.measureText(text).width + 20);
    roundedRect(ctx, x, y, w, 26, 8);
    const g = ctx.createLinearGradient(x, y, x + w, y + 26);
    g.addColorStop(0, PALETTE.accentDeep);
    g.addColorStop(1, PALETTE.accent);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = '#0f1420';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 10, y + 14);
    ctx.textBaseline = 'alphabetic';
    return w;
}

// ───────────────────────── 1. panel claim ─────────────────────────

export const MODE_LABELS = {
    both: 'Tag server + link server',
    either: 'Tag server ATAU link server',
    tag: 'Tag server saja',
    link: 'Link server saja',
};

/**
 * @param {object} p
 * @param {string} p.serverName
 * @param {string} p.roleName
 * @param {string} p.mode        both | either | tag | link
 * @param {string} [p.link]      kode/link server yang harus ada di status
 * @param {string} [p.tagText]   teks tag server (mis. JPTR)
 * @param {string|Buffer} [p.iconUrl]
 */
export async function renderClaimPanel({ serverName, roleName, mode = 'both', link = null, tagText = 'TAG', iconUrl = null }) {
    ensureFonts();
    const W = 1024;
    const H = 380;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    drawBackground(ctx, W, H);

    const icon = await loadAvatar(iconUrl);
    drawAvatar(ctx, icon, 100, 100, 46, PALETTE.accent, serverName);

    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.accentSoft;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText('KLAIM ROLE', 170, 80);

    ctx.fillStyle = PALETTE.text;
    const title = fitText(ctx, serverName, W - 170 - 50, 40, 800);
    ctx.fillText(title, 170, 124);

    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 19px ${FONT}`;
    ctx.fillText('Pasang tag server dan link server, lalu klaim role eksklusifmu.', 50, 188);

    // dua kartu syarat
    const cardY = 214;
    const cardH = 96;
    const gap = 18;
    const cardW = (W - 100 - gap) / 2;
    const needTag = mode === 'both' || mode === 'tag' || mode === 'either';
    const needLink = mode === 'both' || mode === 'link' || mode === 'either';

    const reqs = [
        { show: needTag, title: 'Tag server', desc: 'Aktifkan tag server ini di profilmu', badge: true },
        { show: needLink, title: 'Link di status', desc: link ? `Tulis ${link} di custom status` : 'Tulis link server di custom status', badge: false },
    ].filter(r => r.show);

    reqs.forEach((req, i) => {
        const x = reqs.length === 1 ? 50 : 50 + i * (cardW + gap);
        const w = reqs.length === 1 ? W - 100 : cardW;
        roundedRect(ctx, x, cardY, w, cardH, 18);
        ctx.fillStyle = PALETTE.surface;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = PALETTE.border;
        ctx.stroke();

        ctx.fillStyle = PALETTE.accentSoft;
        ctx.font = `700 15px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(`SYARAT ${i + 1}`, x + 22, cardY + 32);

        ctx.fillStyle = PALETTE.text;
        ctx.font = `700 24px ${FONT}`;
        ctx.fillText(req.title, x + 22, cardY + 62);
        if (req.badge) drawTagBadge(ctx, x + 22 + ctx.measureText(req.title).width + 14, cardY + 41, tagText);

        ctx.fillStyle = PALETTE.muted;
        ctx.font = `500 15px ${FONT}`;
        ctx.fillText(fitText(ctx, req.desc, w - 44, 15, 500), x + 22, cardY + 84);
    });

    // footer
    const fy = 338;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText('Mode:', 50, fy + 5);
    drawChip(ctx, 104, fy - 17, MODE_LABELS[mode] || MODE_LABELS.both, { color: PALETTE.accent, size: 15, h: 30 });

    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText('Hadiah', W - 50 - 12 - (ctx.measureText(`@${roleName}`).width + 28), fy + 5);
    ctx.textAlign = 'left';
    drawChip(ctx, W - 50 - (ctx.measureText(`@${roleName}`).width + 28), fy - 17, `@${roleName}`, { color: PALETTE.ok, size: 15, h: 30 });

    return canvas.toBuffer('image/png');
}

// ───────────────────────── 2. hasil claim / cek ─────────────────────────

/**
 * @param {object} p
 * @param {'claimed'|'already'|'failed'|'check'} p.status
 * @param {string} p.username
 * @param {string|Buffer} [p.avatarUrl]
 * @param {string} p.roleName
 * @param {string} p.mode
 * @param {{tag:boolean, link:boolean, linkKnown?:boolean}} p.checks
 * @param {string} [p.tagText]
 * @param {string} [p.linkHint]
 */
export async function renderClaimResult({ status, username, avatarUrl = null, roleName, mode = 'both', checks, tagText = 'TAG', linkHint = null }) {
    ensureFonts();
    const W = 940;
    const rowCount = (mode !== 'link' ? 1 : 0) + (mode !== 'tag' ? 1 : 0);
    const success = status === 'claimed' || status === 'already';
    const startY = success ? 232 : 176;
    const H = startY + rowCount * 46 + 20;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const tone = status === 'claimed' || status === 'already' ? PALETTE.ok : status === 'failed' ? PALETTE.bad : PALETTE.accent;
    drawBackground(ctx, W, H, tone === PALETTE.accent ? PALETTE.accent : PALETTE.accentSoft);

    const avatar = await loadAvatar(avatarUrl);
    drawAvatar(ctx, avatar, 100, 100, 54, tone, username);

    const headline = {
        claimed: 'Role berhasil diklaim',
        already: 'Role sudah kamu miliki',
        failed: 'Syarat belum terpenuhi',
        check: 'Status syaratmu',
    }[status];

    ctx.textAlign = 'left';
    ctx.fillStyle = tone;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(headline.toUpperCase(), 180, 70);

    ctx.fillStyle = PALETTE.text;
    const name = fitText(ctx, username, W - 180 - 50, 38, 800);
    ctx.fillText(name, 180, 114);

    if (status === 'claimed' || status === 'already') {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `500 18px ${FONT}`;
        ctx.fillText('Role kamu aktif selama tag dan link masih terpasang.', 180, 144);
        drawChip(ctx, 180, 160, `@${roleName}`, { color: PALETTE.ok, size: 16, h: 32 });
    } else {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `500 18px ${FONT}`;
        ctx.fillText(`Hadiah: @${roleName}  ·  ${MODE_LABELS[mode] || ''}`, 180, 144);
    }

    // baris checklist
    const rows = [];
    if (mode !== 'link') rows.push({ label: 'Tag server aktif', ok: checks.tag, extra: checks.tag ? tagText : null });
    if (mode !== 'tag') {
        const unknown = checks.linkKnown === false && !checks.link;
        rows.push({
            label: 'Link server di custom status',
            ok: checks.link,
            note: unknown ? 'Status tidak terbaca. Pastikan kamu tidak Invisible.' : (!checks.link && linkHint ? `Tulis ${linkHint}` : null),
        });
    }

    const rowH = 46;
    rows.forEach((row, i) => {
        const y = startY + i * rowH;
        const x = 50;
        roundedRect(ctx, x, y, W - 100, 38, 12);
        ctx.fillStyle = PALETTE.surface;
        ctx.fill();
        drawStatusDot(ctx, x + 26, y + 19, row.ok);

        ctx.fillStyle = PALETTE.text;
        ctx.font = `600 18px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(row.label, x + 54, y + 25);

        ctx.textAlign = 'right';
        if (row.extra) {
            ctx.font = `800 15px ${FONT}`;
            const w = ctx.measureText(String(row.extra).slice(0, 4).toUpperCase()).width + 20;
            drawTagBadge(ctx, W - 50 - 16 - w, y + 6, row.extra);
        } else if (row.note) {
            ctx.fillStyle = row.ok ? PALETTE.muted : PALETTE.warn;
            ctx.font = `500 15px ${FONT}`;
            ctx.fillText(fitText(ctx, row.note, 380, 15, 500), W - 50 - 16, y + 25);
        } else {
            ctx.fillStyle = row.ok ? PALETTE.ok : PALETTE.bad;
            ctx.font = `700 15px ${FONT}`;
            ctx.fillText(row.ok ? 'TERPASANG' : 'BELUM', W - 50 - 16, y + 25);
        }
        ctx.textAlign = 'left';
    });

    return canvas.toBuffer('image/png');
}

// ───────────────────────── 3. kartu log ─────────────────────────

export const LOG_KINDS = {
    tag_add: { title: 'Tag dipasang', tone: PALETTE.accent, sign: '+' },
    tag_remove: { title: 'Tag dilepas', tone: PALETTE.bad, sign: '−' },
    link_add: { title: 'Link dipasang', tone: PALETTE.accent, sign: '+' },
    link_remove: { title: 'Link dilepas', tone: PALETTE.bad, sign: '−' },
    claim: { title: 'Role diklaim', tone: PALETTE.ok, sign: '✓' },
    role_remove: { title: 'Role dicabut', tone: PALETTE.warn, sign: '!' },
};

/**
 * @param {object} p
 * @param {keyof typeof LOG_KINDS} p.kind
 * @param {string} p.username
 * @param {string} p.userId
 * @param {string|Buffer} [p.avatarUrl]
 * @param {string} [p.detail]       baris detail, mis. "Link: discord.gg/jupiter"
 * @param {string} [p.roleLine]     mis. "Role @Supporter dicabut otomatis"
 * @param {string} [p.tagText]
 * @param {Date} [p.at]
 */
export async function renderLogCard({ kind, username, userId, avatarUrl = null, detail = null, roleLine = null, tagText = null, at = new Date() }) {
    ensureFonts();
    const meta = LOG_KINDS[kind] || LOG_KINDS.tag_add;
    const W = 900;
    const H = roleLine ? 214 : 176;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    drawBackground(ctx, W, H, meta.tone);

    // strip warna di kiri
    ctx.save();
    roundedRect(ctx, 0, 0, W, H, 26);
    ctx.clip();
    ctx.fillStyle = meta.tone;
    ctx.fillRect(0, 0, 8, H);
    ctx.restore();

    const avatar = await loadAvatar(avatarUrl);
    drawAvatar(ctx, avatar, 88, 88, 40, meta.tone, username);

    ctx.textAlign = 'left';
    ctx.fillStyle = meta.tone;
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(meta.title.toUpperCase(), 152, 54);

    ctx.fillStyle = PALETTE.text;
    const nameText = fitText(ctx, username, 470, 32, 800);
    ctx.fillText(nameText, 152, 94);
    const nameW = ctx.measureText(nameText).width;
    if (tagText && (kind === 'tag_add' || kind === 'tag_remove' || kind === 'claim')) {
        drawTagBadge(ctx, 152 + nameW + 12, 70, tagText);
    }

    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(detail ? fitText(ctx, detail, 560, 16, 500) : `ID ${userId}`, 152, 126);

    // lingkaran tanda di kanan
    const cx = W - 80;
    const cy = 78;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fillStyle = `${meta.tone}22`;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = meta.tone;
    ctx.stroke();
    ctx.fillStyle = meta.tone;
    ctx.font = `800 36px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.sign, cx, cy + 2);
    ctx.textBaseline = 'alphabetic';

    // waktu
    const stamp = new Intl.DateTimeFormat('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
    }).format(at);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText(`${stamp} WIB`, W - 40, 150);

    if (roleLine) {
        roundedRect(ctx, 152, 146, 440, 40, 12);
        ctx.fillStyle = PALETTE.surface;
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = PALETTE.text;
        ctx.font = `600 16px ${FONT}`;
        ctx.fillText(fitText(ctx, roleLine, 410, 16, 600), 168, 172);
    }

    return canvas.toBuffer('image/png');
}
