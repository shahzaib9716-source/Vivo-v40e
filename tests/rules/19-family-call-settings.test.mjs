import { after, before, beforeEach, test } from 'node:test';
import { getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { A, U, allowed, allowedRead, harness, ref, refused } from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());
beforeEach(() => h.reset());

test('only a family parent sets call policy, and only the enrolled phone attests its own status', async () => {
  const setting = A('children/c1/settings/calls');
  const status = A('children/c1/callStatus/' + U.kid1);
  const data = { state: 'blocked', at: serverTimestamp(), by: U.kid1 };
  await allowed(setDoc(ref(h.a.founder, setting), { blockNonContacts: true }));
  await allowedRead(getDoc(ref(h.a.kid1, setting)));
  await refused(getDoc(ref(h.a.kid2, setting)));
  await refused(setDoc(ref(h.a.kid1, setting), { blockNonContacts: false }));
  await refused(setDoc(ref(h.a.parentB, setting), { blockNonContacts: false }));
  await allowed(setDoc(ref(h.a.kid1, status), data));
  await allowedRead(getDoc(ref(h.a.founder, status)));
  await refused(setDoc(ref(h.a.kid2, status), { ...data, by: U.kid2 }));
  await refused(setDoc(ref(h.a.founder, status), { ...data, by: U.founder }));
  await refused(setDoc(ref(h.a.kid1, status), { ...data, number: '555' }));
});
