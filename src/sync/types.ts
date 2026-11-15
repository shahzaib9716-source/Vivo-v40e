/**
 * Linking phones (data layout v2): the contract between the link layer and the screens.
 *
 * A parent signs in with an email address and creates the family. A child's phone signs in
 * anonymously when it enters a pairing code, and becomes a member only once a parent approves the
 * claim. Who may read or write what is decided by firestore.rules on the server; the role in
 * `LinkState.role` is the one the server gave this account, not the side of the app that is open.
 *
 * Without a Firebase config in the build, linking is switched off (`status: 'unconfigured'`) and
 * the app keeps its sample data.
 *
 * Pure: no firebase, no react, no react-native.
 */

// ---------------------------------------------------------------------------------------------
// LinkState v2 (SPEC section 5)
// ---------------------------------------------------------------------------------------------

export type LinkRole = 'parent' | 'child';
export type LinkStatus =
  | 'unconfigured'  // this build has no Firebase config
  | 'signed-out'    // no account on this device: sample data only
  | 'needs-family'  // a parent account is signed in but has no family yet
  | 'waiting'       // a code was claimed; waiting for a parent to approve
  | 'connecting' | 'linked' | 'offline' | 'error'
  | 'removed';      // a parent removed this device from the family

export interface Account { uid: string; email: string | null; emailVerified: boolean; anonymous: boolean }
export interface FamilyMember {
  uid: string; role: LinkRole; childId: string | null; name: string; platform: string;
  joinedAt: number; lastSeenAt: number | null; isThisAccount: boolean; isOwner: boolean;
}
export interface PairingOffer {
  code: string; role: LinkRole; expiresAt: number;
  claim: { uid: string; name: string; platform: string; check: string } | null;
}
export interface PendingJoin { code: string; check: string; since: number }

export interface LinkState {
  status: LinkStatus;
  configured: boolean;
  account: Account | null;
  familyId: string | null;
  familyName: string | null;
  role: LinkRole | null;        // server-assigned; null unless linked
  childId: string | null;       // for a child device: which child profile it is
  members: FamilyMember[];
  offer: PairingOffer | null;   // parent: the code on offer and who claimed it
  pendingJoin: PendingJoin | null;
  lastSyncedAt: number | null;
  error: string | null;
  // parent account
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  sendVerification(): Promise<void>;
  refreshAccount(): Promise<Account | null>;   // reload + fresh token; picks up emailVerified
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  // family (parent)
  createFamily(input: { familyName: string; childName: string; childAge?: number }): Promise<void>;
  createPairingCode(role: LinkRole): Promise<PairingOffer>;
  cancelPairingCode(): Promise<void>;
  approveClaim(target: { childId: string } | { newChildName: string } | null): Promise<void>; // null for a parent code
  declineClaim(): Promise<void>;
  removeMember(uid: string): Promise<void>;
  // joining with a code
  joinWithCode(code: string): Promise<void>;   // resolves once claimed; status is then 'waiting'
  cancelJoin(): Promise<void>;
  unlink(): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

export type LinkErrorCode =
  /** This build has no Firebase config. */
  | 'not-configured'
  /** The action needs an account (or a real, non-anonymous one) and there is none. */
  | 'not-signed-in'
  /** The email address of the account has not been confirmed yet. */
  | 'email-not-verified'
  /** The action needs a linked family, or a parent in it, and this device is not that. */
  | 'not-linked'
  /** This device is already in a family, or already has a family. */
  | 'already-linked'
  /** Sign-in: wrong email or password. */
  | 'wrong-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'invalid-email'
  | 'too-many-attempts'
  /** The pairing code has the wrong length, is not valid, or has expired (not told apart). */
  | 'invalid-code'
  /** A parent declined the request to join, or it ran out. */
  | 'declined'
  /** There is no claim to approve or decline, or no code on offer. */
  | 'no-claim'
  /** The server could not be reached. Nothing was changed. */
  | 'network'
  /** The server refused: this account may not do that. */
  | 'permission'
  /** What was typed cannot be used (an empty name, for example). */
  | 'invalid-input'
  | 'unknown';

/** Thrown by every link action. `message` is a sentence for the person using the app. */
export class LinkError extends Error {
  code: LinkErrorCode;
  constructor(code: LinkErrorCode, message: string) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
  }
}

export const OFFLINE_MESSAGE = "Can't reach the server. Check the internet connection and try again.";

// ---------------------------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------------------------

/** 8 characters without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX. The same alphabet as firestore.rules. */
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** How long a code can be claimed. The server measures the same 15 minutes on its own clock. */
export const PAIRING_TTL_MS = 15 * 60 * 1000;
/** A claim made just before the end can still be approved for this much longer (firestore.rules, codeApprovable). */
export const PAIRING_APPROVE_GRACE_MS = 15 * 60 * 1000;
/** How many characters of the claimer's account id both phones show, so the parent can tell the right phone. */
export const PAIRING_CHECK_LENGTH = 4;

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

/** A fresh code. `random` exists for tests. */
export function randomPairingCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    out += PAIRING_CODE_ALPHABET[Math.min(PAIRING_CODE_ALPHABET.length - 1, Math.floor(random() * PAIRING_CODE_ALPHABET.length))];
  }
  return out;
}

/** The 4-character check shown on both phones: the end of the claimer's account id, upper-cased. */
export function pairingCheck(uid: string): string {
  return uid.slice(-PAIRING_CHECK_LENGTH).toUpperCase();
}

/**
 * True when what a parent typed is the check, reading characters that look alike as the same:
 * account ids can contain 0 and O, 1, I and L, which are easy to mix up when read off a screen.
 * Folding them costs almost nothing: a phone that is not the right one still differs in the
 * other characters, or in the remaining ones at least most of the time.
 */
export function sameCheck(typed: string, check: string): boolean {
  const fold = (s: string) => s.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  return typed.trim().length === check.length && fold(typed) === fold(check);
}

// ---------------------------------------------------------------------------------------------
// What this device remembers about its link (AsyncStorage)
// ---------------------------------------------------------------------------------------------

/** The link record. Version 1 (`haven.link.v1`, the link without accounts) is ignored and removed. */
export const LINK_KEY = 'haven.link.v2';
export const OLD_LINK_KEYS: readonly string[] = ['haven.link.v1'];
/** A random id for this installed app, for its "last seen" record. Not family data: it survives unlinking. */
export const DEVICE_KEY = 'haven.device.v1';

/** A family that was created and has not been filled yet (SPEC 3.1 step 3). Ids are fixed so repeating is harmless. */
export interface PendingSeed {
  /** False until the first batch (family, member record, account pointer) is known to have been stored. */
  familyStored: boolean;
  familyName: string;
  childId: string;
  childName: string;
  childAge: number | null;
}

/** The family this device is in, as far as it knows. */
export interface LinkedFamily {
  familyId: string;
  /** The role the server gave this account. */
  role: LinkRole;
  /** A child device: the child profile it is enrolled as. A parent: null. */
  childId: string | null;
  familyName: string | null;
  /**
   * SPEC 4.2 rule 2. True from the moment the device joins, signs in or creates the family until
   * every listener has taken the server's data in: until then the local data is not authoritative
   * and nothing is uploaded from it. Written before anything else happens.
   */
  adopt: boolean;
  pendingSeed: PendingSeed | null;
  /** True while users/{uid} still has to be written (the write failed when the device joined). */
  pointerPending: boolean;
  /**
   * The pairing code this device joined with, until its document has been tidied away (SPEC 3.2
   * step 4). Kept here so that a device killed right after joining still removes it on its next start.
   */
  usedCode: string | null;
  /** A parent: the pairing code on offer, so a restart goes on listening for its claim. */
  offer: { code: string; role: LinkRole; expiresAt: number } | null;
}

/** The whole record, one JSON value under LINK_KEY. */
export interface LinkRecord {
  v: 2;
  /** The account the rest belongs to. A record of another account is ignored. */
  uid: string;
  family: LinkedFamily | null;
  /** A claimed code that is waiting for a parent, so a restart goes on waiting. */
  pendingJoin: PendingJoin | null;
  /** Set when a parent removed this device, so the next start can still say so. Cleared by the next action. */
  removed: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isRole = (v: unknown): v is LinkRole => v === 'parent' || v === 'child';
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseSeed(v: unknown): PendingSeed | null {
  if (!isObject(v) || !isText(v.familyName) || !isText(v.childId) || !isText(v.childName)) return null;
  return {
    familyStored: v.familyStored === true,
    familyName: v.familyName,
    childId: v.childId,
    childName: v.childName,
    childAge: isTime(v.childAge) ? v.childAge : null,
  };
}

function parseFamily(v: unknown): LinkedFamily | null {
  if (!isObject(v) || !isText(v.familyId) || !isRole(v.role)) return null;
  const offer = isObject(v.offer) && isText(v.offer.code) && isRole(v.offer.role) && isTime(v.offer.expiresAt)
    ? { code: v.offer.code, role: v.offer.role, expiresAt: v.offer.expiresAt }
    : null;
  return {
    familyId: v.familyId,
    role: v.role,
    childId: isText(v.childId) ? v.childId : null,
    familyName: isText(v.familyName) ? v.familyName : null,
    // Anything but an explicit false means "not settled in yet".
    adopt: v.adopt !== false,
    pendingSeed: parseSeed(v.pendingSeed),
    pointerPending: v.pointerPending === true,
    usedCode: isText(v.usedCode) ? v.usedCode : null,
    offer,
  };
}

/** The stored record, or null when there is none or it cannot be used. Never throws. */
export function parseLinkRecord(raw: string | null | undefined): LinkRecord | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(v) || v.v !== 2 || typeof v.uid !== 'string') return null;
  const join = v.pendingJoin;
  const pendingJoin = isObject(join) && isText(join.code) && typeof join.check === 'string' && isTime(join.since) ? { code: join.code, check: join.check, since: join.since } : null;
  return { v: 2, uid: v.uid, family: parseFamily(v.family), pendingJoin, removed: v.removed === true };
}
