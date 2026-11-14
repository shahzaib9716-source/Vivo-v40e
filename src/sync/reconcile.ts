/**
 * The three-way reconcile between this device and its family (SPEC 4.2). Pure: no firebase, no
 * react, no react-native, no clock of its own. It runs in plain node and is tested there.
 *
 * Three copies of every slice, each a map from item id to item:
 *
 *   local   what the store holds: the person's intent.
 *   remote  the listener's latest snapshot. It includes this device's own writes that have not been
 *           confirmed yet, because that is how the SDK reports them.
 *   base    what `remote` was the last time `local` was reconciled with it.
 *
 * A difference between local and base is something the person did here. A difference between
 * remote and base is something that happened elsewhere. Per item, and inside an item per field:
 *
 *   local == base                     take remote (gone remotely: remove here)
 *   removed here, base had it         may this role delete? send the delete : put it back
 *   added here, base did not have it  remote has the id? take remote (it is our own item, sent before
 *                                     a restart) : may this role create it? send it : drop it
 *   changed here                      each changed field this role may write is sent, alone, and
 *                                     kept; every other field takes the remote value
 *   gone remotely, changed here       the deletion wins
 *
 * and afterwards base := remote (with the writes just issued applied to it).
 *
 * Writes in flight. A write that was issued and has not settled is laid over `remote` before
 * anything is compared, exactly as the SDK lays its pending writes over the server's data. That
 * makes the outcome independent of whether the snapshot that shows the write has arrived yet: the
 * same change is never sent twice, and a snapshot from before the write cannot undo it. The caller
 * keeps the list: add every returned write when it is issued, remove it when its promise settles
 * (either way), then reconcile again. A refused write needs nothing more: once it leaves the list
 * the remote value shows through, local equals base, and the item goes back to what the server has.
 * Nothing is retried.
 *
 * What is never sent: display labels (`ago`, `time`, `updatedAgo`), `at` (the server's time comes
 * from the server-timestamp sentinel in `toDoc`) and anything the role may not write.
 */
import {
  SOS,
  STATUS,
  createProblem,
  docProblems,
  type DocData,
  type ListSlice,
  type ListSpec,
  type SliceItems,
  type SosDoc,
  type SosLocal,
  type StatusDoc,
  type SyncCtx,
} from './schema';

// ---------------------------------------------------------------------------------------------
// Small tools
// ---------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
type WithId = { id: string };
const rec = (v: unknown) => v as Rec;

/** Deep equality for stored values. Key order does not matter; a key holding undefined counts as absent. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  const ra = a as Rec;
  const rb = b as Rec;
  for (const key of Object.keys(ra)) if (ra[key] !== undefined && !same(ra[key], rb[key])) return false;
  for (const key of Object.keys(rb)) if (rb[key] !== undefined && ra[key] === undefined) return false;
  return true;
}

function isIdList(v: unknown): v is WithId[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null && typeof (x as WithId).id === 'string');
}

/**
 * Three-way merge of one field value. A plain value that changed on both sides keeps the local
 * one. A list of records with ids (a child's `apps`) merges record by record and key by key, so a
 * change to one app here and to another app elsewhere both survive.
 */
export function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (isIdList(base) && isIdList(local) && isIdList(remote)) return mergeIdLists(base, local, remote);
  return local;
}

function mergeIdLists(base: WithId[], local: WithId[], remote: WithId[]): WithId[] {
  const baseById = new Map(base.map((x) => [x.id, x]));
  const localById = new Map(local.map((x) => [x.id, x]));
  const remoteIds = new Set(remote.map((x) => x.id));
  const out: WithId[] = [];
  for (const r of remote) {
    const l = localById.get(r.id);
    const b = baseById.get(r.id);
    if (!l) {
      if (!b) out.push(r); // added elsewhere
      continue; // removed here
    }
    if (!b) {
      out.push(r); // added on both sides: the stored one
      continue;
    }
    const merged: Rec = {};
    for (const key of new Set([...Object.keys(r), ...Object.keys(l)])) {
      const value = same(rec(l)[key], rec(b)[key]) ? rec(r)[key] : rec(l)[key];
      if (value !== undefined) merged[key] = value;
    }
    out.push(merged as WithId);
  }
  for (const l of local) if (!remoteIds.has(l.id) && !baseById.has(l.id)) out.push(l); // added here
  return out;
}

const hasAt = (spec: ListSpec) => 'at' in spec.doc;

function byAt<T extends WithId>(items: T[], dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const at = (x: T) => (typeof rec(x).at === 'number' ? (rec(x).at as number) : 0);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (at(a.item) - at(b.item)) * sign || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0) || a.index - b.index)
    .map((x) => x.item);
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

interface WriteBase {
  /** The Firestore document path, for example families/F/children/C/requests/R. */
  path: string;
  /** For the slices under a child, and for `status`: which child. */
  childId?: string;
}

/** `setDoc(doc(db, path), data)` for a document that does not exist yet. */
export interface CreateWrite extends WriteBase {
  op: 'create';
  slice: ListSlice;
  id: string;
  /** The document, with the server-timestamp sentinel and `by` already in place. */
  data: DocData;
  /** The local item this creates. Laid over `remote` while the write is in flight. */
  item: WithId;
}

/** `updateDoc(doc(db, path), fields)`: only the changed fields, plus the role's stamps. */
export interface UpdateWrite extends WriteBase {
  op: 'update';
  slice: ListSlice;
  id: string;
  fields: DocData;
  /** The item fields this changes. Laid over `remote` while the write is in flight. */
  patch: Rec;
}

/** `deleteDoc(doc(db, path))`. */
export interface DeleteWrite extends WriteBase {
  op: 'delete';
  slice: ListSlice;
  id: string;
}

/** `setDoc(doc(db, path), data)` for one of the single documents (signals/sos, live/status). */
export interface SetWrite extends WriteBase {
  op: 'set';
  slice: 'sos' | 'status';
  id: 'sos' | 'status';
  data: DocData;
  /** What the document says once written, as this device knows it. Laid over `remote` while in flight. */
  value: SosDoc | StatusDoc;
  /**
   * Present on a parent's "mark as safe". The write is only meant for the SOS this device has
   * seen, the one whose stored `at` is this many milliseconds. Send it as a transaction: read the
   * document, and write only if its `at` is still this value; otherwise treat the write as refused.
   * A plain queued write would be sent whenever the phone is back online, and would then silence
   * an SOS that was raised in the meantime. A transaction needs a connection, so offline this
   * fails at once, which is what SPEC 4.2 rule 9 asks of an action that needs the server.
   * The SDK does not show a transaction's write in its listeners until the server's answer has
   * come round, so after the transaction settles (either way) read the document from the server
   * before taking the write off the in-flight list.
   */
  expect?: { at: number };
}

export type Write = CreateWrite | UpdateWrite | DeleteWrite | SetWrite;

/** Something the person did here that could not be kept. The item is back to what the server has. */
export interface Reverted {
  slice: ListSlice | 'sos' | 'status';
  id: string;
  op: 'create' | 'update' | 'delete';
  /** For an update: the fields that were put back. */
  fields?: string[];
  /**
   * role     this device's role may not do that
   * invalid  the server would refuse the values (too long, out of range)
   * stale    the server's copy has moved on (the request was already answered, a newer SOS is on)
   */
  reason: 'role' | 'invalid' | 'stale';
  /** A few words for logs and tests. Not written for the person using the app. */
  detail: string;
}

// ---------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------

export interface ListInput<T> {
  /** The store's slice. */
  local: readonly T[];
  base: ReadonlyMap<string, T>;
  /** The listener's snapshot, decoded with `fromDoc`, in the snapshot's order. */
  remote: ReadonlyMap<string, T>;
  ctx: SyncCtx;
  /** Every write issued and not yet settled. Writes of other slices and other children are ignored. */
  inFlight?: readonly Write[];
  /**
   * `sync` (the default) is the table at the top of this file.
   * `adopt`: local is not authoritative (the device has just joined or signed in, SPEC 4.2 rule 2).
   * It is replaced by remote wholesale and nothing is written.
   */
  mode?: 'sync' | 'adopt';
  /**
   * For the slices under a child (requests, messages) when `remote` is one child's listener: only
   * that child's items are reconciled, the others pass through untouched. Leave it out when
   * `remote` holds every child's items.
   */
  childId?: string;
}

export interface ListResult<T> {
  /** The slice as it should now be in the store. The very same array as `local` when nothing changed. */
  nextLocal: readonly T[];
  /** True when `nextLocal` differs from `local`: only then does the store need it. */
  changed: boolean;
  /** To be issued now, in this order, and added to the in-flight list until each settles. */
  writes: Write[];
  /** The base for the next call (for this listener's items). */
  nextBase: Map<string, T>;
  reverted: Reverted[];
}

/** `remote` with the writes in flight laid over it: what the SDK's own view is, or is about to be. */
function effectiveRemote<T extends WithId>(spec: ListSpec, remote: ReadonlyMap<string, T>, inFlight: readonly Write[], childId: string | undefined): Map<string, T> {
  const scoped = spec.scope === 'child' && childId !== undefined;
  const view = new Map<string, T>();
  for (const [id, item] of remote) if (!scoped || rec(item).childId === childId) view.set(id, item);
  for (const write of inFlight) {
    if (write.slice !== spec.slice) continue;
    if (scoped && write.childId !== childId) continue;
    if (write.op === 'create') view.set(write.id, write.item as T);
    else if (write.op === 'delete') view.delete(write.id);
    else if (write.op === 'update') {
      const current = view.get(write.id);
      if (current) view.set(write.id, patched(current, write.patch));
    }
  }
  return view;
}

function patched<T>(item: T, patch: Rec): T {
  const out: Rec = { ...rec(item) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
  return out as T;
}

/**
 * The local item once the synced fields are settled: `chosen` for every synced field, the child and
 * the time from the remote copy, everything else (labels, derived fields) as it is locally. Returns
 * `local` itself when nothing changes, so an untouched item keeps its identity.
 */
function settled<T extends WithId>(spec: ListSpec, local: T, remote: T, chosen: Rec): T {
  let out: Rec | null = null;
  const put = (key: string, value: unknown) => {
    if (same(rec(local)[key], value)) return;
    out ??= { ...rec(local) };
    if (value === undefined) delete out[key];
    else out[key] = value;
  };
  for (const field of spec.fields) put(field, chosen[field]);
  if (spec.scope === 'child') put('childId', rec(remote).childId);
  // A stored time that is still pending decodes to "no time": keep the one this device has.
  if (hasAt(spec)) put('at', rec(remote).at ?? rec(local).at);
  return (out ?? local) as T;
}

const fieldsOf = (spec: ListSpec, item: unknown): Rec => {
  const out: Rec = {};
  for (const field of spec.fields) out[field] = rec(item)[field];
  return out;
};

export function reconcileList<K extends ListSlice>(spec: ListSpec<K>, input: ListInput<SliceItems[K]>): ListResult<SliceItems[K]> {
  type T = SliceItems[K];
  const plain = spec as unknown as ListSpec;
  const { local, base, ctx } = input;
  const scoped = spec.scope === 'child' && input.childId !== undefined;
  const access = spec.access[ctx.role];

  const mine = new Map<string, T>();
  const others: T[] = [];
  for (const item of local) {
    if (scoped && rec(item).childId !== input.childId) others.push(item);
    else if (!mine.has(item.id)) mine.set(item.id, item);
  }
  const remote = effectiveRemote<T>(plain, input.remote, input.inFlight ?? [], input.childId);

  const writes: Write[] = [];
  const reverted: Reverted[] = [];
  /** The reconciled items of this listener, in order. It is both the new local content and the new base. */
  const next = new Map<string, T>();
  const pathOf = (id: string, item: unknown) => spec.docPath(ctx.familyId, id, spec.scope === 'child' ? (rec(item).childId as string) : undefined);
  const childOf = (item: unknown) => (spec.scope === 'child' ? { childId: rec(item).childId as string } : {});

  if (input.mode === 'adopt') {
    for (const [id, e] of remote) {
      const l = mine.get(id);
      next.set(id, l ? settled(plain, l, e, fieldsOf(plain, e)) : e);
    }
  } else {
    for (const [id, e] of remote) {
      const l = mine.get(id);
      const b = base.get(id);
      if (!l) {
        if (!b) {
          next.set(id, e); // added elsewhere
        } else if (access.delete) {
          writes.push({ op: 'delete', slice: spec.slice, id, path: pathOf(id, e), ...childOf(e) }); // removed here
        } else {
          next.set(id, e);
          reverted.push({ slice: spec.slice, id, op: 'delete', reason: 'role', detail: `a ${ctx.role} cannot remove from ${spec.slice}` });
        }
        continue;
      }
      if (!b) {
        // Added here, and the server has the id already: the same item, sent before a restart.
        next.set(id, settled(plain, l, e, fieldsOf(plain, e)));
        continue;
      }
      next.set(id, mergeItem(spec, id, l, b, e, ctx, writes, reverted));
    }

    for (const [id, l] of mine) {
      if (remote.has(id)) continue;
      if (base.has(id)) continue; // gone remotely: the deletion wins, edited here or not
      // Added here.
      const refusal = createProblem(spec, l, ctx);
      if (refusal) {
        reverted.push({ slice: spec.slice, id, op: 'create', reason: 'role', detail: refusal });
        continue;
      }
      // The document is created with the values the rules fix (a request starts pending, an alert
      // starts unread), whatever the local item has come to say in the meantime.
      const fixed = access.create ? access.create.fixed : undefined;
      const created = fixed && !same(fieldsOf(plain, l), { ...fieldsOf(plain, l), ...fixed }) ? patched(l, { ...fixed }) : l;
      const data = spec.toDoc(created, ctx);
      const problems = docProblems(spec, id, data, 'create', ctx);
      if (problems.length > 0) {
        reverted.push({ slice: spec.slice, id, op: 'create', reason: 'invalid', detail: problems.join('; ') });
        continue;
      }
      writes.push({ op: 'create', slice: spec.slice, id, path: pathOf(id, l), ...childOf(l), data, item: created });
      // Where the local item differs from what was created, that is a change to an existing item.
      next.set(id, created === l ? l : mergeItem(spec, id, l, created, created, ctx, writes, reverted));
    }
  }

  let ordered: T[] = [...next.values()];
  if (spec.order.by === 'at') ordered = byAt([...ordered, ...others], spec.order.dir);
  else if (others.length > 0) ordered = [...ordered, ...others];
  const changed = ordered.length !== local.length || ordered.some((item, index) => item !== local[index]);
  return { nextLocal: changed ? ordered : local, changed, writes, nextBase: next, reverted };
}

/** An item that exists in all three copies: field by field. */
function mergeItem<K extends ListSlice>(
  spec: ListSpec<K>,
  id: string,
  l: SliceItems[K],
  b: SliceItems[K],
  e: SliceItems[K],
  ctx: SyncCtx,
  writes: Write[],
  reverted: Reverted[],
): SliceItems[K] {
  const plain = spec as unknown as ListSpec;
  const chosen: Rec = {};
  const patch: Rec = {};
  for (const field of spec.fields) {
    const lv = rec(l)[field];
    const ev = rec(e)[field];
    chosen[field] = ev;
    if (same(lv, rec(b)[field]) || same(lv, ev)) continue; // not changed here, or already there
    const merged = mergeValue(rec(b)[field], lv, ev);
    if (!same(merged, ev)) patch[field] = merged;
  }
  const wanted = Object.keys(patch);
  if (wanted.length === 0) return settled(plain, l, e, chosen);

  const refuse = (fields: string[], reason: Reverted['reason'], detail: string) => {
    for (const field of fields) delete patch[field];
    if (fields.length > 0) reverted.push({ slice: spec.slice, id, op: 'update', fields, reason, detail });
  };

  const rule = spec.access[ctx.role].update;
  if (!rule) {
    refuse(wanted, 'role', `a ${ctx.role} cannot change ${spec.slice}`);
  } else {
    const unmet = Object.entries(rule.when ?? {}).find(([key, value]) => !same(rec(e)[key], value));
    if (unmet) {
      refuse(wanted, 'stale', `${unmet[0]} is no longer ${String(unmet[1])}`);
    } else {
      const notMine = wanted.filter((field) => !rule.fields.includes(field));
      refuse(notMine, 'role', `a ${ctx.role} cannot change ${notMine.join(', ')} in ${spec.slice}`);
      const badValue = Object.keys(patch).filter((field) => rule.oneOf?.[field] && !rule.oneOf[field].some((v) => same(v, patch[field])));
      refuse(badValue, 'role', `a ${ctx.role} cannot set ${badValue.join(', ')} to that`);
    }
  }

  if (Object.keys(patch).length > 0) {
    // The document as it will be once the update lands has to pass the same shape check as a new one.
    const problems = docProblems(spec, id, spec.toDoc(patched(e, patch), ctx), 'update', ctx);
    if (problems.length > 0) refuse(Object.keys(patch), 'invalid', problems.join('; '));
  }

  if (Object.keys(patch).length > 0) {
    const childId = spec.scope === 'child' ? (rec(e).childId as string) : undefined;
    writes.push({
      op: 'update',
      slice: spec.slice,
      id,
      path: spec.docPath(ctx.familyId, id, childId),
      ...(childId !== undefined ? { childId } : {}),
      fields: spec.updateFields(patch, ctx),
      patch: { ...patch },
    });
    Object.assign(chosen, patch);
  }
  return settled(plain, l, e, chosen);
}

/**
 * After a restart nothing is in flight and the base is the confirmed copy that was saved with the
 * local state. Reconciling local against it and the first snapshot from the server yields exactly
 * the writes that never reached the server (SPEC 4.2 rule 3): an unsent create or delete, a changed
 * field. A write that did arrive before the restart is recognised (the server already has the id or
 * the value) and is not sent again.
 */
export function regenerateAfterRestart<K extends ListSlice>(
  spec: ListSpec<K>,
  input: { local: readonly SliceItems[K][]; confirmed: ReadonlyMap<string, SliceItems[K]>; remote: ReadonlyMap<string, SliceItems[K]>; ctx: SyncCtx; childId?: string },
): ListResult<SliceItems[K]> {
  return reconcileList(spec, { local: input.local, base: input.confirmed, remote: input.remote, ctx: input.ctx, inFlight: [], childId: input.childId });
}

/**
 * Replays what the person did between `from` and `current` on top of `to`.
 *
 * The store uses it when a reconciled slice (`to`, worked out from `from`) arrives while a change
 * made in the meantime is still queued: the queued change must not be overwritten. Items added in
 * the meantime are kept, items removed stay removed, changed fields keep their new values, and
 * everything else is `to`. No role is consulted here: the next reconcile judges the result.
 */
export function rebaseList<T extends WithId>(from: readonly T[], to: readonly T[], current: readonly T[]): readonly T[] {
  if (current === from) return to;
  const fromById = new Map(from.map((x) => [x.id, x]));
  const currentById = new Map(current.map((x) => [x.id, x]));
  const toIds = new Set(to.map((x) => x.id));
  const out: T[] = [];
  for (const t of to) {
    const f = fromById.get(t.id);
    const c = currentById.get(t.id);
    if (!c) {
      if (!f) out.push(t); // new from the family
      continue; // removed in the meantime
    }
    if (!f || c === f) {
      out.push(t);
      continue;
    }
    let merged: Rec | null = null;
    for (const key of new Set([...Object.keys(rec(t)), ...Object.keys(rec(c))])) {
      if (same(rec(c)[key], rec(f)[key]) || same(rec(c)[key], rec(t)[key])) continue;
      merged ??= { ...rec(t) };
      if (rec(c)[key] === undefined) delete merged[key];
      else merged[key] = rec(c)[key];
    }
    out.push((merged ?? t) as T);
  }
  // Added in the meantime: before the known items when it was put in front, after them otherwise.
  const firstKnown = current.findIndex((x) => fromById.has(x.id));
  const front: T[] = [];
  const back: T[] = [];
  current.forEach((c, index) => {
    if (fromById.has(c.id) || toIds.has(c.id)) return;
    if (firstKnown !== -1 && index < firstKnown) front.push(c);
    else back.push(c);
  });
  return front.length + back.length > 0 ? [...front, ...out, ...back] : out;
}

// ---------------------------------------------------------------------------------------------
// The confirmed copy (SPEC 4.2 rule 3)
// ---------------------------------------------------------------------------------------------

const concerns = (spec: ListSpec, childId: string | undefined) => (write: Write) =>
  write.slice === spec.slice && !(spec.scope === 'child' && childId !== undefined && write.childId !== childId);

/**
 * The server-confirmed copy after a snapshot. It only ever takes data the server has confirmed:
 *
 * - a document without pending writes is the server's: taken as it is;
 * - a document with pending writes that was confirmed before keeps the confirmed value of every
 *   field one of our writes in flight touches, and takes the snapshot's value for the rest (those
 *   come from the server);
 * - a document that exists only because of a pending create is left out;
 * - a document missing from the snapshot is dropped, unless one of our deletes in flight hides it.
 *
 * `pending` holds the ids whose snapshot document has `metadata.hasPendingWrites`.
 */
export function advanceConfirmed<T extends WithId>(
  spec: ListSpec,
  confirmed: ReadonlyMap<string, T>,
  remote: ReadonlyMap<string, T>,
  pending: ReadonlySet<string>,
  inFlight: readonly Write[],
  childId?: string,
): Map<string, T> {
  const mine = inFlight.filter(concerns(spec, childId));
  const out = new Map<string, T>();
  for (const [id, item] of remote) {
    if (!pending.has(id)) {
      out.set(id, item);
      continue;
    }
    const before = confirmed.get(id);
    if (!before) continue;
    const touching = mine.filter((w) => w.op !== 'set' && w.id === id);
    if (touching.length === 0 || touching.some((w) => w.op !== 'update')) {
      out.set(id, before);
      continue;
    }
    const merged: Rec = { ...rec(item) };
    for (const write of touching) {
      if (write.op !== 'update') continue;
      for (const field of Object.keys(write.patch)) {
        if (rec(before)[field] === undefined) delete merged[field];
        else merged[field] = rec(before)[field];
      }
    }
    if (hasAt(spec) && merged.at === undefined && rec(before).at !== undefined) merged.at = rec(before).at;
    out.set(id, merged as T);
  }
  for (const [id, before] of confirmed) {
    if (out.has(id) || remote.has(id)) continue;
    if (mine.some((w) => w.op === 'delete' && w.id === id)) out.set(id, before);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// One listener's bookkeeping: the gate, the adopt flag, base and confirmed
// ---------------------------------------------------------------------------------------------

/**
 * Everything the engine keeps for one list listener. The functions below move it forward; they
 * carry the rules that pure code can carry:
 *
 * rule 1  nothing is reconciled, so nothing is pushed, before the listener's first snapshot from
 *         the server (`fromCache === false`). An empty cache snapshot is not "everything deleted".
 * rule 2  while `adopt` is set the first step replaces local with remote and writes nothing.
 * rule 3  `confirmed` only takes server-confirmed data, and a restart starts `base` from it.
 *
 * Persist `confirmed` (as a list) and `adopt` together with the store's state, in one write:
 * `applyRemote(patch, record)` in the store does that. A confirmed copy saved apart from the local
 * state it belongs to makes the next start take server changes for local ones.
 */
export interface ListState<T> {
  /** True once a snapshot from the server has been taken in. */
  ready: boolean;
  adopt: boolean;
  /** True for a slice this role cannot read (a child and the alerts): `remote` is then what was sent and acknowledged. */
  writeOnly: boolean;
  base: ReadonlyMap<string, T>;
  /** The latest snapshot, or null before the first one from the server. */
  remote: ReadonlyMap<string, T> | null;
  /** Ids whose snapshot document had pending writes. */
  pending: ReadonlySet<string>;
  confirmed: ReadonlyMap<string, T>;
}

const mapOf = <T extends WithId>(items: Iterable<T> | undefined) => new Map([...(items ?? [])].map((item) => [item.id, item] as const));

/**
 * The state for a listener that is about to be attached: at the start of a session, after a
 * restart (pass what was saved) and whenever a listener is attached again (see `relisten`).
 */
export function startList<T extends WithId>(saved?: { confirmed?: Iterable<T>; adopt?: boolean }): ListState<T> {
  const confirmed = mapOf(saved?.confirmed);
  return { ready: false, adopt: saved?.adopt ?? false, writeOnly: false, base: confirmed, remote: null, pending: new Set(), confirmed };
}

/**
 * The state for a slice this role may add to and cannot read (a child and the alerts). There is no
 * listener: what was sent and acknowledged stands in for the snapshot, so it is ready at once.
 */
export function startWriteOnly<T extends WithId>(saved?: { confirmed?: Iterable<T>; adopt?: boolean }): ListState<T> {
  const confirmed = mapOf(saved?.confirmed);
  return { ready: true, adopt: saved?.adopt ?? false, writeOnly: true, base: confirmed, remote: confirmed, pending: new Set(), confirmed };
}

/**
 * Call when a listener is detached and attached again. The memory cache forgets a query's documents
 * once nobody listens, so the first snapshot of the new listener may come from an empty cache: the
 * gate closes until the server has answered again. Base and confirmed stay.
 */
export function relisten<T>(state: ListState<T>): ListState<T> {
  return state.writeOnly ? state : { ...state, ready: false, remote: null, pending: new Set() };
}

export interface DecodedSnapshot<T> {
  remote: Map<string, T>;
  pending: Set<string>;
}

/**
 * Turns a query snapshot into what the functions here take. `docs`: for each document its id, its
 * data and `metadata.hasPendingWrites`, in the snapshot's order. Times may still be Timestamps.
 * A document that cannot be used (see `fromDoc`) is left out. For a query that returns the newest
 * first but is shown oldest first (messages) the order is fixed by the reconcile, not here.
 */
export function decodeSnapshot<K extends ListSlice>(
  spec: ListSpec<K>,
  docs: Iterable<{ id: string; data: DocData; pending: boolean }>,
  ctx: SyncCtx,
  childId?: string,
): DecodedSnapshot<SliceItems[K]> {
  const remote = new Map<string, SliceItems[K]>();
  const pending = new Set<string>();
  for (const doc of docs) {
    const item = spec.fromDoc(doc.id, doc.data, ctx, childId);
    if (!item) continue;
    remote.set(doc.id, item);
    if (doc.pending) pending.add(doc.id);
  }
  return { remote, pending };
}

/** Takes a snapshot in. Before the first one from the server, a snapshot from the cache is ignored. */
export function onListSnapshot<K extends ListSlice>(
  spec: ListSpec<K>,
  state: ListState<SliceItems[K]>,
  snapshot: DecodedSnapshot<SliceItems[K]>,
  meta: { fromCache: boolean },
  inFlight: readonly Write[],
  childId?: string,
): ListState<SliceItems[K]> {
  if (state.writeOnly) return state;
  if (!state.ready && meta.fromCache) return state;
  const confirmed = advanceConfirmed(spec as unknown as ListSpec, state.confirmed, snapshot.remote, snapshot.pending, inFlight, childId);
  return { ...state, ready: true, remote: snapshot.remote, pending: snapshot.pending, confirmed };
}

export interface ListStep<T> extends Omit<ListResult<T>, 'nextBase'> {
  state: ListState<T>;
}

/**
 * Reconciles the store's slice with this listener. Run it after every snapshot, after every store
 * change and after every write that settles. Before the gate opens it does nothing and returns no
 * writes. Issue the writes it returns and add them to the in-flight list.
 */
export function stepList<K extends ListSlice>(
  spec: ListSpec<K>,
  state: ListState<SliceItems[K]>,
  local: readonly SliceItems[K][],
  ctx: SyncCtx,
  inFlight: readonly Write[],
  childId?: string,
): ListStep<SliceItems[K]> {
  if (!state.ready || state.remote === null) return { state, nextLocal: local, changed: false, writes: [], reverted: [] };
  const { nextBase, ...result } = reconcileList(spec, {
    local,
    base: state.base,
    remote: state.remote,
    ctx,
    inFlight,
    mode: state.adopt ? 'adopt' : 'sync',
    childId,
  });
  return { ...result, state: { ...state, base: nextBase, adopt: false } };
}

/**
 * Call when a write's promise settles, after taking the write off the in-flight list, then step
 * again. Acknowledged: the write is server-confirmed, so `confirmed` takes it (unless a snapshot
 * has already shown the document without pending writes: then `confirmed` is at least as new). For
 * a write-only slice the acknowledged item also joins `remote`. Refused: nothing to do here; the
 * next step puts the item back to the remote value (SPEC 4.2 rule 4).
 */
export function settleList<K extends ListSlice>(spec: ListSpec<K>, state: ListState<SliceItems[K]>, write: Write, acknowledged: boolean): ListState<SliceItems[K]> {
  type T = SliceItems[K];
  if (!acknowledged || write.op === 'set' || write.slice !== spec.slice) return state;
  const stillPending = state.writeOnly || state.pending.has(write.id) || (state.remote !== null && !state.remote.has(write.id));
  if (!stillPending) return state;
  const apply = (map: ReadonlyMap<string, T>): Map<string, T> => {
    const out = new Map(map);
    if (write.op === 'create') {
      if (!out.has(write.id)) out.set(write.id, write.item as T);
    } else if (write.op === 'delete') {
      out.delete(write.id);
    } else {
      const current = out.get(write.id);
      if (current) out.set(write.id, patched(current, write.patch));
    }
    return out;
  };
  const confirmed = apply(state.confirmed);
  return state.writeOnly ? { ...state, confirmed, remote: apply(state.remote ?? new Map()) } : { ...state, confirmed };
}

/**
 * A write-only slice only grows on this device. Keep the newest `keep` acknowledged items and
 * forget the rest: the next step removes them locally and writes nothing.
 */
export function pruneWriteOnly<T extends WithId>(state: ListState<T>, keep: number): ListState<T> {
  if (!state.writeOnly || state.confirmed.size <= keep) return state;
  const kept = mapOf(byAt([...state.confirmed.values()], 'desc').slice(0, keep));
  const remote = new Map([...(state.remote ?? new Map<string, T>())].filter(([id]) => kept.has(id) || !state.confirmed.has(id)));
  return { ...state, confirmed: kept, remote };
}

// ---------------------------------------------------------------------------------------------
// Single documents: the SOS flag and a child's check-in
// ---------------------------------------------------------------------------------------------

export interface SingleResult<L, D> {
  nextLocal: L;
  changed: boolean;
  writes: Write[];
  nextBase: D | null;
  reverted: Reverted[];
}

const sosNow = (local: SosLocal) => (local.sosActive ? { active: true, childId: local.sosChildId } : { active: false, childId: null });
const sosOf = (doc: SosDoc | null) => (doc && doc.active ? { active: true, childId: doc.childId } : { active: false, childId: null });

function lastSet<D>(slice: 'sos' | 'status', remote: D | null, inFlight: readonly Write[], childId?: string): D | null {
  let view = remote;
  for (const write of inFlight) {
    if (write.op === 'set' && write.slice === slice && (childId === undefined || write.childId === childId)) view = write.value as D;
  }
  return view;
}

/**
 * signals/sos against the store's `sosActive` / `sosChildId`.
 *
 * - Not changed here: take the server's.
 * - Raised here: only a child device may, and only for itself. It may do so over anybody's SOS.
 * - Cleared here: a parent may clear any SOS; a child only its own. A clear that was meant for an
 *   SOS that has since been replaced by a newer one (the stored time moved on while this device
 *   was offline) is dropped: marking an old alarm safe must not silence a new one. For the same
 *   reason a parent's clear carries `expect` (see SetWrite), so that it is not left in a queue.
 */
export function reconcileSos(input: {
  local: SosLocal;
  base: SosDoc | null;
  remote: SosDoc | null;
  ctx: SyncCtx;
  inFlight?: readonly Write[];
  mode?: 'sync' | 'adopt';
}): SingleResult<SosLocal, SosDoc> {
  const { local, base, ctx } = input;
  const remote = lastSet<SosDoc>('sos', input.remote, input.inFlight ?? []);
  const take = (reverted: Reverted[] = []): SingleResult<SosLocal, SosDoc> => {
    const nextLocal = SOS.toLocal(remote);
    const changed = !same(nextLocal, { sosActive: local.sosActive, sosChildId: local.sosActive ? local.sosChildId : null });
    return { nextLocal: changed ? nextLocal : local, changed, writes: [], nextBase: remote, reverted };
  };
  if (input.mode === 'adopt') return take();

  const l = sosNow(local);
  const e = sosOf(remote);
  if (same(l, sosOf(base))) return take();
  if (same(l, e)) return { nextLocal: local, changed: false, writes: [], nextBase: remote, reverted: [] };

  const refuse = (reason: Reverted['reason'], detail: string) => take([{ slice: 'sos', id: 'sos', op: 'update', fields: ['sosActive'], reason, detail }]);
  let value: { active: boolean; childId: string | null };
  if (l.active) {
    if (ctx.role !== 'child' || ctx.childId == null) return refuse('role', 'only a child device can raise an SOS');
    if (l.childId !== ctx.childId) return refuse('role', 'a child device can only raise its own SOS');
    value = { active: true, childId: ctx.childId };
  } else {
    // l is "off" and differs from e, so an SOS is on at the server.
    const newer = base !== null && remote !== null && base.active && base.at !== null && remote.at !== null && base.at !== remote.at;
    if (newer) return refuse('stale', 'a newer SOS is on');
    if (ctx.role === 'child' && e.childId !== ctx.childId) return refuse('role', "a child device cannot clear another child's SOS");
    value = { active: false, childId: ctx.role === 'child' ? ctx.childId : e.childId };
  }
  const written: SosDoc = { ...value, at: null };
  const write: SetWrite = { op: 'set', slice: 'sos', id: 'sos', path: SOS.path(ctx.familyId), data: SOS.toDoc(value, ctx), value: written };
  // A parent's clear is tied to the SOS it was made for.
  if (!value.active && ctx.role === 'parent' && remote !== null && remote.at !== null) write.expect = { at: remote.at };
  return { nextLocal: local, changed: false, writes: [write], nextBase: written, reverted: [] };
}

/**
 * children/{childId}/live/status against `checkInAt` of that child in the store's `children`.
 *
 * Only the device enrolled as that child writes it, and what it writes is "now" by the server's
 * clock: the local time of the tap is a stand-in until the server's time arrives. A check-in made
 * here is sent when it is later than what the server has; otherwise the server's time is taken.
 * `updatedAgo` is a label and is left alone: screens draw it from `checkInAt`.
 */
export function reconcileStatus(input: {
  local: readonly SliceItems['children'][];
  childId: string;
  base: StatusDoc | null;
  remote: StatusDoc | null;
  ctx: SyncCtx;
  inFlight?: readonly Write[];
  mode?: 'sync' | 'adopt';
}): SingleResult<readonly SliceItems['children'][], StatusDoc> {
  const { local, childId, base, ctx } = input;
  const child = local.find((c) => c.id === childId);
  const view = lastSet<StatusDoc>('status', input.remote, input.inFlight ?? [], childId);
  if (!child) return { nextLocal: local, changed: false, writes: [], nextBase: view, reverted: [] };

  const lv = child.checkInAt;
  // A stored time that is still pending reads as null: it is our own check-in, so the local time stands in.
  const ev = view === null ? undefined : (view.checkInAt ?? lv);
  const bv = base === null ? undefined : (base.checkInAt ?? lv);
  const known: StatusDoc | null = view === null ? null : { checkInAt: ev ?? null };
  const take = (reverted: Reverted[] = []): SingleResult<readonly SliceItems['children'][], StatusDoc> => {
    if (lv === ev) return { nextLocal: local, changed: false, writes: [], nextBase: known, reverted };
    const nextLocal = local.map((c) => {
      if (c.id !== childId) return c;
      const { checkInAt: _dropped, ...rest } = c;
      return ev === undefined ? rest : { ...rest, checkInAt: ev };
    });
    return { nextLocal, changed: true, writes: [], nextBase: known, reverted };
  };

  if (input.mode === 'adopt' || lv === bv || lv === ev) return take();
  const own = ctx.role === 'child' && ctx.childId === childId;
  if (!own) return take([{ slice: 'status', id: childId, op: 'update', fields: ['checkInAt'], reason: 'role', detail: 'only the child device itself can check in' }]);
  if (lv === undefined || (ev !== undefined && lv <= ev)) return take(); // the server's check-in is the later one
  const value: StatusDoc = { checkInAt: lv };
  const write: SetWrite = { op: 'set', slice: 'status', id: 'status', childId, path: STATUS.path(ctx.familyId, childId), data: STATUS.toDoc(ctx), value };
  return { nextLocal: local, changed: false, writes: [write], nextBase: value, reverted: [] };
}

/** One single-document listener's bookkeeping. The same gate and adopt flag as `ListState`. */
export interface DocState<D> {
  ready: boolean;
  adopt: boolean;
  base: D | null;
  remote: D | null;
  /** True when the snapshot's document had pending writes. */
  pending: boolean;
  confirmed: D | null;
}

export function startDoc<D>(saved?: { confirmed?: D | null; adopt?: boolean }): DocState<D> {
  const confirmed = saved?.confirmed ?? null;
  return { ready: false, adopt: saved?.adopt ?? false, base: confirmed, remote: null, pending: false, confirmed };
}

export function relistenDoc<D>(state: DocState<D>): DocState<D> {
  return { ...state, ready: false, remote: null, pending: false };
}

/**
 * Takes a document snapshot in: `doc` is `SOS.fromDoc(...)` / `STATUS.fromDoc(...)` of its data,
 * null when the document does not exist. `pending` is `metadata.hasPendingWrites`.
 */
export function onDocSnapshot<D>(state: DocState<D>, doc: D | null, meta: { fromCache: boolean; pending: boolean }): DocState<D> {
  if (!state.ready && meta.fromCache) return state;
  return { ...state, ready: true, remote: doc, pending: meta.pending, confirmed: meta.pending ? state.confirmed : doc };
}

export function stepSos(state: DocState<SosDoc>, local: SosLocal, ctx: SyncCtx, inFlight: readonly Write[]): Omit<SingleResult<SosLocal, SosDoc>, 'nextBase'> & { state: DocState<SosDoc> } {
  if (!state.ready) return { state, nextLocal: local, changed: false, writes: [], reverted: [] };
  const { nextBase, ...result } = reconcileSos({ local, base: state.base, remote: state.remote, ctx, inFlight, mode: state.adopt ? 'adopt' : 'sync' });
  return { ...result, state: { ...state, base: nextBase, adopt: false } };
}

export function stepStatus(
  state: DocState<StatusDoc>,
  local: readonly SliceItems['children'][],
  childId: string,
  ctx: SyncCtx,
  inFlight: readonly Write[],
): Omit<SingleResult<readonly SliceItems['children'][], StatusDoc>, 'nextBase'> & { state: DocState<StatusDoc> } {
  if (!state.ready) return { state, nextLocal: local, changed: false, writes: [], reverted: [] };
  const { nextBase, ...result } = reconcileStatus({ local, childId, base: state.base, remote: state.remote, ctx, inFlight, mode: state.adopt ? 'adopt' : 'sync' });
  // The child is not in the store yet (its document has not arrived): keep the adopt flag for when it is.
  const seen = local.some((c) => c.id === childId);
  return { ...result, state: { ...state, base: seen ? nextBase : state.base, adopt: seen ? false : state.adopt } };
}

// ---------------------------------------------------------------------------------------------
// The in-flight list
// ---------------------------------------------------------------------------------------------

/** The in-flight list with newly issued writes added. */
export function issued(inFlight: readonly Write[], writes: readonly Write[]): readonly Write[] {
  return writes.length === 0 ? inFlight : [...inFlight, ...writes];
}

/** The in-flight list without a write whose promise settled (resolved or rejected). */
export function settledWrite(inFlight: readonly Write[], write: Write): readonly Write[] {
  return inFlight.filter((w) => w !== write);
}

/**
 * Items of a slice under a child that belong to no child this device knows: sample data left from
 * before linking, or an item made for a child that does not exist. They cannot be stored anywhere.
 * `known`: a parent's children once the children listener has delivered; a child device's own id.
 */
export function dropOrphans<T extends { id: string; childId: string }>(local: readonly T[], known: ReadonlySet<string>): { nextLocal: readonly T[]; dropped: T[] } {
  const dropped = local.filter((item) => !known.has(item.childId));
  return dropped.length === 0 ? { nextLocal: local, dropped } : { nextLocal: local.filter((item) => known.has(item.childId)), dropped };
}
