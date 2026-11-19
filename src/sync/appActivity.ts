import type { AppUsage } from './androidDevice';

const SOCIAL = new Set([
  'com.whatsapp', 'com.whatsapp.w4b', 'com.instagram.android', 'com.instagram.lite',
  'com.facebook.katana', 'com.facebook.lite', 'com.facebook.orca', 'com.zhiliaoapp.musically',
  'com.ss.android.ugc.trill', 'com.snapchat.android', 'org.telegram.messenger',
  'org.telegram.messenger.web', 'com.google.android.youtube',
]);

const VIDEO = new Set([
  'com.google.android.youtube', 'com.google.android.apps.youtube.kids',
  'com.netflix.mediaclient', 'com.amazon.avod.thirdpartyclient',
  'com.disney.disneyplus', 'tv.twitch.android.app',
]);

export type AppActivityFilter = 'all' | 'social' | 'video';

export function rankAppActivity(apps: readonly AppUsage[], filter: AppActivityFilter, search = '', week = false) {
  const matches = filter === 'social' ? SOCIAL : filter === 'video' ? VIDEO : null;
  const query = search.trim().toLowerCase();
  return apps.filter(app =>
    (!matches || matches.has(app.pkg)) &&
    (!week || app.weeklyMs !== undefined) &&
    (!query || app.label.toLowerCase().includes(query) || app.pkg.toLowerCase().includes(query))
  ).sort((a, b) => (week ? (b.weeklyMs ?? 0) - (a.weeklyMs ?? 0) : b.ms - a.ms) || a.label.localeCompare(b.label) || a.pkg.localeCompare(b.pkg));
}
