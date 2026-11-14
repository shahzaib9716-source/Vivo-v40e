// 2. Unauthorised access. Somebody who is not in any family of this project tries every read,
// query and write there is. The only things Firebase Auth will give such a person are: no token
// at all, an anonymous token, or a password account for an address they control (verified or
// not). None of them gets anything, with two exceptions that are the design: any signed-in
// account may read its own (empty) users/{uid}, and any signed-in device may claim a pairing
// code it knows, which grants nothing until a parent approves it (see 05-pairing-abuse).

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';

import { A, allowed, coll, flows, harness, make, matrixTests, ownerEmailsInRules, PERSONAS, ref, refused } from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

const STRANGERS = ['none', 'anon', 'verified', 'unverified', 'impostor'];
const label = (key) => PERSONAS.find((p) => p.key === key).label;

describe('2.1 strangers against every collection of an existing family: get, list and write', () => {
  matrixTests(h, STRANGERS);
});

describe('2.2 who may create a family', () => {
  // An empty database: nothing a stranger tries here can be refused "because it already exists".
  beforeEach(() => h.empty());

  for (const key of STRANGERS) {
    test(`${label(key)}: the complete family-creation batch is refused`, async () => {
      await refused(flows.createFamily(h.a[key], 'strangersFamily00001'));
    });

    test(`${label(key)}: each write of the family-creation batch on its own is refused`, async () => {
      const actor = h.a[key];
      await refused(setDoc(ref(actor, 'families/strangersFamily00001'), make.family(actor.selfId)));
      await refused(setDoc(ref(actor, `families/strangersFamily00001/members/${actor.selfId}`), make.founderMember(actor.selfId)));
      await refused(setDoc(ref(actor, `users/${actor.selfId}`), make.userPointer('strangersFamily00001', 'parent')));
    });

    test(`${label(key)}: cannot put data under a family id it made up`, async () => {
      const actor = h.a[key];
      await refused(setDoc(ref(actor, 'families/madeUpFamily0000001/places/p1'), make.place()));
      await refused(setDoc(ref(actor, 'families/madeUpFamily0000001/children/c1'), make.child()));
      await refused(setDoc(ref(actor, `families/madeUpFamily0000001/devices/d1`), make.device(actor.selfId)));
      await refused(setDoc(ref(actor, 'families/madeUpFamily0000001/signals/sos'), make.sos(actor.selfId, true, 'c1')));
      await refused(getDocs(coll(actor, 'families/madeUpFamily0000001/members')));
      await refused(getDoc(ref(actor, 'families/madeUpFamily0000001')));
    });
  }

  test('a verified account claiming the owner role inside the batch (owner field set to the real owner\'s uid) is refused', async () => {
    const actor = h.a.verified;
    const batch = writeBatch(actor.db);
    batch.set(ref(actor, 'families/strangersFamily00001'), make.family(h.a.founder.uid));
    batch.set(ref(actor, `families/strangersFamily00001/members/${actor.uid}`), make.founderMember(actor.uid));
    batch.set(ref(actor, `users/${actor.uid}`), make.userPointer('strangersFamily00001', 'parent'));
    await refused(batch.commit());
  });

  test('control: the verified owner account is allowed the very same batch', async () => {
    await allowed(flows.createFamily(h.a.founder, 'strangersFamily00001'));
  });

  // Firebase Auth stores and issues addresses in lower case (checked against the Auth emulator),
  // and the rules compare exactly. An entry with a capital letter or a stray space would silently
  // lock the owner out of creating the family.
  test('the owner list in firestore.rules has at least one entry, all plain lower-case addresses', () => {
    const listed = ownerEmailsInRules();
    assert.ok(listed.length > 0, 'ownerEmails() is empty: nobody could create a family');
    for (const address of listed) {
      assert.match(address, /^[^\s@A-Z]+@[^\s@A-Z]+\.[^\s@A-Z]+$/, `"${address}" must be a lower-case address without spaces`);
    }
  });
});

describe('2.3 a stranger gains nothing from the family that the owner then creates', () => {
  beforeEach(() => h.reset());

  for (const key of STRANGERS) {
    test(`${label(key)}: cannot seed, read or join family A by writing documents directly`, async () => {
      const actor = h.a[key];
      await refused(setDoc(ref(actor, A(`members/${actor.selfId}`)), make.founderMember(actor.selfId)));
      await refused(setDoc(ref(actor, `users/${actor.selfId}`), make.userPointer(h.a.founder.uid, 'parent')));
      await refused(getDoc(ref(actor, A())));
      await refused(getDocs(coll(actor, A('children'))));
    });
  }
});
