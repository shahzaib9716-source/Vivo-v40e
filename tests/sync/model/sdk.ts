/**
 * A stand-in for the Firestore client SDK on one device, as far as the sync engine can tell the
 * difference: listeners that report the server's data with this device's pending writes laid over
 * it, a queue of writes that are sent in order and acknowledged or refused, snapshots that arrive
 * late, and a cache that lives in memory only (a kill loses the queue).
 *
 * Nothing happens by itself. The test decides when a snapshot is captured, when it is delivered,
 * when the next write is sent and when its answer comes back, which is how late and out-of-order
 * delivery across collections is produced.
 */
import type { Write } from '../../../src/sync/reconcile';
import type { ListenerPlan } from '../../../src/sync/schema';
import { SERVER_TIME, type CommitResult, type Data, type Server, type StoredDoc, type WireWrite } from './server';

export interface SnapshotDoc {
  id: string;
  data: Data;
  /** `metadata.hasPendingWrites` of the document. */
  pending: boolean;
}

export interface SdkEvents {
  onSnapshot(key: string, docs: SnapshotDoc[], meta: { fromCache: boolean }): void;
  /** The write's promise settled: resolved (`ok`) or rejected. */
  onSettled(write: Write, ok: boolean, result: CommitResult): void;
}

export interface Sdk {
  isOnline(): boolean;
  setOnline(online: boolean): void;
  /** Attaches a listener. Attaching the same key twice is a no-op. */
  listen(plan: ListenerPlan): void;
  listening(key: string): boolean;
  keys(): string[];
  /** setDoc / updateDoc / deleteDoc: queued, and shown by the listeners at their next event. */
  write(write: Write): void;
  /**
   * Takes a picture of the server's data for a listener (or for all of them). Needs a connection.
   * A listener whose last picture is still current is skipped, unless `again` asks for a repeat.
   */
  capture(key?: string, again?: boolean): boolean;
  /** Hands the oldest captured picture of a listener (or of every listener) to the device. */
  deliver(key?: string): boolean;
  /** Sends the oldest unsent write to the server. */
  sendNext(): boolean;
  /** Brings back the answer for the oldest sent write. */
  ackNext(): boolean;
  /** Raises the events the device has not been told yet (its own writes showing in listeners). */
  flushLocal(): boolean;
  /** True when nothing is queued anywhere on this device. */
  idle(): boolean;
  /** Writes handed to `write`, in total. */
  issued(): number;
}

interface Known {
  /** null: known to be gone as of `version` (our own delete was acknowledged). */
  data: Data | null;
  version: number;
}

interface Listener {
  plan: ListenerPlan;
  known: Map<string, Known>;
  gotServer: boolean;
  queue: { version: number; docs: StoredDoc[] }[];
  /** The server's commit counter at the last picture taken, -1 when none is current. */
  pictured: number;
  dirty: boolean;
}

interface Mutation {
  write: Write;
  wire: WireWrite;
  state: 'queued' | 'sent';
  result?: CommitResult;
  /**
   * A write with `expect` runs as a transaction: it is not shown by the listeners while it is
   * under way, it only goes through if the stored document is the one that was expected, and
   * without a connection it fails instead of waiting.
   */
  expect?: { at: number };
}

const toWire = (write: Write): WireWrite =>
  write.op === 'delete'
    ? { op: 'delete', path: write.path }
    : write.op === 'update'
      ? { op: 'update', path: write.path, data: write.fields }
      : { op: 'set', path: write.path, data: write.data };

/** A pending server time reads as null on the device. */
const local = (data: Data): Data => {
  const out: Data = {};
  for (const [key, value] of Object.entries(data)) out[key] = value === SERVER_TIME ? null : value;
  return out;
};

/** Per-listener limits that replace the plan's own, so a test can make the windows small. */
export type Limits = Partial<Record<string, number>>;

export interface SdkOptions {
  limits?: Limits;
  /**
   * What the link layer is asked to do when a write is refused: read the document from the server
   * before it lets go of the write (`getDocFromServer`), so the device goes straight to what the
   * server has instead of first falling back to a snapshot that may be older. With `false` the
   * read is skipped, as when the connection drops at that moment.
   */
  refetchOnRefusal?: boolean;
}

export function makeSdk(server: Server, uid: string, events: SdkEvents, options: SdkOptions = {}): Sdk {
  const limits = options.limits ?? {};
  const listeners = new Map<string, Listener>();
  const mutations: Mutation[] = [];
  let online = true;
  let issued = 0;

  const limitOf = (plan: ListenerPlan) => limits[plan.slice] ?? plan.limit ?? null;

  /** The listener's id for a path, or null when the path is not its business. */
  const idIn = (listener: Listener, path: string): string | null => {
    const { plan } = listener;
    if (plan.kind === 'doc') return path === plan.path ? path.slice(path.lastIndexOf('/') + 1) : null;
    const prefix = `${plan.path}/`;
    if (!path.startsWith(prefix)) return null;
    const id = path.slice(prefix.length);
    return id.includes('/') ? null : id;
  };

  /** orderBy + limit, as the query would apply them. A pending time counts as the newest. */
  function window<T extends { id: string; data: Data }>(plan: ListenerPlan, docs: T[]): T[] {
    if (plan.kind === 'doc' || !plan.orderBy) return docs;
    const field = plan.orderBy;
    const sign = plan.dir === 'desc' ? -1 : 1;
    const value = (d: T) => (typeof d.data[field] === 'number' ? (d.data[field] as number) : Number.POSITIVE_INFINITY);
    const sorted = [...docs].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va === vb ? 0 : va < vb ? -1 : 1) * sign || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * sign;
    });
    const limit = limitOf(plan);
    return limit == null ? sorted : sorted.slice(0, limit);
  }

  function serverPicture(listener: Listener): StoredDoc[] {
    const { plan } = listener;
    if (plan.kind === 'doc') {
      const doc = server.doc(plan.path);
      return doc ? [doc] : [];
    }
    return window(plan, server.list(plan.path));
  }

  function view(listener: Listener): SnapshotDoc[] {
    const docs = new Map<string, Data>();
    for (const [id, known] of listener.known) if (known.data !== null) docs.set(id, known.data);
    const pending = new Set<string>();
    for (const mutation of mutations) {
      const id = idIn(listener, mutation.wire.path);
      if (id === null || mutation.expect) continue;
      pending.add(id);
      if (mutation.wire.op === 'delete') docs.delete(id);
      else if (mutation.wire.op === 'set') docs.set(id, local(mutation.wire.data ?? {}));
      else if (docs.has(id)) docs.set(id, { ...docs.get(id), ...local(mutation.wire.data ?? {}) });
    }
    const list = [...docs].map(([id, data]) => ({ id, data, pending: pending.has(id) }));
    return window(listener.plan, list);
  }

  function raise(listener: Listener) {
    listener.dirty = false;
    events.onSnapshot(listener.plan.key, view(listener), { fromCache: !online || !listener.gotServer });
  }

  function flushLocal(): boolean {
    let any = false;
    for (const listener of [...listeners.values()]) {
      if (!listener.dirty) continue;
      any = true;
      raise(listener);
    }
    return any;
  }

  const touch = (path: string) => {
    for (const listener of listeners.values()) if (idIn(listener, path) !== null) listener.dirty = true;
  };

  function capture(key?: string, again = false): boolean {
    if (!online) return false;
    let any = false;
    for (const listener of listeners.values()) {
      if (key !== undefined && listener.plan.key !== key) continue;
      // Nothing new on the server since the last picture: no event would be sent.
      if (!again && listener.pictured === server.version()) continue;
      listener.pictured = server.version();
      listener.queue.push({ version: server.version(), docs: serverPicture(listener) });
      any = true;
    }
    return any;
  }

  function deliver(key?: string): boolean {
    if (!online) return false;
    let any = false;
    for (const listener of [...listeners.values()]) {
      if (key !== undefined && listener.plan.key !== key) continue;
      const picture = listener.queue.shift();
      if (!picture) continue;
      any = true;
      const present = new Map(picture.docs.map((d) => [d.id, d]));
      for (const [id, known] of [...listener.known]) {
        if (!present.has(id) && known.version <= picture.version) listener.known.delete(id);
      }
      for (const [id, doc] of present) {
        const known = listener.known.get(id);
        if (!known || known.version <= doc.version) listener.known.set(id, { data: doc.data, version: doc.version });
      }
      listener.gotServer = true;
      raise(listener);
    }
    return any;
  }

  const cannot = (reason: string): CommitResult => ({ ok: false, kind: 'state', reason, version: server.version(), after: null });

  function sendNext(): boolean {
    const mutation = mutations.find((m) => m.state === 'queued');
    if (!mutation) return false;
    if (mutation.expect) {
      // A transaction: no connection, no write; a different document than expected, no write.
      const stored = server.get(mutation.wire.path);
      if (!online) mutation.result = cannot('a transaction needs a connection');
      else if (!stored || stored.at !== mutation.expect.at) mutation.result = cannot('the document is not the one that was expected');
      else mutation.result = server.commit(uid, mutation.wire);
      mutation.state = 'sent';
      return true;
    }
    if (!online) return false;
    mutation.result = server.commit(uid, mutation.wire);
    mutation.state = 'sent';
    return true;
  }

  function ackNext(): boolean {
    const mutation = mutations[0];
    if (!mutation || mutation.state !== 'sent' || !mutation.result) return false;
    if (!online && !mutation.expect) return false;
    // The SDK shows a write in its listeners right after the call, long before the answer is back.
    flushLocal();
    mutations.shift();
    const result = mutation.result;
    if (result.ok) {
      // The acknowledged document is what the cache now holds for it, until the listener catches up.
      for (const listener of listeners.values()) {
        const id = idIn(listener, mutation.wire.path);
        if (id === null) continue;
        const known = listener.known.get(id);
        if (!known || known.version <= result.version) listener.known.set(id, { data: result.after, version: result.version });
      }
    }
    // After a refusal (when asked to) and after every transaction: the document as the server has it.
    const refetch = online && (mutation.expect ? true : !result.ok && options.refetchOnRefusal === true);
    if (refetch) {
      const current = server.doc(mutation.wire.path);
      for (const listener of listeners.values()) {
        const id = idIn(listener, mutation.wire.path);
        if (id !== null && listener.gotServer) listener.known.set(id, { data: current ? current.data : null, version: current ? current.version : server.version() });
      }
    }
    touch(mutation.wire.path);
    if (refetch) flushLocal();
    events.onSettled(mutation.write, result.ok, result);
    return true;
  }

  return {
    isOnline: () => online,
    setOnline: (value) => {
      if (online === value) return;
      online = value;
      // Pictures on their way are lost with the connection; every listener reports its cache.
      for (const listener of listeners.values()) {
        listener.queue.length = 0;
        listener.pictured = -1;
        listener.dirty = true;
      }
    },
    listen: (plan) => {
      if (listeners.has(plan.key)) return;
      listeners.set(plan.key, { plan, known: new Map(), gotServer: false, queue: [], pictured: -1, dirty: true });
    },
    listening: (key) => listeners.has(key),
    keys: () => [...listeners.keys()],
    write: (write) => {
      issued += 1;
      const wire = toWire(write);
      mutations.push({ write, wire, state: 'queued', expect: write.op === 'set' ? write.expect : undefined });
      touch(wire.path);
    },
    capture,
    deliver,
    sendNext,
    ackNext,
    flushLocal,
    idle: () => mutations.length === 0 && [...listeners.values()].every((l) => l.queue.length === 0 && !l.dirty),
    issued: () => issued,
  };
}
