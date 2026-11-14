/**
 * Whole-family scenarios on the model (a fake server and real engine code on every phone), each one
 * a sequence that went wrong with the first link engine or that the design promises.
 */
import type { Place } from '@/state/store';
import type { Assert, Case } from '../support/assert';
import type { Device, LocalState } from '../model/device';
import type { Data } from '../model/server';
import { makeWorld, type World, type WorldOptions } from '../model/world';

const world = (options: Partial<WorldOptions> = {}): World => {
  const w = makeWorld({ seed: 1, children: 2, childDevices: 2, secondParent: true, refetchOnRefusal: true, ...options });
  w.settle();
  return w;
};

/** A tap that changes the store. The engine reacts at once, as its effect would. */
const tap = (w: World, device: Device, change: (local: LocalState) => LocalState) => {
  w.apply(device, { name: 'tap', next: change(device.local()), maxWrites: 0 });
  device.run();
};
const swap = <T extends { id: string }>(list: readonly T[], id: string, fn: (item: T) => T): T[] => list.map((item) => (item.id === id ? fn(item) : item));
const child = (device: Device, id: string) => device.local().children.find((c) => c.id === id)!;
const get = (w: World, path: string) => w.server.get(`families/fam1/${path}`) as Data;
/** The accepted writes since `from`, as "who op path [fields]". */
const sent = (w: World, from: number) =>
  w.server.log.slice(from).map((e) => `${e.uid.replace('uid-', '')} ${e.write.op} ${e.write.path.replace('families/fam1/', '').replace(/\/[A-Za-z][A-Za-z0-9]{12,}$/, '/*')}${e.write.op === 'update' ? ` [${Object.keys(e.write.data ?? {}).join(',')}]` : ''}${e.result.ok ? '' : ' REFUSED'}`);

const askForTime = (w: World, kid: Device, id: string, minutes = 30) =>
  tap(w, kid, (l) => ({ ...l, requests: [{ id, childId: kid.ctx.childId as string, kind: 'extra_time', label: `${minutes} more minutes`, detail: 'You asked for extra screen time', minutes, ago: 'just now', at: kid.now(), status: 'pending' }, ...l.requests] }));
const answer = (w: World, parent: Device, id: string, approve: boolean) =>
  tap(w, parent, (l) => {
    const r = l.requests.find((x) => x.id === id)!;
    const requests = swap(l.requests, id, (x) => ({ ...x, status: approve ? ('approved' as const) : ('denied' as const) }));
    return approve && r.minutes ? { ...l, requests, children: swap(l.children, r.childId, (c) => ({ ...c, limitMin: c.limitMin + (r.minutes as number), bedtime: false })) } : { ...l, requests };
  });
const say = (w: World, device: Device, id: string, childId: string, text: string) =>
  tap(w, device, (l) => ({ ...l, messages: [...l.messages, { id, childId, from: device.role, text, time: '3:42 PM', at: device.now() }] }));
const checkIn = (w: World, kid: Device, alertId: string) =>
  tap(w, kid, (l) => {
    const at = kid.now();
    const me = kid.ctx.childId as string;
    return {
      ...l,
      children: swap(l.children, me, (c) => ({ ...c, updatedAgo: 'just now', checkInAt: at })),
      alerts: [{ id: alertId, kind: 'checkin', childId: me, icon: 'map-pin', color: '#2E8BFF', title: 'Zoe checked in', body: 'At 3:42 PM', ago: 'now', at, unread: true }, ...l.alerts],
    };
  });
const raiseSos = (w: World, kid: Device, alertId: string) =>
  tap(w, kid, (l) => ({
    ...l,
    sosActive: true,
    sosChildId: kid.ctx.childId,
    alerts: [{ id: alertId, kind: 'sos', childId: kid.ctx.childId, icon: 'alert-circle', color: '#FB4A4A', title: 'SOS from Zoe', body: 'Sent at 3:42 PM', ago: 'now', at: kid.now(), unread: true }, ...l.alerts],
  }));
const clearSos = (w: World, device: Device) => tap(w, device, (l) => ({ ...l, sosActive: false, sosChildId: null }));

const allAgree = (t: Assert, w: World) => w.checkSettled(t);

export const cases: Case[] = [
  {
    name: 'joining: every phone takes the family\'s data and uploads nothing',
    run(t) {
      const w = world();
      t.equal(w.writes(), 0);
      t.deepEqual(w.server.log, []);
      for (const d of w.devices) {
        t.ok(!JSON.stringify(d.local()).includes('sample-'), `${d.name} still shows sample data`);
        t.deepEqual(d.local().places.map((p) => p.id), ['pl1', 'pl2']);
      }
      t.deepEqual(w.parent.local().children.map((c) => c.id), ['kidA', 'kidB']);
      t.deepEqual(w.kids[0].local().children.map((c) => c.id), ['kidA'], 'a child device holds only its own child');
      t.deepEqual(w.kids[1].local().children.map((c) => c.id), ['kidB']);
      allAgree(t, w);
    },
  },
  {
    name: 'joining: killed at any point before the data is in, the sample data still never goes up (old s6)',
    run(t) {
      for (let cut = 0; cut < 12; cut++) {
        const w = makeWorld({ seed: 1, children: 2, childDevices: 2, secondParent: true });
        // Let `cut` listeners deliver, then kill every phone, with and without a save in between.
        for (const d of w.devices) {
          const keys = d.sdk().keys();
          for (const key of keys.slice(0, cut)) {
            d.sdk().capture(key);
            d.sdk().deliver(key);
          }
          if (cut % 2 === 0) w.save(d);
          w.kill(d);
        }
        w.settle();
        t.equal(w.writes(), 0, `cut ${cut}`);
        allAgree(t, w);
      }
    },
  },
  {
    name: 'one tap, the fewest writes: each action costs exactly the documents it changes',
    run(t) {
      const w = world();
      const [kid] = w.kids;
      const { parent } = w;
      let from = w.server.log.length;
      const cost = (label: string, expected: string[]) => {
        w.settle();
        t.deepEqual(sent(w, from).sort(), [...expected].sort(), label);
        from = w.server.log.length;
      };

      tap(w, parent, (l) => ({ ...l, places: swap(l.places, 'pl1', (p) => ({ ...p, arrive: !p.arrive })) }));
      cost('toggle a place alert', ['parent update places/pl1 [arrive]']);

      askForTime(w, kid, 'reqAAAAAAAAAAAAA');
      cost('ask for time', ['child1 set children/kidA/requests/*']);

      answer(w, parent, 'reqAAAAAAAAAAAAA', true);
      cost('approve: the answer and the new limit', ['parent update children/kidA/requests/* [status,resolvedBy,resolvedAt]', 'parent update children/kidA [limitMin]']);

      askForTime(w, kid, 'reqBBBBBBBBBBBBB', 15);
      w.settle();
      from = w.server.log.length;
      answer(w, parent, 'reqBBBBBBBBBBBBB', false);
      cost('deny: the answer only', ['parent update children/kidA/requests/* [status,resolvedBy,resolvedAt]']);

      checkIn(w, kid, 'alertAAAAAAAAAAAA');
      cost('check in: the time and the alert', ['child1 set children/kidA/live/status', 'child1 set alerts/*']);

      raiseSos(w, kid, 'alertBBBBBBBBBBBB');
      cost('SOS: the flag and the alert', ['child1 set signals/sos', 'child1 set alerts/*']);

      clearSos(w, parent);
      cost('mark as safe', ['parent set signals/sos']);

      tap(w, parent, (l) => ({ ...l, alerts: l.alerts.map((a) => ({ ...a, unread: false })) }));
      cost('mark two alerts read', ['parent update alerts/* [unread]', 'parent update alerts/* [unread]']);

      say(w, parent, 'msgAAAAAAAAAAAAA', 'kidA', 'Dinner at 6');
      cost('a chat message', ['parent set children/kidA/messages/*']);

      tap(w, kid, (l) => ({ ...l, tasks: swap(l.tasks, 'tk1', (x) => ({ ...x, done: true })) }));
      cost('tick a task', ['child1 update tasks/tk1 [done]']);

      tap(w, parent, (l) => ({ ...l, children: swap(l.children, 'kidB', (c) => ({ ...c, bedtime: true, apps: swap(c.apps, 'a1', (a) => ({ ...a, blocked: true })) })) }));
      cost('pause and block an app in one go: one document', ['parent update children/kidB [bedtime,apps]']);

      tap(w, parent, (l) => ({ ...l, places: l.places.filter((p) => p.id !== 'pl2') }));
      cost('remove a place', ['parent delete places/pl2']);

      tap(w, parent, (l) => ({ ...l, sites: [...l.sites, { id: 'siteAAAAAAAAAAAA', host: 'games.example', list: 'blocked' }] }));
      cost('add a site', ['parent set sites/*']);
      allAgree(t, w);

      // And nothing at all while nobody does anything: more snapshots, saves, restarts.
      const before = w.writes();
      for (const d of w.devices) {
        d.sdk().capture(undefined, true);
        d.sdk().deliver();
        d.run();
        w.save(d);
        w.kill(d);
      }
      w.settle();
      t.equal(w.writes(), before, 'an idle system writes nothing');
      t.equal(w.server.log.length, from);
      t.ok(w.devices.every((d) => d.stats.maxPasses <= 2));
    },
  },
  {
    name: 'an approval is not undone by the child\'s cold start, and its bonus is granted once (old s2)',
    run(t) {
      const w = world({ childDevices: 1, secondParent: false });
      const [kid] = w.kids;
      askForTime(w, kid, 'reqAAAAAAAAAAAAA');
      w.settle();
      // The child closes the app. Its save still says "pending".
      w.save(kid);
      kid.setOnline(false);
      answer(w, w.parent, 'reqAAAAAAAAAAAAA', true);
      w.settle([w.parent]);
      t.equal(get(w, 'children/kidA/requests/reqAAAAAAAAAAAAA').status, 'approved');
      t.equal(get(w, 'children/kidA').limitMin, 270);
      // The child opens the app again.
      w.kill(kid);
      w.settle();
      t.equal(get(w, 'children/kidA/requests/reqAAAAAAAAAAAAA').status, 'approved', 'still approved on the server');
      t.equal(kid.local().requests[0].status, 'approved');
      t.equal(w.parent.local().requests[0].status, 'approved');
      t.equal(get(w, 'children/kidA').limitMin, 270, 'the half hour was added once');
      t.equal(child(kid, 'kidA').limitMin, 270);
      t.deepEqual(w.kids[0].stats.refused, []);
      t.equal(w.server.log.filter((e) => e.write.path.endsWith('children/kidA')).length, 1);
      allAgree(t, w);
    },
  },
  {
    name: 'a message added elsewhere while two sends are in flight is not lost (old s3)',
    run(t) {
      const w = world({ childDevices: 1, secondParent: false });
      const [kid] = w.kids;
      const { parent } = w;
      say(w, kid, 'msgCCCCCCCCCCCC1', 'kidA', 'C1');
      kid.sdk().sendNext();
      say(w, parent, 'msgPPPPPPPPPPPP1', 'kidA', 'P1');
      parent.sdk().sendNext();
      // P1 is on its way; the snapshot with the child's C1 arrives; the parent types P2.
      parent.sdk().capture('messages:kidA');
      say(w, parent, 'msgPPPPPPPPPPPP2', 'kidA', 'P2');
      parent.sdk().deliver('messages:kidA');
      parent.sdk().ackNext();
      w.settle();
      const texts = (d: Device) => d.local().messages.map((m) => m.text);
      t.deepEqual(texts(parent), ['C1', 'P1', 'P2']);
      t.deepEqual(texts(kid), ['C1', 'P1', 'P2']);
      t.equal(w.server.list('families/fam1/children/kidA/messages').length, 3);
      t.equal(w.writes(), 3);
      allAgree(t, w);
    },
  },
  {
    name: 'a switch tapped off and on again while the first tap is being sent ends up on (old s4)',
    run(t) {
      const w = world({ childDevices: 1, secondParent: false });
      const { parent } = w;
      const arrive = (d: Device) => (d.local().places.find((p) => p.id === 'pl1') as Place).arrive;
      const toggle = () => tap(w, parent, (l) => ({ ...l, places: swap(l.places, 'pl1', (p) => ({ ...p, arrive: !p.arrive })) }));
      toggle(); // off
      parent.sdk().sendNext();
      // A snapshot taken before the first write, delivered during the send.
      parent.sdk().capture('places', true);
      toggle(); // on again
      parent.sdk().deliver('places');
      t.equal(arrive(parent), true, 'the snapshot does not undo the second tap');
      parent.sdk().ackNext();
      t.equal(arrive(parent), true, 'neither does the answer to the first');
      w.settle();
      t.equal(arrive(parent), true);
      t.equal(arrive(w.kids[0]), true);
      t.equal(get(w, 'places/pl1').arrive, true);
      t.equal(w.writes(), 2);
      allAgree(t, w);
    },
  },
  {
    name: 'a check-in made offline does not take back what the parent changed meanwhile (old s8)',
    run(t) {
      const w = world({ childDevices: 1, secondParent: false });
      const [kid] = w.kids;
      kid.setOnline(false);
      tap(w, w.parent, (l) => ({ ...l, children: swap(l.children, 'kidA', (c) => ({ ...c, bedtime: true, limitMin: 120, apps: swap(c.apps, 'a1', (a) => ({ ...a, blocked: true })) })) }));
      w.settle([w.parent]);
      checkIn(w, kid, 'alertAAAAAAAAAAAA');
      t.equal(kid.sdk().idle(), false, 'kept for later');
      w.settle();
      const stored = get(w, 'children/kidA');
      t.equal(stored.bedtime, true);
      t.equal(stored.limitMin, 120);
      t.equal((stored.apps as { id: string; blocked: boolean }[]).find((a) => a.id === 'a1')?.blocked, true);
      t.equal(typeof get(w, 'children/kidA/live/status').checkInAt, 'number');
      t.equal(child(kid, 'kidA').limitMin, 120);
      t.equal(child(w.parent, 'kidA').checkInAt, get(w, 'children/kidA/live/status').checkInAt, 'the parent sees the check-in');
      t.equal(w.parent.local().alerts.length, 1);
      t.deepEqual(w.server.log.filter((e) => e.uid === 'uid-child1').map((e) => e.write.path.split('/').slice(2).join('/').replace(/alerts\/.*/, 'alerts/*')).sort(), ['alerts/*', 'children/kidA/live/status']);
      allAgree(t, w);
    },
  },
  {
    name: 'a kill at the wrong moment does not bring a removed site rule back (old s13)',
    run(t) {
      const w = world({ childDevices: 1 });
      const [kid] = w.kids;
      const other = w.parent2 as Device;
      tap(w, w.parent, (l) => ({ ...l, sites: [...l.sites, { id: 'siteAAAAAAAAAAAA', host: 'badsite.example', list: 'blocked' }] }));
      w.settle();
      t.deepEqual(kid.local().sites.map((s) => s.host), ['badsite.example']);
      // Everybody has it saved. The other parent and the child are then away.
      for (const d of w.devices) w.save(d);
      kid.setOnline(false);
      other.setOnline(false);
      tap(w, w.parent, (l) => ({ ...l, sites: [] }));
      w.settle([w.parent]);
      t.equal(w.server.get('families/fam1/sites/siteAAAAAAAAAAAA'), null);
      // Both come back from a cold start whose save still lists the rule.
      w.kill(kid);
      w.kill(other);
      w.settle();
      t.equal(w.server.get('families/fam1/sites/siteAAAAAAAAAAAA'), null, 'it stays removed');
      for (const d of w.devices) t.deepEqual(d.local().sites, [], d.name);
      t.deepEqual(w.server.resurrected, []);
      allAgree(t, w);
    },
  },
  {
    name: 'two parents answer the same request: the first answer stands, the other is told and not retried',
    run(t) {
      const w = world({ childDevices: 1 });
      const [kid] = w.kids;
      const other = w.parent2 as Device;
      askForTime(w, kid, 'reqAAAAAAAAAAAAA');
      w.settle();
      answer(w, w.parent, 'reqAAAAAAAAAAAAA', false);
      answer(w, other, 'reqAAAAAAAAAAAAA', true);
      w.settle();
      const updates = w.server.log.filter((e) => e.write.path.endsWith('requests/reqAAAAAAAAAAAAA') && e.write.op === 'update');
      t.deepEqual(updates.map((e) => e.result.ok), [true, false], 'one accepted, one refused, no third attempt');
      t.equal(updates[1].result.kind, 'state');
      t.equal(get(w, 'children/kidA/requests/reqAAAAAAAAAAAAA').status, 'denied');
      for (const d of [w.parent, other, kid]) t.equal(d.local().requests[0].status, 'denied', d.name);
      t.equal(other.stats.refused.length, 1);
      allAgree(t, w);
    },
  },
  {
    name: 'a child cannot change its own limit, rules or record: put back, nothing sent',
    run(t) {
      const w = world({ childDevices: 1, secondParent: false });
      const [kid] = w.kids;
      tap(w, kid, (l) => ({
        ...l,
        children: swap(l.children, 'kidA', (c) => ({ ...c, limitMin: 600, name: 'Boss', apps: c.apps.map((a) => ({ ...a, blocked: false })) })),
        places: [],
        schedules: swap(l.schedules, 'sc1', (s) => ({ ...s, on: false })),
        sites: [{ id: 'siteAAAAAAAAAAAA', host: 'games.example', list: 'allowed' }],
        tasks: swap(l.tasks, 'tk1', (x) => ({ ...x, points: 1000 })),
      }));
      w.settle();
      t.equal(w.writes(), 0);
      t.equal(child(kid, 'kidA').limitMin, 240);
      t.equal(child(kid, 'kidA').name, 'Zoe');
      t.equal(kid.local().places.length, 2);
      t.equal(kid.local().schedules[0].on, true);
      t.deepEqual(kid.local().sites, []);
      t.equal(kid.local().tasks[0].points, 20);
      t.ok(kid.stats.reverted.length >= 5, 'each one is reported');
      allAgree(t, w);
    },
  },
  {
    name: 'SOS with two children: only its owner or a parent clears it; a stale "safe" does not silence a new one',
    run(t) {
      const w = world({ secondParent: false });
      const [zoe, ben] = w.kids;
      raiseSos(w, zoe, 'alertAAAAAAAAAAAA');
      w.settle();
      for (const d of w.devices) t.deepEqual([d.local().sosActive, d.local().sosChildId], [true, 'kidA'], d.name);
      const before = w.writes();
      clearSos(w, ben);
      w.settle();
      t.equal(w.writes(), before, 'the other child\'s "safe" is not sent');
      t.equal(ben.local().sosActive, true);
      // The parent goes offline and marks it safe; meanwhile Zoe clears it herself and raises it again.
      w.parent.setOnline(false);
      clearSos(w, w.parent);
      clearSos(w, zoe);
      w.settle([zoe]);
      w.server.tick(60_000);
      raiseSos(w, zoe, 'alertBBBBBBBBBBBB');
      w.settle([zoe]);
      w.settle();
      t.equal(get(w, 'signals/sos').active, true, 'the new alarm is still on');
      t.equal(w.parent.local().sosActive, true);
      // The parent's "safe" was made offline: it is refused there and then (it needs the server), or dropped as stale.
      t.equal(w.parent.stats.refused.length > 0 || w.parent.stats.reverted.some((r) => r.slice === 'sos' && r.reason === 'stale'), true, 'the stale "safe" was not sent');
      clearSos(w, w.parent);
      w.settle();
      t.equal(get(w, 'signals/sos').active, false);
      for (const d of w.devices) t.equal(d.local().sosActive, false, d.name);
      allAgree(t, w);
    },
  },
  {
    name: 'bounded listeners: a phone holds the newest items only, and never deletes what fell out of view',
    run(t) {
      const w = world({ childDevices: 1, secondParent: false, limits: { messages: 3, requests: 2, alerts: 2 } });
      const [kid] = w.kids;
      for (let i = 1; i <= 5; i++) {
        say(w, kid, `msgCCCCCCCCCCCC${i}`, 'kidA', `C${i}`);
        w.server.tick(1000);
        w.settle();
      }
      t.deepEqual(w.parent.local().messages.map((m) => m.text), ['C3', 'C4', 'C5']);
      t.deepEqual(kid.local().messages.map((m) => m.text), ['C3', 'C4', 'C5']);
      say(w, w.parent, 'msgPPPPPPPPPPPP1', 'kidA', 'P1');
      w.settle();
      t.deepEqual(kid.local().messages.map((m) => m.text), ['C4', 'C5', 'P1']);
      t.equal(w.server.list('families/fam1/children/kidA/messages').length, 6, 'the server keeps them all');
      t.ok(w.server.log.every((e) => e.write.op !== 'delete'));
      for (const d of w.devices) {
        w.save(d);
        w.kill(d);
      }
      w.settle();
      t.equal(w.server.list('families/fam1/children/kidA/messages').length, 6);
      t.equal(w.writes(), 6);
      allAgree(t, w);
    },
  },
  {
    name: 'offline for a while, then killed before anything was sent: every saved change still arrives, once',
    run(t) {
      const w = world({ childDevices: 1, secondParent: false });
      const [kid] = w.kids;
      kid.setOnline(false);
      askForTime(w, kid, 'reqAAAAAAAAAAAAA');
      say(w, kid, 'msgCCCCCCCCCCCC1', 'kidA', 'on my way');
      checkIn(w, kid, 'alertAAAAAAAAAAAA');
      tap(w, kid, (l) => ({ ...l, tasks: swap(l.tasks, 'tk2', (x) => ({ ...x, done: true })) }));
      w.save(kid);
      w.kill(kid);
      t.equal(w.server.log.length, 0);
      w.settle();
      t.equal(w.server.log.filter((e) => e.result.ok).length, 5, 'request, message, status, alert, task');
      t.equal(w.parent.local().requests.length, 1);
      t.equal(w.parent.local().messages.length, 1);
      t.equal(w.parent.local().alerts.length, 1);
      t.equal(w.parent.local().tasks[1].done, true);
      // Killed again right after: nothing is sent twice.
      w.save(kid);
      w.kill(kid);
      w.settle();
      t.equal(w.server.log.length, 5);
      allAgree(t, w);
    },
  },
];
