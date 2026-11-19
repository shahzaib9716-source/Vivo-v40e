import assert from 'node:assert/strict';
import { decideExtraTime } from '../../src/sync/extraTime.ts';
import { before, after, beforeEach, test } from 'node:test';
import { getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { harness, A, FAM_A, ref, allowed, refused } from './helpers.mjs';

const h = harness();
before(() => h.start());
beforeEach(() => h.ensure('arranged'));
after(() => h.stop());
const at = (actor, path) => ref(h.a[actor], A('children/c1/' + path));
const fix = () => ({ by: h.a.kid1.selfId, latitude: 32, longitude: -90, accuracyM: 10, capturedAt: serverTimestamp() });
test('child location is bounded, authenticated and scoped to its family', async () => {
  const path = 'location/latest';
  await allowed(setDoc(at('kid1', path), fix()));
  await getDoc(at('founder', path));
  await refused(getDoc(at('kid2', path)));
  await refused(setDoc(at('founder', path), fix()));
  await refused(setDoc(at('kid1', path), { ...fix(), by: 'another' }));
  await refused(setDoc(at('kid1', path), { ...fix(), latitude: 91 }));
  await allowed(setDoc(at('kid1', path), { ...fix(), measuredAt: Date.now() }));
  for (const measuredAt of [-1, 1.5, 'yesterday', Date.now() + 3600000]) {
    await refused(setDoc(at('kid1', path), { ...fix(), measuredAt }));
  }
  await allowed(deleteDoc(at('kid1', path)));
});
test('only the enrolled child publishes or clears its usage report', async () => {
  const path = 'usage/latest';
  const report = { by: h.a.kid1.selfId, apps: [], screenMs: 1500, measuredAt: Date.now(), receivedAt: serverTimestamp() };
  await allowed(setDoc(at('kid1', path), report));
  await allowed(setDoc(at('kid1', path), { ...report, days: [{ day: '2026-11-19', ms: 1500 }] }));
  await refused(setDoc(at('kid1', path), { ...report, days: Array(8).fill({ day: '2026-11-19', ms: 1500 }) }));
  await getDoc(at('founder', path));
  await refused(getDoc(at('kid2', path)));
  await refused(setDoc(at('founder', path), report));
  await refused(deleteDoc(at('kid2', path)));
  await allowed(deleteDoc(at('kid1', path)));
});
test('only parents manage package policy within the daily bounds', async () => {
  const path = 'packageRules/com.example.game';
  await allowed(setDoc(at('founder', path), { minutes: 40, blocked: false }));
  await getDoc(at('kid1', path));
  await refused(getDoc(at('kid2', path)));
  await refused(setDoc(at('kid1', path), { minutes: 0, blocked: false }));
  await refused(setDoc(at('founder', path), { minutes: -1, blocked: false }));
});

test('install approval follows the existing parent-only decision path', async () => {
  const path = 'requests/install1';
  await allowed(setDoc(at('kid1', path), { kind: 'install_app', label: 'Chess', detail: 'Family approval', status: 'pending', by: h.a.kid1.selfId, at: serverTimestamp() }));
  await refused(setDoc(at('kid1', path), { status: 'approved', resolvedBy: h.a.kid1.selfId, resolvedAt: serverTimestamp() }, { merge: true }));
  await allowed(setDoc(at('founder', path), { status: 'approved', resolvedBy: h.a.founder.selfId, resolvedAt: serverTimestamp() }, { merge: true }));
});

test('concurrent approvals grant the requested time once', async () => {
  const id = 'moreTime';
  const parent = h.a.founder;
  const child = ref(parent, A('children/c1'));
  const limit = (await getDoc(child)).get('limitMin');
  await setDoc(at('kid1', 'requests/' + id), { kind: 'extra_time', label: 'More time', detail: '', minutes: 15, status: 'pending', by: h.a.kid1.selfId, at: serverTimestamp() });
  const decide = actor => decideExtraTime(actor.db, FAM_A, 'c1', id, actor.selfId, true);
  await assert.rejects(() => decide(h.a.kid1));
  const outcomes = await Promise.all([decide(parent), decide(h.a.parent2)]);
  assert.deepEqual(outcomes.sort(), ['Already answered.', 'Time request approved.']);
  assert.equal((await getDoc(child)).get('limitMin'), Math.min(1440, limit + 15));
});
