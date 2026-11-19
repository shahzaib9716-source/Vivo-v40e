/**
 * The mapping between the local store and Cloud Firestore (data layout v2), as one table.
 *
 * For every synced slice this file says: where its documents live, which fields are stored and what
 * firestore.rules demands of each, which local fields are worked out on the device instead, how the
 * list is ordered and bounded, and what a parent and a child device may each do to it. The sync
 * engine reads its decisions from here (see ./reconcile), so a change to firestore.rules has to be
 * made here as well. tests/sync/schema checks the field lists against the rules file.
 *
 * Pure: no firebase, no react, no react-native. It runs in plain node.
 *
 * Times. Firestore hands back a Timestamp, or null while a server timestamp is still pending. The
 * caller turns every time into milliseconds first (`normaliseTimes`, `millisOf`); `fromDoc` expects
 * a number or null. null means "not known yet: keep the time this device already has for the item".
 */
import type { Alert, ChatMessage, Child, FamilyRequest, Place, RewardTask, Schedule, SiteRule } from '@/state/store';
import { isAlert, isChatMessage, isChild, isFamilyRequest, isPlace, isRewardTask, isSchedule, isSiteRule } from '../state/persist';
import { idOk } from './ids';
import { agoLabel, clockLabel } from './labels';

// ---------------------------------------------------------------------------------------------
// Who and where
// ---------------------------------------------------------------------------------------------

export type Role = 'parent' | 'child';
export const ROLES: readonly Role[] = ['parent', 'child'];

/** Who is acting. Everything the codecs and the reconcile need to know about this device. */
export interface SyncCtx {
  familyId: string;
  /** The signed-in account. Stored in `by` / `resolvedBy`, which the rules compare with request.auth.uid. */
  uid: string;
  /** The role the server gave this account (members/{uid}.role), not the side of the app that is open. */
  role: Role;
  /** A child device: the child profile it is enrolled as (members/{uid}.childId). A parent: null. */
  childId: string | null;
  /**
   * The value to store where the rules demand `== request.time`: firebase's `serverTimestamp()`.
   * Supplied by the caller so that this file needs no firebase import. Any unique object will do in tests.
   */
  serverTimestamp: unknown;
  /** The clock, for `ord` of new items and for labels. Defaults to Date.now. */
  now?: () => number;
}

const clock = (ctx: Pick<SyncCtx, 'now'>) => (ctx.now ? ctx.now() : Date.now());

/** What `updatedAgo` says for a child without a check-in. The same word as NEVER_CHECKED_IN in the store. */
export const NO_CHECK_IN_LABEL = 'never';

// ---------------------------------------------------------------------------------------------
// Field rules: one per stored field, mirroring the checks in firestore.rules
// ---------------------------------------------------------------------------------------------

export type FieldRule =
  /** `text(v, max)` / `nonEmptyText(v, max)`: a string of at most `max` characters. */
  | { type: 'text'; max: number; nonEmpty?: boolean }
  /** `v is number` (or `is int`) with bounds. `above` is an exclusive lower bound. */
  | { type: 'number'; min?: number; max?: number; above?: number; int?: boolean }
  | { type: 'bool' }
  /** `v in [...]`. */
  | { type: 'enum'; values: readonly (string | number | boolean | null)[] }
  /** `v is list` with `size() == size` or `size() <= maxSize`. */
  | { type: 'list'; size?: number; maxSize?: number }
  /** `v.matches('^#[0-9A-Fa-f]{6}$')`. */
  | { type: 'color' }
  /** null, or a string that passes `idOk` (alerts.childId). */
  | { type: 'idOrNull' }
  /** Written by the engine, never by the user: the caller's uid, or the server's time. */
  | { type: 'uid' }
  | { type: 'time' };

export interface FieldSpec {
  rule: FieldRule;
  /** The key may be absent from the document. */
  optional?: boolean;
  /** Only an update may carry it (requests.resolvedBy / resolvedAt): a create must not. */
  updateOnly?: boolean;
}

const text = (max: number): FieldSpec => ({ rule: { type: 'text', max } });
const nonEmptyText = (max: number): FieldSpec => ({ rule: { type: 'text', max, nonEmpty: true } });
const bool: FieldSpec = { rule: { type: 'bool' } };
const color: FieldSpec = { rule: { type: 'color' } };
const num = (min?: number, max?: number): FieldSpec => ({ rule: { type: 'number', min, max } });
const ord: FieldSpec = { rule: { type: 'number' } };
const time: FieldSpec = { rule: { type: 'time' } };
const uid: FieldSpec = { rule: { type: 'uid' } };
const oneOf = (...values: (string | number | boolean | null)[]): FieldSpec => ({ rule: { type: 'enum', values } });

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
/** The rules count characters, not UTF-16 units. */
const charCount = (s: string) => Array.from(s).length;

/** Why `value` breaks `rule`, or null when it is fine. Engine-written fields are checked against the ctx. */
export function fieldProblem(rule: FieldRule, value: unknown, ctx?: Pick<SyncCtx, 'uid' | 'serverTimestamp'>): string | null {
  switch (rule.type) {
    case 'text':
      if (typeof value !== 'string') return 'is not text';
      if (rule.nonEmpty && value.length === 0) return 'is empty';
      return charCount(value) <= rule.max ? null : `is longer than ${rule.max} characters`;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'is not a number';
      if (rule.int && !Number.isInteger(value)) return 'is not a whole number';
      if (rule.min !== undefined && value < rule.min) return `is below ${rule.min}`;
      if (rule.above !== undefined && !(value > rule.above)) return `is not above ${rule.above}`;
      if (rule.max !== undefined && value > rule.max) return `is above ${rule.max}`;
      return null;
    case 'bool':
      return typeof value === 'boolean' ? null : 'is not true or false';
    case 'enum':
      return rule.values.includes(value as never) ? null : 'is not one of the allowed values';
    case 'list':
      if (!Array.isArray(value)) return 'is not a list';
      if (rule.size !== undefined && value.length !== rule.size) return `does not have ${rule.size} entries`;
      if (rule.maxSize !== undefined && value.length > rule.maxSize) return `has more than ${rule.maxSize} entries`;
      return null;
    case 'color':
      return typeof value === 'string' && HEX_COLOR.test(value) ? null : 'is not a #RRGGBB colour';
    case 'idOrNull':
      return value === null || idOk(value) ? null : 'is not an id';
    case 'uid':
      if (typeof value !== 'string' || value.length === 0) return 'is not an account id';
      return !ctx || value === ctx.uid ? null : 'is not this account';
    case 'time':
      return !ctx || value === ctx.serverTimestamp ? null : 'is not the server time';
  }
}

// ---------------------------------------------------------------------------------------------
// What each role may do
// ---------------------------------------------------------------------------------------------

export interface CreateRule {
  /**
   * The item has to be about the child this device is enrolled as: for requests and messages the
   * child whose sub-collection it goes into, for alerts the `childId` field.
   */
  own?: boolean;
  /**
   * What the item has to say already, or it is not this role's to add: a message's `from`. An item
   * that says otherwise is dropped.
   */
  must?: Readonly<Record<string, unknown>>;
  /**
   * Values the rules fix at creation whatever the item says: `status: 'pending'`, `unread: true`.
   * The document is created with them. Where the local item says otherwise, that difference is
   * then judged like any other change to an existing item (sent if the role may, put back if not).
   */
  fixed?: Readonly<Record<string, unknown>>;
  /** Fields the rules restrict to a list at creation, narrower than the field's own rule. */
  oneOf?: Readonly<Record<string, readonly unknown[]>>;
}

export interface UpdateRule {
  /** The item fields this role may change. Any other local change is put back. */
  fields: readonly string[];
  /** The only values a changed field may take, for example `unread: [false]`. */
  oneOf?: Readonly<Record<string, readonly unknown[]>>;
  /** What the stored document must say for an update to be accepted, for example `status: 'pending'`. */
  when?: Readonly<Record<string, unknown>>;
  /** Fields the update writes besides the changed ones: the caller's uid or the server's time. */
  stamps?: Readonly<Record<string, 'uid' | 'time'>>;
}

export interface Access {
  /** `all`: every document of the family. `own`: only those of the child it is enrolled as. `none`: cannot read. */
  read: 'all' | 'own' | 'none';
  create: CreateRule | false;
  update: UpdateRule | false;
  delete: boolean;
}

const NO_WRITES = { create: false, update: false, delete: false } as const;

/** How a role listens to a slice (SPEC 4.2 rule 8). */
export type ListenMode =
  /** One listener on the whole collection. */
  | 'collection'
  /** A parent: one listener per child, on that child's sub-collection. */
  | 'per-child'
  /** A child: one listener on its own child's sub-collection. */
  | 'own-child'
  /** A child: one listener on its own children/{cid} document. */
  | 'own-doc'
  /** Never listens: the slice is write-only for this role (a child and the alerts). */
  | 'none';

// ---------------------------------------------------------------------------------------------
// List slices
// ---------------------------------------------------------------------------------------------

export interface SliceItems {
  children: Child;
  requests: FamilyRequest;
  messages: ChatMessage;
  alerts: Alert;
  places: Place;
  schedules: Schedule;
  sites: SiteRule;
  tasks: RewardTask;
}
export type ListSlice = keyof SliceItems;
export const LIST_SLICES: readonly ListSlice[] = ['children', 'requests', 'messages', 'alerts', 'places', 'schedules', 'sites', 'tasks'];

export type DocData = Record<string, unknown>;

export interface ListSpec<K extends ListSlice = ListSlice> {
  slice: K;
  /** `family`: families/{fid}/<collection>. `child`: families/{fid}/children/{childId}/<collection>. */
  scope: 'family' | 'child';
  collection: string;
  /** The collection a listener is attached to. `childId` is needed when `scope` is `child`. */
  collectionPath(familyId: string, childId?: string): string;
  /** The document of one item. `childId` is needed when `scope` is `child`. */
  docPath(familyId: string, id: string, childId?: string): string;
  /** Every field of the stored document and what firestore.rules demands of it. Nothing else may be stored. */
  doc: Readonly<Record<string, FieldSpec>>;
  /**
   * The item fields that are stored under the same name and that a person can change. These, and
   * only these, are compared field by field between the local, base and remote copies.
   */
  fields: readonly string[];
  /** Item fields that are not stored, and where the device gets them from. */
  derived: Readonly<Record<string, string>>;
  /** The order of the local list. */
  order: { by: 'ord' | 'at'; dir: 'asc' | 'desc' };
  /** The listener's query: `orderBy(by, dir)` and, when bounded, `limit(n)` (the newest n). */
  query: { orderBy: 'ord' | 'at'; dir: 'asc' | 'desc'; limit: number | null };
  listen: Readonly<Record<Role, ListenMode>>;
  access: Readonly<Record<Role, Access>>;
  /** True when `v` is a complete, well-formed local item of this slice. */
  isItem(v: unknown): v is SliceItems[K];
  /**
   * The document this device creates for a local item: the stored fields, `by` = the caller, the
   * server-time sentinel where the rules want the server's time, and `ord` for the ordered slices
   * (`opts.ord`, or the clock). Display labels and derived fields are left out.
   */
  toDoc(item: SliceItems[K], ctx: SyncCtx, opts?: { ord?: number }): DocData;
  /**
   * The local item for a stored document, or null when the document cannot be used (a field is
   * missing or has the wrong type). `data` must have its times in milliseconds or null, see
   * `normaliseTimes`. `at` is left out of the item when the stored time is null (still pending):
   * the reconcile then keeps the local time. `childId` is the child whose sub-collection the
   * document came from, for the slices with `scope: 'child'`.
   */
  fromDoc(id: string, data: DocData, ctx: SyncCtx, childId?: string): SliceItems[K] | null;
  /** The fields an update writes for a change to item fields: the changed fields plus the role's stamps. */
  updateFields(patch: Readonly<Record<string, unknown>>, ctx: SyncCtx): DocData;
}

const familyPath = (familyId: string) => `families/${familyId}`;

function familyCollection(collection: string) {
  return {
    scope: 'family' as const,
    collection,
    collectionPath: (familyId: string) => `${familyPath(familyId)}/${collection}`,
    docPath: (familyId: string, id: string) => `${familyPath(familyId)}/${collection}/${id}`,
  };
}

function childCollection(collection: string) {
  const need = (childId: string | undefined) => {
    if (!childId) throw new Error(`${collection}: a child id is needed for the path`);
    return childId;
  };
  return {
    scope: 'child' as const,
    collection,
    collectionPath: (familyId: string, childId?: string) => `${familyPath(familyId)}/children/${need(childId)}/${collection}`,
    docPath: (familyId: string, id: string, childId?: string) => `${familyPath(familyId)}/children/${need(childId)}/${collection}/${id}`,
  };
}

/** Copies the named keys, leaving out the ones that are undefined. */
function pick(source: Readonly<Record<string, unknown>>, keys: readonly string[]): DocData {
  const out: DocData = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

function stamped(patch: Readonly<Record<string, unknown>>, rule: UpdateRule | false, ctx: SyncCtx): DocData {
  const out: DocData = { ...patch };
  if (rule && rule.stamps) {
    for (const [key, what] of Object.entries(rule.stamps)) out[key] = what === 'uid' ? ctx.uid : ctx.serverTimestamp;
  }
  return out;
}

const parentOwned = (fields: readonly string[]): Record<Role, Access> => ({
  parent: { read: 'all', create: {}, update: { fields }, delete: true },
  child: { read: 'all', ...NO_WRITES },
});

// ---- children/{cid} --------------------------------------------------------------------------
// rules: get parent or the child itself, list parent, create/update parent with childShapeOk, delete nobody.

const CHILD_FIELDS = ['name', 'age', 'deviceName', 'battery', 'online', 'bedtime', 'usedMin', 'limitMin', 'place', 'placeIcon', 'apps', 'weekly'] as const;

const children: ListSpec<'children'> = {
  slice: 'children',
  ...familyCollection('children'),
  doc: {
    name: nonEmptyText(60),
    age: num(0, 25),
    deviceName: text(60),
    battery: num(0, 100),
    online: bool,
    bedtime: bool,
    usedMin: num(0, 1440),
    limitMin: num(0, 1440),
    place: text(60),
    placeIcon: text(40),
    apps: { rule: { type: 'list', maxSize: 60 } },
    weekly: { rule: { type: 'list', size: 7 } },
    ord,
  },
  fields: CHILD_FIELDS,
  derived: {
    id: 'the document id',
    checkInAt: 'children/{cid}/live/status.checkInAt (see STATUS)',
    updatedAgo: `a label: drawn from checkInAt; '${NO_CHECK_IN_LABEL}' when there is no check-in`,
  },
  order: { by: 'ord', dir: 'asc' },
  query: { orderBy: 'ord', dir: 'asc', limit: null },
  listen: { parent: 'collection', child: 'own-doc' },
  access: {
    parent: { read: 'all', create: {}, update: { fields: CHILD_FIELDS }, delete: false },
    child: { read: 'own', ...NO_WRITES },
  },
  isItem: isChild,
  toDoc: (item, ctx, opts) => ({ ...pick(item as unknown as DocData, CHILD_FIELDS), ord: opts?.ord ?? clock(ctx) }),
  fromDoc: (id, data) => {
    const item = { ...pick(data, CHILD_FIELDS), id, updatedAgo: NO_CHECK_IN_LABEL };
    return isChild(item) ? item : null;
  },
  updateFields: (patch) => ({ ...patch }),
};

// ---- children/{cid}/requests/{rid} -----------------------------------------------------------
// rules: read parent or the child itself; create the child itself, pending; update a parent, once,
// pending -> approved/denied with resolvedBy/resolvedAt; delete a parent.

const REQUEST_FIELDS = ['kind', 'label', 'detail', 'minutes', 'appId', 'status'] as const;

const requests: ListSpec<'requests'> = {
  slice: 'requests',
  ...childCollection('requests'),
  doc: {
    kind: oneOf('extra_time', 'unlock_app', 'install_app', 'bedtime'),
    label: nonEmptyText(80),
    detail: text(200),
    minutes: { rule: { type: 'number', int: true, above: 0, max: 240 }, optional: true },
    appId: { rule: { type: 'text', max: 40, nonEmpty: true }, optional: true },
    status: oneOf('pending', 'approved', 'denied'),
    at: time,
    by: uid,
    resolvedBy: { rule: { type: 'uid' }, optional: true, updateOnly: true },
    resolvedAt: { rule: { type: 'time' }, optional: true, updateOnly: true },
  },
  fields: REQUEST_FIELDS,
  derived: { id: 'the document id', childId: 'the {cid} of the path', ago: 'a label: drawn from at' },
  order: { by: 'at', dir: 'desc' },
  query: { orderBy: 'at', dir: 'desc', limit: 100 },
  listen: { parent: 'per-child', child: 'own-child' },
  access: {
    parent: {
      read: 'all',
      create: false,
      update: {
        fields: ['status'],
        oneOf: { status: ['approved', 'denied'] },
        when: { status: 'pending' },
        stamps: { resolvedBy: 'uid', resolvedAt: 'time' },
      },
      delete: true,
    },
    child: { read: 'own', create: { own: true, fixed: { status: 'pending' } }, update: false, delete: false },
  },
  isItem: isFamilyRequest,
  toDoc: (item, ctx) => ({ ...pick(item as unknown as DocData, REQUEST_FIELDS), at: ctx.serverTimestamp, by: ctx.uid }),
  fromDoc: (id, data, ctx, childId) => {
    const at = millisOf(data.at);
    const item = { ...pick(data, REQUEST_FIELDS), id, childId, ago: agoLabel(at ?? clock(ctx), clock(ctx)), ...(at != null ? { at } : {}) };
    return isFamilyRequest(item) ? item : null;
  },
  updateFields: (patch, ctx) => stamped(patch, requests.access[ctx.role].update, ctx),
};

// ---- children/{cid}/messages/{mid} -----------------------------------------------------------
// rules: read parent or the child itself; create as yourself (from == your side); never updated or deleted.

const MESSAGE_FIELDS = ['from', 'text'] as const;

const messages: ListSpec<'messages'> = {
  slice: 'messages',
  ...childCollection('messages'),
  doc: {
    from: oneOf('parent', 'child'),
    text: nonEmptyText(2000),
    at: time,
    by: uid,
  },
  fields: MESSAGE_FIELDS,
  derived: { id: 'the document id', childId: 'the {cid} of the path', time: 'a label: the clock time of at' },
  order: { by: 'at', dir: 'asc' },
  // The newest 300; the local list shows them oldest first.
  query: { orderBy: 'at', dir: 'desc', limit: 300 },
  listen: { parent: 'per-child', child: 'own-child' },
  access: {
    parent: { read: 'all', create: { must: { from: 'parent' } }, update: false, delete: false },
    child: { read: 'own', create: { own: true, must: { from: 'child' } }, update: false, delete: false },
  },
  isItem: isChatMessage,
  toDoc: (item, ctx) => ({ ...pick(item as unknown as DocData, MESSAGE_FIELDS), at: ctx.serverTimestamp, by: ctx.uid }),
  fromDoc: (id, data, ctx, childId) => {
    const at = millisOf(data.at);
    const item = { ...pick(data, MESSAGE_FIELDS), id, childId, time: clockLabel(at ?? clock(ctx)), ...(at != null ? { at } : {}) };
    return isChatMessage(item) ? item : null;
  },
  updateFields: (patch) => ({ ...patch }),
};

// ---- alerts/{aid} ----------------------------------------------------------------------------
// rules: read parent; create anyone in the family, unread, a child only about itself and only the
// kinds below; update a parent, unread -> false only; delete a parent.

const ALERT_FIELDS = ['kind', 'childId', 'icon', 'color', 'title', 'body', 'unread'] as const;
/** The kinds a child device may add (firestore.rules, alerts create). */
export const CHILD_ALERT_KINDS = ['checkin', 'sos', 'request', 'left'] as const;
/** The kind stored for an alert that has none locally (older items). */
export const DEFAULT_ALERT_KIND = 'info';

const alerts: ListSpec<'alerts'> = {
  slice: 'alerts',
  ...familyCollection('alerts'),
  doc: {
    kind: nonEmptyText(20),
    childId: { rule: { type: 'idOrNull' } },
    icon: text(40),
    color,
    title: nonEmptyText(120),
    body: text(240),
    unread: bool,
    at: time,
    by: uid,
  },
  fields: ALERT_FIELDS,
  derived: { id: 'the document id', ago: 'a label: drawn from at' },
  order: { by: 'at', dir: 'desc' },
  query: { orderBy: 'at', dir: 'desc', limit: 200 },
  listen: { parent: 'collection', child: 'none' },
  access: {
    parent: { read: 'all', create: { fixed: { unread: true } }, update: { fields: ['unread'], oneOf: { unread: [false] } }, delete: true },
    child: { read: 'none', create: { own: true, fixed: { unread: true }, oneOf: { kind: CHILD_ALERT_KINDS } }, update: false, delete: false },
  },
  isItem: isAlert,
  toDoc: (item, ctx) => ({
    ...pick(item as unknown as DocData, ALERT_FIELDS),
    kind: item.kind ?? DEFAULT_ALERT_KIND,
    childId: item.childId ?? null,
    at: ctx.serverTimestamp,
    by: ctx.uid,
  }),
  fromDoc: (id, data, ctx) => {
    const at = millisOf(data.at);
    const item = { ...pick(data, ALERT_FIELDS), id, ago: agoLabel(at ?? clock(ctx), clock(ctx), true), ...(at != null ? { at } : {}) };
    return isAlert(item) && typeof item.kind === 'string' && item.childId !== undefined ? item : null;
  },
  updateFields: (patch) => ({ ...patch }),
};

// ---- places, schedules, sites: parent-owned family rules -------------------------------------
// rules: read any member; create/update a parent with the exact shape; delete a parent.

const PLACE_FIELDS = ['name', 'icon', 'radius', 'arrive', 'leave'] as const;

const places: ListSpec<'places'> = {
  slice: 'places',
  ...familyCollection('places'),
  doc: {
    name: nonEmptyText(60),
    icon: text(40),
    radius: { rule: { type: 'number', above: 0, max: 100000 } },
    arrive: bool,
    leave: bool,
    ord,
  },
  fields: PLACE_FIELDS,
  derived: { id: 'the document id' },
  order: { by: 'ord', dir: 'asc' },
  query: { orderBy: 'ord', dir: 'asc', limit: null },
  listen: { parent: 'collection', child: 'collection' },
  access: parentOwned(PLACE_FIELDS),
  isItem: isPlace,
  toDoc: (item, ctx, opts) => ({ ...pick(item as unknown as DocData, PLACE_FIELDS), ord: opts?.ord ?? clock(ctx) }),
  fromDoc: (id, data) => {
    const item = { ...pick(data, PLACE_FIELDS), id };
    return isPlace(item) ? item : null;
  },
  updateFields: (patch) => ({ ...patch }),
};

const SCHEDULE_FIELDS = ['name', 'icon', 'color', 'start', 'end', 'days', 'on'] as const;

const schedules: ListSpec<'schedules'> = {
  slice: 'schedules',
  ...familyCollection('schedules'),
  doc: {
    name: nonEmptyText(60),
    icon: text(40),
    color,
    start: nonEmptyText(12),
    end: nonEmptyText(12),
    days: { rule: { type: 'list', size: 7 } },
    on: bool,
    ord,
  },
  fields: SCHEDULE_FIELDS,
  derived: { id: 'the document id' },
  order: { by: 'ord', dir: 'asc' },
  query: { orderBy: 'ord', dir: 'asc', limit: null },
  listen: { parent: 'collection', child: 'collection' },
  access: parentOwned(SCHEDULE_FIELDS),
  isItem: isSchedule,
  toDoc: (item, ctx, opts) => ({ ...pick(item as unknown as DocData, SCHEDULE_FIELDS), ord: opts?.ord ?? clock(ctx) }),
  fromDoc: (id, data) => {
    const item = { ...pick(data, SCHEDULE_FIELDS), id };
    return isSchedule(item) ? item : null;
  },
  updateFields: (patch) => ({ ...patch }),
};

const SITE_FIELDS = ['host', 'list'] as const;

const sites: ListSpec<'sites'> = {
  slice: 'sites',
  ...familyCollection('sites'),
  doc: {
    host: nonEmptyText(253),
    list: oneOf('blocked', 'allowed'),
    ord,
  },
  fields: SITE_FIELDS,
  derived: { id: 'the document id' },
  order: { by: 'ord', dir: 'asc' },
  query: { orderBy: 'ord', dir: 'asc', limit: null },
  listen: { parent: 'collection', child: 'collection' },
  access: parentOwned(SITE_FIELDS),
  isItem: isSiteRule,
  toDoc: (item, ctx, opts) => ({ ...pick(item as unknown as DocData, SITE_FIELDS), ord: opts?.ord ?? clock(ctx) }),
  fromDoc: (id, data) => {
    const item = { ...pick(data, SITE_FIELDS), id };
    return isSiteRule(item) ? item : null;
  },
  updateFields: (patch) => ({ ...patch }),
};

// ---- tasks/{id} ------------------------------------------------------------------------------
// rules: read any member; create/update a parent with the exact shape; a child may change `done`
// and nothing else; delete a parent.

const TASK_FIELDS = ['title', 'points', 'done'] as const;

const tasks: ListSpec<'tasks'> = {
  slice: 'tasks',
  ...familyCollection('tasks'),
  doc: {
    title: nonEmptyText(80),
    points: { rule: { type: 'number', int: true, min: 0, max: 1000 } },
    done: bool,
    ord,
  },
  fields: TASK_FIELDS,
  derived: { id: 'the document id' },
  order: { by: 'ord', dir: 'asc' },
  query: { orderBy: 'ord', dir: 'asc', limit: null },
  listen: { parent: 'collection', child: 'collection' },
  access: {
    parent: { read: 'all', create: {}, update: { fields: TASK_FIELDS }, delete: true },
    child: { read: 'all', create: false, update: { fields: ['done'] }, delete: false },
  },
  isItem: isRewardTask,
  toDoc: (item, ctx, opts) => ({ ...pick(item as unknown as DocData, TASK_FIELDS), ord: opts?.ord ?? clock(ctx) }),
  fromDoc: (id, data) => {
    const item = { ...pick(data, TASK_FIELDS), id };
    return isRewardTask(item) ? item : null;
  },
  updateFields: (patch) => ({ ...patch }),
};

/** The table. One entry per list slice of the store. */
export const SCHEMA: { readonly [K in ListSlice]: ListSpec<K> } = { children, requests, messages, alerts, places, schedules, sites, tasks };

// ---------------------------------------------------------------------------------------------
// Single documents
// ---------------------------------------------------------------------------------------------

/** signals/sos as this device knows it. `at` is the server's time of the last change, null while one of ours is pending. */
export interface SosDoc {
  active: boolean;
  childId: string | null;
  at: number | null;
}

/** The two store values the SOS document maps to. `sosChildId` is null whenever no SOS is on. */
export interface SosLocal {
  sosActive: boolean;
  sosChildId: string | null;
}

/**
 * families/{fid}/signals/sos { active, childId, by, at }
 *
 * rules: read any member; never deleted. A write always carries all four fields, `by` = the caller
 * and `at` = the server's time, and then:
 * - a parent may only write `active: false`, keeping `childId` as stored (null when there is no document);
 * - a child must write its own `childId`, and may write `active: true` at any time, or `active: false`
 *   when there is no document, when the stored SOS is off, or when the stored SOS is its own.
 */
export const SOS = {
  slice: 'sos' as const,
  path: (familyId: string) => `${familyPath(familyId)}/signals/sos`,
  doc: { active: bool, childId: { rule: { type: 'idOrNull' } }, by: uid, at: time } as Readonly<Record<string, FieldSpec>>,
  listen: { parent: 'doc', child: 'doc' } as const,
  access: {
    parent: { read: true, raise: false, clear: 'any' },
    child: { read: true, raise: 'own', clear: 'own' },
  } as const,
  toDoc: (value: { active: boolean; childId: string | null }, ctx: SyncCtx): DocData => ({
    active: value.active,
    childId: value.childId,
    by: ctx.uid,
    at: ctx.serverTimestamp,
  }),
  /** `data`: the document's fields with times in milliseconds or null; null or undefined when there is no document. */
  fromDoc: (data: DocData | null | undefined): SosDoc | null => {
    if (!data || typeof data.active !== 'boolean') return null;
    return { active: data.active, childId: typeof data.childId === 'string' ? data.childId : null, at: millisOf(data.at) };
  },
  toLocal: (doc: SosDoc | null): SosLocal => (doc && doc.active ? { sosActive: true, sosChildId: doc.childId } : { sosActive: false, sosChildId: null }),
};

/** children/{cid}/live/status as this device knows it. `checkInAt` is null while a check-in of ours is pending. */
export interface StatusDoc {
  checkInAt: number | null;
}

/**
 * families/{fid}/children/{cid}/live/status { checkInAt, by }
 *
 * rules: read a parent or the child itself; written only by the device enrolled as that child, always
 * both fields, `checkInAt` = the server's time and `by` = the caller; never deleted.
 * Locally it is `Child.checkInAt` (and the `updatedAgo` label drawn from it).
 */
export const STATUS = {
  slice: 'status' as const,
  path: (familyId: string, childId: string) => `${familyPath(familyId)}/children/${childId}/live/status`,
  doc: { checkInAt: time, by: uid } as Readonly<Record<string, FieldSpec>>,
  listen: { parent: 'per-child', child: 'own-doc' } as const,
  access: {
    parent: { read: 'all', write: false },
    child: { read: 'own', write: 'own' },
  } as const,
  toDoc: (ctx: SyncCtx): DocData => ({ checkInAt: ctx.serverTimestamp, by: ctx.uid }),
  /** `data`: the document's fields with times in milliseconds or null; null or undefined when there is no document. */
  fromDoc: (data: DocData | null | undefined): StatusDoc | null => (data ? { checkInAt: millisOf(data.checkInAt) } : null),
};

// ---------------------------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------------------------

/** The document fields that hold a server time. */
export const TIME_FIELDS: readonly string[] = ['at', 'resolvedAt', 'checkInAt'];

/**
 * Milliseconds for whatever Firestore returned: a Timestamp (anything with `toMillis()`), a
 * `{ seconds, nanoseconds }` pair, a Date, or a number. null for null, undefined and anything else,
 * which is what a server timestamp reads as while it is pending.
 */
export function millisOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null || typeof value !== 'object') return null;
  const v = value as { toMillis?: () => number; seconds?: unknown; nanoseconds?: unknown; getTime?: () => number };
  if (typeof v.toMillis === 'function') {
    const ms = v.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v.seconds === 'number') return v.seconds * 1000 + (typeof v.nanoseconds === 'number' ? Math.floor(v.nanoseconds / 1e6) : 0);
  if (typeof v.getTime === 'function') {
    const ms = v.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** A copy of a document's data with every time field in milliseconds, or null while pending. */
export function normaliseTimes(data: DocData): DocData {
  const out: DocData = { ...data };
  for (const key of TIME_FIELDS) if (key in out) out[key] = millisOf(out[key]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Checks the engine runs before it writes
// ---------------------------------------------------------------------------------------------

/**
 * Everything firestore.rules would object to in a document this device is about to store: a bad
 * id, a field the rules do not list, a missing field, a value out of range. Empty when it is fine.
 * `op` says whether the document is being created or is the result of an update.
 */
export function docProblems(spec: { doc: Readonly<Record<string, FieldSpec>> }, id: string, data: DocData, op: 'create' | 'update', ctx?: Pick<SyncCtx, 'uid' | 'serverTimestamp'>): string[] {
  const problems: string[] = [];
  if (!idOk(id)) problems.push('the id is not a valid document id');
  for (const key of Object.keys(data)) {
    const field = spec.doc[key];
    if (!field) problems.push(`${key} is not a stored field`);
    else if (field.updateOnly && op === 'create') problems.push(`${key} cannot be set when creating`);
  }
  for (const [key, field] of Object.entries(spec.doc)) {
    const value = data[key];
    if (value === undefined) {
      if (!field.optional) problems.push(`${key} is missing`);
      continue;
    }
    const problem = fieldProblem(field.rule, value, ctx);
    if (problem) problems.push(`${key} ${problem}`);
  }
  return problems;
}

/**
 * Why this role may not create `item`, or null when it may. Shape problems are `docProblems`'
 * business, and the values a create fixes (`CreateRule.fixed`) are put in place by the reconcile.
 */
export function createProblem<K extends ListSlice>(spec: ListSpec<K>, item: SliceItems[K], ctx: SyncCtx): string | null {
  const rule = spec.access[ctx.role].create;
  if (!rule) return `a ${ctx.role} cannot add to ${spec.slice}`;
  const fields = item as unknown as Record<string, unknown>;
  if (rule.own) {
    if (ctx.childId == null) return 'this device is not enrolled as a child';
    const about = fields.childId ?? null;
    if (about !== ctx.childId) return 'a child device can only add items about itself';
  }
  for (const [key, value] of Object.entries(rule.must ?? {})) {
    if (fields[key] !== value) return `${key} must be ${String(value)}`;
  }
  for (const [key, allowed] of Object.entries(rule.oneOf ?? {})) {
    if (!allowed.includes(fields[key])) return `${key} is not one a ${ctx.role} may use`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The listeners a device runs (SPEC 4.2 rules 7 and 8)
// ---------------------------------------------------------------------------------------------

export interface ListenerPlan {
  /** Unique per listener: `places`, `requests:<childId>`, `status:<childId>`, `sos`. */
  key: string;
  slice: ListSlice | 'sos' | 'status';
  /** `collection`: a query on `path`. `doc`: the single document at `path`. */
  kind: 'collection' | 'doc';
  path: string;
  /** For the slices under a child, and for `status`: which child. */
  childId?: string;
  /** For a collection: `orderBy(orderBy, dir)` then `limit(limit)` when it is not null. Single-field index only. */
  orderBy?: 'ord' | 'at';
  dir?: 'asc' | 'desc';
  limit?: number | null;
}

/**
 * The listeners for the synced data of a device. `childIds` is the family's children as known so
 * far (a parent passes them all; a child device is only ever given its own). Members and devices
 * are listened to as well, but they are not store slices and are not listed here.
 * A child gets no alerts listener: it may add alerts and cannot read them.
 */
export function listenersFor(ctx: Pick<SyncCtx, 'familyId' | 'role' | 'childId'>, childIds: readonly string[]): ListenerPlan[] {
  const plans: ListenerPlan[] = [];
  const mine = ctx.role === 'child' ? (ctx.childId ? [ctx.childId] : []) : [...childIds];
  for (const slice of LIST_SLICES) {
    const spec: ListSpec = SCHEMA[slice];
    const mode = spec.listen[ctx.role];
    const query = { orderBy: spec.query.orderBy, dir: spec.query.dir, limit: spec.query.limit };
    if (mode === 'collection') {
      plans.push({ key: slice, slice, kind: 'collection', path: spec.collectionPath(ctx.familyId), ...query });
    } else if (mode === 'own-doc') {
      for (const childId of mine) plans.push({ key: slice, slice, kind: 'doc', path: spec.docPath(ctx.familyId, childId), childId });
    } else if (mode === 'per-child' || mode === 'own-child') {
      for (const childId of mine) {
        plans.push({ key: `${slice}:${childId}`, slice, kind: 'collection', path: spec.collectionPath(ctx.familyId, childId), childId, ...query });
      }
    }
  }
  for (const childId of mine) plans.push({ key: `status:${childId}`, slice: 'status', kind: 'doc', path: STATUS.path(ctx.familyId, childId), childId });
  plans.push({ key: 'sos', slice: 'sos', kind: 'doc', path: SOS.path(ctx.familyId) });
  return plans;
}

