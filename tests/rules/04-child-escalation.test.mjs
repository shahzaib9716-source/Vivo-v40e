// 4. Privilege escalation by a child device. The attacker is an enrolled child device (it holds
// a valid anonymous token and a real member record with role "child" for child c1) running a
// modified app. Everything a child is not meant to do must be refused by the server.
//
// Most tests show the refusal next to a control: the same write done the permitted way, or by a
// parent, succeeds. That shows the refusal is about who is asking, not a malformed request.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { deleteDoc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

import {
  A, allowed, blockedApps, claimOf, CODES, coll, FAM_A, flows, harness, make, matrixTests, newest, ref, refused, sampleApps, stored, U,
} from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

const kid = () => h.a.kid1; // enrolled as child c1
const parent = () => h.a.founder;

describe('4.1 who may do what in family A: both child devices, every operation', () => {
  matrixTests(h, ['kid1', 'kid2']);
});

describe('4.2 a child device cannot change who it is', () => {
  beforeEach(() => h.reset());

  test('cannot change its own role to parent', async () => {
    await refused(updateDoc(ref(kid(), A(`members/${U.kid1}`)), { role: 'parent' }));
    await refused(updateDoc(ref(kid(), A(`members/${U.kid1}`)), { role: 'parent', childId: null }));
    await refused(setDoc(ref(kid(), A(`members/${U.kid1}`)), make.founderMember(U.kid1)));
    assert.equal((await h.peek(A(`members/${U.kid1}`))).role, 'child');
  });

  test('cannot change its own childId to become another child', async () => {
    await refused(updateDoc(ref(kid(), A(`members/${U.kid1}`)), { childId: 'c2' }));
    await allowed(updateDoc(ref(parent(), A(`members/${U.kid1}`)), { childId: 'c2' })); // control: a parent may
  });

  test('cannot relabel itself, or change who added it, when or with which code', async () => {
    const own = ref(kid(), A(`members/${U.kid1}`));
    await refused(updateDoc(own, { name: 'Dad\'s iPhone' }));
    await refused(updateDoc(own, { addedBy: U.kid1 }));
    await refused(updateDoc(own, { joinedAt: serverTimestamp() }));
    await refused(updateDoc(own, { code: null }));
    await refused(updateDoc(own, { platform: 'ios' }));
  });

  test('cannot delete and re-create its member record with a better role', async () => {
    const batch = writeBatch(kid().db);
    batch.delete(ref(kid(), A(`members/${U.kid1}`)));
    batch.set(ref(kid(), A(`members/${U.kid1}`)), make.founderMember(U.kid1));
    await refused(batch.commit());
    await allowed(deleteDoc(ref(kid(), A(`members/${U.kid1}`)))); // leaving is allowed...
    await refused(setDoc(ref(kid(), A(`members/${U.kid1}`)), make.founderMember(U.kid1))); // ...coming back as a parent is not
    await refused(setDoc(ref(kid(), A(`members/${U.kid1}`)), make.member(U.kid1, 'XSEDKD22', claimOf(kid()), 'child', 'c1')));
  });

  test('cannot say it is a parent in its users document', async () => {
    await refused(setDoc(ref(kid(), `users/${U.kid1}`), make.userPointer(FAM_A, 'parent')));
    await refused(updateDoc(ref(kid(), `users/${U.kid1}`), { role: 'parent', updatedAt: serverTimestamp() }));
    await allowed(setDoc(ref(kid(), `users/${U.kid1}`), make.userPointer(FAM_A, 'child'))); // control: the truth is accepted
  });

  test('cannot write or read another account\'s users document', async () => {
    await refused(setDoc(ref(kid(), `users/${U.founder}`), make.userPointer(FAM_A, 'parent')));
    await refused(setDoc(ref(kid(), `users/${U.kid2}`), make.userPointer(FAM_A, 'child')));
    await refused(updateDoc(ref(kid(), `users/${U.kid2}`), { updatedAt: serverTimestamp() }));
    await refused(deleteDoc(ref(kid(), `users/${U.kid2}`)));
    await refused(deleteDoc(ref(kid(), `users/${U.founder}`)));
    await refused(getDoc(ref(kid(), `users/${U.founder}`)));
    await refused(getDoc(ref(kid(), `users/${U.kid2}`)));
  });
});

describe('4.3 a child device cannot manage membership', () => {
  beforeEach(() => h.reset());

  test('cannot create a member record for another account, as parent or as child', async () => {
    await refused(setDoc(ref(kid(), A('members/friendDevice')), make.founderMember('friendDevice')));
    await refused(setDoc(ref(kid(), A('members/friendDevice')), make.member(U.kid1, CODES.taken, claimOf(h.a.claimer, { name: 'Pixel 9' }), 'child', 'c1')));
    await refused(setDoc(ref(kid(), A(`members/${U.claimer}`)), make.member(U.kid1, CODES.taken, claimOf(h.a.claimer, { name: 'Pixel 9' }), 'child', 'c1')));
  });

  test('cannot edit the member record of a sibling or of a parent', async () => {
    await refused(updateDoc(ref(kid(), A(`members/${U.kid2}`)), { name: 'Renamed' }));
    await refused(updateDoc(ref(kid(), A(`members/${U.kid2}`)), { childId: 'c1' }));
    await refused(updateDoc(ref(kid(), A(`members/${U.parent2}`)), { role: 'child', childId: 'c1' }));
    await refused(updateDoc(ref(kid(), A(`members/${U.founder}`)), { name: 'Renamed' }));
    await allowed(updateDoc(ref(parent(), A(`members/${U.kid2}`)), { name: 'Renamed' })); // control
  });

  test('cannot remove a parent or a sibling from the family', async () => {
    await refused(deleteDoc(ref(kid(), A(`members/${U.founder}`))));
    await refused(deleteDoc(ref(kid(), A(`members/${U.parent2}`))));
    await refused(deleteDoc(ref(kid(), A(`members/${U.kid2}`))));
    await allowed(deleteDoc(ref(parent(), A(`members/${U.kid2}`)))); // control
  });

  test('cannot enrol another device: the complete approval batch is refused', async () => {
    const claim = claimOf(h.a.claimer, { name: 'Pixel 9' });
    await refused(flows.approve(kid(), FAM_A, CODES.taken, claim, { childId: 'c1' }));
    await refused(flows.approve(kid(), FAM_A, CODES.taken, claim, { newChild: { id: 'cFriend', name: 'Friend' } }));
    const withoutChildWrite = writeBatch(kid().db);
    withoutChildWrite.set(ref(kid(), A(`members/${U.claimer}`)), make.member(U.kid1, CODES.taken, claim, 'child', 'c1'));
    withoutChildWrite.update(ref(kid(), `pairing/${CODES.taken}`), { approved: true });
    await refused(withoutChildWrite.commit());
    await allowed(flows.approve(parent(), FAM_A, CODES.taken, claim, { childId: 'c1' })); // control: a parent may
  });

  test('cannot create a pairing code, for a child or for a parent', async () => {
    await refused(flows.createCode(kid(), FAM_A, CODES.fresh, 'child'));
    await refused(flows.createCode(kid(), FAM_A, CODES.fresh, 'parent'));
    await allowed(flows.createCode(parent(), FAM_A, CODES.fresh, 'parent')); // control
  });

  test('cannot approve, read, list or delete the family\'s pairing codes', async () => {
    await refused(updateDoc(ref(kid(), `pairing/${CODES.taken}`), { approved: true }));
    await refused(getDoc(ref(kid(), `pairing/${CODES.taken}`)));
    await refused(getDoc(ref(kid(), `pairing/${CODES.openParent}`)));
    await refused(getDocs(query(coll(kid(), 'pairing'), where('familyId', '==', FAM_A))));
    await refused(deleteDoc(ref(kid(), `pairing/${CODES.openChild}`)));
  });

  test('cannot claim a parent code of its own family to become a parent', async () => {
    await refused(flows.claim(kid(), CODES.openParent));
    await refused(flows.claim(kid(), CODES.openChild));
  });

  test('cannot rename the family, change its owner or delete it', async () => {
    await refused(updateDoc(ref(kid(), A()), { name: 'Kids rule' }));
    await refused(updateDoc(ref(kid(), A()), { owner: U.kid1 }));
    await refused(deleteDoc(ref(kid(), A())));
  });

  test('cannot take over or delete another member\'s device record', async () => {
    await refused(setDoc(ref(kid(), A('devices/devFounder')), make.device(U.kid1)));
    await refused(updateDoc(ref(kid(), A('devices/devKid2')), { name: 'Mine now' }));
    await refused(deleteDoc(ref(kid(), A('devices/devKid2'))));
    await refused(deleteDoc(ref(kid(), A('devices/devFounder'))));
    await refused(setDoc(ref(kid(), A('devices/devNew')), make.device(U.founder))); // a record in a parent's name
  });
});

describe('4.4 a child device cannot touch limits, pauses or app rules', () => {
  beforeEach(() => h.reset());
  const own = () => ref(kid(), A('children/c1'));

  test('cannot raise its own daily limit', async () => {
    await refused(updateDoc(own(), { limitMin: 1440 }));
    assert.equal((await h.peek(A('children/c1'))).limitMin, 240);
    await allowed(updateDoc(ref(parent(), A('children/c1')), { limitMin: 1440 })); // control
  });

  test('cannot lift a pause on its device', async () => {
    await h.arrange({ [A('children/c1')]: make.child({ deviceName: 'Vivo V40e', bedtime: true }) });
    await refused(updateDoc(own(), { bedtime: false }));
    await allowed(updateDoc(ref(parent(), A('children/c1')), { bedtime: false })); // control
  });

  test('cannot unblock an app or remove an app limit', async () => {
    await h.arrange({ [A('children/c1')]: make.child({ deviceName: 'Vivo V40e', apps: blockedApps() }) });
    await refused(updateDoc(own(), { apps: sampleApps() }));
    await refused(updateDoc(own(), { apps: [] }));
    await allowed(updateDoc(ref(parent(), A('children/c1')), { apps: sampleApps() })); // control
  });

  test('cannot reset its used time or change any other profile field', async () => {
    await refused(updateDoc(own(), { usedMin: 0 }));
    await refused(updateDoc(own(), { name: 'Boss' }));
    await refused(updateDoc(own(), { age: 18 }));
    await refused(updateDoc(own(), { weekly: [0, 0, 0, 0, 0, 0, 0] }));
    await refused(updateDoc(own(), { place: 'Library', placeIcon: 'book' }));
    await refused(updateDoc(own(), { battery: 100, online: false }));
    await refused(setDoc(own(), make.child({ limitMin: 1440 })));
  });

  test('cannot create or delete a child profile, or edit a sibling\'s', async () => {
    await refused(setDoc(ref(kid(), A('children/cNew')), make.child({ name: 'Alter ego', limitMin: 1440 })));
    await refused(deleteDoc(own()));
    await refused(updateDoc(ref(kid(), A('children/c2')), { limitMin: 0 }));
    await refused(updateDoc(ref(kid(), A('children/c2')), { bedtime: true }));
  });
});

describe('4.5 a child device cannot abuse requests', () => {
  beforeEach(() => h.reset());

  test('cannot answer its own request (approve or deny)', async () => {
    const own = ref(kid(), A('children/c1/requests/r1'));
    await refused(updateDoc(own, make.answer(U.kid1, 'approved')));
    await refused(updateDoc(own, make.answer(U.kid1, 'denied')));
    await refused(updateDoc(own, make.answer(U.founder, 'approved'))); // signing as a parent
    await refused(updateDoc(own, { status: 'approved' }));
    assert.equal((await h.peek(A('children/c1/requests/r1'))).status, 'pending');
    await allowed(updateDoc(ref(parent(), A('children/c1/requests/r1')), make.answer(U.founder, 'approved'))); // control
  });

  test('cannot edit or delete a request after sending it', async () => {
    const own = ref(kid(), A('children/c1/requests/r1'));
    await refused(updateDoc(own, { minutes: 240 }));
    await refused(updateDoc(own, { label: 'something else' }));
    await refused(deleteDoc(own));
    await refused(setDoc(own, make.request(U.kid1, { minutes: 240 })));
  });

  test('cannot create a request that is already approved or already answered', async () => {
    const fresh = ref(kid(), A('children/c1/requests/rNew'));
    await refused(setDoc(fresh, make.request(U.kid1, { status: 'approved' })));
    await refused(setDoc(fresh, make.request(U.kid1, { status: 'denied' })));
    await refused(setDoc(fresh, { ...make.request(U.kid1), resolvedBy: U.founder, resolvedAt: serverTimestamp() }));
    await refused(setDoc(fresh, { ...make.request(U.kid1, { status: 'approved' }), resolvedBy: U.founder, resolvedAt: serverTimestamp() }));
    await allowed(setDoc(fresh, make.request(U.kid1))); // control: a pending one is fine
  });

  test('cannot create a request for another child', async () => {
    await refused(setDoc(ref(kid(), A('children/c2/requests/rNew')), make.request(U.kid1)));
    await refused(setDoc(ref(kid(), A('children/c2/requests/rNew')), make.request(U.kid2))); // signing as the sibling's device
    await allowed(setDoc(ref(h.a.kid2, A('children/c2/requests/rNew')), make.request(U.kid2))); // control
  });

  test('cannot answer or delete a sibling\'s request', async () => {
    await refused(updateDoc(ref(kid(), A('children/c2/requests/r2')), make.answer(U.kid1, 'denied')));
    await refused(deleteDoc(ref(kid(), A('children/c2/requests/r2'))));
  });
});

describe('4.6 a child device cannot abuse the chat', () => {
  beforeEach(() => h.reset());

  test('cannot send a message as "parent"', async () => {
    await refused(setDoc(ref(kid(), A('children/c1/messages/mNew')), make.message(U.kid1, 'parent', { text: 'You may stay up all night' })));
    await refused(setDoc(ref(kid(), A('children/c1/messages/mNew')), make.message(U.founder, 'parent'))); // signing as the parent
    await allowed(setDoc(ref(kid(), A('children/c1/messages/mNew')), make.message(U.kid1, 'child'))); // control
  });

  test('cannot send a message into another child\'s thread', async () => {
    await refused(setDoc(ref(kid(), A('children/c2/messages/mNew')), make.message(U.kid1, 'child')));
    await refused(setDoc(ref(kid(), A('children/c2/messages/mNew')), make.message(U.kid1, 'parent')));
    await refused(setDoc(ref(kid(), A('children/c2/messages/mNew')), make.message(U.kid2, 'child')));
  });

  test('cannot edit or delete a message: its own or a parent\'s', async () => {
    await refused(updateDoc(ref(kid(), A('children/c1/messages/m2')), { text: 'I never asked' }));
    await refused(deleteDoc(ref(kid(), A('children/c1/messages/m2'))));
    await refused(updateDoc(ref(kid(), A('children/c1/messages/m3')), { text: 'Yes, stay out as long as you like.' }));
    await refused(deleteDoc(ref(kid(), A('children/c1/messages/m1'))));
    await refused(setDoc(ref(kid(), A('children/c1/messages/m3')), make.message(U.kid1, 'child'))); // overwrite by id
  });
});

describe('4.7 a child device cannot read or forge the parents\' alert feed', () => {
  beforeEach(() => h.reset());

  test('cannot read alerts: not the list, not a single one, not even one it wrote itself', async () => {
    await refused(getDocs(newest(kid(), A('alerts'), 200)));
    await refused(getDocs(coll(kid(), A('alerts'))));
    await refused(getDocs(query(coll(kid(), A('alerts')), where('by', '==', U.kid1))));
    await refused(getDocs(query(coll(kid(), A('alerts')), where('childId', '==', 'c1'))));
    await refused(getDoc(ref(kid(), A('alerts/n1'))));
    await refused(getDoc(ref(kid(), A('alerts/n2')))); // n2 was written by this very device
  });

  test('cannot create an alert about another child', async () => {
    await refused(setDoc(ref(kid(), A('alerts/nNew')), make.alert(U.kid1, 'sos', 'c2', { title: 'SOS from Leo' })));
    await refused(setDoc(ref(kid(), A('alerts/nNew')), make.alert(U.kid1, 'checkin', 'c2')));
    await refused(setDoc(ref(kid(), A('alerts/nNew')), make.alert(U.kid1, 'checkin', null)));
    await allowed(setDoc(ref(kid(), A('alerts/nNew')), make.alert(U.kid1, 'checkin', 'c1'))); // control
  });

  for (const kind of ['geofence', 'limit', 'report', 'approved', 'system', 'parent']) {
    test(`cannot create an alert of the parent-only kind "${kind}"`, async () => {
      await refused(setDoc(ref(kid(), A('alerts/nNew')), make.alert(U.kid1, kind, 'c1')));
      await allowed(setDoc(ref(parent(), A('alerts/nNew')), make.alert(U.founder, kind, 'c1'))); // control
    });
  }

  test('cannot create an alert that is already read, or sign it as a parent', async () => {
    await refused(setDoc(ref(kid(), A('alerts/nNew')), make.alert(U.kid1, 'checkin', 'c1', { unread: false })));
    await refused(setDoc(ref(kid(), A('alerts/nNew')), make.alert(U.founder, 'checkin', 'c1')));
  });

  test('cannot mark alerts as read, edit them or delete them', async () => {
    await refused(updateDoc(ref(kid(), A('alerts/n2')), { unread: false }));
    await refused(updateDoc(ref(kid(), A('alerts/n2')), { title: 'Nothing to see' }));
    await refused(deleteDoc(ref(kid(), A('alerts/n2'))));
    await refused(deleteDoc(ref(kid(), A('alerts/n1'))));
    await refused(setDoc(ref(kid(), A('alerts/n1')), make.alert(U.kid1, 'checkin', 'c1'))); // overwrite a parent's alert by id
  });
});

describe('4.8 a child device cannot change the family rules', () => {
  beforeEach(() => h.reset());

  const rules = [
    ['places', 'p1', () => make.place(), { radius: 5 }],
    ['schedules', 's1', () => make.schedule(), { on: false }],
    ['sites', 'w1', () => make.site(), { list: 'allowed' }],
  ];
  for (const [name, existing, fresh, change] of rules) {
    test(`cannot create, change or delete ${name}`, async () => {
      await refused(setDoc(ref(kid(), A(`${name}/newOne`)), fresh()));
      await refused(updateDoc(ref(kid(), A(`${name}/${existing}`)), change));
      await refused(setDoc(ref(kid(), A(`${name}/${existing}`)), fresh()));
      await refused(deleteDoc(ref(kid(), A(`${name}/${existing}`))));
      // control: a parent may do all three
      await allowed(setDoc(ref(parent(), A(`${name}/newOne`)), fresh()));
      await allowed(updateDoc(ref(parent(), A(`${name}/${existing}`)), change));
      await allowed(deleteDoc(ref(parent(), A(`${name}/${existing}`))));
    });
  }

  test('cannot switch off the bedtime schedule or unblock a blocked site', async () => {
    await refused(updateDoc(ref(kid(), A('schedules/s1')), { on: false }));
    await refused(updateDoc(ref(kid(), A('schedules/s1')), { start: '11:59 PM' }));
    await refused(deleteDoc(ref(kid(), A('sites/w1'))));
    await refused(setDoc(ref(kid(), A('sites/wAllow')), make.site({ host: 'chatroulette.example', list: 'allowed' })));
  });
});

describe('4.9 a child device can tick tasks and nothing else about them', () => {
  beforeEach(() => h.reset());
  const task = () => ref(kid(), A('tasks/t2'));

  test('cannot change the title of a task', async () => {
    await refused(updateDoc(task(), { title: 'Play video games' }));
    await allowed(updateDoc(task(), { done: true })); // control: ticking is allowed
  });

  test('cannot change the points of a task, alone or while ticking it', async () => {
    await refused(updateDoc(task(), { points: 1000 }));
    await refused(updateDoc(task(), { done: true, points: 1000 }));
    await refused(setDoc(task(), make.task({ title: 'Tidy your room', points: 1000, done: true, ord: 1 })));
    assert.equal((await h.peek(A('tasks/t2'))).points, 15);
  });

  test('cannot set "done" to something that is not true or false, or reorder tasks', async () => {
    await refused(updateDoc(task(), { done: 'yes' }));
    await refused(updateDoc(task(), { done: 5 }));
    await refused(updateDoc(task(), { ord: -1 }));
  });

  test('cannot create or delete tasks', async () => {
    await refused(setDoc(ref(kid(), A('tasks/tNew')), make.task({ title: 'Breathe', points: 1000, done: true })));
    await refused(deleteDoc(task()));
    await allowed(setDoc(ref(parent(), A('tasks/tNew')), make.task())); // control
  });
});

describe('4.10 a child device cannot misuse the SOS flag', () => {
  beforeEach(() => h.reset());
  const flag = () => ref(kid(), A('signals/sos'));

  test('cannot raise SOS as another child', async () => {
    await h.arrange({ [A('signals/sos')]: null });
    await refused(setDoc(flag(), make.sos(U.kid1, true, 'c2')));
    await refused(setDoc(flag(), make.sos(U.kid2, true, 'c2'))); // signing as the sibling's device
    await refused(setDoc(flag(), make.sos(U.kid1, true, null)));
    await allowed(setDoc(flag(), make.sos(U.kid1, true, 'c1'))); // control
  });

  test('cannot clear another child\'s active SOS', async () => {
    await h.arrange({ [A('signals/sos')]: stored(make.sos(U.kid2, true, 'c2')) });
    await refused(setDoc(flag(), make.sos(U.kid1, false, 'c2')));
    await refused(setDoc(flag(), make.sos(U.kid1, false, 'c1')));
    await refused(setDoc(flag(), make.sos(U.kid1, false, null)));
    await refused(updateDoc(flag(), { active: false }));
    await refused(updateDoc(flag(), { active: false, by: U.kid1, at: serverTimestamp() }));
    await refused(deleteDoc(flag()));
    assert.equal((await h.peek(A('signals/sos'))).active, true);
    await allowed(setDoc(ref(h.a.kid2, A('signals/sos')), make.sos(U.kid2, false, 'c2'))); // control: the child that raised it
  });

  test('cannot delete the flag, back-date it or write other signal documents', async () => {
    await refused(deleteDoc(flag()));
    await refused(setDoc(flag(), make.sos(U.kid1, true, 'c1', { at: Timestamp.fromMillis(Date.now() - 3600_000) })));
    await refused(setDoc(ref(kid(), A('signals/lockdown')), make.sos(U.kid1, true, 'c1')));
  });

  test('a parent can only clear: it cannot raise an SOS (for a child or for nobody) or move it to another child', async () => {
    await refused(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, true, 'c1')));
    await refused(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, true, null)));
    await refused(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, false, 'c2')));
    await refused(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, false, null)));
    await h.arrange({ [A('signals/sos')]: null });
    await refused(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, true, null))); // nor when no flag exists yet
    await refused(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, true, 'c1')));
    await refused(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, false, 'c1'))); // a first "clear" names nobody
    await allowed(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, false, null)));
    await h.arrange({ [A('signals/sos')]: stored(make.sos(U.kid1, true, 'c1')) });
    await allowed(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, false, 'c1')));
  });

  // KNOWN LIMIT OF THE LAYOUT (one SOS document per family), written down so that a change is a
  // decision and not an accident: a child may always raise its OWN SOS, even while a sibling's is
  // active. The flag then names the second child. Both SOS alerts stay in the parents' feed,
  // which no child can read, change or delete.
  test('KNOWN LIMIT: raising its own SOS while a sibling\'s is active replaces the flag; both alerts remain', async () => {
    await h.arrange({
      [A('signals/sos')]: stored(make.sos(U.kid2, true, 'c2')),
      [A('alerts/nSosLeo')]: stored(make.alert(U.kid2, 'sos', 'c2', { title: 'SOS from Leo' })),
    });
    await allowed(setDoc(flag(), make.sos(U.kid1, true, 'c1')));
    await allowed(setDoc(ref(kid(), A('alerts/nSosMia')), make.alert(U.kid1, 'sos', 'c1', { title: 'SOS from Mia' })));
    assert.equal((await h.peek(A('signals/sos'))).childId, 'c1');
    await refused(deleteDoc(ref(kid(), A('alerts/nSosLeo'))));
    assert.equal((await h.peek(A('alerts/nSosLeo'))).title, 'SOS from Leo');
  });
});

describe('4.11 a child device cannot read a sibling\'s records', () => {
  before(() => h.reset());

  test('cannot read a sibling\'s profile, or list all children', async () => {
    await refused(getDoc(ref(kid(), A('children/c2'))));
    await refused(getDocs(coll(kid(), A('children'))));
    await refused(getDocs(query(coll(kid(), A('children')), where('name', '==', 'Leo Carter'))));
    await allowed(getDoc(ref(kid(), A('children/c1')))); // control: its own
  });

  test('cannot read a sibling\'s check-in status', async () => {
    await refused(getDoc(ref(kid(), A('children/c2/live/status'))));
    await refused(getDocs(coll(kid(), A('children/c2/live'))));
    await allowed(getDoc(ref(kid(), A('children/c1/live/status')))); // control
  });

  test('cannot read a sibling\'s requests', async () => {
    await refused(getDoc(ref(kid(), A('children/c2/requests/r2'))));
    await refused(getDocs(newest(kid(), A('children/c2/requests'), 100)));
    await refused(getDocs(coll(kid(), A('children/c2/requests'))));
    await allowed(getDocs(newest(kid(), A('children/c1/requests'), 100))); // control
  });

  test('cannot read a sibling\'s messages', async () => {
    await refused(getDoc(ref(kid(), A('children/c2/messages/m4'))));
    await refused(getDocs(newest(kid(), A('children/c2/messages'), 300)));
    await refused(getDocs(coll(kid(), A('children/c2/messages'))));
    await allowed(getDocs(newest(kid(), A('children/c1/messages'), 300))); // control
  });

  test('cannot check in for a sibling', async () => {
    await refused(setDoc(ref(kid(), A('children/c2/live/status')), make.liveStatus(U.kid1)));
    await refused(setDoc(ref(kid(), A('children/c2/live/status')), make.liveStatus(U.kid2)));
  });

  test('a child device that a parent re-points to another child loses the first child\'s records', async () => {
    await h.arrange({ [A(`members/${U.kid1}`)]: { ...(await h.peek(A(`members/${U.kid1}`))), childId: 'c2' } });
    await refused(getDoc(ref(kid(), A('children/c1'))));
    await refused(getDocs(newest(kid(), A('children/c1/messages'), 300)));
    await refused(setDoc(ref(kid(), A('children/c1/requests/rNew')), make.request(U.kid1)));
    await allowed(getDoc(ref(kid(), A('children/c2'))));
  });
});
