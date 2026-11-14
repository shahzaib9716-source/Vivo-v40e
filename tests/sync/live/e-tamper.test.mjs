// e. A tampered child phone. Its store is changed in ways the child app never would (a higher
//    limit, its own request marked approved, a message "from the parent", a renamed place, ...):
//    live, on disk while the app is closed, on disk together with the engine's own record, and
//    with a link record that claims to be a parent. Nothing of it may be accepted by the server,
//    and the phone must end up showing the family's real data again.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createFamily, describeWrites, disposeAll, enrol, makePhone, quiet, resetBackend, server, sleep, writesIn } from './harness/driver.mjs';
import { REFUSAL_NOISE, differences, noAppErrors, sameData, syncedOf } from './harness/expect.mjs';

let parent;
let child;
let fam;
let cid;
let F;
let rid;
/** What the child phone and the server held before anybody tampered. */
let honest;
let serverBefore;
let parentBefore;

const kid = (v) => v.store.children.find((c) => c.id === cid);
const COMPARED = ['children', 'requests', 'messages', 'places', 'schedules', 'sites', 'tasks', 'sosActive', 'sosChildId'];

/** Changes the saved state of the stopped child phone. `change(state, sync, link)` edits in place. */
function editDisk(change) {
  const disk = child.disk();
  const saved = JSON.parse(disk['haven.state.v1']);
  const link = JSON.parse(disk['haven.link.v2']);
  change(saved.state, saved.sync, link);
  child.setDisk({ ...disk, 'haven.state.v1': JSON.stringify(saved), 'haven.link.v2': JSON.stringify(link) });
}

/** After a tampering: nothing was accepted, and the phone shows the real data again. */
async function putBack(label, { attempts }) {
  await quiet([child, parent]);
  const v = await child
    .eventually((x) => x.link.status === 'linked' && sameData(syncedOf(x.store, { slices: COMPARED }), honest), `${label}: the child phone to show the real data again`, 20000)
    .catch(async (e) => {
      e.message += `\n  still different: ${differences(honest, syncedOf((await child.view()).store, { slices: COMPARED })).slice(0, 12).join(' ; ')}`;
      throw e;
    });
  await quiet([child, parent]);
  await sleep(700);
  const log = await child.fx(true);
  const accepted = writesIn(log).filter((w) => w.state !== 'failed');
  assert.deepEqual(accepted.map((w) => `${w.op} ${w.path}`), [], `${label}: no write of the child phone was accepted`);
  if (attempts === 0) assert.deepEqual(describeWrites(log), [], `${label}: the phone did not even try`);
  assert.equal(await server.dataText(fam.familyId), serverBefore, `${label}: the server holds what it held before`);
  assert.deepEqual(syncedOf((await parent.view()).store), parentBefore, `${label}: the parent's phone is unchanged`);
  assert.deepEqual(syncedOf((await child.view()).store, { slices: COMPARED }), honest, `${label}: the child phone is back to the real data`);
  v.tried = describeWrites(log);
  return v;
}

before(async () => {
  await resetBackend();
  parent = makePhone('e-parent', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  child = makePhone('e-child', { platform: 'android', deviceName: 'Zoe’s phone' });
  await parent.launch();
  await child.launch();
  fam = await createFamily(parent);
  cid = fam.childId;
  F = `families/${fam.familyId}`;
  await enrol(parent, child, { childId: cid });
  await parent.store('sendMessage', cid, 'parent', 'Home by six');
  await parent.store('addSite', 'games.example', 'blocked');
  await child.store('requestExtraTime', 30);
  const p = await parent.eventually((v) => v.store.requests.length === 1 && v.store.messages.length === 1, 'the request and the message to settle');
  rid = p.store.requests[0].id;
  await child.eventually((v) => v.store.requests.length === 1 && v.store.messages.length === 1 && v.store.sites.length === 1, 'the child to have everything');
  await quiet([parent, child]);
  await sleep(700);
  await child.fx(true);
  honest = syncedOf((await child.view()).store, { slices: COMPARED });
  parentBefore = syncedOf((await parent.view()).store);
  serverBefore = await server.dataText(fam.familyId);
});
after(disposeAll);

test('live: the store actions a child app never calls change nothing on the server and are put back', async () => {
  const limit = kid(await child.view()).limitMin;
  await child.store('adjustLimit', cid, 120); // a higher limit
  await child.store('resolveRequest', rid, true); // its own request "approved" (which also adds the 30 minutes locally)
  await child.store('sendMessage', cid, 'parent', 'You may stay up late'); // a message "from the parent"
  await child.store('togglePlaceAlert', 'p1', 'arrive');
  await child.store('removePlace', 'p2');
  await child.store('addPlace', { name: 'Arcade', icon: 'home', radius: 50, arrive: false, leave: false });
  await child.store('toggleApp', cid, 'a7'); // unblock the blocked app
  await child.store('setAppLimit', cid, 'a1', null);
  await child.store('renameChild', cid, 'The Boss');
  await child.store('addChild', 'Ghost');
  await child.store('removeSchedule', 's1'); // bedtime
  await child.store('toggleSchedule', 's2');
  await child.store('removeSite', (await child.view()).store.sites[0].id);
  await child.store('addSite', 'games.example', 'allowed');
  const v = await putBack('live', { attempts: 0 });
  assert.equal(kid(v).limitMin, limit);
  assert.equal(v.store.requests[0].status, 'pending');
  assert.deepEqual(v.store.messages.map((m) => m.text), ['Home by six']);
  assert.match(String(v.link.error), /not allowed to change that|put back/, 'the phone says that something was put back');
});

test('on disk: the saved state edited while the app is closed is not sent and is put back', async () => {
  await child.kill();
  editDisk((state) => {
    const me = state.children.find((c) => c.id === cid);
    me.limitMin += 300;
    me.bedtime = false;
    me.apps.find((a) => a.id === 'a7').blocked = false;
    me.name = 'The Boss';
    state.requests.find((r) => r.id === rid).status = 'approved';
    state.messages.push({ id: 'mfake1', childId: cid, from: 'parent', text: 'You can stay up', time: '9:00 PM', at: Date.now() });
    state.places.find((p) => p.id === 'p1').name = 'Arcade';
    state.places = state.places.filter((p) => p.id !== 'p3');
    state.tasks.find((t) => t.id === 't3').points = 1000;
    state.tasks.push({ id: 'tfake', title: 'Free points', points: 999, done: true });
    state.schedules = state.schedules.filter((s) => s.id !== 's1');
    state.sites = [{ id: 'wfake', host: 'everything.example', list: 'allowed' }];
  });
  const first = await child.launch();
  assert.equal(first.store.places.find((p) => p.id === 'p1').name, 'Arcade', 'the phone starts from the tampered state');
  assert.equal(first.store.messages.some((m) => m.id === 'mfake1'), true);

  const v = await putBack('on disk', { attempts: 0 });
  assert.equal(v.store.places.find((p) => p.id === 'p1').name, 'Home');
  assert.equal(v.store.messages.some((m) => m.id === 'mfake1'), false);
  assert.equal(await server.doc(`${F}/children/${cid}/messages/mfake1`), null);
  assert.equal(await server.doc(`${F}/tasks/tfake`), null);
  assert.equal(await server.doc(`${F}/sites/wfake`), null);
});

test('on disk: the state and the engine’s record of "what the server confirmed" edited together', async () => {
  await sleep(600);
  await child.kill();
  editDisk((state, sync) => {
    // Every edit is made twice: in the local slices and in the confirmed copies, so that to the
    // engine it looks as if the server had said so.
    for (const list of [state.children, sync.lists.children.confirmed]) {
      const me = list.find((c) => c.id === cid);
      me.limitMin += 300;
      me.name = 'The Boss';
    }
    for (const list of [state.requests, sync.lists[`requests:${cid}`].confirmed]) list.find((r) => r.id === rid).status = 'approved';
    for (const list of [state.messages, sync.lists[`messages:${cid}`].confirmed]) list.push({ id: 'mfake2', childId: cid, from: 'parent', text: 'No bedtime today', time: '9:00 PM', at: Date.now() });
    for (const list of [state.places, sync.lists.places.confirmed]) list.find((p) => p.id === 'p1').name = 'Arcade';
    for (const list of [state.tasks, sync.lists.tasks.confirmed]) list.push({ id: 'tfake2', title: 'Free points', points: 999, done: true });
  });
  const first = await child.launch();
  assert.equal(first.store.messages.some((m) => m.id === 'mfake2'), true, 'the phone starts from the tampered state');

  const v = await putBack('state and record', { attempts: 0 });
  assert.equal(v.store.requests[0].status, 'pending');
  assert.equal(await server.doc(`${F}/children/${cid}/messages/mfake2`), null);
  assert.equal(await server.doc(`${F}/tasks/tfake2`), null);
});

test('on disk: a link record that claims to be a parent gets nothing accepted and the phone is a child again', async (t) => {
  await sleep(600);
  await child.kill();
  editDisk((state, sync, link) => {
    link.family.role = 'parent';
    link.family.childId = null;
    link.family.adopt = false;
    sync.role = 'parent';
    sync.childId = null;
    sync.adoptAll = false;
    for (const key of Object.keys(sync.lists)) sync.lists[key].adopt = false;
    const me = state.children.find((c) => c.id === cid);
    me.limitMin += 300;
    state.places.find((p) => p.id === 'p1').name = 'Arcade';
    state.sites = [];
    state.messages.push({ id: 'mfake3', childId: cid, from: 'parent', text: 'I am the parent now', time: '9:00 PM', at: Date.now() });
  });
  await child.launch();

  const v = await putBack('link record', { attempts: null });
  t.diagnostic(`writes the forged "parent" tried (all refused): ${v.tried.length === 0 ? 'none' : v.tried.join(' | ')}`);
  assert.equal(v.link.role, 'child', 'the role is the one the server gave');
  assert.equal(v.link.childId, cid);
  assert.equal(v.store.selfId, cid);
  assert.equal(await server.doc(`${F}/children/${cid}/messages/mfake3`), null);
  assert.equal(JSON.parse(child.disk()['haven.link.v2']).family.role, 'child', 'and the record on the phone says so again');
});

test('after all that the phone still works as a child, and a real approval counts once', async () => {
  await child.fx(true);
  await parent.fx(true);
  const limit = kid(await parent.view()).limitMin;
  await child.store('sendMessage', cid, 'child', 'ok, six');
  await parent.eventually((v) => v.store.messages.some((m) => m.text === 'ok, six'), 'the parent to get the child’s real message');
  await parent.store('resolveRequest', rid, true);
  const c = await child.eventually((v) => v.store.requests[0].status === 'approved' && kid(v).limitMin === limit + 30, 'the child to get the real approval');
  await quiet([parent, child]);
  assert.equal(kid(c).limitMin, limit + 30);
  assert.equal((await server.doc(`${F}/children/${cid}`)).limitMin, limit + 30, 'the real approval added 30 minutes, once');
  assert.equal(describeWrites(await child.fx(true)).length, 1, 'the child sent its one message');
});

test('nothing went wrong inside the apps', async () => {
  await noAppErrors([parent]);
  // With the forged parent record the phone asks for things only a parent may read: the SDK prints the refusals.
  await noAppErrors([child], REFUSAL_NOISE);
});
