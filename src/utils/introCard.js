// introCard.js
// Renders the member introduction card (PNG) with @napi-rs/canvas.
// Look: dark cosmic "orbit" card — glass tiles, orbiting rings around the avatar,
// constellation background, and a palette that is picked per member (so every card feels unique).

import { createCanvas } from '@napi-rs/canvas';
import {
    ensureFonts, fetchImage, hashSeed, rng, hexToRgba, roundedRectPath,
    drawCover, drawBlurredCover, setFont, ellipsize, fitText, spacedWidth,
    drawSpaced, drawSparkle,
} from './welcomeCard.js';

export const INTRO_WIDTH = 1100;
export const INTRO_HEIGHT = 560;

export const INTRO_PALETTES = [
    { key: 'nebula',   bg: ['#0a0820', '#1b1050'], a1: '#a78bfa', a2: '#f472b6', gold: '#fcd34d' },
    { key: 'aurora',   bg: ['#04141f', '#0b2f45'], a1: '#2dd4bf', a2: '#818cf8', gold: '#fde68a' },
    { key: 'ember',    bg: ['#1a0a14', '#3b1230'], a1: '#fb7185', a2: '#fbbf24', gold: '#fde68a' },
    { key: 'jade',     bg: ['#04170f', '#0d3a2a'], a1: '#34d399', a2: '#a3e635', gold: '#fef08a' },
    { key: 'sapphire', bg: ['#060b24', '#0f2a6b'], a1: '#60a5fa', a2: '#c084fc', gold: '#fcd34d' },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

export function pickPalette(seed) {
    return INTRO_PALETTES[hashSeed(String(seed ?? 'akasyaa')) % INTRO_PALETTES.length];
}

function formatDate(ts) {
    const d = new Date(ts ?? Date.now());
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Word-wrap that also breaks very long words and ends the last line with "…" when text is cut. */
function wrapLines(ctx, text, maxWidth, maxLines) {
    const tokens = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let line = '';

    for (let word of tokens) {
        while (ctx.measureText(word).width > maxWidth) {
            let cut = word.length;
            while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut--;
            if (line) { lines.push(line); line = ''; }
            lines.push(word.slice(0, cut));
            word = word.slice(cut);
        }
        if (!word) continue;
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth) {
            line = test;
        } else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);

    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
}

/** Half of a tilted orbit ellipse: half "back" (behind the avatar) or "front" (in front of it). */
function drawOrbit(ctx, cx, cy, rx, ry, rot, color, width, half) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (half === 'back') ctx.ellipse(cx, cy, rx, ry, rot, Math.PI, Math.PI * 2);
    else ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
}

function orbitPoint(cx, cy, rx, ry, rot, t) {
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
}

function drawCornerBrackets(ctx, x, y, w, h, len, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const corners = [
        [x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * len);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * len, cy);
        ctx.stroke();
    }
    ctx.restore();
}

function glassPanel(ctx, x, y, w, h, r, accent, strokeAlpha = 0.38) {
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hexToRgba(accent, strokeAlpha);
    ctx.stroke();
    ctx.restore();
}

/**
 * @param {object} o
 * @param {string} o.name          Name typed in the form (shown big)
 * @param {string} [o.handle]      Discord username, shown as @handle
 * @param {string} [o.avatarUrl]
 * @param {string} [o.serverName]  Shown as the wordmark (default "AKASYAA")
 * @param {string|number} [o.age]
 * @param {string} [o.gender]
 * @param {string} [o.origin]
 * @param {string} [o.bio]
 * @param {number} [o.introNumber]  Order in which members introduced themselves
 * @param {string} [o.userId]      Seed for palette + decoration
 * @param {number} [o.timestamp]
 * @returns {Promise<Buffer>} PNG
 */
export async function renderIntroCard(o) {
    ensureFonts();

    const W = INTRO_WIDTH;
    const H = INTRO_HEIGHT;
    const seed = String(o.userId ?? o.name ?? 'akasyaa');
    const pal = pickPalette(seed);
    const { a1, a2, gold } = pal;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const avatar = o.avatarUrl ? await fetchImage(o.avatarUrl).catch(() => null) : null;

    // ── base ──
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, pal.bg[0]);
    base.addColorStop(1, pal.bg[1]);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    if (avatar) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        drawBlurredCover(ctx, avatar, 0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = hexToRgba(pal.bg[0], 0.6);
        ctx.fillRect(0, 0, W, H);
    }

    // ── nebula glows ──
    const glows = [
        [W * 0.92, H * 0.02, 520, a1, 0.40],
        [W * 0.02, H * 1.0, 520, a2, 0.32],
        [W * 0.22, H * 0.52, 330, a1, 0.20],
    ];
    for (const [gx, gy, gr, col, al] of glows) {
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, hexToRgba(col, al));
        g.addColorStop(1, hexToRgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // ── big faint rings behind the avatar ──
    const AX = 214, AY = 298, AR = 104;
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const [rad, al] of [[200, 0.07], [270, 0.05], [345, 0.035]]) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${al})`;
        ctx.beginPath();
        ctx.arc(AX, AY, rad, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();

    // ── stars + constellation (unique per member) ──
    const rand = rng(hashSeed(seed));
    for (let i = 0; i < 110; i++) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + rand() * 0.34})`;
        ctx.arc(rand() * W, rand() * H, 0.7 + rand() * 1.9, 0, Math.PI * 2);
        ctx.fill();
    }
    const pts = Array.from({ length: 9 }, () => [60 + rand() * (W - 120), 40 + rand() * (H - 80)]);
    pts.sort((p, q) => p[0] - q[0]);
    ctx.save();
    ctx.strokeStyle = hexToRgba('#ffffff', 0.10);
    ctx.lineWidth = 1.2;
    for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1];
        const [x2, y2] = pts[i];
        if (Math.hypot(x2 - x1, y2 - y1) > 260) continue;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    ctx.restore();
    for (const [x, y] of pts) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
        drawSparkle(ctx, 470 + rand() * (W - 540), 36 + rand() * 40, 5 + rand() * 8, i % 2 ? a1 : a2, 0.35 + rand() * 0.4);
    }

    // ── outer frame ──
    const fx = 22, fy = 22, fw = W - 44, fh = H - 44;
    ctx.save();
    roundedRectPath(ctx, fx, fy, fw, fh, 38);
    ctx.fillStyle = 'rgba(8, 6, 24, 0.28)';
    ctx.fill();
    const border = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
    border.addColorStop(0, hexToRgba(a1, 0.85));
    border.addColorStop(0.5, 'rgba(255, 255, 255, 0.10)');
    border.addColorStop(1, hexToRgba(a2, 0.85));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.restore();
    drawCornerBrackets(ctx, 44, 44, W - 88, H - 88, 28, hexToRgba(gold, 0.85));

    // ── header ──
    const server = String(o.serverName || 'AKASYAA').toUpperCase().slice(0, 22);
    drawSparkle(ctx, 84, 78, 11, gold, 0.95);
    setFont(ctx, 800, 24);
    const wmWidth = spacedWidth(ctx, server, 8);
    const wm = ctx.createLinearGradient(104, 0, 104 + wmWidth, 0);
    wm.addColorStop(0, a1);
    wm.addColorStop(1, a2);
    ctx.fillStyle = wm;
    drawSpaced(ctx, server, 104, 87, 8);

    setFont(ctx, 700, 14);
    const tag = 'MEMBER INTRODUCTION';
    const tagW = spacedWidth(ctx, tag, 5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    drawSpaced(ctx, tag, W - 76 - tagW, 85, 5);

    const rule = ctx.createLinearGradient(76, 0, W - 76, 0);
    rule.addColorStop(0, hexToRgba(a1, 0.8));
    rule.addColorStop(0.6, hexToRgba('#ffffff', 0.10));
    rule.addColorStop(1, hexToRgba(a2, 0.8));
    ctx.fillStyle = rule;
    ctx.fillRect(76, 108, W - 152, 2);

    // ── avatar + orbits ──
    const orbits = [
        { rx: 160, ry: 58, rot: -0.34, color: hexToRgba(a1, 0.55), dot: a1, t: 0.9 },
        { rx: 148, ry: 52, rot: 0.46, color: hexToRgba(a2, 0.50), dot: a2, t: 4.0 },
    ];
    for (const ob of orbits) drawOrbit(ctx, AX, AY, ob.rx, ob.ry, ob.rot, ob.color, 2, 'back');

    ctx.save();
    ctx.shadowColor = hexToRgba(a1, 0.85);
    ctx.shadowBlur = 50;
    const ring = ctx.createLinearGradient(AX - AR, AY - AR, AX + AR, AY + AR);
    ring.addColorStop(0, a1);
    ring.addColorStop(1, a2);
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = pal.bg[0];
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
        drawCover(ctx, avatar, AX - AR, AY - AR, AR * 2, AR * 2);
    } else {
        const ph = ctx.createLinearGradient(AX - AR, AY - AR, AX + AR, AY + AR);
        ph.addColorStop(0, a1);
        ph.addColorStop(1, a2);
        ctx.fillStyle = ph;
        ctx.fillRect(AX - AR, AY - AR, AR * 2, AR * 2);
        ctx.fillStyle = '#ffffff';
        setFont(ctx, 800, 110);
        ctx.textAlign = 'center';
        ctx.fillText(([...String(o.name || '?')][0] || '?').toUpperCase(), AX, AY + 38);
        ctx.textAlign = 'left';
    }
    ctx.restore();

    for (const ob of orbits) drawOrbit(ctx, AX, AY, ob.rx, ob.ry, ob.rot, ob.color, 2.5, 'front');
    for (const ob of orbits) {
        const [px, py] = orbitPoint(AX, AY, ob.rx, ob.ry, ob.rot, ob.t);
        ctx.save();
        ctx.shadowColor = ob.dot;
        ctx.shadowBlur = 16;
        ctx.fillStyle = ob.dot;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ── member pill ──
    const pillText = o.introNumber ? `INTRO #${Number(o.introNumber).toLocaleString('en-US')}` : 'NEW MEMBER';
    setFont(ctx, 800, 17);
    const pTextW = spacedWidth(ctx, pillText, 3);
    const pW = pTextW + 56;
    const pH = 40;
    const pX = AX - pW / 2;
    const pY = 446;
    ctx.save();
    ctx.shadowColor = hexToRgba(a1, 0.6);
    ctx.shadowBlur = 18;
    roundedRectPath(ctx, pX, pY, pW, pH, pH / 2);
    const pg = ctx.createLinearGradient(pX, 0, pX + pW, 0);
    pg.addColorStop(0, a1);
    pg.addColorStop(1, a2);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = pal.bg[0];
    drawSpaced(ctx, pillText, pX + 28, pY + pH / 2 + 6, 3);

    // ── right column ──
    const RX = 420;
    const RW = W - 76 - RX;

    setFont(ctx, 700, 16);
    ctx.fillStyle = a2;
    drawSpaced(ctx, "HELLO, I'M", RX, 150, 7);

    const name = fitText(ctx, String(o.name || 'Unknown'), RW, { weight: 800, start: 70, min: 36 });
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    setFont(ctx, 800, name.size);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name.text, RX, 222);
    ctx.restore();

    if (o.handle) {
        setFont(ctx, 500, 22);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillText(ellipsize(ctx, `@${o.handle}`, RW), RX, 258);
    }

    // info tiles
    const tiles = [
        ['UMUR', o.age ? `${o.age} tahun` : '-'],
        ['GENDER', o.gender || '-'],
        ['ASAL', o.origin || '-'],
    ];
    const gap = 16;
    const tw = (RW - gap * 2) / 3;
    const ty = 282, th = 82;
    tiles.forEach(([label, value], i) => {
        const tx = RX + i * (tw + gap);
        glassPanel(ctx, tx, ty, tw, th, 20, a1);

        const bar = ctx.createLinearGradient(0, ty + 18, 0, ty + th - 18);
        bar.addColorStop(0, a1);
        bar.addColorStop(1, a2);
        ctx.fillStyle = bar;
        roundedRectPath(ctx, tx + 16, ty + 18, 4, th - 36, 2);
        ctx.fill();

        setFont(ctx, 700, 12);
        ctx.fillStyle = hexToRgba(a1, 0.95);
        drawSpaced(ctx, label, tx + 32, ty + 30, 3.5);

        const val = fitText(ctx, String(value), tw - 52, { weight: 700, start: 27, min: 16 });
        setFont(ctx, 700, val.size);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(val.text, tx + 32, ty + 62);
    });

    // bio
    const by = 382, bh = 112;
    glassPanel(ctx, RX, by, RW, bh, 24, a2, 0.34);

    const qg = ctx.createLinearGradient(RX, by, RX + 60, by + 80);
    qg.addColorStop(0, a1);
    qg.addColorStop(1, a2);
    ctx.fillStyle = qg;
    setFont(ctx, 800, 92);
    ctx.fillText('\u201C', RX + 20, by + 82);

    setFont(ctx, 500, 23);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
    const bioText = o.bio ? String(o.bio) : '-';
    const lines = wrapLines(ctx, bioText, RW - 96 - 28, 3);
    const lineH = 30;
    const startY = by + (bh - lines.length * lineH) / 2 + 22;
    lines.forEach((l, i) => ctx.fillText(l, RX + 84, startY + i * lineH));

    // ── footer ──
    setFont(ctx, 700, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    drawSpaced(ctx, `${server} \u2022 OFFICIAL INTRODUCTION`, 76, 523, 4);

    // barcode (seeded by user id) + date
    const barRand = rng(hashSeed(`bar:${seed}`));
    const bars = 26;
    const bx0 = W - 76 - bars * 4.5;
    ctx.fillStyle = hexToRgba(gold, 0.8);
    for (let i = 0; i < bars; i++) {
        const w = 1.5 + barRand() * 2;
        ctx.fillRect(bx0 + i * 4.5, 509, w, 16);
    }
    const dateText = formatDate(o.timestamp);
    setFont(ctx, 700, 12);
    const dW = spacedWidth(ctx, dateText, 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    drawSpaced(ctx, dateText, bx0 - 18 - dW, 523, 3);

    return canvas.encode('png');
}
