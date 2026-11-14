/**
 * Ids for items created on a device. Pure: no React, no Firebase, runs in plain node.
 *
 * Two phones can create an item in the same millisecond, so the time alone is not enough: six
 * random characters are added. An id is also the Firestore document id, so it has to satisfy
 * `idOk` in firestore.rules.
 */

/** The same pattern as `idOk()` in firestore.rules. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export function idOk(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

const RANDOM_CHARS = 6;

type RandomSource = () => number;

function defaultRandom(): number {
  // crypto.getRandomValues where the runtime has it (web, node, recent Hermes); Math.random otherwise.
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    try {
      return c.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
    } catch {
      // fall through
    }
  }
  return Math.random();
}

/**
 * prefix + Date.now() in base 36 + 6 random base-36 characters, for example `m` + `mgx1k2ab` + `q7f0zk`.
 * `now` and `random` exist for tests.
 */
export function newId(prefix: string, now: number = Date.now(), random: RandomSource = defaultRandom): string {
  let tail = '';
  for (let i = 0; i < RANDOM_CHARS; i++) tail += Math.min(35, Math.floor(random() * 36)).toString(36);
  return prefix + Math.max(0, Math.floor(now)).toString(36) + tail;
}
