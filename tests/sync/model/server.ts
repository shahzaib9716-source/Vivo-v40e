/**
 * A fake Cloud Firestore for the model tests: documents in memory, a commit counter, a clock that
 * stamps server times, and the access rules of firestore.rules for the synced data.
 *
 * The rules here are written from firestore.rules by hand and on purpose do not use
 * src/sync/schema.ts. The engine decides from the schema what it may send; this server decides from
 * its own copy of the rules what it accepts. If the two disagree, the model run shows it as a write
 * that was refused for its role or its shape, which the tests treat as a failure.
 */

export type Data = Record<string, unknown>;

/** What a device stores where the rules want `== request.time`. */
export const SERVER_TIME: { readonly serverTime: true } = Object.freeze({ serverTime: true as const });

export interface Member {
  role: 'parent' | 'child';
  childId: string | null;
}

/** `set` is setDoc (create or replace), `update` is updateDoc, `delete` is deleteDoc. */
export interface WireWrite {
  op: 'set' | 'update' | 'delete';
  path: string;
  data?: Data;
}

/**
 * Why a write was refused.
 * role   this account's role may never do that
 * shape  the document would not have the shape the rules demand
 * state  allowed in general, but not against what is stored now (already answered, already there,
 *        gone, somebody else's SOS): the outcome of a race, never a mistake of the sender
 */
export type RefusalKind = 'role' | 'shape' | 'state';

export interface CommitResult {
  ok: boolean;
  kind?: RefusalKind;
  reason?: string;
  /** The commit counter after this write (unchanged when refused). */
  version: number;
  /** The stored document after the write, null when it does not exist. */
  after: Data | null;
}

export interface StoredDoc {
  id: string;
  data: Data;
  version: number;
}

export interface LogEntry {
  uid: string;
  write: WireWrite;
  result: CommitResult;
}

export interface Server {
  readonly familyId: string;
  readonly members: Map<string, Member>;
  readonly log: LogEntry[];
  /** Paths removed by an accepted delete. */
  readonly deleted: Set<string>;
  /** Documents that were created again after an accepted delete, and by whom. */
  readonly resurrected: { path: string; uid: string }[];
  version(): number;
  now(): number;
  /** Lets time pass on the server's clock. */
  tick(ms: number): void;
  /** Stores a document without consulting the rules (family creation is outside these tests). */
  seed(path: string, data: Data): void;
  get(path: string): Data | null;
  /** Every document directly inside a collection. */
  list(collectionPath: string): StoredDoc[];
  doc(path: string): StoredDoc | null;
  commit(uid: string, write: WireWrite): CommitResult;
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const idOk = (id: unknown) => typeof id === 'string' && ID.test(id);
const size = (s: string) => Array.from(s).length;
const text = (v: unknown, max: number) => typeof v === 'string' && size(v) <= max;
const nonEmptyText = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && size(v) <= max;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isBool = (v: unknown) => typeof v === 'boolean';
const isList = (v: unknown): v is unknown[] => Array.isArray(v);
const isRequestTime = (v: unknown) => v === SERVER_TIME;
const hasOnly = (d: Data, keys: readonly string[]) => Object.keys(d).every((k) => keys.includes(k));
const hasAll = (d: Data, keys: readonly string[]) => keys.every((k) => k in d);
const exactly = (d: Data, keys: readonly string[]) => hasOnly(d, keys) && hasAll(d, keys);

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as Data);
  const kb = Object.keys(b as Data);
  return ka.length === kb.length && ka.every((k) => k in (b as Data) && deepEqual((a as Data)[k], (b as Data)[k]));
}

/** `request.resource.data.diff(resource.data).affectedKeys().hasOnly(fields)` */
function onlyChanged(next: Data, prev: Data, fields: readonly string[]): boolean {
  for (const key of new Set([...Object.keys(next), ...Object.keys(prev)])) {
    const same = key in next && key in prev && deepEqual(next[key], prev[key]);
    if (!same && !fields.includes(key)) return false;
  }
  return true;
}

type Verdict = null | { kind: RefusalKind; reason: string };
const no = (kind: RefusalKind, reason: string): Verdict => ({ kind, reason });

export function makeServer(familyId: string, startTime = 1_700_000_000_000): Server {
  const docs = new Map<string, { data: Data; version: number }>();
  const members = new Map<string, Member>();
  const log: LogEntry[] = [];
  const deleted = new Set<string>();
  const resurrected: { path: string; uid: string }[] = [];
  let version = 0;
  let clock = startTime;
  const root = `families/${familyId}/`;

  const childExists = (cid: string) => docs.has(`${root}children/${cid}`);

  /**
   * The rules for one document. `prev` is `resource.data`, `next` is `request.resource.data`.
   * `again` marks a setDoc onto a document that already exists: the rules judge it as an update,
   * and where they refuse it the sender made no mistake, its first attempt had simply arrived.
   */
  function allow(uid: string, kind: 'create' | 'update' | 'delete', segments: string[], prev: Data | null, next: Data | null, again: boolean): Verdict {
    const me = members.get(uid);
    if (!me) return no('role', 'not a member of this family');
    const isParent = me.role === 'parent';
    const isChild = me.role === 'child';
    const isChildOf = (cid: string) => isChild && me.childId === cid;
    const d = next ?? {};
    const [top, id, sub, subId, ...rest] = segments;
    if (rest.length > 0) return no('role', 'no such path');

    if (top === 'children' && sub === undefined) {
      if (kind === 'delete') return no('role', 'children are never deleted');
      if (!isParent) return no('role', 'only a parent writes a child record');
      if (kind === 'create' && !idOk(id)) return no('shape', 'bad id');
      const ok =
        exactly(d, ['name', 'age', 'deviceName', 'battery', 'online', 'bedtime', 'usedMin', 'limitMin', 'place', 'placeIcon', 'apps', 'weekly', 'ord']) &&
        nonEmptyText(d.name, 60) &&
        isNumber(d.age) && d.age >= 0 && d.age <= 25 &&
        text(d.deviceName, 60) &&
        isNumber(d.battery) && d.battery >= 0 && d.battery <= 100 &&
        isBool(d.online) &&
        isBool(d.bedtime) &&
        isNumber(d.usedMin) && d.usedMin >= 0 && d.usedMin <= 1440 &&
        isNumber(d.limitMin) && d.limitMin >= 0 && d.limitMin <= 1440 &&
        text(d.place, 60) &&
        text(d.placeIcon, 40) &&
        isList(d.apps) && d.apps.length <= 60 &&
        isList(d.weekly) && d.weekly.length === 7 &&
        isNumber(d.ord);
      return ok ? null : no('shape', 'childShapeOk');
    }

    if (top === 'children' && sub === 'live') {
      if (kind === 'delete') return no('role', 'live/status is never deleted');
      if (subId !== 'status' || !isChildOf(id)) return no('role', 'only the child device itself writes its status');
      const ok = exactly(d, ['checkInAt', 'by']) && isRequestTime(d.checkInAt) && d.by === uid;
      return ok ? null : no('shape', 'status shape');
    }

    if (top === 'children' && sub === 'requests') {
      if (kind === 'delete') return isParent ? null : no('role', 'only a parent deletes a request');
      if (kind === 'create') {
        if (!isChildOf(id)) return no('role', 'only the child device itself asks');
        const ok =
          idOk(subId) &&
          hasOnly(d, ['kind', 'label', 'detail', 'minutes', 'appId', 'status', 'at', 'by']) &&
          hasAll(d, ['kind', 'label', 'detail', 'status', 'at', 'by']) &&
          ['extra_time', 'unlock_app', 'bedtime'].includes(d.kind as string) &&
          nonEmptyText(d.label, 80) &&
          text(d.detail, 200) &&
          (!('minutes' in d) || (isInt(d.minutes) && d.minutes > 0 && d.minutes <= 240)) &&
          (!('appId' in d) || nonEmptyText(d.appId, 40)) &&
          d.status === 'pending' &&
          isRequestTime(d.at) &&
          d.by === uid;
        return ok ? null : no('shape', 'request shape');
      }
      // update
      if (!isParent) return again && isChildOf(id) ? no('state', 'the request exists already') : no('role', 'only a parent answers a request');
      if (again) return no('role', 'a parent does not create requests');
      if (prev!.status !== 'pending') return no('state', 'the request was already answered');
      const ok =
        onlyChanged(d, prev!, ['status', 'resolvedBy', 'resolvedAt']) &&
        ['approved', 'denied'].includes(d.status as string) &&
        d.resolvedBy === uid &&
        isRequestTime(d.resolvedAt);
      return ok ? null : no('shape', 'request answer shape');
    }

    if (top === 'children' && sub === 'messages') {
      if (kind !== 'create') return again ? no('state', 'the message exists already') : no('role', 'a message is never changed or removed');
      const shape = idOk(subId) && exactly(d, ['from', 'text', 'at', 'by']) && nonEmptyText(d.text, 2000) && isRequestTime(d.at) && d.by === uid;
      if (!shape) return no('shape', 'message shape');
      if (d.from === 'parent' && isParent) return childExists(id) ? null : no('state', 'no such child');
      if (d.from === 'child' && isChildOf(id)) return null;
      return no('role', 'a message is sent as yourself');
    }

    if (top === 'alerts' && sub === undefined) {
      if (kind === 'delete') return isParent ? null : no('role', 'only a parent deletes an alert');
      if (kind === 'update') {
        if (again) return no('state', 'the alert exists already');
        if (!isParent) return no('role', 'only a parent changes an alert');
        return onlyChanged(d, prev!, ['unread']) && d.unread === false ? null : no('shape', 'an alert can only be marked read');
      }
      const shape =
        idOk(id) &&
        exactly(d, ['kind', 'childId', 'icon', 'color', 'title', 'body', 'unread', 'at', 'by']) &&
        nonEmptyText(d.kind, 20) &&
        (d.childId === null || idOk(d.childId)) &&
        text(d.icon, 40) &&
        typeof d.color === 'string' && COLOR.test(d.color) &&
        nonEmptyText(d.title, 120) &&
        text(d.body, 240) &&
        isBool(d.unread) &&
        d.unread === true &&
        isRequestTime(d.at) &&
        d.by === uid;
      if (!shape) return no('shape', 'alert shape');
      if (isParent) return null;
      return isChild && d.childId === me.childId && ['checkin', 'sos', 'request', 'left'].includes(d.kind as string) ? null : no('role', 'a child adds alerts about itself only');
    }

    if ((top === 'places' || top === 'schedules' || top === 'sites' || top === 'tasks') && sub === undefined) {
      if (kind === 'delete') return isParent ? null : no('role', `only a parent deletes from ${top}`);
      if (top === 'tasks' && isChild && kind === 'update') {
        return onlyChanged(d, prev!, ['done']) && isBool(d.done) ? null : no('role', 'a child may only tick a task');
      }
      if (!isParent) return no('role', `only a parent writes ${top}`);
      if (!idOk(id)) return no('shape', 'bad id');
      let ok = false;
      if (top === 'places') {
        ok =
          exactly(d, ['name', 'icon', 'radius', 'arrive', 'leave', 'ord']) &&
          nonEmptyText(d.name, 60) &&
          text(d.icon, 40) &&
          isNumber(d.radius) && d.radius > 0 && d.radius <= 100000 &&
          isBool(d.arrive) &&
          isBool(d.leave) &&
          isNumber(d.ord);
      } else if (top === 'schedules') {
        ok =
          exactly(d, ['name', 'icon', 'color', 'start', 'end', 'days', 'on', 'ord']) &&
          nonEmptyText(d.name, 60) &&
          text(d.icon, 40) &&
          typeof d.color === 'string' && COLOR.test(d.color) &&
          nonEmptyText(d.start, 12) &&
          nonEmptyText(d.end, 12) &&
          isList(d.days) && d.days.length === 7 &&
          isBool(d.on) &&
          isNumber(d.ord);
      } else if (top === 'sites') {
        ok = exactly(d, ['host', 'list', 'ord']) && nonEmptyText(d.host, 253) && ['blocked', 'allowed'].includes(d.list as string) && isNumber(d.ord);
      } else {
        ok =
          exactly(d, ['title', 'points', 'done', 'ord']) &&
          nonEmptyText(d.title, 80) &&
          isInt(d.points) && d.points >= 0 && d.points <= 1000 &&
          isBool(d.done) &&
          isNumber(d.ord);
      }
      return ok ? null : no('shape', `${top} shape`);
    }

    if (top === 'signals' && sub === undefined) {
      if (kind === 'delete') return no('role', 'the SOS document is never deleted');
      const shape = id === 'sos' && exactly(d, ['active', 'childId', 'by', 'at']) && isBool(d.active) && d.by === uid && isRequestTime(d.at);
      if (!shape) return no('shape', 'sos shape');
      if (isParent) {
        if (d.active !== false) return no('role', 'a parent can only clear an SOS');
        return (prev === null ? d.childId === null : d.childId === prev.childId) ? null : no('state', 'the SOS changed hands');
      }
      if (d.childId !== me.childId) return no('role', 'a child writes its own SOS only');
      return d.active === true || prev === null || prev.active === false || prev.childId === me.childId ? null : no('state', "another child's SOS is on");
    }

    return no('role', 'no rule for this path');
  }

  const stamp = (data: Data): Data => {
    const out: Data = {};
    for (const [key, value] of Object.entries(data)) out[key] = value === SERVER_TIME ? clock : value;
    return out;
  };

  function commit(uid: string, write: WireWrite): CommitResult {
    const refuse = (kind: RefusalKind, reason: string): CommitResult => {
      const result: CommitResult = { ok: false, kind, reason, version, after: docs.get(write.path)?.data ?? null };
      log.push({ uid, write, result });
      return result;
    };
    if (!write.path.startsWith(root)) return refuse('role', 'outside the family');
    const segments = write.path.slice(root.length).split('/');
    const stored = docs.get(write.path) ?? null;
    const prev = stored ? stored.data : null;

    let next: Data | null = null;
    let kind: 'create' | 'update' | 'delete';
    if (write.op === 'delete') {
      kind = 'delete';
    } else if (write.op === 'update') {
      if (!prev) return refuse('state', 'no document to update');
      kind = 'update';
      next = { ...prev, ...(write.data ?? {}) };
    } else {
      kind = prev ? 'update' : 'create';
      next = { ...(write.data ?? {}) };
    }
    const verdict = allow(uid, kind, segments, prev, next, write.op === 'set' && prev !== null);
    if (verdict) return refuse(verdict.kind, verdict.reason);

    clock += 1;
    version += 1;
    if (kind === 'delete') {
      if (stored) deleted.add(write.path);
      docs.delete(write.path);
    } else {
      if (kind === 'create' && deleted.has(write.path)) resurrected.push({ path: write.path, uid });
      docs.set(write.path, { data: stamp(next!), version });
    }
    const result: CommitResult = { ok: true, version, after: docs.get(write.path)?.data ?? null };
    log.push({ uid, write, result });
    return result;
  }

  return {
    familyId,
    members,
    log,
    deleted,
    resurrected,
    version: () => version,
    now: () => clock,
    tick: (ms) => {
      clock += Math.max(0, Math.floor(ms));
    },
    seed: (path, data) => {
      version += 1;
      clock += 1;
      docs.set(path, { data: stamp(data), version });
    },
    get: (path) => docs.get(path)?.data ?? null,
    doc: (path) => {
      const stored = docs.get(path);
      return stored ? { id: path.slice(path.lastIndexOf('/') + 1), data: stored.data, version: stored.version } : null;
    },
    list: (collectionPath) => {
      const prefix = `${collectionPath}/`;
      const out: StoredDoc[] = [];
      for (const [path, stored] of docs) {
        if (!path.startsWith(prefix)) continue;
        const id = path.slice(prefix.length);
        if (!id.includes('/')) out.push({ id, data: stored.data, version: stored.version });
      }
      return out;
    },
    commit,
  };
}
