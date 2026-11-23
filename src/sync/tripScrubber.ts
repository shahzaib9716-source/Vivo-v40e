/** Times are the selected day's actual observations, sorted by the listener. */
export function nearestTripIndex(times: readonly number[], fraction: number): number {
  if (times.length === 0) return -1;
  if (times.length === 1 || !Number.isFinite(fraction)) return 0;
  const start = times[0];
  const target = start + (times[times.length - 1] - start) * Math.max(0, Math.min(1, fraction));
  let nearest = 0;
  for (let i = 1; i < times.length; i++) {
    if (Math.abs(times[i] - target) < Math.abs(times[nearest] - target)) nearest = i;
  }
  return nearest;
}

export function tripFraction(times: readonly number[], index: number): number {
  if (times.length < 2) return 0;
  const span = times[times.length - 1] - times[0];
  return span > 0 ? (times[index] - times[0]) / span : 0;
}
