const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

/** "2h ago", "3d ago", "just now" */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < MIN_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MIN_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  return `${Math.floor(diff / DAY_MS)}d ago`;
}

/** "+91 94276 77680" from "919427677680" */
export function formatPhone(raw: string): string {
  if (raw.startsWith('91') && raw.length === 12) {
    return `+91 ${raw.slice(2, 7)} ${raw.slice(7)}`;
  }
  if (raw.startsWith('1') && raw.length === 11) {
    return `+1 (${raw.slice(1, 4)}) ${raw.slice(4, 7)}-${raw.slice(7)}`;
  }
  return `+${raw}`;
}

/** Capitalise + replace underscores */
export function titleCase(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
