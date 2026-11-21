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

export function crossings(places: readonly Place[], previous: Fix | undefined, current: Fix): string[] {
  if (!previous || current.measuredAt <= previous.measuredAt || current.measuredAt - previous.measuredAt > 300000) return [];
  return places.flatMap(place => {
    const before = placeSide(place, previous), after = placeSide(place, current);
    if (before === false && after === true && place.arrive) return ['Arrived at ' + place.name];
    if (before === true && after === false && place.leave) return ['Left ' + place.name];
    return [];
  });
}
