export type ActivitySource = 'chrome' | 'youtube';

export interface ImportedActivity {
  key: string;
  host: string;
  page: string;
  title: string;
  at: number;
}

const MAX_INPUT = 500000;
const MAX_ROWS = 1000;
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be']);

export function parseActivityImport(input: string, source: ActivitySource) {
  if (input.length > MAX_INPUT) throw Error('Use a JSON excerpt under 500,000 characters.');
  const document = JSON.parse(input);
  const rows: unknown = source === 'chrome' ? document?.['Browser History'] : document;
  if (!Array.isArray(rows)) throw Error('Select the matching Google Takeout JSON format.');
  const records = new Map<string, ImportedActivity>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rawUrl = source === 'chrome' ? row.url : row.titleUrl;
    if (typeof rawUrl !== 'string') continue;
    const at = source === 'chrome'
      ? Number.isSafeInteger(row.time_usec) ? Math.floor(row.time_usec / 1000) : NaN
      : typeof row.time === 'string' ? Date.parse(row.time) : NaN;
    if (!Number.isFinite(at) || at <= 0) continue;
    try {
      const url = new URL(rawUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      const video = url.hostname === 'youtu.be' ? url.pathname.slice(1)
        : url.pathname === '/watch' ? url.searchParams.get('v') : null;
      if (source === "youtube" && (typeof row.title !== "string" || !row.title.startsWith("Watched "))) continue;
      if (source === 'youtube' && (!YOUTUBE_HOSTS.has(url.hostname) || !video || !/^[\w-]{11}$/.test(video))) continue;
      const page = source === 'youtube' ? 'https://www.youtube.com/watch?v=' + video : url.origin + url.pathname;
      const title = typeof row.title === 'string' ? row.title.trim().slice(0, 240) : '';
      const key = at + '/' + page;
      if (!records.has(key)) records.set(key, { key, host: url.hostname, page, title, at });
    } catch {
      continue;
    }
  }
  if (!records.size) throw Error('No supported activity entries were found in this export.');
  return [...records.values()].sort((a, b) => b.at - a.at).slice(0, MAX_ROWS);
}

export function domainCounts(records: readonly ImportedActivity[]) {
  const domains = new Map<string, number>();
  for (const record of records) domains.set(record.host, (domains.get(record.host) ?? 0) + 1);
  return Array.from(domains, ([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
}
