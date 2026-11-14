import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AppState, Platform, View, useColorScheme } from 'react-native';

import { APP_VARIANT, SPLASH_BG } from '@/config/variant';
import { loadState, resolvedRequestIds, serialiseState, STATE_KEY, type PersistedState } from './persist';
import { readKey, removeKey, writeKey } from './storage';

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
  updatedAgo: string;
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
  ago: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface Alert {
  id: string;
  icon: string;
  color: string;
  title: string;
  body: string;
  ago: string;
  unread: boolean;
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
  time: string;
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
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

const ONBOARDED_KEY = 'haven.onboarded';

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
};

/** How long the state has to stay unchanged before it is written to storage. */
const SAVE_DELAY_MS = 400;

export type Role = 'parent' | 'child' | null;

interface Store {
  role: Role;
  setRole: (r: Role) => void;
  children: Child[];
  activeChildId: string;
  setActiveChildId: (id: string) => void;
  activeChild: Child;
  childSelf: Child; // the child viewing the child-app
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
  requestUnlock: (appId: string) => void;
  checkIn: () => void;
  sosActive: boolean;
  triggerSOS: () => void;
  clearSOS: () => void;
  hasOnboarded: boolean;
  /**
   * False until both saved values have been read: the "has seen the introduction" flag and the
   * demo state. Screens are only mounted once it is true, so they never see seed data first.
   */
  ready: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  /** Puts every piece of demo data back to its starting state and forgets the saved copy. Keeps the onboarding flag. */
  resetDemoData: () => void;
  /** The saved slices as one object. The link layer (src/sync) watches this to send changes. */
  syncSnapshot: PersistedState;
  /** Replaces the given slices with values that arrived from a linked device. */
  applyRemote: (patch: Partial<Omit<PersistedState, 'activeChildId'>>) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children: node }: { children: ReactNode }) {
  // A parent-only or child-only build knows its side from the start, so a deep link or a web
  // reload that skips the welcome screen still has the right role.
  const [role, setRole] = useState<Role>(APP_VARIANT);
  const [kids, setKids] = useState<Child[]>(SEED.children);
  const [activeChildId, setActiveChildId] = useState(SEED.activeChildId);
  const [requests, setRequests] = useState<FamilyRequest[]>(SEED.requests);
  const [alerts, setAlerts] = useState<Alert[]>(SEED.alerts);
  const [places, setPlaces] = useState<Place[]>(SEED.places);
  const [tasks, setTasks] = useState<RewardTask[]>(SEED.tasks);
  const [schedules, setSchedules] = useState<Schedule[]>(SEED.schedules);
  const [messages, setMessages] = useState<ChatMessage[]>(SEED.messages);
  const [sites, setSites] = useState<SiteRule[]>(SEED.sites);
  const [sosActive, setSosActive] = useState(SEED.sosActive);
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
  /** The newest state that still has to be written, or null when there is nothing to write. */
  const pendingSave = useRef<PersistedState | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    Promise.all([readKey(ONBOARDED_KEY), readKey(STATE_KEY)]).then(([flag, raw]) => {
      if (!alive) return;
      if (flag === '1') setHasOnboarded(true);
      if (!discardStored.current) {
        // Anything unreadable falls back to the seed, slice by slice. A slice that falls back is
        // the seed array itself, so setting it is a no-op. loadState does not throw; the catch
        // only makes sure a surprise here can never leave the app stuck before `ready`.
        let state = SEED;
        try {
          state = loadState(raw, SEED).state;
        } catch {
          state = SEED;
        }
        // "now" and "just now" were true when they were saved. After a restart they are not.
        if (state.alerts.some((a) => a.ago === 'now')) {
          state = { ...state, alerts: state.alerts.map((a) => (a.ago === 'now' ? { ...a, ago: 'earlier' } : a)) };
        }
        if (state.requests.some((r) => r.ago === 'just now')) {
          state = { ...state, requests: state.requests.map((r) => (r.ago === 'just now' ? { ...r, ago: 'earlier' } : r)) };
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
        resolvedIds.current = resolvedRequestIds(state.requests);
        savedJson.current = serialiseState(state);
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
    const json = serialiseState(next);
    if (json === savedJson.current) return;
    savedJson.current = json;
    writeKey(STATE_KEY, json).then((ok) => {
      // A failed write is forgotten, so the next change tries again.
      if (!ok && savedJson.current === json) savedJson.current = null;
    });
  }, []);

  const snapshot = useMemo<PersistedState>(
    () => ({ children: kids, activeChildId, requests, alerts, places, tasks, schedules, messages, sites, sosActive }),
    [kids, activeChildId, requests, alerts, places, tasks, schedules, messages, sites, sosActive],
  );

  // Save on change, debounced. Nothing is scheduled until the stored state has been read, so the
  // seed can never overwrite a saved copy during startup. The cleanup only stops the timer: the
  // pending state stays, to be replaced by a newer one or flushed below.
  useEffect(() => {
    if (!ready) return;
    pendingSave.current = snapshot;
    saveTimer.current = setTimeout(flushSave, SAVE_DELAY_MS);
    return () => {
      if (saveTimer.current != null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [snapshot, ready, flushSave]);

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

  const adjustLimit = useCallback((id: string, delta: number) => {
    updateChild(id, (c) => ({ ...c, limitMin: Math.max(0, c.limitMin + delta) }));
  }, [updateChild]);

  const grantBonus = useCallback((id: string, min: number) => {
    updateChild(id, (c) => ({ ...c, limitMin: c.limitMin + min, bedtime: false }));
  }, [updateChild]);

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

  const requestExtraTime = useCallback((minutes: number) => {
    setRequests((prev) => [
      { id: 'r' + Date.now(), kind: 'extra_time', childId: 'c1', label: `${minutes} more minutes`, detail: 'You asked for extra screen time', minutes, ago: 'just now', status: 'pending' } as FamilyRequest,
      ...prev,
    ]);
  }, []);

  const markAlertsRead = useCallback(() => setAlerts((prev) => prev.map((a) => ({ ...a, unread: false }))), []);

  const togglePlaceAlert = useCallback((placeId: string, which: 'arrive' | 'leave') => {
    setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, [which]: !p[which] } : p)));
  }, []);

  const pushAlert = useCallback((a: Omit<Alert, 'id' | 'ago' | 'unread'>) => {
    setAlerts((prev) => [{ ...a, id: 'n' + Date.now(), ago: 'now', unread: true }, ...prev]);
  }, []);

  const addPlace = useCallback((p: Omit<Place, 'id'>) => {
    setPlaces((prev) => [...prev, { ...p, id: 'p' + Date.now() }]);
  }, []);
  const removePlace = useCallback((id: string) => setPlaces((prev) => prev.filter((p) => p.id !== id)), []);

  const toggleSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
  }, []);
  const addSchedule = useCallback((sc: Omit<Schedule, 'id'>) => {
    setSchedules((prev) => [...prev, { ...sc, id: 's' + Date.now() }]);
  }, []);
  const removeSchedule = useCallback((id: string) => setSchedules((prev) => prev.filter((x) => x.id !== id)), []);

  const sendMessage = useCallback((childId: string, from: 'parent' | 'child', text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setMessages((prev) => [...prev, { id: 'm' + Date.now(), childId, from, text: clean, time: nowLabel() }]);
  }, []);

  const addSite = useCallback((host: string, list: 'blocked' | 'allowed') => {
    const clean = host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!clean) return;
    setSites((prev) => (prev.some((x) => x.host === clean && x.list === list) ? prev : [...prev, { id: 'w' + Date.now(), host: clean, list }]));
  }, []);
  const removeSite = useCallback((id: string) => setSites((prev) => prev.filter((x) => x.id !== id)), []);

  const renameChild = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    updateChild(id, (c) => ({ ...c, name: clean }));
  }, [updateChild]);

  const requestUnlock = useCallback((appId: string) => {
    const app = kids[0].apps.find((a) => a.id === appId);
    if (!app) return;
    setRequests((prev) => [
      { id: 'r' + Date.now(), childId: 'c1', kind: 'unlock_app', label: `Unlock ${app.name}`, detail: 'You asked to unlock an app', appId, ago: 'just now', status: 'pending' },
      ...prev,
    ]);
  }, [kids]);

  const checkIn = useCallback(() => {
    const me = kids[0];
    updateChild(me.id, (c) => ({ ...c, updatedAgo: 'just now' }));
    pushAlert({ icon: 'map-pin', color: '#2E8BFF', title: `${me.name.split(' ')[0]} checked in`, body: `At ${me.place} · ${nowLabel()}` });
  }, [kids, updateChild, pushAlert]);

  const triggerSOS = useCallback(() => {
    const me = kids[0];
    setSosActive(true);
    pushAlert({ icon: 'alert-circle', color: '#FB4A4A', title: `SOS from ${me.name.split(' ')[0]}`, body: `Live location shared · near ${me.place}` });
  }, [kids, pushAlert]);
  const clearSOS = useCallback(() => setSosActive(false), []);

  const completeOnboarding = useCallback(() => {
    setHasOnboarded(true);
    writeKey(ONBOARDED_KEY, '1');
  }, []);
  const resetOnboarding = useCallback(() => {
    setHasOnboarded(false);
    removeKey(ONBOARDED_KEY);
  }, []);

  const resetDemoData = useCallback(() => {
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
    resolvedIds.current = resolvedRequestIds(SEED.requests);

    // Storage goes back to "nothing saved". Marking the seed as already saved means the re-render
    // caused by this reset schedules a save that turns out to be a no-op; the next real change
    // writes again. Only the demo state is removed: the onboarding flag has its own key.
    savedJson.current = serialiseState(SEED);
    removeKey(STATE_KEY);
  }, []);

  const activeChild = kids.find((c) => c.id === activeChildId) ?? kids[0];
  const childSelf = kids[0];
  const points = tasks.filter((t) => t.done).reduce((s, t) => s + t.points, 0);

  const applyRemote = useCallback((patch: Partial<Omit<PersistedState, 'activeChildId'>>) => {
    if (patch.children !== undefined && patch.children.length > 0) setKids(patch.children);
    if (patch.requests !== undefined) {
      setRequests(patch.requests);
      // Answers given on the other device count here too.
      resolvedIds.current = resolvedRequestIds(patch.requests);
    }
    if (patch.alerts !== undefined) setAlerts(patch.alerts);
    if (patch.places !== undefined) setPlaces(patch.places);
    if (patch.tasks !== undefined) setTasks(patch.tasks);
    if (patch.schedules !== undefined) setSchedules(patch.schedules);
    if (patch.messages !== undefined) setMessages(patch.messages);
    if (patch.sites !== undefined) setSites(patch.sites);
    if (patch.sosActive !== undefined) setSosActive(patch.sosActive);
  }, []);

  const value = useMemo<Store>(
    () => ({
      role, setRole, children: kids, activeChildId, setActiveChildId, activeChild, childSelf,
      requests, alerts, places, tasks, points,
      adjustLimit, grantBonus, toggleApp, setAppLimit, pauseDevice, resumeDevice,
      resolveRequest, toggleTask, requestExtraTime, markAlertsRead, togglePlaceAlert,
      addPlace, removePlace, schedules, toggleSchedule, addSchedule, removeSchedule,
      messages, sendMessage, sites, addSite, removeSite, renameChild, requestUnlock,
      checkIn, sosActive, triggerSOS, clearSOS, hasOnboarded, ready, completeOnboarding, resetOnboarding, resetDemoData,
      syncSnapshot: snapshot, applyRemote,
    }),
    [role, kids, activeChildId, activeChild, childSelf, requests, alerts, places, tasks, points,
      adjustLimit, grantBonus, toggleApp, setAppLimit, pauseDevice, resumeDevice, resolveRequest,
      toggleTask, requestExtraTime, markAlertsRead, togglePlaceAlert,
      addPlace, removePlace, schedules, toggleSchedule, addSchedule, removeSchedule,
      messages, sendMessage, sites, addSite, removeSite, renameChild, requestUnlock,
      checkIn, sosActive, triggerSOS, clearSOS, hasOnboarded, ready, completeOnboarding, resetOnboarding, resetDemoData,
      snapshot, applyRemote],
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
