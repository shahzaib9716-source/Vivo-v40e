import { before, after, test } from 'node:test';
import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { harness, A, ref, allowed, refused } from './helpers.mjs';

const h = harness();
before(async () => { await h.start(); await h.ensure('arranged'); });
after(() => h.stop());
const at = (actor, path) => ref(h.a[actor], A('children/c1/' + path));

test('device enforcement receipts are child-authored and family-scoped', async () => {
  const path = 'management/latest';
  const report = { by: h.a.kid1.selfId, message: 'Timed limits require Usage access.', receivedAt: serverTimestamp() };
  await allowed(setDoc(at('kid1', path), report));
  await allowed(getDoc(at('founder', path)));
  await refused(getDoc(at('kid2', path)));
  await refused(setDoc(at('founder', path), report));
  await refused(setDoc(at('kid1', path), { ...report, by: h.a.kid2.selfId }));
  await refused(setDoc(at('kid1', path), { ...report, message: 'x'.repeat(241) }));
});
