// f. Removal, leaving and signing out. A parent removes a child's phone: the phone says "removed",
//    shows the sample data again, and the server refuses whatever it still asks for. A child's phone
//    unlinks itself: its member record is gone, the parents get a "left" alert, and nothing of the
//    family is left in its storage. A parent signs out: the same for that phone, and signing in again
//    brings everything back.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { OWNER_EMAIL, PASSWORD, authEmulator, createFamily, describeWrites, disposeAll, enrol, idTokenOf, makePhone, ok, quiet, readAs, resetBackend, server, signUpVerified, sleep, until, writesIn } from './harness/driver.mjs';
import { REFUSAL_NOISE, noAppErrors, showsSample, syncedOf } from './harness/expect.mjs';

let parent;
let child;
let parent2;
let fam;
let cid;
let F;

/** Nothing that belongs to the family may be found in what the phone keeps on disk. */
function assertNoFamilyDataOnDisk(phone, extra = []) {
  const disk = phone.disk();
  const text = JSON.stringify(disk);
  for (const needle of [fam.familyId, 'Zoe Tester', 'The Testers', 'Home by six', 'Swim club', fam.uid, ...extra]) {
    assert.equal(text.includes(needle), false, `"${needle}" is still in the storage of ${phone.name} (keys: ${Object.keys(disk).join(', ')})`);
  }
}

before(async () => {
  await resetBackend();
  parent = makePhone('f-parent', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  child = makePhone('f-child', { platform: 'android', deviceName: 'Zoe’s phone' });
  parent2 = makePhone('f-parent2', { platform: 'android', deviceName: 'Sam’s Pixel' });
  await parent.launch();
  await child.launch();
  fam = await createFamily(parent);
  cid = fam.childId;
  F = `families/${fam.familyId}`;
  await parent.store('addPlace', { name: 'Swim club', icon: 'home', radius: 100, arrive: true, leave: true });
  await parent.store('sendMessage', cid, 'parent', 'Home by six');
  await quiet([parent]);
});
after(disposeAll);

test('the parent removes the child’s phone: it shows "removed", the sample data, and its reads are refused', async () => {
  const joined = await enrol(parent, child, { childId: cid });
  await child.store('requestExtraTime', 30);
  await parent.eventually((v) => v.store.requests.length === 1 && v.link.members.length === 2 && v.link.members.some((m) => m.uid === joined.uid && m.lastSeenAt !== null), 'the child to be settled in');
  await child.eventually((v) => v.store.messages.length === 1 && v.store.places.some((p) => p.name === 'Swim club'), 'the child to hold family data');
  await quiet([parent, child]);
  await sleep(600);
  const deviceId = child.disk()['haven.device.v1'];
  const token = idTokenOf(child);
  assert.ok(token, 'the child phone holds a token');
  assert.equal(await readAs(token, `${F}/children/${cid}`), 200, 'before the removal the phone may read its child record');
  assert.equal(await readAs(token, `${F}/places/p1`), 200);
  assert.match(JSON.stringify(child.disk()), /Home by six/, 'and it has family data on disk');
  const before = await server.dataText(fam.familyId);
  await parent.fx(true);
  await child.fx(true);

  ok(await parent.link('removeMember', joined.uid), 'removeMember');
  const c = await child.eventually((v) => v.link.status === 'removed' && v.link.account === null, 'the child phone to say it was removed', 20000);
  await quiet([parent, child]);

  // The parent: one batch, the member record and that phone's "last seen".
  assert.deepEqual(describeWrites(await parent.fx(true), { presence: true }).sort(), [`delete devices/${deviceId}`, `delete members/${joined.uid}`]);
  const p = await parent.eventually((v) => v.link.members.length === 1, 'the parent to see the member gone');
  assert.equal(p.link.members[0].uid, fam.uid);

  // The removed phone.
  assert.ok(showsSample(c.store), 'sample data again');
  assert.equal(c.link.familyId, null);
  assert.equal(c.link.role, null);
  assert.equal(c.link.childId, null);
  assert.deepEqual(c.link.members, []);
  assert.equal(c.store.live, false);
  assertNoFamilyDataOnDisk(child, [joined.uid]);
  assert.deepEqual(writesIn(await child.fx(true)).filter((w) => w.state !== 'failed').map((w) => `${w.op} ${w.path}`), [`delete users/${joined.uid}`], 'all it still wrote was the removal of its own pointer');

  // The server: gone from the family, and that phone's credentials are refused from now on.
  assert.equal(await server.doc(`${F}/members/${joined.uid}`), null);
  assert.equal(await server.doc(`${F}/devices/${deviceId}`), null);
  assert.equal(await server.doc(`users/${joined.uid}`), null, 'its pointer was tidied away');
  assert.equal(await server.dataText(fam.familyId), before, 'the family’s data is untouched');
  for (const path of [`${F}/children/${cid}`, `${F}/places/p1`, `${F}/children/${cid}/messages/x`, `${F}/signals/sos`, `${F}`, `${F}/members/${fam.uid}`]) {
    assert.equal(await readAs(token, path), 403, `the removed phone’s token is refused for ${path}`);
  }
  assert.equal((await authEmulator.accounts()).some((a) => a.localId === joined.uid), false, 'its throw-away account is gone');
});

test('the removed phone still says so after a restart, and reads and writes nothing', async () => {
  const v = await child.relaunch();
  const w = await child.waitStatus('removed');
  await sleep(1200);
  assert.ok(showsSample(v.store) && showsSample(w.store));
  const log = await child.fx(true);
  assert.deepEqual(log.filter((e) => e.kind !== 'read' || true).map((e) => `${e.kind} ${e.path}`), [], 'no Firestore call at all');
});

test('a removed phone can be enrolled again with a new code', async () => {
  const joined = await enrol(parent, child, { childId: cid });
  const v = await child.eventually((x) => x.link.status === 'linked' && x.store.messages.length === 1 && x.store.requests.length === 1, 'the phone to be back in the family');
  assert.equal(v.link.childId, cid);
  assert.equal(v.store.children[0].name, 'Zoe Tester');
  assert.equal(joined.childId, cid);
  await quiet([parent, child]);
});

test('the child’s phone unlinks itself: member record gone, a "left" alert at the parent, nothing left in its storage', async () => {
  const c0 = await child.view();
  const uid = c0.link.account.uid;
  const deviceId = child.disk()['haven.device.v1'];
  await sleep(600);
  assert.match(JSON.stringify(child.disk()), /Home by six/, 'before leaving, the phone has family data on disk');
  const token = idTokenOf(child);
  await parent.fx(true);
  await child.fx(true);
  const alertsBefore = (await parent.view()).store.alerts.length;

  ok(await child.link('unlink'), 'unlink');
  const c = await child.eventually((v) => v.link.status === 'signed-out' && v.link.account === null, 'the phone to be signed out');
  await quiet([child, parent]);

  // What the phone sent: the goodbye, then its "last seen", its member record and its pointer.
  const sent = describeWrites(await child.fx(true), { presence: true }).map((w) => w.replace(/alerts\/\w+/, 'alerts/*'));
  assert.deepEqual(sent, ['set alerts/* [at,body,by,childId,color,icon,kind,title,unread]', `delete devices/${deviceId}`, `delete members/${uid}`, `delete users/${uid}`]);

  // The phone.
  assert.ok(showsSample(c.store));
  assert.equal(c.link.familyId, null);
  assert.equal(c.link.role, null);
  assert.equal(c.link.error, null);
  assertNoFamilyDataOnDisk(child, [uid]);
  assert.deepEqual(Object.keys(child.disk()).sort(), ['haven.device.v1'], 'only the install id is left on disk');

  // The server.
  assert.equal(await server.doc(`${F}/members/${uid}`), null);
  assert.equal(await server.doc(`${F}/devices/${deviceId}`), null);
  assert.equal(await server.doc(`users/${uid}`), null);
  assert.equal((await authEmulator.accounts()).some((a) => a.localId === uid), false, 'the throw-away account is gone');
  assert.equal(await readAs(token, `${F}/children/${cid}`), 403, 'its old token is refused');

  // The parent: told about it, and the member is gone from the list.
  const p = await parent.eventually((v) => v.store.alerts.length === alertsBefore + 1 && v.link.members.length === 1, 'the parent to get the "left" alert');
  const alert = p.store.alerts.find((a) => a.kind === 'left');
  assert.deepEqual({ childId: alert.childId, title: alert.title, unread: alert.unread }, { childId: cid, title: 'Zoe’s phone left the family', unread: true });
  const stored = await server.doc(`${F}/alerts/${alert.id}`);
  assert.deepEqual({ kind: stored.kind, childId: stored.childId, by: stored.by }, { kind: 'left', childId: cid, by: uid });
  assert.deepEqual(describeWrites(await parent.fx(true)), [], 'the parent’s phone wrote nothing');

  // After a restart: still nothing.
  await child.relaunch();
  const again = await child.waitStatus('signed-out');
  await sleep(800);
  assert.ok(showsSample(again.store));
  assert.deepEqual((await child.fx(true)).map((e) => `${e.kind} ${e.path}`), [], 'no Firestore call at all after the restart');
});

test('the founder cannot leave or be removed', async () => {
  const r = await parent.link('unlink');
  assert.deepEqual([r.ok, r.code], [false, 'permission']);
  assert.match(r.message, /cannot leave/);
  assert.equal((await parent.view()).link.status, 'linked');
  assert.ok(await server.doc(`${F}/members/${fam.uid}`));
});

test('a second parent is removed by the founder: "removed", sample data, still signed in', async () => {
  await parent2.launch();
  const account = await signUpVerified(parent2, 'parent2@example.com');
  await enrol(parent, parent2, null, 'parent');
  await parent2.eventually((v) => v.link.status === 'linked' && v.store.children.length === 1 && v.store.messages.length === 1, 'the second parent to hold the family');
  await quiet([parent, parent2]);
  await sleep(600);

  // The second parent cannot remove the founder.
  const no = await parent2.link('removeMember', fam.uid);
  assert.deepEqual([no.ok, no.code], [false, 'permission']);
  assert.ok(await server.doc(`${F}/members/${fam.uid}`));

  ok(await parent.link('removeMember', account.uid), 'removeMember');
  const v = await parent2.eventually((x) => x.link.status === 'removed', 'the second parent’s phone to say it was removed', 20000);
  await quiet([parent, parent2]);
  assert.ok(showsSample(v.store));
  assert.equal(v.link.account.uid, account.uid, 'the email account stays signed in');
  assert.equal(v.link.familyId, null);
  assertNoFamilyDataOnDisk(parent2);
  assert.equal(await server.doc(`${F}/members/${account.uid}`), null);
  await until(async () => (await server.doc(`users/${account.uid}`)) === null, 'its pointer to be tidied away');
  assert.equal(await readAs(idTokenOf(parent2), `${F}/children/${cid}`), 403);
});

test('a parent signs out: sample data, nothing of the family on the phone; signing in again brings it all back', async () => {
  await quiet([parent]);
  await sleep(600);
  const shown = syncedOf((await parent.view()).store);
  const before = await server.dataText(fam.familyId);
  assert.match(JSON.stringify(parent.disk()), /Home by six/);
  await parent.fx(true);

  ok(await parent.link('signOut'), 'signOut');
  const v = await parent.waitStatus('signed-out');
  await sleep(600);
  assert.ok(showsSample(v.store));
  assert.equal(v.link.account, null);
  assert.equal(v.link.familyId, null);
  assertNoFamilyDataOnDisk(parent);
  assert.deepEqual(describeWrites(await parent.fx(true)), [], 'signing out writes nothing');
  assert.ok(await server.doc(`${F}/members/${fam.uid}`), 'the membership stays');
  assert.equal(await server.dataText(fam.familyId), before);

  ok(await parent.link('signIn', OWNER_EMAIL, PASSWORD), 'signIn');
  await parent.eventually((x) => x.link.status === 'linked' && x.store.messages.length === 1 && x.store.alerts.length > 0, 'the family to be back');
  await quiet([parent]);
  assert.deepEqual(syncedOf((await parent.view()).store), shown, 'everything is back as it was');
  assert.deepEqual(describeWrites(await parent.fx(true)), [], 'and coming back uploads nothing');
  assert.equal(await server.dataText(fam.familyId), before);
});

test('nothing went wrong inside the apps', async () => {
  await noAppErrors([parent]);
  // The removed phones are told "no" by the server (that is how they find out), and the SDK prints it.
  await noAppErrors([child, parent2], REFUSAL_NOISE);
});
