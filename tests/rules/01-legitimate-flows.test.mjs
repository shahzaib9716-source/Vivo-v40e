// 1. Legitimate flows: everything the app is meant to do must be allowed, issued exactly the way
// the app issues it (SPEC sections 3 and 4). The flows in 1.1 and 1.2 start from an empty
// database and go through the rules from the first write on; nothing is arranged for them.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { deleteDoc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

import {
  A, allowed, blockedApps, claimOf, CODES, coll, FAM_A, firstServerSnapshot, flows, harness, make, matrixTests, newest,
  ref, refused, sampleApps, SEED, U, watch,
} from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

describe('1.1 a parent sets up a family (SPEC 3.1)', () => {
  beforeEach(() => h.empty());

  test('a verified owner account without a family reads users/{uid} and finds nothing', async () => {
    const snapshot = await allowed(getDoc(ref(h.a.founder, `users/${U.founder}`)));
    assert.equal(snapshot.exists(), false);
  });

  test('batch 1: the verified owner creates the family, the founder member record and users/{uid} together', async () => {
    await allowed(flows.createFamily(h.a.founder, FAM_A));

    const family = await h.peek(A());
    assert.equal(family.v, 2);
    assert.equal(family.owner, U.founder);
    assert.ok(family.createdAt instanceof Timestamp, 'createdAt is the server time');
    const member = await h.peek(A(`members/${U.founder}`));
    assert.deepEqual([member.role, member.childId, member.addedBy, member.code], ['parent', null, U.founder, null]);
    assert.deepEqual((await h.peek(`users/${U.founder}`)).familyId, FAM_A);
  });

  test('batch 2: once batch 1 has committed the owner seeds one child, three places, four schedules and four tasks in one batch', async () => {
    await flows.createFamily(h.a.founder, FAM_A);
    assert.equal(flows.seedWrites(h.a.founder, FAM_A).length, 12, 'the seed batch is 12 writes');

    await allowed(flows.seed(h.a.founder, FAM_A, 'c1', 'Mia Carter'));

    assert.equal((await h.peek(A('children/c1'))).deviceName, '');
    assert.equal((await h.peek(A('places/p3'))).name, "Grandma's");
    assert.equal((await h.peek(A('schedules/s4'))).name, 'Homework focus');
    assert.equal((await h.peek(A('tasks/t4'))).points, 10);
    assert.equal(await h.peek(A('signals/sos')), undefined, 'the SOS document is not part of the seed');
  });

  test('batch 2 is refused until batch 1 has committed: on its own, and when sent in the same batch as batch 1', async () => {
    await refused(flows.seed(h.a.founder, FAM_A));

    const founder = h.a.founder;
    const both = writeBatch(founder.db);
    both.set(ref(founder, A()), make.family(founder.uid));
    both.set(ref(founder, A(`members/${founder.uid}`)), make.founderMember(founder.uid));
    both.set(ref(founder, `users/${founder.uid}`), make.userPointer(FAM_A, 'parent'));
    for (const [path, data] of flows.seedWrites(founder, FAM_A)) both.set(ref(founder, path), data);
    await refused(both.commit());

    await allowed(flows.createFamily(founder, FAM_A));
    await allowed(flows.seed(founder, FAM_A));
  });

  test('batch 2 can be sent again with the same ids (seeding is resumable)', async () => {
    await flows.createFamily(h.a.founder, FAM_A);
    await allowed(flows.seed(h.a.founder, FAM_A));
    await allowed(flows.seed(h.a.founder, FAM_A));
  });

  test('batch 1 is not repeatable: sending it again after it committed is refused (the app reads users/{uid} first)', async () => {
    await flows.createFamily(h.a.founder, FAM_A);
    await refused(flows.createFamily(h.a.founder, FAM_A));
    assert.equal((await allowed(getDoc(ref(h.a.founder, `users/${U.founder}`)))).data().familyId, FAM_A);
  });

  test('the same account on a second device finds the family through users/{uid}, reads it and reports presence', async () => {
    await flows.createFamily(h.a.founder, FAM_A);
    await flows.seed(h.a.founder, FAM_A);
    const secondDevice = h.a.founder; // same uid: Firebase Auth gives the same account on every device

    const pointer = await allowed(getDoc(ref(secondDevice, `users/${U.founder}`)));
    assert.deepEqual([pointer.data().familyId, pointer.data().role], [FAM_A, 'parent']);
    const family = await allowed(getDoc(ref(secondDevice, `families/${pointer.data().familyId}`)));
    assert.equal(family.data().name, 'Carter family');
    assert.equal((await allowed(getDoc(ref(secondDevice, A(`members/${U.founder}`))))).data().role, 'parent');
    await allowed(setDoc(ref(secondDevice, A('devices/secondDeviceId')), make.device(U.founder, { name: 'iPad', platform: 'ios' })));
    assert.equal((await allowed(getDocs(coll(secondDevice, A('children'))))).size, 1);
  });
});

describe('1.2 enrolling a child device or a second parent (SPEC 3.2)', () => {
  const code = CODES.fresh;

  beforeEach(async () => {
    await h.empty();
    await flows.createFamily(h.a.founder, FAM_A);
    await flows.seed(h.a.founder, FAM_A);
  });

  test('step 1: a parent creates a code (8 characters, 15 minutes, unclaimed) and listens to it', async () => {
    await allowed(flows.createCode(h.a.founder, FAM_A, code, 'child'));
    const snapshot = await allowed(firstServerSnapshot(ref(h.a.founder, `pairing/${code}`)));
    assert.deepEqual([snapshot.data().claimedBy, snapshot.data().approved, snapshot.data().role], [null, false, 'child']);
  });

  test('step 2: an anonymous device claims the code with a blind update, then listens to its claim', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    const device = h.a.joiner;

    await refused(getDoc(ref(device, `pairing/${code}`))); // it cannot look before it claims
    await allowed(flows.claim(device, code));
    const snapshot = await allowed(firstServerSnapshot(ref(device, `pairing/${code}`)));
    assert.deepEqual([snapshot.data().claimedBy, snapshot.data().approved], [U.joiner, false]);
    assert.ok(snapshot.data().claimedAt instanceof Timestamp);
  });

  test('step 3: the parent, listening to the code, sees who claimed it (name, platform, uid for the 4-character check)', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    const listener = watch(ref(h.a.founder, `pairing/${code}`));
    try {
      await flows.claim(h.a.joiner, code, { claimName: 'Vivo V40e', claimPlatform: 'android' });
      const { snapshot } = await listener.until((e) => e.snapshot?.data()?.claimedBy === U.joiner);
      assert.deepEqual([snapshot.data().claimName, snapshot.data().claimPlatform], ['Vivo V40e', 'android']);
      assert.equal(snapshot.data().claimedBy.slice(-4).toUpperCase(), 'VICE');
    } finally {
      listener.stop();
    }
  });

  test('step 3: the parent approves onto a NEW child profile: child + member record + approval in one batch', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    await flows.claim(h.a.joiner, code);

    await allowed(flows.approve(h.a.founder, FAM_A, code, claimOf(h.a.joiner), { newChild: { id: 'cNew1', name: 'Leo Carter' } }));

    const member = await h.peek(A(`members/${U.joiner}`));
    assert.deepEqual(
      [member.role, member.childId, member.name, member.platform, member.addedBy, member.code],
      ['child', 'cNew1', 'Vivo V40e', 'android', U.founder, code],
    );
    assert.equal((await h.peek(A('children/cNew1'))).deviceName, 'Vivo V40e');
    assert.equal((await h.peek(`pairing/${code}`)).approved, true);
  });

  test('step 3: the parent approves onto an EXISTING child: device name + member record + approval in one batch', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    await flows.claim(h.a.joiner, code);

    await allowed(flows.approve(h.a.founder, FAM_A, code, claimOf(h.a.joiner), { childId: 'c1' }));

    assert.equal((await h.peek(A(`members/${U.joiner}`))).childId, 'c1');
    assert.equal((await h.peek(A('children/c1'))).deviceName, 'Vivo V40e');
  });

  test('step 3: the approval also works without touching the child profile (member record + approval only)', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    await flows.claim(h.a.joiner, code);
    const parent = h.a.founder;
    const batch = writeBatch(parent.db);
    batch.set(ref(parent, A(`members/${U.joiner}`)), make.member(parent.uid, code, claimOf(h.a.joiner), 'child', 'c1'));
    batch.update(ref(parent, `pairing/${code}`), { approved: true });
    await allowed(batch.commit());
  });

  test('step 4: the approved device sees the approval, writes users/{uid}, reads its family and deletes the code', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    const device = h.a.joiner;
    await flows.claim(device, code);
    const listener = watch(ref(device, `pairing/${code}`));
    try {
      await flows.approve(h.a.founder, FAM_A, code, claimOf(device), { childId: 'c1' });
      await listener.until((e) => e.snapshot?.data()?.approved === true);
    } finally {
      listener.stop();
    }

    const familyId = await allowed(flows.finishJoin(device, code, 'child'));

    assert.equal(familyId, FAM_A);
    assert.equal(await h.peek(`pairing/${code}`), undefined, 'the used code is gone');
    assert.deepEqual((await allowed(getDoc(ref(device, `users/${U.joiner}`)))).data().role, 'child');
    assert.equal((await allowed(getDoc(ref(device, A(`members/${U.joiner}`))))).data().childId, 'c1');
    assert.equal((await allowed(getDoc(ref(device, A('children/c1'))))).data().name, 'Mia Carter');
    assert.equal((await allowed(getDocs(coll(device, A('tasks'))))).size, 4);
    await allowed(setDoc(ref(device, A('children/c1/requests/rFirst')), make.request(U.joiner)));
  });

  test('a second parent: a verified account claims a parent code, is approved and can then act as a parent', async () => {
    await allowed(flows.createCode(h.a.founder, FAM_A, code, 'parent'));
    const account = h.a.joinerVerified;
    await allowed(flows.claim(account, code, { claimName: "Grandma's iPhone", claimPlatform: 'ios' }));

    await allowed(flows.approve(h.a.founder, FAM_A, code, claimOf(account, { name: "Grandma's iPhone", platform: 'ios' }), null));
    assert.equal(await allowed(flows.finishJoin(account, code, 'parent')), FAM_A);

    assert.deepEqual((await h.peek(A(`members/${U.joinerVerified}`))).role, 'parent');
    assert.equal((await allowed(getDocs(coll(account, A('children'))))).size, 1);
    await allowed(updateDoc(ref(account, A('children/c1')), { limitMin: 200 }));
    await allowed(flows.createCode(account, FAM_A, CODES.fresh2, 'child'));
  });

  test('declining: the parent deletes the claimed code; the claimer\'s listener ends with permission-denied', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    await flows.claim(h.a.joiner, code);
    const listener = watch(ref(h.a.joiner, `pairing/${code}`));
    try {
      await listener.until((e) => e.snapshot?.exists());
      await allowed(deleteDoc(ref(h.a.founder, `pairing/${code}`)));
      const { error } = await listener.until((e) => e.error);
      assert.equal(error.code, 'permission-denied'); // the app shows "declined or expired"
    } finally {
      listener.stop();
    }
    await refused(getDoc(ref(h.a.joiner, `pairing/${code}`)));
    await refused(getDoc(ref(h.a.joiner, A())));
  });

  test('cancelling: the parent deletes its own unclaimed code', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    await allowed(deleteDoc(ref(h.a.founder, `pairing/${code}`)));
    assert.equal(await h.peek(`pairing/${code}`), undefined);
  });

  test('cancelling: the joining device withdraws by deleting the code it claimed', async () => {
    await flows.createCode(h.a.founder, FAM_A, code, 'child');
    await flows.claim(h.a.joiner, code);
    await allowed(deleteDoc(ref(h.a.joiner, `pairing/${code}`)));
    assert.equal(await h.peek(`pairing/${code}`), undefined);
  });

  test('a code made on a phone whose clock runs a little fast or slow is accepted and works', async () => {
    const seconds = (n) => Timestamp.fromMillis(Date.now() + 15 * 60_000 + n * 1000);
    await allowed(flows.createCode(h.a.founder, FAM_A, 'FASTCK22', 'child', { expiresAt: seconds(+3) }));
    await allowed(flows.createCode(h.a.founder, FAM_A, 'FASTCK33', 'child', { expiresAt: seconds(+120) }));
    await allowed(flows.createCode(h.a.founder, FAM_A, 'SXQWCK22', 'child', { expiresAt: seconds(-120) }));
    await allowed(flows.claim(h.a.joiner, 'FASTCK22'));
    await allowed(flows.claim(h.a.joiner2, 'SXQWCK22'));
  });
});

describe('1.3 every listener in the parent\'s plan (SPEC 4.2 rule 8)', () => {
  before(() => h.reset());
  const parent = () => h.a.parent2; // the plan is the same for the founder and for a second parent

  const collectionListener = (name, path, size) =>
    test(`parent listens to ${name}`, async () => {
      assert.equal((await allowed(firstServerSnapshot(coll(parent(), A(path))))).size, size);
    });
  const documentListener = (name, path) =>
    test(`parent listens to ${name}`, async () => {
      assert.equal((await allowed(firstServerSnapshot(ref(parent(), path)))).exists(), true);
    });

  documentListener('its own users document', `users/${U.parent2}`);
  documentListener('the family document', A());
  collectionListener('members', 'members', 4);
  collectionListener('devices', 'devices', 4);
  collectionListener('children', 'children', 2);
  for (const cid of ['c1', 'c2']) {
    documentListener(`the check-in status of ${cid}`, A(`children/${cid}/live/status`));
    test(`parent listens to the newest 100 requests of ${cid}`, async () => {
      const snapshot = await allowed(firstServerSnapshot(newest(parent(), A(`children/${cid}/requests`), 100)));
      assert.equal(snapshot.size, cid === 'c1' ? 2 : 1);
    });
    test(`parent listens to the newest 300 messages of ${cid}`, async () => {
      const snapshot = await allowed(firstServerSnapshot(newest(parent(), A(`children/${cid}/messages`), 300)));
      assert.equal(snapshot.size, cid === 'c1' ? 3 : 1);
    });
  }
  test('parent listens to the newest 200 alerts', async () => {
    const snapshot = await allowed(firstServerSnapshot(newest(parent(), A('alerts'), 200)));
    assert.deepEqual(snapshot.docs.map((d) => d.id), ['n2', 'n1', 'n3']);
  });
  collectionListener('places', 'places', 3);
  collectionListener('schedules', 'schedules', 4);
  collectionListener('sites', 'sites', 6);
  collectionListener('tasks', 'tasks', 4);
  test('parent listens to places, schedules, sites, tasks and children ordered by "ord"', async () => {
    for (const name of ['places', 'schedules', 'sites', 'tasks', 'children']) {
      await allowed(firstServerSnapshot(query(coll(parent(), A(name)), orderBy('ord'))));
    }
  });
  documentListener('the SOS flag', A('signals/sos'));
  documentListener('a pairing code of its family', `pairing/${CODES.openChild}`);
  documentListener('a claimed pairing code of its family', `pairing/${CODES.taken}`);
  test('parent listeners on documents that do not exist yet (no check-in, no SOS so far) get an empty snapshot, not an error', async () => {
    await h.arrange({ [A('signals/sos')]: null, [A('children/c1/live/status')]: null });
    assert.equal((await allowed(firstServerSnapshot(ref(parent(), A('signals/sos'))))).exists(), false);
    assert.equal((await allowed(firstServerSnapshot(ref(parent(), A('children/c1/live/status'))))).exists(), false);
  });
});

describe('1.4 every listener in the child device\'s plan (SPEC 4.2 rule 8)', () => {
  before(() => h.reset());
  const kid = () => h.a.kid1;

  const collectionListener = (name, path, size) =>
    test(`child device listens to ${name}`, async () => {
      assert.equal((await allowed(firstServerSnapshot(coll(kid(), A(path))))).size, size);
    });
  const documentListener = (name, path) =>
    test(`child device listens to ${name}`, async () => {
      assert.equal((await allowed(firstServerSnapshot(ref(kid(), path)))).exists(), true);
    });

  documentListener('its own users document', `users/${U.kid1}`);
  documentListener('the family document', A());
  documentListener('its own child profile (a single document)', A('children/c1'));
  documentListener('its own check-in status (a single document)', A('children/c1/live/status'));
  test('child device listens to its own newest 100 requests', async () => {
    assert.equal((await allowed(firstServerSnapshot(newest(kid(), A('children/c1/requests'), 100)))).size, 2);
  });
  test('child device listens to its own newest 300 messages', async () => {
    assert.equal((await allowed(firstServerSnapshot(newest(kid(), A('children/c1/messages'), 300)))).size, 3);
  });
  collectionListener('places', 'places', 3);
  collectionListener('schedules', 'schedules', 4);
  collectionListener('sites', 'sites', 6);
  collectionListener('tasks', 'tasks', 4);
  test('child device listens to places, schedules, sites and tasks ordered by "ord"', async () => {
    for (const name of ['places', 'schedules', 'sites', 'tasks']) {
      await allowed(firstServerSnapshot(query(coll(kid(), A(name)), orderBy('ord'))));
    }
  });
  documentListener('the SOS flag', A('signals/sos'));
  collectionListener('members', 'members', 4);
  collectionListener('devices', 'devices', 4);
  test('child device listeners on documents that do not exist yet (first check-in, no SOS so far) get an empty snapshot, not an error', async () => {
    await h.arrange({ [A('signals/sos')]: null, [A('children/c1/live/status')]: null });
    assert.equal((await allowed(firstServerSnapshot(ref(kid(), A('signals/sos'))))).exists(), false);
    assert.equal((await allowed(firstServerSnapshot(ref(kid(), A('children/c1/live/status'))))).exists(), false);
  });
});

describe('1.5 every write a parent is meant to make', () => {
  beforeEach(() => h.reset());
  const parent = () => h.a.founder;
  const c1 = () => ref(parent(), A('children/c1'));

  test('parent changes the daily limit (adjustLimit)', async () => {
    await allowed(updateDoc(c1(), { limitMin: 270 }));
    assert.equal((await h.peek(A('children/c1'))).limitMin, 270);
  });
  test('parent grants bonus time (limit up, pause off)', () => allowed(updateDoc(c1(), { limitMin: 300, bedtime: false })));
  test('parent blocks an app (toggleApp writes the whole app list)', async () => {
    await allowed(updateDoc(c1(), { apps: blockedApps() }));
    assert.equal((await h.peek(A('children/c1'))).apps.find((app) => app.id === 'a3').blocked, true);
  });
  test('parent sets and removes a per-app limit (setAppLimit)', async () => {
    const withLimit = sampleApps().map((app) => (app.id === 'a2' ? { ...app, limitMin: 60 } : app));
    await allowed(updateDoc(c1(), { apps: withLimit }));
    await allowed(updateDoc(c1(), { apps: sampleApps().map((app) => ({ ...app, limitMin: null })) }));
  });
  test('parent pauses and resumes the device', async () => {
    await allowed(updateDoc(c1(), { bedtime: true }));
    await allowed(updateDoc(c1(), { bedtime: false }));
  });
  test('parent renames a child', () => allowed(updateDoc(c1(), { name: 'Mia C.' })));
  test('parent adds a child profile (addChild)', () =>
    allowed(setDoc(ref(parent(), A('children/cmi3k2x9ab12cd')), make.child({ name: 'Zoe Carter', age: 5, ord: Date.now() }))));

  test('parent approves a request once; the limit change goes with it as a second write', async () => {
    await allowed(updateDoc(ref(parent(), A('children/c1/requests/r1')), make.answer(U.founder, 'approved')));
    await allowed(updateDoc(c1(), { limitMin: 270, bedtime: false }));
    const request = await h.peek(A('children/c1/requests/r1'));
    assert.deepEqual([request.status, request.resolvedBy], ['approved', U.founder]);
    assert.ok(request.resolvedAt instanceof Timestamp);
  });
  test('parent approves a request and changes the limit in one batch', async () => {
    const batch = writeBatch(parent().db);
    batch.update(ref(parent(), A('children/c1/requests/r1')), make.answer(U.founder, 'approved'));
    batch.update(c1(), { limitMin: 270, bedtime: false });
    await allowed(batch.commit());
  });
  test('parent denies a request', () => allowed(updateDoc(ref(parent(), A('children/c2/requests/r2')), make.answer(U.founder, 'denied'))));
  test('parent deletes a request', () => allowed(deleteDoc(ref(parent(), A('children/c1/requests/r3')))));

  test('parent sends a chat message to each child', async () => {
    await allowed(setDoc(ref(parent(), A('children/c1/messages/mmi3k2x9000001')), make.message(U.founder, 'parent')));
    await allowed(setDoc(ref(parent(), A('children/c2/messages/mmi3k2x9000002')), make.message(U.founder, 'parent', { text: 'Dinner is ready' })));
  });

  test('parent marks every unread alert as read (one update per alert)', async () => {
    const batch = writeBatch(parent().db);
    batch.update(ref(parent(), A('alerts/n1')), { unread: false });
    batch.update(ref(parent(), A('alerts/n2')), { unread: false });
    await allowed(batch.commit());
    await allowed(updateDoc(ref(parent(), A('alerts/n3')), { unread: false })); // already read: harmless
  });
  test('parent adds and deletes an alert', async () => {
    await allowed(setDoc(ref(parent(), A('alerts/nmi3k2x9000003')), make.alert(U.founder, 'limit', 'c1', { title: 'Mia reached her limit' })));
    await allowed(deleteDoc(ref(parent(), A('alerts/n3'))));
  });

  test('parent adds, changes and removes a place', async () => {
    await allowed(setDoc(ref(parent(), A('places/pmi3k2x9000004')), make.place()));
    await allowed(updateDoc(ref(parent(), A('places/p1')), { leave: false }));
    await allowed(deleteDoc(ref(parent(), A('places/p2'))));
  });
  test('parent adds, switches and removes a schedule', async () => {
    await allowed(setDoc(ref(parent(), A('schedules/smi3k2x9000005')), make.schedule()));
    await allowed(updateDoc(ref(parent(), A('schedules/s3')), { on: true }));
    await allowed(deleteDoc(ref(parent(), A('schedules/s2'))));
  });
  test('parent adds, moves and removes a site rule', async () => {
    await allowed(setDoc(ref(parent(), A('sites/wmi3k2x9000006')), make.site()));
    await allowed(updateDoc(ref(parent(), A('sites/w1')), { list: 'allowed' }));
    await allowed(deleteDoc(ref(parent(), A('sites/w2'))));
  });
  test('parent adds, edits, ticks and removes a task', async () => {
    await allowed(setDoc(ref(parent(), A('tasks/tmi3k2x9000007')), make.task()));
    await allowed(updateDoc(ref(parent(), A('tasks/t2')), { title: 'Tidy your desk', points: 30 }));
    await allowed(updateDoc(ref(parent(), A('tasks/t2')), { done: true }));
    await allowed(updateDoc(ref(parent(), A('tasks/t2')), { done: false }));
    await allowed(deleteDoc(ref(parent(), A('tasks/t3'))));
  });

  test('parent clears an SOS raised by a child (whole document, same childId)', async () => {
    await allowed(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, false, 'c1')));
    assert.deepEqual((await h.peek(A('signals/sos'))).active, false);
  });
  test('parent clears an SOS raised by a child (update of active, by and at only)', () =>
    allowed(updateDoc(ref(parent(), A('signals/sos')), { active: false, by: U.founder, at: serverTimestamp() })));
  test('parent clears the SOS flag when no flag document exists yet (childId null)', async () => {
    await h.arrange({ [A('signals/sos')]: null });
    await allowed(setDoc(ref(parent(), A('signals/sos')), make.sos(U.founder, false, null)));
  });

  test('parent reports presence: first write of a device record, then a refresh', async () => {
    await allowed(setDoc(ref(parent(), A('devices/dmi3k2x9000008')), make.device(U.founder, { name: "Dad's iPhone", platform: 'ios' })));
    await allowed(setDoc(ref(parent(), A('devices/dmi3k2x9000008')), make.device(U.founder, { name: "Dad's iPhone", platform: 'ios' })));
    await allowed(updateDoc(ref(parent(), A('devices/devFounder')), { lastSeenAt: serverTimestamp() }));
  });

  test('parent relabels a member', () => allowed(updateDoc(ref(parent(), A(`members/${U.kid1}`)), { name: "Mia's phone" })));
  test('parent relabels another parent and itself', async () => {
    await allowed(updateDoc(ref(parent(), A(`members/${U.parent2}`)), { name: 'Mum' }));
    await allowed(updateDoc(ref(parent(), A(`members/${U.founder}`)), { name: 'Dad' }));
  });
  test('parent points a child device at another child profile', async () => {
    await allowed(updateDoc(ref(parent(), A(`members/${U.kid1}`)), { childId: 'c2' }));
    await allowed(getDoc(ref(h.a.kid1, A('children/c2')))); // the device now reads the other profile
    await refused(getDoc(ref(h.a.kid1, A('children/c1'))));
  });
  test('parent renames the family', () => allowed(updateDoc(ref(parent(), A()), { name: 'The Carters' })));
  test('parent creates a code, reads it and deletes it again', async () => {
    await allowed(flows.createCode(parent(), FAM_A, CODES.fresh, 'child'));
    await allowed(getDoc(ref(parent(), `pairing/${CODES.fresh}`)));
    await allowed(deleteDoc(ref(parent(), `pairing/${CODES.fresh}`)));
  });
  test('a second parent can do what the founder can: limits, answers, chat, codes, approval', async () => {
    const second = h.a.parent2;
    await allowed(updateDoc(ref(second, A('children/c2')), { limitMin: 120 }));
    await allowed(updateDoc(ref(second, A('children/c2/requests/r2')), make.answer(U.parent2, 'approved')));
    await allowed(setDoc(ref(second, A('children/c2/messages/mSecond')), make.message(U.parent2, 'parent')));
    await allowed(flows.approve(second, FAM_A, CODES.taken, claimOf(h.a.claimer, { name: 'Pixel 9' }), { childId: 'c2' }));
  });
});

describe('1.6 every write a child device is meant to make', () => {
  beforeEach(() => h.reset());
  const kid = () => h.a.kid1;

  test('child asks for more time (extra_time with minutes)', async () => {
    await allowed(setDoc(ref(kid(), A('children/c1/requests/rmi3k2x9000010')), make.request(U.kid1)));
    const request = await h.peek(A('children/c1/requests/rmi3k2x9000010'));
    assert.deepEqual([request.status, request.by, request.minutes], ['pending', U.kid1, 30]);
  });
  test('child asks to unlock an app (unlock_app with appId, no minutes)', () =>
    allowed(setDoc(ref(kid(), A('children/c1/requests/rmi3k2x9000011')), make.unlockRequest(U.kid1))));
  test('child asks for a later bedtime (neither minutes nor appId)', () =>
    allowed(setDoc(ref(kid(), A('children/c1/requests/rmi3k2x9000012')), {
      kind: 'bedtime', label: 'Stay up later', detail: '', status: 'pending', at: serverTimestamp(), by: U.kid1,
    })));

  test('child sends a chat message in its own thread', async () => {
    await allowed(setDoc(ref(kid(), A('children/c1/messages/mmi3k2x9000013')), make.message(U.kid1, 'child', { text: 'On my way home' })));
    assert.equal((await h.peek(A('children/c1/messages/mmi3k2x9000013'))).from, 'child');
  });

  test('child checks in for the first time (creates live/status) and again (updates it)', async () => {
    await h.arrange({ [A('children/c1/live/status')]: null });
    await allowed(setDoc(ref(kid(), A('children/c1/live/status')), make.liveStatus(U.kid1)));
    await allowed(setDoc(ref(kid(), A('children/c1/live/status')), make.liveStatus(U.kid1)));
    assert.ok((await h.peek(A('children/c1/live/status'))).checkInAt instanceof Timestamp);
  });
  test('child check-in in one batch: status + the alert for the parents', async () => {
    const batch = writeBatch(kid().db);
    batch.set(ref(kid(), A('children/c1/live/status')), make.liveStatus(U.kid1));
    batch.set(ref(kid(), A('alerts/nmi3k2x9000014')), make.alert(U.kid1, 'checkin', 'c1', { title: 'Mia checked in', body: '4:12 PM' }));
    await allowed(batch.commit());
  });
  for (const kind of ['checkin', 'sos', 'request', 'left']) {
    test(`child adds an alert about itself of kind "${kind}"`, () =>
      allowed(setDoc(ref(kid(), A(`alerts/nKind${kind}`)), make.alert(U.kid1, kind, 'c1', { icon: 'alert-circle', color: '#FF3B30', title: `Mia: ${kind}`, body: '' }))));
  }

  test('child ticks and unticks a task', async () => {
    await allowed(updateDoc(ref(kid(), A('tasks/t2')), { done: true }));
    assert.equal((await h.peek(A('tasks/t2'))).done, true);
    await allowed(updateDoc(ref(kid(), A('tasks/t2')), { done: false }));
  });

  test('child raises SOS when no flag document exists yet, then clears it', async () => {
    await h.arrange({ [A('signals/sos')]: null });
    await allowed(setDoc(ref(kid(), A('signals/sos')), make.sos(U.kid1, true, 'c1')));
    assert.deepEqual((await h.peek(A('signals/sos'))).active, true);
    await allowed(setDoc(ref(kid(), A('signals/sos')), make.sos(U.kid1, false, 'c1')));
    assert.deepEqual((await h.peek(A('signals/sos'))).active, false);
  });
  test('child raises SOS again after a parent cleared it', async () => {
    await allowed(setDoc(ref(h.a.founder, A('signals/sos')), make.sos(U.founder, false, 'c1')));
    await allowed(setDoc(ref(kid(), A('signals/sos')), make.sos(U.kid1, true, 'c1')));
  });
  test('child raises SOS after a sibling\'s SOS was cleared', async () => {
    await h.arrange({ [A('signals/sos')]: { active: false, childId: 'c2', by: U.founder, at: Timestamp.now() } });
    await allowed(setDoc(ref(kid(), A('signals/sos')), make.sos(U.kid1, true, 'c1')));
  });
  test('child raises SOS together with its SOS alert in one batch', async () => {
    const batch = writeBatch(kid().db);
    batch.set(ref(kid(), A('signals/sos')), make.sos(U.kid1, true, 'c1'));
    batch.set(ref(kid(), A('alerts/nmi3k2x9000015')), make.alert(U.kid1, 'sos', 'c1', { title: 'SOS from Mia', color: '#FF3B30' }));
    await allowed(batch.commit());
  });

  test('child reports presence: first write of a device record, then a refresh', async () => {
    await allowed(setDoc(ref(kid(), A('devices/dmi3k2x9000016')), make.device(U.kid1)));
    await allowed(setDoc(ref(kid(), A('devices/dmi3k2x9000016')), make.device(U.kid1)));
  });
});

describe('1.7 leaving, removal and what remains readable afterwards (SPEC 3.3)', () => {
  beforeEach(() => h.reset());

  test('child leaves: alert "left", then deletes its device record, its member record and its users document', async () => {
    const kid = h.a.kid1;
    await allowed(setDoc(ref(kid, A('alerts/nLeft')), make.alert(U.kid1, 'left', 'c1', { title: 'Vivo V40e left the family', body: '' })));
    await allowed(deleteDoc(ref(kid, A('devices/devKid1'))));
    await allowed(deleteDoc(ref(kid, A(`members/${U.kid1}`))));
    await allowed(deleteDoc(ref(kid, `users/${U.kid1}`)));

    assert.equal(await h.peek(A(`members/${U.kid1}`)), undefined);
    assert.equal(await h.peek(`users/${U.kid1}`), undefined);
    await refused(getDoc(ref(kid, A())));
    await refused(getDoc(ref(kid, A('children/c1'))));
    await refused(getDocs(coll(kid, A('tasks'))));
    await refused(getDocs(newest(kid, A('children/c1/messages'), 300)));
  });

  test('child leaves with all three deletes in one batch', async () => {
    const kid = h.a.kid1;
    const batch = writeBatch(kid.db);
    batch.delete(ref(kid, A('devices/devKid1')));
    batch.delete(ref(kid, A(`members/${U.kid1}`)));
    batch.delete(ref(kid, `users/${U.kid1}`));
    await allowed(batch.commit());
  });

  test('parent removes a child device: finds its device records by uid, then deletes them with the member record in one batch', async () => {
    const parent = h.a.founder;
    const devices = await allowed(getDocs(query(coll(parent, A('devices')), where('uid', '==', U.kid1))));
    assert.deepEqual(devices.docs.map((d) => d.id), ['devKid1']);
    const batch = writeBatch(parent.db);
    batch.delete(ref(parent, A(`members/${U.kid1}`)));
    for (const device of devices.docs) batch.delete(device.ref);
    await allowed(batch.commit());
    assert.equal(await h.peek(A(`members/${U.kid1}`)), undefined);
    assert.equal(await h.peek(A('devices/devKid1')), undefined);
  });

  test('a removed device loses every read and write at once, and its listener on its member record ends with permission-denied', async () => {
    const kid = h.a.kid1;
    const listener = watch(ref(kid, A(`members/${U.kid1}`)));
    try {
      await listener.until((e) => e.snapshot?.exists());
      await allowed(deleteDoc(ref(h.a.founder, A(`members/${U.kid1}`))));
      const { error } = await listener.until((e) => e.error);
      assert.equal(error.code, 'permission-denied');
    } finally {
      listener.stop();
    }
    await refused(getDoc(ref(kid, A())));
    await refused(getDoc(ref(kid, A('children/c1'))));
    await refused(getDocs(coll(kid, A('members'))));
    await refused(getDocs(coll(kid, A('places'))));
    await refused(getDocs(newest(kid, A('children/c1/requests'), 100)));
    await refused(getDoc(ref(kid, A('signals/sos'))));
    await refused(setDoc(ref(kid, A('children/c1/requests/rAfter')), make.request(U.kid1)));
    await refused(setDoc(ref(kid, A('children/c1/messages/mAfter')), make.message(U.kid1, 'child')));
    await refused(setDoc(ref(kid, A('signals/sos')), make.sos(U.kid1, true, 'c1')));
    await refused(setDoc(ref(kid, A('alerts/nAfter')), make.alert(U.kid1, 'left', 'c1')));
    await refused(updateDoc(ref(kid, A('tasks/t2')), { done: true }));
    await refused(setDoc(ref(kid, A('devices/devKid1')), make.device(U.kid1)));
  });

  test('a removed device may still tidy up: delete its own device record and its users document', async () => {
    await allowed(deleteDoc(ref(h.a.founder, A(`members/${U.kid1}`))));
    await allowed(deleteDoc(ref(h.a.kid1, A('devices/devKid1'))));
    await allowed(deleteDoc(ref(h.a.kid1, `users/${U.kid1}`)));
  });

  test('the founder removes the second parent, who then has no access', async () => {
    await allowed(deleteDoc(ref(h.a.founder, A(`members/${U.parent2}`))));
    await refused(getDocs(coll(h.a.parent2, A('children'))));
    await refused(updateDoc(ref(h.a.parent2, A('children/c1')), { limitMin: 10 }));
  });

  test('a second parent leaves by deleting its own member record and users document', async () => {
    await allowed(deleteDoc(ref(h.a.parent2, A(`members/${U.parent2}`))));
    await allowed(deleteDoc(ref(h.a.parent2, `users/${U.parent2}`)));
  });

  test('a removed child device can be enrolled again with a new code', async () => {
    await allowed(deleteDoc(ref(h.a.founder, A(`members/${U.kid1}`))));
    await allowed(flows.createCode(h.a.founder, FAM_A, CODES.fresh, 'child'));
    await allowed(flows.claim(h.a.kid1, CODES.fresh));
    await allowed(flows.approve(h.a.founder, FAM_A, CODES.fresh, claimOf(h.a.kid1), { childId: 'c1' }));
    await allowed(flows.finishJoin(h.a.kid1, CODES.fresh, 'child'));
    await allowed(getDoc(ref(h.a.kid1, A('children/c1'))));
  });
});

describe('1.8 who may do what in family A: both parents, every operation', () => {
  matrixTests(h, ['founder', 'parent2']);
});
