import type { PersistedState } from '@/state/persist';

/**
 * Linking two phones.
 *
 * Haven and Haven Kids on different phones share one "family" document in Cloud Firestore.
 * A parent creates the family and a short-lived pairing code; a child enters the code and joins.
 * From then on every change to the shared state on one phone reaches the other while both apps
 * are open. Without a Firebase config in the build, linking is switched off and each app keeps
 * its own data, exactly as before.
 *
 * Firestore data model (see firestore.rules):
 *
 *   pairing/{CODE}        { familyId: string, createdAt: Timestamp, expiresAt: Timestamp }
 *   families/{familyId}   { v: 1, createdAt: Timestamp, updatedAt: Timestamp,
 *                           state: SyncedState,
 *                           members: { [deviceId]: MemberRecord } }
 *
 * There are no user accounts in this build. A family id is a long random string and works as
 * the key to that family's data; the pairing code is only a short-lived way to hand that key to
 * another phone. That is demo-grade security and the docs say so.
 */

/** Everything the two phones share. `activeChildId` is a per-device choice and stays local. */
export type SyncedState = Omit<PersistedState, 'activeChildId'>;
export type SyncedSlice = keyof SyncedState;

export const SYNCED_SLICES: readonly SyncedSlice[] = [
  'children',
  'requests',
  'alerts',
  'places',
  'tasks',
  'schedules',
  'messages',
  'sites',
  'sosActive',
];

export const FAMILY_DOC_VERSION = 1;
export const FAMILIES = 'families';
export const PAIRING = 'pairing';

/** Pairing codes: 8 characters without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX. */
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIRING_TTL_MS = 15 * 60 * 1000;

export type LinkRole = 'parent' | 'child';

export interface MemberRecord {
  role: LinkRole;
  /** A friendly device label, for example "Parent phone" or "Mia's phone". */
  name: string;
  /** 'android' | 'ios' | 'web' */
  platform: string;
  joinedAt: number;
  lastSeenAt: number;
}

export interface LinkedDevice extends MemberRecord {
  id: string;
  isThisDevice: boolean;
}

export interface PairingCode {
  /** Raw code, PAIRING_CODE_LENGTH characters from PAIRING_CODE_ALPHABET. */
  code: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

/**
 * unconfigured  this build has no Firebase config; linking is unavailable
 * unlinked      configured, but this device has not joined a family
 * connecting    joining, creating, or waiting for the first data after a restart
 * linked        joined and in sync
 * offline       joined, but the server cannot be reached right now; changes are kept and sent later
 * error         joined, but the last sync failed for another reason (see `error`)
 */
export type LinkStatus = 'unconfigured' | 'unlinked' | 'connecting' | 'linked' | 'offline' | 'error';

export type LinkErrorCode =
  | 'not-configured'
  | 'invalid-code'
  | 'code-not-found'
  | 'code-expired'
  | 'family-missing'
  | 'already-linked'
  | 'network'
  | 'permission'
  | 'unknown';

/** Thrown by the link actions. `message` is written for the person using the app. */
export class LinkError extends Error {
  code: LinkErrorCode;
  constructor(code: LinkErrorCode, message: string) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
  }
}

export interface LinkState {
  status: LinkStatus;
  /** True when this build carries a Firebase config. */
  configured: boolean;
  familyId: string | null;
  /** The side this device joined as, or null when not linked. */
  role: LinkRole | null;
  /** Every device in the family, this one included. Empty when not linked. */
  devices: LinkedDevice[];
  /** Parent side: the code currently on offer, or null. Cleared when it expires or is used. */
  pairingCode: PairingCode | null;
  /** When shared data was last sent or received, in milliseconds since the epoch. */
  lastSyncedAt: number | null;
  /** A sentence for the person using the app when status is 'error' or 'offline'. */
  error: string | null;
  /**
   * Parent: creates the family on first use (seeded with this device's current data), then a
   * fresh pairing code. Rejects with a LinkError.
   */
  createPairingCode: () => Promise<PairingCode>;
  /**
   * Child (or a second parent device): joins the family the code points to and replaces this
   * device's data with the family's. Accepts the code with or without the dash, any letter case.
   * Rejects with a LinkError.
   */
  joinWithCode: (code: string, role: LinkRole) => Promise<void>;
  /** Leaves the family. This device keeps its current data, which stops updating. */
  unlink: () => Promise<void>;
}

/** "ABCD-2345" */
export function formatPairingCode(code: string): string {
  const clean = normalisePairingCode(code);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** Upper-cases, drops anything that is not in the alphabet (dashes, spaces). */
export function normalisePairingCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((ch) => PAIRING_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, PAIRING_CODE_LENGTH);
}
