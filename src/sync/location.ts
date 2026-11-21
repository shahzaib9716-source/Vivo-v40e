import { collection, doc, onSnapshot, serverTimestamp, runTransaction } from 'firebase/firestore';
import type { DocumentSnapshot } from 'firebase/firestore';
import { db } from './remote';

export interface ChildLocation {
  latitude: number;
  longitude: number;
  accuracyM: number;
  receivedAt: number;
  measuredAt: number | null;
}

const path = (familyId: string, childId: string) =>
  `families/${familyId}/children/${childId}/location/latest`;

const valid = (latitude: number, longitude: number, accuracyM: number) =>
  Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
  Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
  Number.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= 100000;

const writes = new Map<string, Promise<void>>();
function inOrder(key: string, action: () => Promise<void>) {
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  writes.set(key, pending);
  return pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); });
}

export async function reportChildLocation(
  familyId: string,
  childId: string,
  uid: string,
  latitude: number,
  longitude: number,
  accuracyM: number,
  measuredAt: number,
  saveCheckin = false,
  transitions: readonly string[] = [],
): Promise<void> {
  if (!familyId || !childId || !uid || !valid(latitude, longitude, accuracyM) || !Number.isSafeInteger(measuredAt) || measuredAt <= 0) {
    throw new Error('Invalid location report');
  }
  const key = path(familyId, childId);
  await inOrder(key, () => runTransaction(db(), async tx => {
    const fix = { latitude, longitude, accuracyM, measuredAt, capturedAt: serverTimestamp(), by: uid };
    tx.set(doc(db(), key), fix);
    if (transitions.length) {
      tx.set(doc(collection(db(), 'families', familyId, 'alerts')), {
        kind: 'checkin', childId, icon: 'map-pin', color: '#2E8BFF', title: 'Place update',
        body: transitions.join(' · ').slice(0, 240), unread: true, at: serverTimestamp(), by: uid,
      });
    }
    if (saveCheckin) {
      const slot = String(new Date(measuredAt).getUTCHours());
      tx.set(doc(db(), historyPath(familyId, childId), slot), fix);
    }
  }));
}

export function listenChildLocation(
  familyId: string,
  childId: string,
  onData: (location: ChildLocation | null, cached: boolean) => void,
  onError: (error: Error) => void,
): () => void {
  if (!familyId || !childId) throw new Error('A linked family and child are required');
  return onSnapshot(doc(db(), path(familyId, childId)), { includeMetadataChanges: true }, (snapshot) => {
    onData(readFix(snapshot), snapshot.metadata.fromCache);
  }, (error) => onError(error));
}

export async function clearChildLocation(familyId: string, childId: string): Promise<void> {
  if (!familyId || !childId) throw new Error('A linked family and child are required');
  const key = path(familyId, childId);
  await inOrder(key, () => runTransaction(db(), async tx => { tx.delete(doc(db(), key)); }));
}


function readFix(snapshot: DocumentSnapshot): ChildLocation | null {
  const data = snapshot.data();
  const receivedAt = data?.capturedAt?.toMillis?.();
  if (!data || !valid(data.latitude, data.longitude, data.accuracyM) || !Number.isFinite(receivedAt)) return null;
  const measuredAt = data.measuredAt;
  return { latitude: data.latitude, longitude: data.longitude, accuracyM: data.accuracyM, receivedAt,
    measuredAt: Number.isSafeInteger(measuredAt) && measuredAt > 0 ? measuredAt : null };
}

const historyPath = (family: string, child: string) => `families/${family}/children/${child}/checkins`;

export function listenCheckins(family: string, child: string, onData: (points: ChildLocation[], cached: boolean) => void, onError: (e: Error) => void) {
  return onSnapshot(collection(db(), historyPath(family, child)), { includeMetadataChanges: true }, snapshot => {
    const points = snapshot.docs.map(readFix).filter((p): p is ChildLocation => p !== null);
    onData(points.sort((a, b) => b.receivedAt - a.receivedAt), snapshot.metadata.fromCache);
  }, onError);
}

export function clearCheckins(family: string, child: string) {
  return inOrder(path(family, child), () => runTransaction(db(), async tx => {
    for (let hour = 0; hour < 24; hour++) tx.delete(doc(db(), historyPath(family, child), String(hour)));
  }));
}
