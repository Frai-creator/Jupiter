// levelMath.js
// Pure leveling math. No Discord / DB imports, so it is trivial to unit-test.
//
// The XP curve is intentionally unchanged from the original implementation
// (5L² + 50L + 50 XP to go from level L to L+1) so existing user data stays valid.

export const MAX_LEVEL = 1000;
export const MIN_LEVEL = 0;

/** XP required to advance from `level` to `level + 1`. Returns Infinity at the level cap. */
export function xpToNextLevel(level) {
  if (!Number.isInteger(level) || level < MIN_LEVEL) return 0;
  if (level >= MAX_LEVEL) return Infinity;
  return 5 * level * level + 50 * level + 50;
}

/** Cumulative XP needed to reach `level` from level 0 (closed form of the series). */
export function totalXpForLevel(level) {
  const n = Math.max(0, Math.min(Math.floor(level) || 0, MAX_LEVEL));
  // Σ_{i=0}^{n-1} (5i² + 50i + 50)
  return (5 * (n - 1) * n * (2 * n - 1)) / 6 + (50 * (n - 1) * n) / 2 + 50 * n;
}

/** Convert a lifetime XP total into { level, currentXp, xpNeeded }. */
export function levelFromTotalXp(totalXp) {
  let remaining = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 0;

  while (level < MAX_LEVEL) {
    const need = xpToNextLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }

  return {
    level,
    currentXp: level >= MAX_LEVEL ? 0 : remaining,
    xpNeeded: xpToNextLevel(level),
  };
}

/** Progress (0-100, integer) through the current level. */
export function progressPercent(currentXp, level) {
  const need = xpToNextLevel(level);
  if (!Number.isFinite(need)) return 100;
  if (need <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((currentXp / need) * 100)));
}

/** Text progress bar, e.g. ▰▰▰▰▱▱▱▱▱▱ */
export function progressBar(percent, length = 12) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((clamped / 100) * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

/** 12345 -> "12,345" */
export function formatNumber(value) {
  return Math.floor(Number(value) || 0).toLocaleString('en-US');
}

/** 12345 -> "12.3K", 1_500_000 -> "1.5M" (for tight spaces like leaderboards). */
export function compactNumber(value) {
  const n = Math.floor(Number(value) || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}
