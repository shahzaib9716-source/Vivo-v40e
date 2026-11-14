/**
 * A family in the model: one fake server and two to four phones, plus the bookkeeping the checks
 * need (what people added and removed, how many writes their actions may cost).
 */
import type { Assert } from '../support/assert';
import { apps } from '../support/fixtures';
import { SCHEMA, SOS, STATUS, type ListSlice, type ListSpec, type SliceItems } from '@/sync/schema';
import { randomAction, type Added, type Outcome } from './actions';
import { makeDevice, type Device, type LocalState } from './device';
import { makeRng, type Rng } from './prng';
import type { Limits } from './sdk';
import { makeServer, type Data, type Server } from './server';

export interface WorldOptions {
  seed: number;
  /** Child profiles in the family at the start: 1 or 2. */
  children?: 1 | 2;
  /** Child phones. With two phones and `sameChild`, both are enrolled as the first child. */
  childDevices?: 1 | 2;
  sameChild?: boolean;
  secondParent?: boolean;
  /** Listener bounds, smaller than the real ones so that the windows actually move. */
  limits?: Limits;
  /** Device clocks differ from the server's by up to this many milliseconds. */
  maxSkew?: number;
  /** Devices save as soon as something was confirmed or adopted (see DeviceOptions.promptSaves). */
  promptSaves?: boolean;
  /** Devices read a document from the server when a write to it was refused (see SdkOptions.refetchOnRefusal). */
  refetchOnRefusal?: boolean;
  /** Called with one line per event, for looking into a failing seed. */
  trace?: (line: string) => void;
}

interface LedgerAdd extends Added {
  device: Device;
  /** Saved on the device that made it, or stored by the server: a kill can no longer lose it. */
  durable: boolean;
  /** The device was killed before the item was saved or sent. Nobody can be blamed for its loss. */
  lost: boolean;
}

export interface World {
  readonly server: Server;
  readonly devices: Device[];
  readonly parent: Device;
  readonly parent2: Device | null;
  readonly kids: Device[];
  readonly rng: Rng;
  readonly childIds: string[];
  /** The most writes all actions so far may have cost. */
  budget(): number;
  /**
   * Creates that were sent a second time after a kill and brought a deleted item back. This is the
   * one case no device can tell apart: its last save says "I made this and do not know whether it
   * arrived", and the server no longer has it. See `checkAlways`.
   */
  resent(): number;
  writes(): number;
  /** A tap: `outcome` from ./actions applied to the device's store. The engine has not run yet. */
  apply(device: Device, outcome: Outcome | null): boolean;
  /** A random tap on a device that is allowed to act. */
  tap(device: Device): boolean;
  save(device: Device): void;
  kill(device: Device): void;
  /**
   * Everything is delivered, sent and answered until nothing moves. All devices go online first.
   * With `only`, just those devices are driven and nobody's connection is touched: the others
   * stay exactly as they are (closed, offline, behind).
   */
  settle(only?: Device[]): void;
  /** One random event somewhere: a tap, a snapshot, a send, an answer, a save, a kill, a dropped connection. */
  randomEvent(chaos: { kills: boolean; offline: boolean }): void;
  /** The checks that must hold at any moment. */
  checkAlways(t: Assert): void;
  /** The checks that must hold once the system has come to rest. */
  checkSettled(t: Assert): void;
}

const SAMPLE: () => LocalState = () => ({
  children: [
    { id: 'sample-c1', name: 'Mia Carter', age: 11, deviceName: "Mia's Tablet", battery: 72, online: true, bedtime: false, usedMin: 168, limitMin: 240, place: 'School', placeIcon: 'school', updatedAgo: '2m ago', apps: apps(), weekly: [180, 210, 160, 240, 168, 95, 120] },
    { id: 'sample-c2', name: 'Leo Carter', age: 8, deviceName: "Leo's Phone", battery: 44, online: true, bedtime: false, usedMin: 96, limitMin: 150, place: 'Home', placeIcon: 'home', updatedAgo: 'just now', apps: apps(), weekly: [120, 90, 150, 110, 96, 60, 140] },
  ],
  requests: [{ id: 'sample-r1', childId: 'sample-c1', kind: 'extra_time', label: '30 more minutes', detail: 'Mia asked for extra screen time', minutes: 30, ago: '5m ago', status: 'pending' }],
  messages: [{ id: 'sample-m1', childId: 'sample-c1', from: 'parent', text: 'Have a great day at school!', time: '8:10 AM' }],
  alerts: [{ id: 'sample-n1', icon: 'map-pin', color: '#2E8BFF', title: 'Mia arrived at School', body: 'Geofence', ago: '1h', unread: true }],
  places: [{ id: 'sample-p1', name: 'Home', icon: 'home', radius: 150, arrive: true, leave: true }],
  schedules: [{ id: 'sample-s1', name: 'Bedtime', icon: 'moon', color: '#5B51E0', start: '9:00 PM', end: '7:00 AM', days: [true, true, true, true, true, true, true], on: true }],
  sites: [{ id: 'sample-w1', host: 'chatroulette.example', list: 'blocked' }],
  tasks: [{ id: 'sample-t1', title: 'Finish homework', points: 20, done: true }],
  sosActive: false,
  sosChildId: null,
});

export function makeWorld(options: WorldOptions): World {
  const rng = makeRng(options.seed);
  const server = makeServer('fam1');
  const root = `families/${server.familyId}`;
  const childIds = options.children === 2 ? ['kidA', 'kidB'] : ['kidA'];

  // The family as its creation leaves it: the children, the starting rules, nothing else.
  childIds.forEach((id, index) => {
    server.seed(`${root}/children/${id}`, { name: index === 0 ? 'Zoe' : 'Ben', age: 10 - index, deviceName: '', battery: 72, online: true, bedtime: false, usedMin: 100, limitMin: 240, place: 'School', placeIcon: 'school', apps: apps(), weekly: [180, 210, 160, 240, 168, 95, 120], ord: index });
  });
  server.seed(`${root}/places/pl1`, { name: 'Home', icon: 'home', radius: 150, arrive: true, leave: true, ord: 0 });
  server.seed(`${root}/places/pl2`, { name: 'School', icon: 'school', radius: 200, arrive: true, leave: false, ord: 1 });
  server.seed(`${root}/schedules/sc1`, { name: 'Bedtime', icon: 'moon', color: '#5B51E0', start: '9:00 PM', end: '7:00 AM', days: [true, true, true, true, true, true, true], on: true, ord: 0 });
  server.seed(`${root}/tasks/tk1`, { title: 'Finish homework', points: 20, done: false, ord: 0 });
  server.seed(`${root}/tasks/tk2`, { title: 'Tidy your room', points: 15, done: false, ord: 1 });

  const skew = () => (options.maxSkew ? rng.int(2 * options.maxSkew) - options.maxSkew : 0);
  const devices: Device[] = [];
  const add = (name: string, role: 'parent' | 'child', childId: string | null) => {
    const uid = `uid-${name}`;
    server.members.set(uid, { role, childId });
    const device = makeDevice(server, { name, uid, role, childId, skew: skew(), limits: options.limits, local: SAMPLE(), keepAlerts: options.limits?.alerts, promptSaves: options.promptSaves, refetchOnRefusal: options.refetchOnRefusal });
    devices.push(device);
    return device;
  };
  const parent = add('parent', 'parent', null);
  const parent2 = options.secondParent ? add('parent2', 'parent', null) : null;
  const kids: Device[] = [add('child1', 'child', childIds[0])];
  if (options.childDevices === 2) kids.push(add('child2', 'child', options.sameChild ? childIds[0] : childIds[childIds.length - 1]));

  const ledger: LedgerAdd[] = [];
  const removed = new Set<string>();
  /** Removed locally by somebody who may not delete it on the server, or given a value that cannot be sent. */
  const cancelled = new Set<string>();
  let budget = 0;
  /** Per device: request id -> the answer it has shown since it last started. */
  const answers = new Map<Device, Map<string, string>>(devices.map((d) => [d, new Map()]));
  /** Per device: the requests it has answered since it last started. */
  const answered = new Map<Device, Set<string>>(devices.map((d) => [d, new Set()]));

  const markDurable = (device: Device) => {
    for (const entry of ledger) {
      if (entry.device !== device || entry.durable) continue;
      const saved = (device.disk().local[entry.slice] as readonly { id: string }[]).some((item) => item.id === entry.id);
      if (saved || server.get(entry.path) !== null) entry.durable = true;
    }
  };

  const trace = options.trace ?? (() => {});

  function apply(device: Device, outcome: Outcome | null): boolean {
    if (!outcome) return false;
    trace(`${device.name} tap ${outcome.name}`);
    device.act(outcome.next);
    budget += outcome.maxWrites;
    for (const item of outcome.added ?? []) ledger.push({ ...item, device, durable: false, lost: false });
    for (const path of outcome.removed ?? []) removed.add(path);
    for (const path of outcome.cancelled ?? []) cancelled.add(path);
    if (outcome.answered) answered.get(device)?.add(outcome.answered);
    return true;
  }

  const tap = (device: Device) =>
    device.settledIn() ? apply(device, randomAction({ local: device.local(), ctx: device.ctx, now: device.now, rng, answered: answered.get(device) as Set<string> })) : false;

  function save(device: Device) {
    trace(`${device.name} save`);
    device.save();
    markDurable(device);
  }

  function kill(device: Device) {
    for (const entry of ledger) {
      if (entry.device !== device || entry.durable) continue;
      const saved = (device.disk().local[entry.slice] as readonly { id: string }[]).some((item) => item.id === entry.id);
      if (saved || server.get(entry.path) !== null) entry.durable = true;
      else entry.lost = true;
    }
    answers.get(device)?.clear();
    answered.get(device)?.clear();
    trace(`${device.name} kill`);
    device.kill();
  }

  function settle(only?: Device[]) {
    if (!only) for (const device of devices) device.setOnline(true);
    for (let round = 0; round < 400; round++) {
      let moved = false;
      for (const device of only ?? devices) {
        if (device.dirty()) {
          device.run();
          moved = true;
        }
        const sdk = device.sdk();
        if (sdk.flushLocal()) moved = true;
        while (device.sdk().sendNext()) moved = true;
        while (device.sdk().ackNext()) moved = true;
        if (device.sdk().capture()) moved = true;
        while (device.sdk().deliver()) moved = true;
        if (device.sdk().flushLocal()) moved = true;
      }
      if (!moved) return;
    }
    throw new Error('the system does not come to rest');
  }

  function randomEvent(chaos: { kills: boolean; offline: boolean }) {
    const device = rng.pick(devices);
    const sdk = device.sdk();
    const roll = rng.next() * 100;
    if (roll < 26) {
      // A tap. Most of the time the engine reacts straight away, as an effect would.
      if (tap(device) && rng.chance(0.7)) {
        trace(`${device.name} engine`);
        device.run();
      }
    } else if (roll < 36) {
      if (device.dirty()) {
        trace(`${device.name} engine`);
        device.run();
      }
    } else if (roll < 44) {
      if (sdk.flushLocal()) trace(`${device.name} local events`);
    } else if (roll < 57) {
      if (sdk.sendNext()) trace(`${device.name} sent a write`);
    } else if (roll < 69) {
      if (sdk.ackNext()) trace(`${device.name} got an answer`);
    } else if (roll < 79) {
      const keys = sdk.keys();
      const key = rng.chance(0.5) && keys.length > 0 ? rng.pick(keys) : undefined;
      if (sdk.capture(key)) trace(`${device.name} snapshot taken ${key ?? '(all)'}`);
    } else if (roll < 91) {
      const keys = sdk.keys();
      const key = rng.chance(0.6) && keys.length > 0 ? rng.pick(keys) : undefined;
      if (sdk.deliver(key)) trace(`${device.name} snapshot delivered ${key ?? '(all)'}`);
    } else if (roll < 95) {
      save(device);
    } else if (roll < 97) {
      server.tick(rng.int(120_000));
    } else if (roll < 98.5) {
      if (chaos.offline) {
        trace(`${device.name} ${sdk.isOnline() ? 'offline' : 'online'}`);
        device.setOnline(!sdk.isOnline());
      }
    } else if (chaos.kills) {
      kill(device);
    }
  }

  // ---- What the server's data looks like on a given phone -------------------------------------

  const decoded = <K extends ListSlice>(device: Device, slice: K, childId?: string): SliceItems[K][] => {
    const spec = SCHEMA[slice];
    const out: SliceItems[K][] = [];
    for (const doc of server.list(spec.collectionPath(server.familyId, childId))) {
      const item = spec.fromDoc(doc.id, doc.data, device.ctx, childId);
      if (item) out.push(item);
    }
    return out;
  };
  const ordOf = (slice: ListSlice, id: string) => (server.get(SCHEMA[slice].docPath(server.familyId, id)) as Data).ord as number;
  const byOrd = <T extends { id: string }>(slice: ListSlice, items: T[]) => [...items].sort((a, b) => ordOf(slice, a.id) - ordOf(slice, b.id) || (a.id < b.id ? -1 : 1));
  const at = (item: { at?: number }) => item.at ?? 0;
  const newest = <T extends { id: string; at?: number }>(items: T[], limit: number | null) => {
    const sorted = [...items].sort((a, b) => at(b) - at(a));
    return limit == null ? sorted : sorted.slice(0, limit);
  };
  const limitOf = (slice: ListSlice) => options.limits?.[slice] ?? SCHEMA[slice].query.limit;

  function expected(device: Device): LocalState {
    const mine = device.role === 'child' ? [device.ctx.childId as string] : decoded(device, 'children').map((c) => c.id);
    const children = byOrd('children', decoded(device, 'children').filter((c) => mine.includes(c.id))).map((c) => {
      const status = STATUS.fromDoc(server.get(STATUS.path(server.familyId, c.id)));
      return status && status.checkInAt !== null ? { ...c, checkInAt: status.checkInAt } : c;
    });
    const requests = mine.flatMap((id) => newest(decoded(device, 'requests', id), limitOf('requests'))).sort((a, b) => at(b) - at(a));
    const messages = mine.flatMap((id) => newest(decoded(device, 'messages', id), limitOf('messages'))).sort((a, b) => at(a) - at(b));
    const sos = SOS.toLocal(SOS.fromDoc(server.get(SOS.path(server.familyId))));
    return {
      children,
      requests,
      messages,
      alerts: device.role === 'parent' ? newest(decoded(device, 'alerts'), limitOf('alerts')) : [],
      places: byOrd('places', decoded(device, 'places')),
      schedules: byOrd('schedules', decoded(device, 'schedules')),
      sites: byOrd('sites', decoded(device, 'sites')),
      tasks: byOrd('tasks', decoded(device, 'tasks')),
      sosActive: sos.sosActive,
      sosChildId: sos.sosChildId,
    };
  }

  /** The part of an item two phones have to agree on: the stored fields, the child, the time. */
  const comparable = (slice: ListSlice, item: object): Data => {
    const spec = SCHEMA[slice] as unknown as ListSpec;
    const source = item as Data;
    const out: Data = { id: source.id };
    for (const field of spec.fields) if (source[field] !== undefined) out[field] = source[field];
    if (spec.scope === 'child') out.childId = source.childId;
    if ('at' in spec.doc) out.at = source.at;
    if (slice === 'children' && source.checkInAt !== undefined) out.checkInAt = source.checkInAt;
    return JSON.parse(JSON.stringify(out)) as Data;
  };

  const LISTS: ListSlice[] = ['children', 'requests', 'messages', 'alerts', 'places', 'schedules', 'sites', 'tasks'];
  /** How much of the server's log and of each device's refusals has been looked at already. */
  let logSeen = 0;
  let resurrectedSeen = 0;
  let resent = 0;
  const refusalsSeen = new Map<Device, number>();

  /**
   * Nothing that was deleted comes back, with one exception that cannot be closed without the
   * server remembering deletions: a phone is killed while its last save still lists an item as
   * "made here, not confirmed yet" although the server had it; the item is deleted by somebody
   * else; the phone starts again and, exactly as it must for an item that never arrived, sends it.
   * Anything else that brings a deleted document back is a bug: a phone that did not make the item,
   * or one whose save knew the server had it.
   */
  function checkResurrected(t: Assert) {
    for (; resurrectedSeen < server.resurrected.length; resurrectedSeen++) {
      const { path, uid } = server.resurrected[resurrectedSeen];
      const device = devices.find((d) => d.ctx.uid === uid) as Device;
      const id = path.slice(path.lastIndexOf('/') + 1);
      const from = device.startedFrom();
      const made = ledger.some((entry) => entry.path === path && entry.device === device);
      const savedLocally = LISTS.some((slice) => (from.local[slice] as readonly { id: string }[]).some((item) => item.id === id));
      const savedAsConfirmed = Object.values(from.record.lists).some((list) => list.confirmed.some((item) => item.id === id));
      t.ok(made && savedLocally && !savedAsConfirmed, `${device.name} brought back ${path}, which had been deleted (made it: ${made}, in its save: ${savedLocally}, saved as confirmed: ${savedAsConfirmed})`);
      resent += 1;
    }
  }

  function checkAlways(t: Assert) {
    checkResurrected(t);
    for (const device of devices) {
      const refused = device.stats.refused;
      for (let i = refusalsSeen.get(device) ?? 0; i < refused.length; i++) {
        const refusal = refused[i];
        t.equal(refusal.result.kind, 'state', `${device.name} sent a write the server refused for its ${refusal.result.kind}: ${refusal.write.op} ${refusal.write.path} (${refusal.result.reason})`);
      }
      refusalsSeen.set(device, refused.length);
      // An answer, once shown, is never taken back to "pending" (a kill starts a new life, and so
      // does a request that was removed: if it ever shows again it is a new document).
      const shown = answers.get(device) as Map<string, string>;
      if (device.dirty()) continue;
      const present = new Set(device.local().requests.map((r) => r.id));
      for (const id of [...shown.keys()]) if (!present.has(id)) shown.delete(id);
      for (const request of device.local().requests) {
        if (!device.ready(device.role === 'child' ? `requests:${device.ctx.childId}` : `requests:${request.childId}`)) continue;
        // (When a refused answer is not followed by a read from the server, the phone falls back to
        // its last snapshot, which may still say pending for a moment. That case is left out here.)
        const before = shown.get(request.id);
        if (options.refetchOnRefusal && before && before !== 'pending') t.notEqual(request.status, 'pending', `${device.name}: the answer to ${request.id} went back to pending`);
        shown.set(request.id, request.status);
        // What the server has confirmed as answered is shown as answered.
        const confirmed = device.confirmed('requests', request.id) as { status?: string } | undefined;
        if (confirmed && confirmed.status !== 'pending' && device.settledIn()) {
          t.equal(request.status, confirmed.status, `${device.name}: ${request.id} is ${confirmed.status} on the server and ${request.status} here`);
        }
      }
    }
    for (; logSeen < server.log.length; logSeen++) {
      const entry = server.log[logSeen];
      t.ok(!entry.write.path.includes('sample-'), `sample data was sent to the server: ${entry.write.op} ${entry.write.path}`);
    }
  }

  function checkSettled(t: Assert) {
    checkAlways(t);
    for (const device of devices) {
      t.ok(device.settledIn(), `${device.name} never finished adopting the family's data`);
      const want = expected(device);
      const have = device.local();
      for (const slice of LISTS) {
        if (slice === 'alerts' && device.role === 'child') continue; // write-only: a child cannot know what is left of them
        t.deepEqual(
          (have[slice] as readonly object[]).map((item) => comparable(slice, item)),
          (want[slice] as readonly object[]).map((item) => comparable(slice, item)),
          `${device.name}: ${slice} differs from the server`,
        );
      }
      t.deepEqual({ sosActive: have.sosActive, sosChildId: have.sosChildId }, { sosActive: want.sosActive, sosChildId: want.sosChildId }, `${device.name}: the SOS differs from the server`);
    }
    // Nothing a person added is gone, unless somebody removed it or a kill took it before it was saved or sent.
    for (const entry of ledger) {
      if (server.get(entry.path) !== null) continue;
      if (removed.has(entry.path)) continue;
      if (entry.lost && !entry.durable) continue;
      // Taken back (or made unsendable) on the phone it was made on before it was ever sent: cancelled, not lost.
      const neverStored = (path: string) => !server.log.some((e) => e.result.ok && e.write.path === path);
      if (cancelled.has(entry.path) && neverStored(entry.path)) continue;
      // The same for what was made under a child that was itself cancelled before it was sent.
      if ([...cancelled].some((path) => entry.path.startsWith(`${path}/`) && neverStored(path))) continue;
      t.fail(`${entry.device.name} added ${entry.path} and it is not on the server`);
    }
  }

  return {
    server,
    devices,
    parent,
    parent2,
    kids,
    rng,
    childIds,
    budget: () => budget,
    resent: () => resent,
    writes: () => devices.reduce((sum, d) => sum + d.stats.writes, 0),
    apply,
    tap,
    save,
    kill,
    settle,
    randomEvent,
    checkAlways,
    checkSettled,
  };
}

/** What one run of the model reports. */
export interface RunReport {
  seed: number;
  devices: number;
  events: number;
  writes: number;
  budget: number;
  kills: number;
  refusedByRace: number;
  /** Deleted items a restarted phone sent again because its save did not know they had arrived. */
  resent: number;
  reverted: number;
  maxPasses: number;
}

export interface RunOptions extends WorldOptions {
  events: number;
  kills: boolean;
  offline: boolean;
}

/**
 * One random history and all its checks:
 * 1. every phone joins with sample data and adopts the family's;
 * 2. `events` random events, with the always-true checks along the way;
 * 3. everything comes to rest: all phones equal the server, nothing added is lost, nothing deleted is back;
 * 4. an idle system writes nothing: repeated snapshots, saves and restarts of every phone cost zero writes;
 * 5. without kills, no more writes were issued than the actions allow.
 */
export function runModel(t: Assert, options: RunOptions): RunReport {
  const world = makeWorld(options);
  const { rng } = world;
  for (let i = 0; i < options.events; i++) {
    world.randomEvent({ kills: options.kills, offline: options.offline });
    world.checkAlways(t);
    // Now and then let everything catch up, so a history is not one long backlog.
    if (rng.chance(0.004)) world.settle();
  }
  world.settle();
  world.checkSettled(t);

  const writesAtRest = world.writes();
  if (!options.kills) t.ok(writesAtRest <= world.budget(), `${writesAtRest} writes for actions that allow ${world.budget()}`);

  // Idle: the same snapshots again, an engine run, a save and a restart of every phone.
  for (let round = 0; round < 2; round++) {
    for (const device of world.devices) {
      device.sdk().capture(undefined, true);
      let delivered = device.sdk().deliver();
      while (delivered) delivered = device.sdk().deliver();
      device.run();
      device.sdk().flushLocal();
    }
    world.settle();
  }
  for (const device of world.devices) world.save(device);
  for (const device of world.devices) world.kill(device);
  world.settle();
  world.checkSettled(t);
  t.equal(world.writes(), writesAtRest, 'an idle system issued writes');

  const stats = world.devices.map((d) => d.stats);
  return {
    seed: options.seed,
    devices: world.devices.length,
    events: options.events,
    writes: writesAtRest,
    budget: world.budget(),
    kills: stats.reduce((n, s) => n + s.kills, 0) - world.devices.length,
    refusedByRace: stats.reduce((n, s) => n + s.refused.length, 0),
    resent: world.resent(),
    reverted: stats.reduce((n, s) => n + s.reverted.length, 0),
    maxPasses: Math.max(...stats.map((s) => s.maxPasses)),
  };
}

/** The shape of a run for a seed: how many phones, which hazards. Every combination comes up. */
export function optionsForSeed(seed: number): RunOptions {
  const rng = makeRng(seed * 7919 + 13);
  const children: 1 | 2 = rng.chance(0.6) ? 2 : 1;
  const childDevices: 1 | 2 = rng.chance(0.5) ? 2 : 1;
  return {
    seed,
    children,
    childDevices,
    sameChild: childDevices === 2 && rng.chance(0.25),
    secondParent: rng.chance(0.4),
    limits: rng.chance(0.5) ? { requests: 4, messages: 5, alerts: 4 } : undefined,
    maxSkew: rng.chance(0.5) ? 180_000 : 0,
    promptSaves: rng.chance(0.7),
    refetchOnRefusal: rng.chance(0.7),
    events: 250 + rng.int(350),
    kills: rng.chance(0.6),
    offline: rng.chance(0.6),
  };
}
