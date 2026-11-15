// c. Everyday use between a parent's phone and a child's phone: chat, requests and answers,
//    check-in, SOS, tasks, and every kind of rule a parent can change. Each step is checked on the
//    server, on both phones, and by the writes each phone made.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createFamily, describeWrites, disposeAll, enrol, makePhone, quiet, resetBackend, server, sleep } from './harness/driver.mjs';
import { noAppErrors, recent, syncedOf } from './harness/expect.mjs';

let parent;
let child;
let fam;
let childUid;
let cid;
let F;

const kid = (v) => v.store.children.find((c) => c.id === cid);

/** Forgets the calls made so far, so that `sent()` reports only what the next step causes. */
async function fresh() {
  await quiet([parent, child]);
  await parent.fx(true);
  await child.fx(true);
}
/** The document writes each phone made since `fresh()`, once both have come to rest. */
async function sent() {
  await quiet([parent, child]);
  return { parent: describeWrites(await parent.fx(true)).sort(), child: describeWrites(await child.fx(true)).sort() };
}

before(async () => {
  await resetBackend();
  parent = makePhone('c-parent', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  child = makePhone('c-child', { platform: 'android', deviceName: 'Zoe’s phone' });
  await parent.launch();
  await child.launch();
  fam = await createFamily(parent);
  cid = fam.childId;
  F = `families/${fam.familyId}`;
  childUid = (await enrol(parent, child, { childId: cid })).uid;
  await quiet([parent, child]);
});
after(disposeAll);

test('chat both ways', async () => {
  await fresh();
  await parent.store('sendMessage', cid, 'parent', 'Dinner at 6');
  const c1 = await child.eventually((v) => v.store.messages.length === 1 && v.store.messages[0].at != null, 'the child to get the message');
  assert.deepEqual(await sent(), { parent: [`set children/${cid}/messages/${c1.store.messages[0].id} [at,by,from,text]`], child: [] });

  await child.store('sendMessage', cid, 'child', 'ok! can Alex come?');
  const p = await parent.eventually((v) => v.store.messages.length === 2, 'the parent to get the answer');
  const second = p.store.messages[1];
  assert.deepEqual(await sent(), { parent: [], child: [`set children/${cid}/messages/${second.id} [at,by,from,text]`] });

  const stored = await server.collection(`${F}/children/${cid}/messages`);
  const first = p.store.messages[0];
  assert.deepEqual({ ...stored[first.id], at: 0 }, { from: 'parent', text: 'Dinner at 6', by: fam.uid, at: 0 });
  assert.deepEqual({ ...stored[second.id], at: 0 }, { from: 'child', text: 'ok! can Alex come?', by: childUid, at: 0 });
  assert.ok(recent(stored[first.id].at) && stored[second.id].at > stored[first.id].at, 'server times, in order');

  const c = await child.eventually((v) => v.store.messages.length === 2 && v.store.messages.every((m) => m.at === stored[m.id]?.at), 'the child to hold the server times');
  const pp = await parent.eventually((v) => v.store.messages.every((m) => m.at === stored[m.id]?.at), 'the parent to hold the server times');
  for (const v of [c, pp]) {
    assert.deepEqual(v.store.messages.map((m) => [m.id, m.childId, m.from, m.text]), [[first.id, cid, 'parent', 'Dinner at 6'], [second.id, cid, 'child', 'ok! can Alex come?']]);
  }
});

test('a time request, then the approval: the minutes are added once and both phones show it', async () => {
  await fresh();
  const limit = kid(await parent.view()).limitMin;
  await child.store('requestExtraTime', 30);
  const p = await parent.eventually((v) => v.store.requests.length === 1, 'the parent to get the request');
  const request = p.store.requests[0];
  assert.deepEqual({ childId: request.childId, kind: request.kind, minutes: request.minutes, status: request.status, label: request.label }, { childId: cid, kind: 'extra_time', minutes: 30, status: 'pending', label: '30 more minutes' });
  assert.deepEqual(await sent(), { parent: [], child: [`set children/${cid}/requests/${request.id} [at,by,detail,kind,label,minutes,status]`] });
  const asked = await server.doc(`${F}/children/${cid}/requests/${request.id}`);
  assert.deepEqual({ ...asked, at: 0 }, { kind: 'extra_time', label: '30 more minutes', detail: 'You asked for extra screen time', minutes: 30, status: 'pending', by: childUid, at: 0 });

  await parent.store('resolveRequest', request.id, true);
  // A second tap on the same button, and a third a moment later.
  await parent.store('resolveRequest', request.id, true);
  await child.eventually((v) => v.store.requests[0]?.status === 'approved' && kid(v).limitMin === limit + 30, 'the child to see the approval and the new limit');
  await parent.store('resolveRequest', request.id, true);
  assert.deepEqual(await sent(), { parent: [`update children/${cid} [limitMin]`, `update children/${cid}/requests/${request.id} [resolvedAt,resolvedBy,status]`].sort(), child: [] });

  const answered = await server.doc(`${F}/children/${cid}/requests/${request.id}`);
  assert.equal(answered.status, 'approved');
  assert.equal(answered.resolvedBy, fam.uid);
  assert.ok(recent(answered.resolvedAt));
  assert.equal(answered.by, childUid, 'still the child’s request');
  await sleep(1500);
  assert.equal((await server.doc(`${F}/children/${cid}`)).limitMin, limit + 30, 'added once on the server');
  assert.equal(kid(await parent.view()).limitMin, limit + 30);
  assert.equal(kid(await child.view()).limitMin, limit + 30);
  assert.deepEqual(await sent(), { parent: [], child: [] }, 'nothing more was sent afterwards');
});

test('an unlock request is approved, and a second time request is denied', async () => {
  await fresh();
  // A real family's child starts with nothing blocked, so block one first to unlock it.
  await parent.store('toggleApp', cid, 'a7');
  await child.eventually((v) => kid(v).apps.find((a) => a.id === 'a7').blocked === true, 'the child to see Voxel Arena blocked');
  await fresh();
  await child.store('requestUnlock', 'a7');
  const p = await parent.eventually((v) => v.store.requests.some((r) => r.kind === 'unlock_app'), 'the parent to get the unlock request');
  const unlock = p.store.requests.find((r) => r.kind === 'unlock_app');
  assert.deepEqual({ appId: unlock.appId, status: unlock.status, label: unlock.label }, { appId: 'a7', status: 'pending', label: 'Unlock Voxel Arena' });
  assert.deepEqual(await sent(), { parent: [], child: [`set children/${cid}/requests/${unlock.id} [appId,at,by,detail,kind,label,status]`] });

  await parent.store('resolveRequest', unlock.id, true);
  await child.eventually((v) => kid(v).apps.find((a) => a.id === 'a7').blocked === false && v.store.requests.find((r) => r.id === unlock.id).status === 'approved', 'the child to see the app unblocked');
  assert.deepEqual(await sent(), { parent: [`update children/${cid} [apps]`, `update children/${cid}/requests/${unlock.id} [resolvedAt,resolvedBy,status]`].sort(), child: [] });
  assert.equal((await server.doc(`${F}/children/${cid}`)).apps.find((a) => a.id === 'a7').blocked, false);

  const limit = kid(await parent.view()).limitMin;
  await child.store('requestExtraTime', 15);
  const p2 = await parent.eventually((v) => v.store.requests.some((r) => r.minutes === 15), 'the parent to get the second request');
  const second = p2.store.requests.find((r) => r.minutes === 15);
  await fresh();
  await parent.store('resolveRequest', second.id, false);
  await child.eventually((v) => v.store.requests.find((r) => r.id === second.id)?.status === 'denied', 'the child to see the refusal');
  assert.deepEqual(await sent(), { parent: [`update children/${cid}/requests/${second.id} [resolvedAt,resolvedBy,status]`], child: [] });
  assert.equal((await server.doc(`${F}/children/${cid}/requests/${second.id}`)).status, 'denied');
  assert.equal((await server.doc(`${F}/children/${cid}`)).limitMin, limit, 'a denied request adds nothing');
  assert.deepEqual((await parent.view()).store.requests.map((r) => r.status).sort(), ['approved', 'approved', 'denied']);
  assert.deepEqual(syncedOf((await child.view()).store, { slices: ['requests'] }), syncedOf((await parent.view()).store, { slices: ['requests'] }));
});

test('a check-in: the status document, an alert at the parent, and no sample place name', async () => {
  await fresh();
  const place = kid(await child.view()).place;
  assert.ok(place.length > 0, 'the child record does carry a (sample) place');
  await child.store('checkIn');
  const p = await parent.eventually((v) => v.store.alerts.some((a) => a.kind === 'checkin') && kid(v).checkInAt != null, 'the parent to see the check-in');
  const made = await sent();
  const alert = p.store.alerts.find((a) => a.kind === 'checkin');
  assert.deepEqual(made, { parent: [], child: [`set alerts/${alert.id} [at,body,by,childId,color,icon,kind,title,unread]`, `set children/${cid}/live/status [by,checkInAt]`].sort() });

  const status = await server.doc(`${F}/children/${cid}/live/status`);
  assert.equal(status.by, childUid);
  assert.ok(recent(status.checkInAt), 'the check-in time is the server’s');
  const stored = await server.doc(`${F}/alerts/${alert.id}`);
  assert.deepEqual({ kind: stored.kind, childId: stored.childId, title: stored.title, unread: stored.unread, by: stored.by }, { kind: 'checkin', childId: cid, title: 'Zoe checked in', unread: true, by: childUid });
  assert.match(stored.body, /^At \d{1,2}:\d{2}/, 'the alert says when');
  assert.equal(stored.body.includes(place), false, 'and does not claim a place');
  assert.equal(alert.title, 'Zoe checked in');
  assert.equal(alert.body, stored.body);
  assert.equal(alert.unread, true);

  // Both phones end up with the server's time for the check-in.
  await parent.eventually((v) => kid(v).checkInAt === status.checkInAt, 'the parent to hold the server’s check-in time');
  await child.eventually((v) => kid(v).checkInAt === status.checkInAt, 'the child to hold the server’s check-in time');
  // The child's own record on the server was not touched by its phone.
  assert.equal('checkInAt' in (await server.doc(`${F}/children/${cid}`)), false);

  await fresh();
  await parent.store('markAlertsRead');
  assert.deepEqual(await sent(), { parent: [`update alerts/${alert.id} [unread]`], child: [] });
  assert.equal((await server.doc(`${F}/alerts/${alert.id}`)).unread, false);
});

test('SOS: raised by the child and cleared by the parent; raised again and cleared by the child', async () => {
  await fresh();
  await parent.vibrations();
  await child.store('triggerSOS');
  const p = await parent.eventually((v) => v.store.sosActive === true, 'the parent to see the SOS');
  assert.equal(p.store.sosChildId, cid);
  assert.equal(p.store.sosChildName, 'Zoe Tester');
  const made = await sent();
  const alerts = (await parent.view()).store.alerts.filter((a) => a.kind === 'sos');
  assert.equal(alerts.length, 1);
  assert.deepEqual(made, { parent: [], child: [`set alerts/${alerts[0].id} [at,body,by,childId,color,icon,kind,title,unread]`, 'set signals/sos [active,at,by,childId]'].sort() });
  assert.equal(alerts[0].title, 'SOS from Zoe');
  let sos = await server.doc(`${F}/signals/sos`);
  assert.deepEqual({ active: sos.active, childId: sos.childId, by: sos.by }, { active: true, childId: cid, by: childUid });
  assert.ok(recent(sos.at));
  assert.equal((await parent.vibrations()).length, 1, 'the parent’s phone made itself felt once');
  const c = await child.view();
  assert.deepEqual([c.store.sosActive, c.store.sosMine, c.store.sosChildId], [true, true, cid]);

  await parent.store('clearSOS');
  await child.eventually((v) => v.store.sosActive === false, 'the child to see the SOS cleared');
  assert.deepEqual(await sent(), { parent: ['tx.set signals/sos [active,at,by,childId]'], child: [] });
  sos = await server.doc(`${F}/signals/sos`);
  assert.deepEqual({ active: sos.active, childId: sos.childId, by: sos.by }, { active: false, childId: cid, by: fam.uid });
  assert.deepEqual([(await parent.view()).store.sosActive, (await parent.view()).store.sosChildId], [false, null]);

  await child.store('triggerSOS');
  await parent.eventually((v) => v.store.sosActive === true && v.store.sosChildId === cid, 'the parent to see the second SOS');
  await sent();
  assert.equal((await server.doc(`${F}/signals/sos`)).active, true);
  await child.store('clearSOS');
  await parent.eventually((v) => v.store.sosActive === false, 'the parent to see the child clear it');
  assert.deepEqual(await sent(), { parent: [], child: ['set signals/sos [active,at,by,childId]'] });
  sos = await server.doc(`${F}/signals/sos`);
  assert.deepEqual({ active: sos.active, childId: sos.childId, by: sos.by }, { active: false, childId: cid, by: childUid });
  assert.equal((await child.view()).store.sosActive, false);
  assert.equal((await parent.view()).store.alerts.filter((a) => a.kind === 'sos').length, 2);
});

test('a task ticked by the child', async () => {
  await fresh();
  const before = (await child.view()).store.points;
  await child.store('toggleTask', 't2');
  await parent.eventually((v) => v.store.tasks.find((t) => t.id === 't2').done === true, 'the parent to see the task done');
  assert.deepEqual(await sent(), { parent: [], child: ['update tasks/t2 [done]'] });
  assert.equal((await server.doc(`${F}/tasks/t2`)).done, true);
  assert.equal((await child.view()).store.points, before + 15);
  assert.equal((await parent.view()).store.points, before + 15);
});

test('the parent changes the limit, pauses, blocks an app: the child sees each', async () => {
  await fresh();
  const limit = kid(await parent.view()).limitMin;
  await parent.store('adjustLimit', cid, -45);
  await child.eventually((v) => kid(v).limitMin === limit - 45, 'the child to see the new limit');
  assert.deepEqual(await sent(), { parent: [`update children/${cid} [limitMin]`], child: [] });
  assert.equal((await server.doc(`${F}/children/${cid}`)).limitMin, limit - 45);

  await parent.store('pauseDevice', cid);
  await child.eventually((v) => kid(v).bedtime === true, 'the child to see the pause');
  assert.deepEqual(await sent(), { parent: [`update children/${cid} [bedtime]`], child: [] });
  assert.equal((await server.doc(`${F}/children/${cid}`)).bedtime, true);
  await parent.store('resumeDevice', cid);
  await child.eventually((v) => kid(v).bedtime === false, 'the child to see the pause lifted');
  await sent();

  await parent.store('toggleApp', cid, 'a3');
  await child.eventually((v) => kid(v).apps.find((a) => a.id === 'a3').blocked === true, 'the child to see the app blocked');
  assert.deepEqual(await sent(), { parent: [`update children/${cid} [apps]`], child: [] });
  await parent.store('setAppLimit', cid, 'a1', 20);
  await child.eventually((v) => kid(v).apps.find((a) => a.id === 'a1').limitMin === 20, 'the child to see the app limit');
  const stored = await server.doc(`${F}/children/${cid}`);
  assert.equal(stored.apps.find((a) => a.id === 'a3').blocked, true);
  assert.equal(stored.apps.find((a) => a.id === 'a1').limitMin, 20);
  await sent();
});

test('the parent changes a schedule, a site and a place: the child sees each', async () => {
  await fresh();
  await parent.store('toggleSchedule', 's3');
  await child.eventually((v) => v.store.schedules.find((s) => s.id === 's3').on === true, 'the child to see the schedule on');
  assert.deepEqual(await sent(), { parent: ['update schedules/s3 [on]'], child: [] });
  assert.equal((await server.doc(`${F}/schedules/s3`)).on, true);

  await parent.store('addSchedule', { name: 'Piano', icon: 'music', color: '#12B5A6', start: '5:00 PM', end: '5:30 PM', days: [true, false, true, false, false, false, false], on: true });
  const c1 = await child.eventually((v) => v.store.schedules.length === 5, 'the child to see the new schedule');
  const piano = c1.store.schedules[4];
  assert.deepEqual({ name: piano.name, start: piano.start, days: piano.days }, { name: 'Piano', start: '5:00 PM', days: [true, false, true, false, false, false, false] });
  assert.deepEqual(await sent(), { parent: [`set schedules/${piano.id} [color,days,end,icon,name,on,ord,start]`], child: [] });

  await parent.store('addSite', 'https://Bad.example/some/page', 'blocked');
  const c2 = await child.eventually((v) => v.store.sites.length === 1, 'the child to see the site rule');
  const site = c2.store.sites[0];
  assert.deepEqual({ host: site.host, list: site.list }, { host: 'bad.example', list: 'blocked' });
  assert.deepEqual(await sent(), { parent: [`set sites/${site.id} [host,list,ord]`], child: [] });
  assert.deepEqual({ ...(await server.doc(`${F}/sites/${site.id}`)), ord: 0 }, { host: 'bad.example', list: 'blocked', ord: 0 });
  await parent.store('addSite', 'homework.example', 'allowed');
  await child.eventually((v) => v.store.sites.length === 2, 'the child to see the second site rule');
  await sent();
  await parent.store('removeSite', site.id);
  await child.eventually((v) => v.store.sites.length === 1 && v.store.sites[0].host === 'homework.example', 'the child to see the site rule gone');
  assert.deepEqual(await sent(), { parent: [`delete sites/${site.id}`], child: [] });
  assert.equal(await server.doc(`${F}/sites/${site.id}`), null);

  await parent.store('addPlace', { name: 'Swim club', icon: 'home', radius: 100, arrive: true, leave: true });
  const c3 = await child.eventually((v) => v.store.places.length === 4, 'the child to see the new place');
  const swim = c3.store.places[3];
  assert.equal(swim.name, 'Swim club');
  assert.deepEqual(await sent(), { parent: [`set places/${swim.id} [arrive,icon,leave,name,ord,radius]`], child: [] });
  await parent.store('togglePlaceAlert', 'p1', 'leave');
  await child.eventually((v) => v.store.places.find((p) => p.id === 'p1').leave === false, 'the child to see the place alert off');
  assert.deepEqual(await sent(), { parent: ['update places/p1 [leave]'], child: [] });
  await parent.store('removePlace', 'p3');
  await child.eventually((v) => !v.store.places.some((p) => p.id === 'p3'), 'the child to see the place gone');
  assert.deepEqual(await sent(), { parent: ['delete places/p3'], child: [] });
  assert.deepEqual(Object.keys(await server.collection(`${F}/places`)).sort(), ['p1', 'p2', swim.id].sort());
});

test('at the end both phones and the server agree, and restarting either sends nothing', async () => {
  await fresh();
  const before = await server.dataText(fam.familyId);
  const p = await parent.view();
  const c = await child.view();
  const shared = ['requests', 'messages', 'places', 'schedules', 'sites', 'tasks', 'sosActive', 'sosChildId'];
  assert.deepEqual(syncedOf(c.store, { slices: shared }), syncedOf(p.store, { slices: shared }));
  assert.deepEqual(syncedOf(c.store).children, syncedOf(p.store).children, 'the child record is the same on both');
  assert.deepEqual(c.store.alerts.length <= p.store.alerts.length, true);

  // What the parent shows is what the server holds.
  const docs = await server.family(fam.familyId);
  const stored = (name) => Object.keys(docs).filter((k) => k.startsWith(`${F}/${name}/`) && k.split('/').length === 4).map((k) => k.split('/').pop()).sort();
  for (const slice of ['places', 'schedules', 'sites', 'tasks', 'alerts']) assert.deepEqual(p.store[slice].map((x) => x.id).sort(), stored(slice), slice);
  for (const place of p.store.places) assert.deepEqual({ ...docs[`${F}/places/${place.id}`], ord: 0, id: place.id }, { ...place, ord: 0 });

  const p2 = await parent.relaunch();
  const c2 = await child.relaunch();
  await parent.waitStatus('linked');
  await child.waitStatus('linked');
  await sleep(1500);
  assert.deepEqual(await sent(), { parent: [], child: [] }, 'a cold start writes no family data');
  assert.equal(await server.dataText(fam.familyId), before);
  assert.deepEqual(syncedOf((await parent.view()).store), syncedOf(p.store), 'the parent shows the same after a restart');
  assert.deepEqual(syncedOf((await child.view()).store, { slices: shared }), syncedOf(c.store, { slices: shared }), 'the child shows the same after a restart');
  assert.ok(p2.store.ready && c2.store.ready);
});

test('nothing went wrong inside the apps', async () => {
  await noAppErrors([parent, child]);
});
