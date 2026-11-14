// Small helpers for what the scenarios assert.
import assert from 'node:assert/strict';

import { canon } from './driver.mjs';

/** What a phone shows before it is in a family (src/state/store.tsx, the seed). */
export const SAMPLE = {
  childNames: ['Mia Carter', 'Leo Carter'],
  placeNames: ['Home', 'School', "Grandma's"],
  messageIds: ['m1', 'm2', 'm3', 'm4'],
  siteIds: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'],
};

const LABELS = ['ago', 'time', 'updatedAgo'];
const withoutLabels = (item) => Object.fromEntries(Object.entries(item).filter(([key]) => !LABELS.includes(key)));
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The synced slices of a store view in a form two phones can be compared by: display labels left
 * out (they are drawn from the phone's own clock), lists in id order where the order carries no
 * meaning for the comparison.
 */
export function syncedOf(store, { slices } = {}) {
  const out = {
    children: store.children.map(withoutLabels),
    requests: store.requests.map(withoutLabels).sort(byId),
    messages: store.messages.map(withoutLabels).sort(byId),
    alerts: store.alerts.map(withoutLabels).sort(byId),
    places: store.places,
    schedules: store.schedules,
    sites: store.sites,
    tasks: store.tasks,
    sosActive: store.sosActive,
    sosChildId: store.sosChildId,
  };
  return slices ? Object.fromEntries(slices.map((k) => [k, out[k]])) : out;
}

/** True when the store shows the sample data (the seed), as far as a glance can tell. */
export function showsSample(store) {
  return (
    store.children.length === 2 &&
    store.children[0].id === 'c1' &&
    store.children[0].name === 'Mia Carter' &&
    store.children[1].name === 'Leo Carter' &&
    store.messages.length === 4 &&
    store.sites.length === 6 &&
    store.places.length === 3 &&
    store.live === false
  );
}

/** Messages the Firebase SDK prints on its own when it loses the connection. Not the app's doing. */
export const OFFLINE_NOISE = [/Could not reach Cloud Firestore backend/, /@firebase\/firestore.*(UNAVAILABLE|unavailable|Connection|stream|offline)/i, /auth\/network-request-failed/, /ECONNREFUSED|ECONNRESET|socket hang up|fetch failed/];

/** What the Firebase SDK prints when the server refuses a write or a listener. Expected where a scenario provokes a refusal. */
export const REFUSAL_NOISE = [/@firebase\/firestore[\s\S]*(PERMISSION_DENIED|permission-denied|Missing or insufficient permissions)/];

/**
 * Fails when a phone printed an error or a warning, threw outside a promise chain, or React
 * reported a problem. `allow`: patterns that are expected in this scenario.
 */
export async function noAppErrors(phones, allow = []) {
  const found = [];
  for (const phone of phones) {
    if (!phone.running) continue;
    for (const e of await phone.errors()) {
      if (allow.some((pattern) => pattern.test(e.text))) continue;
      found.push(`${phone.name} ${e.level}: ${e.text}`);
    }
  }
  assert.deepEqual(found, [], 'the apps printed errors');
}

/** `minutes` ago at most, and not in the future by more than the clocks can differ on one machine. */
export function recent(ms, minutes = 2) {
  return typeof ms === 'number' && Date.now() - ms < minutes * 60000 && ms - Date.now() < 5000;
}

/** True when two JSON values hold the same data (the order of keys does not count). */
export const sameData = (a, b) => canon(a) === canon(b);

/** Where two JSON values differ, one line per leaf: for messages when a comparison fails. */
export function differences(a, b, path = '') {
  if (sameData(a, b)) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [`${path || '/'}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) => differences(a[key], b[key], `${path}/${key}`));
}
