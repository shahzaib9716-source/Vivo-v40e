export function locationStatus(measuredAt: number | null | undefined, cached: boolean, now: number, error: boolean) {
  if (error) return 'Location unavailable';
  if (measuredAt === undefined) return cached ? 'No cached location' : 'Location';
  if (cached) return 'Saved location · awaiting server confirmation';
  if (measuredAt === null) return 'Last report · GPS fix time unknown';
  if (measuredAt > now) return 'Last report · check device clocks';
  return now - measuredAt >= 5 * 60_000 ? 'Stale location' : 'Recent shared location';
}
