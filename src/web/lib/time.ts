// src/web/lib/time.ts
// Time formatting helpers for the article list and reader meta.
// Zero em-dashes / en-dashes: plain hyphens only.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

/**
 * Short relative time string for a past epoch-ms timestamp.
 * Examples: "now", "5m", "2h", "3d", "6w", "2y".
 * Future timestamps clamp to "now". Invalid input returns an empty string.
 */
export function relativeTime(epochMs: number, now: number = Date.now()): string {
  if (!Number.isFinite(epochMs)) return '';
  const diff = now - epochMs;
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;
  if (diff < YEAR) return `${Math.floor(diff / WEEK)}w`;
  return `${Math.floor(diff / YEAR)}y`;
}

/**
 * Full, human-readable absolute timestamp for tooltips / <time title>.
 * Uses the browser locale. Invalid input returns an empty string.
 */
export function absoluteTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '';
  try {
    return new Date(epochMs).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** ISO-8601 string for the <time dateTime> attribute. Empty string on invalid input. */
export function isoTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '';
  try {
    return new Date(epochMs).toISOString();
  } catch {
    return '';
  }
}
