/**
 * Display labels made from a real time (milliseconds since the epoch). Pure: no React, no Firebase.
 *
 * Items that carry `at` (or a child that carries `checkInAt`) are drawn with these, so the label is
 * always fresh. The stored `ago` / `time` / `updatedAgo` strings are only what an item without a real
 * time shows (the sample data). Labels are never sent to the server.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3:42 PM", in the device's own time zone. */
export function clockLabel(at: number): string {
  const d = new Date(at);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

/**
 * How long ago `at` was: "just now", "5m ago", "2h ago", "3d ago". With `short`: "now", "5m", "2h", "3d",
 * the form the alert list uses. A time in the future (the other phone's clock runs ahead) reads as now.
 */
export function agoLabel(at: number, now: number = Date.now(), short = false): string {
  const diff = now - at;
  if (!(diff >= MINUTE)) return short ? 'now' : 'just now';
  const [n, unit] = diff < HOUR ? [Math.floor(diff / MINUTE), 'm'] : diff < DAY ? [Math.floor(diff / HOUR), 'h'] : [Math.floor(diff / DAY), 'd'];
  return short ? `${n}${unit}` : `${n}${unit} ago`;
}
