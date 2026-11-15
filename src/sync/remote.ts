/**
 * Everything that talks to Cloud Firestore (data layout v2, see firestore.rules).
 *
 * Three kinds of call:
 * - actions a person waits for (create the family, make or claim a pairing code, approve, remove):
 *   they resolve when the server has stored the change and reject with a LinkError otherwise. A
 *   write the server has not answered within ACTION_TIMEOUT_MS is reported as "can't reach the
 *   server" (SPEC 4.2 rule 9); see `acked` for what happens if it lands later.
 * - listeners: the family, its members and devices, a pairing code, and the synced slices
 *   (`listenPlan`, one per entry of schema.listenersFor).
 * - the sync engine's writes (`executeWrite`): one document each, exactly as ./reconcile decided.
 *
 * No React here. Who is signed in comes from ./auth through the shared Firebase app.
 */
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  initializeFirestore,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import { makeChild, SEED_PLACES, SEED_SCHEDULES, SEED_TASKS } from '@/state/store';
import { FIRESTORE_EMULATOR } from './config';
import { firebaseApp } from './firebase';
import { newId } from './ids';
import type { Write } from './reconcile';
import { millisOf, normaliseTimes, SCHEMA, type DocData, type ListenerPlan, type SyncCtx } from './schema';
import { LinkError, OFFLINE_MESSAGE, PAIRING_TTL_MS, randomPairingCode, type LinkRole } from './types';

// ---------------------------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------------------------

let instance: Firestore | null = null;

/** The Firestore instance, created on first use (SPEC 4.2 rule 10). Memory cache only. */
export function db(): Firestore {
  if (instance) return instance;
  const created = initializeFirestore(firebaseApp(), {
    ignoreUndefinedProperties: true,
    // React Native has no WebSocket-based stream the SDK can use reliably; long polling works everywhere.
    experimentalForceLongPolling: Platform.OS !== 'web',
  });
  if (FIRESTORE_EMULATOR) connectFirestoreEmulator(created, FIRESTORE_EMULATOR.host, FIRESTORE_EMULATOR.port);
  instance = created;
  return created;
}

const SERVER_TIME = serverTimestamp();

/**
 * The value to store where the rules demand `== request.time`. Always the same object, so the
 * engine can recognise it (`SyncCtx.serverTimestamp`).
 */
export function serverTime(): unknown {
  return SERVER_TIME;
}

const familyPath = (familyId: string) => `families/${familyId}`;
const memberPath = (familyId: string, uid: string) => `${familyPath(familyId)}/members/${uid}`;
const devicePath = (familyId: string, deviceId: string) => `${familyPath(familyId)}/devices/${deviceId}`;
const childPath = (familyId: string, childId: string) => `${familyPath(familyId)}/children/${childId}`;
const pairingPath = (code: string) => `pairing/${code}`;
const userPath = (uid: string) => `users/${uid}`;

// ---------------------------------------------------------------------------------------------
// Errors and waiting
// ---------------------------------------------------------------------------------------------

/** The SDK's error code without its prefix: 'permission-denied', 'unavailable', ... or ''. */
export function errorCode(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  return code.replace(/^firestore\//, '');
}

/** True when the server said no (as opposed to not being reachable). */
export function isRefusal(e: unknown): boolean {
  const code = errorCode(e);
  return code === 'permission-denied' || code === 'not-found' || code === 'unauthenticated';
}

/** Turns any failure into a LinkError with a sentence for the person using the app. */
export function toLinkError(e: unknown): LinkError {
  if (e instanceof LinkError) return e;
  const code = errorCode(e);
  if (code === 'permission-denied') return new LinkError('permission', 'The server refused that: this account is not allowed to do it.');
  if (code === 'unauthenticated') return new LinkError('not-signed-in', 'You were signed out. Sign in again.');
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'cancelled' || code.includes('network')) return new LinkError('network', OFFLINE_MESSAGE);
  if (code === 'resource-exhausted') return new LinkError('network', 'The server is not taking more requests right now. Try again later.');
  return new LinkError('unknown', 'Something went wrong while talking to the server. Please try again.');
}

/** How long an action waits for the server's answer before it is reported as unreachable. */
export const ACTION_TIMEOUT_MS = 12_000;

/**
 * Waits for the server's answer to a write or read, at most ACTION_TIMEOUT_MS. The SDK itself
 * never gives up on a write: without a connection it keeps it queued. So a write that times out
 * here may still be stored later; `onLate` is called if that happens, to undo it or to take it in.
 * Rejects with a LinkError ('network') on a timeout and with the SDK's error otherwise: pass it
 * through `toLinkError` before showing it to anyone.
 */
export function acked<T>(work: Promise<T>, onLate?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new LinkError('network', OFFLINE_MESSAGE));
    }, ACTION_TIMEOUT_MS);
    work.then(
      (value) => {
        if (done) {
          if (onLate) onLate(value);
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve(value);
      },
      (e: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // The SDK's own error, so that callers can still tell a refusal from a missing document.
        reject(e);
      },
    );
  });
}

// ---------------------------------------------------------------------------------------------
// users/{uid}: which family an account belongs to
// ---------------------------------------------------------------------------------------------

export interface UserPointer {
  familyId: string;
  role: LinkRole;
}

/** Reads the pointer from the server. Null when the account has no family. */
export async function readUserPointer(uid: string): Promise<UserPointer | null> {
  const snap = await acked(getDocFromServer(doc(db(), userPath(uid))));
  const data = snap.data();
  if (!data || typeof data.familyId !== 'string' || (data.role !== 'parent' && data.role !== 'child')) return null;
  return { familyId: data.familyId, role: data.role };
}

/** Allowed only once the member record exists with that role (firestore.rules, users). */
export async function writeUserPointer(uid: string, pointer: UserPointer): Promise<void> {
  await acked(setDoc(doc(db(), userPath(uid)), { familyId: pointer.familyId, role: pointer.role, updatedAt: SERVER_TIME }));
}

/** Allowed only once the member record is gone. */
export async function deleteUserPointer(uid: string): Promise<void> {
  await acked(deleteDoc(doc(db(), userPath(uid))));
}

// ---------------------------------------------------------------------------------------------
// The family
// ---------------------------------------------------------------------------------------------

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A random 20-character document id. */
export function randomDocId(length = 20): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return out;
}

/** firestore.rules allows 20 document lookups per batch, and every write in it costs at least one. */
export const MAX_BATCH_WRITES = 20;

type BatchWrite = { op: 'set'; path: string; data: DocumentData } | { op: 'update'; path: string; data: DocumentData } | { op: 'delete'; path: string };

/** Commits the writes in batches of at most MAX_BATCH_WRITES, one after the other. */
async function commitAll(writes: BatchWrite[]): Promise<void> {
  for (let start = 0; start < writes.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(db());
    for (const write of writes.slice(start, start + MAX_BATCH_WRITES)) {
      const ref = doc(db(), write.path);
      if (write.op === 'set') batch.set(ref, write.data);
      else if (write.op === 'update') batch.update(ref, write.data);
      else batch.delete(ref);
    }
    await acked(batch.commit());
  }
}

/**
 * Batch 1 of creating a family (SPEC 3.1 step 2): the family, the founder's member record and the
 * account's pointer, together or not at all. Refused unless the account's email address is
 * confirmed and listed in `ownerEmails()` in firestore.rules, and the account has no family yet.
 */
export async function createFamilyBatch(input: { familyId: string; uid: string; familyName: string; memberName: string; platform: string }): Promise<void> {
  const { familyId, uid } = input;
  await commitAll([
    { op: 'set', path: familyPath(familyId), data: { v: 2, owner: uid, name: input.familyName, createdAt: SERVER_TIME } },
    {
      op: 'set',
      path: memberPath(familyId, uid),
      data: { role: 'parent', childId: null, name: input.memberName, platform: input.platform, joinedAt: SERVER_TIME, addedBy: uid, code: null },
    },
    { op: 'set', path: userPath(uid), data: { familyId, role: 'parent', updatedAt: SERVER_TIME } },
  ]);
}

/**
 * Batch 2 (SPEC 3.1 step 3): what a new family starts with. One child (the sample numbers and app
 * list, the name the parent typed, no device yet) and the sample places, schedules and tasks, each
 * under its sample id with `ord` = its position. No sites, requests, alerts or messages.
 * Every id is fixed by the input, so running it again writes the same documents; `isSeeded` tells
 * whether it already went through.
 */
export async function seedFamilyBatch(input: { familyId: string; uid: string; childId: string; childName: string; childAge: number | null }): Promise<void> {
  const ctx: SyncCtx = { familyId: input.familyId, uid: input.uid, role: 'parent', childId: null, serverTimestamp: SERVER_TIME };
  const child = makeChild(input.childId, input.childName, input.childAge ?? undefined);
  const writes: BatchWrite[] = [{ op: 'set', path: SCHEMA.children.docPath(input.familyId, child.id), data: SCHEMA.children.toDoc(child, ctx, { ord: 0 }) }];
  SEED_PLACES.forEach((item, ord) => writes.push({ op: 'set', path: SCHEMA.places.docPath(input.familyId, item.id), data: SCHEMA.places.toDoc(item, ctx, { ord }) }));
  SEED_SCHEDULES.forEach((item, ord) => writes.push({ op: 'set', path: SCHEMA.schedules.docPath(input.familyId, item.id), data: SCHEMA.schedules.toDoc(item, ctx, { ord }) }));
  SEED_TASKS.forEach((item, ord) => writes.push({ op: 'set', path: SCHEMA.tasks.docPath(input.familyId, item.id), data: SCHEMA.tasks.toDoc(item, ctx, { ord }) }));
  await commitAll(writes);
}

/** True when the seed child exists on the server: batch 2 is all or nothing, so then it is all there. */
export async function isSeeded(familyId: string, childId: string): Promise<boolean> {
  const snap = await acked(getDocFromServer(doc(db(), childPath(familyId, childId))));
  return snap.exists();
}

export interface FamilyInfo {
  name: string;
  owner: string;
}

export interface SnapshotMeta {
  /** True when the data did not come from the server (no connection, or not answered yet). */
  fromCache: boolean;
}

type Stop = () => void;
type OnError = (error: LinkError, refused: boolean) => void;

const failWith = (onError: OnError) => (e: unknown) => onError(toLinkError(e), isRefusal(e));

/** Listens to families/{fid}. `info` is null when the document does not exist. */
export function listenFamily(familyId: string, onData: (info: FamilyInfo | null, meta: SnapshotMeta) => void, onError: OnError): Stop {
  return onSnapshot(
    doc(db(), familyPath(familyId)),
    { includeMetadataChanges: true },
    (snap) => {
      const data = snap.data();
      const info = data && typeof data.name === 'string' && typeof data.owner === 'string' ? { name: data.name, owner: data.owner } : null;
      onData(info, { fromCache: snap.metadata.fromCache });
    },
    failWith(onError),
  );
}

/** Parent: renames the family. */
export async function renameFamily(familyId: string, name: string): Promise<void> {
  await acked(updateDoc(doc(db(), familyPath(familyId)), { name }));
}

// ---------------------------------------------------------------------------------------------
// Members and devices
// ---------------------------------------------------------------------------------------------

export interface MemberDoc {
  uid: string;
  role: LinkRole;
  childId: string | null;
  name: string;
  platform: string;
  /** Milliseconds. While the server's time is still on its way, this device's estimate of it. */
  joinedAt: number;
}

export interface DeviceDoc {
  id: string;
  uid: string;
  name: string;
  platform: string;
  lastSeenAt: number | null;
}

function toMember(uid: string, data: DocumentData | undefined): MemberDoc | null {
  if (!data || (data.role !== 'parent' && data.role !== 'child')) return null;
  return {
    uid,
    role: data.role,
    childId: typeof data.childId === 'string' ? data.childId : null,
    name: typeof data.name === 'string' ? data.name : 'Device',
    platform: typeof data.platform === 'string' ? data.platform : 'unknown',
    joinedAt: millisOf(data.joinedAt) ?? Date.now(),
  };
}

/** Reads one member record from the server. Null when there is none. Rejects when the caller is not in the family. */
export async function readMember(familyId: string, uid: string): Promise<MemberDoc | null> {
  const snap = await acked(getDocFromServer(doc(db(), memberPath(familyId, uid))));
  return toMember(uid, snap.data());
}

export function listenMembers(familyId: string, onData: (members: MemberDoc[], meta: SnapshotMeta) => void, onError: OnError): Stop {
  return onSnapshot(
    collection(db(), `${familyPath(familyId)}/members`),
    { includeMetadataChanges: true },
    (snap) => {
      const members: MemberDoc[] = [];
      for (const d of snap.docs) {
        const member = toMember(d.id, d.data({ serverTimestamps: 'estimate' }));
        if (member) members.push(member);
      }
      onData(members, { fromCache: snap.metadata.fromCache });
    },
    failWith(onError),
  );
}

export function listenDevices(familyId: string, onData: (devices: DeviceDoc[], meta: SnapshotMeta) => void, onError: OnError): Stop {
  return onSnapshot(
    collection(db(), `${familyPath(familyId)}/devices`),
    { includeMetadataChanges: true },
    (snap) => {
      const devices: DeviceDoc[] = [];
      for (const d of snap.docs) {
        const data = d.data({ serverTimestamps: 'estimate' });
        if (typeof data.uid !== 'string') continue;
        devices.push({
          id: d.id,
          uid: data.uid,
          name: typeof data.name === 'string' ? data.name : 'Device',
          platform: typeof data.platform === 'string' ? data.platform : 'unknown',
          lastSeenAt: millisOf(data.lastSeenAt),
        });
      }
      onData(devices, { fromCache: snap.metadata.fromCache });
    },
    failWith(onError),
  );
}

/** Parent: renames a member, or points a child's phone at another child profile. The role never changes. */
export async function relabelMember(familyId: string, uid: string, change: { name?: string; childId?: string }): Promise<void> {
  const fields: DocumentData = {};
  if (change.name !== undefined) fields.name = change.name;
  if (change.childId !== undefined) fields.childId = change.childId;
  if (Object.keys(fields).length === 0) return;
  await acked(updateDoc(doc(db(), memberPath(familyId, uid)), fields));
}

/**
 * Parent: removes a member (never the founder) together with that account's "last seen" records.
 * `deviceIds`: the ids of the devices documents whose `uid` is that account.
 */
export async function removeMember(familyId: string, uid: string, deviceIds: readonly string[]): Promise<void> {
  // The member record goes first and by itself: that is what ends the account's access, and it
  // must not depend on anything else. (In one batch with the "last seen" records, a device that
  // had written many of those could have made the batch too large for the server to accept.)
  await acked(deleteDoc(doc(db(), memberPath(familyId, uid))));
  // Tidying up its "last seen" records comes after, a few at a time, and may fail without harm.
  for (let i = 0; i < deviceIds.length; i += 10) {
    const chunk = deviceIds.slice(i, i + 10);
    await commitAll(chunk.map((id): BatchWrite => ({ op: 'delete', path: devicePath(familyId, id) }))).catch(() => {});
  }
}

/** A removed device tidies away its own "last seen" record (the rules allow exactly that). */
export async function deleteOwnDevice(familyId: string, deviceId: string): Promise<void> {
  await acked(deleteDoc(doc(db(), devicePath(familyId, deviceId))));
}

/**
 * A device leaves by itself (SPEC 3.3): its "last seen" record, its member record, then its
 * pointer. Only the member record has to succeed; the other two are tidied up when possible.
 * Stop listening before calling this: once the member record is gone every listener is refused.
 */
export async function leaveFamily(familyId: string, uid: string, deviceId: string): Promise<void> {
  // Each on its own: deleting a document that is not there is refused by the rules, and must not
  // take the member record's removal down with it.
  await acked(deleteDoc(doc(db(), devicePath(familyId, deviceId)))).catch(() => {});
  await acked(deleteDoc(doc(db(), memberPath(familyId, uid))));
  await deleteUserPointer(uid).catch(() => {});
}

/** "Last seen" for this installed app. Not waited for: presence is a nicety and its failure is not reported. */
export function writePresence(familyId: string, deviceId: string, device: { uid: string; name: string; platform: string }): void {
  setDoc(doc(db(), devicePath(familyId, deviceId)), { uid: device.uid, name: device.name, platform: device.platform, lastSeenAt: SERVER_TIME }).catch(() => {});
}

/** A child device says goodbye in the parents' feed. Best effort: resolves either way. */
export async function writeLeftAlert(familyId: string, uid: string, childId: string, childName: string): Promise<void> {
  const first = childName.split(' ')[0] || 'A child';
  const data = { kind: 'left', childId, icon: 'x-circle', color: '#F5A623', title: `${first}’s phone left the family`, body: 'It was unlinked on the phone itself.', unread: true, at: SERVER_TIME, by: uid };
  await acked(setDoc(doc(db(), `${familyPath(familyId)}/alerts/${newId('n')}`), data)).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------------------------

export interface PairingDoc {
  code: string;
  familyId: string;
  role: LinkRole;
  createdBy: string;
  /** Milliseconds, by the clock of the phone that made the code. */
  expiresAt: number;
  claimedBy: string | null;
  claimName: string | null;
  claimPlatform: string | null;
  approved: boolean;
}

function toPairing(snap: DocumentSnapshot): PairingDoc | null {
  const data = snap.data();
  if (!data || typeof data.familyId !== 'string' || (data.role !== 'parent' && data.role !== 'child')) return null;
  return {
    code: snap.id,
    familyId: data.familyId,
    role: data.role,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    expiresAt: millisOf(data.expiresAt) ?? 0,
    claimedBy: typeof data.claimedBy === 'string' ? data.claimedBy : null,
    claimName: typeof data.claimName === 'string' ? data.claimName : null,
    claimPlatform: typeof data.claimPlatform === 'string' ? data.claimPlatform : null,
    approved: data.approved === true,
  };
}

/**
 * Parent: puts a fresh code on offer for 15 minutes. A code that happens to exist already is
 * refused by the rules (it would be a change to somebody's code), and another one is tried.
 * If the server's answer comes after this has given up, the code is taken back.
 */
export async function createPairing(familyId: string, uid: string, role: LinkRole): Promise<{ code: string; role: LinkRole; expiresAt: number }> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = randomPairingCode();
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    const ref = doc(db(), pairingPath(code));
    const data = {
      familyId,
      role,
      createdBy: uid,
      createdAt: SERVER_TIME,
      expiresAt: Timestamp.fromMillis(expiresAt),
      claimedBy: null,
      claimName: null,
      claimPlatform: null,
      claimedAt: null,
      approved: false,
    };
    try {
      await acked(setDoc(ref, data), () => void deleteDoc(ref).catch(() => {}));
      return { code, role, expiresAt };
    } catch (e) {
      last = e;
      if (toLinkError(e).code !== 'permission') throw toLinkError(e);
    }
  }
  throw toLinkError(last);
}

/**
 * Joining device: claims a code without being able to read it first. The rules accept the claim
 * only for a code that exists, is unclaimed and has not run out; every other case is refused the
 * same way, so a guess learns nothing. Rejects with 'invalid-code' then.
 * If the server's answer comes after this has given up, the claim is withdrawn.
 */
export async function claimPairing(code: string, uid: string, name: string, platform: string): Promise<void> {
  const ref = doc(db(), pairingPath(code));
  try {
    await acked(updateDoc(ref, { claimedBy: uid, claimName: name, claimPlatform: platform, claimedAt: SERVER_TIME }), () => void deleteDoc(ref).catch(() => {}));
  } catch (e) {
    const failure = toLinkError(e);
    if (failure.code === 'permission' || errorCode(e) === 'not-found') throw new LinkError('invalid-code', 'That code is not valid or has expired. Ask for a new one.');
    throw failure;
  }
}

/**
 * Listens to one pairing code: the parent who made it, or the device that claimed it. `pairing` is
 * null when the document is gone. A device whose claim was declined is refused instead (the rules
 * cannot show it a document that no longer exists): `onError` with `refused` true.
 */
/**
 * The pairing document as the server holds it now (never this device's cache). Rejects when the
 * server cannot be reached; a refusal means the document is gone (the rules cannot show a device a
 * code that no longer exists), and resolves to null like a missing one.
 */
export async function readPairingFromServer(code: string): Promise<PairingDoc | null> {
  try {
    const snap = await acked(getDocFromServer(doc(db(), pairingPath(code))));
    return snap.exists() ? toPairing(snap) : null;
  } catch (e) {
    if (isRefusal(e)) return null;
    throw e;
  }
}

export function listenPairing(code: string, onData: (pairing: PairingDoc | null, meta: SnapshotMeta) => void, onError: OnError): Stop {
  return onSnapshot(
    doc(db(), pairingPath(code)),
    { includeMetadataChanges: true },
    (snap) => onData(snap.exists() ? toPairing(snap) : null, { fromCache: snap.metadata.fromCache }),
    failWith(onError),
  );
}

/**
 * Parent: approves the device that claimed the code (SPEC 3.2 step 3), in one batch:
 * - `newChild`: creates that child profile, with the claiming phone as its device;
 * - otherwise, for a child's phone, sets `deviceName` of the chosen child to the phone's name;
 * - creates the member record of the claiming account (`childId` null for a parent code);
 * - marks the code as used.
 */
export async function approvePairing(input: {
  familyId: string;
  /** The approving parent. */
  uid: string;
  pairing: PairingDoc;
  /** The child the phone is enrolled as; null for a parent code. */
  childId: string | null;
  /** Set when `childId` is a child that does not exist yet: its name and, when known, its age. */
  newChild?: { name: string; age?: number };
}): Promise<void> {
  const { familyId, uid, pairing, childId } = input;
  if (!pairing.claimedBy || !pairing.claimName || !pairing.claimPlatform) throw new LinkError('no-claim', 'No device has used this code yet.');
  const writes: BatchWrite[] = [];
  if (pairing.role === 'child') {
    if (!childId) throw new LinkError('invalid-input', 'Choose which child this phone belongs to.');
    if (input.newChild) {
      const ctx: SyncCtx = { familyId, uid, role: 'parent', childId: null, serverTimestamp: SERVER_TIME };
      const child = { ...makeChild(childId, input.newChild.name, input.newChild.age), deviceName: pairing.claimName };
      writes.push({ op: 'set', path: childPath(familyId, childId), data: SCHEMA.children.toDoc(child, ctx) });
    } else {
      writes.push({ op: 'update', path: childPath(familyId, childId), data: { deviceName: pairing.claimName } });
    }
  }
  writes.push({
    op: 'set',
    path: memberPath(familyId, pairing.claimedBy),
    data: {
      role: pairing.role,
      childId: pairing.role === 'child' ? childId : null,
      name: pairing.claimName,
      platform: pairing.claimPlatform,
      joinedAt: SERVER_TIME,
      addedBy: uid,
      code: pairing.code,
    },
  });
  writes.push({ op: 'update', path: pairingPath(pairing.code), data: { approved: true } });
  await commitAll(writes);
}

/** Withdraws a code, declines a claim, cancels one's own claim, or tidies a used code away. */
export async function deletePairing(code: string): Promise<void> {
  await acked(deleteDoc(doc(db(), pairingPath(code))));
}

// ---------------------------------------------------------------------------------------------
// The synced slices: listeners
// ---------------------------------------------------------------------------------------------

/** One document of a snapshot, as ./reconcile's `decodeSnapshot` and the `fromDoc` codecs take it. */
export interface SnapshotDoc {
  id: string;
  /**
   * The fields, with every time in milliseconds. A server time that is still on its way reads as
   * null (the SDK's default), which is what the engine expects: "not known yet, keep the time this
   * device has". An estimate would change once the server answered, and the engine compares times.
   */
  data: DocData;
  /** `metadata.hasPendingWrites`: the document carries a write of this device the server has not confirmed. */
  pending: boolean;
}

/**
 * Attaches the listener for one entry of `schema.listenersFor`: a query (`orderBy`, then `limit`
 * when bounded; single-field index only) or a single document. A single document arrives as a
 * list of one, or an empty list when it does not exist.
 * Metadata changes are included, so the listener also fires when a pending write is confirmed and
 * when the connection comes or goes (`meta.fromCache`).
 */
export function listenPlan(plan: ListenerPlan, onData: (docs: SnapshotDoc[], meta: SnapshotMeta) => void, onError: OnError): Stop {
  if (plan.kind === 'doc') {
    return onSnapshot(
      doc(db(), plan.path),
      { includeMetadataChanges: true },
      (snap) => {
        const data = snap.data();
        onData(data ? [{ id: snap.id, data: normaliseTimes(data), pending: snap.metadata.hasPendingWrites }] : [], { fromCache: snap.metadata.fromCache });
      },
      failWith(onError),
    );
  }
  const base = collection(db(), plan.path);
  const ordered = plan.orderBy ? query(base, orderBy(plan.orderBy, plan.dir ?? 'asc')) : query(base);
  const bounded = plan.limit != null ? query(ordered, limitTo(plan.limit)) : ordered;
  return onSnapshot(
    bounded,
    { includeMetadataChanges: true },
    (snap) => {
      onData(
        snap.docs.map((d) => ({ id: d.id, data: normaliseTimes(d.data()), pending: d.metadata.hasPendingWrites })),
        { fromCache: snap.metadata.fromCache },
      );
    },
    failWith(onError),
  );
}

/** Reads one document from the server. Null when it does not exist. Rejects when it cannot be read. */
export async function fetchDoc(path: string): Promise<SnapshotDoc | null> {
  const snap = await acked(getDocFromServer(doc(db(), path)));
  const data = snap.data();
  return data ? { id: snap.id, data: normaliseTimes(data), pending: false } : null;
}

// ---------------------------------------------------------------------------------------------
// The synced slices: writes
// ---------------------------------------------------------------------------------------------

/** Thrown inside the transaction of a write with `expect` when the stored document has moved on. */
class Stale extends Error {}

/**
 * Sends one write of the engine. The promise settles when the server has answered: resolved means
 * stored, rejected means refused (by the rules, or because the document is not what the write
 * expected). Without a connection a plain write stays queued in the SDK and the promise stays
 * open; a write with `expect` is a transaction, which needs a connection and fails at once.
 *
 * create  setDoc on a new document
 * update  updateDoc with only the changed fields (and the role's stamps)
 * delete  deleteDoc
 * set     setDoc of a whole single document (signals/sos, live/status); with `expect` only if the
 *         stored document still has that `at` (see SetWrite in ./reconcile)
 *
 * The data already carries `serverTime()` where the rules want the server's time.
 */
export function executeWrite(write: Write): Promise<void> {
  const ref = doc(db(), write.path);
  if (write.op === 'create') return setDoc(ref, write.data as DocumentData);
  if (write.op === 'update') return updateDoc(ref, write.fields as DocumentData);
  if (write.op === 'delete') return deleteDoc(ref);
  const expect = write.expect;
  if (!expect) return setDoc(ref, write.data as DocumentData);
  return runTransaction(
    db(),
    async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.data();
      if (!stored || millisOf(stored.at) !== expect.at) throw new Stale('the document is not the one that was expected');
      tx.set(ref, write.data as DocumentData);
    },
    { maxAttempts: 2 },
  );
}

/** A sentence for a write that did not go through, shown briefly (LinkState.error). */
export function refusalMessage(write: Write, e: unknown): string {
  if (e instanceof Stale) return 'That SOS had already changed on another phone. Nothing was sent.';
  const failure = toLinkError(e);
  if (failure.code === 'network') return write.op === 'set' ? "That needs a connection and the server can't be reached. It was not sent." : failure.message;
  if (failure.code === 'permission') return 'The server did not accept that change, so it was put back.';
  return 'A change could not be saved, so it was put back.';
}
