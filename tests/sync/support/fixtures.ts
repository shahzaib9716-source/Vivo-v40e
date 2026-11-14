/** Items and contexts the cases and the model share. Nothing here touches the real store module. */
import type { Alert, ChatMessage, Child, FamilyRequest, ManagedApp, Place, RewardTask, Schedule, SiteRule } from '@/state/store';
import type { Role, SyncCtx } from '@/sync/schema';

export const FAMILY = 'fam1';

/** Stands for firebase's serverTimestamp() in the unit cases. */
export const TS: { readonly ts: true } = Object.freeze({ ts: true as const });

export function ctxOf(role: Role, childId: string | null = null, overrides: Partial<SyncCtx> = {}): SyncCtx {
  return {
    familyId: FAMILY,
    uid: role === 'parent' ? 'uid-parent' : `uid-${childId ?? 'child'}`,
    role,
    childId: role === 'child' ? childId : null,
    serverTimestamp: TS,
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

export const apps = (): ManagedApp[] => [
  { id: 'a1', name: 'Streamly', icon: 'play-circle', color: '#FF3B30', category: 'video', usedMin: 62, limitMin: 90, blocked: false },
  { id: 'a2', name: 'Chatter', icon: 'message-text', color: '#22C55E', category: 'messaging', usedMin: 40, limitMin: null, blocked: false },
  { id: 'a3', name: 'Voxel Arena', icon: 'gamepad-variant', color: '#12B5A6', category: 'games', usedMin: 15, limitMin: 30, blocked: true },
];

export const child = (id: string, over: Partial<Child> = {}): Child => ({
  id,
  name: `Kid ${id}`,
  age: 10,
  deviceName: '',
  battery: 72,
  online: true,
  bedtime: false,
  usedMin: 100,
  limitMin: 240,
  place: 'School',
  placeIcon: 'school',
  updatedAgo: 'never',
  apps: apps(),
  weekly: [180, 210, 160, 240, 168, 95, 120],
  ...over,
});

export const request = (id: string, childId: string, over: Partial<FamilyRequest> = {}): FamilyRequest => ({
  id,
  childId,
  kind: 'extra_time',
  label: '30 more minutes',
  detail: 'You asked for extra screen time',
  minutes: 30,
  ago: 'just now',
  at: 1000,
  status: 'pending',
  ...over,
});

export const message = (id: string, childId: string, from: 'parent' | 'child', over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  childId,
  from,
  text: `hello ${id}`,
  time: '3:00 PM',
  at: 1000,
  ...over,
});

export const alert = (id: string, over: Partial<Alert> = {}): Alert => ({
  id,
  kind: 'checkin',
  childId: 'c1',
  icon: 'map-pin',
  color: '#2E8BFF',
  title: 'Kid checked in',
  body: 'At 3:00 PM',
  ago: 'now',
  unread: true,
  at: 1000,
  ...over,
});

export const place = (id: string, over: Partial<Place> = {}): Place => ({ id, name: `Place ${id}`, icon: 'home', radius: 150, arrive: true, leave: true, ...over });

export const schedule = (id: string, over: Partial<Schedule> = {}): Schedule => ({
  id,
  name: `Schedule ${id}`,
  icon: 'moon',
  color: '#5B51E0',
  start: '9:00 PM',
  end: '7:00 AM',
  days: [true, true, true, true, true, false, false],
  on: true,
  ...over,
});

export const site = (id: string, over: Partial<SiteRule> = {}): SiteRule => ({ id, host: `${id}.example`, list: 'blocked', ...over });

export const task = (id: string, over: Partial<RewardTask> = {}): RewardTask => ({ id, title: `Task ${id}`, points: 10, done: false, ...over });

export const mapOf = <T extends { id: string }>(...items: T[]): Map<string, T> => new Map(items.map((item) => [item.id, item]));
