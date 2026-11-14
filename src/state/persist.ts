/**
 * Saving and loading the demo state.
 *
 * Everything in this file is pure: no React, no storage. The store hands in the raw string it read
 * and the seed data to fall back on, which keeps these functions testable with plain node.
 */
import type {
  Alert,
  AppCategory,
  ChatMessage,
  Child,
  FamilyRequest,
  ManagedApp,
  Place,
  RewardTask,
  Schedule,
  SiteRule,
} from './store';

/** Bump together with STATE_KEY when a saved slice changes shape. Older saves are then ignored. */
export const STATE_VERSION = 1;
export const STATE_KEY = 'haven.state.v1';

/** The slices that survive a restart. The chosen role and anything transient stay out. */
export interface PersistedState {
  children: Child[];
  activeChildId: string;
  requests: FamilyRequest[];
  alerts: Alert[];
  places: Place[];
  tasks: RewardTask[];
  schedules: Schedule[];
  messages: ChatMessage[];
  sites: SiteRule[];
  sosActive: boolean;
}

export type SliceKey = keyof PersistedState;

/** Fixed order, so the same state always serialises to the same string. */
export const SLICE_KEYS: readonly SliceKey[] = [
  'children',
  'activeChildId',
  'requests',
  'alerts',
  'places',
  'tasks',
  'schedules',
  'messages',
  'sites',
  'sosActive',
];

// --- Small type checks ----------------------------------------------------------------------

type Guard<T> = (v: unknown) => v is T;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
/** Finite only: JSON has no NaN, but a literal such as `1e999` parses to Infinity. */
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isOneOf = <T extends string>(v: unknown, options: readonly T[]): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v);
const isListOf = <T>(v: unknown, item: Guard<T>): v is T[] => Array.isArray(v) && v.every(item);
const isWeekOf = <T>(v: unknown, item: Guard<T>): v is T[] => isListOf(v, item) && v.length === 7;

const APP_CATEGORIES: readonly AppCategory[] = ['social', 'games', 'video', 'education', 'music', 'web', 'messaging', 'creativity'];
const REQUEST_KINDS: readonly FamilyRequest['kind'][] = ['extra_time', 'unlock_app', 'bedtime'];
const REQUEST_STATUSES: readonly FamilyRequest['status'][] = ['pending', 'approved', 'denied'];
const SENDERS: readonly ChatMessage['from'][] = ['parent', 'child'];
const SITE_LISTS: readonly SiteRule['list'][] = ['blocked', 'allowed'];

// --- One check per stored shape -------------------------------------------------------------

export function isManagedApp(v: unknown): v is ManagedApp {
  return (
    isRecord(v) &&
    isId(v.id) &&
    isStr(v.name) &&
    isStr(v.icon) &&
    isStr(v.color) &&
    isOneOf(v.category, APP_CATEGORIES) &&
    isNum(v.usedMin) &&
    (v.limitMin === null || isNum(v.limitMin)) &&
    isBool(v.blocked)
  );
}

/** A child without a valid `apps` list or a seven-day `weekly` is rejected: screens index into both. */
export function isChild(v: unknown): v is Child {
  return (
    isRecord(v) &&
    isId(v.id) &&
    isStr(v.name) &&
    isNum(v.age) &&
    isStr(v.deviceName) &&
    isNum(v.battery) &&
    isBool(v.online) &&
    isBool(v.bedtime) &&
    isNum(v.usedMin) &&
    isNum(v.limitMin) &&
    isStr(v.place) &&
    isStr(v.placeIcon) &&
    isStr(v.updatedAgo) &&
    isListOf(v.apps, isManagedApp) &&
    isWeekOf(v.weekly, isNum)
  );
}

export function isFamilyRequest(v: unknown): v is FamilyRequest {
  return (
    isRecord(v) &&
    isId(v.id) &&
    isId(v.childId) &&
    isOneOf(v.kind, REQUEST_KINDS) &&
    isStr(v.label) &&
    isStr(v.detail) &&
    (v.minutes === undefined || isNum(v.minutes)) &&
    (v.appId === undefined || isStr(v.appId)) &&
    isStr(v.ago) &&
    isOneOf(v.status, REQUEST_STATUSES)
  );
}

export function isAlert(v: unknown): v is Alert {
  return isRecord(v) && isId(v.id) && isStr(v.icon) && isStr(v.color) && isStr(v.title) && isStr(v.body) && isStr(v.ago) && isBool(v.unread);
}

export function isPlace(v: unknown): v is Place {
  return isRecord(v) && isId(v.id) && isStr(v.name) && isStr(v.icon) && isNum(v.radius) && isBool(v.arrive) && isBool(v.leave);
}

export function isRewardTask(v: unknown): v is RewardTask {
  return isRecord(v) && isId(v.id) && isStr(v.title) && isNum(v.points) && isBool(v.done);
}

export function isSchedule(v: unknown): v is Schedule {
  return (
    isRecord(v) &&
    isId(v.id) &&
    isStr(v.name) &&
    isStr(v.icon) &&
    isStr(v.color) &&
    isStr(v.start) &&
    isStr(v.end) &&
    isWeekOf(v.days, isBool) &&
    isBool(v.on)
  );
}

export function isChatMessage(v: unknown): v is ChatMessage {
  return isRecord(v) && isId(v.id) && isId(v.childId) && isOneOf(v.from, SENDERS) && isStr(v.text) && isStr(v.time);
}

export function isSiteRule(v: unknown): v is SiteRule {
  return isRecord(v) && isId(v.id) && isStr(v.host) && isOneOf(v.list, SITE_LISTS);
}

/** The store reads `children[0]` as the child using the child app, so an empty list is not usable. */
const isChildList = (v: unknown): v is Child[] => isListOf(v, isChild) && v.length > 0;
const listOf =
  <T>(item: Guard<T>): Guard<T[]> =>
  (v: unknown): v is T[] =>
    isListOf(v, item);

// --- Save -----------------------------------------------------------------------------------

/** The string written to storage: `{ v, state }` with the slices in a fixed order and nothing else. */
export function serialiseState(state: PersistedState): string {
  const slices: Partial<Record<SliceKey, unknown>> = {};
  for (const key of SLICE_KEYS) slices[key] = state[key];
  return JSON.stringify({ v: STATE_VERSION, state: slices });
}

// --- Load -----------------------------------------------------------------------------------

export interface LoadResult {
  /** Always complete and safe to render: stored slices where they were valid, seed slices elsewhere. */
  state: PersistedState;
  /** `stored`: every slice came from storage. `partial`: some fell back. `seed`: nothing was usable. */
  source: 'stored' | 'partial' | 'seed';
  /** The slices that fell back to the seed (all of them when `source` is `seed`). */
  fallbacks: SliceKey[];
  /** Why nothing at all could be used. Only set when the whole save was unreadable. */
  reason?: 'empty' | 'corrupt' | 'version';
}

function fromSeed(seed: PersistedState, reason: NonNullable<LoadResult['reason']>): LoadResult {
  return { state: seed, source: 'seed', fallbacks: [...SLICE_KEYS], reason };
}

/**
 * Turns whatever was read from storage into a state that is safe to render. Never throws.
 *
 * - nothing stored, invalid JSON, a different version or a wrong outer shape: the seed, untouched;
 * - a slice that is missing, has the wrong type or holds one malformed item: the seed for that slice;
 * - an `activeChildId` that matches no child: the seed's id, or the first child.
 *
 * A slice that falls back is the seed's own array, so setting it into React state changes nothing.
 */
export function loadState(raw: string | null | undefined, seed: PersistedState): LoadResult {
  if (raw == null || raw === '') return fromSeed(seed, 'empty');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fromSeed(seed, 'corrupt');
  }
  if (!isRecord(parsed)) return fromSeed(seed, 'corrupt');
  if (parsed.v !== STATE_VERSION) return fromSeed(seed, 'version');
  const stored = parsed.state;
  if (!isRecord(stored)) return fromSeed(seed, 'corrupt');

  const fallbacks: SliceKey[] = [];
  const slice = <T>(key: SliceKey, valid: Guard<T>, fallback: T): T => {
    const value = stored[key];
    if (valid(value)) return value;
    fallbacks.push(key);
    return fallback;
  };

  const children = slice('children', isChildList, seed.children);
  let activeChildId = slice('activeChildId', isId, seed.activeChildId);
  if (!children.some((c) => c.id === activeChildId)) {
    if (!fallbacks.includes('activeChildId')) fallbacks.push('activeChildId');
    activeChildId = children.some((c) => c.id === seed.activeChildId) ? seed.activeChildId : children[0].id;
  }

  const state: PersistedState = {
    children,
    activeChildId,
    requests: slice('requests', listOf(isFamilyRequest), seed.requests),
    alerts: slice('alerts', listOf(isAlert), seed.alerts),
    places: slice('places', listOf(isPlace), seed.places),
    tasks: slice('tasks', listOf(isRewardTask), seed.tasks),
    schedules: slice('schedules', listOf(isSchedule), seed.schedules),
    messages: slice('messages', listOf(isChatMessage), seed.messages),
    sites: slice('sites', listOf(isSiteRule), seed.sites),
    sosActive: slice('sosActive', isBool, seed.sosActive),
  };

  if (fallbacks.length === 0) return { state, source: 'stored', fallbacks };
  if (fallbacks.length === SLICE_KEYS.length) return fromSeed(seed, 'corrupt');
  return { state, source: 'partial', fallbacks };
}

/**
 * Ids of the requests that are already answered. The store keeps this set next to its state to
 * refuse a second answer, so it has to be rebuilt whenever the requests are replaced wholesale.
 */
export function resolvedRequestIds(requests: readonly FamilyRequest[]): Set<string> {
  return new Set(requests.filter((r) => r.status !== 'pending').map((r) => r.id));
}
