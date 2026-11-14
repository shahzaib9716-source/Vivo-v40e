/** The reconcile table of SPEC 4.2, one case per row, then the roles, the writes in flight and the helpers. */
import type { Child, Place } from '@/state/store';
import {
  advanceConfirmed,
  decodeSnapshot,
  dropOrphans,
  issued,
  mergeValue,
  onListSnapshot,
  pruneWriteOnly,
  rebaseList,
  reconcileList,
  regenerateAfterRestart,
  relisten,
  same,
  settleList,
  settledWrite,
  startList,
  startWriteOnly,
  stepList,
  type Write,
} from '@/sync/reconcile';
import { SCHEMA, type ListSpec } from '@/sync/schema';
import type { Assert, Case } from '../support/assert';
import { alert, child, ctxOf, mapOf, message, place, request, schedule, site, task, TS } from '../support/fixtures';

const parent = ctxOf('parent');
const kid = ctxOf('child', 'c1');
const P = SCHEMA.places;

/** One reconcile of the places slice as a parent, the commonest shape in these cases. */
const places = (local: Place[], base: Place[], remote: Place[], inFlight: Write[] = [], ctx = parent) =>
  reconcileList(P, { local, base: mapOf(...base), remote: mapOf(...remote), ctx, inFlight });

const noWrites = (t: Assert, result: { writes: Write[]; reverted: unknown[] }) => {
  t.deepEqual(result.writes, []);
  t.deepEqual(result.reverted, []);
};

export const cases: Case[] = [
  // ---- the table --------------------------------------------------------------------------
  {
    name: 'table: nothing changed anywhere: nothing to do, the same array back',
    run(t) {
      const local = [place('p1'), place('p2')];
      const r = places(local, [place('p1'), place('p2')], [place('p1'), place('p2')]);
      noWrites(t, r);
      t.equal(r.changed, false);
      t.equal(r.nextLocal, local);
    },
  },
  {
    name: 'table: local == base, remote changed: take remote',
    run(t) {
      const r = places([place('p1')], [place('p1')], [place('p1', { name: 'Renamed', arrive: false })]);
      noWrites(t, r);
      t.equal(r.changed, true);
      t.deepEqual(r.nextLocal, [place('p1', { name: 'Renamed', arrive: false })]);
      t.deepEqual([...r.nextBase.values()], [place('p1', { name: 'Renamed', arrive: false })]);
    },
  },
  {
    name: 'table: local == base, missing remotely: remove locally, write nothing',
    run(t) {
      const r = places([place('p1'), place('p2')], [place('p1'), place('p2')], [place('p2')]);
      noWrites(t, r);
      t.deepEqual(r.nextLocal.map((p) => p.id), ['p2']);
      t.deepEqual([...r.nextBase.keys()], ['p2']);
    },
  },
  {
    name: 'table: added remotely: appears locally',
    run(t) {
      const r = places([place('p1')], [place('p1')], [place('p1'), place('p9')]);
      noWrites(t, r);
      t.deepEqual(r.nextLocal.map((p) => p.id), ['p1', 'p9']);
    },
  },
  {
    name: 'table: local removed, base had it, the role may delete: deleteDoc',
    run(t) {
      const r = places([place('p1')], [place('p1'), place('p2')], [place('p1'), place('p2')]);
      t.deepEqual(r.writes, [{ op: 'delete', slice: 'places', id: 'p2', path: 'families/fam1/places/p2' }]);
      t.deepEqual(r.reverted, []);
      t.deepEqual(r.nextLocal.map((p) => p.id), ['p1']);
      t.deepEqual([...r.nextBase.keys()], ['p1'], 'the base already lacks it, so it is not sent again');
    },
  },
  {
    name: 'table: local removed, base had it, the role may not delete: restored from remote',
    run(t) {
      const r = places([place('p1')], [place('p1'), place('p2')], [place('p1'), place('p2', { name: 'Newer' })], [], kid);
      t.deepEqual(r.writes, []);
      t.deepEqual(r.nextLocal, [place('p1'), place('p2', { name: 'Newer' })]);
      t.equal(r.reverted.length, 1);
      t.deepEqual({ op: r.reverted[0].op, id: r.reverted[0].id, reason: r.reverted[0].reason }, { op: 'delete', id: 'p2', reason: 'role' });
    },
  },
  {
    name: 'table: removed on both sides: nothing',
    run(t) {
      const r = places([place('p1')], [place('p1'), place('p2')], [place('p1')]);
      noWrites(t, r);
      t.equal(r.changed, false);
    },
  },
  {
    name: 'table: local added, the role may create: setDoc with ord, no labels, no id field',
    run(t) {
      const fresh = place('pNew', { name: 'Pool' });
      const r = places([place('p1'), fresh], [place('p1')], [place('p1')]);
      t.equal(r.writes.length, 1);
      const w = r.writes[0];
      t.equal(w.op, 'create');
      t.equal(w.path, 'families/fam1/places/pNew');
      t.deepEqual(w.op === 'create' ? w.data : null, { name: 'Pool', icon: 'home', radius: 150, arrive: true, leave: true, ord: 1_700_000_000_000 });
      t.equal(r.changed, false, 'the local list already has it');
      t.ok(r.nextBase.has('pNew'));
    },
  },
  {
    name: 'table: local added, the role may not create: dropped and reported',
    run(t) {
      const r = places([place('p1'), place('pNew')], [place('p1')], [place('p1')], [], kid);
      t.deepEqual(r.writes, []);
      t.deepEqual(r.nextLocal.map((p) => p.id), ['p1']);
      t.deepEqual({ op: r.reverted[0].op, id: r.reverted[0].id, reason: r.reverted[0].reason }, { op: 'create', id: 'pNew', reason: 'role' });
    },
  },
  {
    name: 'table: local added and remote has the same id: adopt remote, write nothing',
    run(t) {
      // After a restart: our create had arrived, the saved confirmed copy did not know yet.
      const r = places([place('p1'), place('pMine', { arrive: false })], [place('p1')], [place('p1'), place('pMine', { arrive: true, name: 'As stored' })]);
      noWrites(t, r);
      t.deepEqual(r.nextLocal[1], place('pMine', { arrive: true, name: 'As stored' }));
    },
  },
  {
    name: 'table: both changed, different fields: only the locally changed field is sent, the other takes remote',
    run(t) {
      const r = places([place('p1', { arrive: false })], [place('p1')], [place('p1', { name: 'Renamed elsewhere' })]);
      t.deepEqual(r.writes, [{ op: 'update', slice: 'places', id: 'p1', path: 'families/fam1/places/p1', fields: { arrive: false }, patch: { arrive: false } }]);
      t.deepEqual(r.nextLocal, [place('p1', { arrive: false, name: 'Renamed elsewhere' })]);
      t.deepEqual([...r.nextBase.values()], [place('p1', { arrive: false, name: 'Renamed elsewhere' })]);
    },
  },
  {
    name: 'table: both changed the same field: the local value is sent',
    run(t) {
      const r = places([place('p1', { radius: 300 })], [place('p1')], [place('p1', { radius: 500 })]);
      t.deepEqual(r.writes.map((w) => (w.op === 'update' ? w.fields : null)), [{ radius: 300 }]);
      t.equal(r.nextLocal[0].radius, 300);
    },
  },
  {
    name: 'table: changed locally to what remote already says: nothing is sent',
    run(t) {
      const r = places([place('p1', { arrive: false })], [place('p1')], [place('p1', { arrive: false })]);
      noWrites(t, r);
      t.equal(r.changed, false);
    },
  },
  {
    name: 'table: remote deleted while locally edited: the deletion wins',
    run(t) {
      const r = places([place('p1', { name: 'Edited here' })], [place('p1')], []);
      noWrites(t, r);
      t.deepEqual(r.nextLocal, []);
    },
  },
  {
    name: 'table: after reconciling base equals remote plus the writes, so a second pass is silent',
    run(t) {
      const local = [place('p1', { arrive: false }), place('pNew')];
      const first = places(local, [place('p1'), place('p2')], [place('p1'), place('p2')]);
      t.deepEqual(first.writes.map((w) => w.op).sort(), ['create', 'delete', 'update']);
      // The snapshot has not caught up: the remote view is still the old one.
      const second = reconcileList(P, { local: first.nextLocal, base: first.nextBase, remote: mapOf(place('p1'), place('p2')), ctx: parent, inFlight: first.writes });
      noWrites(t, second);
      t.equal(second.changed, false);
      // And once it has caught up and the writes have settled.
      const third = reconcileList(P, { local: second.nextLocal, base: second.nextBase, remote: mapOf(place('p1', { arrive: false }), place('pNew')), ctx: parent, inFlight: [] });
      noWrites(t, third);
      t.equal(third.changed, false);
    },
  },

  // ---- writes in flight -------------------------------------------------------------------
  {
    name: 'in flight: the same (id, field, value) is never sent twice',
    run(t) {
      const first = places([place('p1', { arrive: false })], [place('p1')], [place('p1')]);
      t.equal(first.writes.length, 1);
      // Even with a base that forgot (the worst case), the write in flight stops a repeat.
      const again = places([place('p1', { arrive: false })], [place('p1')], [place('p1')], first.writes);
      noWrites(t, again);
    },
  },
  {
    name: 'in flight: a snapshot from before the write cannot undo the change',
    run(t) {
      const first = places([place('p1', { arrive: false })], [place('p1')], [place('p1')]);
      const stale = reconcileList(P, { local: first.nextLocal, base: first.nextBase, remote: mapOf(place('p1')), ctx: parent, inFlight: first.writes });
      noWrites(t, stale);
      t.equal(stale.nextLocal[0].arrive, false);
    },
  },
  {
    name: 'in flight: a second tap while the first is on its way is sent as its own write and survives',
    run(t) {
      const a = places([place('p1', { arrive: false })], [place('p1')], [place('p1')]);
      const b = reconcileList(P, { local: [place('p1', { arrive: true })], base: a.nextBase, remote: mapOf(place('p1')), ctx: parent, inFlight: a.writes });
      t.deepEqual(b.writes.map((w) => (w.op === 'update' ? w.fields : null)), [{ arrive: true }]);
      const inFlight = [...a.writes, ...b.writes];
      // The first write is confirmed, the snapshot shows it (arrive false) and the second is still pending.
      const c = reconcileList(P, { local: b.nextLocal, base: b.nextBase, remote: mapOf(place('p1', { arrive: false })), ctx: parent, inFlight: [inFlight[1]] });
      noWrites(t, c);
      t.equal(c.nextLocal[0].arrive, true, 'the second tap is not undone');
    },
  },
  {
    name: 'in flight: a refused write is not retried and the item goes back to the remote value',
    run(t) {
      const first = places([place('p1', { arrive: false })], [place('p1')], [place('p1')]);
      // The promise rejected: the write leaves the list. Nothing else is needed.
      const after = reconcileList(P, { local: first.nextLocal, base: first.nextBase, remote: mapOf(place('p1')), ctx: parent, inFlight: [] });
      t.deepEqual(after.writes, [], 'no retry');
      t.equal(after.nextLocal[0].arrive, true, 'back to what the server has');
      const refusedCreate = places([place('p1'), place('pNew')], [place('p1')], [place('p1')]);
      const gone = reconcileList(P, { local: refusedCreate.nextLocal, base: refusedCreate.nextBase, remote: mapOf(place('p1')), ctx: parent, inFlight: [] });
      t.deepEqual(gone.writes, []);
      t.deepEqual(gone.nextLocal.map((p) => p.id), ['p1']);
      const refusedDelete = places([], [place('p1')], [place('p1')]);
      const back = reconcileList(P, { local: refusedDelete.nextLocal, base: refusedDelete.nextBase, remote: mapOf(place('p1')), ctx: parent, inFlight: [] });
      t.deepEqual(back.writes, []);
      t.deepEqual(back.nextLocal.map((p) => p.id), ['p1']);
    },
  },
  {
    name: 'in flight: issued and settledWrite keep the list',
    run(t) {
      const a = places([place('p1', { arrive: false })], [place('p1')], [place('p1')]);
      const list = issued([], a.writes);
      t.equal(list.length, 1);
      t.equal(issued(list, []), list);
      t.deepEqual(settledWrite(list, a.writes[0]), []);
    },
  },

  // ---- nested lists -----------------------------------------------------------------------
  {
    name: 'fields: a child\'s apps merge app by app, so two parents changing different apps both win',
    run(t) {
      const base = child('c1');
      const mine = child('c1', { apps: base.apps.map((a) => (a.id === 'a1' ? { ...a, blocked: true } : a)) });
      const theirs = child('c1', { apps: base.apps.map((a) => (a.id === 'a2' ? { ...a, limitMin: 45 } : a)), limitMin: 120 });
      const r = reconcileList(SCHEMA.children, { local: [mine], base: mapOf(base), remote: mapOf(theirs), ctx: parent });
      t.equal(r.writes.length, 1);
      const w = r.writes[0];
      const sent = (w.op === 'update' ? w.fields.apps : []) as Child['apps'];
      t.deepEqual(Object.keys(w.op === 'update' ? w.fields : {}), ['apps'], 'only the field that changed here');
      t.equal(sent.find((a) => a.id === 'a1')?.blocked, true);
      t.equal(sent.find((a) => a.id === 'a2')?.limitMin, 45);
      t.equal(r.nextLocal[0].limitMin, 120, 'the other parent\'s limit is taken');
      t.equal(r.nextLocal[0].apps.find((a) => a.id === 'a2')?.limitMin, 45);
    },
  },
  {
    name: 'fields: mergeValue and same',
    run(t) {
      t.equal(mergeValue(1, 1, 2), 2);
      t.equal(mergeValue(1, 3, 1), 3);
      t.equal(mergeValue(1, 3, 2), 3);
      t.deepEqual(mergeValue([1, 2], [1, 2, 3], [0, 1, 2]), [1, 2, 3], 'a plain list is one value');
      t.ok(same({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }));
      t.ok(same({ a: 1, b: undefined }, { a: 1 }));
      t.ok(!same({ a: 1 }, { a: 1, b: null }));
      t.ok(!same([1, 2], [2, 1]));
    },
  },

  // ---- roles ------------------------------------------------------------------------------
  {
    name: 'role: a child-side change to a parent-owned field is put back and never written',
    run(t) {
      const mine = child('c1', { limitMin: 600, bedtime: false, name: 'The Boss', apps: child('c1').apps.map((a) => ({ ...a, blocked: false })) });
      const stored = child('c1', { bedtime: true });
      const r = reconcileList(SCHEMA.children, { local: [mine], base: mapOf(stored), remote: mapOf(stored), ctx: kid });
      t.deepEqual(r.writes, []);
      t.deepEqual(r.nextLocal, [stored]);
      t.equal(r.reverted.length, 1);
      t.deepEqual(r.reverted[0].fields?.sort(), ['apps', 'bedtime', 'limitMin', 'name']);
      t.equal(r.reverted[0].reason, 'role');
    },
  },
  {
    name: 'role: a check-in on the child record (checkInAt, updatedAgo) is not a change to the document',
    run(t) {
      const stored = child('c1');
      const local = [child('c1', { checkInAt: 5000, updatedAgo: 'just now' })];
      const r = reconcileList(SCHEMA.children, { local, base: mapOf(stored), remote: mapOf(stored), ctx: kid });
      noWrites(t, r);
      t.equal(r.changed, false);
      t.equal(r.nextLocal, local);
    },
  },
  {
    name: 'role: a child cannot add, change or remove places, schedules or sites',
    run(t) {
      for (const [spec, a, b] of [
        [SCHEMA.places, place('x1'), place('x1', { arrive: false })],
        [SCHEMA.schedules, schedule('x1'), schedule('x1', { on: false })],
        [SCHEMA.sites, site('x1'), site('x1', { list: 'allowed' })],
      ] as const) {
        const s = spec as unknown as ListSpec;
        const changed = reconcileList(s, { local: [b] as never, base: mapOf(a) as never, remote: mapOf(a) as never, ctx: kid });
        t.deepEqual(changed.writes, []);
        t.deepEqual(changed.nextLocal, [a]);
        const removed = reconcileList(s, { local: [] as never, base: mapOf(a) as never, remote: mapOf(a) as never, ctx: kid });
        t.deepEqual(removed.writes, []);
        t.deepEqual(removed.nextLocal, [a]);
        const added = reconcileList(s, { local: [a] as never, base: new Map() as never, remote: new Map() as never, ctx: kid });
        t.deepEqual(added.writes, []);
        t.deepEqual(added.nextLocal, []);
      }
    },
  },
  {
    name: 'role: a child may tick a task and nothing else about it',
    run(t) {
      const stored = task('t1');
      const ticked = reconcileList(SCHEMA.tasks, { local: [task('t1', { done: true })], base: mapOf(stored), remote: mapOf(stored), ctx: kid });
      t.deepEqual(ticked.writes, [{ op: 'update', slice: 'tasks', id: 't1', path: 'families/fam1/tasks/t1', fields: { done: true }, patch: { done: true } }]);
      const both = reconcileList(SCHEMA.tasks, { local: [task('t1', { done: true, points: 1000, title: 'Free' })], base: mapOf(stored), remote: mapOf(stored), ctx: kid });
      t.deepEqual(both.writes.map((w) => (w.op === 'update' ? w.fields : null)), [{ done: true }], 'the tick still goes, alone');
      t.deepEqual(both.nextLocal, [task('t1', { done: true })]);
      t.deepEqual(both.reverted[0].fields?.sort(), ['points', 'title']);
      const added = reconcileList(SCHEMA.tasks, { local: [stored, task('t2')], base: mapOf(stored), remote: mapOf(stored), ctx: kid });
      t.deepEqual(added.writes, []);
      const removed = reconcileList(SCHEMA.tasks, { local: [], base: mapOf(stored), remote: mapOf(stored), ctx: kid });
      t.deepEqual(removed.writes, []);
      t.deepEqual(removed.nextLocal, [stored]);
    },
  },
  {
    name: 'role: a parent may change every field of a task',
    run(t) {
      const stored = task('t1');
      const r = reconcileList(SCHEMA.tasks, { local: [task('t1', { done: true, points: 30 })], base: mapOf(stored), remote: mapOf(stored), ctx: parent });
      t.deepEqual(r.writes.map((w) => (w.op === 'update' ? w.fields : null)), [{ points: 30, done: true }]);
    },
  },
  {
    name: 'role: nobody can change or remove a message; a parent cannot change a message',
    run(t) {
      const stored = message('m1', 'c1', 'child');
      for (const ctx of [parent, kid]) {
        const edited = reconcileList(SCHEMA.messages, { local: [message('m1', 'c1', 'child', { text: 'edited' })], base: mapOf(stored), remote: mapOf(stored), ctx, childId: 'c1' });
        t.deepEqual(edited.writes, []);
        t.deepEqual(edited.nextLocal, [stored]);
        t.equal(edited.reverted[0].reason, 'role');
        const removed = reconcileList(SCHEMA.messages, { local: [], base: mapOf(stored), remote: mapOf(stored), ctx, childId: 'c1' });
        t.deepEqual(removed.writes, []);
        t.deepEqual(removed.nextLocal, [stored]);
      }
    },
  },
  {
    name: 'role: a message is sent as yourself: the other side\'s `from` is dropped',
    run(t) {
      const asParent = message('m1', 'c1', 'parent');
      const asChild = message('m2', 'c1', 'child');
      const p = reconcileList(SCHEMA.messages, { local: [asParent, asChild], base: new Map(), remote: new Map(), ctx: parent, childId: 'c1' });
      t.deepEqual(p.writes.map((w) => w.id), ['m1']);
      t.deepEqual(p.writes[0].op === 'create' ? p.writes[0].data : null, { from: 'parent', text: 'hello m1', at: TS, by: 'uid-parent' });
      t.equal(p.writes[0].path, 'families/fam1/children/c1/messages/m1');
      t.deepEqual(p.nextLocal.map((m) => m.id), ['m1']);
      const c = reconcileList(SCHEMA.messages, { local: [asParent, asChild], base: new Map(), remote: new Map(), ctx: kid, childId: 'c1' });
      t.deepEqual(c.writes.map((w) => w.id), ['m2']);
      t.deepEqual(c.nextLocal.map((m) => m.id), ['m2']);
    },
  },
  {
    name: 'role: a child device only writes under its own child',
    run(t) {
      const other = ctxOf('child', 'c2');
      const r = reconcileList(SCHEMA.messages, { local: [message('m1', 'c1', 'child')], base: new Map(), remote: new Map(), ctx: other });
      t.deepEqual(r.writes, []);
      t.deepEqual(r.nextLocal, []);
      const q = reconcileList(SCHEMA.requests, { local: [request('r1', 'c1')], base: new Map(), remote: new Map(), ctx: other });
      t.deepEqual(q.writes, []);
    },
  },
  {
    name: 'role: only a child creates a request, always pending, and cannot change or remove it afterwards',
    run(t) {
      const mine = request('r1', 'c1');
      const created = reconcileList(SCHEMA.requests, { local: [mine], base: new Map(), remote: new Map(), ctx: kid, childId: 'c1' });
      t.equal(created.writes.length, 1);
      t.deepEqual(created.writes[0].op === 'create' ? created.writes[0].data : null, { kind: 'extra_time', label: '30 more minutes', detail: 'You asked for extra screen time', minutes: 30, status: 'pending', at: TS, by: 'uid-c1' });
      const byParent = reconcileList(SCHEMA.requests, { local: [mine], base: new Map(), remote: new Map(), ctx: parent, childId: 'c1' });
      t.deepEqual(byParent.writes, []);
      t.deepEqual(byParent.nextLocal, []);
      // Approved by itself before it was even sent: created pending, and the local copy is put back.
      const cheeky = reconcileList(SCHEMA.requests, { local: [request('r2', 'c1', { status: 'approved' })], base: new Map(), remote: new Map(), ctx: kid, childId: 'c1' });
      t.equal(cheeky.writes.length, 1);
      t.equal((cheeky.writes[0].op === 'create' ? cheeky.writes[0].data : {}).status, 'pending');
      t.equal(cheeky.nextLocal[0].status, 'pending');
      // And after it exists.
      const selfApproved = reconcileList(SCHEMA.requests, { local: [request('r1', 'c1', { status: 'approved' })], base: mapOf(mine), remote: mapOf(mine), ctx: kid, childId: 'c1' });
      t.deepEqual(selfApproved.writes, []);
      t.equal(selfApproved.nextLocal[0].status, 'pending');
      const removed = reconcileList(SCHEMA.requests, { local: [], base: mapOf(mine), remote: mapOf(mine), ctx: kid, childId: 'c1' });
      t.deepEqual(removed.writes, []);
      t.deepEqual(removed.nextLocal, [mine]);
    },
  },
  {
    name: 'role: a parent answers a pending request once: status plus resolvedBy and resolvedAt, nothing else',
    run(t) {
      const stored = request('r1', 'c1');
      const r = reconcileList(SCHEMA.requests, { local: [request('r1', 'c1', { status: 'approved' })], base: mapOf(stored), remote: mapOf(stored), ctx: parent, childId: 'c1' });
      t.deepEqual(r.writes, [
        {
          op: 'update',
          slice: 'requests',
          id: 'r1',
          childId: 'c1',
          path: 'families/fam1/children/c1/requests/r1',
          fields: { status: 'approved', resolvedBy: 'uid-parent', resolvedAt: TS },
          patch: { status: 'approved' },
        },
      ]);
      const edited = reconcileList(SCHEMA.requests, { local: [request('r1', 'c1', { label: 'Other', minutes: 240 })], base: mapOf(stored), remote: mapOf(stored), ctx: parent, childId: 'c1' });
      t.deepEqual(edited.writes, []);
      t.deepEqual(edited.nextLocal, [stored]);
      const removed = reconcileList(SCHEMA.requests, { local: [], base: mapOf(stored), remote: mapOf(stored), ctx: parent, childId: 'c1' });
      t.deepEqual(removed.writes.map((w) => `${w.op} ${w.path}`), ['delete families/fam1/children/c1/requests/r1']);
    },
  },
  {
    name: 'role: an approval is never undone: an answered request cannot be answered again or set back',
    run(t) {
      const pending = request('r1', 'c1');
      const approved = request('r1', 'c1', { status: 'approved' });
      // The other parent answered first: my "denied" is not sent and I see "approved".
      const late = reconcileList(SCHEMA.requests, { local: [request('r1', 'c1', { status: 'denied' })], base: mapOf(pending), remote: mapOf(approved), ctx: parent, childId: 'c1' });
      t.deepEqual(late.writes, []);
      t.equal(late.nextLocal[0].status, 'approved');
      t.equal(late.reverted[0].reason, 'stale');
      // Set back to pending locally (a stale copy, a bug): put back, nothing sent.
      for (const ctx of [parent, kid]) {
        const undo = reconcileList(SCHEMA.requests, { local: [pending], base: mapOf(approved), remote: mapOf(approved), ctx, childId: 'c1' });
        t.deepEqual(undo.writes, []);
        t.equal(undo.nextLocal[0].status, 'approved');
      }
      // A child that was closed while the parent approved: its old copy is simply replaced.
      const coldStart = reconcileList(SCHEMA.requests, { local: [pending], base: mapOf(pending), remote: mapOf(approved), ctx: kid, childId: 'c1' });
      noWrites(t, coldStart);
      t.equal(coldStart.nextLocal[0].status, 'approved');
      // My own answer is on its way: a second, different tap is not sent on top of it.
      const first = reconcileList(SCHEMA.requests, { local: [approved], base: mapOf(pending), remote: mapOf(pending), ctx: parent, childId: 'c1' });
      const second = reconcileList(SCHEMA.requests, { local: [request('r1', 'c1', { status: 'denied' })], base: first.nextBase, remote: mapOf(pending), ctx: parent, inFlight: first.writes, childId: 'c1' });
      t.deepEqual(second.writes, []);
      t.equal(second.nextLocal[0].status, 'approved');
    },
  },
  {
    name: 'role: alerts: a child adds its own check-in, SOS, request and left alerts and nothing else',
    run(t) {
      const mine = alert('n1');
      const r = reconcileList(SCHEMA.alerts, { local: [mine], base: new Map(), remote: new Map(), ctx: kid });
      t.equal(r.writes.length, 1);
      t.deepEqual(r.writes[0].op === 'create' ? r.writes[0].data : null, { kind: 'checkin', childId: 'c1', icon: 'map-pin', color: '#2E8BFF', title: 'Kid checked in', body: 'At 3:00 PM', unread: true, at: TS, by: 'uid-c1' });
      for (const bad of [alert('n2', { kind: 'info' }), alert('n3', { childId: 'c2' }), alert('n4', { childId: null }), alert('n5', { kind: undefined })]) {
        const refused = reconcileList(SCHEMA.alerts, { local: [bad], base: new Map(), remote: new Map(), ctx: kid });
        t.deepEqual(refused.writes, [], bad.id);
        t.deepEqual(refused.nextLocal, []);
      }
      // Read locally before it was sent: still created unread, and the local copy is put back.
      const read = reconcileList(SCHEMA.alerts, { local: [alert('n6', { unread: false })], base: new Map(), remote: new Map(), ctx: kid });
      t.equal(read.writes.length, 1);
      t.equal(read.nextLocal[0].unread, true);
    },
  },
  {
    name: 'role: alerts: a parent may only mark one read, or delete it',
    run(t) {
      const stored = alert('n1');
      const read = reconcileList(SCHEMA.alerts, { local: [alert('n1', { unread: false })], base: mapOf(stored), remote: mapOf(stored), ctx: parent });
      t.deepEqual(read.writes.map((w) => (w.op === 'update' ? w.fields : null)), [{ unread: false }]);
      const unread = reconcileList(SCHEMA.alerts, { local: [stored], base: mapOf(alert('n1', { unread: false })), remote: mapOf(alert('n1', { unread: false })), ctx: parent });
      t.deepEqual(unread.writes, []);
      t.equal(unread.nextLocal[0].unread, false);
      const retitled = reconcileList(SCHEMA.alerts, { local: [alert('n1', { title: 'Changed', unread: false })], base: mapOf(stored), remote: mapOf(stored), ctx: parent });
      t.deepEqual(retitled.writes.map((w) => (w.op === 'update' ? w.fields : null)), [{ unread: false }]);
      t.equal(retitled.nextLocal[0].title, 'Kid checked in');
      const removed = reconcileList(SCHEMA.alerts, { local: [], base: mapOf(stored), remote: mapOf(stored), ctx: parent });
      t.deepEqual(removed.writes.map((w) => w.op), ['delete']);
      // A parent's own alert that was read before it was sent: created unread, then marked read.
      const own = reconcileList(SCHEMA.alerts, { local: [alert('n9', { kind: 'note', childId: null, unread: false })], base: new Map(), remote: new Map(), ctx: parent });
      t.deepEqual(own.writes.map((w) => w.op), ['create', 'update']);
      t.equal(own.nextLocal[0].unread, false);
    },
  },
  {
    name: 'role: children are created and changed by a parent and never deleted',
    run(t) {
      const stored = child('c1');
      const added = reconcileList(SCHEMA.children, { local: [stored, child('c9', { name: 'New' })], base: mapOf(stored), remote: mapOf(stored), ctx: parent });
      t.deepEqual(added.writes.map((w) => `${w.op} ${w.path}`), ['create families/fam1/children/c9']);
      const data = added.writes[0].op === 'create' ? added.writes[0].data : {};
      t.deepEqual(Object.keys(data).sort(), ['age', 'apps', 'battery', 'bedtime', 'deviceName', 'limitMin', 'name', 'online', 'ord', 'place', 'placeIcon', 'usedMin', 'weekly']);
      const removed = reconcileList(SCHEMA.children, { local: [], base: mapOf(stored), remote: mapOf(stored), ctx: parent });
      t.deepEqual(removed.writes, []);
      t.deepEqual(removed.nextLocal, [stored]);
    },
  },
  {
    name: 'values: what the server would refuse is put back and never sent',
    run(t) {
      const stored = child('c1');
      const tooHigh = reconcileList(SCHEMA.children, { local: [child('c1', { limitMin: 2000 })], base: mapOf(stored), remote: mapOf(stored), ctx: parent });
      t.deepEqual(tooHigh.writes, []);
      t.equal(tooHigh.nextLocal[0].limitMin, 240);
      t.equal(tooHigh.reverted[0].reason, 'invalid');
      const longHost = reconcileList(SCHEMA.sites, { local: [site('w1', { host: `${'h'.repeat(254)}` })], base: new Map(), remote: new Map(), ctx: parent });
      t.deepEqual(longHost.writes, []);
      t.deepEqual(longHost.nextLocal, []);
      t.equal(longHost.reverted[0].reason, 'invalid');
      const badId = reconcileList(SCHEMA.places, { local: [place('not a valid/id')], base: new Map(), remote: new Map(), ctx: parent });
      t.deepEqual(badId.writes, []);
    },
  },

  // ---- order, labels, scope ---------------------------------------------------------------
  {
    name: 'order: ord slices follow the snapshot; at slices are sorted by time',
    run(t) {
      const r = places([place('p2'), place('p1'), place('pNew')], [place('p1'), place('p2')], [place('p1'), place('p2')]);
      t.deepEqual(r.nextLocal.map((p) => p.id), ['p1', 'p2', 'pNew']);
      const msgs = reconcileList(SCHEMA.messages, {
        local: [message('m9', 'c1', 'parent', { at: 5000 })],
        base: new Map(),
        remote: mapOf(message('m3', 'c1', 'child', { at: 3000 }), message('m1', 'c1', 'child', { at: 1000 })),
        ctx: parent,
        childId: 'c1',
      });
      t.deepEqual(msgs.nextLocal.map((m) => m.id), ['m1', 'm3', 'm9'], 'oldest first, whatever order the query used');
      const reqs = reconcileList(SCHEMA.requests, {
        local: [],
        base: new Map(),
        remote: mapOf(request('r1', 'c1', { at: 1000 }), request('r3', 'c1', { at: 3000 }), request('r2', 'c1', { at: 2000 })),
        ctx: parent,
        childId: 'c1',
      });
      t.deepEqual(reqs.nextLocal.map((m) => m.id), ['r3', 'r2', 'r1'], 'newest first');
    },
  },
  {
    name: 'labels: never compared, never written; the server time replaces the local one',
    run(t) {
      const mine = message('m1', 'c1', 'parent', { at: 1000, time: '3:00 PM' });
      const created = reconcileList(SCHEMA.messages, { local: [mine], base: new Map(), remote: new Map(), ctx: parent, childId: 'c1' });
      const data = created.writes[0].op === 'create' ? created.writes[0].data : {};
      t.deepEqual(Object.keys(data).sort(), ['at', 'by', 'from', 'text']);
      t.equal(data.at, TS, 'the server time comes from the sentinel, not from the device');
      // The pending snapshot has no time yet (null decodes to "no at"): the local time is kept.
      const pending = SCHEMA.messages.fromDoc('m1', { from: 'parent', text: 'hello m1', at: null, by: 'uid-parent' }, parent, 'c1');
      const during = reconcileList(SCHEMA.messages, { local: created.nextLocal, base: created.nextBase, remote: mapOf(pending!), ctx: parent, inFlight: created.writes, childId: 'c1' });
      t.equal(during.changed, false);
      t.equal(during.nextLocal[0].at, 1000);
      // Confirmed: the server's time, the label untouched.
      const confirmed = SCHEMA.messages.fromDoc('m1', { from: 'parent', text: 'hello m1', at: 9000, by: 'uid-parent' }, parent, 'c1');
      const after = reconcileList(SCHEMA.messages, { local: during.nextLocal, base: during.nextBase, remote: mapOf(confirmed!), ctx: parent, childId: 'c1' });
      t.deepEqual(after.writes, []);
      t.equal(after.nextLocal[0].at, 9000);
      t.equal(after.nextLocal[0].time, '3:00 PM');
      // A label that differs is not a change.
      const relabelled = reconcileList(SCHEMA.messages, { local: [{ ...after.nextLocal[0], time: 'earlier' }], base: after.nextBase, remote: mapOf(confirmed!), ctx: parent, childId: 'c1' });
      noWrites(t, relabelled);
      t.equal(relabelled.changed, false);
    },
  },
  {
    name: 'scope: one child\'s listener only touches that child\'s items',
    run(t) {
      const a = request('ra', 'c1', { at: 1000 });
      const b = request('rb', 'c2', { at: 2000 });
      // c1's listener says ra is gone. rb belongs to c2, whose listener has not said anything.
      const r = reconcileList(SCHEMA.requests, { local: [b, a], base: mapOf(a), remote: new Map(), ctx: parent, childId: 'c1' });
      noWrites(t, r);
      t.deepEqual(r.nextLocal, [b]);
      const add = reconcileList(SCHEMA.requests, { local: [b], base: new Map(), remote: mapOf(request('rc', 'c1', { at: 3000 })), ctx: parent, childId: 'c1' });
      t.deepEqual(add.nextLocal.map((x) => x.id), ['rc', 'rb']);
      t.deepEqual([...add.nextBase.keys()], ['rc'], 'the base is this listener\'s only');
    },
  },
  {
    name: 'scope: dropOrphans removes items of children this device does not know',
    run(t) {
      const list = [message('m1', 'c1', 'parent'), message('m2', 'sample-c1', 'parent')];
      const r = dropOrphans(list, new Set(['c1']));
      t.deepEqual(r.nextLocal.map((m) => m.id), ['m1']);
      t.deepEqual(r.dropped.map((m) => m.id), ['m2']);
      const same2 = dropOrphans(list, new Set(['c1', 'sample-c1']));
      t.equal(same2.nextLocal, list);
    },
  },

  // ---- adopt and restart ------------------------------------------------------------------
  {
    name: 'adopt: local is replaced by remote wholesale and nothing is written',
    run(t) {
      const sample = [place('sample-p1'), place('sample-p2')];
      const r = reconcileList(P, { local: sample, base: new Map(), remote: mapOf(place('p1'), place('p2')), ctx: parent, mode: 'adopt' });
      noWrites(t, r);
      t.deepEqual(r.nextLocal, [place('p1'), place('p2')]);
      t.deepEqual([...r.nextBase.keys()], ['p1', 'p2']);
      // The same data in sync mode would have been uploaded: that is the defect adopt exists for.
      const wrong = reconcileList(P, { local: sample, base: new Map(), remote: mapOf(place('p1')), ctx: parent });
      t.equal(wrong.writes.length, 2);
      // An empty family stays empty.
      const empty = reconcileList(P, { local: sample, base: new Map(), remote: new Map(), ctx: parent, mode: 'adopt' });
      noWrites(t, empty);
      t.deepEqual(empty.nextLocal, []);
    },
  },
  {
    name: 'restart: only what never reached the server is sent again',
    run(t) {
      const confirmed = mapOf(place('p1'), place('p2'), place('p3'));
      const local = [place('p1', { arrive: false }), place('p3'), place('pNew'), place('pSent')];
      // p1: changed, never sent. p2: removed, never sent. pNew: never sent. pSent: had arrived.
      const remote = mapOf(place('p1'), place('p2'), place('p3'), place('pSent'));
      const r = regenerateAfterRestart(P, { local, confirmed, remote, ctx: parent });
      t.deepEqual(r.writes.map((w) => `${w.op} ${w.id}`).sort(), ['create pNew', 'delete p2', 'update p1']);
      // And when all of it had arrived before the kill: nothing.
      const arrived = mapOf(place('p1', { arrive: false }), place('p3'), place('pNew'), place('pSent'));
      const none = regenerateAfterRestart(P, { local, confirmed, remote: arrived, ctx: parent });
      noWrites(t, none);
    },
  },
  {
    name: 'restart: a child that was closed while its request was approved does not push its old copy',
    run(t) {
      // The old engine's worst defect: the cold start changed a label and the whole item went back.
      const saved = request('r1', 'c1', { ago: 'earlier' });
      const r = regenerateAfterRestart(SCHEMA.requests, {
        local: [saved],
        confirmed: mapOf(request('r1', 'c1')),
        remote: mapOf(request('r1', 'c1', { status: 'approved' })),
        ctx: kid,
        childId: 'c1',
      });
      noWrites(t, r);
      t.equal(r.nextLocal[0].status, 'approved');
    },
  },

  // ---- the confirmed copy -----------------------------------------------------------------
  {
    name: 'confirmed: only takes what the server has confirmed',
    run(t) {
      const before = mapOf(place('p1'), place('p2'), place('p3'));
      const update: Write = { op: 'update', slice: 'places', id: 'p1', path: 'x', fields: { arrive: false }, patch: { arrive: false } };
      const create: Write = { op: 'create', slice: 'places', id: 'pNew', path: 'x', data: {}, item: place('pNew') };
      const del: Write = { op: 'delete', slice: 'places', id: 'p3', path: 'x' };
      // The snapshot: p1 with our pending change and somebody else's rename, p2 renamed, pNew pending, p3 hidden by our delete.
      const remote = mapOf(place('p1', { arrive: false, name: 'Renamed elsewhere' }), place('p2', { name: 'Two' }), place('pNew'));
      const next = advanceConfirmed(P as unknown as ListSpec, before, remote, new Set(['p1', 'pNew']), [update, create, del]);
      t.deepEqual(next.get('p1'), place('p1', { name: 'Renamed elsewhere' }), 'our unconfirmed field keeps its confirmed value, the rest is the server\'s');
      t.deepEqual(next.get('p2'), place('p2', { name: 'Two' }));
      t.ok(!next.has('pNew'), 'a pending create is not confirmed');
      t.deepEqual(next.get('p3'), place('p3'), 'a pending delete is not confirmed');
      // Once nothing is pending the snapshot is the confirmed copy.
      const settled = advanceConfirmed(P as unknown as ListSpec, next, mapOf(place('p1', { arrive: false }), place('pNew')), new Set(), []);
      t.deepEqual([...settled.keys()], ['p1', 'pNew']);
    },
  },

  // ---- one listener's bookkeeping ---------------------------------------------------------
  {
    name: 'gate (rule 1): nothing is reconciled or pushed before the first snapshot from the server',
    run(t) {
      const local = [place('p1'), place('pNew')];
      let state = startList<Place>({ confirmed: [place('p1'), place('p2')] });
      // An empty snapshot from the cache is not "everything deleted".
      state = onListSnapshot(P, state, decodeSnapshot(P, [], parent), { fromCache: true }, []);
      t.equal(state.ready, false);
      const idle = stepList(P, state, local, parent, []);
      t.deepEqual(idle.writes, []);
      t.equal(idle.nextLocal, local);
      // The server answers: now the local changes go out.
      const docs = [
        { id: 'p1', data: { name: 'Place p1', icon: 'home', radius: 150, arrive: true, leave: true, ord: 0 }, pending: false },
        { id: 'p2', data: { name: 'Place p2', icon: 'home', radius: 150, arrive: true, leave: true, ord: 1 }, pending: false },
      ];
      state = onListSnapshot(P, state, decodeSnapshot(P, docs, parent), { fromCache: false }, []);
      t.equal(state.ready, true);
      const step = stepList(P, state, local, parent, []);
      t.deepEqual(step.writes.map((w) => `${w.op} ${w.id}`).sort(), ['create pNew', 'delete p2']);
      // After that a cache snapshot (offline) is taken as it comes.
      const offline = onListSnapshot(P, step.state, decodeSnapshot(P, docs.slice(0, 1), parent), { fromCache: true }, step.writes);
      t.equal(offline.ready, true);
      // A listener that is attached again starts behind the gate again.
      t.equal(relisten(offline).ready, false);
      t.equal(relisten(offline).remote, null);
      t.equal(relisten(offline).confirmed, offline.confirmed);
    },
  },
  {
    name: 'adopt flag (rule 2): the first step after joining writes nothing, the next one is normal',
    run(t) {
      let state = startList<Place>({ adopt: true });
      const sample = [place('sample-p1')];
      const before = stepList(P, state, sample, parent, []);
      t.equal(before.nextLocal, sample, 'still waiting for the server');
      t.equal(before.state.adopt, true);
      state = onListSnapshot(P, state, { remote: mapOf(place('p1')), pending: new Set() }, { fromCache: false }, []);
      const adopted = stepList(P, state, sample, parent, []);
      t.deepEqual(adopted.writes, []);
      t.deepEqual(adopted.nextLocal, [place('p1')]);
      t.equal(adopted.state.adopt, false);
      const then = stepList(P, adopted.state, [...adopted.nextLocal, place('pNew')], parent, []);
      t.deepEqual(then.writes.map((w) => w.op), ['create']);
    },
  },
  {
    name: 'settleList: an acknowledged write becomes confirmed; a refused one changes nothing here',
    run(t) {
      let state = startList<Place>({ confirmed: [place('p1')] });
      state = onListSnapshot(P, state, { remote: mapOf(place('p1')), pending: new Set() }, { fromCache: false }, []);
      const step = stepList(P, state, [place('p1', { arrive: false }), place('pNew')], parent, []);
      state = step.state;
      // The SDK shows both as pending.
      state = onListSnapshot(P, state, { remote: mapOf(place('p1', { arrive: false }), place('pNew')), pending: new Set(['p1', 'pNew']) }, { fromCache: false }, step.writes);
      t.deepEqual(state.confirmed.get('p1'), place('p1'));
      t.ok(!state.confirmed.has('pNew'));
      const create = step.writes.find((w) => w.op === 'create') as Write;
      const update = step.writes.find((w) => w.op === 'update') as Write;
      const refused = settleList(P, state, create, false);
      t.equal(refused, state);
      const ok = settleList(P, settleList(P, state, create, true), update, true);
      t.deepEqual(ok.confirmed.get('p1'), place('p1', { arrive: false }));
      t.ok(ok.confirmed.has('pNew'));
    },
  },
  {
    name: 'write-only (a child and the alerts): sent once, kept, pruned, and put back when refused',
    run(t) {
      let state = startWriteOnly<ReturnType<typeof alert>>({ adopt: true });
      // Joining: the sample alerts go, nothing is written.
      const joined = stepList(SCHEMA.alerts, state, [alert('sample-n1', { kind: undefined, childId: undefined })], kid, []);
      t.deepEqual(joined.writes, []);
      t.deepEqual(joined.nextLocal, []);
      state = joined.state;
      const a1 = alert('n1', { at: 1000 });
      const first = stepList(SCHEMA.alerts, state, [a1], kid, []);
      t.equal(first.writes.length, 1);
      state = first.state;
      // In flight: silent.
      t.deepEqual(stepList(SCHEMA.alerts, state, [a1], kid, first.writes).writes, []);
      // Acknowledged: kept, and never sent again, also after a restart from the saved confirmed copy.
      state = settleList(SCHEMA.alerts, state, first.writes[0], true);
      t.deepEqual(stepList(SCHEMA.alerts, state, [a1], kid, []).writes, []);
      const restarted = startWriteOnly({ confirmed: [...state.confirmed.values()] });
      t.deepEqual(stepList(SCHEMA.alerts, restarted, [a1], kid, []).writes, []);
      // A second one is refused: it goes, with no retry.
      const a2 = alert('n2', { at: 2000 });
      const second = stepList(SCHEMA.alerts, state, [a2, a1], kid, []);
      t.equal(second.writes.length, 1);
      const afterRefusal = stepList(SCHEMA.alerts, settleList(SCHEMA.alerts, second.state, second.writes[0], false), second.nextLocal, kid, []);
      t.deepEqual(afterRefusal.writes, []);
      t.deepEqual(afterRefusal.nextLocal.map((a) => a.id), ['n1']);
      // Pruning forgets the oldest acknowledged ones without writing.
      let many = state;
      const list = [a1];
      for (let i = 3; i < 8; i++) {
        const next = alert(`n${i}`, { at: i * 1000 });
        list.unshift(next);
        const step = stepList(SCHEMA.alerts, many, list, kid, []);
        many = settleList(SCHEMA.alerts, step.state, step.writes[0], true);
      }
      const pruned = stepList(SCHEMA.alerts, pruneWriteOnly(many, 3), list, kid, []);
      t.deepEqual(pruned.writes, []);
      t.deepEqual(pruned.nextLocal.map((a) => a.id), ['n7', 'n6', 'n5']);
    },
  },

  // ---- rebase (the store's side of applying a patch) ---------------------------------------
  {
    name: 'rebaseList: a change made here while a patch was being worked out is replayed on top of it',
    run(t) {
      const from = [place('p1'), place('p2'), place('p3')];
      const to = [place('p1', { name: 'From the family' }), place('p3'), place('p4')];
      t.equal(rebaseList(from, to, from), to, 'nothing happened in the meantime');
      const current = [place('p1', { arrive: false }), place('p2'), place('pMine')];
      // Meanwhile here: p1.arrive toggled, p3 removed, pMine added.
      const out = rebaseList(from, to, current);
      t.deepEqual(out, [place('p1', { name: 'From the family', arrive: false }), place('p4'), place('pMine')]);
      // Added in front (alerts, requests) stays in front.
      const front = rebaseList([request('r1', 'c1')], [request('r1', 'c1', { status: 'approved' })], [request('r2', 'c1'), request('r1', 'c1')]);
      t.deepEqual(front.map((r) => `${r.id}:${r.status}`), ['r2:pending', 'r1:approved']);
    },
  },
];
