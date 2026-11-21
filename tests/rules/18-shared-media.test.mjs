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
