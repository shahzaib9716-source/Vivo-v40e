/**
 * The link layer without React: who is signed in, which family this device is in, the pairing
 * flows, and the sync session (./engine) for a linked device. ./link.tsx mirrors `getView()` into
 * React and forwards the store to it; everything asynchronous happens here.
 *
 * What is running is decided in one place, `decide()`, from two facts: the signed-in account
 * (./auth) and the link record in storage (LINK_KEY, see ./types):
 *
 *   a family in the record       a session: listeners for the family, its members and devices, and
 *                                the engine for the synced data
 *   a claimed code in the record a listener on that code, until a parent approves or declines
 *   a parent account, no family  one look at users/{uid} on the server: an existing family is opened
 *   nothing                      sample data
 *
 * Local data and the family (SPEC 3.3, 4.2 rule 2): the record says `adopt` before a session first
 * starts, the engine then replaces the local slices with the server's, and on unlinking, removal
 * and sign-out the store goes back to the sample data and the record is removed.
 */
import { Platform, Vibration } from 'react-native';

import { readKey, removeKey, writeKey } from '@/state/storage';
import type { ApplyRemoteOptions, RemotePatch, StoredSyncRecord } from '@/state/store';
import * as accounts from './auth';
import { isBackendConfigured } from './config';
import { deviceLabel, platformName } from './device';
import { startEngine, type Engine, type EngineStatus, type LocalState, type Transport } from './engine';
import { newId } from './ids';
import * as remote from './remote';
import type { SyncCtx } from './schema';
import {
  DEVICE_KEY,
  LINK_KEY,
  LinkError,
  OFFLINE_MESSAGE,
  OLD_LINK_KEYS,
  PAIRING_APPROVE_GRACE_MS,
  PAIRING_CODE_LENGTH,
  normalisePairingCode,
  pairingCheck,
  parseLinkRecord,
  type Account,
  type FamilyMember,
  type LinkRecord,
  type LinkRole,
  type LinkState,
  type LinkStatus,
  type LinkedFamily,
  type PairingOffer,
  type PendingJoin,
} from './types';

/** The data half of LinkState. */
export type LinkView = Pick<
  LinkState,
  'status' | 'configured' | 'account' | 'familyId' | 'familyName' | 'role' | 'childId' | 'members' | 'offer' | 'pendingJoin' | 'lastSyncedAt' | 'error'
>;
/** The actions of LinkState. */
export type LinkActions = Omit<LinkState, keyof LinkView>;

/** The store, as far as the link layer uses it (see StoreProvider in @/state/store). */
export interface StoreHost {
  applyRemote(patch: RemotePatch, record?: unknown, options?: ApplyRemoteOptions): void;
  readSyncRecord(): StoredSyncRecord | null;
  resetDemoData(): void;
  setSelfChildId(id: string | null): void;
  setLive(live: boolean): void;
  /**
   * Called right after something was handed to the store, in the same tick: the provider puts
   * `seq` into a state of its own, so it commits together with what was handed over and comes
   * back through `storeChanged`. That is how the engine knows which hand-overs a commit includes.
   */
  mark(seq: number): void;
}

const OFFLINE_NOTE = 'No connection right now. Changes are kept on this device and sent when it is back.';
const DECLINED = 'The request was declined or has expired.';
const WITHDRAWN = 'A parent approved this phone and then removed it again. Ask for a new code.';
/** Taking in an approval that failed is tried again after this long, doubling up to a minute. */
const JOIN_RETRY_MS = 2000;
const JOIN_RETRY_MAX_MS = 60_000;
/** The join's deadline passed before the server had answered: check again this often. */
const JOIN_RECHECK_MS = 15_000;
const NOTICE_MS = 6000;
const PRESENCE_EVERY_MS = 60_000;
/**
 * How long the saved sign-in may stay unconfirmed at start before the status says "offline".
 * Firebase Auth checks a saved account with the server before it reports it; on a connection
 * that is up but dead, that check only gives up after 30 to 60 seconds (SPEC 4.2 rule 9).
 */
const ACCOUNT_WAIT_MS = 4000;

const TRANSPORT: Transport = {
  listen: (plan, onData, onError) => remote.listenPlan(plan, onData, onError),
  write: remote.executeWrite,
  fetch: remote.fetchDoc,
  explain: (write, error) => ({ message: remote.refusalMessage(write, error), offline: remote.toLinkError(error).code === 'network' }),
};

interface Session {
  key: string;
  familyId: string;
  uid: string;
  role: LinkRole;
  childId: string | null;
  stops: (() => void)[];
  engine: Engine | null;
  /** The engine starts once the store has shown a commit at least this new (see `bump`). */
  barrier: number;
  restored: StoredSyncRecord | null;
  status: EngineStatus | null;
  family: remote.FamilyInfo | null;
  members: remote.MemberDoc[];
  devices: remote.DeviceDoc[];
  lastBeat: number;
  beatTimer: ReturnType<typeof setInterval> | null;
  verifying: boolean;
  seeding: boolean;
  pointing: boolean;
  tidying: boolean;
}

interface CodeWatch {
  code: string;
  stop: () => void;
  timer: ReturnType<typeof setTimeout> | null;
  pairing: remote.PairingDoc | null;
  /** Join only: the approval is being taken in. */
  completing: boolean;
  /** Join only: true once the server itself (not this device's cache) has answered the listener. */
  serverSeen?: boolean;
  /** Join only: failed attempts at taking in the approval, and when the next one is due. */
  failures?: number;
  retryAt?: number;
  retryTimer?: ReturnType<typeof setTimeout> | null;
}

type Lookup = 'idle' | 'checking' | 'none' | 'failed';

const EMPTY_MEMBERS: FamilyMember[] = [];

const INITIAL_VIEW: LinkView = {
  status: isBackendConfigured ? 'connecting' : 'unconfigured',
  configured: isBackendConfigured,
  account: null,
  familyId: null,
  familyName: null,
  role: null,
  childId: null,
  members: EMPTY_MEMBERS,
  offer: null,
  pendingJoin: null,
  lastSyncedAt: null,
  error: null,
};

function cleanName(value: string, max: number, missing: string): string {
  const clean = value.trim();
  if (!clean) throw new LinkError('invalid-input', missing);
  return Array.from(clean).slice(0, max).join('');
}

function randomDeviceId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export class LinkController {
  private host: StoreHost | null = null;
  private alive = false;
  private subscribers = new Set<() => void>();
  private view: LinkView = INITIAL_VIEW;

  private account: Account | null = null;
  private accountKnown = !isBackendConfigured;
  private record: LinkRecord | null = null;
  private recordLoaded = !isBackendConfigured;
  private deviceId = '';
  private stopAccount: (() => void) | null = null;
  /** True once the saved sign-in has taken longer than ACCOUNT_WAIT_MS, until the server has been reached. */
  private accountSlow = false;
  private accountTimer: ReturnType<typeof setTimeout> | null = null;
  /** True until the first decision: only then may the engine use what the store saved last time. */
  private restoredAvailable = true;
  private firstDecision = true;
  /** While above zero a flow is rearranging things and `decide` waits for it. */
  private hold = 0;
  private active = true;

  /** The store's slices as last committed, and how many hand-overs that commit includes. */
  private local: LocalState | null = null;
  private localSeq = 0;
  private seq = 0;

  private session: Session | null = null;
  private offer: PairingOffer | null = null;
  private offerWatch: CodeWatch | null = null;
  private joinWatch: CodeWatch | null = null;

  private lookup: Lookup = 'idle';
  private creating = false;
  private createRetryDue = true;
  private removed = false;
  private notice: string | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  /** A problem that stays until the next action (a declined request, a failed lookup). */
  private problem: string | null = null;
  private memberCache: { members: remote.MemberDoc[]; devices: remote.DeviceDoc[]; owner: string | null; uid: string; out: FamilyMember[] } | null = null;

  // ---- wiring ----------------------------------------------------------------------------------

  /** Starts the link layer for a mounted provider. Returns the function that shuts it down. */
  attach(host: StoreHost): () => void {
    this.host = host;
    if (!isBackendConfigured) return () => {
      this.host = null;
    };
    this.alive = true;
    this.firstDecision = true;
    this.restoredAvailable = true;
    void this.load();
    this.accountSlow = false;
    this.accountTimer = setTimeout(() => {
      this.accountTimer = null;
      if (!this.alive || this.accountKnown) return;
      this.accountSlow = true;
      this.emit();
    }, ACCOUNT_WAIT_MS);
    this.stopAccount = accounts.onAccount((account) => {
      if (!this.alive) return;
      const changed = (this.account?.uid ?? null) !== (account?.uid ?? null);
      this.account = account;
      this.accountKnown = true;
      if (this.accountTimer != null) clearTimeout(this.accountTimer);
      this.accountTimer = null;
      // Without a family there is no "offline" to hold on to: a later join starts as "connecting".
      if (!this.record?.family) this.accountSlow = false;
      if (changed) this.lookup = 'idle';
      this.decide();
    });
    return () => {
      this.alive = false;
      if (this.stopAccount) this.stopAccount();
      this.stopAccount = null;
      this.stopSession();
      this.stopOffer();
      this.stopJoin();
      if (this.noticeTimer != null) clearTimeout(this.noticeTimer);
      if (this.accountTimer != null) clearTimeout(this.accountTimer);
      this.accountTimer = null;
      this.accountKnown = false;
      this.recordLoaded = false;
      this.host = null;
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };

  getView = (): LinkView => this.view;

  /** The store committed: its synced slices, and the last hand-over number that commit includes. */
  storeChanged(local: LocalState, seq: number): void {
    this.local = local;
    this.localSeq = seq;
    const s = this.session;
    if (!s) return;
    if (s.engine) s.engine.storeChanged(local, seq);
    else if (seq >= s.barrier) this.startSessionEngine(s);
  }

  /** The app came to the foreground or left it. */
  appActive(active: boolean): void {
    this.active = active;
    if (!active || !this.alive) return;
    if (this.lookup === 'failed') this.lookup = 'idle';
    // A join whose approval could not be taken in yet: try again now rather than after the wait.
    if (this.joinWatch) this.joinWatch.retryAt = 0;
    this.createRetryDue = true;
    const s = this.session;
    if (s) {
      this.beat(s);
      void this.continueSeed(s);
      void this.writePointer(s);
      void this.tidyCode(s);
    }
    this.decide();
  }

  private async load(): Promise<void> {
    const [storedId, raw] = await Promise.all([readKey(DEVICE_KEY), readKey(LINK_KEY)]);
    for (const key of OLD_LINK_KEYS) void removeKey(key);
    if (!this.alive) return;
    let id = storedId ?? '';
    if (!/^[a-z0-9]{8,32}$/.test(id)) {
      id = randomDeviceId();
      void writeKey(DEVICE_KEY, id);
    }
    this.deviceId = id;
    this.record = parseLinkRecord(raw);
    this.removed = this.record?.removed === true;
    this.recordLoaded = true;
    const family = this.record?.family;
    if (family && this.host && !(family.pendingSeed && !family.pendingSeed.familyStored)) {
      // This device believes it is in a family. The store is told at once, not only when the
      // session starts: the saved sign-in may take a while to be confirmed (see ACCOUNT_WAIT_MS),
      // and what is done meanwhile (a check-in, say) must already be worded for a real family.
      this.host.setLive(true);
      this.host.setSelfChildId(family.role === 'child' ? family.childId : null);
    }
    this.decide();
  }

  private saveRecord(): Promise<boolean> {
    return this.record ? writeKey(LINK_KEY, JSON.stringify(this.record)) : removeKey(LINK_KEY);
  }

  private patchFamily(change: Partial<LinkedFamily>): void {
    const record = this.record;
    if (!record || !record.family) return;
    this.record = { ...record, family: { ...record.family, ...change } };
    void this.saveRecord();
  }

  /** Numbers a hand-over to the store and tells the provider, so the number comes back with the commit. */
  private bump(): number {
    this.seq += 1;
    if (this.host) this.host.mark(this.seq);
    return this.seq;
  }

  /** No family data may stay readable on a device that is not in the family (SPEC 3.3). */
  private wipeLocal(): void {
    const host = this.host;
    if (!host) return;
    host.resetDemoData();
    host.setLive(false);
    host.setSelfChildId(null);
  }

  private flash(message: string): void {
    this.notice = message;
    if (this.noticeTimer != null) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = null;
      this.notice = null;
      this.emit();
    }, NOTICE_MS);
    this.emit();
  }

  // ---- what should be running --------------------------------------------------------------------

  private decide(): void {
    if (!this.alive || !this.host) return;
    if (!this.accountKnown || !this.recordLoaded || this.hold > 0) {
      this.emit();
      return;
    }
    const account = this.account;

    // A record of another account, or of nobody, is void, and so is the data that came with it.
    const stale = this.record;
    if (stale && (stale.family || stale.pendingJoin) && (!account || account.uid !== stale.uid)) {
      const hadFamily = stale.family !== null;
      this.stopSession();
      this.stopOffer();
      this.stopJoin();
      this.record = null;
      void this.saveRecord();
      if (hadFamily) this.wipeLocal();
    }
    const record = this.record;
    const family = record?.family ?? null;

    if (this.firstDecision) {
      this.firstDecision = false;
      if (!family) {
        this.restoredAvailable = false;
        // Family data without a link: the app was killed between unlinking and wiping.
        if (this.host.readSyncRecord() !== null) this.host.resetDemoData();
      }
    }

    if (family && account) {
      if (family.pendingSeed && !family.pendingSeed.familyStored) {
        // The family itself is not known to be stored yet (SPEC 3.1 step 2 was interrupted).
        if (this.createRetryDue && !this.creating) void this.resumeCreate().catch(() => {});
        this.emit();
        return;
      }
      this.ensureSession(account, family);
      this.emit();
      return;
    }

    this.stopSession();
    this.stopOffer();
    if (record?.pendingJoin && account) {
      this.ensureJoin(record.pendingJoin);
    } else {
      this.stopJoin();
      if (account && !account.anonymous) {
        if (this.lookup === 'idle') void this.runLookup(account);
      } else if (account) {
        // An anonymous account with nothing to wait for (a join that did not go through).
        void accounts.deleteAnonymousUser();
      }
    }
    this.emit();
  }

  /** A parent account without a family on this device: does it have one on the server? */
  private async runLookup(account: Account): Promise<void> {
    this.lookup = 'checking';
    const still = () => this.alive && this.account?.uid === account.uid && !this.record?.family;
    try {
      const pointer = await remote.readUserPointer(account.uid);
      if (!still()) return;
      if (!pointer) {
        this.lookup = 'none';
      } else {
        let member: remote.MemberDoc | null = null;
        try {
          member = await remote.readMember(pointer.familyId, account.uid);
        } catch (e) {
          // Refused: this account is not in that family (any more).
          if (!remote.isRefusal(e)) throw e;
        }
        if (!still()) return;
        if (member) {
          // SPEC 3.1 step 4: signing in on another device finds the family. Not authoritative yet.
          this.record = {
            v: 2,
            uid: account.uid,
            family: { familyId: pointer.familyId, role: member.role, childId: member.role === 'child' ? member.childId : null, familyName: null, adopt: true, pendingSeed: null, pointerPending: false, usedCode: null, offer: null },
            pendingJoin: null,
            removed: false,
          };
          this.removed = false;
          await this.saveRecord();
          this.lookup = 'idle';
        } else {
          // The pointer leads nowhere any more (removed from that family): tidy it away.
          void remote.deleteUserPointer(account.uid).catch(() => {});
          this.lookup = 'none';
        }
      }
      this.problem = null;
    } catch (e) {
      if (!still()) return;
      this.lookup = 'failed';
      this.problem = remote.toLinkError(e).message;
    }
    this.decide();
  }

  // ---- a linked session ----------------------------------------------------------------------------

  private ensureSession(account: Account, family: LinkedFamily): void {
    const host = this.host;
    if (!host) return;
    const childId = family.role === 'child' ? family.childId : null;
    const key = `${family.familyId}|${account.uid}|${family.role}|${childId ?? ''}`;
    if (this.session && this.session.key === key) return;
    this.stopSession();

    const restored = this.restoredAvailable ? host.readSyncRecord() : null;
    this.restoredAvailable = false;
    const s: Session = {
      key,
      familyId: family.familyId,
      uid: account.uid,
      role: family.role,
      childId,
      stops: [],
      engine: null,
      barrier: 0,
      restored,
      status: null,
      family: null,
      members: [],
      devices: [],
      lastBeat: 0,
      beatTimer: null,
      verifying: false,
      seeding: false,
      pointing: false,
      tidying: false,
    };
    this.session = s;
    host.setLive(true);
    host.setSelfChildId(childId);
    // The engine starts from a commit of the store that is certain to include everything queued
    // before this point (a reset to the sample data, for one).
    s.barrier = this.bump();

    const failed = (_error: LinkError, refused: boolean) => {
      if (this.session === s && refused) void this.verifyMembership(s);
    };
    s.stops.push(
      remote.listenFamily(
        s.familyId,
        (info) => {
          if (this.session !== s) return;
          s.family = info;
          if (info && this.record?.family && this.record.family.familyName !== info.name) this.patchFamily({ familyName: info.name });
          this.emit();
        },
        failed,
      ),
    );
    s.stops.push(
      remote.listenMembers(
        s.familyId,
        (members, meta) => {
          if (this.session !== s) return;
          s.members = members;
          if (!meta.fromCache) {
            const me = members.find((m) => m.uid === s.uid);
            if (!me) void this.verifyMembership(s);
            else if (me.role !== s.role || (me.role === 'child' ? me.childId : null) !== s.childId) this.enrolmentChanged(me);
          }
          this.emit();
        },
        failed,
      ),
    );
    s.stops.push(
      remote.listenDevices(
        s.familyId,
        (devices) => {
          if (this.session !== s) return;
          s.devices = devices;
          this.emit();
        },
        failed,
      ),
    );

    void this.writePointer(s);
    void this.tidyCode(s);
    void this.continueSeed(s);
    if (family.offer && family.role === 'parent') this.watchOffer(family.offer);
  }

  private startSessionEngine(s: Session): void {
    const local = this.local;
    if (!local || s.engine || this.session !== s) return;
    const ctx: SyncCtx = { familyId: s.familyId, uid: s.uid, role: s.role, childId: s.childId, serverTimestamp: remote.serverTime() };
    s.engine = startEngine({
      ctx,
      transport: TRANSPORT,
      local,
      seq: this.localSeq,
      restored: s.restored,
      host: {
        apply: (patch, record, options) => {
          const host = this.host;
          if (!host || this.session !== s) return this.seq;
          host.applyRemote(patch, record, options);
          return this.bump();
        },
        onStatus: (status) => {
          if (this.session !== s) return;
          s.status = status;
          // Settled in: from here on the local data counts (SPEC 4.2 rule 2).
          if (s.engine && s.engine.settledIn() && this.record?.family?.adopt) this.patchFamily({ adopt: false });
          if (status.connection === 'online') {
            this.accountSlow = false;
            this.beat(s);
            void this.continueSeed(s);
            void this.writePointer(s);
            void this.tidyCode(s);
          }
          this.emit();
        },
        onNotice: (message) => {
          if (this.session === s) this.flash(message);
        },
        onRefused: () => void this.verifyMembership(s),
        onSos: () => {
          // A parent's phone makes itself felt when an SOS comes in.
          if (s.role === 'parent' && Platform.OS !== 'web') Vibration.vibrate([0, 400, 200, 400]);
        },
      },
    });
    s.status = s.engine.status();
    s.beatTimer = setInterval(() => this.beat(s), PRESENCE_EVERY_MS + 1000);
    this.emit();
  }

  private stopSession(): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    if (s.engine) s.engine.stop();
    for (const stop of s.stops) stop();
    if (s.beatTimer != null) clearInterval(s.beatTimer);
  }

  /** "Last seen", at most once a minute while the app is in the foreground and the server is reachable. */
  private beat(s: Session): void {
    if (this.session !== s || !this.active || !s.engine || s.status?.connection !== 'online') return;
    const now = Date.now();
    if (now - s.lastBeat < PRESENCE_EVERY_MS) return;
    s.lastBeat = now;
    remote.writePresence(s.familyId, this.deviceId, { uid: s.uid, name: deviceLabel(), platform: platformName() });
  }

  /** users/{uid}, when it still has to be written after joining (SPEC 3.2 step 4). */
  private async writePointer(s: Session): Promise<void> {
    if (this.session !== s || s.pointing || !this.record?.family?.pointerPending) return;
    s.pointing = true;
    try {
      await remote.writeUserPointer(s.uid, { familyId: s.familyId, role: s.role });
      if (this.session === s) this.patchFamily({ pointerPending: false });
    } catch {
      // Tried again when the connection is back or the app returns to the foreground.
    }
    s.pointing = false;
  }

  /**
   * The pairing code this device joined with, when its document is still there (SPEC 3.2 step 4).
   * Tried at the start of every session until it has worked, so a device that was killed right
   * after joining does not leave the used code on the server for good.
   */
  private async tidyCode(s: Session): Promise<void> {
    const code = this.record?.family?.usedCode;
    if (this.session !== s || s.tidying || !code) return;
    s.tidying = true;
    try {
      await remote.deletePairing(code);
      if (this.session === s) this.patchFamily({ usedCode: null });
    } catch (e) {
      // Refused: the document is gone already. Anything else is tried again when the connection is back.
      if (remote.isRefusal(e) && this.session === s) this.patchFamily({ usedCode: null });
    }
    s.tidying = false;
  }

  /** Batch 2 of a new family, when it has not been confirmed yet (SPEC 3.1 step 3). */
  private async continueSeed(s: Session): Promise<void> {
    const seed = this.record?.family?.pendingSeed;
    if (this.session !== s || s.seeding || !seed || !seed.familyStored) return;
    s.seeding = true;
    try {
      const done = await remote.isSeeded(s.familyId, seed.childId);
      if (!done) await remote.seedFamilyBatch({ familyId: s.familyId, uid: s.uid, childId: seed.childId, childName: seed.childName, childAge: seed.childAge });
      if (this.session === s) this.patchFamily({ pendingSeed: null });
    } catch (e) {
      // Refused: repeating it would be refused again. Anything else is tried again later.
      if (remote.isRefusal(e) && this.session === s) this.patchFamily({ pendingSeed: null });
    }
    s.seeding = false;
  }

  /** A parent pointed this child's phone at another child profile: start over with that one. */
  private enrolmentChanged(me: remote.MemberDoc): void {
    this.patchFamily({ role: me.role, childId: me.role === 'child' ? me.childId : null, adopt: true });
    this.decide();
  }

  /** A listener was refused, or this account is missing from the members: still in the family? */
  private async verifyMembership(s: Session): Promise<void> {
    if (this.session !== s || s.verifying) return;
    s.verifying = true;
    let member: remote.MemberDoc | null = null;
    try {
      member = await remote.readMember(s.familyId, s.uid);
    } catch (e) {
      if (!remote.isRefusal(e)) {
        // Not reachable: nothing is known. The next refusal asks again.
        s.verifying = false;
        return;
      }
    }
    if (this.session !== s) return;
    if (member) {
      s.verifying = false;
      return;
    }
    await this.handleRemoved(s);
  }

  /** SPEC 3.3: a parent removed this device. Sample data again, and an anonymous account goes. */
  private async handleRemoved(s: Session): Promise<void> {
    this.hold += 1;
    const anonymous = this.account?.anonymous === true;
    this.stopSession();
    this.stopOffer();
    this.removed = true;
    this.record = { v: 2, uid: '', family: null, pendingJoin: null, removed: true };
    await this.saveRecord();
    this.wipeLocal();
    // Shown at once: the tidying below talks to the server and may take a while on a bad connection.
    this.emit();
    // Its own "last seen" record too: the parent's tidy-up may not have reached the server, and a
    // record left under this install's id would block this phone's presence if it is paired again.
    await remote.deleteOwnDevice(s.familyId, this.deviceId).catch(() => {});
    if (anonymous) {
      // The pointer leads nowhere any more, and once the account is gone nobody could remove it.
      await remote.deleteUserPointer(s.uid).catch(() => {});
      await accounts.deleteAnonymousUser();
    } else {
      void remote.deleteUserPointer(s.uid).catch(() => {});
      this.lookup = 'none';
    }
    this.hold -= 1;
    this.decide();
  }

  // ---- pairing: the parent's offer -----------------------------------------------------------------

  private watchOffer(stored: { code: string; role: LinkRole; expiresAt: number }): void {
    if (this.offerWatch && this.offerWatch.code === stored.code) return;
    this.stopOffer();
    const watch: CodeWatch = { code: stored.code, stop: () => {}, timer: null, pairing: null, completing: false };
    this.offerWatch = watch;
    this.offer = { code: stored.code, role: stored.role, expiresAt: stored.expiresAt, claim: null };
    const arm = () => {
      if (watch.timer != null) clearTimeout(watch.timer);
      // Unclaimed: until it runs out. Claimed: as long as the claim can still be approved.
      const until = stored.expiresAt + (this.offer?.claim ? PAIRING_APPROVE_GRACE_MS : 0);
      watch.timer = setTimeout(() => {
        if (this.offerWatch !== watch) return;
        if (!this.offer?.claim && Date.now() < stored.expiresAt + PAIRING_APPROVE_GRACE_MS && watch.pairing?.claimedBy) return arm();
        this.endOffer(true);
      }, Math.max(0, until - Date.now()) + 250);
    };
    watch.stop = remote.listenPairing(
      stored.code,
      (pairing, meta) => {
        if (this.offerWatch !== watch) return;
        if (!pairing) {
          if (!meta.fromCache) this.endOffer(false);
          return;
        }
        if (pairing.approved) {
          this.endOffer(false);
          return;
        }
        watch.pairing = pairing;
        const claim =
          pairing.claimedBy && pairing.claimName && pairing.claimPlatform
            ? { uid: pairing.claimedBy, name: pairing.claimName, platform: pairing.claimPlatform, check: pairingCheck(pairing.claimedBy) }
            : null;
        this.offer = { code: stored.code, role: pairing.role, expiresAt: stored.expiresAt, claim };
        arm();
        this.emit();
      },
      () => {
        if (this.offerWatch === watch) this.endOffer(false);
      },
    );
    arm();
  }

  private stopOffer(): void {
    const watch = this.offerWatch;
    this.offerWatch = null;
    this.offer = null;
    if (!watch) return;
    watch.stop();
    if (watch.timer != null) clearTimeout(watch.timer);
  }

  /** The code is off the screen. `remove`: also take the document away (it ran out). */
  private endOffer(remove: boolean): void {
    const code = this.offerWatch?.code;
    this.stopOffer();
    this.patchFamily({ offer: null });
    if (remove && code) void remote.deletePairing(code).catch(() => {});
    this.emit();
  }

  // ---- pairing: the joining device -----------------------------------------------------------------

  private ensureJoin(pending: PendingJoin): void {
    const current = this.joinWatch;
    if (current && current.code === pending.code) {
      // Approved, but taking it in failed (no connection at that moment): try again once it is due.
      // Not straight away: `completeJoin` ends with `decide`, which would bring us back here at once.
      if (current.pairing?.approved && !current.completing && Date.now() >= (current.retryAt ?? 0)) void this.completeJoin(current, current.pairing);
      return;
    }
    this.stopJoin();
    const watch: CodeWatch = { code: pending.code, stop: () => {}, timer: null, pairing: null, completing: false };
    this.joinWatch = watch;
    const arm = (expiresAt: number) => {
      if (watch.timer != null) clearTimeout(watch.timer);
      watch.timer = setTimeout(() => {
        if (this.joinWatch !== watch || watch.completing) return;
        // Approved while this phone was away: take it in, never withdraw it.
        if (watch.pairing?.approved) {
          void this.completeJoin(watch, watch.pairing);
          return;
        }
        // The deadline passed while the app was closed or asleep, and the server has not answered
        // yet: what it holds may be an approval. Ask again shortly instead of ending the wait.
        if (!watch.serverSeen) {
          watch.timer = setTimeout(() => arm(expiresAt), JOIN_RECHECK_MS);
          return;
        }
        // The server says nobody approved while the claim could still be approved: withdraw it.
        void remote.deletePairing(watch.code).catch(() => {});
        void this.joinEnded(DECLINED);
      }, Math.max(0, expiresAt + PAIRING_APPROVE_GRACE_MS - Date.now()) + 250);
    };
    watch.stop = remote.listenPairing(
      pending.code,
      (pairing, meta) => {
        if (this.joinWatch !== watch || watch.completing) return;
        if (!meta.fromCache) watch.serverSeen = true;
        if (!pairing) {
          if (!meta.fromCache) void this.joinEnded(DECLINED);
          return;
        }
        watch.pairing = pairing;
        if (pairing.approved) void this.completeJoin(watch, pairing);
        else if (pairing.expiresAt > 0) arm(pairing.expiresAt);
      },
      (error, refused) => {
        if (this.joinWatch !== watch || watch.completing) return;
        // Declined: the rules cannot show a device a code that no longer exists.
        if (refused) void this.joinEnded(DECLINED);
        else {
          // The listener is gone; `decide` attaches a new one the next time the app comes forward.
          this.stopJoin();
          this.problem = error.message;
          this.emit();
        }
      },
    );
    // Until the document has been seen: the longest a claim can stay open, counted from the claim.
    arm(pending.since + 15 * 60 * 1000);
  }

  private stopJoin(): void {
    const watch = this.joinWatch;
    this.joinWatch = null;
    if (!watch) return;
    watch.stop();
    if (watch.timer != null) clearTimeout(watch.timer);
    if (watch.retryTimer != null) clearTimeout(watch.retryTimer);
  }

  /** SPEC 3.2 step 4: a parent approved. The link record first, then syncing, then tidying up. */
  private async completeJoin(watch: CodeWatch, pairing: remote.PairingDoc): Promise<void> {
    const account = this.account;
    if (!account || watch.completing) return;
    watch.completing = true;
    this.hold += 1;
    try {
      // The role and the child come from the member record a parent wrote, not from this device.
      const member = await remote.readMember(pairing.familyId, account.uid);
      if (!member) throw new LinkError('unknown', 'The approval has not arrived yet.');
      this.record = {
        v: 2,
        uid: account.uid,
        family: { familyId: pairing.familyId, role: member.role, childId: member.role === 'child' ? member.childId : null, familyName: null, adopt: true, pendingSeed: null, pointerPending: true, usedCode: pairing.code, offer: null },
        pendingJoin: null,
        removed: false,
      };
      await this.saveRecord();
      this.problem = null;
      this.stopJoin();
      // The used code is tidied away by the session that starts now (`tidyCode`): the record
      // remembers it, so a device that is killed at this point still removes it on its next start.
    } catch (e) {
      watch.completing = false;
      if (remote.isRefusal(e)) {
        // The pairing says approved, but the server refuses this account its member record: a
        // parent removed it again before this phone took the approval in. Retrying cannot help.
        this.hold -= 1;
        void remote.deletePairing(watch.code).catch(() => {});
        await this.joinEnded(WITHDRAWN);
        return;
      }
      // Not reachable right now (or the approval has not arrived yet): try again later, waiting
      // longer each time, and sooner if a new snapshot arrives or the app comes to the foreground.
      watch.failures = (watch.failures ?? 0) + 1;
      const wait = Math.min(JOIN_RETRY_MAX_MS, JOIN_RETRY_MS * 2 ** (watch.failures - 1));
      watch.retryAt = Date.now() + wait;
      if (watch.retryTimer != null) clearTimeout(watch.retryTimer);
      watch.retryTimer = setTimeout(() => {
        watch.retryTimer = null;
        if (this.joinWatch === watch) this.decide();
      }, wait);
    }
    this.hold -= 1;
    this.decide();
  }

  /** The wait is over without a family: declined, run out, or cancelled here (`message` null). */
  private async joinEnded(message: string | null): Promise<void> {
    this.hold += 1;
    this.stopJoin();
    this.record = null;
    await this.saveRecord();
    this.problem = message;
    if (this.account?.anonymous) await accounts.deleteAnonymousUser();
    this.hold -= 1;
    this.decide();
  }

  // ---- what the screens see ---------------------------------------------------------------------------

  private status(): LinkStatus {
    if (!isBackendConfigured) return 'unconfigured';
    if (!this.recordLoaded) return 'connecting';
    // The saved sign-in is still being confirmed with the server. Past ACCOUNT_WAIT_MS the reason
    // can only be the connection: "offline", never "connecting" for a minute.
    if (!this.accountKnown) return this.accountSlow ? 'offline' : 'connecting';
    const family = this.record?.family ?? null;
    if (family && this.account) {
      if (family.pendingSeed && !family.pendingSeed.familyStored) return this.creating ? 'connecting' : 'offline';
      const connection = this.session?.status?.connection ?? 'connecting';
      if (connection === 'online') return 'linked';
      // After "offline" was shown for a slow start, the engine's own first wait does not take it back.
      return connection === 'connecting' && this.accountSlow ? 'offline' : connection;
    }
    if (this.record?.pendingJoin && this.account) return 'waiting';
    if (this.removed) return 'removed';
    if (this.account && !this.account.anonymous) {
      if (this.lookup === 'none') return 'needs-family';
      return this.lookup === 'failed' ? 'offline' : 'connecting';
    }
    return 'signed-out';
  }

  private members(): FamilyMember[] {
    const s = this.session;
    if (!s || s.members.length === 0) return EMPTY_MEMBERS;
    const owner = s.family?.owner ?? null;
    const cache = this.memberCache;
    if (cache && cache.members === s.members && cache.devices === s.devices && cache.owner === owner && cache.uid === s.uid) return cache.out;
    const seen = new Map<string, number>();
    for (const device of s.devices) {
      if (device.lastSeenAt != null) seen.set(device.uid, Math.max(seen.get(device.uid) ?? 0, device.lastSeenAt));
    }
    const out = s.members
      .map((m): FamilyMember => ({ uid: m.uid, role: m.role, childId: m.childId, name: m.name, platform: m.platform, joinedAt: m.joinedAt, lastSeenAt: seen.get(m.uid) ?? null, isThisAccount: m.uid === s.uid, isOwner: m.uid === owner }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    this.memberCache = { members: s.members, devices: s.devices, owner, uid: s.uid, out };
    return out;
  }

  private emit(): void {
    const status = this.status();
    const family = this.record?.family ?? null;
    const s = this.session;
    const stored = family !== null && !(family.pendingSeed && !family.pendingSeed.familyStored);
    const linked = stored && s !== null;
    // The family this device is in is known from its record before the saved sign-in has been
    // confirmed (which needs the server): the screens can say which family, and that it is offline.
    const known = family !== null && (linked || (stored && !this.accountKnown));
    const error =
      this.notice ??
      (status === 'offline' && known ? OFFLINE_NOTE : null) ??
      (status === 'error' ? (s?.status?.problem ?? 'There is a problem with the link. Close the app and open it again.') : null) ??
      this.problem;
    const next: LinkView = {
      status,
      configured: isBackendConfigured,
      account: this.account,
      familyId: known ? family.familyId : null,
      familyName: known ? (s?.family?.name ?? family.familyName) : null,
      role: known ? family.role : null,
      childId: known && family.role === 'child' ? family.childId : null,
      members: linked ? this.members() : EMPTY_MEMBERS,
      offer: linked ? this.offer : null,
      pendingJoin: !family ? (this.record?.pendingJoin ?? null) : null,
      lastSyncedAt: linked ? (s?.status?.lastSyncedAt ?? null) : null,
      error,
    };
    const before = this.view;
    const keys = Object.keys(next) as (keyof LinkView)[];
    if (keys.every((key) => before[key] === next[key])) return;
    this.view = next;
    for (const listener of [...this.subscribers]) listener();
  }

  // ---- actions -------------------------------------------------------------------------------------------

  private requireConfigured(): void {
    if (!isBackendConfigured) throw new LinkError('not-configured', 'Linking is not set up in this build.');
    if (!this.alive || !this.recordLoaded || !this.accountKnown) throw new LinkError('unknown', 'Still getting ready. Try again in a moment.');
  }

  private requireParentAccount(): Account {
    const account = this.account;
    if (!account || account.anonymous) throw new LinkError('not-signed-in', 'Sign in with your parent account first.');
    return account;
  }

  /** The session of a parent who can reach the server right now. */
  private requireParentOnline(): Session {
    const s = this.session;
    if (!s || !this.record?.family) throw new LinkError('not-linked', 'This needs a family. Create one or join one first.');
    if (s.role !== 'parent') throw new LinkError('permission', 'Only a parent can do that.');
    if (s.status?.connection !== 'online') throw new LinkError('network', OFFLINE_MESSAGE);
    return s;
  }

  /** A new action starts: yesterday's problem and the "you were removed" note go away. */
  private fresh(): void {
    this.problem = null;
    if (this.removed) {
      this.removed = false;
      if (this.record && !this.record.family && !this.record.pendingJoin) {
        this.record = null;
        void this.saveRecord();
      }
    }
  }

  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      throw remote.toLinkError(e);
    }
  }

  readonly actions: LinkActions = {
    signUp: async (email, password) => {
      this.requireConfigured();
      if (this.record?.family || this.record?.pendingJoin) throw new LinkError('already-linked', 'This device is already linked. Unlink it first.');
      this.fresh();
      await accounts.signUp(email, password);
    },

    signIn: async (email, password) => {
      this.requireConfigured();
      if (this.record?.family || this.record?.pendingJoin) throw new LinkError('already-linked', 'This device is already linked. Unlink it first.');
      this.fresh();
      // A leftover anonymous account is replaced by the real one.
      await accounts.signIn(email, password);
    },

    sendVerification: async () => {
      this.requireConfigured();
      await accounts.sendVerification();
    },

    refreshAccount: async () => {
      this.requireConfigured();
      const account = await accounts.refreshAccount();
      if (this.lookup === 'failed') this.lookup = 'idle';
      this.createRetryDue = true;
      this.decide();
      return account;
    },

    resetPassword: async (email) => {
      this.requireConfigured();
      await accounts.resetPassword(email);
    },

    signOut: async () => {
      this.requireConfigured();
      const account = this.account;
      if (!account) return;
      if (account.anonymous) {
        // A child's phone has no account to sign out of: leaving the family is what ends its link.
        if (this.record?.family) return this.actions.unlink();
        if (this.record?.pendingJoin) return this.actions.cancelJoin();
        await accounts.deleteAnonymousUser();
        return;
      }
      this.hold += 1;
      try {
        const hadFamily = this.record?.family != null;
        const offer = this.offer;
        if (offer && !offer.claim) void remote.deletePairing(offer.code).catch(() => {});
        this.stopOffer();
        this.stopSession();
        // The record first: a kill from here on finds a device that is simply not linked.
        this.record = null;
        this.removed = false;
        this.problem = null;
        await this.saveRecord();
        if (hadFamily) this.wipeLocal();
        this.lookup = 'idle';
        await accounts.signOut();
      } finally {
        this.hold -= 1;
        this.decide();
      }
    },

    createFamily: async (input) => {
      this.requireConfigured();
      let account = this.requireParentAccount();
      const pending = this.record?.family?.pendingSeed ?? null;
      if (this.record?.family && !(pending && !pending.familyStored)) throw new LinkError('already-linked', 'This account already has a family.');
      const familyName = cleanName(input.familyName, 60, 'Give your family a name.');
      const childName = cleanName(input.childName, 60, 'Enter your child’s name.');
      this.fresh();
      if (!account.emailVerified) {
        account = (await accounts.refreshAccount()) ?? account;
        if (!account.emailVerified) throw new LinkError('email-not-verified', 'Confirm your email address first: open the link in the email we sent you, then try again.');
      }
      if (!this.record?.family) {
        // One family per account: an account that already has one opens that one.
        const pointer = await this.guarded(() => remote.readUserPointer(account.uid));
        if (pointer) {
          this.lookup = 'idle';
          this.decide();
          throw new LinkError('already-linked', 'This account already has a family. It is being opened on this device.');
        }
        // SPEC 3.1: written down before the first batch, so a kill in between can be picked up.
        this.record = {
          v: 2,
          uid: account.uid,
          family: {
            familyId: remote.randomDocId(),
            role: 'parent',
            childId: null,
            familyName,
            adopt: true,
            pendingSeed: { familyStored: false, familyName, childId: newId('c'), childName, childAge: input.childAge != null && Number.isFinite(input.childAge) ? input.childAge : null },
            pointerPending: false,
            usedCode: null,
            offer: null,
          },
          pendingJoin: null,
          removed: false,
        };
        await this.saveRecord();
      }
      await this.resumeCreate(true);
    },

    createPairingCode: async (role) => {
      this.requireConfigured();
      const s = this.requireParentOnline();
      const previous = this.offer;
      if (previous) void remote.deletePairing(previous.code).catch(() => {});
      this.stopOffer();
      this.patchFamily({ offer: null });
      const made = await this.guarded(() => remote.createPairing(s.familyId, s.uid, role === 'parent' ? 'parent' : 'child'));
      if (this.session !== s) throw new LinkError('not-linked', 'This device is no longer linked.');
      this.patchFamily({ offer: made });
      this.watchOffer(made);
      this.emit();
      return this.offer ?? { ...made, claim: null };
    },

    cancelPairingCode: async () => {
      this.requireConfigured();
      const offer = this.offer;
      if (!offer) return;
      this.requireParentOnline();
      await this.guarded(() => remote.deletePairing(offer.code));
      this.endOffer(false);
    },

    approveClaim: async (target) => {
      this.requireConfigured();
      const s = this.requireParentOnline();
      const pairing = this.offerWatch?.pairing ?? null;
      if (!this.offer?.claim || !pairing) throw new LinkError('no-claim', 'No device has used the code yet.');
      let childId: string | null = null;
      let newChild: { name: string } | undefined;
      if (pairing.role === 'child') {
        if (target && 'newChildName' in target) {
          newChild = { name: cleanName(target.newChildName, 60, 'Enter the child’s name.') };
          childId = newId('c');
        } else if (target && this.local?.children.some((c) => c.id === target.childId)) {
          childId = target.childId;
        } else {
          throw new LinkError('invalid-input', 'Choose which child this phone belongs to.');
        }
      }
      try {
        await remote.approvePairing({ familyId: s.familyId, uid: s.uid, pairing, childId, newChild });
      } catch (e) {
        const failure = remote.toLinkError(e);
        throw failure.code === 'permission' ? new LinkError('permission', 'The server did not accept the approval. The code may have run out: make a new one.') : failure;
      }
      // Used up. The joining device tidies the document away once it has seen the approval.
      this.endOffer(false);
    },

    declineClaim: async () => {
      this.requireConfigured();
      const offer = this.offer;
      if (!offer) throw new LinkError('no-claim', 'There is no request to decline.');
      this.requireParentOnline();
      await this.guarded(() => remote.deletePairing(offer.code));
      this.endOffer(false);
    },

    removeMember: async (uid) => {
      this.requireConfigured();
      const s = this.requireParentOnline();
      if (uid === s.uid) return this.actions.unlink();
      if (s.family && s.family.owner === uid) throw new LinkError('permission', 'The person who created the family cannot be removed.');
      const deviceIds = s.devices.filter((d) => d.uid === uid).map((d) => d.id);
      await this.guarded(() => remote.removeMember(s.familyId, uid, deviceIds));
    },

    joinWithCode: async (input) => {
      this.requireConfigured();
      if (this.record?.family) throw new LinkError('already-linked', 'This device is already linked. Unlink it first.');
      if (this.record?.pendingJoin) throw new LinkError('already-linked', 'This device is already waiting for a parent. Cancel that request first.');
      const code = normalisePairingCode(input);
      if (code.length !== PAIRING_CODE_LENGTH) throw new LinkError('invalid-code', `Enter the ${PAIRING_CODE_LENGTH}-character code shown on the parent's phone.`);
      this.fresh();
      this.hold += 1;
      try {
        // A child's phone signs in anonymously here. A signed-in parent joins as that account.
        const { account, created } = await accounts.ensureAnonymous();
        this.account = account;
        this.accountKnown = true;
        try {
          await remote.claimPairing(code, account.uid, deviceLabel(), platformName());
        } catch (e) {
          if (created) await accounts.deleteAnonymousUser();
          throw remote.toLinkError(e);
        }
        // SPEC 3.2 step 2: remembered, so a restart goes on waiting.
        this.record = { v: 2, uid: account.uid, family: null, pendingJoin: { code, check: pairingCheck(account.uid), since: Date.now() }, removed: false };
        await this.saveRecord();
      } finally {
        this.hold -= 1;
        this.decide();
      }
    },

    cancelJoin: async () => {
      this.requireConfigured();
      const pending = this.record?.pendingJoin;
      if (!pending) return;
      await remote.deletePairing(pending.code).catch(() => {});
      await this.joinEnded(null);
    },

    unlink: async () => {
      this.requireConfigured();
      const s = this.session;
      const account = this.account;
      const family = this.record?.family;
      if (!s || !account || !family) throw new LinkError('not-linked', 'This device is not linked.');
      if (s.family && s.family.owner === account.uid) throw new LinkError('permission', 'The person who created the family cannot leave it. Sign out on this device instead.');
      // Leaving has to reach the server: otherwise this device would stay a member it no longer is.
      if (s.status?.connection !== 'online') throw new LinkError('network', OFFLINE_MESSAGE);
      this.hold += 1;
      try {
        if (family.role === 'child' && family.childId) {
          const name = this.local?.children.find((c) => c.id === family.childId)?.name ?? '';
          await remote.writeLeftAlert(family.familyId, account.uid, family.childId, name);
        }
        this.stopOffer();
        this.stopSession();
        // When this fails the record still names the family, and `decide` below starts the session again.
        await this.guarded(() => remote.leaveFamily(family.familyId, account.uid, this.deviceId));
        this.record = null;
        this.problem = null;
        await this.saveRecord();
        this.wipeLocal();
        if (account.anonymous) await accounts.deleteAnonymousUser();
        else this.lookup = 'none';
      } finally {
        this.hold -= 1;
        this.decide();
      }
    },
  };

  /**
   * Creates the family the record describes, from wherever it got to: batch 1 (the family, the
   * founder's member record, the account pointer), then batch 2 (the first child and the sample
   * rules). `interactive`: called by `createFamily`, so failures are thrown rather than noted.
   */
  private async resumeCreate(interactive = false): Promise<void> {
    if (this.creating) {
      if (interactive) throw new LinkError('unknown', 'The family is being created. One moment.');
      return;
    }
    const account = this.account;
    const family = this.record?.family ?? null;
    const seed = family?.pendingSeed ?? null;
    if (!account || !family || !seed) return;
    this.creating = true;
    this.createRetryDue = false;
    this.hold += 1;
    this.emit();
    try {
      if (!seed.familyStored) {
        try {
          await remote.createFamilyBatch({ familyId: family.familyId, uid: account.uid, familyName: seed.familyName, memberName: deviceLabel(), platform: platformName() });
        } catch (e) {
          if (!remote.isRefusal(e)) throw e;
          // Refused. Either an earlier try did get through after all, or this account may not create a family.
          const pointer = await remote.readUserPointer(account.uid);
          if (!pointer || pointer.familyId !== family.familyId) {
            this.record = null;
            await this.saveRecord();
            this.lookup = 'idle';
            throw new LinkError(
              'permission',
              'This account is not allowed to create a family. Only the email addresses listed for this Haven project can; everyone else joins with a pairing code.',
            );
          }
        }
        this.patchFamily({ pendingSeed: { ...seed, familyStored: true } });
      }
      try {
        await remote.seedFamilyBatch({ familyId: family.familyId, uid: account.uid, childId: seed.childId, childName: seed.childName, childAge: seed.childAge });
        this.patchFamily({ pendingSeed: null });
      } catch (e) {
        // The family exists. Without a connection the session finishes the seeding later; a refusal cannot be repeated.
        if (remote.isRefusal(e)) this.patchFamily({ pendingSeed: null });
      }
      this.problem = null;
    } catch (e) {
      const failure = remote.toLinkError(e);
      this.problem = failure.message;
      if (interactive) throw failure;
    } finally {
      this.creating = false;
      this.hold -= 1;
      this.decide();
    }
  }
}
