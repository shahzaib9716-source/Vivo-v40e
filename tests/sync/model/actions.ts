/**
 * What a person can do on a phone, written as plain functions over the store's slices. They follow
 * src/state/store.tsx action by action (the store itself needs React, so it cannot be loaded here).
 *
 * Besides everything the app's screens can do, there are actions the role is not allowed to make
 * stick: a child changing its own limit, a parent raising an SOS from the preview of the child app,
 * values the server would refuse. They change the local state just the same, as a bug or a preview
 * mode would. The engine has to put them back and send nothing.
 */
import type { Alert, ChatMessage, Child, FamilyRequest, Place, RewardTask, Schedule, SiteRule } from '@/state/store';
import { newId } from '@/sync/ids';
import { SCHEMA, type ListSlice, type SyncCtx } from '@/sync/schema';
import type { LocalState } from './device';
import type { Rng } from './prng';

/** An item a person added and the engine is allowed to store. */
export interface Added {
  slice: ListSlice;
  id: string;
  path: string;
}

export interface Outcome {
  name: string;
  next: LocalState;
  /** The most document writes this action may cost. 0 for an action that has to be put back. */
  maxWrites: number;
  added?: Added[];
  /** Server paths of items a person removed and was allowed to. */
  removed?: string[];
  /**
   * Server paths of items a person removed without being allowed to, or gave a value the server
   * would refuse. The engine puts such an item back to what the server has. If it had never been
   * sent there is nothing to go back to: removing it cancels it, and an unsendable value means it
   * is dropped (and reported).
   */
  cancelled?: string[];
  /** The request this tap answered. The store lets a phone answer a request once per session. */
  answered?: string;
}

export interface Actor {
  local: LocalState;
  ctx: SyncCtx;
  now(): number;
  rng: Rng;
  /** Requests this phone has answered since it last started (the store's `resolvedIds`). */
  answered: ReadonlySet<string>;
}

type Action = (a: Actor) => Outcome | null;

const id = (a: Actor, prefix: string) => newId(prefix, a.now(), a.rng.next);
const pathOf = (a: Actor, slice: ListSlice, itemId: string, childId?: string) => SCHEMA[slice].docPath(a.ctx.familyId, itemId, childId);
const swap = <T extends { id: string }>(list: readonly T[], itemId: string, fn: (item: T) => T): T[] => list.map((item) => (item.id === itemId ? fn(item) : item));
const some = <T>(a: Actor, list: readonly T[]): T | null => (list.length === 0 ? null : a.rng.pick(list));
/** The child the child app is about on this device: its own, or the first one on a parent's phone. */
const self = (a: Actor): Child | null => (a.ctx.childId ? a.local.children.find((c) => c.id === a.ctx.childId) : a.local.children[0]) ?? null;

const withChild = (a: Actor, childId: string, fn: (c: Child) => Child): LocalState => ({ ...a.local, children: swap(a.local.children, childId, fn) });

function alertFor(a: Actor, me: Child, kind: 'checkin' | 'sos', at: number): Alert {
  return kind === 'checkin'
    ? { id: id(a, 'n'), kind, childId: me.id, icon: 'map-pin', color: '#2E8BFF', title: `${me.name} checked in`, body: 'At 3:42 PM', ago: 'now', at, unread: true }
    : { id: id(a, 'n'), kind, childId: me.id, icon: 'alert-circle', color: '#FB4A4A', title: `SOS from ${me.name}`, body: 'Sent at 3:42 PM', ago: 'now', at, unread: true };
}

// ---- What a parent's screens do --------------------------------------------------------------

const adjustLimit: Action = (a) => {
  const c = some(a, a.local.children);
  if (!c) return null;
  const limitMin = Math.max(0, c.limitMin + a.rng.pick([-30, -15, 15, 30]));
  return { name: 'p.adjustLimit', next: withChild(a, c.id, (x) => ({ ...x, limitMin })), maxWrites: limitMin !== c.limitMin && limitMin <= 1440 ? 1 : 0 };
};

const toggleApp: Action = (a) => {
  const c = some(a, a.local.children);
  const app = c ? some(a, c.apps) : null;
  if (!c || !app) return null;
  return { name: 'p.toggleApp', next: withChild(a, c.id, (x) => ({ ...x, apps: swap(x.apps, app.id, (y) => ({ ...y, blocked: !y.blocked })) })), maxWrites: 1 };
};

const setAppLimit: Action = (a) => {
  const c = some(a, a.local.children);
  const app = c ? some(a, c.apps) : null;
  if (!c || !app) return null;
  const limitMin = a.rng.pick([30, 60, 90, 120, null]);
  return { name: 'p.setAppLimit', next: withChild(a, c.id, (x) => ({ ...x, apps: swap(x.apps, app.id, (y) => ({ ...y, limitMin })) })), maxWrites: limitMin === app.limitMin ? 0 : 1 };
};

const pauseResume: Action = (a) => {
  const c = some(a, a.local.children);
  if (!c) return null;
  return { name: 'p.pause', next: withChild(a, c.id, (x) => ({ ...x, bedtime: !x.bedtime })), maxWrites: 1 };
};

const renameChild: Action = (a) => {
  const c = some(a, a.local.children);
  if (!c) return null;
  const name = `Kid ${a.rng.int(1000)}`;
  return { name: 'p.rename', next: withChild(a, c.id, (x) => ({ ...x, name })), maxWrites: name === c.name ? 0 : 1 };
};

const addChild: Action = (a) => {
  if (a.local.children.length >= 3) return null;
  const template = a.local.children[0];
  const newChild: Child = {
    id: id(a, 'c'),
    name: `New ${a.rng.int(1000)}`,
    age: 9,
    deviceName: '',
    battery: 72,
    online: true,
    bedtime: false,
    usedMin: 168,
    limitMin: 240,
    place: 'School',
    placeIcon: 'school',
    updatedAgo: 'never',
    apps: template ? template.apps.map((x) => ({ ...x })) : [],
    weekly: [180, 210, 160, 240, 168, 95, 120],
  };
  return { name: 'p.addChild', next: { ...a.local, children: [...a.local.children, newChild] }, maxWrites: 1, added: [{ slice: 'children', id: newChild.id, path: pathOf(a, 'children', newChild.id) }] };
};

const resolveRequest: Action = (a) => {
  const r = some(a, a.local.requests.filter((x) => x.status === 'pending' && !a.answered.has(x.id)));
  if (!r) return null;
  const approve = a.rng.chance(0.6);
  let next: LocalState = { ...a.local, requests: swap(a.local.requests, r.id, (x) => ({ ...x, status: approve ? 'approved' : 'denied' })) };
  let writes = 1;
  if (approve) {
    const before = next.children;
    if (r.kind === 'extra_time' && r.minutes) {
      const minutes = r.minutes;
      next = { ...next, children: swap(next.children, r.childId, (c) => ({ ...c, limitMin: c.limitMin + minutes, bedtime: false })) };
    }
    if (r.kind === 'unlock_app' && r.appId) {
      const appId = r.appId;
      next = { ...next, children: swap(next.children, r.childId, (c) => ({ ...c, apps: swap(c.apps, appId, (y) => ({ ...y, blocked: false })) })) };
    }
    if (JSON.stringify(before) !== JSON.stringify(next.children)) writes += 1;
  }
  return { name: approve ? 'p.approve' : 'p.deny', next, maxWrites: writes, answered: r.id };
};

const markAlertsRead: Action = (a) => {
  const unread = a.local.alerts.filter((x) => x.unread).length;
  if (unread === 0) return null;
  return { name: 'p.markRead', next: { ...a.local, alerts: a.local.alerts.map((x) => ({ ...x, unread: false })) }, maxWrites: unread };
};

const togglePlace: Action = (a) => {
  const p = some(a, a.local.places);
  if (!p) return null;
  const which = a.rng.pick(['arrive', 'leave'] as const);
  return { name: 'p.togglePlace', next: { ...a.local, places: swap(a.local.places, p.id, (x) => ({ ...x, [which]: !x[which] })) }, maxWrites: 1 };
};

const addPlace: Action = (a) => {
  const p: Place = { id: id(a, 'p'), name: `Place ${a.rng.int(1000)}`, icon: 'home', radius: 100 + a.rng.int(200), arrive: true, leave: a.rng.chance(0.5) };
  return { name: 'p.addPlace', next: { ...a.local, places: [...a.local.places, p] }, maxWrites: 1, added: [{ slice: 'places', id: p.id, path: pathOf(a, 'places', p.id) }] };
};

const removePlace: Action = (a) => {
  const p = some(a, a.local.places);
  if (!p) return null;
  return { name: 'p.removePlace', next: { ...a.local, places: a.local.places.filter((x) => x.id !== p.id) }, maxWrites: 1, removed: [pathOf(a, 'places', p.id)] };
};

const toggleSchedule: Action = (a) => {
  const s = some(a, a.local.schedules);
  if (!s) return null;
  return { name: 'p.toggleSchedule', next: { ...a.local, schedules: swap(a.local.schedules, s.id, (x) => ({ ...x, on: !x.on })) }, maxWrites: 1 };
};

const addSchedule: Action = (a) => {
  const s: Schedule = { id: id(a, 's'), name: `Rule ${a.rng.int(1000)}`, icon: 'moon', color: '#5B51E0', start: '9:00 PM', end: '7:00 AM', days: [true, true, true, true, true, false, false], on: true };
  return { name: 'p.addSchedule', next: { ...a.local, schedules: [...a.local.schedules, s] }, maxWrites: 1, added: [{ slice: 'schedules', id: s.id, path: pathOf(a, 'schedules', s.id) }] };
};

const removeSchedule: Action = (a) => {
  const s = some(a, a.local.schedules);
  if (!s) return null;
  return { name: 'p.removeSchedule', next: { ...a.local, schedules: a.local.schedules.filter((x) => x.id !== s.id) }, maxWrites: 1, removed: [pathOf(a, 'schedules', s.id)] };
};

const addSite: Action = (a) => {
  const host = `site${a.rng.int(40)}.example`;
  const list = a.rng.pick(['blocked', 'allowed'] as const);
  if (a.local.sites.some((x) => x.host === host && x.list === list)) return null;
  const s: SiteRule = { id: id(a, 'w'), host, list };
  return { name: 'p.addSite', next: { ...a.local, sites: [...a.local.sites, s] }, maxWrites: 1, added: [{ slice: 'sites', id: s.id, path: pathOf(a, 'sites', s.id) }] };
};

const removeSite: Action = (a) => {
  const s = some(a, a.local.sites);
  if (!s) return null;
  return { name: 'p.removeSite', next: { ...a.local, sites: a.local.sites.filter((x) => x.id !== s.id) }, maxWrites: 1, removed: [pathOf(a, 'sites', s.id)] };
};

const toggleTask: Action = (a) => {
  const t = some(a, a.local.tasks);
  if (!t) return null;
  return { name: 'toggleTask', next: { ...a.local, tasks: swap(a.local.tasks, t.id, (x) => ({ ...x, done: !x.done })) }, maxWrites: 1 };
};

const addTask: Action = (a) => {
  const t: RewardTask = { id: id(a, 't'), title: `Task ${a.rng.int(1000)}`, points: 5 * a.rng.int(8), done: false };
  return { name: 'p.addTask', next: { ...a.local, tasks: [...a.local.tasks, t] }, maxWrites: 1, added: [{ slice: 'tasks', id: t.id, path: pathOf(a, 'tasks', t.id) }] };
};

const removeTask: Action = (a) => {
  const t = some(a, a.local.tasks);
  if (!t) return null;
  return { name: 'p.removeTask', next: { ...a.local, tasks: a.local.tasks.filter((x) => x.id !== t.id) }, maxWrites: 1, removed: [pathOf(a, 'tasks', t.id)] };
};

const parentMessage: Action = (a) => {
  const c = some(a, a.local.children);
  if (!c) return null;
  const at = a.now();
  const m: ChatMessage = { id: id(a, 'm'), childId: c.id, from: 'parent', text: `p says ${a.rng.int(1000)}`, time: '3:42 PM', at };
  return { name: 'p.message', next: { ...a.local, messages: [...a.local.messages, m] }, maxWrites: 1, added: [{ slice: 'messages', id: m.id, path: pathOf(a, 'messages', m.id, c.id) }] };
};

const clearSos: Action = (a) => {
  if (!a.local.sosActive) return null;
  const mine = a.ctx.role === 'parent' || a.local.sosChildId === a.ctx.childId;
  return { name: 'clearSos', next: { ...a.local, sosActive: false, sosChildId: null }, maxWrites: mine ? 1 : 0 };
};

const removeAlert: Action = (a) => {
  const x = some(a, a.local.alerts);
  if (!x) return null;
  return { name: 'p.removeAlert', next: { ...a.local, alerts: a.local.alerts.filter((y) => y.id !== x.id) }, maxWrites: 1, removed: [pathOf(a, 'alerts', x.id)] };
};

const removeRequest: Action = (a) => {
  const r = some(a, a.local.requests);
  if (!r) return null;
  return { name: 'p.removeRequest', next: { ...a.local, requests: a.local.requests.filter((y) => y.id !== r.id) }, maxWrites: 1, removed: [pathOf(a, 'requests', r.id, r.childId)] };
};

// ---- What a child's screens do ---------------------------------------------------------------

const requestTime: Action = (a) => {
  const me = self(a);
  if (!me) return null;
  const minutes = a.rng.pick([15, 30, 60]);
  const r: FamilyRequest = { id: id(a, 'r'), kind: 'extra_time', childId: me.id, label: `${minutes} more minutes`, detail: 'You asked for extra screen time', minutes, ago: 'just now', at: a.now(), status: 'pending' };
  const allowed = a.ctx.role === 'child';
  return {
    name: 'requestTime',
    next: { ...a.local, requests: [r, ...a.local.requests] },
    maxWrites: allowed ? 1 : 0,
    added: allowed ? [{ slice: 'requests', id: r.id, path: pathOf(a, 'requests', r.id, me.id) }] : [],
  };
};

const requestUnlock: Action = (a) => {
  const me = self(a);
  const app = me ? some(a, me.apps) : null;
  if (!me || !app) return null;
  const r: FamilyRequest = { id: id(a, 'r'), childId: me.id, kind: 'unlock_app', label: `Unlock ${app.name}`, detail: 'You asked to unlock an app', appId: app.id, ago: 'just now', at: a.now(), status: 'pending' };
  const allowed = a.ctx.role === 'child';
  return {
    name: 'requestUnlock',
    next: { ...a.local, requests: [r, ...a.local.requests] },
    maxWrites: allowed ? 1 : 0,
    added: allowed ? [{ slice: 'requests', id: r.id, path: pathOf(a, 'requests', r.id, me.id) }] : [],
  };
};

/** On a child's phone: the check-in time and an alert. On a parent's phone (the preview) only the alert may be kept. */
const checkIn: Action = (a) => {
  const me = self(a);
  if (!me) return null;
  const at = a.now();
  const alert = alertFor(a, me, 'checkin', at);
  const next = { ...withChild(a, me.id, (c) => ({ ...c, updatedAgo: 'just now', checkInAt: at })), alerts: [alert, ...a.local.alerts] };
  return { name: 'checkIn', next, maxWrites: a.ctx.role === 'child' ? 2 : 1, added: [{ slice: 'alerts', id: alert.id, path: pathOf(a, 'alerts', alert.id) }] };
};

const raiseSos: Action = (a) => {
  const me = self(a);
  if (!me) return null;
  if (a.local.sosActive && a.local.sosChildId === me.id) return null;
  const alert = alertFor(a, me, 'sos', a.now());
  const next = { ...a.local, sosActive: true, sosChildId: me.id, alerts: [alert, ...a.local.alerts] };
  return { name: 'raiseSos', next, maxWrites: a.ctx.role === 'child' ? 2 : 1, added: [{ slice: 'alerts', id: alert.id, path: pathOf(a, 'alerts', alert.id) }] };
};

const childMessage: Action = (a) => {
  const me = self(a);
  if (!me) return null;
  const m: ChatMessage = { id: id(a, 'm'), childId: me.id, from: 'child', text: `c says ${a.rng.int(1000)}`, time: '3:42 PM', at: a.now() };
  const allowed = a.ctx.role === 'child';
  return {
    name: 'c.message',
    next: { ...a.local, messages: [...a.local.messages, m] },
    maxWrites: allowed ? 1 : 0,
    added: allowed ? [{ slice: 'messages', id: m.id, path: pathOf(a, 'messages', m.id, me.id) }] : [],
  };
};

// ---- Things that must not stick --------------------------------------------------------------

const back = (name: string, next: LocalState, cancelled: string[] = []): Outcome => ({ name, next, maxWrites: 0, cancelled });

/** A parent's phone only: changes no parent is allowed to make. */
const parentMisuse: Action[] = [
  (a) => {
    const m = some(a, a.local.messages);
    return m ? back('x.editMessage', { ...a.local, messages: swap(a.local.messages, m.id, (x) => ({ ...x, text: `${x.text}!` })) }) : null;
  },
  (a) => {
    const m = some(a, a.local.messages);
    return m ? back('x.removeMessage', { ...a.local, messages: a.local.messages.filter((x) => x.id !== m.id) }, [pathOf(a, 'messages', m.id, m.childId)]) : null;
  },
  (a) => {
    const r = some(a, a.local.requests.filter((x) => x.status !== 'pending'));
    return r ? back('x.unresolve', { ...a.local, requests: swap(a.local.requests, r.id, (x) => ({ ...x, status: 'pending' })) }) : null;
  },
  (a) => {
    const r = some(a, a.local.requests);
    return r ? back('x.editRequest', { ...a.local, requests: swap(a.local.requests, r.id, (x) => ({ ...x, label: 'Something else', minutes: 240 })) }) : null;
  },
  (a) => {
    const x = some(a, a.local.alerts.filter((y) => !y.unread));
    return x ? back('x.unreadAlert', { ...a.local, alerts: swap(a.local.alerts, x.id, (y) => ({ ...y, unread: true })) }) : null;
  },
  (a) => {
    const x = some(a, a.local.alerts);
    return x ? back('x.editAlert', { ...a.local, alerts: swap(a.local.alerts, x.id, (y) => ({ ...y, title: 'Edited' })) }) : null;
  },
  (a) => {
    const c = some(a, a.local.children);
    return c ? back('x.removeChild', { ...a.local, children: a.local.children.filter((x) => x.id !== c.id) }, [pathOf(a, 'children', c.id)]) : null;
  },
  (a) => {
    const c = some(a, a.local.children);
    return c ? back('x.limitTooHigh', withChild(a, c.id, (x) => ({ ...x, limitMin: 2000 })), [pathOf(a, 'children', c.id)]) : null;
  },
  (a) => {
    const c = some(a, a.local.children);
    return c ? back('x.nameTooLong', withChild(a, c.id, (x) => ({ ...x, name: 'n'.repeat(61) })), [pathOf(a, 'children', c.id)]) : null;
  },
  (a) => back('x.siteTooLong', { ...a.local, sites: [...a.local.sites, { id: id(a, 'w'), host: `${'h'.repeat(260)}.example`, list: 'blocked' }] }),
  (a) => back('x.placeNoRadius', { ...a.local, places: [...a.local.places, { id: id(a, 'p'), name: 'Nowhere', icon: 'home', radius: 0, arrive: true, leave: true }] }),
  (a) => {
    const c = some(a, a.local.children);
    return c ? back('x.sendAsChild', { ...a.local, messages: [...a.local.messages, { id: id(a, 'm'), childId: c.id, from: 'child', text: 'not me', time: '3:42 PM', at: a.now() }] }) : null;
  },
];

/** A child's phone only: everything a child device is not allowed to change. */
const childMisuse: Action[] = [
  (a) => {
    const c = self(a);
    return c ? back('x.ownLimit', withChild(a, c.id, (x) => ({ ...x, limitMin: x.limitMin + 60, bedtime: false }))) : null;
  },
  (a) => {
    const c = self(a);
    return c ? back('x.ownName', withChild(a, c.id, (x) => ({ ...x, name: 'The Boss' }))) : null;
  },
  (a) => {
    const c = self(a);
    const app = c ? some(a, c.apps) : null;
    return c && app ? back('x.unblockApp', withChild(a, c.id, (x) => ({ ...x, apps: swap(x.apps, app.id, (y) => ({ ...y, blocked: false, limitMin: null })) }))) : null;
  },
  (a) => back('x.removeSelf', { ...a.local, children: [] }, a.local.children.map((c) => pathOf(a, 'children', c.id))),
  (a) => {
    const p = some(a, a.local.places);
    return p ? back('x.togglePlace', { ...a.local, places: swap(a.local.places, p.id, (x) => ({ ...x, arrive: !x.arrive })) }) : null;
  },
  (a) => back('x.addPlace', { ...a.local, places: [...a.local.places, { id: id(a, 'p'), name: 'Arcade', icon: 'home', radius: 100, arrive: true, leave: true }] }),
  (a) => {
    const p = some(a, a.local.places);
    return p ? back('x.removePlace', { ...a.local, places: a.local.places.filter((x) => x.id !== p.id) }, [pathOf(a, 'places', p.id)]) : null;
  },
  (a) => back('x.addSite', { ...a.local, sites: [...a.local.sites, { id: id(a, 'w'), host: 'games.example', list: 'allowed' }] }),
  (a) => {
    const s = some(a, a.local.sites);
    return s ? back('x.removeSite', { ...a.local, sites: a.local.sites.filter((x) => x.id !== s.id) }, [pathOf(a, 'sites', s.id)]) : null;
  },
  (a) => {
    const s = some(a, a.local.schedules);
    return s ? back('x.toggleSchedule', { ...a.local, schedules: swap(a.local.schedules, s.id, (x) => ({ ...x, on: !x.on })) }) : null;
  },
  (a) => {
    const r = some(a, a.local.requests.filter((x) => x.status === 'pending'));
    return r ? back('x.approveOwn', { ...a.local, requests: swap(a.local.requests, r.id, (x) => ({ ...x, status: 'approved' })) }) : null;
  },
  (a) => {
    const r = some(a, a.local.requests);
    return r ? back('x.removeRequest', { ...a.local, requests: a.local.requests.filter((x) => x.id !== r.id) }, [pathOf(a, 'requests', r.id, r.childId)]) : null;
  },
  (a) => (a.local.alerts.some((x) => x.unread) ? back('x.readAlerts', { ...a.local, alerts: a.local.alerts.map((x) => ({ ...x, unread: false })) }) : null),
  (a) => {
    const me = self(a);
    return me ? back('x.sendAsParent', { ...a.local, messages: [...a.local.messages, { id: id(a, 'm'), childId: me.id, from: 'parent', text: 'you may', time: '3:42 PM', at: a.now() }] }) : null;
  },
  (a) => back('x.messageOtherChild', { ...a.local, messages: [...a.local.messages, { id: id(a, 'm'), childId: 'somebody-else', from: 'child', text: 'hi', time: '3:42 PM', at: a.now() }] }),
  (a) => {
    const t = some(a, a.local.tasks);
    return t ? back('x.editTask', { ...a.local, tasks: swap(a.local.tasks, t.id, (x) => ({ ...x, points: 1000 })) }) : null;
  },
  (a) => back('x.addTask', { ...a.local, tasks: [...a.local.tasks, { id: id(a, 't'), title: 'Free points', points: 1000, done: true }] }),
  (a) => {
    const t = some(a, a.local.tasks);
    return t ? back('x.removeTask', { ...a.local, tasks: a.local.tasks.filter((x) => x.id !== t.id) }, [pathOf(a, 'tasks', t.id)]) : null;
  },
  (a) => back('x.alertOfAnotherKind', { ...a.local, alerts: [{ id: id(a, 'n'), kind: 'info', childId: a.ctx.childId, icon: 'shield', color: '#16B981', title: 'All good', body: '', ago: 'now', at: a.now(), unread: true }, ...a.local.alerts] }),
  (a) => back('x.alertAboutAnother', { ...a.local, alerts: [{ id: id(a, 'n'), kind: 'checkin', childId: 'somebody-else', icon: 'map-pin', color: '#2E8BFF', title: 'Not me', body: '', ago: 'now', at: a.now(), unread: true }, ...a.local.alerts] }),
];

const PARENT_ACTIONS: Action[] = [
  adjustLimit, adjustLimit, toggleApp, setAppLimit, pauseResume, renameChild, addChild,
  resolveRequest, resolveRequest, resolveRequest, markAlertsRead, markAlertsRead,
  togglePlace, addPlace, removePlace, toggleSchedule, addSchedule, removeSchedule,
  addSite, addSite, removeSite, toggleTask, addTask, removeTask,
  parentMessage, parentMessage, clearSos, clearSos, removeAlert, removeRequest,
];

/** The child app opened on a parent's phone ("preview the other app"): the same taps, another role. */
const PARENT_PREVIEW: Action[] = [requestTime, requestUnlock, checkIn, raiseSos];

const CHILD_ACTIONS: Action[] = [
  requestTime, requestTime, requestUnlock, checkIn, checkIn, raiseSos, clearSos, clearSos,
  toggleTask, toggleTask, childMessage, childMessage, childMessage,
];

/** One random tap on this device, or null when the chosen action has nothing to act on. */
export function randomAction(a: Actor): Outcome | null {
  const roll = a.rng.next();
  if (a.ctx.role === 'parent') {
    if (roll < 0.8) return a.rng.pick(PARENT_ACTIONS)(a);
    return roll < 0.88 ? a.rng.pick(PARENT_PREVIEW)(a) : a.rng.pick(parentMisuse)(a);
  }
  return roll < 0.75 ? a.rng.pick(CHILD_ACTIONS)(a) : a.rng.pick(childMisuse)(a);
}

export const actions = {
  adjustLimit, toggleApp, setAppLimit, pauseResume, renameChild, addChild, resolveRequest, markAlertsRead,
  togglePlace, addPlace, removePlace, toggleSchedule, addSchedule, removeSchedule, addSite, removeSite,
  toggleTask, addTask, removeTask, parentMessage, clearSos, removeAlert, removeRequest,
  requestTime, requestUnlock, checkIn, raiseSos, childMessage,
};
