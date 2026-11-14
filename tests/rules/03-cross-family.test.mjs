// 3. Cross-family isolation. Family B is a complete, working family in the same project. Its
// parent and its child device try everything against family A: every document, every query,
// family A's pairing codes. Being a parent somewhere gives no rights anywhere else.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { deleteDoc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

import {
  A, allowed, B, claimOf, CODES, coll, FAM_A, FAM_B, flows, harness, make, matrixTests, newest, ref, refused, stored, U,
} from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

describe('3.1 control: the members of family B are real members with working rights in family B', () => {
  beforeEach(() => h.reset());

  test('the parent of family B reads and changes family B', async () => {
    const parent = h.a.parentB;
    assert.equal((await allowed(getDocs(coll(parent, B('children'))))).size, 1);
    await allowed(updateDoc(ref(parent, B('children/cb1')), { limitMin: 100 }));
    await allowed(setDoc(ref(parent, B('children/cb1/messages/mNew')), make.message(U.parentB, 'parent')));
    await allowed(getDocs(newest(parent, B('alerts'), 200)));
    await allowed(getDoc(ref(parent, `pairing/${CODES.bOpen}`)));
  });

  test('the child device of family B reads and writes its own records in family B', async () => {
    const kid = h.a.kidB;
    await allowed(getDoc(ref(kid, B('children/cb1'))));
    await allowed(setDoc(ref(kid, B('children/cb1/requests/rNew')), make.request(U.kidB)));
    await allowed(setDoc(ref(kid, B('signals/sos')), make.sos(U.kidB, true, 'cb1')));
    await allowed(updateDoc(ref(kid, B('tasks/tb1')), { done: true }));
  });
});

describe('3.2 a parent and a child of family B against every document, query and pairing code of family A', () => {
  matrixTests(h, ['parentB', 'kidB']);
});

describe('3.3 cross-family attacks that need more than one write', () => {
  beforeEach(() => h.reset());

  test('the parent of B cannot enrol itself into family A with the approval batch, using a code of family A it claimed', async () => {
    const attacker = h.a.parentB;
    await allowed(flows.claim(attacker, CODES.openParent)); // claiming is open to any verified account
    const batch = writeBatch(attacker.db);
    batch.set(ref(attacker, A(`members/${U.parentB}`)), make.member(U.parentB, CODES.openParent, claimOf(attacker), 'parent', null));
    batch.update(ref(attacker, `pairing/${CODES.openParent}`), { approved: true });
    await refused(batch.commit());
    await refused(getDoc(ref(attacker, A())));
  });

  test('the parent of B cannot approve the claim on family A\'s code, into family A or into family B', async () => {
    const attacker = h.a.parentB;
    const claim = claimOf(h.a.claimer, { name: 'Pixel 9' });
    await refused(flows.approve(attacker, FAM_A, CODES.taken, claim, { childId: 'c1' }));
    await refused(flows.approve(attacker, FAM_B, CODES.taken, claim, { childId: 'cb1' }));
    const memberOnly = writeBatch(attacker.db);
    memberOnly.set(ref(attacker, B(`members/${U.claimer}`)), make.member(U.parentB, CODES.taken, claim, 'child', 'cb1'));
    await refused(memberOnly.commit());
  });

  test('the parent of B cannot create a pairing code that points at family A', async () => {
    await refused(flows.createCode(h.a.parentB, FAM_A, CODES.fresh, 'parent'));
    await refused(flows.createCode(h.a.parentB, FAM_A, CODES.fresh, 'child'));
    await allowed(flows.createCode(h.a.parentB, FAM_B, CODES.fresh, 'child')); // control: its own family
  });

  test('the parent of B cannot enrol a member of family A into family B with a code of family B the member never claimed', async () => {
    const attacker = h.a.parentB;
    const batch = writeBatch(attacker.db);
    batch.set(ref(attacker, B(`members/${U.kid1}`)), make.member(U.parentB, CODES.bOpen, { name: 'Vivo V40e', platform: 'android' }, 'child', 'cb1'));
    batch.update(ref(attacker, `pairing/${CODES.bOpen}`), { approved: true });
    await refused(batch.commit());
  });

  test('the child device of B cannot read a child of family A that happens to have its own child id', async () => {
    await h.arrange({
      [A('children/cb1')]: make.child({ name: 'Same id as in family B' }),
      [A('children/cb1/messages/m1')]: stored(make.message(U.founder, 'parent')),
      [A('children/cb1/live/status')]: stored(make.liveStatus(U.kid1)),
    });
    const kid = h.a.kidB;
    await refused(getDoc(ref(kid, A('children/cb1'))));
    await refused(getDoc(ref(kid, A('children/cb1/live/status'))));
    await refused(getDocs(newest(kid, A('children/cb1/messages'), 300)));
    await refused(getDocs(newest(kid, A('children/cb1/requests'), 100)));
    await refused(setDoc(ref(kid, A('children/cb1/requests/rNew')), make.request(U.kidB)));
    await refused(setDoc(ref(kid, A('children/cb1/messages/mNew')), make.message(U.kidB, 'child')));
    await refused(setDoc(ref(kid, A('children/cb1/live/status')), make.liveStatus(U.kidB)));
    await refused(setDoc(ref(kid, A('signals/sos')), make.sos(U.kidB, true, 'cb1')));
    await refused(setDoc(ref(kid, A('alerts/nNew')), make.alert(U.kidB, 'sos', 'cb1')));
  });

  test('members of B cannot point their users document at family A, with either role', async () => {
    await refused(setDoc(ref(h.a.parentB, `users/${U.parentB}`), make.userPointer(FAM_A, 'parent')));
    await refused(updateDoc(ref(h.a.parentB, `users/${U.parentB}`), make.userPointer(FAM_A, 'parent')));
    await refused(setDoc(ref(h.a.kidB, `users/${U.kidB}`), make.userPointer(FAM_A, 'child')));
  });

  test('members of B cannot query across families: by family id, by uid, or with collection-group style filters', async () => {
    for (const actor of [h.a.parentB, h.a.kidB]) {
      await refused(getDocs(query(coll(actor, 'pairing'), where('familyId', '==', FAM_A))));
      await refused(getDocs(query(coll(actor, 'pairing'), where('familyId', '==', FAM_B))));
      await refused(getDocs(query(coll(actor, 'users'), where('familyId', '==', FAM_A))));
      await refused(getDocs(query(coll(actor, A('members')), where('role', '==', 'parent'))));
      await refused(getDocs(query(coll(actor, A('devices')), where('uid', '==', actor.uid))));
      await refused(getDocs(query(coll(actor, A('children/c1/messages')), where('by', '==', actor.uid))));
    }
  });

  test('the same holds the other way round: members of family A get nothing from family B', async () => {
    for (const actor of [h.a.founder, h.a.kid1]) {
      await refused(getDoc(ref(actor, B())));
      await refused(getDocs(coll(actor, B('members'))));
      await refused(getDoc(ref(actor, B('children/cb1'))));
      await refused(getDocs(coll(actor, B('places'))));
      await refused(getDoc(ref(actor, B('signals/sos'))));
      await refused(updateDoc(ref(actor, B('tasks/tb1')), { done: true }));
      await refused(getDoc(ref(actor, `pairing/${CODES.bOpen}`)));
      await refused(deleteDoc(ref(actor, `pairing/${CODES.bOpen}`)));
    }
    await refused(updateDoc(ref(h.a.founder, B('children/cb1')), { limitMin: 1 }));
    await refused(setDoc(ref(h.a.founder, B('children/cb1/messages/mX')), make.message(U.founder, 'parent')));
    await refused(setDoc(ref(h.a.kid1, B('children/cb1/requests/rX')), make.request(U.kid1)));
  });
});
