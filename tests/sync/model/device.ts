/**
 * One phone in the model: the store's slices, the engine's bookkeeping and the fake SDK.
 *
 * The engine part is deliberately thin. Everything that decides something lives in
 * src/sync/reconcile.ts and src/sync/schema.ts; this file only wires those functions to events,
 * the way the real link layer has to:
 *
 * - a snapshot arrives: `onListSnapshot` / `onDocSnapshot`, then step everything, in the same call;
 * - the store changed: step everything;
 * - a write settled: take it off the in-flight list, `settleList`, then step everything;
 * - a step returns writes: hand them to the SDK and add them to the in-flight list;
 * - what is saved is the local state together with the record (confirmed copies and adopt flags)
 *   as it was at the end of the last step, in one piece.
 */
import type { Alert, ChatMessage, Child, FamilyRequest, Place, RewardTask, Schedule, SiteRule } from '@/state/store';
import {
  decodeSnapshot,
  dropOrphans,
  issued,
  onDocSnapshot,
  onListSnapshot,
  pruneWriteOnly,
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
} from '@/sync/reconcile';
import { SCHEMA, SOS, STATUS, listenersFor, type ListSlice, type ListSpec, type Role, type SliceItems, type SosDoc, type StatusDoc, type SyncCtx } from '@/sync/schema';
import { makeSdk, type Limits, type Sdk, type SdkEvents } from './sdk';
import { SERVER_TIME, type CommitResult, type Server } from './server';

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

type AnyItem = SliceItems[ListSlice];

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

/** What is saved next to the local state, always in the same write. */
export interface SavedRecord {
  /** SPEC 4.2 rule 2: set at joining, cleared once every listener has adopted the server's data. */
  adoptAll: boolean;
  lists: Record<string, { confirmed: AnyItem[]; adopt: boolean }>;
  docs: Record<string, { confirmed: SosDoc | StatusDoc | null; adopt: boolean }>;
}

interface Disk {
  local: LocalState;
  record: SavedRecord;
}

export interface Refusal {
  write: Write;
  result: CommitResult;
}

export interface DeviceStats {
  /** Writes handed to the SDK since the device was made (kills do not reset it). */
  writes: number;
  kills: number;
  reverted: Reverted[];
  refused: Refusal[];
  /** The most passes one engine run needed to come to rest. */
  maxPasses: number;
}

export interface Device {
  readonly name: string;
  readonly ctx: SyncCtx;
  readonly role: Role;
  readonly stats: DeviceStats;
  local(): LocalState;
  sdk(): Sdk;
  /** The device's own clock. */
  now(): number;
  /** False while the device is still adopting the family's data: the person cannot act yet. */
  settledIn(): boolean;
  /** The store changed (somebody tapped something). The engine has not looked at it yet. */
  act(next: LocalState): void;
  /** True when the store changed since the engine last ran. */
  dirty(): boolean;
  /** One engine run: every listener is stepped until nothing moves. */
  run(): void;
  /** Writes the local state and the engine's record to "disk". */
  save(): void;
  /** Kills the app and starts it again from what was saved. The SDK's queue and cache are gone. */
  kill(): void;
  setOnline(online: boolean): void;
  /** True once the listener with this key has had a snapshot from the server. */
  ready(key: string): boolean;
  /** The server-confirmed copy of one item, if there is one. */
  confirmed(slice: ListSlice, id: string): AnyItem | undefined;
  /** What `save` wrote last. */
  disk(): Disk;
  /** What the app was started from the last time it started. */
  startedFrom(): Disk;
}

export interface DeviceOptions {
  name: string;
  uid: string;
  role: Role;
  childId: string | null;
  /** How far this device's clock is from the server's, in milliseconds. */
  skew?: number;
  limits?: Limits;
  /** What the store holds when the device joins: the sample data. */
  local: LocalState;
  /** How many acknowledged alerts a child device keeps. */
  keepAlerts?: number;
  /**
   * Save at once whenever the engine's record changed (something was confirmed or adopted), as the
   * real link layer should. Without it only the test's own `save` calls write to disk, which leaves
   * much older saves lying around for a kill to fall back to.
   */
  promptSaves?: boolean;
  /** See SdkOptions.refetchOnRefusal. */
  refetchOnRefusal?: boolean;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function makeDevice(server: Server, options: DeviceOptions): Device {
  const skew = options.skew ?? 0;
  const now = () => server.now() + skew;
  const ctx: SyncCtx = { familyId: server.familyId, uid: options.uid, role: options.role, childId: options.role === 'child' ? options.childId : null, serverTimestamp: SERVER_TIME, now };
  const stats: DeviceStats = { writes: 0, kills: 0, reverted: [], refused: [], maxPasses: 0 };

  let local: LocalState = options.local;
  let lists = new Map<string, ListEntry>();
  let docs = new Map<string, DocEntry>();
  let inFlight: readonly Write[] = [];
  let adoptAll = true;
  let restored: SavedRecord | null = null;
  let record: SavedRecord = { adoptAll: true, lists: {}, docs: {} };
  let online = true;
  let engineDirty = false;
  let running = false;
  let again = false;

  const events: SdkEvents = {
    onSnapshot(key, snapshot, meta) {
      const list = lists.get(key);
      const doc = docs.get(key);
      if (list) {
        const spec = SCHEMA[list.slice] as unknown as ListSpec;
        list.state = onListSnapshot(spec, list.state, decodeSnapshot(spec, snapshot, ctx, list.childId), meta, inFlight, list.childId);
      } else if (doc) {
        const first = snapshot[0];
        const info = { fromCache: meta.fromCache, pending: first ? first.pending : false };
        if (doc.slice === 'sos') doc.state = onDocSnapshot(doc.state as DocState<SosDoc>, SOS.fromDoc(first?.data), info);
        else doc.state = onDocSnapshot(doc.state as DocState<StatusDoc>, STATUS.fromDoc(first?.data), info);
      }
      run();
    },
    onSettled(write, ok, result) {
      inFlight = settledWrite(inFlight, write);
      if (!ok) stats.refused.push({ write, result });
      if (write.op !== 'set') {
        const spec = SCHEMA[write.slice] as unknown as ListSpec;
        const entry = lists.get(spec.scope === 'child' ? `${write.slice}:${write.childId}` : write.slice);
        if (entry) entry.state = settleList(spec, entry.state, write, ok);
      }
      run();
    },
  };

  const sdkOptions = { limits: options.limits, refetchOnRefusal: options.refetchOnRefusal };
  let sdk: Sdk = makeSdk(server, options.uid, events, sdkOptions);

  /** The children this device listens under: its own, or for a parent every child it knows of. */
  function knownChildren(): string[] {
    if (ctx.role === 'child') return ctx.childId ? [ctx.childId] : [];
    const entry = lists.get('children');
    return entry ? [...entry.state.base.keys()] : [];
  }

  function ensureListeners() {
    for (const plan of listenersFor(ctx, knownChildren())) {
      if (plan.slice === 'sos' || plan.slice === 'status') {
        if (!docs.has(plan.key)) {
          const saved = restored?.docs[plan.key];
          const state = plan.slice === 'sos' ? startDoc<SosDoc>(saved ? { confirmed: saved.confirmed as SosDoc | null, adopt: saved.adopt } : { adopt: adoptAll }) : startDoc<StatusDoc>(saved ? { confirmed: saved.confirmed as StatusDoc | null, adopt: saved.adopt } : { adopt: adoptAll });
          docs.set(plan.key, { key: plan.key, slice: plan.slice, childId: plan.childId, state });
        }
      } else if (!lists.has(plan.key)) {
        lists.set(plan.key, { key: plan.key, slice: plan.slice, childId: plan.childId, state: startList<AnyItem>(restored?.lists[plan.key] ?? { adopt: adoptAll }) });
      }
      sdk.listen(plan);
    }
    // A child cannot read the alerts: no listener, only a record of what it has sent.
    if (ctx.role === 'child' && !lists.has('alerts')) {
      lists.set('alerts', { key: 'alerts', slice: 'alerts', state: startWriteOnly<AnyItem>(restored?.lists.alerts ?? { adopt: adoptAll }) });
    }
  }

  function issue(writes: Write[]) {
    if (writes.length === 0) return;
    inFlight = issued(inFlight, writes);
    stats.writes += writes.length;
    for (const write of writes) sdk.write(write);
  }

  function pass(): boolean {
    let moved = false;
    ensureListeners();
    const order = [...lists.values()].sort((a, b) => Number(b.slice === 'children') - Number(a.slice === 'children'));
    for (const entry of order) {
      const spec = SCHEMA[entry.slice] as unknown as ListSpec;
      if (entry.state.writeOnly && options.keepAlerts !== undefined) entry.state = pruneWriteOnly(entry.state, options.keepAlerts);
      const step = stepList(spec, entry.state, local[entry.slice] as readonly AnyItem[], ctx, inFlight, entry.childId);
      entry.state = step.state;
      if (step.changed) {
        local = { ...local, [entry.slice]: step.nextLocal };
        moved = true;
      }
      if (step.writes.length > 0) moved = true;
      issue(step.writes);
      stats.reverted.push(...step.reverted);
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
        stats.reverted.push(...step.reverted);
      } else {
        const step = stepStatus(entry.state as DocState<StatusDoc>, local.children, entry.childId as string, ctx, inFlight);
        entry.state = step.state;
        if (step.changed) {
          local = { ...local, children: step.nextLocal };
          moved = true;
        }
        if (step.writes.length > 0) moved = true;
        issue(step.writes);
        stats.reverted.push(...step.reverted);
      }
    }
    return moved;
  }

  function takeRecord(): SavedRecord {
    const out: SavedRecord = { adoptAll, lists: {}, docs: {} };
    for (const entry of lists.values()) out.lists[entry.key] = { confirmed: [...entry.state.confirmed.values()], adopt: entry.state.adopt };
    for (const entry of docs.values()) out.docs[entry.key] = { confirmed: entry.state.confirmed, adopt: entry.state.adopt };
    return out;
  }

  function run() {
    // A write issued from inside a step can make the fake SDK call back at once.
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        engineDirty = false;
        let passes = 0;
        while (pass()) {
          passes += 1;
          if (passes > 8) throw new Error(`${options.name}: the engine does not come to rest`);
        }
        stats.maxPasses = Math.max(stats.maxPasses, passes);
      } while (again);
      if (adoptAll) {
        const kids = lists.get('children');
        const done = kids !== undefined && [...lists.values()].every((e) => e.state.ready && !e.state.adopt) && [...docs.values()].every((e) => e.state.ready && !e.state.adopt);
        if (done) adoptAll = false;
      }
      const before = record;
      record = takeRecord();
      if (options.promptSaves && JSON.stringify(before) !== JSON.stringify(record)) disk = clone({ local, record });
    } finally {
      running = false;
    }
  }

  let disk: Disk = clone({ local, record });
  let born: Disk = disk;

  function start(from: Disk) {
    born = clone(from);
    local = from.local;
    restored = from.record;
    record = from.record;
    adoptAll = from.record.adoptAll;
    lists = new Map();
    docs = new Map();
    inFlight = [];
    engineDirty = false;
    sdk = makeSdk(server, options.uid, events, sdkOptions);
    sdk.setOnline(online);
    // The saved children decide which listeners exist from the start.
    ensureListeners();
    ensureListeners();
  }

  start(clone(disk));

  return {
    name: options.name,
    ctx,
    role: options.role,
    stats,
    local: () => local,
    sdk: () => sdk,
    now,
    settledIn: () => !adoptAll,
    act: (next) => {
      local = next;
      engineDirty = true;
    },
    dirty: () => engineDirty,
    run,
    save: () => {
      disk = clone({ local, record });
    },
    kill: () => {
      stats.kills += 1;
      start(clone(disk));
    },
    setOnline: (value) => {
      online = value;
      sdk.setOnline(value);
    },
    ready: (key) => lists.get(key)?.state.ready ?? docs.get(key)?.state.ready ?? false,
    confirmed: (slice, id) => {
      for (const entry of lists.values()) {
        if (entry.slice !== slice) continue;
        const item = entry.state.confirmed.get(id);
        if (item) return item;
      }
      return undefined;
    },
    disk: () => disk,
    startedFrom: () => born,
  };
}
