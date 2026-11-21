import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { collection, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import '../sync/register.mjs';
import { A, FAM_A, U, allowedRead, harness, make, ref, refused } from './helpers.mjs';
const { chatWordRef, scanChatPage } = await import('../../src/sync/chatWords.ts');

const h = harness();
before(() => h.start());
after(() => h.stop());
beforeEach(() => h.reset());

test('alerts cover only matching messages sent by children after activation and resume once across parent devices', async () => {
  const parent = h.a.founder;
  const kid = h.a.kid1;
  const setting = { version: 'words1', terms: ['help'], since: serverTimestamp() };
  await refused(setDoc(chatWordRef(kid.db, FAM_A), setting));
  await setDoc(chatWordRef(parent.db, FAM_A), setting);
  await allowedRead(getDoc(chatWordRef(kid.db, FAM_A)));
  await refused(getDoc(chatWordRef(h.a.parentB.db, FAM_A)));
  const batch = writeBatch(kid.db);
  for (let i = 0; i < 18; i++) batch.set(ref(kid, A('children/c1/messages/word' + i)), make.message(U.kid1, 'child', { text: i % 3 ? 'helpful' : 'HELP!' }));
  await batch.commit();
  await setDoc(ref(parent, A('children/c1/messages/fromparent')), make.message(U.founder, 'parent', { text: 'help' }));
  async function scan(actor) {
    while (await scanChatPage(actor.db, FAM_A, 'c1', actor.uid)) { /* next page */ }
  }
  await Promise.all([scan(parent), scan(h.a.parent2)]);
  await scan(parent);
  const alerts = (await getDocs(collection(parent.db, A('alerts')))).docs.filter(s => s.get('kind') === 'word');
  assert.equal(alerts.length, 6);
  assert.ok(alerts.every(s => s.get('body') === 'Matched help' && s.get('childId') === 'c1'));
  await refused(getDoc(ref(kid, A('children/c1/settings/chatWordCursor'))));
});
