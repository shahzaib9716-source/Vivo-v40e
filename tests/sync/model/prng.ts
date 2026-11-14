/** A small seeded random source (mulberry32), so every model run can be repeated from its seed. */
export interface Rng {
  next(): number;
  /** An integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { next, int, pick: (items) => items[int(items.length)], chance: (p) => next() < p };
}
