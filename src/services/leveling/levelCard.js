// levelCard.js
// Renders the /rank card as a PNG using @napi-rs/canvas.
// Needs a system font in the container (see Dockerfile: ttf-dejavu). If rendering fails for any reason
// the caller falls back to the embed, so rank never breaks because of canvas.

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { xpToNextLevel, progressPercent, formatNumber, compactNumber, MAX_LEVEL } from './levelMath.js';

const W = 934;
const H = 282;
const FONT = '"DejaVu Sans", "Liberation Sans", Arial, sans-serif';

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
  while (ctx.measureText(text).width > maxWidth && px > 14) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  return text;
}

async function loadAvatar(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * @param {object} p
 * @param {string} p.username
 * @param {string} p.avatarUrl   PNG url
 * @param {{level:number,xp:number,totalXp:number}} p.data
 * @param {number|null} p.rank
 * @param {string} [p.accent]    hex color for the progress bar
 * @returns {Promise<Buffer>}
 */
export async function renderRankCard({ username, avatarUrl, data, rank, accent = '#5865F2' }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1e1f2b');
  bg.addColorStop(1, '#2b2d42');
  roundedRect(ctx, 0, 0, W, H, 28);
  ctx.fillStyle = bg;
  ctx.fill();

  // Soft accent glow (top right)
  const glow = ctx.createRadialGradient(W - 80, 40, 10, W - 80, 40, 320);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Avatar
  const cx = 30 + 90;
  const cy = H / 2;
  const avatar = await loadAvatar(avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 80, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, cx - 80, cy - 80, 160, 160);
  } else {
    ctx.fillStyle = '#3a3c55';
    ctx.fillRect(cx - 80, cy - 80, 160, 160);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, 82, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = accent;
  ctx.stroke();

  const left = 240;
  const right = W - 40;

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  fitText(ctx, username, 400, 38);
  ctx.fillText(username, left, 95);

  // Rank + level (right aligned)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b9bbce';
  ctx.font = `600 22px ${FONT}`;
  const lvlLabel = 'LEVEL';
  const rankLabel = 'RANK';
  ctx.fillText(lvlLabel, right, 62);
  ctx.fillText(rankLabel, right - 190, 62);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(String(data.level), right, 108);
  ctx.fillStyle = accent;
  ctx.fillText(rank ? `#${compactNumber(rank)}` : '—', right - 190, 108);

  // XP text
  const need = xpToNextLevel(data.level);
  const maxed = !Number.isFinite(need);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b9bbce';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(maxed ? 'MAX LEVEL' : `${formatNumber(data.xp)} / ${formatNumber(need)} XP`, right, 175);

  ctx.textAlign = 'left';
  ctx.fillText(`Total ${formatNumber(data.totalXp)} XP`, left, 175);

  // Progress bar
  const barX = left;
  const barY = 195;
  const barW = right - left;
  const barH = 38;
  roundedRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = '#0f1019';
  ctx.fill();

  const percent = progressPercent(data.xp, data.level);
  const fillW = Math.max(percent > 0 ? barH : 0, Math.round((barW * percent) / 100));
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, '#9b8cff');
    roundedRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(data.level >= MAX_LEVEL ? '100%' : `${percent}%`, barX + barW / 2, barY + 26);

  return await canvas.encode('png');
}
