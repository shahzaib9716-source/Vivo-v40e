/**
 * Three-way merge for one shared slice. Pure, so it can be tested on its own.
 *
 * `base` is the value both phones last agreed on, `local` is this phone's value now and `remote`
 * is the server's value now. The result keeps both sides' changes where they do not collide:
 *
 * - only one side changed: that side's value;
 * - lists of items with an `id` (requests, alerts, messages, places and so on) merge item by item:
 *   additions from both sides are kept, an item changed here keeps this phone's version, an item
 *   removed on either side stays removed;
 * - anything else that changed on both sides (a flag, a list without ids): this phone's value.
 */

type WithId = { id: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function isIdList(v: unknown): v is WithId[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'object' && item !== null && typeof (item as WithId).id === 'string');
}

export function mergeSlice<T>(base: T | undefined, local: T, remote: T): T {
  if (same(local, remote)) return local;
  if (base === undefined) return remote;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if (isIdList(base) && isIdList(local) && isIdList(remote)) {
    return mergeLists(base, local, remote) as unknown as T;
  }
  return local;
}

function mergeLists(base: WithId[], local: WithId[], remote: WithId[]): WithId[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteIds = new Set(remote.map((item) => item.id));

  // Start from the server's list, in the server's order.
  const result: WithId[] = [];
  const seen = new Set<string>();
  for (const item of remote) {
    if (seen.has(item.id)) continue;
    const before = baseById.get(item.id);
    const mine = localById.get(item.id);
    if (before && !mine) continue; // removed on this phone
    seen.add(item.id);
    // Changed on this phone since the last agreement: this phone's version. Otherwise the server's.
    result.push(mine && before && !same(mine, before) ? mine : item);
  }

  // Items added on this phone that the server does not have yet. Keep them at the end they were
  // added to: lists that grow at the front (alerts, requests) keep growing at the front.
  const firstKnown = local.findIndex((item) => baseById.has(item.id));
  const front: WithId[] = [];
  const back: WithId[] = [];
  local.forEach((item, index) => {
    if (baseById.has(item.id) || remoteIds.has(item.id) || seen.has(item.id)) return;
    seen.add(item.id);
    if (firstKnown !== -1 && index < firstKnown) front.push(item);
    else back.push(item);
  });

  return [...front, ...result, ...back];
}
