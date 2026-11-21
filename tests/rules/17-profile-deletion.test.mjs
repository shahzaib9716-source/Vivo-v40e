import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { collection, deleteDoc, getDocFromServer, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { deleteProfile, finishProfileDeletion } from '../../src/sync/deleteProfile.ts';
import { A, B, FAM_A, U, allowed, harness, make, ref, refused } from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());
beforeEach(() => h.reset());

test('only a parent can atomically retire an existing child in their own family', async () => {
  const parent = h.a.founder;
  for (const who of ['kid1', 'kid2', 'parentB', 'anon', 'none']) {
    await refused(deleteProfile(h.a[who].db, FAM_A, 'c1'));
  }
  await refused(deleteDoc(ref(parent, A('children/c1'))));
  await refused(setDoc(ref(parent, A('children/c1')), { pending: true }));
  await allowed(deleteProfile(parent.db, FAM_A, 'c1'));
  await refused(setDoc(ref(parent, A('children/c1')), make.child()));
  await refused(setDoc(ref(parent, A('children/c1/settings/power')), { percent: 20 }));
  await refused(updateDoc(ref(parent, A('members/' + U.kid1)), { childId: 'c2' }));
  await refused(getDocFromServer(ref(h.a.kid1, A())));
  await refused(getDocs(collection(h.a.kid1.db, A('members'))));
  await refused(setDoc(ref(h.a.kid1, A('children/c1/live/status')), make.liveStatus(U.kid1)));
  assert.ok((await getDocFromServer(ref(h.a.kid2, A()))).exists());
  assert.ok(await h.peek(B('members/' + U.parentB)));
});

test('cleanup resumes after revocation, drains multiple pages, and preserves sibling records', async () => {
  const records = Object.fromEntries(Array.from({ length: 121 }, (_, i) => [A('children/c1/messages/page' + i), { text: 'older chat' }]));
  records[A('children/c1/photos/latest')] = { jpeg: 'old' };
  records[A('children/c2/photos/latest')] = { jpeg: 'keep' };
  await h.arrange(records);
  await deleteProfile(h.a.founder.db, FAM_A, 'c1');
  await finishProfileDeletion(h.a.parent2.db, FAM_A, 'c1');
  await finishProfileDeletion(h.a.founder.db, FAM_A, 'c1');
  for (const path of ['children/c1/photos/latest', 'children/c1/live/status', 'children/c1/messages/page120', 'children/c1/requests/r1',
    'members/' + U.kid1, 'devices/devKid1', 'alerts/n1', 'signals/sos']) assert.equal(await h.peek(A(path)), undefined, path);
  assert.equal(await h.peek('users/' + U.kid1), undefined);
  for (const path of ['children/c2/photos/latest', 'children/c2/messages/m4', 'devices/devKid2', 'members/' + U.kid2, 'alerts/n3']) {
    assert.ok(await h.peek(A(path)), path);
  }
  assert.deepEqual(await h.peek(A('children/c1')), { retired: true, pending: false });
});

test('a stale enrollment cannot remove an account pointer that names another family', async () => {
  await h.arrange({ ['users/' + U.kid1]: { familyId: 'anotherFamily', role: 'child' } });
  await deleteProfile(h.a.founder.db, FAM_A, 'c1');
  await finishProfileDeletion(h.a.founder.db, FAM_A, 'c1');
  assert.equal((await h.peek('users/' + U.kid1)).familyId, 'anotherFamily');
  assert.equal(await h.peek(A('members/' + U.kid1)), undefined);
});
