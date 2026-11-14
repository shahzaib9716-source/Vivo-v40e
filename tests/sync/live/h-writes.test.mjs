// h. What the phones write, counted as calls into the Firestore SDK. Idle phones write nothing.
//    Every action a person can take costs the smallest number of document writes there is for it,
//    and the other phone writes nothing in response. "Last seen" goes out at most once a minute,
//    and only from a phone in the foreground.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createFamily, describeWrites, disposeAll, enrol, makePhone, ok, quiet, resetBackend, server, sleep, writesIn } from './harness/driver.mjs';
import { noAppErrors } from './harness/expect.mjs';

let parent;
let child;
let fam;
let cid;
const table = [];

/** Ids made on the phones (`newId`) become `*`, so the lists can be written down beforehand. */
const plain = (w) => w.replace(/\/[a-z][a-z0-9]{12,}/g, '/*').replace(/pairing\/[A-Z0-9]{8}/, 'pairing/*');

/**
 * Does `action` and reports what each phone wrote because of it: `{ parent: [...], child: [...] }`,
 * "last seen" writes left out, ids of new documents shown as `*`.
 */
async function writesOf(action) {
  await quiet([parent, child]);
  await parent.fx(true);
  await child.fx(true);
  await action();
  await quiet([parent, child]);
  const p = await parent.fx(true);
  const c = await child.fx(true);
  for (const w of [...writesIn(p), ...writesIn(c)]) assert.equal(w.state, 'acked', `the server accepted every write (${w.op} ${w.path}: ${w.state} ${w.code ?? ''})`);
  return { parent: describeWrites(p).map(plain).sort(), child: describeWrites(c).map(plain).sort() };
}

/** One row of the table: `who` does `what`; it has to cost exactly `expected` on that phone and nothing on the other. */
async function costs(who, what, action, expected) {
  const got = await writesOf(action);
  const other = who === 'parent' ? 'child' : 'parent';
  table.push({ who, what, writes: got[who].length, detail: got[who].join('; ') || 'none' });
  assert.deepEqual(got[who], [...expected].sort(), `${who}: ${what}`);
  assert.deepEqual(got[other], [], `${who}: ${what}: the ${other}'s phone writes nothing in response`);
}

before(async () => {
  await resetBackend();
  parent = makePhone('h-parent', { platform: 'ios', deviceName: 'Dana’s iPhone' });
  child = makePhone('h-child', { platform: 'android', deviceName: 'Zoe’s phone' });
  await parent.launch();
  await child.launch();
  fam = await createFamily(parent);
  cid = fam.childId;
  await enrol(parent, child, { childId: cid });
  await parent.eventually((v) => v.link.members.length === 2 && v.link.members.every((m) => m.lastSeenAt !== null), 'both phones to have said "last seen" once');
  await quiet([parent, child]);
});
after(disposeAll);

test('eight idle seconds: no call to Firestore at all from either phone', async () => {
  await sleep(1000);
  await parent.fx(true);
  await child.fx(true);
  const before = canonFamily(await server.family(fam.familyId));
  await sleep(8000);
  const p = await parent.fx(true);
  const c = await child.fx(true);
  assert.deepEqual(p.map((e) => `${e.kind} ${e.path}`), [], 'the parent’s phone made no call (no write, no read, no new listener)');
  assert.deepEqual(c.map((e) => `${e.kind} ${e.path}`), [], 'the child’s phone made no call');
  assert.equal(canonFamily(await server.family(fam.familyId)), before, 'nothing changed on the server, "last seen" included');
});

function canonFamily(docs) {
  return JSON.stringify(Object.keys(docs).sort().map((k) => [k, docs[k]]));
}

test('what the child’s actions cost', async () => {
  await costs('child', 'send a chat message', () => child.store('sendMessage', cid, 'child', 'hello'), ['set children/*/messages/* [at,by,from,text]']);
  await costs('child', 'ask for 30 more minutes', () => child.store('requestExtraTime', 30), ['set children/*/requests/* [at,by,detail,kind,label,minutes,status]']);
  await costs('child', 'ask to unlock an app', () => child.store('requestUnlock', 'a7'), ['set children/*/requests/* [appId,at,by,detail,kind,label,status]']);
  await costs('child', 'check in', () => child.store('checkIn'), ['set alerts/* [at,body,by,childId,color,icon,kind,title,unread]', 'set children/*/live/status [by,checkInAt]']);
  await costs('child', 'raise an SOS', () => child.store('triggerSOS'), ['set alerts/* [at,body,by,childId,color,icon,kind,title,unread]', 'set signals/sos [active,at,by,childId]']);
  await costs('child', 'clear its own SOS', () => child.store('clearSOS'), ['set signals/sos [active,at,by,childId]']);
  await costs('child', 'tick a task', () => child.store('toggleTask', 't2'), ['update tasks/t2 [done]']);
  await costs('child', 'tick a task and untick it at once', () => child.storeMany([['toggleTask', 't3'], ['toggleTask', 't3']]), []);
  await costs('child', 'send an empty message', () => child.store('sendMessage', cid, 'child', '   '), []);
});

test('what the parent’s actions cost', async () => {
  const requests = (await parent.view()).store.requests;
  const time = requests.find((r) => r.kind === 'extra_time');
  const unlock = requests.find((r) => r.kind === 'unlock_app');
  await costs('parent', 'send a chat message', () => parent.store('sendMessage', cid, 'parent', 'hi'), ['set children/*/messages/* [at,by,from,text]']);
  await costs('parent', 'approve a time request (answer + minutes)', () => parent.store('resolveRequest', time.id, true), ['update children/* [limitMin]', 'update children/*/requests/* [resolvedAt,resolvedBy,status]']);
  await costs('parent', 'approve the same request again', () => parent.store('resolveRequest', time.id, true), []);
  await costs('parent', 'approve an unlock request (answer + app list)', () => parent.store('resolveRequest', unlock.id, true), ['update children/* [apps]', 'update children/*/requests/* [resolvedAt,resolvedBy,status]']);
  await child.store('requestExtraTime', 5);
  const again = (await parent.eventually((v) => v.store.requests.some((r) => r.minutes === 5), 'the new request')).store.requests.find((r) => r.minutes === 5);
  await costs('parent', 'deny a request', () => parent.store('resolveRequest', again.id, false), ['update children/*/requests/* [resolvedAt,resolvedBy,status]']);

  await costs('parent', 'change the daily limit', () => parent.store('adjustLimit', cid, -15), ['update children/* [limitMin]']);
  await costs('parent', 'tap "+15 min" four times in a row', () => parent.storeMany([['adjustLimit', cid, 15], ['adjustLimit', cid, 15], ['adjustLimit', cid, 15], ['adjustLimit', cid, 15]]), ['update children/* [limitMin]']);
  await costs('parent', 'grant a bonus', () => parent.store('grantBonus', cid, 10), ['update children/* [limitMin]']);
  await costs('parent', 'pause the device', () => parent.store('pauseDevice', cid), ['update children/* [bedtime]']);
  await costs('parent', 'pause it again (already paused)', () => parent.store('pauseDevice', cid), []);
  await costs('parent', 'resume the device', () => parent.store('resumeDevice', cid), ['update children/* [bedtime]']);
  await costs('parent', 'block an app', () => parent.store('toggleApp', cid, 'a3'), ['update children/* [apps]']);
  await costs('parent', 'set an app limit', () => parent.store('setAppLimit', cid, 'a1', 20), ['update children/* [apps]']);
  await costs('parent', 'pause, cut the limit and block an app in one go', () => parent.storeMany([['pauseDevice', cid], ['adjustLimit', cid, -30], ['toggleApp', cid, 'a4']]), ['update children/* [apps,bedtime,limitMin]']);
  await costs('parent', 'rename the child', () => parent.store('renameChild', cid, 'Zoe T.'), ['update children/* [name]']);

  await costs('parent', 'switch a schedule', () => parent.store('toggleSchedule', 's3'), ['update schedules/s3 [on]']);
  await costs('parent', 'add a schedule', () => parent.store('addSchedule', { name: 'Piano', icon: 'music', color: '#12B5A6', start: '5:00 PM', end: '5:30 PM', days: [true, false, true, false, false, false, false], on: true }), ['set schedules/* [color,days,end,icon,name,on,ord,start]']);
  await costs('parent', 'remove a schedule', () => parent.store('removeSchedule', 's4'), ['delete schedules/s4']);
  await costs('parent', 'add a site rule', () => parent.store('addSite', 'bad.example', 'blocked'), ['set sites/* [host,list,ord]']);
  await costs('parent', 'add the same site rule again', () => parent.store('addSite', 'bad.example', 'blocked'), []);
  const site = (await parent.view()).store.sites[0].id;
  await costs('parent', 'remove a site rule', () => parent.store('removeSite', site), ['delete sites/*']);
  await costs('parent', 'add a place', () => parent.store('addPlace', { name: 'Swim club', icon: 'home', radius: 100, arrive: true, leave: true }), ['set places/* [arrive,icon,leave,name,ord,radius]']);
  await costs('parent', 'switch a place alert', () => parent.store('togglePlaceAlert', 'p1', 'leave'), ['update places/p1 [leave]']);
  await costs('parent', 'remove a place', () => parent.store('removePlace', 'p3'), ['delete places/p3']);
  await costs('parent', 'tick a task', () => parent.store('toggleTask', 't4'), ['update tasks/t4 [done]']);

  const unread = (await parent.view()).store.alerts.filter((a) => a.unread).length;
  assert.equal(unread, 2, 'two unread alerts (the check-in and the SOS)');
  await costs('parent', 'mark 2 unread alerts as read', () => parent.store('markAlertsRead'), ['update alerts/* [unread]', 'update alerts/* [unread]']);
  await costs('parent', 'mark as read again (nothing unread)', () => parent.store('markAlertsRead'), []);

  await child.store('triggerSOS');
  await parent.eventually((v) => v.store.sosActive, 'the SOS');
  await costs('parent', 'clear the child’s SOS', () => parent.store('clearSOS'), ['tx.set signals/sos [active,at,by,childId]']);

  await costs('parent', 'make a pairing code', async () => ok(await parent.link('createPairingCode', 'child'), 'createPairingCode'), ['set pairing/* [approved,claimName,claimPlatform,claimedAt,claimedBy,createdAt,createdBy,expiresAt,familyId,role]']);
  await costs('parent', 'take the pairing code back', async () => ok(await parent.link('cancelPairingCode'), 'cancelPairingCode'), ['delete pairing/*']);
  await costs('parent', 'add a child profile', () => parent.store('addChild', 'Max Tester', 7), ['set children/* [age,apps,battery,bedtime,deviceName,limitMin,name,online,ord,place,placeIcon,usedMin,weekly]']);
});

test('the table', (t) => {
  for (const row of table) t.diagnostic(`${row.who.padEnd(6)} | ${String(row.writes).padStart(1)} | ${row.what} | ${row.detail}`);
  assert.ok(table.length > 30);
});

test('"last seen": at most once a minute, and not at all from a phone in the background', { skip: process.env.HAVEN_LIVE_FAST === '1' ? 'HAVEN_LIVE_FAST=1' : false }, async (t) => {
  await quiet([parent, child]);
  await child.appState('background');
  await parent.fx(true);
  await child.fx(true);
  await sleep(65000);
  const p = writesIn(await parent.fx(true), { presence: true });
  const c = writesIn(await child.fx(true), { presence: true });
  t.diagnostic(`65 s without touching the phones: parent (foreground) wrote ${p.length} document(s), child (background) wrote ${c.length}`);
  assert.ok(p.length <= 1 && p.every((w) => /\/devices\//.test(w.path)), `the parent wrote at most one "last seen": ${describeWrites(p, { presence: true }).join(', ')}`);
  assert.deepEqual(c.map((w) => w.path), [], 'the phone in the background wrote nothing');

  // Back in the foreground, a minute after its last one: one "last seen", at once.
  await child.appState('active');
  await quiet([child]);
  const back = writesIn(await child.fx(true), { presence: true });
  assert.equal(back.length, 1);
  assert.match(back[0].path, /\/devices\//);
});

test('nothing went wrong inside the apps', async () => {
  await noAppErrors([parent, child]);
});
