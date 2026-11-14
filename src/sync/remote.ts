import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import { FIREBASE_CONFIG, FIRESTORE_EMULATOR } from './config';
import { mergeSlice } from './merge';
import {
  FAMILIES,
  FAMILY_DOC_VERSION,
  LinkError,
  PAIRING,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_TTL_MS,
  SYNCED_SLICES,
  type MemberRecord,
  type PairingCode,
  type SyncedSlice,
} from './types';

/**
 * Everything that talks to Cloud Firestore. Each shared slice is stored as a JSON string in
 * `state.<slice>`: a string compares exactly, so the phones can tell "nothing changed" from
 * "changed" without depending on how Firestore orders the keys of a map.
 */

export type SliceJson = Partial<Record<SyncedSlice, string>>;

export interface FamilySnapshot {
  exists: boolean;
  /** True when the data came from the local cache, not the server (offline). */
  fromCache: boolean;
  state: SliceJson;
  members: Record<string, MemberRecord>;
}

let db: Firestore | null = null;

function getDb(): Firestore {
  if (db) return db;
  if (!FIREBASE_CONFIG) throw new LinkError('not-configured', 'Linking is not set up in this build.');
  const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
  db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    // React Native has no WebSocket-based stream the SDK can use reliably; long polling works everywhere.
    experimentalForceLongPolling: Platform.OS !== 'web',
  });
  if (FIRESTORE_EMULATOR) connectFirestoreEmulator(db, FIRESTORE_EMULATOR.host, FIRESTORE_EMULATOR.port);
  return db;
}

const familyRef = (familyId: string): DocumentReference => doc(getDb(), FAMILIES, familyId);

/** Turns any failure into a LinkError with a sentence for the person using the app. */
export function toLinkError(e: unknown): LinkError {
  if (e instanceof LinkError) return e;
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code.includes('permission-denied')) {
    return new LinkError('permission', 'The server refused the request. The Firestore rules may not be published yet.');
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded') || code.includes('network') || code.includes('failed-precondition')) {
    return new LinkError('network', "Can't reach the server. Check the internet connection and try again.");
  }
  return new LinkError('unknown', 'Something went wrong while linking. Please try again.');
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    out += PAIRING_CODE_ALPHABET[Math.floor(Math.random() * PAIRING_CODE_ALPHABET.length)];
  }
  return out;
}

export function randomId(length = 16): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function readState(data: Record<string, unknown> | undefined): SliceJson {
  const raw = (data?.state ?? {}) as Record<string, unknown>;
  const out: SliceJson = {};
  for (const slice of SYNCED_SLICES) {
    const value = raw[slice];
    if (typeof value === 'string') out[slice] = value;
  }
  return out;
}

function readMembers(data: Record<string, unknown> | undefined): Record<string, MemberRecord> {
  const raw = (data?.members ?? {}) as Record<string, unknown>;
  const out: Record<string, MemberRecord> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const m = value as Record<string, unknown>;
    if (m.role !== 'parent' && m.role !== 'child') continue;
    out[id] = {
      role: m.role,
      name: typeof m.name === 'string' ? m.name : 'Device',
      platform: typeof m.platform === 'string' ? m.platform : 'unknown',
      joinedAt: typeof m.joinedAt === 'number' ? m.joinedAt : 0,
      lastSeenAt: typeof m.lastSeenAt === 'number' ? m.lastSeenAt : 0,
    };
  }
  return out;
}

/** Creates a family seeded with this device's data. Returns the new family id. */
export async function createFamily(state: SliceJson, deviceId: string, member: MemberRecord): Promise<string> {
  try {
    const ref = doc(collection(getDb(), FAMILIES));
    await setDoc(ref, {
      v: FAMILY_DOC_VERSION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      state,
      members: { [deviceId]: member },
    });
    return ref.id;
  } catch (e) {
    throw toLinkError(e);
  }
}

/** Puts a fresh pairing code on offer for the family. A code that happens to be taken is retried. */
export async function createPairing(familyId: string): Promise<PairingCode> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = randomCode();
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    try {
      const ref = doc(getDb(), PAIRING, code);
      // The rules allow creating a pairing document but never changing one, so a code that is
      // already in use is refused and another one is tried.
      await setDoc(ref, { familyId, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(expiresAt) });
      return { code, expiresAt };
    } catch (e) {
      lastError = e;
      const link = toLinkError(e);
      if (link.code !== 'permission') throw link;
    }
  }
  throw toLinkError(lastError);
}

export async function removePairing(code: string): Promise<void> {
  try {
    await deleteDoc(doc(getDb(), PAIRING, code));
  } catch {
    // Best effort: the code expires on its own.
  }
}

/** Looks up a pairing code. Returns the family id it points to. */
export async function redeemPairing(code: string): Promise<string> {
  let snap;
  try {
    snap = await getDoc(doc(getDb(), PAIRING, code));
  } catch (e) {
    throw toLinkError(e);
  }
  if (!snap.exists()) throw new LinkError('code-not-found', "That code isn't right. Check it on the parent's phone and try again.");
  const data = snap.data() as Record<string, unknown>;
  const expires = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0;
  if (expires < Date.now()) throw new LinkError('code-expired', "That code has expired. Ask for a new one on the parent's phone.");
  if (typeof data.familyId !== 'string' || !data.familyId) {
    throw new LinkError('code-not-found', "That code isn't right. Check it on the parent's phone and try again.");
  }
  return data.familyId;
}

/** Reads the family once, from the server. */
export async function fetchFamily(familyId: string): Promise<FamilySnapshot> {
  try {
    const snap = await getDoc(familyRef(familyId));
    const data = snap.data() as Record<string, unknown> | undefined;
    return { exists: snap.exists(), fromCache: snap.metadata.fromCache, state: readState(data), members: readMembers(data) };
  } catch (e) {
    throw toLinkError(e);
  }
}

export async function writeMember(familyId: string, deviceId: string, member: MemberRecord): Promise<void> {
  try {
    await updateDoc(familyRef(familyId), { [`members.${deviceId}`]: member, updatedAt: serverTimestamp() });
  } catch (e) {
    throw toLinkError(e);
  }
}

export async function touchMember(familyId: string, deviceId: string): Promise<void> {
  try {
    await updateDoc(familyRef(familyId), { [`members.${deviceId}.lastSeenAt`]: Date.now() });
  } catch {
    // Presence is a nicety; a failure here is not worth reporting.
  }
}

export async function removeMember(familyId: string, deviceId: string): Promise<void> {
  try {
    await updateDoc(familyRef(familyId), { [`members.${deviceId}`]: deleteField(), updatedAt: serverTimestamp() });
  } catch {
    // Best effort: this device forgets the family either way.
  }
}

/** Listens to the family. Returns the function that stops listening. */
export function watchFamily(
  familyId: string,
  onData: (snapshot: FamilySnapshot) => void,
  onError: (error: LinkError) => void,
): () => void {
  try {
    return onSnapshot(
      familyRef(familyId),
      { includeMetadataChanges: true },
      (snap) => {
        const data = snap.data() as Record<string, unknown> | undefined;
        onData({ exists: snap.exists(), fromCache: snap.metadata.fromCache, state: readState(data), members: readMembers(data) });
      },
      (e) => onError(toLinkError(e)),
    );
  } catch (e) {
    onError(toLinkError(e));
    return () => {};
  }
}

/**
 * Sends this device's changed slices. Inside a transaction, each one is merged three ways:
 * `base` (what both phones last agreed on), `local` (this phone now) and the server's value now.
 * Returns what was written, so the caller can adopt it.
 */
export async function pushSlices(
  familyId: string,
  deviceId: string,
  changes: { slice: SyncedSlice; base: string | undefined; local: string }[],
): Promise<SliceJson> {
  const ref = familyRef(familyId);
  try {
    return await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new LinkError('family-missing', 'This family no longer exists on the server.');
      const remote = readState(snap.data() as Record<string, unknown>);
      const written: SliceJson = {};
      const update: Record<string, unknown> = { updatedAt: serverTimestamp(), [`members.${deviceId}.lastSeenAt`]: Date.now() };
      for (const change of changes) {
        const remoteJson = remote[change.slice];
        let merged = change.local;
        if (remoteJson !== undefined && remoteJson !== change.local) {
          try {
            const base = change.base === undefined ? undefined : JSON.parse(change.base);
            merged = JSON.stringify(mergeSlice(base, JSON.parse(change.local), JSON.parse(remoteJson)));
          } catch {
            merged = change.local;
          }
        }
        written[change.slice] = merged;
        if (merged !== remoteJson) update[`state.${change.slice}`] = merged;
      }
      tx.update(ref, update);
      return written;
    });
  } catch (e) {
    throw toLinkError(e);
  }
}
