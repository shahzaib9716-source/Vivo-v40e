const dayMs = 86400000;

export interface UsageDay { day: string; ms: number }

export function localDay(time: number) {
  const date = new Date(time);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function readDays(value: unknown): UsageDay[] {
  if (!Array.isArray(value) || value.length > 7) return [];
  const entries = new Map<string, number>();
  for (const row of value) {
    if (!row || typeof row.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) ||
        !Number.isSafeInteger(row.ms) || row.ms < 0 || row.ms > 93600000) return [];
    if (entries.has(row.day)) return [];
    entries.set(row.day, row.ms);
  }
  return Array.from(entries, ([day, ms]) => ({ day, ms })).sort((a, b) => a.day.localeCompare(b.day));
}

export function recordDay(history: unknown, day: string, ms: number) {
  const midnight = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(midnight) || !readDays([{ day, ms }]).length) throw Error('Invalid usage day.');
  const cutoff = new Date(midnight - 6 * dayMs).toISOString().slice(0, 10);
  return [...readDays(history).filter(row => row.day >= cutoff && row.day < day), { day, ms }];
}
