// b. Pairing: a child's phone joins with a code and a parent approves it into an existing child
//    profile; another joins as a brand-new child; a second parent joins with a parent code. A wrong
//    code, an expired code, a declined request and a used code each end where they should.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { authEmulator, createFamily, describeWrites, disposeAll, makePhone, ok, quiet, resetBackend, server, signUpVerified, sleep, writesIn } from './harness/driver.mjs';
import { REFUSAL_NOISE, noAppErrors, recent, showsSample, syncedOf } from './harness/expect.mjs';

const INVALID = /That code is not valid or has expired/;
const DECLINED = 'The request was declined or has expired.';

let parent;
let zoePhone;
let maxPhone;
let parent2;
let other;
let fam;
let firstCode;
let zoeUid;

/** The accounts that exist in the Auth emulator, anonymous ones counted separately. */
async function accountCount() {
  const all = await authEmulator.accounts();
  return { real: all.filter((a) => a.email).length, anonymous: all.filter((a) => !a.email).length };
}

before(async () => {
  await resetBackend();
  parent = makePhone('b-parent', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  zoePhone = makePhone('b-zoe', { platform: 'android', deviceName: 'Zoe’s phone' });
  maxPhone = makePhone('b-max', { platform: 'android', deviceName: 'Max’s phone' });
  parent2 = makePhone('b-parent2', { platform: 'android', deviceName: 'Sam’s Pixel' });
  other = makePhone('b-other', { platform: 'android', deviceName: 'Some other phone' });
  await parent.launch();
  fam = await createFamily(parent);
  await quiet([parent]);
  await parent.fx(true);
});
after(disposeAll);

test('the parent makes a code: one document, 15 minutes, unclaimed', async () => {
  const offer = ok(await parent.link('createPairingCode', 'child'), 'createPairingCode');
  firstCode = offer.code;
  assert.match(offer.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(offer.role, 'child');
  assert.equal(offer.claim, null);
  assert.ok(Math.abs(offer.expiresAt - (Date.now() + 15 * 60000)) < 5000, 'expires in 15 minutes');
  assert.deepEqual((await parent.view()).link.offer, offer);

  const stored = await server.doc(`pairing/${offer.code}`);
  assert.deepEqual({ ...stored, createdAt: 0 }, { familyId: fam.familyId, role: 'child', createdBy: fam.uid, createdAt: 0, expiresAt: offer.expiresAt, claimedBy: null, claimName: null, claimPlatform: null, claimedAt: null, approved: false });
  assert.ok(recent(stored.createdAt));
  assert.deepEqual(describeWrites(await parent.fx(true)), [`set pairing/${offer.code} [approved,claimName,claimPlatform,claimedAt,claimedBy,createdAt,createdBy,expiresAt,familyId,role]`]);
});

test('a child phone enters the code: it waits, and both phones show the same 4-character check', async () => {
  const start = await zoePhone.launch();
  assert.ok(showsSample(start.store));
  await zoePhone.waitStatus('signed-out');

  // Typed the way a person would: lower case, with the dash.
  const typed = `${firstCode.slice(0, 4)}-${firstCode.slice(4)}`.toLowerCase();
  ok(await zoePhone.link('joinWithCode', typed), 'joinWithCode');
  const v = await zoePhone.waitStatus('waiting');
  zoeUid = v.link.account.uid;
  assert.equal(v.link.account.anonymous, true);
  assert.equal(v.link.familyId, null);
  assert.equal(v.link.role, null);
  assert.equal(v.link.pendingJoin.code, firstCode);
  assert.match(v.link.pendingJoin.check, /^[A-Z0-9]{4}$/);
  assert.equal(v.link.pendingJoin.check, zoeUid.slice(-4).toUpperCase());
  assert.ok(showsSample(v.store), 'still the sample data while waiting');
  assert.deepEqual(describeWrites(await zoePhone.fx(true)), [`update pairing/${firstCode} [claimName,claimPlatform,claimedAt,claimedBy]`], 'the claim is one write');

  const p = await parent.eventually((x) => x.link.offer?.claim, 'the claim on the parent');
  assert.deepEqual(p.link.offer.claim, { uid: zoeUid, name: 'Zoe’s phone', platform: 'android', check: v.link.pendingJoin.check }, 'same check on both phones');

  const stored = await server.doc(`pairing/${firstCode}`);
  assert.deepEqual({ claimedBy: stored.claimedBy, claimName: stored.claimName, claimPlatform: stored.claimPlatform, approved: stored.approved }, { claimedBy: zoeUid, claimName: 'Zoe’s phone', claimPlatform: 'android', approved: false });
  assert.ok(recent(stored.claimedAt));
  assert.equal(await server.doc(`families/${fam.familyId}/members/${zoeUid}`), null, 'not a member before a parent approves');
});

test('a claimed code cannot be claimed by another phone', async () => {
  await other.launch();
  await other.waitStatus('signed-out');
  const r = await other.link('joinWithCode', firstCode);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-code');
  assert.match(r.message, INVALID);
  const v = await other.waitStatus('signed-out');
  assert.equal(v.link.account, null, 'the throw-away account is gone again');
  assert.equal((await server.doc(`pairing/${firstCode}`)).claimedBy, zoeUid, 'the claim is still the first phone’s');
});

test('the waiting phone can be closed and opened again: it goes on waiting', async () => {
  const v = await zoePhone.relaunch();
  const w = await zoePhone.waitStatus('waiting');
  assert.ok(v.store.ready);
  assert.equal(w.link.account.uid, zoeUid, 'the same anonymous account after a restart');
  assert.equal(w.link.pendingJoin.code, firstCode);
  assert.equal(w.link.pendingJoin.check, zoeUid.slice(-4).toUpperCase());
  assert.deepEqual(describeWrites(await zoePhone.fx(true)), [], 'waiting again costs no write');
});

test('the parent approves into the existing child profile: the phone is linked as that child', async () => {
  await parent.fx(true);
  ok(await parent.link('approveClaim', { childId: fam.childId }), 'approveClaim');
  const c = await zoePhone.eventually((x) => x.link.status === 'linked' && x.store.children.length === 1 && x.store.children[0].id === fam.childId && x.link.members.length === 2, 'the child phone to be linked');
  await quiet([parent, zoePhone]);

  // The parent: one batch of three documents.
  assert.deepEqual(
    describeWrites(await parent.fx(true)).sort(),
    [`update children/${fam.childId} [deviceName]`, `set members/${zoeUid} [addedBy,childId,code,joinedAt,name,platform,role]`, `update pairing/${firstCode} [approved]`].sort(),
  );
  const p = await parent.eventually((x) => x.link.offer === null && x.link.members.length === 2 && x.store.children[0].deviceName === 'Zoe’s phone', 'the parent to see the new member');
  const member = p.link.members.find((m) => m.uid === zoeUid);
  assert.deepEqual({ role: member.role, childId: member.childId, name: member.name, platform: member.platform, isThisAccount: member.isThisAccount, isOwner: member.isOwner }, { role: 'child', childId: fam.childId, name: 'Zoe’s phone', platform: 'android', isThisAccount: false, isOwner: false });

  // The child phone.
  assert.equal(c.link.role, 'child');
  assert.equal(c.link.childId, fam.childId);
  assert.equal(c.link.familyId, fam.familyId);
  assert.equal(c.link.familyName, 'The Testers');
  assert.equal(c.link.pendingJoin, null);
  assert.equal(c.link.account.uid, zoeUid);
  assert.equal(c.store.live, true);
  assert.equal(c.store.selfId, fam.childId);
  assert.deepEqual(c.store.children.map((k) => [k.name, k.deviceName]), [['Zoe Tester', 'Zoe’s phone']]);
  assert.deepEqual(syncedOf(c.store, { slices: ['places', 'schedules', 'tasks', 'sites', 'sosActive'] }), syncedOf(p.store, { slices: ['places', 'schedules', 'tasks', 'sites', 'sosActive'] }));
  assert.deepEqual([c.store.requests, c.store.messages, c.store.alerts], [[], [], []], 'no sample requests, messages or alerts are left');

  // What the child phone sent: its pointer and the tidy-up of the code. No family data.
  const sent = describeWrites(await zoePhone.fx(true)).sort();
  assert.deepEqual(sent, [`delete pairing/${firstCode}`, `set users/${zoeUid} [familyId,role,updatedAt]`].sort());

  // The server.
  const stored = await server.doc(`families/${fam.familyId}/members/${zoeUid}`);
  assert.deepEqual({ ...stored, joinedAt: 0 }, { role: 'child', childId: fam.childId, name: 'Zoe’s phone', platform: 'android', joinedAt: 0, addedBy: fam.uid, code: firstCode });
  assert.deepEqual(await server.doc(`users/${zoeUid}`).then((u) => ({ familyId: u.familyId, role: u.role })), { familyId: fam.familyId, role: 'child' });
  assert.equal((await server.doc(`families/${fam.familyId}/children/${fam.childId}`)).deviceName, 'Zoe’s phone');
  assert.equal(await server.doc(`pairing/${firstCode}`), null, 'the used code was tidied away');
});

test('a code cannot be used twice', async () => {
  const r = await other.link('joinWithCode', firstCode);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-code');
  assert.match(r.message, INVALID);
  assert.equal((await other.waitStatus('signed-out')).link.account, null);
});

test('a wrong code and a code that is too short are refused with a clear message', async () => {
  const wrong = await other.link('joinWithCode', 'ZZZZ-ZZZZ');
  assert.deepEqual([wrong.ok, wrong.code], [false, 'invalid-code']);
  assert.match(wrong.message, INVALID);
  const short = await other.link('joinWithCode', 'ABC');
  assert.deepEqual([short.ok, short.code], [false, 'invalid-code']);
  assert.match(short.message, /Enter the 8-character code/);
  const v = await other.waitStatus('signed-out');
  assert.equal(v.link.account, null);
  assert.equal(v.link.pendingJoin, null);
  assert.ok(showsSample(v.store));
  assert.deepEqual(await accountCount(), { real: 1, anonymous: 1 }, 'no throw-away accounts are left behind');
});

test('an expired code is refused the same way, and the parent can take it back', async () => {
  const offer = ok(await parent.link('createPairingCode', 'child'), 'createPairingCode');
  // Run the clock out on the server (the app cannot do this by itself).
  await server.patch(`pairing/${offer.code}`, { expiresAt: new Date(Date.now() - 60000) });
  const r = await other.link('joinWithCode', offer.code);
  assert.deepEqual([r.ok, r.code], [false, 'invalid-code']);
  assert.match(r.message, INVALID);
  assert.equal((await other.waitStatus('signed-out')).link.account, null);
  assert.equal((await server.doc(`pairing/${offer.code}`)).claimedBy, null, 'the claim did not land');

  ok(await parent.link('cancelPairingCode'), 'cancelPairingCode');
  assert.equal((await parent.view()).link.offer, null);
  assert.equal(await server.doc(`pairing/${offer.code}`), null);
});

test('a declined request ends with a clear message and leaves nothing behind', async () => {
  const offer = ok(await parent.link('createPairingCode', 'child'), 'createPairingCode');
  ok(await other.link('joinWithCode', offer.code), 'joinWithCode');
  const waiting = await other.waitStatus('waiting');
  const uid = waiting.link.account.uid;
  await parent.eventually((x) => x.link.offer?.claim?.uid === uid, 'the claim on the parent');

  ok(await parent.link('declineClaim'), 'declineClaim');
  const v = await other.eventually((x) => x.link.status === 'signed-out' && x.link.error !== null, 'the other phone to be told');
  assert.equal(v.link.error, DECLINED);
  assert.equal(v.link.pendingJoin, null);
  assert.equal(v.link.account, null);
  assert.equal(v.link.familyId, null);
  assert.ok(showsSample(v.store));
  assert.equal((await parent.view()).link.offer, null);
  assert.equal(await server.doc(`pairing/${offer.code}`), null);
  assert.equal(await server.doc(`families/${fam.familyId}/members/${uid}`), null);
  assert.equal(await server.doc(`users/${uid}`), null);
  assert.equal(other.disk()['haven.link.v2'], undefined, 'no link record is left on the phone');
  await sleep(300);
  assert.deepEqual(await accountCount(), { real: 1, anonymous: 1 }, 'the declined phone’s throw-away account is gone');
});

test('another phone joins as a brand-new child', async () => {
  await maxPhone.launch();
  await maxPhone.waitStatus('signed-out');
  const offer = ok(await parent.link('createPairingCode', 'child'), 'createPairingCode');
  ok(await maxPhone.link('joinWithCode', offer.code), 'joinWithCode');
  const waiting = await maxPhone.waitStatus('waiting');
  const maxUid = waiting.link.account.uid;
  await parent.eventually((x) => x.link.offer?.claim?.uid === maxUid, 'the claim on the parent');
  await quiet([parent]);
  await parent.fx(true);

  ok(await parent.link('approveClaim', { newChildName: 'Max Tester' }), 'approveClaim');
  const c = await maxPhone.eventually((x) => x.link.status === 'linked' && x.store.children.length === 1 && x.store.children[0].name === 'Max Tester', 'the new phone to be linked');
  const p = await parent.eventually((x) => x.store.children.length === 2 && x.link.members.length === 3, 'the parent to see two children');
  await quiet([parent, maxPhone, zoePhone]);
  const maxId = c.link.childId;

  assert.notEqual(maxId, fam.childId);
  assert.equal(c.link.role, 'child');
  assert.equal(c.store.selfId, maxId);
  assert.deepEqual(c.store.children.map((k) => [k.id, k.name, k.deviceName]), [[maxId, 'Max Tester', 'Max’s phone']]);
  assert.deepEqual(p.store.children.map((k) => [k.id, k.name, k.deviceName]), [[fam.childId, 'Zoe Tester', 'Zoe’s phone'], [maxId, 'Max Tester', 'Max’s phone']]);
  assert.deepEqual(describeWrites(await parent.fx(true)).map((w) => w.replace(/ \[.*/, '')).sort(), [`set children/${maxId}`, `set members/${maxUid}`, `update pairing/${offer.code}`].sort(), 'one batch: the child, the member, the code');
  assert.deepEqual({ role: 'child', childId: maxId }, await server.doc(`families/${fam.familyId}/members/${maxUid}`).then((m) => ({ role: m.role, childId: m.childId })));
  assert.equal((await server.doc(`families/${fam.familyId}/children/${maxId}`)).name, 'Max Tester');

  // The first child's phone still knows only its own child.
  const z = await zoePhone.view();
  assert.deepEqual(z.store.children.map((k) => k.id), [fam.childId]);
  assert.equal(z.link.childId, fam.childId);
  assert.equal(z.link.members.length, 3);
});

test('a child phone cannot use a parent code', async () => {
  const offer = ok(await parent.link('createPairingCode', 'parent'), 'createPairingCode');
  assert.equal(offer.role, 'parent');
  const r = await other.link('joinWithCode', offer.code);
  assert.deepEqual([r.ok, r.code], [false, 'invalid-code']);
  assert.equal((await other.waitStatus('signed-out')).link.account, null);
  assert.equal((await server.doc(`pairing/${offer.code}`)).claimedBy, null);
});

test('a second parent joins with a parent code, using a second confirmed account', async () => {
  await parent2.launch();
  await parent2.waitStatus('signed-out');
  const account = await signUpVerified(parent2, 'parent2@example.com');
  await parent2.waitStatus('needs-family');
  const offer = (await parent.view()).link.offer;
  assert.equal(offer.role, 'parent');

  ok(await parent2.link('joinWithCode', offer.code), 'joinWithCode');
  const waiting = await parent2.waitStatus('waiting');
  assert.equal(waiting.link.account.uid, account.uid);
  assert.equal(waiting.link.account.anonymous, false);
  const p = await parent.eventually((x) => x.link.offer?.claim?.uid === account.uid, 'the claim on the first parent');
  assert.equal(p.link.offer.claim.check, waiting.link.pendingJoin.check);
  const before = await server.dataText(fam.familyId);

  ok(await parent.link('approveClaim', null), 'approveClaim');
  const v = await parent2.eventually((x) => x.link.status === 'linked' && x.store.children.length === 2 && x.link.members.length === 4, 'the second parent to be linked');
  await quiet([parent, parent2]);

  assert.equal(v.link.role, 'parent');
  assert.equal(v.link.childId, null);
  assert.equal(v.link.familyId, fam.familyId);
  const me = v.link.members.find((m) => m.isThisAccount);
  assert.deepEqual({ uid: me.uid, role: me.role, isOwner: me.isOwner, name: me.name }, { uid: account.uid, role: 'parent', isOwner: false, name: 'Sam’s Pixel' });
  assert.deepEqual(syncedOf(v.store), syncedOf((await parent.view()).store), 'both parents show the same family');
  assert.deepEqual(await server.doc(`families/${fam.familyId}/members/${account.uid}`).then((m) => ({ role: m.role, childId: m.childId, addedBy: m.addedBy })), { role: 'parent', childId: null, addedBy: fam.uid });
  assert.deepEqual(await server.doc(`users/${account.uid}`).then((u) => ({ familyId: u.familyId, role: u.role })), { familyId: fam.familyId, role: 'parent' });
  assert.equal(await server.dataText(fam.familyId), before, 'joining changed none of the family’s data');
  assert.deepEqual(describeWrites(await parent2.fx(true)).sort(), [`update pairing/${offer.code} [claimName,claimPlatform,claimedAt,claimedBy]`, `delete pairing/${offer.code}`, `set users/${account.uid} [familyId,role,updatedAt]`].sort());
  await until_empty_pairing();
});

async function until_empty_pairing() {
  for (let i = 0; i < 40; i++) {
    if (Object.keys(await server.collection('pairing')).length === 0) return;
    await sleep(50);
  }
  assert.deepEqual(Object.keys(await server.collection('pairing')), [], 'no pairing code is left on the server');
}

test('nothing went wrong inside the apps', async () => {
  await noAppErrors([parent, zoePhone, maxPhone, parent2]);
  // The SDK prints the server's refusals of the bad codes.
  await noAppErrors([other], REFUSAL_NOISE);
});
