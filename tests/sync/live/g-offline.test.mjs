// g. Without a network. A linked phone that is started with the network down says "offline" within
//    5 seconds and shows what it had. Changes made offline arrive when the network is back; changes
//    made offline and followed by a kill arrive after the next start. Each arrives exactly once.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createFamily, describeWrites, disposeAll, enrol, makePhone, ok, quiet, resetBackend, server, sleep, until } from './harness/driver.mjs';
import { OFFLINE_NOISE, noAppErrors, recent, syncedOf } from './harness/expect.mjs';

const OFFLINE_NOTE = 'No connection right now. Changes are kept on this device and sent when it is back.';

let parent;
let child;
let fam;
let cid;
let F;
let childUid;

const kid = (v) => v.store.children.find((c) => c.id === cid);
const count = async (collection, test) => Object.values(await server.collection(`${F}/${collection}`)).filter(test).length;

/** Starts the stopped phone with its network down (`how`) and returns how long it took to say "offline". */
async function startOffline(phone, how) {
  phone.offline(how);
  const processStart = Date.now();
  const first = await phone.launch();
  const mounted = Date.now();
  const v = await phone.waitStatus('offline', 20000);
  return { first, v, sinceMount: Date.now() - mounted, sinceProcessStart: Date.now() - processStart };
}

/** Whatever happens in a test, the next one starts with both phones on the network. */
function restoreNetworkAfter(t) {
  t.after(() => {
    parent.online();
    child.online();
  });
}

before(async () => {
  await resetBackend();
  parent = makePhone('g-parent', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  child = makePhone('g-child', { platform: 'android', deviceName: 'Zoe’s phone' });
  await parent.launch();
  await child.launch();
  fam = await createFamily(parent);
  cid = fam.childId;
  F = `families/${fam.familyId}`;
  childUid = (await enrol(parent, child, { childId: cid })).uid;
  await parent.store('sendMessage', cid, 'parent', 'Home by six');
  await child.eventually((v) => v.store.messages.length === 1, 'the child to get the message');
  await quiet([parent, child]);
  await sleep(700);
});
after(disposeAll);

test('a linked child phone started with the network refused says "offline" within 5 seconds', async (t) => {
  restoreNetworkAfter(t);
  const shown = syncedOf((await child.view()).store);
  await child.kill();
  const r = await startOffline(child, 'refuse');
  t.diagnostic(`offline ${r.sinceMount} ms after the app was mounted (${r.sinceProcessStart} ms after the process started)`);
  assert.ok(r.sinceMount < 5000, `took ${r.sinceMount} ms`);
  assert.notEqual(r.first.link.status, 'linked');

  // It shows what it had, and knows who it is.
  assert.deepEqual(syncedOf(r.v.store), shown, 'the saved family data is shown');
  assert.deepEqual([r.v.link.familyId, r.v.link.role, r.v.link.childId], [fam.familyId, 'child', cid]);
  assert.equal(r.v.link.error, OFFLINE_NOTE);
  assert.equal(r.v.store.live, true);
  assert.equal(r.v.store.selfId, cid);

  // What needs the server fails at once, with a sentence.
  const started = Date.now();
  const left = await child.link('unlink');
  assert.deepEqual([left.ok, left.code], [false, 'network']);
  assert.match(left.message, /Can't reach the server/);
  assert.ok(Date.now() - started < 1000, 'unlink fails fast');
  assert.equal((await child.view()).link.status, 'offline', 'and the phone is still in the family');

  child.online();
  await child.waitStatus('linked', 60000);
  await quiet([child]);
  assert.deepEqual(describeWrites(await child.fx(true)), [], 'coming back sends nothing');
});

test('the same with a dead connection (nothing answers): "offline" within 5 seconds', async (t) => {
  restoreNetworkAfter(t);
  await sleep(600);
  await child.kill();
  const r = await startOffline(child, 'hang');
  t.diagnostic(`offline ${r.sinceMount} ms after the app was mounted (${r.sinceProcessStart} ms after the process started)`);
  assert.ok(r.sinceMount < 5000, `took ${r.sinceMount} ms`);
  assert.equal(r.v.link.error, OFFLINE_NOTE);
  assert.equal(r.v.store.messages.length, 1);
  assert.deepEqual([r.v.link.familyId, r.v.link.role, r.v.link.childId, r.v.store.live, r.v.store.selfId], [fam.familyId, 'child', cid, true, cid], 'it knows its family from its own record');

  // On such a connection Firebase Auth needs up to a minute to give up confirming the saved
  // sign-in. Here that moment is brought forward (its requests now fail at once) while Firestore
  // still gets no answer: the phone must stay "offline" and not go back to "connecting".
  child.offline('refuse', 'auth');
  const seen = new Set();
  let account = null;
  for (let i = 0; i < 100; i++) {
    const v = await child.view();
    seen.add(v.link.status);
    account = v.link.account;
    await sleep(60);
  }
  assert.deepEqual([...seen], ['offline']);
  assert.equal(account?.uid, childUid, 'by now the saved sign-in has been reported');

  child.online();
  await child.waitStatus('linked', 90000);
  await quiet([child]);
});

test('a linked parent phone started with the network down says "offline" within 5 seconds, and its actions fail fast', async (t) => {
  restoreNetworkAfter(t);
  await sleep(600);
  const shown = syncedOf((await parent.view()).store);
  await parent.kill();
  const r = await startOffline(parent, 'refuse');
  t.diagnostic(`offline ${r.sinceMount} ms after the app was mounted (${r.sinceProcessStart} ms after the process started)`);
  assert.ok(r.sinceMount < 5000, `took ${r.sinceMount} ms`);
  assert.deepEqual(syncedOf(r.v.store), shown);
  assert.deepEqual([r.v.link.familyId, r.v.link.role, r.v.link.account?.email], [fam.familyId, 'parent', 'owner@example.com']);

  const started = Date.now();
  const code = await parent.link('createPairingCode', 'child');
  assert.deepEqual([code.ok, code.code], [false, 'network']);
  const removal = await parent.link('removeMember', childUid);
  assert.deepEqual([removal.ok, removal.code], [false, 'network']);
  assert.ok(Date.now() - started < 1000, 'both fail fast');
  assert.ok(await server.doc(`${F}/members/${childUid}`), 'the child is still a member');

  parent.online();
  await parent.waitStatus('linked', 60000);
  await quiet([parent]);
  assert.deepEqual(describeWrites(await parent.fx(true)), []);
});

test('changes made offline arrive after reconnecting, each exactly once', async (t) => {
  restoreNetworkAfter(t);
  await quiet([parent, child]);
  await parent.fx(true);
  await child.fx(true);
  const limit = kid(await parent.view()).limitMin;

  child.offline('refuse');
  const wentOffline = Date.now();
  await child.waitStatus('offline', 30000);
  t.diagnostic(`a running phone noticed the lost connection after ${Date.now() - wentOffline} ms`);

  await child.store('sendMessage', cid, 'child', 'written offline');
  await child.store('requestExtraTime', 20);
  await child.store('toggleTask', 't3');
  await child.store('checkIn');
  await child.store('triggerSOS');
  // Meanwhile, on the parent's phone, which is online.
  await parent.store('adjustLimit', cid, -30);
  await parent.store('toggleTask', 't4');
  await quiet([parent]);
  await sleep(1500);
  const c = await child.view();
  assert.equal(c.link.status, 'offline');
  assert.deepEqual([c.store.messages.some((m) => m.text === 'written offline'), c.store.requests.some((r) => r.minutes === 20), c.store.tasks.find((x) => x.id === 't3').done, c.store.sosActive], [true, true, true, true], 'the changes show on the phone at once');
  assert.equal(await count(`children/${cid}/messages`, (m) => m.text === 'written offline'), 0, 'nothing has reached the server yet');
  assert.equal((await parent.view()).store.sosActive, false);

  child.online();
  await until(async () => (await count(`children/${cid}/messages`, (m) => m.text === 'written offline')) === 1 && (await server.doc(`${F}/signals/sos`))?.active === true, 'the offline changes to arrive', 90000);
  await child.waitStatus('linked', 30000);
  await quiet([parent, child], 800, 30000);

  // Each arrived once.
  assert.equal(await count(`children/${cid}/messages`, (m) => m.text === 'written offline'), 1);
  assert.equal(await count(`children/${cid}/requests`, (r) => r.minutes === 20), 1);
  assert.equal((await server.doc(`${F}/tasks/t3`)).done, true);
  assert.equal(await count('alerts', (a) => a.kind === 'checkin'), 1);
  assert.equal(await count('alerts', (a) => a.kind === 'sos'), 1);
  assert.ok(recent((await server.doc(`${F}/children/${cid}/live/status`)).checkInAt));
  const sent = describeWrites(await child.fx(true)).map((w) => w.replace(/(alerts|messages|requests)\/\w+/, '$1/*').replace(/ \[.*/, '')).sort();
  assert.deepEqual(sent, [`set alerts/*`, `set alerts/*`, `set children/${cid}/live/status`, `set children/${cid}/messages/*`, `set children/${cid}/requests/*`, 'set signals/sos', 'update tasks/t3'].sort(), 'one write per change');

  // And the parent's changes made meanwhile are still there.
  const stored = await server.doc(`${F}/children/${cid}`);
  assert.equal(stored.limitMin, limit - 30);
  assert.equal((await server.doc(`${F}/tasks/t4`)).done, true);
  const c2 = await child.eventually((v) => kid(v).limitMin === limit - 30 && v.store.tasks.find((x) => x.id === 't4').done === true, 'the child to take the parent’s changes in');
  const p2 = await parent.eventually((v) => v.store.sosActive === true && v.store.messages.some((m) => m.text === 'written offline') && v.store.requests.some((r) => r.minutes === 20), 'the parent to get everything');
  assert.equal(p2.store.tasks.find((x) => x.id === 't3').done, true);
  assert.equal(c2.store.tasks.find((x) => x.id === 't3').done, true);
  await parent.store('clearSOS');
  await child.eventually((v) => v.store.sosActive === false, 'the SOS to be cleared');
  await quiet([parent, child]);
});

test('changes made offline and followed by a kill arrive after the next start, each exactly once', async (t) => {
  restoreNetworkAfter(t);
  await sleep(600);
  await parent.fx(true);
  await child.fx(true);
  child.offline('hang');
  await child.store('sendMessage', cid, 'child', 'written offline, then killed');
  await child.store('requestExtraTime', 10);
  await child.store('toggleTask', 't2');
  await child.store('checkIn');
  await sleep(1500); // the phone has saved its state; nothing can have reached the server
  assert.equal(await count(`children/${cid}/messages`, (m) => m.text === 'written offline, then killed'), 0);
  const firstLife = describeWrites(await child.fx(true)).length;
  assert.ok(firstLife >= 4, 'the first life handed its writes to the SDK, which could not send them');
  await child.kill();

  // The next start is still without a network: the changes are still on the phone.
  const r = await startOffline(child, 'refuse');
  assert.ok(r.sinceMount < 5000);
  assert.deepEqual([r.v.store.messages.some((m) => m.text === 'written offline, then killed'), r.v.store.requests.some((q) => q.minutes === 10), r.v.store.tasks.find((x) => x.id === 't2').done], [true, true, true]);
  assert.equal(await count(`children/${cid}/messages`, (m) => m.text === 'written offline, then killed'), 0);

  child.online();
  await until(async () => (await count(`children/${cid}/messages`, (m) => m.text === 'written offline, then killed')) === 1 && (await count(`children/${cid}/requests`, (q) => q.minutes === 10)) === 1, 'the changes to arrive after the restart', 90000);
  await child.waitStatus('linked', 30000);
  await quiet([parent, child], 800, 30000);

  assert.equal(await count(`children/${cid}/messages`, (m) => m.text === 'written offline, then killed'), 1);
  assert.equal(await count(`children/${cid}/requests`, (q) => q.minutes === 10), 1);
  assert.equal((await server.doc(`${F}/tasks/t2`)).done, true);
  assert.equal(await count('alerts', (a) => a.kind === 'checkin'), 2, 'the second check-in arrived once');
  const sent = describeWrites(await child.fx(true)).map((w) => w.replace(/(alerts|messages|requests)\/\w+/, '$1/*').replace(/ \[.*/, '')).sort();
  assert.deepEqual(sent, ['set alerts/*', `set children/${cid}/live/status`, `set children/${cid}/messages/*`, `set children/${cid}/requests/*`, 'update tasks/t2'].sort(), 'the second life sent each change once');
  const p = await parent.eventually((v) => v.store.messages.some((m) => m.text === 'written offline, then killed') && v.store.requests.some((q) => q.minutes === 10) && v.store.tasks.find((x) => x.id === 't2').done, 'the parent to get them');
  const message = p.store.messages.find((m) => m.text === 'written offline, then killed');
  const c = await child.eventually((v) => v.store.messages.find((m) => m.id === message.id)?.at === message.at, 'both phones to hold the server’s time for the message');
  assert.deepEqual(syncedOf(c.store, { slices: ['messages', 'requests', 'tasks'] }), syncedOf((await parent.view()).store, { slices: ['messages', 'requests', 'tasks'] }));
});

test('the parent’s changes made offline arrive too; clearing an SOS needs the connection and says so', async (t) => {
  restoreNetworkAfter(t);
  await quiet([parent, child]);
  await child.store('triggerSOS');
  await parent.eventually((v) => v.store.sosActive === true, 'the parent to see the SOS');
  await quiet([parent, child]);
  await parent.fx(true);
  parent.offline('refuse');
  await parent.waitStatus('offline', 30000);

  await parent.store('addPlace', { name: 'Library', icon: 'home', radius: 80, arrive: true, leave: false });
  await parent.store('toggleSchedule', 's4');
  await parent.store('sendMessage', cid, 'parent', 'from the tunnel');
  await parent.store('clearSOS');
  const told = await parent.eventually((v) => v.store.sosActive === true && /needs a connection/.test(String(v.link.error)), 'the SOS to be put back with a message', 20000);
  assert.equal(told.store.sosChildId, cid);
  await sleep(800);
  assert.equal((await server.doc(`${F}/signals/sos`)).active, true, 'the SOS is still on');
  assert.equal(await count('places', (p) => p.name === 'Library'), 0);

  parent.online();
  await until(async () => (await count('places', (p) => p.name === 'Library')) === 1 && (await count(`children/${cid}/messages`, (m) => m.text === 'from the tunnel')) === 1, 'the parent’s offline changes to arrive', 90000);
  await parent.waitStatus('linked', 30000);
  await quiet([parent, child], 800, 30000);
  assert.equal((await server.doc(`${F}/schedules/s4`)).on, false);
  assert.equal(await count('places', (p) => p.name === 'Library'), 1);
  await child.eventually((v) => v.store.places.some((p) => p.name === 'Library') && v.store.messages.some((m) => m.text === 'from the tunnel') && v.store.schedules.find((s) => s.id === 's4').on === false, 'the child to get them');
  const sent = describeWrites(await parent.fx(true)).map((w) => w.replace(/(places|messages)\/\w+/, '$1/*').replace(/ \[.*/, '').replace(/ FAILED.*/, ' (failed)')).sort();
  assert.deepEqual(sent, [`set children/${cid}/messages/*`, 'set places/*', 'tx.set signals/sos (failed)', 'update schedules/s4'].sort());

  // Online again, the clear goes through.
  await parent.store('clearSOS');
  await child.eventually((v) => v.store.sosActive === false, 'the SOS to be cleared');
  assert.equal((await server.doc(`${F}/signals/sos`)).active, false);
});

test('nothing went wrong inside the apps apart from the SDK saying it is offline', async () => {
  await noAppErrors([parent, child], OFFLINE_NOISE);
});
