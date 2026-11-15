import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AppState, Platform, View, useColorScheme } from 'react-native';

import { SPLASH_BG } from '@/config/variant';
import { newId } from '@/sync/ids';
import { agoLabel, clockLabel } from '@/sync/labels';
import { rebaseList } from '@/sync/reconcile';
import { isBackendConfigured } from '@/sync/config';
import { LINK_KEY, parseLinkRecord } from '@/sync/types';
import { loadState, resolvedRequestIds, serialiseState, STATE_KEY, type PersistedState, type SliceKey } from './persist';
import { readKey, removeKey, writeKey } from './storage';

export { newId } from '@/sync/ids';
export { agoLabel, clockLabel } from '@/sync/labels';

export type AppCategory = 'social' | 'games' | 'video' | 'education' | 'music' | 'web' | 'messaging' | 'creativity';

export interface ManagedApp {
  id: string;
  name: string;
  icon: string; // MaterialCommunityIcons name
  color: string;
  category: AppCategory;
  usedMin: number;
  limitMin: number | null; // null = no limit
  blocked: boolean;
}

export interface Child {
  id: string;
  name: string;
  age: number;
  deviceName: string;
  battery: number;
  online: boolean;
  bedtime: boolean;
  usedMin: number;
  limitMin: number;
  place: string;
  placeIcon: string;
  /** Shown when there is no `checkInAt` (the sample data). */
  updatedAgo: string;
  /** When this child last checked in, in milliseconds. Set by a check-in; in a linked family it is the server's time. */
  checkInAt?: number;
  apps: ManagedApp[];
  weekly: number[]; // minutes per weekday, Mon..Sun
}

export interface FamilyRequest {
  id: string;
  childId: string;
  kind: 'extra_time' | 'unlock_app' | 'bedtime';
  label: string;
  detail: string;
  minutes?: number;
  appId?: string;
  /** Shown when there is no `at` (the sample data). */
  ago: string;
  /** When it was asked, in milliseconds: the device's clock at first, the server's time once sent. */
  at?: number;
  status: 'pending' | 'approved' | 'denied';
}

export interface Alert {
  id: string;
  icon: string;
  color: string;
  title: string;
  body: string;
  /** Shown when there is no `at` (the sample data). */
  ago: string;
  unread: boolean;
  /** When it happened, in milliseconds: the device's clock at first, the server's time once sent. */
  at?: number;
  /** What it is about: 'checkin', 'sos', 'request', 'left', or anything a parent device adds. */
  kind?: string;
  /** The child it is about, when it is about one. */
  childId?: string | null;
}

export interface Place {
  id: string;
  name: string;
  icon: string;
  radius: number;
  arrive: boolean;
  leave: boolean;
}

export interface RewardTask {
  id: string;
  title: string;
  points: number;
  done: boolean;
}

const mkApps = (seed: number): ManagedApp[] => [
  { id: 'a1', name: 'Streamly', icon: 'play-circle', color: '#FF3B30', category: 'video', usedMin: 62 + seed, limitMin: 90, blocked: false },
  { id: 'a2', name: 'Chatter', icon: 'message-text', color: '#22C55E', category: 'messaging', usedMin: 40, limitMin: null, blocked: false },
  { id: 'a3', name: 'Photogram', icon: 'camera', color: '#E1306C', category: 'social', usedMin: 35, limitMin: 45, blocked: false },
  { id: 'a4', name: 'PuzzleQuest', icon: 'puzzle', color: '#8B5CF6', category: 'games', usedMin: 28, limitMin: 60, blocked: false },
  { id: 'a5', name: 'SchoolHub', icon: 'school', color: '#2E8BFF', category: 'education', usedMin: 25, limitMin: null, blocked: false },
  { id: 'a6', name: 'BeatBox', icon: 'music', color: '#F5A623', category: 'music', usedMin: 18, limitMin: null, blocked: false },
  { id: 'a7', name: 'Voxel Arena', icon: 'gamepad-variant', color: '#12B5A6', category: 'games', usedMin: 15, limitMin: 30, blocked: true },
  { id: 'a8', name: 'Canvas', icon: 'palette', color: '#EC4899', category: 'creativity', usedMin: 12, limitMin: null, blocked: false },
  { id: 'a9', name: 'Web', icon: 'web', color: '#F5862B', category: 'web', usedMin: 22, limitMin: null, blocked: false },
];

const initialChildren: Child[] = [
  {
    id: 'c1',
    name: 'Mia Carter',
    age: 11,
    deviceName: "Mia's Tablet",
    battery: 72,
    online: true,
    bedtime: false,
    usedMin: 168,
    limitMin: 240,
    place: 'School',
    placeIcon: 'school',
    updatedAgo: '2m ago',
    apps: mkApps(0),
    weekly: [180, 210, 160, 240, 168, 95, 120],
  },
  {
    id: 'c2',
    name: 'Leo Carter',
    age: 8,
    deviceName: "Leo's Phone",
    battery: 44,
    online: true,
    bedtime: false,
    usedMin: 96,
    limitMin: 150,
    place: 'Home',
    placeIcon: 'home',
    updatedAgo: 'just now',
    apps: mkApps(5).map((a) => ({ ...a, usedMin: Math.round(a.usedMin * 0.6) })),
    weekly: [120, 90, 150, 110, 96, 60, 140],
  },
];

const initialRequests: FamilyRequest[] = [
  { id: 'r1', childId: 'c1', kind: 'extra_time', label: '30 more minutes', detail: 'Mia asked for extra screen time', minutes: 30, ago: '5m ago', status: 'pending' },
  { id: 'r2', childId: 'c2', kind: 'unlock_app', label: 'Unlock Voxel Arena', detail: 'Leo wants to open a blocked app', appId: 'a7', ago: '20m ago', status: 'pending' },
];

const initialAlerts: Alert[] = [
  { id: 'n1', icon: 'map-pin', color: '#2E8BFF', title: 'Mia arrived at School', body: 'Geofence · 8:42 AM', ago: '1h', unread: true },
  { id: 'n2', icon: 'clock', color: '#5B51E0', title: 'Mia has 10 minutes left on Photogram', body: 'App limit · 45m a day', ago: '2h', unread: true },
  { id: 'n3', icon: 'shield', color: '#16B981', title: 'Weekly report is ready', body: 'Screen time down 12% this week', ago: '1d', unread: false },
];

const initialPlaces: Place[] = [
  { id: 'p1', name: 'Home', icon: 'home', radius: 150, arrive: true, leave: true },
  { id: 'p2', name: 'School', icon: 'school', radius: 200, arrive: true, leave: true },
  { id: 'p3', name: "Grandma's", icon: 'account-heart', radius: 120, arrive: true, leave: false },
];

const initialTasks: RewardTask[] = [
  { id: 't1', title: 'Finish homework', points: 20, done: true },
  { id: 't2', title: 'Tidy your room', points: 15, done: false },
  { id: 't3', title: 'Read for 20 minutes', points: 25, done: false },
  { id: 't4', title: 'Help with dinner', points: 10, done: false },
];

export interface Schedule {
  id: string;
  name: string;
  icon: string; // Feather icon name
  color: string;
  start: string; // e.g. "9:00 PM"
  end: string;
  days: boolean[]; // Mon..Sun
  on: boolean;
}

export interface ChatMessage {
  id: string;
  childId: string;
  from: 'parent' | 'child';
  text: string;
  /** Shown when there is no `at` (the sample data). */
  time: string;
  /** When it was sent, in milliseconds: the device's clock at first, the server's time once sent. */
  at?: number;
}

export interface SiteRule {
  id: string;
  host: string;
  list: 'blocked' | 'allowed';
}

const ALL = [true, true, true, true, true, true, true];
const WEEKDAYS = [true, true, true, true, true, false, false];

const initialSchedules: Schedule[] = [
  { id: 's1', name: 'Bedtime', icon: 'moon', color: '#5B51E0', start: '9:00 PM', end: '7:00 AM', days: ALL, on: true },
  { id: 's2', name: 'School hours', icon: 'book', color: '#2E8BFF', start: '8:30 AM', end: '3:00 PM', days: WEEKDAYS, on: true },
  { id: 's3', name: 'Dinner & downtime', icon: 'coffee', color: '#FF7A59', start: '6:00 PM', end: '7:00 PM', days: ALL, on: false },
  { id: 's4', name: 'Homework focus', icon: 'edit-3', color: '#12B5A6', start: '4:00 PM', end: '5:30 PM', days: WEEKDAYS, on: true },
];

const initialMessages: ChatMessage[] = [
  { id: 'm1', childId: 'c1', from: 'parent', text: 'Have a great day at school! 💜', time: '8:10 AM' },
  { id: 'm2', childId: 'c1', from: 'child', text: 'Thanks! Can I go to Alex\'s after school?', time: '12:32 PM' },
  { id: 'm3', childId: 'c1', from: 'parent', text: 'Yes — be home by 6 for dinner.', time: '12:40 PM' },
  { id: 'm4', childId: 'c2', from: 'parent', text: 'Homework first, then games 🙂', time: '3:45 PM' },
];

const initialSites: SiteRule[] = [
  { id: 'w1', host: 'chatroulette.example', list: 'blocked' },
  { id: 'w2', host: 'freebets.example', list: 'blocked' },
  { id: 'w3', host: 'shockvideos.example', list: 'blocked' },
  { id: 'w4', host: 'schoolportal.example', list: 'allowed' },
  { id: 'w5', host: 'kidsencyclopedia.example', list: 'allowed' },
  { id: 'w6', host: 'mathpractice.example', list: 'allowed' },
];

export function nowLabel() {
  return clockLabel(Date.now());
}

// --- Labels for items that may carry a real time ----------------------------------------------
// An item with `at` (or a child with `checkInAt`) is drawn from that time, so the label is always
// fresh. Without one, the stored label is shown as it is. Pass `now` from `useNow()` so a screen that
// stays open keeps its labels moving.

/** "5m ago" for a request ("just now" under a minute). With `short`: "5m" / "now", as the alert list shows. */
export function agoOf(item: { at?: number; ago: string }, now?: number, short = false): string {
  return item.at != null ? agoLabel(item.at, now, short) : item.ago;
}

/** The clock time of a chat message, "3:42 PM". */
export function timeOf(message: { at?: number; time: string }): string {
  return message.at != null ? clockLabel(message.at) : message.time;
}

/** When a child last checked in, "5m ago". */
export function updatedAgoOf(child: { checkInAt?: number; updatedAgo: string }, now?: number): string {
  return child.checkInAt != null ? agoLabel(child.checkInAt, now) : child.updatedAgo;
}

/** The current time, refreshed every `everyMs`, for labels such as "5m ago" on a screen that stays open. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

// --- What a new family starts with -------------------------------------------------------------
// The link layer seeds a new family with these (see SPEC 3.1): one child built by `makeChild`, the
// sample places, schedules and tasks, and nothing else.

export const SEED_PLACES: readonly Place[] = initialPlaces;
export const SEED_SCHEDULES: readonly Schedule[] = initialSchedules;
export const SEED_TASKS: readonly RewardTask[] = initialTasks;

/**
 * What a request asks for, worded here from its structured fields. In a family the request comes
 * from the child's phone, and the server checks its shape, not its words: the title a parent reads
 * before approving must say what approving will really do (these minutes, this app).
 */
export function requestTitle(request: FamilyRequest, child?: Child | null): string {
  if (request.kind === 'extra_time') return request.minutes ? `${request.minutes} more minutes` : 'More screen time';
  if (request.kind === 'unlock_app') {
    const app = child?.apps.find((a) => a.id === request.appId);
    return app ? `Unlock ${app.name}` : 'Unlock an app';
  }
  return 'A later bedtime';
}

/**
 * Title and body of a feed entry. In a family (`live`), the entries a child's phone writes
 * (check-in, SOS, a request, leaving the family) are worded here from what they are, whom they are
 * about and the server's time, not from the text that phone supplied. Everything else, and all
 * sample data, is shown as stored.
 */
export function alertText(alert: Alert, kids: readonly Child[], live: boolean): { title: string; body: string; icon: string; color: string } {
  const stored = { title: alert.title, body: alert.body, icon: alert.icon, color: alert.color };
  if (!live || alert.at == null) return stored;
  const child = alert.childId != null ? kids.find((c) => c.id === alert.childId) : undefined;
  const first = child ? child.name.split(' ')[0] : 'A child';
  const at = clockLabel(alert.at);
  switch (alert.kind) {
    case 'checkin':
      return { title: `${first} checked in`, body: `At ${at}`, icon: 'map-pin', color: '#2E8BFF' };
    case 'sos':
      return { title: `SOS from ${first}`, body: `Sent at ${at}`, icon: 'alert-circle', color: '#FB4A4A' };
    case 'request':
      return { title: `${first} sent a request`, body: `At ${at}`, icon: 'inbox', color: '#F5A623' };
    case 'left':
      return { title: `${first}’s phone left the family`, body: 'It was unlinked on the phone itself.', icon: 'x-circle', color: '#F5A623' };
    default:
      return stored;
  }
}

/** What `updatedAgo` says for a child that has not checked in yet. */
export const NEVER_CHECKED_IN = 'never';

/**
 * A new child record: the sample app list and numbers of the first sample child, no device name and
 * no check-in. `age` is kept within what the server accepts (0 to 25).
 */
export function makeChild(id: string, name: string, age?: number): Child {
  const template = initialChildren[0];
  const years = age == null || !Number.isFinite(age) ? template.age : Math.min(25, Math.max(0, Math.round(age)));
  return {
    ...template,
    id,
    name,
    age: years,
    deviceName: '',
    updatedAgo: NEVER_CHECKED_IN,
    // The example app list, with nothing blocked: a new family starts without rules nobody set.
    apps: mkApps(0).map((app) => ({ ...app, blocked: false })),
    weekly: [...template.weekly],
  };
}

/** Stands in for "the child" on the rare linked device whose family has no child yet. Never stored. */
const BLANK_CHILD: Child = { ...makeChild('', 'Child'), usedMin: 0, online: false, place: '', placeIcon: 'map-marker', apps: [], weekly: [0, 0, 0, 0, 0, 0, 0] };

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * A state updater for a slice that arrives from the link layer.
 *
 * `next` was worked out from `from`. Normally the slice still is `from` and simply becomes `next`.
 * If something was changed here in the meantime (a tap whose update is queued ahead of this one),
 * that change is replayed on top of `next` instead of being overwritten; the link layer sees the
 * result as a local change and sends it. A slice that ends up saying what it already said keeps its
 * array, so applying the same data twice changes nothing.
 */
const takeRemote =
  <T extends { id: string }>(next: readonly T[], from: readonly T[] | undefined) =>
  (prev: T[]): T[] => {
    const target = from === undefined || prev === from ? next : rebaseList(from, next, prev);
    return sameJson(prev, target) ? prev : (target as T[]);
  };

const ONBOARDED_KEY = 'haven.onboarded';
/**
 * Which side this device was set up as, so the next start opens it without asking again. It is only
 * a starting point: once the device is in a family, the role the server gave it decides
 * (src/app/_layout.tsx keeps the two in step and closes the other side).
 */
const ROLE_KEY = 'haven.role.v1';

/** The starting demo data: what a first launch shows and what "reset" goes back to. */
const SEED: PersistedState = {
  children: initialChildren,
  activeChildId: 'c1',
  requests: initialRequests,
  alerts: initialAlerts,
  places: initialPlaces,
  tasks: initialTasks,
  schedules: initialSchedules,
  messages: initialMessages,
  sites: initialSites,
  sosActive: false,
  sosChildId: null,
};

/** The slices the link layer may replace. `activeChildId` is this device's own choice. */
export type RemotePatch = {
  [K in Exclude<keyof PersistedState, 'activeChildId'>]?: PersistedState[K] extends (infer T)[] ? readonly T[] : PersistedState[K];
};

export interface ApplyRemoteOptions {
  /**
   * The slices the patch was worked out from: the `syncSnapshot` the link layer reconciled. With
   * it, a change made on this device after that snapshot was taken is kept (replayed on top of the
   * patch) rather than overwritten. Without it the patch replaces the slices as they are.
   */
  basis?: RemotePatch;
  /**
   * Write the state (and the record) to storage as soon as it has been applied instead of after
   * the usual short pause. For a patch that carries news from the server which a kill must not
   * lose: a write of ours was confirmed.
   */
  saveNow?: boolean;
}

/** What the link layer saved with the state last time, as read at startup. */
export interface StoredSyncRecord {
  /** Exactly what was passed to `applyRemote(patch, record)`; validate it before use. */
  record: unknown;
  /**
   * Slices whose saved copy could not be used and came back as sample data. They do not match the
   * record: treat them as not authoritative (adopt the server's copy, write nothing from them).
   */
  untrusted: readonly SliceKey[];
}

/** How long the state has to stay unchanged before it is written to storage. */
const SAVE_DELAY_MS = 400;

/** The longest daily limit the server accepts for a child, in minutes (firestore.rules, childShapeOk). */
export const MAX_LIMIT_MIN = 1440;

export type Role = 'parent' | 'child' | null;

interface Store {
  role: Role;
  setRole: (r: Role) => void;
  children: Child[];
  activeChildId: string;
  setActiveChildId: (id: string) => void;
  activeChild: Child;
  /**
   * The child using the child app on this device: the child the link layer named with
   * `setSelfChildId`, otherwise the first child.
   */
  childSelf: Child;
  requests: FamilyRequest[];
  alerts: Alert[];
  places: Place[];
  tasks: RewardTask[];
  points: number;
  adjustLimit: (childId: string, deltaMin: number) => void;
  grantBonus: (childId: string, min: number) => void;
  toggleApp: (childId: string, appId: string) => void;
  setAppLimit: (childId: string, appId: string, limit: number | null) => void;
  pauseDevice: (childId: string) => void;
  resumeDevice: (childId: string) => void;
  resolveRequest: (id: string, approve: boolean) => void;
  toggleTask: (id: string) => void;
  requestExtraTime: (minutes: number) => void;
  markAlertsRead: () => void;
  togglePlaceAlert: (placeId: string, which: 'arrive' | 'leave') => void;
  addPlace: (p: Omit<Place, 'id'>) => void;
  removePlace: (id: string) => void;
  schedules: Schedule[];
  toggleSchedule: (id: string) => void;
  addSchedule: (s: Omit<Schedule, 'id'>) => void;
  removeSchedule: (id: string) => void;
  messages: ChatMessage[];
  sendMessage: (childId: string, from: 'parent' | 'child', text: string) => void;
  sites: SiteRule[];
  addSite: (host: string, list: 'blocked' | 'allowed') => void;
  removeSite: (id: string) => void;
  renameChild: (id: string, name: string) => void;
  /** Adds a child with the sample app list and numbers. Returns the new child's id. */
  addChild: (name: string, age?: number) => string;
  requestUnlock: (appId: string) => void;
  checkIn: () => void;
  sosActive: boolean;
  /** The child whose SOS is on, or null when none is (or when an older save did not record it). */
  sosChildId: string | null;
  /** The child an active SOS came from: `sosChildId` when it names a child, otherwise `childSelf`. */
  sosChild: Child;
  /** True when the SOS that is on belongs to `childSelf`. The child app shows only its own SOS. */
  sosMine: boolean;
  triggerSOS: () => void;
  clearSOS: () => void;
  /** True while the link layer says this device is in a real family. Sample wording is dropped then. */
  live: boolean;
  hasOnboarded: boolean;
  /**
   * False until both saved values have been read: the "has seen the introduction" flag and the
   * demo state. Screens are only mounted once it is true, so they never see seed data first.
   */
  ready: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  /**
   * Puts every piece of demo data back to its starting state and forgets the saved copy. Keeps the
   * onboarding flag. Does nothing on a device that is in a family: there the data is the family's,
   * and putting the samples back would be sent to the other phones as if it were a change.
   */
  resetDemoData: () => void;
  /** Link layer only: the same reset without that check, for a device that has just left its family. */
  wipeToSample: () => void;
  /** The saved slices as one object. The link layer (src/sync) watches this to send changes. */
  syncSnapshot: PersistedState;
  /**
   * Replaces the given slices with values that arrived from the family, all in one update. A slice
   * that already says the same thing is left alone, so applying the same data twice changes nothing
   * and causes no save. Labels are not touched and nothing is relabelled.
   *
   * `record`, when given, is the link layer's own record (what the server has confirmed and so on).
   * It is saved in the same write as the state it belongs to, never separately: pass the record
   * that matches the patch. `applyRemote({}, record)` stores a new record on its own and
   * `applyRemote({}, null)` removes it.
   */
  applyRemote: (patch: RemotePatch, record?: unknown, options?: ApplyRemoteOptions) => void;
  /** The record that was saved with the state, as read at startup (null when there was none). Stable function. */
  readSyncRecord: () => StoredSyncRecord | null;
  /** Link layer: which child this device is enrolled as. null: the first child, as on an unlinked device. */
  setSelfChildId: (id: string | null) => void;
  /** Link layer: true while this device is in a real family. */
  setLive: (live: boolean) => void;
  /**
   * The role this device had in its family according to its saved link record, read before the
   * first frame. Only for the moment at start before the link layer has read the same record:
   * src/app/_layout.tsx closes the other side with it, so a deep link opened at a cold start never
   * shows the wrong side. null once the device leaves its family.
   */
  linkedRoleAtStart: 'parent' | 'child' | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children: node }: { children: ReactNode }) {
  // The side chosen at setup, read back from storage at start (see ROLE_KEY).
  const [role, setRoleState] = useState<Role>(null);
  const roleRef = useRef<Role>(null);
  const setRole = useCallback((next: Role) => {
    if (roleRef.current === next) return;
    roleRef.current = next;
    setRoleState(next);
    if (next) writeKey(ROLE_KEY, next);
    else removeKey(ROLE_KEY);
  }, []);
  const [kids, setKids] = useState<Child[]>(SEED.children);
  const [activeChildIdChoice, setActiveChildId] = useState(SEED.activeChildId);
  const [requests, setRequests] = useState<FamilyRequest[]>(SEED.requests);
  const [alerts, setAlerts] = useState<Alert[]>(SEED.alerts);
  const [places, setPlaces] = useState<Place[]>(SEED.places);
  const [tasks, setTasks] = useState<RewardTask[]>(SEED.tasks);
  const [schedules, setSchedules] = useState<Schedule[]>(SEED.schedules);
  const [messages, setMessages] = useState<ChatMessage[]>(SEED.messages);
  const [sites, setSites] = useState<SiteRule[]>(SEED.sites);
  const [sosActive, setSosActive] = useState(SEED.sosActive);
  const [sosChildId, setSosChildId] = useState<string | null>(SEED.sosChildId);
  /** Set by the link layer. Not saved here: the link layer sets both again at every start. */
  const [selfChildId, setSelfChildId] = useState<string | null>(null);
  const [live, setLiveState] = useState(false);
  const liveRef = useRef(false);
  const [linkedRoleAtStart, setLinkedRoleAtStart] = useState<'parent' | 'child' | null>(null);
  const setLive = useCallback((next: boolean) => {
    liveRef.current = next;
    setLiveState(next);
    if (!next) setLinkedRoleAtStart(null);
  }, []);
  /** The link layer's record. It is state so that it commits, and is saved, together with the slices. */
  const [syncRecord, setSyncRecord] = useState<unknown>(undefined);
  const storedSync = useRef<StoredSyncRecord | null>(null);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [ready, setReady] = useState(false);

  /** Requests answered so far. Rebuilt whenever the requests are replaced wholesale (load, reset). */
  const resolvedIds = useRef(new Set<string>());

  // --- Persistence ---------------------------------------------------------------------------
  // The slices below are written to storage as one JSON value (see ./persist). Order of events:
  // read once on mount -> `ready` -> from then on every change is saved after a short pause.

  /** True once the stored values have been read and applied. Nothing is written before that. */
  const hydrated = useRef(false);
  /** Set when the data is reset before the first read has come back, so that read is not applied. */
  const discardStored = useRef(false);
  /** The newest state (and the link record that goes with it) still to be written, or null when there is nothing to write. */
  const pendingSave = useRef<{ state: PersistedState; sync: unknown } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set by `applyRemote(..., { saveNow: true })`: the next save is not delayed. */
  const saveAtOnce = useRef(false);
  /**
   * The state that needs no write, serialised: what was read at startup, what was written last, or
   * the seed right after a reset. A save that would store exactly this is skipped.
   */
  const savedJson = useRef<string | null>(null);

  // Read the onboarding flag and the demo state together. `ready` flips only after both reads
  // have finished, whether they found something, found nothing or failed.
  useEffect(() => {
    if (hydrated.current) return;
    let alive = true;
    Promise.all([readKey(ONBOARDED_KEY), readKey(STATE_KEY), readKey(ROLE_KEY), readKey(LINK_KEY)]).then(([flag, raw, savedRole, linkRaw]) => {
      if (!alive) return;
      if (flag === '1') setHasOnboarded(true);
      // A device that is in a family is known to be one from its first frame. The link layer reads
      // the same record and says the same a moment later (and takes it back if the record turns out
      // not to hold); without this, a linked phone drew the sample layout for an instant at start.
      const linkedFamily = isBackendConfigured ? (parseLinkRecord(linkRaw)?.family ?? null) : null;
      if (linkedFamily && !(linkedFamily.pendingSeed && !linkedFamily.pendingSeed.familyStored)) {
        liveRef.current = true;
        setLiveState(true);
        setLinkedRoleAtStart(linkedFamily.role);
        setSelfChildId(linkedFamily.role === 'child' ? linkedFamily.childId : null);
      }
      // A side picked before this read came back wins over the saved one.
      if (roleRef.current === null && (savedRole === 'parent' || savedRole === 'child')) {
        roleRef.current = savedRole;
        setRoleState(savedRole);
      }
      if (!discardStored.current) {
        // Anything unreadable falls back to the seed, slice by slice. A slice that falls back is
        // the seed array itself, so setting it is a no-op. loadState does not throw; the catch
        // only makes sure a surprise here can never leave the app stuck before `ready`.
        let state = SEED;
        let sync: unknown = undefined;
        try {
          const loaded = loadState(raw, SEED);
          state = loaded.state;
          sync = loaded.sync;
          if (sync !== undefined) storedSync.current = { record: sync, untrusted: loaded.fallbacks };
        } catch {
          state = SEED;
          sync = undefined;
        }
        // "now" and "just now" were true when they were saved. After a restart they are not. Only
        // items without a real time are relabelled: one with `at` is drawn from it and is left as
        // it is, so a cold start never changes anything the link layer compares or sends.
        const staleAlert = (a: Alert) => a.ago === 'now' && a.at == null;
        const staleRequest = (r: FamilyRequest) => r.ago === 'just now' && r.at == null;
        if (state.alerts.some(staleAlert)) {
          state = { ...state, alerts: state.alerts.map((a) => (staleAlert(a) ? { ...a, ago: 'earlier' } : a)) };
        }
        if (state.requests.some(staleRequest)) {
          state = { ...state, requests: state.requests.map((r) => (staleRequest(r) ? { ...r, ago: 'earlier' } : r)) };
        }
        setKids(state.children);
        setActiveChildId(state.activeChildId);
        setRequests(state.requests);
        setAlerts(state.alerts);
        setPlaces(state.places);
        setTasks(state.tasks);
        setSchedules(state.schedules);
        setMessages(state.messages);
        setSites(state.sites);
        setSosActive(state.sosActive);
        setSosChildId(state.sosChildId);
        setSyncRecord(sync);
        resolvedIds.current = resolvedRequestIds(state.requests);
        savedJson.current = serialiseState(state, sync);
      }
      hydrated.current = true;
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Writes the pending state now, if there is one and it differs from what is already saved. */
  const flushSave = useCallback(() => {
    if (saveTimer.current != null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const next = pendingSave.current;
    if (!next) return;
    pendingSave.current = null;
    const json = serialiseState(next.state, next.sync);
    if (json === savedJson.current) return;
    savedJson.current = json;
    writeKey(STATE_KEY, json).then((ok) => {
      // A failed write is forgotten, so the next change tries again.
      if (!ok && savedJson.current === json) savedJson.current = null;
    });
  }, []);

  // The child the parent is looking at. When the saved choice matches no child any more (the family's
  // children replaced the sample ones), the first child takes its place, and that is the id the rest
  // of the app sees and acts on.
  const activeChild = kids.find((c) => c.id === activeChildIdChoice) ?? kids[0] ?? BLANK_CHILD;
  const activeChildId = kids.length > 0 ? activeChild.id : activeChildIdChoice;
  const childSelf = (selfChildId != null ? kids.find((c) => c.id === selfChildId) : undefined) ?? kids[0] ?? BLANK_CHILD;

  const snapshot = useMemo<PersistedState>(
    () => ({ children: kids, activeChildId, requests, alerts, places, tasks, schedules, messages, sites, sosActive, sosChildId }),
    [kids, activeChildId, requests, alerts, places, tasks, schedules, messages, sites, sosActive, sosChildId],
  );
  /** What one save holds: the state and the link record that committed with it. */
  const toSave = useMemo(() => ({ state: snapshot, sync: syncRecord }), [snapshot, syncRecord]);

  // Save on change, debounced. Nothing is scheduled until the stored state has been read, so the
  // seed can never overwrite a saved copy during startup. The cleanup only stops the timer: the
  // pending state stays, to be replaced by a newer one or flushed below.
  useEffect(() => {
    if (!ready) return;
    pendingSave.current = toSave;
    if (saveAtOnce.current) {
      saveAtOnce.current = false;
      flushSave();
      return;
    }
    saveTimer.current = setTimeout(flushSave, SAVE_DELAY_MS);
    return () => {
      if (saveTimer.current != null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [toSave, ready, flushSave]);

  // Do not wait for the timer when the app is about to be suspended or the page closed.
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') flushSave();
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', flushSave);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', flushSave);
        flushSave();
      };
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushSave();
    });
    return () => {
      sub.remove();
      flushSave();
    };
  }, [flushSave]);

  const updateChild = useCallback((id: string, fn: (c: Child) => Child) => {
    setKids((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  // In a real family a daily limit cannot exceed the day: the server refuses more than 24 hours, and
  // a refused value would be put back. On its own, with the sample data, nothing is capped.
  const limitCap = live ? MAX_LIMIT_MIN : Number.POSITIVE_INFINITY;

  const adjustLimit = useCallback((id: string, delta: number) => {
    updateChild(id, (c) => ({ ...c, limitMin: Math.max(0, Math.min(Math.max(limitCap, c.limitMin), c.limitMin + delta)) }));
  }, [updateChild, limitCap]);

  const grantBonus = useCallback((id: string, min: number) => {
    updateChild(id, (c) => ({ ...c, limitMin: Math.min(Math.max(limitCap, c.limitMin), c.limitMin + min), bedtime: false }));
  }, [updateChild, limitCap]);

  const toggleApp = useCallback((id: string, appId: string) => {
    updateChild(id, (c) => ({ ...c, apps: c.apps.map((a) => (a.id === appId ? { ...a, blocked: !a.blocked } : a)) }));
  }, [updateChild]);

  const setAppLimit = useCallback((id: string, appId: string, limit: number | null) => {
    updateChild(id, (c) => ({ ...c, apps: c.apps.map((a) => (a.id === appId ? { ...a, limitMin: limit } : a)) }));
  }, [updateChild]);

  const pauseDevice = useCallback((id: string) => updateChild(id, (c) => ({ ...c, bedtime: true })), [updateChild]);
  const resumeDevice = useCallback((id: string) => updateChild(id, (c) => ({ ...c, bedtime: false })), [updateChild]);

  const resolveRequest = useCallback((id: string, approve: boolean) => {
    const req = requests.find((r) => r.id === id);
    // Only a pending request can be resolved, and only once: the ref also stops presses that
    // arrive before React has re-rendered with the new status.
    if (!req || req.status !== 'pending' || resolvedIds.current.has(id)) return;
    resolvedIds.current.add(id);
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: approve ? 'approved' : 'denied' } : r)),
    );
    if (approve) {
      if (req.kind === 'extra_time' && req.minutes) grantBonus(req.childId, req.minutes);
      // Approving always unblocks; it must never re-block an app the parent already allowed.
      if (req.kind === 'unlock_app' && req.appId) {
        const appId = req.appId;
        updateChild(req.childId, (c) => ({ ...c, apps: c.apps.map((a) => (a.id === appId ? { ...a, blocked: false } : a)) }));
      }
    }
  }, [requests, grantBonus, updateChild]);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, []);

  const selfId = childSelf.id;

  const requestExtraTime = useCallback((minutes: number) => {
    const request: FamilyRequest = {
      id: newId('r'), kind: 'extra_time', childId: selfId, label: `${minutes} more minutes`, detail: 'You asked for extra screen time', minutes, ago: 'just now', at: Date.now(), status: 'pending',
    };
    setRequests((prev) => [request, ...prev]);
  }, [selfId]);

  const markAlertsRead = useCallback(() => setAlerts((prev) => prev.map((a) => ({ ...a, unread: false }))), []);

  const togglePlaceAlert = useCallback((placeId: string, which: 'arrive' | 'leave') => {
    setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, [which]: !p[which] } : p)));
  }, []);

  const pushAlert = useCallback((a: Omit<Alert, 'id' | 'ago' | 'unread' | 'at'>, at: number) => {
    const alert: Alert = { ...a, id: newId('n'), ago: 'now', at, unread: true };
    setAlerts((prev) => [alert, ...prev]);
  }, []);

  const addPlace = useCallback((p: Omit<Place, 'id'>) => {
    const place: Place = { ...p, id: newId('p') };
    setPlaces((prev) => [...prev, place]);
  }, []);
  const removePlace = useCallback((id: string) => setPlaces((prev) => prev.filter((p) => p.id !== id)), []);

  const toggleSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
  }, []);
  const addSchedule = useCallback((sc: Omit<Schedule, 'id'>) => {
    const schedule: Schedule = { ...sc, id: newId('s') };
    setSchedules((prev) => [...prev, schedule]);
  }, []);
  const removeSchedule = useCallback((id: string) => setSchedules((prev) => prev.filter((x) => x.id !== id)), []);

  const sendMessage = useCallback((childId: string, from: 'parent' | 'child', text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const at = Date.now();
    const message: ChatMessage = { id: newId('m'), childId, from, text: clean, time: clockLabel(at), at };
    setMessages((prev) => [...prev, message]);
  }, []);

  const addSite = useCallback((host: string, list: 'blocked' | 'allowed') => {
    const clean = host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!clean) return;
    const site: SiteRule = { id: newId('w'), host: clean, list };
    setSites((prev) => (prev.some((x) => x.host === clean && x.list === list) ? prev : [...prev, site]));
  }, []);
  const removeSite = useCallback((id: string) => setSites((prev) => prev.filter((x) => x.id !== id)), []);

  const renameChild = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    updateChild(id, (c) => ({ ...c, name: clean }));
  }, [updateChild]);

  const addChild = useCallback((name: string, age?: number) => {
    const child = makeChild(newId('c'), name.trim() || 'Child', age);
    setKids((prev) => [...prev, child]);
    return child.id;
  }, []);

  const requestUnlock = useCallback((appId: string) => {
    const app = childSelf.apps.find((a) => a.id === appId);
    if (!app) return;
    const request: FamilyRequest = {
      id: newId('r'), childId: childSelf.id, kind: 'unlock_app', label: `Unlock ${app.name}`, detail: 'You asked to unlock an app', appId, ago: 'just now', at: Date.now(), status: 'pending',
    };
    setRequests((prev) => [request, ...prev]);
  }, [childSelf]);

  const checkIn = useCallback(() => {
    const me = childSelf;
    const at = Date.now();
    updateChild(me.id, (c) => ({ ...c, updatedAgo: 'just now', checkInAt: at }));
    // A phone in a real family does not know where it is, so it reports the time and nothing else.
    // On its own, with the sample data, it keeps naming the sample place.
    const body = live ? `At ${clockLabel(at)}` : `At ${me.place} · ${clockLabel(at)}`;
    pushAlert({ kind: 'checkin', childId: me.id, icon: 'map-pin', color: '#2E8BFF', title: `${me.name.split(' ')[0]} checked in`, body }, at);
  }, [childSelf, live, updateChild, pushAlert]);

  const triggerSOS = useCallback(() => {
    const me = childSelf;
    const at = Date.now();
    setSosActive(true);
    setSosChildId(me.id);
    const body = live ? `Sent at ${clockLabel(at)}` : `Live location shared · near ${me.place}`;
    pushAlert({ kind: 'sos', childId: me.id, icon: 'alert-circle', color: '#FB4A4A', title: `SOS from ${me.name.split(' ')[0]}`, body }, at);
  }, [childSelf, live, pushAlert]);
  const clearSOS = useCallback(() => {
    setSosActive(false);
    setSosChildId(null);
  }, []);

  const completeOnboarding = useCallback(() => {
    setHasOnboarded(true);
    writeKey(ONBOARDED_KEY, '1');
  }, []);
  const resetOnboarding = useCallback(() => {
    setHasOnboarded(false);
    removeKey(ONBOARDED_KEY);
  }, []);

  const wipeToSample = useCallback(() => {
    setLinkedRoleAtStart(null);
    // Drop any save that is still waiting, so the old data cannot be written back after this.
    if (saveTimer.current != null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSave.current = null;
    // A reset that arrives before the first read has finished wins over whatever that read finds.
    if (!hydrated.current) discardStored.current = true;

    setKids(SEED.children);
    setActiveChildId(SEED.activeChildId);
    setRequests(SEED.requests);
    setAlerts(SEED.alerts);
    setPlaces(SEED.places);
    setTasks(SEED.tasks);
    setSchedules(SEED.schedules);
    setMessages(SEED.messages);
    setSites(SEED.sites);
    setSosActive(SEED.sosActive);
    setSosChildId(SEED.sosChildId);
    // The link layer's record goes with the data it described.
    setSyncRecord(undefined);
    storedSync.current = null;
    resolvedIds.current = resolvedRequestIds(SEED.requests);

    // Storage goes back to "nothing saved". Marking the seed as already saved means the re-render
    // caused by this reset schedules a save that turns out to be a no-op; the next real change
    // writes again. Only the demo state is removed: the onboarding flag has its own key.
    savedJson.current = serialiseState(SEED);
    removeKey(STATE_KEY);
  }, []);

  const resetDemoData = useCallback(() => {
    if (liveRef.current) return;
    wipeToSample();
  }, [wipeToSample]);

  const points = tasks.filter((t) => t.done).reduce((s, t) => s + t.points, 0);
  const sosChild = (sosChildId != null ? kids.find((c) => c.id === sosChildId) : undefined) ?? childSelf;
  const sosMine = sosActive && (sosChildId == null || sosChildId === childSelf.id);

  // Every setter below is queued in the same tick, so React commits the whole patch (and the link
  // record) in one render: no screen and no save ever sees half of it. A slice that already says the
  // same thing keeps its array, which is what stops an applied patch from echoing back as a change.
  const applyRemote = useCallback((patch: RemotePatch, record?: unknown, options?: ApplyRemoteOptions) => {
    const basis = options?.basis;
    if (patch.children !== undefined) setKids(takeRemote(patch.children, basis?.children));
    if (patch.requests !== undefined) {
      setRequests(takeRemote(patch.requests, basis?.requests));
      // Answers given on another device count here too. An id is never taken out again: a request
      // this device has answered stays answered here even if the server turns the answer down and
      // the request shows as pending for a moment, so one tap can never grant its bonus twice.
      for (const id of resolvedRequestIds(patch.requests)) resolvedIds.current.add(id);
    }
    if (patch.alerts !== undefined) setAlerts(takeRemote(patch.alerts, basis?.alerts));
    if (patch.places !== undefined) setPlaces(takeRemote(patch.places, basis?.places));
    if (patch.tasks !== undefined) setTasks(takeRemote(patch.tasks, basis?.tasks));
    if (patch.schedules !== undefined) setSchedules(takeRemote(patch.schedules, basis?.schedules));
    if (patch.messages !== undefined) setMessages(takeRemote(patch.messages, basis?.messages));
    if (patch.sites !== undefined) setSites(takeRemote(patch.sites, basis?.sites));
    // The two SOS values: kept as they are when they were changed here after `basis` was taken.
    const sosTouched = basis !== undefined && basis.sosActive !== undefined;
    if (patch.sosActive !== undefined) {
      const next = patch.sosActive;
      setSosActive((prev) => (sosTouched && prev !== basis.sosActive ? prev : next));
    }
    if (patch.sosChildId !== undefined) {
      const next = patch.sosChildId;
      setSosChildId((prev) => (basis !== undefined && basis.sosChildId !== undefined && prev !== basis.sosChildId ? prev : next));
    }
    if (record !== undefined) setSyncRecord(record === null ? undefined : record);
    if (options?.saveNow) saveAtOnce.current = true;
  }, []);

  const readSyncRecord = useCallback(() => storedSync.current, []);

  const value = useMemo<Store>(
    () => ({
      role, setRole, children: kids, activeChildId, setActiveChildId, activeChild, childSelf,
      requests, alerts, places, tasks, points,
      adjustLimit, grantBonus, toggleApp, setAppLimit, pauseDevice, resumeDevice,
      resolveRequest, toggleTask, requestExtraTime, markAlertsRead, togglePlaceAlert,
      addPlace, removePlace, schedules, toggleSchedule, addSchedule, removeSchedule,
      messages, sendMessage, sites, addSite, removeSite, renameChild, addChild, requestUnlock,
      checkIn, sosActive, sosChildId, sosChild, sosMine, triggerSOS, clearSOS, live,
      hasOnboarded, ready, completeOnboarding, resetOnboarding, resetDemoData, wipeToSample,
      syncSnapshot: snapshot, applyRemote, readSyncRecord, setSelfChildId, setLive, linkedRoleAtStart,
    }),
    [role, kids, activeChildId, activeChild, childSelf, requests, alerts, places, tasks, points,
      adjustLimit, grantBonus, toggleApp, setAppLimit, pauseDevice, resumeDevice, resolveRequest,
      toggleTask, requestExtraTime, markAlertsRead, togglePlaceAlert,
      addPlace, removePlace, schedules, toggleSchedule, addSchedule, removeSchedule,
      messages, sendMessage, sites, addSite, removeSite, renameChild, addChild, requestUnlock,
      checkIn, sosActive, sosChildId, sosChild, sosMine, triggerSOS, clearSOS, live,
      hasOnboarded, ready, completeOnboarding, resetOnboarding, resetDemoData, wipeToSample,
      snapshot, applyRemote, readSyncRecord, setRole, setLive, linkedRoleAtStart],
  );

  // The app is mounted only once the saved state is in place. Reading takes a few milliseconds, and
  // without this a screen opened directly (a reloaded web page, a deep link) would draw the seed
  // data first and then jump to the saved data.
  return <Ctx.Provider value={value}>{ready ? node : <HoldScreen />}</Ctx.Provider>;
}

/** Fills the moment before the saved state has been read. On a phone it carries on the splash colour. */
function HoldScreen() {
  const dark = useColorScheme() === 'dark';
  // A web page is blank until its script has run anyway; staying blank one frame longer is calmer
  // than flashing a colour.
  if (Platform.OS === 'web') return null;
  return <View style={{ flex: 1, backgroundColor: dark ? SPLASH_BG.dark : SPLASH_BG.light }} />;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
