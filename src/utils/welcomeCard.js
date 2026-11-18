// welcomeCard.js
// Renders the welcome / goodbye banner (PNG) with @napi-rs/canvas.
// Intentionally free of bot-internal imports so it can be tested on its own.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

export const CARD_WIDTH = 1024;
export const CARD_HEIGHT = 400;

export const CARD_THEMES = {
    aurora:   { label: 'Aurora',   accent: ['#8b6cff', '#22d3ee'], bg: ['#0a0e2a', '#1c1458'] },
    sunset:   { label: 'Sunset',   accent: ['#ff5f6d', '#ffc371'], bg: ['#1a0b16', '#34102e'] },
    emerald:  { label: 'Emerald',  accent: ['#10e6a0', '#38bdf8'], bg: ['#041c1a', '#0a3a33'] },
    rose:     { label: 'Rose',     accent: ['#ff4fa3', '#ffa6d8'], bg: ['#1f0a1c', '#3d1038'] },
    ocean:    { label: 'Ocean',    accent: ['#3b82f6', '#22d3ee'], bg: ['#06122a', '#0b2d52'] },
    midnight: { label: 'Midnight', accent: ['#e5e7eb', '#9ca3af'], bg: ['#09090d', '#1a1a22'] },
};

export function resolveTheme(name, fallback = 'aurora') {
    const key = String(name || '').trim().toLowerCase();
    return CARD_THEMES[key] ? key : fallback;
}

const FONT_FAMILY = 'JupiterInter';
const FONT_STACK = `"${FONT_FAMILY}", "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));

let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return;
    fontsReady = true;
    try {
        if (!fs.existsSync(FONT_DIR)) return;
        // Register each bundled weight under a single family; weight is picked from the file name.
        for (const file of fs.readdirSync(FONT_DIR)) {
            if (!/\.(ttf|otf)$/i.test(file)) continue;
            GlobalFonts.registerFromPath(`${FONT_DIR}${file}`, FONT_FAMILY);
        }
    } catch {
        // Fonts are optional: system fonts will be used instead.
    }
}

// ───────────────────────── image helpers ─────────────────────────

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const bgCache = new Map(); // url -> { image, at }
const BG_TTL_MS = 10 * 60 * 1000;

async function fetchImage(url, timeoutMs = 6000) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Unsupported image protocol');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(parsed, { signal: controller.signal });
        if (!res.ok) throw new Error(`Image request failed (${res.status})`);
        const declared = Number(res.headers.get('content-length') || 0);
        if (declared > MAX_IMAGE_BYTES) throw new Error('Image too large');
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_IMAGE_BYTES) throw new Error('Image too large');
        return await loadImage(buf);
    } finally {
        clearTimeout(timer);
    }
}

async function loadBackground(url) {
    const hit = bgCache.get(url);
    if (hit && Date.now() - hit.at < BG_TTL_MS) return hit.image;
    const image = await fetchImage(url);
    bgCache.set(url, { image, at: Date.now() });
    if (bgCache.size > 20) bgCache.delete(bgCache.keys().next().value);
    return image;
}

// ───────────────────────── drawing helpers ─────────────────────────

function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hexToRgba(hex, alpha = 1) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundedRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Cheap, filter-free blur: shrink the image heavily then stretch it back up with smoothing.
function drawBlurredCover(ctx, img, x, y, w, h, strength = 28) {
    const small = createCanvas(strength, Math.max(1, Math.round(strength * (h / w))));
    const sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    drawCover(sctx, img, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, x, y, w, h);
}

function setFont(ctx, weight, size) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
}

function ellipsize(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
}

function fitText(ctx, text, maxWidth, { weight = 800, start = 64, min = 34 } = {}) {
    let size = start;
    setFont(ctx, weight, size);
    while (size > min && ctx.measureText(text).width > maxWidth) {
        size -= 2;
        setFont(ctx, weight, size);
    }
    return { text: ellipsize(ctx, text, maxWidth), size };
}

function spacedWidth(ctx, text, spacing) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return w - spacing;
}

function drawSpaced(ctx, text, x, y, spacing) {
    let cx = x;
    for (const ch of text) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + spacing;
    }
}

function drawSparkle(ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
}

// ───────────────────────── main renderer ─────────────────────────

/**
 * @param {object} o
 * @param {'welcome'|'goodbye'} o.kind
 * @param {string} o.username        Name shown big in the card
 * @param {string} [o.avatarUrl]     PNG/JPG avatar URL
 * @param {string} [o.title]         Small label, e.g. "WELCOME"
 * @param {string} [o.subtitle]      Line under the name
 * @param {string[]} [o.chips]       Up to 3 small pills (e.g. "MEMBER #1,024")
 * @param {string} [o.theme]         Key of CARD_THEMES
 * @param {string} [o.backgroundUrl] Optional custom background image
 * @param {string} [o.seed]          Seed for the decorative particles (user id)
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function renderGreetCard(o) {
    ensureFonts();

    const kind = o.kind === 'goodbye' ? 'goodbye' : 'welcome';
    const themeKey = resolveTheme(o.theme, kind === 'goodbye' ? 'sunset' : 'aurora');
    const theme = CARD_THEMES[themeKey];
    const [a1, a2] = theme.accent;
    const W = CARD_WIDTH;
    const H = CARD_HEIGHT;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';

    // Assets are loaded in parallel; each one is allowed to fail on its own.
    const [avatar, background] = await Promise.all([
        o.avatarUrl ? fetchImage(o.avatarUrl).catch(() => null) : null,
        o.backgroundUrl ? loadBackground(o.backgroundUrl).catch(() => null) : null,
    ]);

    // ── base gradient ──
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, theme.bg[0]);
    base.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // ── background layer (custom image, or a blurred copy of the avatar) ──
    if (background) {
        drawCover(ctx, background, 0, 0, W, H);
        const veil = ctx.createLinearGradient(0, 0, W, 0);
        veil.addColorStop(0, 'rgba(6, 8, 20, 0.80)');
        veil.addColorStop(1, 'rgba(6, 8, 20, 0.55)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, W, H);
    } else if (avatar) {
        ctx.save();
        ctx.globalAlpha = 0.30;
        drawBlurredCover(ctx, avatar, 0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = hexToRgba(theme.bg[0], 0.55);
        ctx.fillRect(0, 0, W, H);
    }

    // ── colour glows ──
    const glowA = ctx.createRadialGradient(W * 0.88, H * 0.05, 0, W * 0.88, H * 0.05, 420);
    glowA.addColorStop(0, hexToRgba(a1, 0.42));
    glowA.addColorStop(1, hexToRgba(a1, 0));
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, W, H);

    const glowB = ctx.createRadialGradient(W * 0.08, H * 1.0, 0, W * 0.08, H * 1.0, 460);
    glowB.addColorStop(0, hexToRgba(a2, 0.34));
    glowB.addColorStop(1, hexToRgba(a2, 0));
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, W, H);

    // ── diagonal light streaks ──
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (const [sx, sw] of [[560, 46], [650, 18], [720, 90]]) {
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + sw, 0);
        ctx.lineTo(sx + sw - 220, H);
        ctx.lineTo(sx - 220, H);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // ── particles (unique per user) ──
    const rand = rng(hashSeed(String(o.seed ?? o.username ?? 'jupiter')));
    for (let i = 0; i < 70; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = 0.8 + rand() * 2.2;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + rand() * 0.35})`;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // Sparkles stay in the top strip and the right edge so they never sit on text or chips.
    for (let i = 0; i < 7; i++) {
        const topStrip = i % 2 === 0;
        const sx = topStrip ? 380 + rand() * (W - 440) : 850 + rand() * (W - 890);
        const sy = topStrip ? 40 + rand() * 50 : 40 + rand() * (H - 80);
        drawSparkle(ctx, sx, sy, 5 + rand() * 9, i % 2 ? a1 : a2, 0.35 + rand() * 0.4);
    }

    // ── glass panel ──
    const px = 26, py = 26, pw = W - 52, ph = H - 52;
    ctx.save();
    roundedRectPath(ctx, px, py, pw, ph, 32);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
    ctx.fill();
    const border = ctx.createLinearGradient(px, py, px + pw, py + ph);
    border.addColorStop(0, hexToRgba(a1, 0.75));
    border.addColorStop(0.5, 'rgba(255, 255, 255, 0.10)');
    border.addColorStop(1, hexToRgba(a2, 0.75));
    ctx.lineWidth = 2;
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.restore();

    // ── avatar with glow ring ──
    const ax = 196, ay = H / 2, ar = 108;
    ctx.save();
    ctx.shadowColor = hexToRgba(a1, 0.85);
    ctx.shadowBlur = 46;
    const ring = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar);
    ring.addColorStop(0, a1);
    ring.addColorStop(1, a2);
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = theme.bg[0];
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
        drawCover(ctx, avatar, ax - ar, ay - ar, ar * 2, ar * 2);
    } else {
        const ph2 = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar);
        ph2.addColorStop(0, a1);
        ph2.addColorStop(1, a2);
        ctx.fillStyle = ph2;
        ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
        ctx.fillStyle = '#ffffff';
        setFont(ctx, 800, 110);
        ctx.textAlign = 'center';
        ctx.fillText(([...String(o.username || '?')][0] || '?').toUpperCase(), ax, ay + 38);
        ctx.textAlign = 'left';
    }
    ctx.restore();

    // ── badge on avatar (plus for welcome, wave-minus for goodbye) ──
    const bx = ax + ar * 0.74, by = ay + ar * 0.74, br = 25;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = theme.bg[0];
    ctx.beginPath();
    ctx.arc(bx, by, br + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const badge = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
    badge.addColorStop(0, a1);
    badge.addColorStop(1, a2);
    ctx.fillStyle = badge;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = themeKey === 'midnight' ? '#111118' : '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'welcome') {
        ctx.moveTo(bx - 10, by); ctx.lineTo(bx + 10, by);
        ctx.moveTo(bx, by - 10); ctx.lineTo(bx, by + 10);
    } else {
        ctx.moveTo(bx - 10, by + 1);
        ctx.bezierCurveTo(bx - 5, by - 8, bx, by + 8, bx + 10, by - 2);
    }
    ctx.stroke();

    // ── text column ──
    const tx = 360;
    const maxW = W - tx - 76;

    // label
    const label = String(o.title || (kind === 'goodbye' ? 'GOODBYE' : 'WELCOME')).toUpperCase().slice(0, 28);
    setFont(ctx, 800, 22);
    const labelGrad = ctx.createLinearGradient(tx, 0, tx + Math.min(maxW, spacedWidth(ctx, label, 7)), 0);
    labelGrad.addColorStop(0, a1);
    labelGrad.addColorStop(1, a2);
    ctx.fillStyle = labelGrad;
    drawSpaced(ctx, label, tx, 118, 7);

    // username
    const fitted = fitText(ctx, String(o.username || 'Unknown'), maxW, { weight: 800, start: 66, min: 34 });
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    setFont(ctx, 800, fitted.size);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitted.text, tx, 190);
    ctx.restore();

    // divider
    const div = ctx.createLinearGradient(tx, 0, tx + maxW, 0);
    div.addColorStop(0, hexToRgba(a1, 0.95));
    div.addColorStop(1, hexToRgba(a2, 0));
    ctx.fillStyle = div;
    roundedRectPath(ctx, tx, 213, maxW, 4, 2);
    ctx.fill();

    // subtitle
    if (o.subtitle) {
        setFont(ctx, 600, 28);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.fillText(ellipsize(ctx, String(o.subtitle), maxW), tx, 262);
    }

    // chips
    const chips = (o.chips || []).filter(Boolean).slice(0, 3).map(c => String(c).toUpperCase());
    if (chips.length) {
        let cx = tx;
        const cy = 292, chH = 46;
        for (const text of chips) {
            setFont(ctx, 700, 19);
            const tw = spacedWidth(ctx, text, 1.5);
            const cw = tw + 54;
            if (cx + cw > tx + maxW + 20) break;

            roundedRectPath(ctx, cx, cy, cw, chH, chH / 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = hexToRgba(a1, 0.55);
            ctx.stroke();

            ctx.fillStyle = a2;
            ctx.beginPath();
            ctx.arc(cx + 23, cy + chH / 2, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            drawSpaced(ctx, text, cx + 38, cy + chH / 2 + 7, 1.5);
            cx += cw + 14;
        }
    }

    return canvas.encode('png');
}
