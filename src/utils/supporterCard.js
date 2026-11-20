// supporterCard.js
// Renders the supporter role log & preview card (PNG) with @napi-rs/canvas.
// Soft slate & steel blue palette (kalem, tidak terlalu biru).

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

export const SUPPORTER_CARD_WIDTH = 1024;
export const SUPPORTER_CARD_HEIGHT = 380;

const PALETTE = {
    bgStart: '#0c1626',
    bgEnd: '#182b47',
    accentMain: '#74a9db',   // Soft Steel Blue
    accentSoft: '#a5ccf0',   // Pale Ice Blue
    badgeClaim: '#5c9cd6',   // Muted Cerulean (Pasang)
    badgeRemove: '#d9777f',  // Soft Coral-Rose (Lepas)
};

/**
 * @param {object} opts
 * @param {'claimed'|'removed'|'preview'} opts.action
 * @param {string} opts.username
 * @param {string} [opts.userTag]
 * @param {string} [opts.avatarUrl]
 * @param {string} [opts.roleName]
 * @param {string} [opts.serverTag]
 * @param {string} [opts.reason]
 * @param {string} [opts.guildName]
 * @param {string} [opts.seed]
 * @returns {Promise<Buffer>}
 */
export async function renderSupporterCard(opts) {
    ensureFonts();

    const W = SUPPORTER_CARD_WIDTH;
    const H = SUPPORTER_CARD_HEIGHT;
    const action = opts.action || 'claimed';
    const isRemoved = action === 'removed';

    const statusColor = isRemoved ? PALETTE.badgeRemove : PALETTE.badgeClaim;
    const headerLabel =
        action === 'preview'
            ? 'SUPPORTER REWARD PREVIEW'
            : isRemoved
              ? 'SUPPORTER ROLE REMOVED'
              : 'SUPPORTER ROLE CLAIMED';

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const avatar = opts.avatarUrl ? await fetchImage(opts.avatarUrl).catch(() => null) : null;

    // 1. Base Gradient (Soft Slate Navy)
    const baseGrad = ctx.createLinearGradient(0, 0, W, H);
    baseGrad.addColorStop(0, PALETTE.bgStart);
    baseGrad.addColorStop(1, PALETTE.bgEnd);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Subtle Blurred Avatar Backdrop
    if (avatar) {
        ctx.save();
        ctx.globalAlpha = 0.16;
        drawBlurredCover(ctx, avatar, 0, 0, W, H, 32);
        ctx.restore();
        ctx.fillStyle = hexToRgba(PALETTE.bgStart, 0.65);
        ctx.fillRect(0, 0, W, H);
    }

    // 3. Soft Ambient Glow
    const glowTopRight = ctx.createRadialGradient(W * 0.86, H * 0.12, 0, W * 0.86, H * 0.12, 390);
    glowTopRight.addColorStop(0, hexToRgba(PALETTE.accentMain, 0.26));
    glowTopRight.addColorStop(1, hexToRgba(PALETTE.accentMain, 0));
    ctx.fillStyle = glowTopRight;
    ctx.fillRect(0, 0, W, H);

    const glowBottomLeft = ctx.createRadialGradient(W * 0.14, H * 0.92, 0, W * 0.14, H * 0.92, 360);
    glowBottomLeft.addColorStop(0, hexToRgba(statusColor, 0.20));
    glowBottomLeft.addColorStop(1, hexToRgba(statusColor, 0));
    ctx.fillStyle = glowBottomLeft;
    ctx.fillRect(0, 0, W, H);

    // 4. Subtle Stars & Sparkles
    const rand = rng(hashSeed(String(opts.seed || opts.username || 'supporter')));
    for (let i = 0; i < 45; i++) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(210, 230, 250, ${0.06 + rand() * 0.22})`;
        ctx.arc(rand() * W, rand() * H, 0.8 + rand() * 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    drawSparkle(ctx, W - 95, 68, 9, PALETTE.accentSoft, 0.65);
    drawSparkle(ctx, W - 135, 92, 5, PALETTE.accentMain, 0.45);

    // 5. Glassmorphism Outer Frame
    const pad = 20;
    ctx.save();
    roundedRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fill();
    ctx.lineWidth = 1.8;
    const borderGrad = ctx.createLinearGradient(pad, pad, W - pad, H - pad);
    borderGrad.addColorStop(0, hexToRgba(PALETTE.accentSoft, 0.55));
    borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
    borderGrad.addColorStop(1, hexToRgba(statusColor, 0.65));
    ctx.strokeStyle = borderGrad;
    ctx.stroke();
    ctx.restore();

    // 6. Avatar Circle & Rings
    const ax = 175;
    const ay = H / 2;
    const ar = 88;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 10, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(PALETTE.accentMain, 0.30);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ax, ay, ar + 4, 0, Math.PI * 2);
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 3.5;
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
        setFont(ctx, 800, 56);
        ctx.fillStyle = '#dcebfa';
        ctx.textAlign = 'center';
        ctx.fillText(String(opts.username || '?')[0].toUpperCase(), ax, ay + 20);
        ctx.textAlign = 'left';
    }
    ctx.restore();

    // 7. Status Badge (+ / -)
    const bx = ax + ar * 0.72;
    const by = ay + ar * 0.72;
    const br = 21;
    ctx.save();
    ctx.fillStyle = PALETTE.bgStart;
    ctx.beginPath();
    ctx.arc(bx, by, br + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - 8, by);
    ctx.lineTo(bx + 8, by);
    if (!isRemoved) {
        ctx.moveTo(bx, by - 8);
        ctx.lineTo(bx, by + 8);
    }
    ctx.stroke();
    ctx.restore();

    // 8. Right Text Column
    const tx = 315;
    const maxW = W - tx - 56;

    setFont(ctx, 800, 17);
    ctx.fillStyle = statusColor;
    drawSpaced(ctx, headerLabel, tx, 86, 4.5);

    const fittedName = fitText(ctx, String(opts.username || 'Member'), maxW, {
        weight: 800,
        start: 48,
        min: 28,
    });
    setFont(ctx, 800, fittedName.size);
    ctx.fillStyle = '#f0f6fc';
    ctx.fillText(fittedName.text, tx, 146);

    const lineGrad = ctx.createLinearGradient(tx, 0, tx + maxW, 0);
    lineGrad.addColorStop(0, hexToRgba(PALETTE.accentMain, 0.75));
    lineGrad.addColorStop(1, hexToRgba(PALETTE.accentMain, 0.0));
    ctx.fillStyle = lineGrad;
    roundedRectPath(ctx, tx, 166, maxW, 3, 1.5);
    ctx.fill();

    const reasonText =
        opts.reason ||
        (isRemoved
            ? 'Melepas Server Tag / Link Server dari profil'
            : 'Memasang Server Tag & Link Server di profil');
    setFont(ctx, 600, 23);
    ctx.fillStyle = 'rgba(226, 238, 250, 0.88)';
    ctx.fillText(ellipsize(ctx, reasonText, maxW), tx, 212);

    const chips = [
        opts.roleName ? `ROLE: ${opts.roleName}` : null,
        opts.serverTag ? `TAG: ${opts.serverTag}` : null,
        new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
    ].filter(Boolean);

    let cx = tx;
    const cy = 246;
    const chH = 42;
    for (const chip of chips) {
        setFont(ctx, 700, 16);
        const textUpper = chip.toUpperCase();
        const tw = spacedWidth(ctx, textUpper, 1.2);
        const cw = tw + 44;
        if (cx + cw > tx + maxW + 10) break;

        roundedRectPath(ctx, cx, cy, cw, chH, chH / 2);
        ctx.fillStyle = 'rgba(116, 169, 219, 0.12)';
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = hexToRgba(PALETTE.accentSoft, 0.40);
        ctx.stroke();

        ctx.fillStyle = statusColor;
        ctx.beginPath();
        ctx.arc(cx + 20, cy + chH / 2, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#e6f0fa';
        drawSpaced(ctx, textUpper, cx + 33, cy + chH / 2 + 6, 1.2);
        cx += cw + 12;
    }

    if (opts.guildName) {
        setFont(ctx, 600, 14);
        const gLabel = String(opts.guildName).toUpperCase();
        const gw = ctx.measureText(gLabel).width;
        ctx.fillStyle = 'rgba(165, 204, 240, 0.45)';
        ctx.fillText(gLabel, W - 44 - gw, H - 36);
    }

    return canvas.encode('png');
}
