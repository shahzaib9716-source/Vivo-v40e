import type { Place } from '../state/store';

interface Fix { latitude: number; longitude: number; accuracyM: number; measuredAt: number }
export function placeSide(place: Place, fix: Fix): boolean | undefined {
  if (place.latitude == null || place.longitude == null) return undefined;
  const radians = Math.PI / 180;
  const a = Math.sin((fix.latitude - place.latitude) * radians / 2) ** 2
    + Math.cos(fix.latitude * radians) * Math.cos(place.latitude * radians)
    * Math.sin((fix.longitude - place.longitude) * radians / 2) ** 2;
  const distance = 12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
  if (distance + fix.accuracyM <= place.radius) return true;
  if (distance - fix.accuracyM > place.radius) return false;
}

export class CrossingSession {
  private readonly observed = new Map<string, { inside: boolean; time: number }>();

  update(places: readonly Place[], fix: Fix): string[] {
    const changes: string[] = [];
    for (const place of places) {
      const inside = placeSide(place, fix);
      const last = this.observed.get(place.id);
      if (inside === undefined || (last && fix.measuredAt <= last.time)) continue;
      this.observed.set(place.id, { inside, time: fix.measuredAt });
      if (!last || fix.measuredAt - last.time > 300000 || last.inside === inside) continue;
      if (inside && place.arrive) changes.push('Arrived at ' + place.name);
      if (!inside && place.leave) changes.push('Left ' + place.name);
    }
    return changes;
  }
}
