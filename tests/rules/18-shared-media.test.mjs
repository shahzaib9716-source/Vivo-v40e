import { after, before, beforeEach, test } from 'node:test';
import { deleteDoc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { A, allowed, allowedRead, harness, ref, refused } from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());
beforeEach(() => h.reset());

for (const [path, payload] of [['photos/screen', { jpeg: '/9j/AAAA' }], ['voice/latest', { audio: 'QUJDRA==' }]]) {
  test(path + ' accepts only the enrolled child and is visible only to that child and their parents', async () => {
    const target = who => ref(h.a[who], A('children/c1/' + path));
    const data = who => ({ ...payload, by: h.a[who].uid, at: serverTimestamp() });
    for (const who of ['founder', 'kid2', 'parentB', 'anon']) await refused(setDoc(target(who), data(who)));
    await allowed(setDoc(target('kid1'), data('kid1')));
    await allowedRead(getDoc(target('founder')));
    await refused(getDoc(target('parentB')));
    await refused(getDoc(target('kid2')));
    await refused(setDoc(target('kid1'), { ...data('kid1'), by: h.a.founder.uid }));
    await refused(deleteDoc(target('founder')));
    await allowed(deleteDoc(target('kid1')));
  });
}

test('profile picture editing belongs to the family parent', async () => {
  const target = who => ref(h.a[who], A('children/c1/photos/avatar'));
  await allowed(setDoc(target('founder'), { jpeg: '/9j/AAAA' }));
  await allowedRead(getDoc(target('kid1')));
  await refused(getDoc(target('kid2')));
  await refused(setDoc(target('kid1'), { jpeg: '/9j/BBBB' }));
  await refused(setDoc(target('founder'), { jpeg: 'wrong' }));
  await allowed(deleteDoc(target('founder')));
});

test('only the enrolled child can publish a timed trip fix, with an authenticated author and bounded coordinates', async () => {
  const target = (who, slot = '12') => ref(h.a[who], A('children/c1/tripPoints/' + slot));
  const point = { by: h.a.kid1.uid, latitude: 0, longitude: 1, accuracyM: 10, measuredAt: Date.now(), session: 'tripDemo', capturedAt: serverTimestamp() };
  await allowed(setDoc(target('kid1'), point));
  await allowedRead(getDoc(target('founder')));
  await refused(setDoc(target('founder'), { ...point, by: h.a.founder.uid }));
  await refused(getDoc(target('kid2')));
  await refused(setDoc(target('kid1', '240'), point));
  await refused(setDoc(target('kid1'), { ...point, latitude: 100 }));
  await refused(setDoc(target('kid1'), { ...point, session: '../other' }));
  await allowed(deleteDoc(target('kid1')));
});

test('requesting media requires the parent role and fulfillment requires a fresh child share', async () => {
  const path = A('children/c1/checkinRequests/screen');
  const parent = h.a.founder;
  const kid = h.a.kid1;
  const ask = { state: 'pending', id: 'req1', by: parent.uid, at: serverTimestamp() };
  await refused(setDoc(ref(kid, path), { ...ask, by: kid.uid }));
  await allowed(setDoc(ref(parent, path), ask));
  const { updateDoc, writeBatch } = await import('firebase/firestore');
  await refused(updateDoc(ref(parent, path), { state: 'fulfilled' }));
  await refused(updateDoc(ref(kid, path), { state: 'fulfilled' }));
  await refused(updateDoc(ref(h.a.kid2, path), { state: 'declined' }));
  const batch = writeBatch(kid.db);
  batch.set(ref(kid, A('children/c1/photos/screen')), { jpeg: '/9j/AAAA', at: serverTimestamp(), by: kid.uid });
  batch.update(ref(kid, path), { state: 'fulfilled' });
  await allowed(batch.commit());
  await allowed(setDoc(ref(parent, path), { ...ask, id: 'req2' }));
  await allowed(updateDoc(ref(kid, path), { state: 'declined' }));
});

test('media transfer settings are family scoped', async () => {
  const setting = A('settings/media');
  await allowed(setDoc(ref(h.a.founder, setting), { wifiOnly: true }));
  await allowedRead(getDoc(ref(h.a.kid1, setting)));
  await refused(setDoc(ref(h.a.kid1, setting), { wifiOnly: false }));
  await refused(getDoc(ref(h.a.parentB, setting)));
});
