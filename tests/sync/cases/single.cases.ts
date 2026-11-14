/** The two single documents: the SOS flag and a child's check-in time. */
import { onDocSnapshot, reconcileSos, reconcileStatus, relistenDoc, startDoc, stepSos, stepStatus, type Write } from '@/sync/reconcile';
import type { SosDoc, SosLocal, StatusDoc } from '@/sync/schema';
import type { Case } from '../support/assert';
import { child, ctxOf, TS } from '../support/fixtures';

const parent = ctxOf('parent');
const kid = ctxOf('child', 'c1');
const other = ctxOf('child', 'c2');

const OFF: SosLocal = { sosActive: false, sosChildId: null };
const on = (childId: string): SosLocal => ({ sosActive: true, sosChildId: childId });
const doc = (active: boolean, childId: string | null, at: number | null = 100): SosDoc => ({ active, childId, at });

export const cases: Case[] = [
  {
    name: 'sos: not changed here: take the server\'s',
    run(t) {
      const raised = reconcileSos({ local: OFF, base: null, remote: doc(true, 'c1'), ctx: parent });
      t.deepEqual(raised.writes, []);
      t.deepEqual(raised.nextLocal, on('c1'));
      t.equal(raised.changed, true);
      const cleared = reconcileSos({ local: on('c1'), base: doc(true, 'c1'), remote: doc(false, 'c1', 200), ctx: kid });
      t.deepEqual(cleared.nextLocal, OFF);
      const nothing = reconcileSos({ local: OFF, base: null, remote: null, ctx: kid });
      t.equal(nothing.changed, false);
      t.equal(nothing.nextLocal, OFF);
      // An old save may say "on" without naming a child.
      const unnamed = reconcileSos({ local: { sosActive: false, sosChildId: 'stale' }, base: doc(false, 'c1'), remote: doc(false, 'c1'), ctx: parent });
      t.equal(unnamed.changed, false);
    },
  },
  {
    name: 'sos: a child raises its own: the full document, with its own child id',
    run(t) {
      const r = reconcileSos({ local: on('c1'), base: null, remote: null, ctx: kid });
      t.deepEqual(r.writes, [{ op: 'set', slice: 'sos', id: 'sos', path: 'families/fam1/signals/sos', data: { active: true, childId: 'c1', by: 'uid-c1', at: TS }, value: { active: true, childId: 'c1', at: null } }]);
      t.equal(r.changed, false);
      t.deepEqual(r.nextBase, { active: true, childId: 'c1', at: null });
      // In flight: silent, whatever the snapshot says.
      for (const remote of [null, doc(true, 'c1', null), doc(false, 'c1', 50)]) {
        const again = reconcileSos({ local: on('c1'), base: r.nextBase, remote, ctx: kid, inFlight: r.writes });
        t.deepEqual(again.writes, []);
        t.deepEqual(again.nextLocal, on('c1'));
      }
      // Confirmed.
      const done = reconcileSos({ local: on('c1'), base: r.nextBase, remote: doc(true, 'c1', 300), ctx: kid });
      t.deepEqual(done.writes, []);
      t.deepEqual(done.nextBase, doc(true, 'c1', 300));
    },
  },
  {
    name: 'sos: a child may raise over another child\'s SOS; a parent can never raise',
    run(t) {
      const over = reconcileSos({ local: on('c1'), base: doc(true, 'c2'), remote: doc(true, 'c2'), ctx: kid });
      t.equal(over.writes.length, 1);
      const byParent = reconcileSos({ local: on('c1'), base: doc(false, 'c1'), remote: doc(false, 'c1'), ctx: parent });
      t.deepEqual(byParent.writes, []);
      t.deepEqual(byParent.nextLocal, OFF);
      t.equal(byParent.reverted[0].reason, 'role');
      const notMine = reconcileSos({ local: on('c2'), base: null, remote: null, ctx: kid });
      t.deepEqual(notMine.writes, []);
      t.deepEqual(notMine.nextLocal, OFF);
    },
  },
  {
    name: 'sos: a parent clears any SOS and keeps the stored child id',
    run(t) {
      const r = reconcileSos({ local: OFF, base: doc(true, 'c2'), remote: doc(true, 'c2'), ctx: parent });
      t.deepEqual(r.writes.map((w) => (w.op === 'set' ? w.data : null)), [{ active: false, childId: 'c2', by: 'uid-parent', at: TS }]);
      const none = reconcileSos({ local: OFF, base: doc(true, 'c2'), remote: doc(false, 'c2', 200), ctx: parent });
      t.deepEqual(none.writes, [], 'already off');
      const noDoc = reconcileSos({ local: OFF, base: null, remote: null, ctx: parent });
      t.deepEqual(noDoc.writes, [], 'no document: nothing to clear, nothing to create');
    },
  },
  {
    name: 'sos: a child clears its own SOS and cannot clear another child\'s',
    run(t) {
      const mine = reconcileSos({ local: OFF, base: doc(true, 'c1'), remote: doc(true, 'c1'), ctx: kid });
      t.deepEqual(mine.writes.map((w) => (w.op === 'set' ? w.data : null)), [{ active: false, childId: 'c1', by: 'uid-c1', at: TS }]);
      const theirs = reconcileSos({ local: OFF, base: doc(true, 'c1'), remote: doc(true, 'c1'), ctx: other });
      t.deepEqual(theirs.writes, []);
      t.deepEqual(theirs.nextLocal, on('c1'));
      t.equal(theirs.reverted[0].reason, 'role');
      // Raised and cleared before the raise was even confirmed.
      const raised = reconcileSos({ local: on('c1'), base: null, remote: null, ctx: kid });
      const quick = reconcileSos({ local: OFF, base: raised.nextBase, remote: null, ctx: kid, inFlight: raised.writes });
      t.deepEqual(quick.writes.map((w) => (w.op === 'set' ? w.data.active : null)), [false]);
    },
  },
  {
    name: 'sos: marking an old alarm safe does not silence a newer one',
    run(t) {
      // The parent saw the SOS of 100, went offline, tapped "mark as safe". Meanwhile it was cleared and raised again at 900.
      const stale = reconcileSos({ local: OFF, base: doc(true, 'c1', 100), remote: doc(true, 'c1', 900), ctx: parent });
      t.deepEqual(stale.writes, []);
      t.deepEqual(stale.nextLocal, on('c1'));
      t.equal(stale.reverted[0].reason, 'stale');
      const child2 = reconcileSos({ local: OFF, base: doc(true, 'c1', 100), remote: doc(true, 'c1', 900), ctx: kid });
      t.deepEqual(child2.writes, []);
      // The same alarm (same time): cleared.
      const same = reconcileSos({ local: OFF, base: doc(true, 'c1', 100), remote: doc(true, 'c1', 100), ctx: parent });
      t.equal(same.writes.length, 1);
    },
  },
  {
    name: 'sos: adopt takes the server\'s and writes nothing; a refused write falls back by itself',
    run(t) {
      const adopt = reconcileSos({ local: on('sample-c1'), base: null, remote: null, ctx: parent, mode: 'adopt' });
      t.deepEqual(adopt.writes, []);
      t.deepEqual(adopt.nextLocal, OFF);
      const cleared = reconcileSos({ local: OFF, base: doc(true, 'c2'), remote: doc(true, 'c2'), ctx: kid.childId === 'c1' ? ctxOf('child', 'c2') : kid });
      // The server refused (another child raised in between): the write leaves the list.
      const after = reconcileSos({ local: OFF, base: cleared.nextBase, remote: doc(true, 'c1', 500), ctx: ctxOf('child', 'c2'), inFlight: [] });
      t.deepEqual(after.writes, [], 'no retry');
      t.deepEqual(after.nextLocal, on('c1'));
    },
  },
  {
    name: 'sos: the listener state: gate, adopt, confirmed',
    run(t) {
      let state = startDoc<SosDoc>({ adopt: true });
      t.equal(stepSos(state, on('sample'), kid, []).changed, false, 'before the server answered nothing happens');
      state = onDocSnapshot(state, null, { fromCache: true, pending: false });
      t.equal(state.ready, false);
      state = onDocSnapshot(state, doc(true, 'c2', 10), { fromCache: false, pending: false });
      const adopted = stepSos(state, OFF, kid, []);
      t.deepEqual(adopted.nextLocal, on('c2'));
      t.equal(adopted.state.adopt, false);
      state = adopted.state;
      const raise = stepSos(state, on('c1'), kid, []);
      t.equal(raise.writes.length, 1);
      state = onDocSnapshot(raise.state, doc(true, 'c1', null), { fromCache: false, pending: true });
      t.deepEqual(state.confirmed, doc(true, 'c2', 10), 'a pending document is not confirmed');
      state = onDocSnapshot(state, doc(true, 'c1', 20), { fromCache: false, pending: false });
      t.deepEqual(state.confirmed, doc(true, 'c1', 20));
      t.equal(relistenDoc(state).ready, false);
    },
  },

  // ---- check-in ---------------------------------------------------------------------------
  {
    name: 'status: the child\'s own check-in is written as the server\'s time',
    run(t) {
      const local = [child('c1', { checkInAt: 5000, updatedAgo: 'just now' })];
      const r = reconcileStatus({ local, childId: 'c1', base: null, remote: null, ctx: kid });
      t.deepEqual(r.writes, [{ op: 'set', slice: 'status', id: 'status', childId: 'c1', path: 'families/fam1/children/c1/live/status', data: { checkInAt: TS, by: 'uid-c1' }, value: { checkInAt: 5000 } }]);
      t.equal(r.nextLocal, local);
      // In flight and pending: silent.
      const during = reconcileStatus({ local, childId: 'c1', base: r.nextBase, remote: { checkInAt: null }, ctx: kid, inFlight: r.writes });
      t.deepEqual(during.writes, []);
      t.equal(during.changed, false);
      // Confirmed: the server's time replaces the device's.
      const done = reconcileStatus({ local, childId: 'c1', base: during.nextBase, remote: { checkInAt: 5120 }, ctx: kid });
      t.deepEqual(done.writes, []);
      t.equal(done.nextLocal[0].checkInAt, 5120);
      t.equal(done.nextLocal[0].updatedAgo, 'just now', 'labels are left alone');
      // And again later.
      const again = reconcileStatus({ local: [{ ...done.nextLocal[0], checkInAt: 9000 }], childId: 'c1', base: done.nextBase, remote: { checkInAt: 5120 }, ctx: kid });
      t.equal(again.writes.length, 1);
    },
  },
  {
    name: 'status: two check-ins in a row are two writes; an older local time is not sent',
    run(t) {
      const first = reconcileStatus({ local: [child('c1', { checkInAt: 5000 })], childId: 'c1', base: null, remote: null, ctx: kid });
      const second = reconcileStatus({ local: [child('c1', { checkInAt: 6000 })], childId: 'c1', base: first.nextBase, remote: null, ctx: kid, inFlight: first.writes });
      t.equal(second.writes.length, 1);
      // After a restart: the check-in had arrived (server 5120 >= local 5000), so it is not sent again.
      const restarted = reconcileStatus({ local: [child('c1', { checkInAt: 5000 })], childId: 'c1', base: { checkInAt: 1000 }, remote: { checkInAt: 5120 }, ctx: kid });
      t.deepEqual(restarted.writes, []);
      t.equal(restarted.nextLocal[0].checkInAt, 5120);
      // After a restart: it had not arrived.
      const lost = reconcileStatus({ local: [child('c1', { checkInAt: 5000 })], childId: 'c1', base: { checkInAt: 1000 }, remote: { checkInAt: 1000 }, ctx: kid });
      t.equal(lost.writes.length, 1);
    },
  },
  {
    name: 'status: a parent only reads it; nobody writes another child\'s',
    run(t) {
      const shown = reconcileStatus({ local: [child('c1'), child('c2')], childId: 'c1', base: null, remote: { checkInAt: 7000 }, ctx: parent });
      t.deepEqual(shown.writes, []);
      t.equal(shown.nextLocal[0].checkInAt, 7000);
      t.equal(shown.nextLocal[1].checkInAt, undefined);
      const faked = reconcileStatus({ local: [child('c1', { checkInAt: 9999 })], childId: 'c1', base: { checkInAt: 7000 }, remote: { checkInAt: 7000 }, ctx: parent });
      t.deepEqual(faked.writes, []);
      t.equal(faked.nextLocal[0].checkInAt, 7000);
      t.equal(faked.reverted[0].reason, 'role');
      const sibling = reconcileStatus({ local: [child('c1', { checkInAt: 9999 })], childId: 'c1', base: null, remote: null, ctx: other });
      t.deepEqual(sibling.writes, []);
      t.ok(!('checkInAt' in sibling.nextLocal[0]));
      const noDoc = reconcileStatus({ local: [child('c1')], childId: 'c1', base: null, remote: null, ctx: parent });
      t.equal(noDoc.changed, false);
    },
  },
  {
    name: 'status: adopt, and a child that is not in the store yet',
    run(t) {
      const adopt = reconcileStatus({ local: [child('c1', { checkInAt: 123 })], childId: 'c1', base: null, remote: { checkInAt: 7000 }, ctx: kid, mode: 'adopt' });
      t.deepEqual(adopt.writes, []);
      t.equal(adopt.nextLocal[0].checkInAt, 7000);
      let state = startDoc<StatusDoc>({ adopt: true });
      state = onDocSnapshot(state, { checkInAt: 7000 }, { fromCache: false, pending: false });
      const early = stepStatus(state, [], 'c1', parent, []);
      t.equal(early.state.adopt, true, 'kept for when the child arrives');
      const later = stepStatus(early.state, [child('c1')], 'c1', parent, []);
      t.equal(later.nextLocal[0].checkInAt, 7000);
      t.equal(later.state.adopt, false);
      const write: Write[] = [];
      t.deepEqual(stepStatus(startDoc<StatusDoc>(), [child('c1', { checkInAt: 5 })], 'c1', kid, write).writes, [], 'behind the gate');
    },
  },
];
