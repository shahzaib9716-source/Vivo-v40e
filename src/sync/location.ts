import { doc, onSnapshot, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from './remote';

export interface ChildLocation {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: number;
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
): Promise<void> {
  if (!familyId || !childId || !uid || !valid(latitude, longitude, accuracyM)) {
    throw new Error('Invalid location report');
  }
  const key = path(familyId, childId);
  await inOrder(key, () => runTransaction(db(), async tx => {
    tx.set(doc(db(), key), { latitude, longitude, accuracyM, capturedAt: serverTimestamp(), by: uid });
  }));
}

export function listenChildLocation(
  familyId: string,
  childId: string,
  onData: (location: ChildLocation | null) => void,
  onError: (error: Error) => void,
): () => void {
  if (!familyId || !childId) throw new Error('A linked family and child are required');
  return onSnapshot(doc(db(), path(familyId, childId)), (snapshot) => {
    const data = snapshot.data();
    const latitude = data?.latitude;
    const longitude = data?.longitude;
    const accuracyM = data?.accuracyM;
    const capturedAt = data?.capturedAt?.toMillis?.();
    if (!data || !valid(latitude, longitude, accuracyM) || !Number.isFinite(capturedAt)) {
      onData(null);
      return;
    }
    onData({ latitude, longitude, accuracyM, capturedAt });
  }, (error) => onError(error));
}

export async function clearChildLocation(familyId: string, childId: string): Promise<void> {
  if (!familyId || !childId) throw new Error('A linked family and child are required');
  const key = path(familyId, childId);
  await inOrder(key, () => runTransaction(db(), async tx => { tx.delete(doc(db(), key)); }));
}

