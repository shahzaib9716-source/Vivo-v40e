// d. The defects of the first engine, replayed against this one:
//    - an approval made while the child app is closed survives the child's cold start;
//    - a check-in made offline does not undo what a parent changed meanwhile;
//    - a phone killed within 50 ms of joining uploads nothing;
//    - a kill between local saves does not bring a removed site rule back;
//    - a snapshot that arrives during a send does not undo a second tap;
//    - two children keep separate identities and threads.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { OWNER_EMAIL, PASSWORD, createFamily, describeWrites, disposeAll, enrol, makePhone, ok, quiet, resetBackend, server, sleep, until, writesIn } from './harness/driver.mjs';
import { OFFLINE_NOISE, REFUSAL_NOISE, noAppErrors, showsSample, syncedOf } from './harness/expect.mjs';

let parent;
let tablet;
let zoe;
let max;
let fam;
let F;
let cid;
let maxId;

const kidOf = (v, id) => v.store.children.find((c) => c.id === id);
const inFlight = async (phone) => (await phone.fx(false)).some((e) => e.kind === 'write' && e.state === 'sent');

async function fresh(phones) {
  await quiet(phones);
  for (const p of phones) await p.fx(true);
}

before(async () => {
  await resetBackend();
  parent = makePhone('d-parent', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  tablet = makePhone('d-tablet', { platform: 'android', deviceName: 'Kitchen tablet' });
  zoe = makePhone('d-zoe', { platform: 'android', deviceName: 'Zoe’s phone' });
  max = makePhone('d-max', { platform: 'android', deviceName: 'Max’s phone' });
  await parent.launch();
  await zoe.launch();
  fam = await createFamily(parent);
  cid = fam.childId;
  F = `families/${fam.familyId}`;
  // The family is not the sample data: a place of its own, a lower limit, a message.
  await parent.store('addPlace', { name: 'Swim club', icon: 'home', radius: 100, arrive: true, leave: true });
  await parent.store('adjustLimit', cid, -60);
  await parent.store('sendMessage', cid, 'parent', 'Dentist at 4 today');
  await enrol(parent, zoe, { childId: cid });
  await quiet([parent, zoe]);
});
after(disposeAll);

test('an approval made while the child app is closed survives the child’s cold start', async () => {
  const limit = kidOf(await parent.view(), cid).limitMin;
  await zoe.store('requestExtraTime', 30);
  const p = await parent.eventually((v) => v.store.requests.length === 1, 'the parent to get the request');
  const rid = p.store.requests[0].id;
  await quiet([zoe]);
  await sleep(600); // the child's state is on its disk
  await zoe.kill();

  await fresh([parent]);
  await parent.store('resolveRequest', rid, true);
  await until(async () => (await server.doc(`${F}/children/${cid}/requests/${rid}`)).status === 'approved' && (await server.doc(`${F}/children/${cid}`)).limitMin === limit + 30, 'the approval on the server');
  await quiet([parent]);
  const before = await server.dataText(fam.familyId);

  await zoe.launch();
  const c = await zoe.eventually((v) => v.link.status === 'linked' && v.store.requests[0]?.status === 'approved' && kidOf(v, cid).limitMin === limit + 30, 'the child to show the approval after its cold start');
  await quiet([zoe, parent]);
  await sleep(1500);
  assert.deepEqual(describeWrites(await zoe.fx(true)), [], 'the child’s cold start sends nothing');
  assert.equal(await server.dataText(fam.familyId), before, 'the server is as the parent left it');
  assert.equal((await server.doc(`${F}/children/${cid}/requests/${rid}`)).status, 'approved');
  assert.equal(c.store.requests.length, 1);

  // The request is not pending again, so the parent cannot grant it a second time.
  assert.equal((await parent.view()).store.requests[0].status, 'approved');
  await parent.store('resolveRequest', rid, true);
  await quiet([parent]);
  await sleep(500);
  assert.equal((await server.doc(`${F}/children/${cid}`)).limitMin, limit + 30, 'one approval, 30 minutes');
  assert.equal(kidOf(await parent.view(), cid).limitMin, limit + 30);
  assert.equal(kidOf(await zoe.view(), cid).limitMin, limit + 30);
});

test('a check-in made offline does not undo what the parent changed meanwhile', async () => {
  await fresh([parent, zoe]);
  const start = kidOf(await parent.view(), cid);
  zoe.offline();
  await zoe.eventually((v) => v.link.status === 'offline', 'the child to notice it is offline', 20000);
  await zoe.store('checkIn');
  await sleep(600);
  assert.equal(kidOf(await zoe.view(), cid).checkInAt != null, true, 'the check-in shows on the child at once');

  await parent.store('pauseDevice', cid);
  await parent.store('adjustLimit', cid, -120);
  await parent.store('toggleApp', cid, 'a3');
  await quiet([parent]);
  const mid = await server.doc(`${F}/children/${cid}`);
  assert.deepEqual([mid.bedtime, mid.limitMin, mid.apps.find((a) => a.id === 'a3').blocked], [true, start.limitMin - 120, true]);
  assert.equal(await server.doc(`${F}/children/${cid}/live/status`), null, 'the check-in has not arrived yet');

  zoe.online();
  await until(async () => (await server.doc(`${F}/children/${cid}/live/status`)) !== null, 'the check-in to arrive once the phone is back', 60000);
  const c = await zoe.eventually((v) => v.link.status === 'linked' && kidOf(v, cid).bedtime === true && kidOf(v, cid).limitMin === start.limitMin - 120, 'the child to take the parent’s changes in', 30000);
  await quiet([parent, zoe]);

  const end = await server.doc(`${F}/children/${cid}`);
  assert.deepEqual([end.bedtime, end.limitMin, end.apps.find((a) => a.id === 'a3').blocked], [true, start.limitMin - 120, true], 'the parent’s changes are still on the server');
  assert.equal(kidOf(c, cid).apps.find((a) => a.id === 'a3').blocked, true);
  const status = await server.doc(`${F}/children/${cid}/live/status`);
  const p = await parent.eventually((v) => kidOf(v, cid).checkInAt === status.checkInAt && v.store.alerts.some((a) => a.kind === 'checkin'), 'the parent to see the check-in');
  assert.deepEqual([kidOf(p, cid).bedtime, kidOf(p, cid).limitMin], [true, start.limitMin - 120]);
  const sent = describeWrites(await zoe.fx(true)).map((w) => w.replace(/alerts\/\w+/, 'alerts/*')).sort();
  assert.deepEqual(sent, ['set alerts/* [at,body,by,childId,color,icon,kind,title,unread]', `set children/${cid}/live/status [by,checkInAt]`], 'the child sent its check-in and nothing else');
  await parent.store('resumeDevice', cid);
  await quiet([parent, zoe]);
});

/**
 * A new phone joins as a new child and is killed at `trap` (a `killOn` spec). It is then started
 * again. Nothing it holds (the sample data) may reach the server.
 */
async function joinKillRestart(label, trap) {
  const phone = makePhone(`d-kill-${label}`, { platform: 'android', deviceName: `Phone ${label}` });
  const first = await phone.launch();
  assert.ok(showsSample(first.store));
  const offer = ok(await parent.link('createPairingCode', 'child'), 'createPairingCode');
  ok(await phone.link('joinWithCode', offer.code), 'joinWithCode');
  await parent.eventually((v) => v.link.offer?.claim, 'the claim on the parent');
  await phone.killOn(trap);
  const died = phone.exited();
  ok(await parent.link('approveClaim', { newChildName: `Kid ${label}` }), 'approveClaim');
  await died;
  await quiet([parent, zoe]);
  const before = await server.dataText(fam.familyId);
  const stateOnDisk = phone.disk()['haven.state.v1'];

  await phone.launch();
  const v = await phone.eventually((x) => x.link.status === 'linked' && x.store.children.length === 1 && x.store.children[0].name === `Kid ${label}` && x.store.places.some((p) => p.name === 'Swim club'), `phone ${label} to be linked after its restart`, 20000);
  await quiet([phone, parent]);
  await sleep(800);

  // What it may send: its pointer (users/{uid}) and the tidy-up of the used code. Nothing of the family's data.
  const sent = describeWrites(await phone.fx(true)).map((w) => w.replace(/ \[.*/, '').replace(/ FAILED.*/, '').replace(/\/[A-Za-z0-9]+$/, '/*')).sort();
  assert.ok(sent.every((w) => w === 'set users/*' || w === 'delete pairing/*'), `phone ${label} sent only its pointer and the tidy-up, got: ${sent.join(', ')}`);
  assert.deepEqual(await server.doc(`users/${v.link.account.uid}`).then((u) => u && [u.familyId, u.role]), [fam.familyId, 'child'], 'its pointer is on the server');
  assert.equal(await server.dataText(fam.familyId), before, `phone ${label}: the family’s data on the server is untouched`);
  // The phone shows the family, not the sample data.
  assert.equal(v.store.live, true);
  assert.deepEqual([v.store.sites, v.store.messages, v.store.requests, v.store.alerts], [[], [], [], []], 'no sample sites, messages, requests or alerts are left');
  assert.equal(v.store.selfId, v.link.childId);
  assert.deepEqual(syncedOf(v.store, { slices: ['places', 'schedules', 'tasks'] }), syncedOf((await parent.view()).store, { slices: ['places', 'schedules', 'tasks'] }));
  // The phones that were killed while joining tidy their used code away after the restart. Two
  // things can then be printed by the SDK, neither of them the app's doing:
  // - the first life's delete did get out, so the second is refused (deleting what is not there is
  //   refused by the rules); the app takes that as "done";
  // - the Firestore emulator trips over the dead first life's listener on the code: it applies the
  //   delete, answers UNKNOWN, and refuses the SDK's second try for the same reason as above.
  await phone.unmount();
  await noAppErrors([phone], [/UNKNOWN: Application error processing RPC/, ...REFUSAL_NOISE]);
  await phone.dispose();
  return { stateOnDisk, code: offer.code, pairingLeft: (await server.doc(`pairing/${offer.code}`)) !== null };
}

test('a phone killed right before its link record is written joins on the next start and uploads nothing', async () => {
  const r = await joinKillRestart('before-record', { on: 'storage', key: 'haven.link.v2', phase: 'before', skip: 0 });
  assert.equal(r.stateOnDisk, undefined, 'it died before anything of its state was saved');
  assert.equal(r.pairingLeft, false, 'the used code was tidied away after the restart');
});

test('a phone killed 0, 20 and 50 ms after joining uploads nothing', async () => {
  for (const afterMs of [0, 20, 50]) {
    const r = await joinKillRestart(`${afterMs}ms`, { on: 'view', test: '(v) => v.link.status !== "waiting" && v.link.status !== "signed-out"', afterMs });
    assert.equal(r.pairingLeft, false, `killed after ${afterMs} ms: the used code is not left on the server`);
  }
});

test('a phone killed 300 ms after joining, in the middle of taking the family in, uploads nothing', async () => {
  await joinKillRestart('300ms', { on: 'view', test: '(v) => v.link.status !== "waiting" && v.link.status !== "signed-out"', afterMs: 300 });
});

test('a kill between local saves does not bring a removed site rule back', async () => {
  // The second device of the same parent account: it may write site rules, so it could bring one back.
  await tablet.launch();
  ok(await tablet.link('signIn', OWNER_EMAIL, PASSWORD), 'signIn');
  await tablet.eventually((v) => v.link.status === 'linked' && v.store.places.some((p) => p.name === 'Swim club'), 'the tablet to be linked');
  await quiet([tablet, parent]);
  const siteNames = async (phone) => (await phone.view()).store.sites.map((s) => s.host).sort();
  const serverSites = async () => Object.values(await server.collection(`${F}/sites`)).map((s) => s.host).sort();
  const add = async (host) => {
    await parent.store('addSite', host, 'blocked');
    const v = await tablet.eventually((x) => x.store.sites.some((s) => s.host === host), `the tablet to get ${host}`);
    await quiet([parent, tablet]);
    return v.store.sites.find((s) => s.host === host).id;
  };

  // 1. The tablet has the rule saved. It dies right BEFORE saving the state in which the rule is gone.
  const one = await add('one.example');
  await sleep(700);
  await tablet.killOn({ on: 'storage', key: 'haven.state.v1', phase: 'before' });
  let died = tablet.exited();
  await parent.store('removeSite', one);
  await died;
  assert.match(tablet.disk()['haven.state.v1'], /one\.example/, 'on the tablet’s disk the rule is still there');
  await tablet.launch();
  await tablet.eventually((v) => v.link.status === 'linked' && !v.store.sites.some((s) => s.host === 'one.example'), 'the tablet to drop the rule after its restart');
  await quiet([tablet, parent]);
  await sleep(800);
  assert.deepEqual(describeWrites(await tablet.fx(true)), [], 'the tablet sent nothing');
  assert.deepEqual(await serverSites(), []);
  assert.deepEqual(await siteNames(parent), []);

  // 2. It dies right AFTER saving that state.
  const two = await add('two.example');
  await sleep(700);
  await tablet.killOn({ on: 'storage', key: 'haven.state.v1', phase: 'after' });
  died = tablet.exited();
  await parent.store('removeSite', two);
  await died;
  assert.doesNotMatch(tablet.disk()['haven.state.v1'], /two\.example/);
  await tablet.launch();
  await tablet.waitStatus('linked');
  await quiet([tablet, parent]);
  await sleep(800);
  assert.deepEqual(describeWrites(await tablet.fx(true)), []);
  assert.deepEqual(await serverSites(), []);
  assert.deepEqual(await siteNames(tablet), []);

  // 3. It dies right before saving a rule that was ADDED; the rule is removed while it is dead.
  await tablet.killOn({ on: 'storage', key: 'haven.state.v1', phase: 'before' });
  died = tablet.exited();
  await parent.store('addSite', 'three.example', 'blocked');
  await died;
  const three = (await parent.eventually((v) => v.store.sites.length === 1, 'the rule on the parent')).store.sites[0].id;
  await quiet([parent]);
  await parent.store('removeSite', three);
  await quiet([parent]);
  await tablet.launch();
  await tablet.waitStatus('linked');
  await quiet([tablet, parent]);
  await sleep(800);
  assert.deepEqual(describeWrites(await tablet.fx(true)), []);
  assert.deepEqual(await serverSites(), []);

  // 4. Same, but it dies right after saving the added rule.
  await tablet.killOn({ on: 'storage', key: 'haven.state.v1', phase: 'after' });
  died = tablet.exited();
  await parent.store('addSite', 'four.example', 'blocked');
  await died;
  assert.match(tablet.disk()['haven.state.v1'], /four\.example/);
  const four = (await parent.eventually((v) => v.store.sites.length === 1, 'the rule on the parent')).store.sites[0].id;
  await quiet([parent]);
  await parent.store('removeSite', four);
  await quiet([parent]);
  await tablet.launch();
  await tablet.eventually((v) => v.link.status === 'linked' && v.store.sites.length === 0, 'the tablet to drop the rule after its restart');
  await quiet([tablet, parent]);
  await sleep(800);
  assert.deepEqual(describeWrites(await tablet.fx(true)), [], 'the tablet did not create the rule again');
  assert.deepEqual(await serverSites(), []);
  assert.deepEqual(await siteNames(parent), []);

  // 5. The tablet itself removes a rule and dies as the delete is handed to the SDK, before its own save.
  const five = await add('five.example');
  await sleep(700);
  await tablet.killOn({ on: 'write', pathIncludes: '/sites/', afterMs: 0 });
  died = tablet.exited();
  await tablet.store('removeSite', five).catch(() => {});
  await died;
  await sleep(500);
  const afterKill = await serverSites();
  await tablet.launch();
  await tablet.waitStatus('linked');
  await quiet([tablet, parent]);
  await sleep(800);
  // Whether or not the delete got out before the kill, everybody agrees, and nothing is sent twice.
  assert.deepEqual(describeWrites(await tablet.fx(true)), []);
  assert.deepEqual(await serverSites(), afterKill);
  assert.deepEqual(await siteNames(tablet), afterKill);
  assert.deepEqual(await siteNames(parent), afterKill);
});

test('a second tap during a send is kept, also when a snapshot arrives in between', async () => {
  await fresh([parent, zoe, tablet]);
  // The parent's phone is on a slow connection: 400 ms each way.
  parent.latency(400);

  // 1. The same switch tapped twice, the second time while the first write is in flight.
  const wasOn = (await parent.view()).store.schedules.find((s) => s.id === 's3').on;
  await parent.store('toggleSchedule', 's3');
  await until(() => inFlight(parent), 'the first write to be in flight');
  await parent.store('toggleSchedule', 's3');
  assert.equal(await inFlight(parent), true, 'the second tap landed during the send');
  await quiet([parent], 1200, 30000);
  assert.equal((await parent.view()).store.schedules.find((s) => s.id === 's3').on, wasOn, 'the parent shows the second tap');
  assert.equal((await server.doc(`${F}/schedules/s3`)).on, wasOn, 'and so does the server');
  await zoe.eventually((v) => v.store.schedules.find((s) => s.id === 's3').on === wasOn, 'and the child');
  assert.ok(writesIn(await parent.fx(true)).length <= 2);

  // 2. A snapshot caused by the other phone arrives while the first write is in flight; then the second tap.
  const tasks = (await parent.view()).store.tasks;
  const done = (id) => tasks.find((t) => t.id === id).done;
  await parent.store('toggleTask', 't3');
  await until(() => inFlight(parent), 'the write for t3 to be in flight');
  await zoe.store('toggleTask', 't4');
  await parent.eventually((v) => v.store.tasks.find((t) => t.id === 't4').done === !done('t4'), 'the child’s tick to reach the parent');
  const stillInFlight = await inFlight(parent);
  await parent.store('toggleTask', 't1');
  await quiet([parent, zoe], 1200, 30000);
  assert.equal(stillInFlight, true, 'the snapshot arrived during the parent’s send');
  const want = { t1: !done('t1'), t3: !done('t3'), t4: !done('t4') };
  const got = (list) => Object.fromEntries(['t1', 't3', 't4'].map((id) => [id, list.find((t) => t.id === id).done]));
  assert.deepEqual(got((await parent.view()).store.tasks), want, 'the parent keeps all three taps');
  assert.deepEqual(got((await zoe.view()).store.tasks), want, 'the child shows all three');
  const stored = await server.collection(`${F}/tasks`);
  assert.deepEqual(Object.fromEntries(['t1', 't3', 't4'].map((id) => [id, stored[id].done])), want, 'the server holds all three');
  assert.deepEqual(describeWrites(await parent.fx(true)).sort(), ['update tasks/t1 [done]', 'update tasks/t3 [done]'], 'one write per tap');
  assert.deepEqual(describeWrites(await zoe.fx(true)), ['update tasks/t4 [done]']);

  // 3. Two different fields of the same record, the second while the first is in flight.
  const limit = kidOf(await parent.view(), cid).limitMin;
  await parent.store('adjustLimit', cid, -10);
  await until(() => inFlight(parent), 'the limit write to be in flight');
  await parent.store('pauseDevice', cid);
  await quiet([parent], 1200, 30000);
  const child = await server.doc(`${F}/children/${cid}`);
  assert.deepEqual([child.limitMin, child.bedtime], [limit - 10, true]);
  assert.deepEqual([kidOf(await parent.view(), cid).limitMin, kidOf(await parent.view(), cid).bedtime], [limit - 10, true]);
  await zoe.eventually((v) => kidOf(v, cid).limitMin === limit - 10 && kidOf(v, cid).bedtime === true, 'the child to see both changes');
  assert.deepEqual(describeWrites(await parent.fx(true)).sort(), [`update children/${cid} [bedtime]`, `update children/${cid} [limitMin]`]);

  // 4. Chat: the child writes, the parent answers, and answers again while the first answer is in flight.
  const had = (await parent.view()).store.messages.length;
  await zoe.store('sendMessage', cid, 'child', 'C1 can you pick me up?');
  await parent.store('sendMessage', cid, 'parent', 'P1 on my way');
  await until(() => inFlight(parent), 'P1 to be in flight');
  await parent.store('sendMessage', cid, 'parent', 'P2 wait outside');
  await quiet([parent, zoe], 1200, 30000);
  const texts = (list) => list.slice(had).map((m) => m.text).sort();
  const expected = ['C1 can you pick me up?', 'P1 on my way', 'P2 wait outside'];
  assert.deepEqual(texts((await parent.view()).store.messages), expected);
  await zoe.eventually((v) => v.store.messages.length === had + 3, 'the child to have all three messages');
  assert.deepEqual(texts((await zoe.view()).store.messages), expected);
  assert.deepEqual(Object.values(await server.collection(`${F}/children/${cid}/messages`)).map((m) => m.text).filter((t) => /^[CP]\d/.test(t)).sort(), expected, 'each message is on the server once');

  parent.latency(0);
  await parent.store('resumeDevice', cid);
  await quiet([parent, zoe, tablet]);
});

test('two children keep separate identities and threads', async () => {
  await max.launch();
  maxId = (await enrol(parent, max, { newChildName: 'Max Tester' })).childId;
  await parent.eventually((v) => v.store.children.some((c) => c.id === maxId), 'the parent to see Max');
  await fresh([parent, zoe, max]);
  const zoeHad = (await zoe.view()).store.messages.length;

  await zoe.store('sendMessage', cid, 'child', 'Zoe here');
  await max.store('sendMessage', maxId, 'child', 'Max here');
  await parent.eventually((v) => v.store.messages.some((m) => m.text === 'Zoe here') && v.store.messages.some((m) => m.text === 'Max here'), 'the parent to get both');
  await parent.store('sendMessage', cid, 'parent', 'Hi Zoe');
  await parent.store('sendMessage', maxId, 'parent', 'Hi Max');
  const z = await zoe.eventually((v) => v.store.messages.some((m) => m.text === 'Hi Zoe'), 'Zoe to get her answer');
  const m = await max.eventually((v) => v.store.messages.some((x) => x.text === 'Hi Max'), 'Max to get his answer');
  await quiet([parent, zoe, max]);

  assert.deepEqual(m.store.messages.map((x) => [x.childId, x.from, x.text]), [[maxId, 'child', 'Max here'], [maxId, 'parent', 'Hi Max']], 'Max’s phone holds Max’s thread only');
  assert.deepEqual(z.store.messages.slice(zoeHad).map((x) => [x.childId, x.from, x.text]), [[cid, 'child', 'Zoe here'], [cid, 'parent', 'Hi Zoe']]);
  assert.ok(z.store.messages.every((x) => x.childId === cid), 'Zoe’s phone holds Zoe’s thread only');
  const p = await parent.view();
  assert.deepEqual(p.store.messages.filter((x) => x.childId === maxId).map((x) => x.text), ['Max here', 'Hi Max']);
  assert.deepEqual(p.store.messages.filter((x) => x.childId === cid).slice(zoeHad).map((x) => x.text), ['Zoe here', 'Hi Zoe']);
  assert.deepEqual(Object.values(await server.collection(`${F}/children/${maxId}/messages`)).map((x) => x.text).sort(), ['Hi Max', 'Max here']);

  // Each phone is its own child, and knows only that child.
  assert.deepEqual([z.link.childId, z.store.selfId, z.store.children.map((c) => c.id)], [cid, cid, [cid]]);
  assert.deepEqual([m.link.childId, m.store.selfId, m.store.children.map((c) => c.id)], [maxId, maxId, [maxId]]);

  // Requests go to the right child, and an answer to one does not touch the other.
  const zoeRequests = z.store.requests.length;
  const limits = { zoe: kidOf(p, cid).limitMin, max: kidOf(p, maxId).limitMin };
  await zoe.store('requestExtraTime', 10);
  await max.store('requestExtraTime', 20);
  const p2 = await parent.eventually((v) => v.store.requests.some((r) => r.minutes === 10 && r.status === 'pending') && v.store.requests.some((r) => r.minutes === 20), 'the parent to get both requests');
  const forZoe = p2.store.requests.find((r) => r.minutes === 10 && r.status === 'pending');
  const forMax = p2.store.requests.find((r) => r.minutes === 20);
  assert.deepEqual([forZoe.childId, forMax.childId], [cid, maxId]);
  await parent.store('resolveRequest', forMax.id, true);
  await max.eventually((v) => v.store.requests[0]?.status === 'approved' && kidOf(v, maxId).limitMin === limits.max + 20, 'Max to get his minutes');
  await quiet([parent, zoe, max]);
  const z2 = await zoe.view();
  assert.equal(z2.store.requests.length, zoeRequests + 1);
  assert.equal(z2.store.requests.find((r) => r.id === forZoe.id).status, 'pending');
  assert.equal(kidOf(z2, cid).limitMin, limits.zoe, 'Zoe’s limit is untouched');
  assert.deepEqual((await max.view()).store.requests.map((r) => r.id), [forMax.id]);
  assert.equal((await server.doc(`${F}/children/${cid}`)).limitMin, limits.zoe);
  assert.equal((await server.doc(`${F}/children/${maxId}`)).limitMin, limits.max + 20);
  assert.ok(await server.doc(`${F}/children/${maxId}/requests/${forMax.id}`));
  assert.equal(await server.doc(`${F}/children/${cid}/requests/${forMax.id}`), null);

  // A check-in belongs to the child that made it.
  await max.store('checkIn');
  const p3 = await parent.eventually((v) => kidOf(v, maxId).checkInAt != null, 'the parent to see Max check in');
  assert.equal(p3.store.alerts.find((a) => a.kind === 'checkin' && a.childId === maxId).title, 'Max checked in');
  assert.ok(await server.doc(`${F}/children/${maxId}/live/status`));
  await quiet([parent, zoe, max]);

  // An SOS belongs to the child that raised it: the other child cannot clear it.
  await fresh([parent, zoe, max]);
  await max.store('triggerSOS');
  const p4 = await parent.eventually((v) => v.store.sosActive, 'the parent to see the SOS');
  assert.deepEqual([p4.store.sosChildId, p4.store.sosChildName], [maxId, 'Max Tester']);
  const z3 = await zoe.eventually((v) => v.store.sosActive, 'Zoe’s phone to know of the SOS');
  assert.deepEqual([z3.store.sosChildId, z3.store.sosMine], [maxId, false], 'on Zoe’s phone it is not her SOS');
  await quiet([parent, zoe, max]);
  await zoe.fx(true);
  await zoe.store('clearSOS');
  await quiet([zoe]);
  const z4 = await zoe.eventually((v) => v.store.sosActive === true, 'the SOS to be put back on Zoe’s phone');
  assert.equal(z4.store.sosChildId, maxId);
  assert.ok(writesIn(await zoe.fx(true)).every((w) => w.state === 'failed'), 'nothing Zoe’s phone sent was accepted');
  assert.deepEqual(await server.doc(`${F}/signals/sos`).then((s) => [s.active, s.childId]), [true, maxId]);
  await max.store('clearSOS');
  await zoe.eventually((v) => v.store.sosActive === false, 'the SOS to end everywhere');
  await parent.eventually((v) => v.store.sosActive === false, 'the SOS to end on the parent');

  // Identities survive a restart.
  await zoe.relaunch();
  await max.relaunch();
  const z5 = await zoe.eventually((v) => v.link.status === 'linked', 'Zoe’s phone to be back');
  const m5 = await max.eventually((v) => v.link.status === 'linked', 'Max’s phone to be back');
  assert.deepEqual([z5.link.childId, z5.store.selfId, z5.store.children.map((c) => c.name)], [cid, cid, ['Zoe Tester']]);
  assert.deepEqual([m5.link.childId, m5.store.selfId, m5.store.children.map((c) => c.name)], [maxId, maxId, ['Max Tester']]);
  assert.ok(m5.store.messages.every((x) => x.childId === maxId) && m5.store.requests.every((r) => r.childId === maxId));
});

test('nothing went wrong inside the apps', async () => {
  await noAppErrors([parent, tablet, max]);
  // Zoe's phone was offline for a while: the SDK says so on its own.
  await noAppErrors([zoe], OFFLINE_NOISE);
});
