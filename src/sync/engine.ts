/**
 * One linked session: the listeners, the writes in flight and the bookkeeping that ./reconcile
 * needs, wired to events the way tests/sync/model/device.ts does it.
 *
 *   a snapshot arrives   onListSnapshot / onDocSnapshot, then step everything
 *   the store changed    step everything (after a short pause, so a burst of taps is one run)
 *   a write settled      take it off the in-flight list, settleList, then step everything
 *   a step returns writes  hand them to the transport and add them to the in-flight list
 *
 * Every decision is made by ./reconcile and ./schema. This file only moves data between them, the
 * transport (Cloud Firestore, see ./remote) and the host (the store, see ./link).
 *
 * The store lives in React, so what the engine hands over is not there at once, and a tap can land
 * in between. The engine therefore never trusts a store snapshot on its own. Its view of the local
 * data is the last snapshot the store has shown, with the engine's own patches that the store has
 * not shown yet folded over it, using the same function the store uses to take a patch in
 * (`rebaseList`). The host numbers the patches and reports with every snapshot how many of them it
 * includes, so the engine knows exactly which ones are still on their way.
 *
 * No react, no react-native, no firebase: it runs in plain node with a fake transport.
 */
import type { Alert, ChatMessage, Child, FamilyRequest, Place, RewardTask, Schedule, SiteRule } from '@/state/store';
import {
  decodeSnapshot,
  dropOrphans,
  issued,
  onDocSnapshot,
  onListSnapshot,
  pruneWriteOnly,
  rebaseList,
  same,
  settleList,
  settledWrite,
  startDoc,
  startList,
  startWriteOnly,
  stepList,
  stepSos,
  stepStatus,
  type DocState,
  type ListState,
  type Reverted,
  type Write,
} from './reconcile';
import { LIST_SLICES, SCHEMA, SOS, STATUS, listenersFor, type DocData, type ListSlice, type ListSpec, type ListenerPlan, type SliceItems, type SosDoc, type StatusDoc, type SyncCtx } from './schema';

// ---------------------------------------------------------------------------------------------
// What the engine is given
// ---------------------------------------------------------------------------------------------

/** The synced slices of the store. */
export interface LocalState {
  children: readonly Child[];
  requests: readonly FamilyRequest[];
  messages: readonly ChatMessage[];
  alerts: readonly Alert[];
  places: readonly Place[];
  schedules: readonly Schedule[];
  sites: readonly SiteRule[];
  tasks: readonly RewardTask[];
  sosActive: boolean;
  sosChildId: string | null;
}
export type LocalPatch = Partial<LocalState>;

/** One document of a snapshot: times in milliseconds, null while a server time is pending. */
export interface SnapshotDoc {
  id: string;
  data: DocData;
  pending: boolean;
}

/** Cloud Firestore as far as the engine needs it (./remote in the app, a fake in tests). */
export interface Transport {
  /** Attaches a listener. `onError` ends it: `refused` is true when the server said this account may not read. */
  listen(plan: ListenerPlan, onData: (docs: SnapshotDoc[], meta: { fromCache: boolean }) => void, onError: (error: unknown, refused: boolean) => void): () => void;
  /** Sends one write. Resolves when the server stored it, rejects when it was refused. Offline it may stay open. */
  write(write: Write): Promise<void>;
  /** Reads one document from the server. Null when it does not exist. */
  fetch(path: string): Promise<SnapshotDoc | null>;
  /** For a write that was rejected: a sentence for the person, and whether the cause was "no connection". */
  explain(write: Write, error: unknown): { message: string; offline: boolean };
}

export type Connection = 'connecting' | 'online' | 'offline' | 'error';

export interface EngineStatus {
  connection: Connection;
  /** When data last came from, or was confirmed by, the server. */
  lastSyncedAt: number | null;
  /** A sentence that goes with `error`. */
  problem: string | null;
}

/** The store and the screens, as far as the engine needs them. */
export interface EngineHost {
  /**
   * Hands slices (and the record that belongs to them) to the store, and returns the number the
   * host gave this hand-over. `options.basis` holds the slices the patch was worked out from.
   */
  apply(patch: LocalPatch, record: SavedRecord, options: { basis: LocalPatch; saveNow: boolean }): number;
  onStatus(status: EngineStatus): void;
  /** Something the person did could not be kept and was put back. Shown briefly. */
  onNotice(message: string): void;
  /** A listener was refused by the server: this account may no longer be in the family. */
  onRefused(): void;
  /** An SOS that was not on before is on now (a parent's phone vibrates). */
  onSos(childId: string | null): void;
}

type AnyItem = SliceItems[ListSlice];

/** What is saved next to the local state, always in the same write (`applyRemote(patch, record)`). */
export interface SavedRecord {
  v: 1;
  familyId: string;
  uid: string;
  role: SyncCtx['role'];
  childId: string | null;
  /** SPEC 4.2 rule 2: set at joining, cleared once every listener has adopted the server's data. */
  adoptAll: boolean;
  lists: Record<string, { confirmed: AnyItem[]; adopt: boolean }>;
  docs: Record<string, { confirmed: SosDoc | StatusDoc | null; adopt: boolean }>;
}

export interface EngineOptions {
  ctx: SyncCtx;
  transport: Transport;
  host: EngineHost;
  /** The store's slices now, and how many hand-overs that snapshot includes (the host's count). */
  local: LocalState;
  seq: number;
  /**
   * What the store saved with the state the last time the app ran (`readSyncRecord()`), for the
   * first session after a start only. Anything else, and anything that does not belong to this
   * account and family, means the local data is not authoritative: everything is adopted.
   */
  restored?: { record: unknown; untrusted: readonly string[] } | null;
  /** How many acknowledged alerts a child device keeps (it cannot read the feed). */
  keepAlerts?: number;
  /** After this long without the server's first answers the status is `offline`, not `connecting`. */
  offlineAfterMs?: number;
  /** How long a change in the store waits before it is looked at, so a burst of taps is one run. */
  storeDelayMs?: number;
}

export interface Engine {
  /** The store committed: its slices, and the number of the last hand-over that commit includes. */
  storeChanged(local: LocalState, seq: number): void;
  /** False while the device is still taking the family's data in (SPEC 4.2 rule 2). */
  settledIn(): boolean;
  status(): EngineStatus;
  /** Detaches every listener. Nothing is handed to the host afterwards. */
  stop(): void;
}

// ---------------------------------------------------------------------------------------------
// The saved record
// ---------------------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sliceOfKey = (key: string) => key.split(':')[0];

/** The slices of the store a listener key draws on, as the store names them in `untrusted`. */
function storeSlicesOf(key: string): string[] {
  const slice = sliceOfKey(key);
  if (slice === 'sos') return ['sosActive', 'sosChildId'];
  if (slice === 'status') return ['children'];
  return [slice];
}

/**
 * The record as it can be used, or null when it is not this account's and family's, or not a
 * record at all. An entry with a malformed item is dropped: its listener then starts by adopting.
 */
export function parseSavedRecord(raw: unknown, ctx: Pick<SyncCtx, 'familyId' | 'uid' | 'role' | 'childId'>, untrusted: readonly string[] = []): SavedRecord | null {
  if (!isObject(raw) || raw.v !== 1) return null;
  if (raw.familyId !== ctx.familyId || raw.uid !== ctx.uid || raw.role !== ctx.role || (raw.childId ?? null) !== ctx.childId) return null;
  if (!isObject(raw.lists) || !isObject(raw.docs)) return null;
  const distrusted = (key: string) => storeSlicesOf(key).some((slice) => untrusted.includes(slice));
  const out: SavedRecord = { v: 1, familyId: ctx.familyId, uid: ctx.uid, role: ctx.role, childId: ctx.childId, adoptAll: raw.adoptAll !== false, lists: {}, docs: {} };
  for (const [key, entry] of Object.entries(raw.lists)) {
    const slice = sliceOfKey(key) as ListSlice;
    if (!LIST_SLICES.includes(slice) || !isObject(entry) || !Array.isArray(entry.confirmed)) continue;
    const spec = SCHEMA[slice] as unknown as ListSpec;
    if (!entry.confirmed.every((item) => spec.isItem(item))) continue;
    out.lists[key] = { confirmed: entry.confirmed as AnyItem[], adopt: entry.adopt !== false || distrusted(key) };
  }
  for (const [key, entry] of Object.entries(raw.docs)) {
    if (!isObject(entry)) continue;
    const slice = sliceOfKey(key);
    const c = entry.confirmed;
    const adopt = entry.adopt !== false || distrusted(key);
    if (slice === 'sos') {
      if (c === null || c === undefined) out.docs[key] = { confirmed: null, adopt };
      else if (isObject(c) && typeof c.active === 'boolean') {
        out.docs[key] = { confirmed: { active: c.active, childId: typeof c.childId === 'string' ? c.childId : null, at: typeof c.at === 'number' ? c.at : null }, adopt };
      }
    } else if (slice === 'status') {
      if (c === null || c === undefined) out.docs[key] = { confirmed: null, adopt };
      else if (isObject(c)) out.docs[key] = { confirmed: { checkInAt: typeof c.checkInAt === 'number' ? c.checkInAt : null }, adopt };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The engine's view of the store
// ---------------------------------------------------------------------------------------------

interface Handed {
  seq: number;
  patch: LocalPatch;
  basis: LocalPatch;
}

type IdList = readonly { id: string }[];

/** What the store makes of a patch (store.tsx, `applyRemote` / `takeRemote`), applied to `state`. */
export function takePatch(state: LocalState, patch: LocalPatch, basis: LocalPatch): LocalState {
  const out: Record<string, unknown> = { ...state };
  for (const slice of LIST_SLICES) {
    const next = patch[slice];
    if (next === undefined) continue;
    const prev = state[slice];
    const from = basis[slice];
    out[slice] = from === undefined || prev === from ? next : rebaseList(from as IdList, next as IdList, prev as IdList);
  }
  if (patch.sosActive !== undefined) out.sosActive = basis.sosActive !== undefined && state.sosActive !== basis.sosActive ? state.sosActive : patch.sosActive;
  if (patch.sosChildId !== undefined) out.sosChildId = basis.sosChildId !== undefined && state.sosChildId !== basis.sosChildId ? state.sosChildId : patch.sosChildId;
  return out as unknown as LocalState;
}

const LOCAL_KEYS: readonly (keyof LocalState)[] = [...LIST_SLICES, 'sosActive', 'sosChildId'];

function sameMap<T>(a: ReadonlyMap<string, T>, b: ReadonlyMap<string, T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (!b.has(key) || !same(value, b.get(key))) return false;
  return true;
}

const REVERT_NOTES: Record<Reverted['reason'], string> = {
  role: 'This device is not allowed to change that, so it was put back.',
  invalid: 'That value cannot be saved, so it was put back.',
  stale: 'That had already changed on another phone, so nothing was sent.',
};

// ---------------------------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------------------------

interface ListEntry {
  key: string;
  slice: ListSlice;
  childId?: string;
  state: ListState<AnyItem>;
}

interface DocEntry {
  key: string;
  slice: 'sos' | 'status';
  childId?: string;
  state: DocState<SosDoc> | DocState<StatusDoc>;
}

const MAX_PASSES = 8;

export function startEngine(options: EngineOptions): Engine {
  const { ctx, transport, host } = options;
  const keepAlerts = options.keepAlerts ?? 20;
  // With the app's own start in front of it, "offline" has to show within 5 seconds (SPEC 4.2 rule 9).
  const offlineAfterMs = options.offlineAfterMs ?? 4000;
  const storeDelayMs = options.storeDelayMs ?? 150;
  const now = () => (ctx.now ? ctx.now() : Date.now());

  const restored = options.restored ? parseSavedRecord(options.restored.record, ctx, options.restored.untrusted) : null;
  // Local data without a record that belongs to it is never authoritative.
  let adoptAll = restored ? restored.adoptAll : true;

  const lists = new Map<string, ListEntry>();
  const docs = new Map<string, DocEntry>();
  const stops = new Map<string, () => void>();
  /** The latest `fromCache` each listener reported. */
  const cached = new Map<string, boolean>();
  let inFlight: readonly Write[] = [];

  /** The last snapshot the store has shown, and the hand-overs it does not include yet. */
  let store = options.local;
  let storeSeq = options.seq;
  let handed: Handed[] = [];
  /** The local view the last run ended with. */
  let worked: LocalState | null = null;
  /** The record as last handed over, to tell whether there is anything new to save. */
  let savedSig = new Map<string, { confirmed: unknown; adopt: boolean }>();
  let savedAdoptAll: boolean | null = null;

  let local: LocalState = store;
  let stopped = false;
  let running = false;
  let again = false;
  let saveNowNext = false;
  let everReady = false;
  let broken: string | null = null;
  let lastSyncedAt: number | null = null;
  let lastStatus: EngineStatus | null = null;
  const startedAt = now();
  let storeTimer: ReturnType<typeof setTimeout> | null = null;

  const view = (): LocalState => handed.reduce((state, h) => takePatch(state, h.patch, h.basis), store);

  // ---- listeners -----------------------------------------------------------------------------

  function knownChildren(): string[] {
    if (ctx.role === 'child') return ctx.childId ? [ctx.childId] : [];
    const entry = lists.get('children');
    return entry ? [...entry.state.base.keys()] : [];
  }

  function onData(plan: ListenerPlan, snapshot: SnapshotDoc[], meta: { fromCache: boolean }) {
    if (stopped) return;
    cached.set(plan.key, meta.fromCache);
    const list = lists.get(plan.key);
    const doc = docs.get(plan.key);
    if (list) {
      const spec = SCHEMA[list.slice] as unknown as ListSpec;
      list.state = onListSnapshot(spec, list.state, decodeSnapshot(spec, snapshot, ctx, list.childId), meta, inFlight, list.childId);
    } else if (doc) {
      const first = snapshot[0];
      const info = { fromCache: meta.fromCache, pending: first ? first.pending : false };
      if (doc.slice === 'sos') doc.state = onDocSnapshot(doc.state as DocState<SosDoc>, SOS.fromDoc(first?.data), info);
      else doc.state = onDocSnapshot(doc.state as DocState<StatusDoc>, STATUS.fromDoc(first?.data), info);
    }
    if (!meta.fromCache) lastSyncedAt = now();
    run(false);
  }

  function onError(plan: ListenerPlan, error: unknown, refused: boolean) {
    if (stopped) return;
    stops.delete(plan.key);
    if (refused) {
      host.onRefused();
      return;
    }
    broken = 'A part of the family data could not be read. Close the app and open it again.';
    report();
  }

  function ensureListeners() {
    for (const plan of listenersFor(ctx, knownChildren())) {
      if (plan.slice === 'sos' || plan.slice === 'status') {
        if (!docs.has(plan.key)) {
          const saved = restored?.docs[plan.key];
          const state =
            plan.slice === 'sos'
              ? startDoc<SosDoc>(saved ? { confirmed: saved.confirmed as SosDoc | null, adopt: saved.adopt } : { adopt: adoptAll })
              : startDoc<StatusDoc>(saved ? { confirmed: saved.confirmed as StatusDoc | null, adopt: saved.adopt } : { adopt: adoptAll });
          docs.set(plan.key, { key: plan.key, slice: plan.slice, childId: plan.childId, state });
        }
      } else if (!lists.has(plan.key)) {
        lists.set(plan.key, { key: plan.key, slice: plan.slice, childId: plan.childId, state: startList<AnyItem>(restored?.lists[plan.key] ?? { adopt: adoptAll }) });
      }
      if (!stops.has(plan.key) && !stopped) {
        // Set before attaching: a listener may answer from inside the call.
        stops.set(plan.key, () => {});
        const stop = transport.listen(
          plan,
          (snapshot, meta) => onData(plan, snapshot, meta),
          (error, refused) => onError(plan, error, refused),
        );
        if (stops.has(plan.key)) stops.set(plan.key, stop);
        else stop();
      }
    }
    // A child cannot read the alerts: no listener, only a record of what it has sent.
    if (ctx.role === 'child' && !lists.has('alerts')) {
      lists.set('alerts', { key: 'alerts', slice: 'alerts', state: startWriteOnly<AnyItem>(restored?.lists.alerts ?? { adopt: adoptAll }) });
    }
  }

  // ---- writes --------------------------------------------------------------------------------

  function issue(writes: Write[]) {
    if (writes.length === 0) return;
    inFlight = issued(inFlight, writes);
    for (const write of writes) {
      let sent: Promise<void>;
      try {
        sent = transport.write(write);
      } catch (e) {
        sent = Promise.reject(e);
      }
      sent.then(
        () => void settle(write, true, null),
        (e: unknown) => void settle(write, false, e),
      );
    }
  }

  async function settle(write: Write, ok: boolean, error: unknown) {
    if (stopped) return;
    const failure = ok ? null : transport.explain(write, error);
    // After a refusal, and after every transaction: the document as the server has it now, so the
    // device goes straight there instead of falling back to a snapshot that may be older.
    const transaction = write.op === 'set' && write.expect !== undefined;
    if ((transaction || !ok) && !(failure && failure.offline)) {
      const fetched = await transport.fetch(write.path).then(
        (doc) => ({ doc }),
        () => null,
      );
      if (stopped) return;
      if (fetched && write.op === 'set') {
        const key = write.slice === 'sos' ? 'sos' : `status:${write.childId}`;
        const entry = docs.get(key);
        const info = { fromCache: false, pending: false };
        if (entry && entry.slice === 'sos') entry.state = onDocSnapshot(entry.state as DocState<SosDoc>, SOS.fromDoc(fetched.doc?.data), info);
        else if (entry) entry.state = onDocSnapshot(entry.state as DocState<StatusDoc>, STATUS.fromDoc(fetched.doc?.data), info);
      }
    }
    inFlight = settledWrite(inFlight, write);
    if (write.op !== 'set') {
      const spec = SCHEMA[write.slice] as unknown as ListSpec;
      const entry = lists.get(spec.scope === 'child' ? `${write.slice}:${write.childId}` : write.slice);
      if (entry) entry.state = settleList(spec, entry.state, write, ok);
    }
    if (ok) lastSyncedAt = now();
    else if (failure) host.onNotice(failure.message);
    // A confirmed write is news a kill must not lose.
    run(ok);
  }

  // ---- one run -------------------------------------------------------------------------------

  function pass(notes: Reverted[]): boolean {
    let moved = false;
    ensureListeners();
    const order = [...lists.values()].sort((a, b) => Number(b.slice === 'children') - Number(a.slice === 'children'));
    for (const entry of order) {
      const spec = SCHEMA[entry.slice] as unknown as ListSpec;
      if (entry.state.writeOnly) entry.state = pruneWriteOnly(entry.state, keepAlerts);
      const adopting = entry.state.adopt;
      const step = stepList(spec, entry.state, local[entry.slice] as readonly AnyItem[], ctx, inFlight, entry.childId);
      entry.state = step.state;
      if (step.changed) {
        local = { ...local, [entry.slice]: step.nextLocal };
        moved = true;
      }
      if (step.writes.length > 0) moved = true;
      issue(step.writes);
      if (!adopting) notes.push(...step.reverted);
    }

    // Requests and messages for a child this device does not know cannot be stored anywhere.
    const kids = lists.get('children');
    const known = ctx.role === 'child' ? new Set(knownChildren()) : kids && kids.state.ready && !kids.state.adopt ? new Set(kids.state.base.keys()) : null;
    if (known) {
      const requests = dropOrphans(local.requests, known);
      const messages = dropOrphans(local.messages, known);
      if (requests.dropped.length + messages.dropped.length > 0) {
        local = { ...local, requests: requests.nextLocal, messages: messages.nextLocal };
        moved = true;
      }
    }

    for (const entry of docs.values()) {
      if (entry.slice === 'sos') {
        const step = stepSos(entry.state as DocState<SosDoc>, { sosActive: local.sosActive, sosChildId: local.sosChildId }, ctx, inFlight);
        entry.state = step.state;
        if (step.changed) {
          local = { ...local, ...step.nextLocal };
          moved = true;
        }
        if (step.writes.length > 0) moved = true;
        issue(step.writes);
        notes.push(...step.reverted);
      } else {
        const step = stepStatus(entry.state as DocState<StatusDoc>, local.children, entry.childId as string, ctx, inFlight);
        entry.state = step.state;
        if (step.changed) {
          local = { ...local, children: step.nextLocal };
          moved = true;
        }
        if (step.writes.length > 0) moved = true;
        issue(step.writes);
        notes.push(...step.reverted);
      }
    }
    return moved;
  }

  function takeRecord(): SavedRecord {
    const out: SavedRecord = { v: 1, familyId: ctx.familyId, uid: ctx.uid, role: ctx.role, childId: ctx.childId, adoptAll, lists: {}, docs: {} };
    for (const entry of lists.values()) out.lists[entry.key] = { confirmed: [...entry.state.confirmed.values()], adopt: entry.state.adopt };
    for (const entry of docs.values()) out.docs[entry.key] = { confirmed: entry.state.confirmed, adopt: entry.state.adopt };
    return out;
  }

  /** True when the record differs from the one handed over last. Remembers the new one. */
  function recordMoved(): boolean {
    let moved = savedAdoptAll !== adoptAll;
    savedAdoptAll = adoptAll;
    const next = new Map<string, { confirmed: unknown; adopt: boolean }>();
    for (const entry of lists.values()) {
      const before = savedSig.get(entry.key);
      const confirmed = entry.state.confirmed;
      if (!before || before.adopt !== entry.state.adopt || !sameMap(before.confirmed as ReadonlyMap<string, AnyItem>, confirmed)) moved = true;
      next.set(entry.key, { confirmed, adopt: entry.state.adopt });
    }
    for (const entry of docs.values()) {
      const before = savedSig.get(entry.key);
      if (!before || before.adopt !== entry.state.adopt || !same(before.confirmed, entry.state.confirmed)) moved = true;
      next.set(entry.key, { confirmed: entry.state.confirmed, adopt: entry.state.adopt });
    }
    savedSig = next;
    return moved;
  }

  function run(saveNow: boolean) {
    if (stopped) return;
    saveNowNext = saveNowNext || saveNow;
    // A write issued from inside a step can settle, and a listener can answer, at once.
    if (running) {
      again = true;
      return;
    }
    running = true;
    const before = view();
    local = before;
    const notes: Reverted[] = [];
    let passes = 0;
    do {
      again = false;
      while (pass(notes)) {
        passes += 1;
        if (passes > MAX_PASSES) {
          // Should not happen (the model test checks that a run comes to rest). Give up on this
          // run rather than spin: the next event starts a new one.
          again = false;
          break;
        }
      }
    } while (again);
    running = false;

    const wasAdopting = adoptAll;
    if (adoptAll) {
      const kids = ctx.role === 'child' || lists.has('children');
      const done = kids && [...lists.values()].every((e) => e.state.ready && !e.state.adopt) && [...docs.values()].every((e) => e.state.ready && !e.state.adopt);
      if (done) adoptAll = false;
    }

    const patch: LocalPatch = {};
    const basis: LocalPatch = {};
    for (const key of LOCAL_KEYS) {
      if (local[key] === before[key]) continue;
      (patch as Record<string, unknown>)[key] = local[key];
      (basis as Record<string, unknown>)[key] = before[key];
    }
    // The two SOS values travel together: the store judges each against the basis.
    if (patch.sosActive !== undefined || patch.sosChildId !== undefined) {
      patch.sosActive = local.sosActive;
      patch.sosChildId = local.sosChildId;
      basis.sosActive = before.sosActive;
      basis.sosChildId = before.sosChildId;
    }
    worked = local;
    const changed = Object.keys(patch).length > 0;
    const moved = recordMoved();
    if (changed || moved) {
      const urgent = saveNowNext || (wasAdopting && !adoptAll);
      saveNowNext = false;
      const seq = host.apply(patch, takeRecord(), { basis, saveNow: urgent });
      if (changed) handed.push({ seq, patch, basis });
    }
    if (patch.sosActive === true && !before.sosActive) host.onSos(local.sosChildId);
    if (notes.length > 0) host.onNotice(REVERT_NOTES[notes[notes.length - 1].reason]);
    report();
  }

  // ---- status --------------------------------------------------------------------------------

  function connection(): Connection {
    if (broken) return 'error';
    const entries = [...lists.values(), ...docs.values()];
    const ready = entries.length > 0 && entries.every((e) => e.state.ready);
    if (ready) everReady = true;
    if (!everReady) return now() - startedAt >= offlineAfterMs ? 'offline' : 'connecting';
    // A listener that has had the server's answer and now reports its cache: the connection is gone.
    // One that was attached later and has not been answered yet does not count.
    return entries.some((e) => e.state.ready && cached.get(e.key) === true) ? 'offline' : 'online';
  }

  function status(): EngineStatus {
    return { connection: connection(), lastSyncedAt, problem: broken };
  }

  function report() {
    if (stopped) return;
    const next = status();
    if (lastStatus && lastStatus.connection === next.connection && lastStatus.lastSyncedAt === next.lastSyncedAt && lastStatus.problem === next.problem) return;
    lastStatus = next;
    host.onStatus(next);
  }

  const offlineTimer = setTimeout(report, offlineAfterMs + 50);

  // The saved children decide which listeners exist from the start (twice: the first call makes
  // the children entry, the second attaches what hangs under the children it already knows).
  ensureListeners();
  ensureListeners();
  report();

  return {
    storeChanged(next, seq) {
      if (stopped || seq < storeSeq) return;
      store = next;
      storeSeq = seq;
      handed = handed.filter((h) => h.seq > seq);
      // Nothing to look at when the store shows exactly what the last run ended with.
      const current = view();
      if (worked && LOCAL_KEYS.every((key) => current[key] === (worked as LocalState)[key])) return;
      if (storeTimer != null) clearTimeout(storeTimer);
      storeTimer = setTimeout(() => {
        storeTimer = null;
        run(false);
      }, storeDelayMs);
    },
    settledIn: () => !adoptAll,
    status,
    stop() {
      stopped = true;
      clearTimeout(offlineTimer);
      if (storeTimer != null) clearTimeout(storeTimer);
      for (const stop of stops.values()) stop();
      stops.clear();
    },
  };
}
