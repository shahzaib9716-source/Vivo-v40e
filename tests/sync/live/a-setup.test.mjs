// a. A parent sets up: sign-up, email confirmation, the family and its first child. A second device
//    of the same account finds the family without a code. Accounts that may not create a family
//    are told so, and nothing is created for them.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { OWNER_EMAIL, PASSWORD, authEmulator, describeWrites, disposeAll, makePhone, ok, quiet, resetBackend, server, signUpVerified, writesIn } from './harness/driver.mjs';
import { REFUSAL_NOISE, SAMPLE, noAppErrors, syncedOf } from './harness/expect.mjs';

let iphone;
let tablet;
let stranger;
let familyId;
let ownerUid;

before(async () => {
  await resetBackend();
  iphone = makePhone('a-parent-iphone', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  tablet = makePhone('a-parent-tablet', { platform: 'android', deviceName: 'Kitchen tablet' });
  stranger = makePhone('a-stranger', { platform: 'android', deviceName: 'Somebody’s phone' });
});
after(disposeAll);

test('a fresh install shows the sample data and is signed out', async () => {
  const v = await iphone.launch();
  await iphone.waitStatus('signed-out');
  assert.deepEqual(v.store.children.map((c) => c.name), SAMPLE.childNames);
  assert.equal(v.store.live, false);
  assert.equal(v.link.configured, true);
  assert.equal(v.link.account, null);
  assert.equal(v.link.familyId, null);
  assert.deepEqual(writesIn(await iphone.fx(true), { presence: true }), [], 'a signed-out phone writes nothing');
});

test('an account whose email is not confirmed cannot create a family, and is told why', async () => {
  ok(await iphone.link('signUp', OWNER_EMAIL, PASSWORD), 'signUp');
  const v = await iphone.waitStatus('needs-family');
  assert.equal(v.link.account.email, OWNER_EMAIL);
  assert.equal(v.link.account.emailVerified, false);
  assert.equal(v.link.account.anonymous, false);

  const r = await iphone.link('createFamily', { familyName: 'The Testers', childName: 'Zoe Tester', childAge: 9 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'email-not-verified');
  assert.match(r.message, /Confirm your email address first/);
  assert.equal((await iphone.view()).link.status, 'needs-family');
  assert.deepEqual(await server.familyIds(), [], 'no family exists on the server');
  assert.deepEqual(await server.collection('users'), {}, 'no account pointer exists on the server');
  assert.deepEqual((await iphone.view()).store.children.map((c) => c.name), SAMPLE.childNames, 'still the sample data');
});

test('after confirming the email the parent creates the family with one named child', async () => {
  await authEmulator.confirmEmail(OWNER_EMAIL);
  const account = ok(await iphone.link('refreshAccount'), 'refreshAccount');
  assert.equal(account.emailVerified, true);
  ownerUid = account.uid;
  await iphone.fx(true);

  ok(await iphone.link('createFamily', { familyName: 'The Testers', childName: 'Zoe Tester', childAge: 9 }), 'createFamily');
  const v = await iphone.eventually((x) => x.link.status === 'linked' && x.store.children.length === 1 && x.link.members.length === 1 && x.link.members[0].lastSeenAt !== null, 'linked, with the family taken in');
  await quiet([iphone]);
  familyId = v.link.familyId;

  // LinkState
  assert.match(familyId, /^[A-Za-z0-9]{20}$/);
  assert.equal(v.link.role, 'parent');
  assert.equal(v.link.childId, null);
  assert.equal(v.link.familyName, 'The Testers');
  assert.equal(v.link.offer, null);
  assert.equal(v.link.pendingJoin, null);
  assert.equal(v.link.error, null);
  assert.equal(typeof v.link.lastSyncedAt, 'number');
  assert.equal(v.link.members.length, 1);
  const me = v.link.members[0];
  assert.deepEqual({ uid: me.uid, role: me.role, childId: me.childId, name: me.name, platform: me.platform, isThisAccount: me.isThisAccount, isOwner: me.isOwner }, { uid: ownerUid, role: 'parent', childId: null, name: 'Dana’s iPhone', platform: 'ios', isThisAccount: true, isOwner: true });

  // The store: the family's data, not the sample data.
  const s = v.store;
  assert.equal(s.live, true);
  assert.equal(s.children.length, 1);
  const child = s.children[0];
  assert.deepEqual({ name: child.name, age: child.age, deviceName: child.deviceName, updatedAgo: child.updatedAgo }, { name: 'Zoe Tester', age: 9, deviceName: '', updatedAgo: 'never' });
  assert.equal(child.apps.length, 9);
  assert.deepEqual(s.places.map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.deepEqual(s.schedules.map((p) => p.id), ['s1', 's2', 's3', 's4']);
  assert.deepEqual(s.tasks.map((p) => p.id), ['t1', 't2', 't3', 't4']);
  assert.deepEqual([s.requests, s.alerts, s.messages, s.sites], [[], [], [], []], 'no sample requests, alerts, messages or sites');
  assert.equal(s.sosActive, false);

  // The server.
  const docs = await server.family(familyId);
  const paths = Object.keys(docs).map((p) => p.replace(`families/${familyId}`, 'F')).sort();
  const deviceId = iphone.disk()['haven.device.v1'];
  assert.deepEqual(
    paths,
    ['F', `F/children/${child.id}`, `F/devices/${deviceId}`, `F/members/${ownerUid}`, 'F/places/p1', 'F/places/p2', 'F/places/p3', 'F/schedules/s1', 'F/schedules/s2', 'F/schedules/s3', 'F/schedules/s4', 'F/tasks/t1', 'F/tasks/t2', 'F/tasks/t3', 'F/tasks/t4'].sort(),
    'exactly the family, the founder, one child, the sample places, schedules and tasks, and this phone’s "last seen"',
  );
  const family = docs[`families/${familyId}`];
  assert.deepEqual({ v: family.v, owner: family.owner, name: family.name }, { v: 2, owner: ownerUid, name: 'The Testers' });
  assert.ok(Math.abs(family.createdAt - Date.now()) < 60000, 'createdAt is the server time');
  const member = docs[`families/${familyId}/members/${ownerUid}`];
  assert.deepEqual({ ...member, joinedAt: 0 }, { role: 'parent', childId: null, name: 'Dana’s iPhone', platform: 'ios', joinedAt: 0, addedBy: ownerUid, code: null });
  const stored = docs[`families/${familyId}/children/${child.id}`];
  assert.equal(stored.name, 'Zoe Tester');
  assert.equal(stored.age, 9);
  assert.equal(stored.ord, 0);
  assert.equal('updatedAgo' in stored, false, 'labels are not stored');
  assert.equal('id' in stored, false);
  assert.deepEqual(await server.doc(`users/${ownerUid}`).then((u) => ({ familyId: u.familyId, role: u.role })), { familyId, role: 'parent' });

  // The writes: batch 1 (3 documents), batch 2 (12), "last seen" (1). The engine itself sends nothing.
  const log = await iphone.fx(true);
  const writes = writesIn(log, { presence: true });
  assert.equal(writes.filter((w) => w.batch === 1).length, 3, describeWrites(log, { presence: true }).join('\n'));
  assert.equal(writes.filter((w) => w.batch === 2).length, 12);
  assert.equal(writes.filter((w) => /\/devices\//.test(w.path)).length, 1);
  assert.equal(writes.length, 16, describeWrites(log, { presence: true }).join('\n'));
  assert.ok(writes.every((w) => w.state === 'acked'));
});

test('creating a second family with the same account is refused', async () => {
  const r = await iphone.link('createFamily', { familyName: 'Another', childName: 'Nobody' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'already-linked');
  assert.deepEqual(await server.familyIds(), [familyId]);
});

test('a second device signs in with the same account and shows the same family, with no code', async () => {
  await tablet.launch();
  await tablet.waitStatus('signed-out');
  const before = await server.dataText(familyId);

  const wrong = await tablet.link('signIn', OWNER_EMAIL, 'not the password');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, 'wrong-credentials');
  assert.match(wrong.message, /email address or the password is wrong/);
  assert.equal((await tablet.view()).link.status, 'signed-out');

  ok(await tablet.link('signIn', OWNER_EMAIL, PASSWORD), 'signIn');
  const v = await tablet.eventually((x) => x.link.status === 'linked' && x.store.children.length === 1 && x.store.children[0].name === 'Zoe Tester' && x.link.members[0]?.lastSeenAt != null, 'linked to the family');
  await quiet([tablet, iphone]);

  assert.equal(v.link.familyId, familyId);
  assert.equal(v.link.role, 'parent');
  assert.equal(v.link.familyName, 'The Testers');
  assert.equal(v.link.offer, null);
  assert.equal(v.link.pendingJoin, null);
  assert.deepEqual(await server.collection('pairing'), {}, 'no pairing code was involved');
  assert.deepEqual(syncedOf((await tablet.view()).store), syncedOf((await iphone.view()).store), 'both devices show the same data');

  // The second device uploads nothing but its "last seen".
  const log = await tablet.fx(true);
  assert.deepEqual(describeWrites(log), [], 'no data write from the device that signed in');
  assert.equal(writesIn(log, { presence: true }).length, 1);
  assert.equal(await server.dataText(familyId), before, 'the family’s data on the server is untouched');

  // One account, two devices: one member, two "last seen" records.
  const members = Object.keys(await server.collection(`families/${familyId}/members`));
  assert.deepEqual(members, [ownerUid]);
  assert.equal(Object.keys(await server.collection(`families/${familyId}/devices`)).length, 2);
});

test('a confirmed account that is not on the owner list cannot create a family, and is told why', async () => {
  await stranger.launch();
  await stranger.waitStatus('signed-out');
  const account = await signUpVerified(stranger, 'stranger@example.com');
  await stranger.waitStatus('needs-family');
  await stranger.fx(true);

  const r = await stranger.link('createFamily', { familyName: 'Strangers', childName: 'Kid' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'permission');
  assert.match(r.message, /not allowed to create a family/);
  assert.match(r.message, /pairing code/);

  const v = await stranger.waitStatus('needs-family');
  assert.equal(v.link.familyId, null);
  assert.equal(v.link.role, null);
  assert.deepEqual(v.store.children.map((c) => c.name), SAMPLE.childNames, 'still the sample data');
  assert.equal(v.store.live, false);
  assert.deepEqual(await server.familyIds(), [familyId], 'still exactly one family');
  assert.equal(await server.doc(`users/${account.uid}`), null, 'no pointer for the stranger');
  const log = await stranger.fx(true);
  assert.ok(writesIn(log, { presence: true }).every((w) => w.state === 'failed'), 'nothing the stranger sent was accepted');
  assert.equal(stranger.disk()['haven.link.v2'], undefined, 'no link record is left on the phone');
});

test('nothing went wrong inside the apps', async () => {
  await noAppErrors([iphone, tablet]);
  // The SDK itself prints the server's refusal of the stranger's family.
  await noAppErrors([stranger], REFUSAL_NOISE);
});
