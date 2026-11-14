// 6. Integrity and validation. The attacker here is usually somebody who IS allowed to write the
// document in question, using a modified app: the server must still insist on who signed it, on
// its own clock, on the exact set of fields, on their types and sizes, and on the fields that
// may never change.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { deleteDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';

import {
  A, allowed, B, CODES, FAM_A, FAM_B, flows, harness, make, minutesAgo, minutesAhead, omit, ref, refused, sampleApps, U,
} from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

const parent = () => h.a.founder;
const kid = () => h.a.kid1;

const long = (n) => 'x'.repeat(n);
const clientNow = () => Timestamp.now(); // the phone's clock, not the server's
const NOT_SERVER_TIME = [
  ['the phone\'s own clock', clientNow],
  ['a time in the past', () => minutesAgo(60 * 24)],
  ['a time in the future', () => minutesAhead(60 * 24)],
  ['a number of milliseconds', () => Date.now()],
  ['null', () => null],
];
const show = (value) => {
  if (value instanceof Timestamp) return 'a client-made timestamp';
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text.length > 40 ? `${text.slice(0, 37)}...` : text;
};

/**
 * The same checks for every kind of document:
 *   - the valid document is accepted (control),
 *   - each field missing is refused, an unknown extra field is refused,
 *   - each listed wrong value (type, size, range, forged signature) is refused.
 * `write(data)` sends the document the way its rightful author would; `optional` lists fields
 * that may be left out; `times` lists the fields that must be the server's time.
 */
function shapeSuite(title, { write, valid, optional = [], wrong = {}, times = [], world = 'arranged' }) {
  describe(title, () => {
    // A refused write changes nothing, so the world is only put back after a write went through.
    beforeEach(() => h.ensure(world));

    test('control: the valid document is accepted', async () => {
      await allowed(write(valid()));
    });

    for (const field of Object.keys(valid())) {
      if (optional.includes(field)) continue;
      test(`missing "${field}" is refused`, async () => {
        await refused(write(omit(valid(), field)));
      });
    }

    test('an unknown extra field is refused', async () => {
      await refused(write({ ...valid(), admin: true }));
    });

    for (const [field, values] of Object.entries(wrong)) {
      for (const value of values) {
        test(`"${field}" = ${show(value)} is refused`, async () => {
          await refused(write({ ...valid(), [field]: value }));
        });
      }
    }

    for (const field of times) {
      for (const [what, value] of NOT_SERVER_TIME) {
        test(`"${field}" set to ${what} instead of the server time is refused`, async () => {
          await refused(write({ ...valid(), [field]: value() }));
        });
      }
    }
  });
}

// ---- Family rules: parent-owned documents -------------------------------------------------------

shapeSuite('6.1 places', {
  write: (data) => setDoc(ref(parent(), A('places/pNew')), data),
  valid: () => make.place(),
  wrong: {
    name: ['', long(61), 5, null, ['Home']],
    icon: [long(41), 7, null],
    radius: [0, -5, 100001, '150', null],
    arrive: ['yes', 1, null],
    leave: ['no', 0, null],
    ord: ['first', null, true],
  },
});

shapeSuite('6.2 schedules', {
  write: (data) => setDoc(ref(parent(), A('schedules/sNew')), data),
  valid: () => make.schedule(),
  wrong: {
    name: ['', long(61), 3],
    icon: [long(41), false],
    color: ['red', '#12', '#GGGGGG', '#12345678', 5],
    start: ['', long(13), 900],
    end: ['', long(13), null],
    days: [[true], 'MTWTFSS', [true, true, true, true, true, true, true, true], null],
    on: ['on', 1],
    ord: ['a', null],
  },
});

shapeSuite('6.3 site rules', {
  write: (data) => setDoc(ref(parent(), A('sites/wNew')), data),
  valid: () => make.site(),
  wrong: { host: ['', long(254), 7, null], list: ['maybe', true, null, 'Blocked'], ord: [null, 'x'] },
});

shapeSuite('6.4 tasks', {
  write: (data) => setDoc(ref(parent(), A('tasks/tNew')), data),
  valid: () => make.task(),
  wrong: { title: ['', long(81), 5], points: [-1, 1001, 2.5, '20', null], done: ['no', null, 0], ord: ['x', null] },
});

shapeSuite('6.5 child profiles', {
  write: (data) => setDoc(ref(parent(), A('children/cNew')), data),
  valid: () => make.child({ name: 'Zoe Carter', age: 5, ord: 2 }),
  wrong: {
    name: ['', long(61), 9, null],
    age: [-1, 26, '11', null],
    deviceName: [long(61), 5, null],
    battery: [-1, 101, 'full'],
    online: ['yes', 1],
    bedtime: [0, 'paused'],
    usedMin: [-1, 1441, '10'],
    limitMin: [-1, 1441, '240', null],
    place: [long(61), 3],
    placeIcon: [long(41), 3],
    apps: ['none', null, { a1: true }, Array(61).fill(sampleApps()[0])],
    weekly: [[1, 2, 3], 'week', [1, 2, 3, 4, 5, 6, 7, 8], null],
    ord: ['0', null],
  },
});

describe('6.5b child profiles are validated on every update as well', () => {
  beforeEach(() => h.reset());
  const c1 = () => ref(parent(), A('children/c1'));

  for (const [what, change] of [
    ['a limit above 24 hours', { limitMin: 5000 }],
    ['a negative limit', { limitMin: -30 }],
    ['a limit that is not a number', { limitMin: 'unlimited' }],
    ['a pause flag that is not true or false', { bedtime: 'yes' }],
    ['an app list that is not a list', { apps: 'all' }],
    ['an app list with more than 60 entries', { apps: Array(61).fill(sampleApps()[0]) }],
    ['an empty name', { name: '' }],
    ['a name of 61 characters', { name: long(61) }],
    ['an unknown field', { vip: true }],
    ['a week of six days', { weekly: [1, 2, 3, 4, 5, 6] }],
  ]) {
    test(`a parent cannot store ${what}`, async () => {
      await refused(updateDoc(c1(), change));
    });
  }
  test('control: a valid change is accepted', () => allowed(updateDoc(c1(), { limitMin: 1440, bedtime: true, name: long(60) })));
  test('a child profile cannot be stored under an id with odd characters or of 41 characters', async () => {
    await refused(setDoc(ref(parent(), A('children/c 9')), make.child()));
    await refused(setDoc(ref(parent(), A('children/c.9')), make.child()));
    await refused(setDoc(ref(parent(), A(`children/${long(41)}`)), make.child()));
    await allowed(setDoc(ref(parent(), A(`children/${long(40)}`)), make.child()));
  });
});

// ---- What a child device writes ---------------------------------------------------------------------

shapeSuite('6.6 requests (written by the child device)', {
  write: (data) => setDoc(ref(kid(), A('children/c1/requests/rNew')), data),
  valid: () => make.request(U.kid1),
  optional: ['minutes'],
  times: ['at'],
  wrong: {
    kind: ['free_pass', 5, null, ''],
    label: ['', long(81), 30],
    detail: [long(201), 5, null],
    minutes: [0, -30, 241, 2.5, '30', null],
    status: ['approved', 'denied', 'done', null],
    by: [U.founder, U.kid2, 'someoneElse', null],
  },
});

shapeSuite('6.7 unlock requests (the optional appId)', {
  write: (data) => setDoc(ref(kid(), A('children/c1/requests/rNew')), data),
  valid: () => make.unlockRequest(U.kid1),
  optional: ['appId'],
  wrong: { appId: ['', long(41), 7, null] },
});

shapeSuite('6.8 a parent\'s answer to a request', {
  write: (data) => updateDoc(ref(parent(), A('children/c1/requests/r1')), data),
  valid: () => make.answer(U.founder, 'approved'),
  times: ['resolvedAt'],
  wrong: {
    status: ['pending', 'maybe', 'APPROVED', null, true],
    resolvedBy: [U.parent2, U.kid1, 'someoneElse', null],
  },
});

shapeSuite('6.9 chat messages from a child device', {
  write: (data) => setDoc(ref(kid(), A('children/c1/messages/mNew')), data),
  valid: () => make.message(U.kid1, 'child'),
  times: ['at'],
  wrong: {
    from: ['parent', 'admin', 'Child', null, 1],
    text: ['', long(2001), 5, null, ['hi']],
    by: [U.founder, U.kid2, 'someoneElse', null],
  },
});

shapeSuite('6.10 chat messages from a parent', {
  write: (data) => setDoc(ref(parent(), A('children/c1/messages/mNew')), data),
  valid: () => make.message(U.founder, 'parent'),
  times: ['at'],
  wrong: {
    from: ['child', 'system', null],
    text: ['', long(2001), 5],
    by: [U.parent2, U.kid1, 'someoneElse', null],
  },
});

shapeSuite('6.11 alerts from a child device', {
  write: (data) => setDoc(ref(kid(), A('alerts/nNew')), data),
  valid: () => make.alert(U.kid1, 'checkin', 'c1'),
  times: ['at'],
  wrong: {
    kind: ['', long(21), 5, null, 'limit'],
    childId: ['c2', null, 7, 'c 1', long(41)],
    icon: [long(41), 7],
    color: ['blue', '#12345', 255],
    title: ['', long(121), 9],
    body: [long(241), 9, null],
    unread: [false, 'yes', null],
    by: [U.founder, U.kid2, 'someoneElse', null],
  },
});

shapeSuite('6.12 alerts from a parent', {
  write: (data) => setDoc(ref(parent(), A('alerts/nNew')), data),
  valid: () => make.alert(U.founder, 'limit', 'c1'),
  times: ['at'],
  wrong: {
    kind: ['', long(21), 5],
    childId: [7, 'c 1', long(41), ['c1']],
    color: ['blue'],
    title: ['', long(121)],
    body: [long(241)],
    unread: [false, 'yes'],
    by: [U.parent2, U.kid1, 'someoneElse', null],
  },
});

shapeSuite('6.13 the check-in status', {
  write: (data) => setDoc(ref(kid(), A('children/c1/live/status')), data),
  valid: () => make.liveStatus(U.kid1),
  times: ['checkInAt'],
  wrong: { by: [U.founder, U.kid2, 'someoneElse', null] },
});

shapeSuite('6.14 the SOS flag raised by a child device', {
  write: (data) => setDoc(ref(kid(), A('signals/sos')), data),
  valid: () => make.sos(U.kid1, true, 'c1'),
  times: ['at'],
  wrong: {
    active: ['yes', 1, null],
    childId: ['c2', null, 7],
    by: [U.founder, U.kid2, 'someoneElse', null],
  },
});

shapeSuite('6.15 the SOS flag cleared by a parent', {
  write: (data) => setDoc(ref(parent(), A('signals/sos')), data),
  valid: () => make.sos(U.founder, false, 'c1'),
  times: ['at'],
  wrong: {
    active: [true, 'no', null],
    childId: ['c2', null],
    by: [U.parent2, U.kid1, 'someoneElse', null],
  },
});

shapeSuite('6.16 device records (presence)', {
  write: (data) => setDoc(ref(kid(), A('devices/devNew')), data),
  valid: () => make.device(U.kid1),
  times: ['lastSeenAt'],
  wrong: {
    uid: [U.founder, U.kid2, 'someoneElse', null],
    name: ['', long(41), 5],
    platform: ['windows', 'Android', 5, null],
  },
});

// ---- Accounts, families, membership --------------------------------------------------------------------

shapeSuite('6.17 users/{uid}', {
  write: (data) => setDoc(ref(parent(), `users/${U.founder}`), data),
  valid: () => make.userPointer(FAM_A, 'parent'),
  times: ['updatedAt'],
  wrong: {
    familyId: [FAM_B, 'noSuchFamily00000001', 'bad id', long(41), 5, null],
    role: ['child', 'admin', null, true],
  },
});

shapeSuite('6.18 the family document (in the creation batch)', {
  world: 'empty',
  write: (data) => flows.createFamily(parent(), FAM_A, { family: data }),
  valid: () => make.family(U.founder),
  times: ['createdAt'],
  wrong: {
    v: [1, 3, '2', null],
    owner: [U.parent2, 'someoneElse', null],
    name: ['', long(61), 5, null],
  },
});

shapeSuite('6.19 the founder\'s member record (in the creation batch)', {
  world: 'empty',
  write: (data) => flows.createFamily(parent(), FAM_A, { member: data }),
  valid: () => make.founderMember(U.founder),
  times: ['joinedAt'],
  wrong: {
    role: ['child', 'owner', null],
    childId: ['c1', 5],
    name: ['', long(41), 5],
    platform: ['palm', null],
    addedBy: [U.parent2, 'someoneElse', null],
    code: ['XSEDKD22', CODES.openChild, 5],
  },
});

shapeSuite('6.20 the member record written when a claim is approved', {
  write: (data) => {
    const batch = writeBatch(parent().db);
    batch.set(ref(parent(), A(`members/${U.claimer}`)), data);
    batch.update(ref(parent(), `pairing/${CODES.taken}`), { approved: true });
    return batch.commit();
  },
  valid: () => make.member(U.founder, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, 'child', 'c1'),
  times: ['joinedAt'],
  wrong: {
    role: ['parent', 'admin', null],
    childId: ['cGhost', null, 7],
    name: ['Vivo V40e', '', long(41), 5],
    platform: ['ios', 'windows', null],
    addedBy: [U.parent2, U.claimer, 'someoneElse', null],
    code: [CODES.openChild, 'XSEDKD22', null, 5],
  },
});

shapeSuite('6.21 pairing codes', {
  write: (data) => setDoc(ref(parent(), `pairing/${CODES.fresh}`), data),
  valid: () => make.pairing(FAM_A, U.founder, 'child'),
  times: ['createdAt'],
  wrong: {
    familyId: [FAM_B, 'noSuchFamily00000001', 5, null],
    role: ['admin', null, 5],
    createdBy: [U.parent2, U.kid1, 'someoneElse', null],
    expiresAt: [minutesAgo(1), minutesAhead(21), Date.now() + 60_000, null, 'soon'],
    claimedBy: [U.joiner, U.founder, ''],
    claimName: ['Vivo V40e', ''],
    claimPlatform: ['android', ''],
    claimedAt: [minutesAgo(1), 0],
    approved: [true, null, 'false'],
  },
});

describe('6.21b how the length of a text is counted', () => {
  beforeEach(() => h.reset());

  // Measured, not assumed: the rules count a text the way JavaScript's string.length does (UTF-16
  // units). An accented letter counts 1, an emoji counts 2. A length check in the app has to use
  // string.length to agree with the server; counting "characters" lets too-long emoji text through
  // to a refusal.
  test('a 60-character limit holds 60 accented letters but only 30 emoji', async () => {
    const place = (name) => setDoc(ref(parent(), A('places/pLength')), make.place({ name }));
    assert.equal('é'.repeat(60).length, 60);
    assert.equal('😀'.repeat(30).length, 60);
    await refused(place('é'.repeat(61)));
    await allowed(place('é'.repeat(60)));
    await refused(place('😀'.repeat(31)));
    await allowed(place('😀'.repeat(30)));
  });

  test('a chat message holds 2000 letters or 1000 emoji', async () => {
    const send = (id, text) => setDoc(ref(kid(), A(`children/c1/messages/${id}`)), make.message(U.kid1, 'child', { text }));
    await refused(send('mLetters', 'ü'.repeat(2001)));
    await allowed(send('mLetters', 'ü'.repeat(2000)));
    await refused(send('mEmoji', '🎉'.repeat(1001)));
    await allowed(send('mEmoji', '🎉'.repeat(1000)));
  });
});

// ---- Ids ----------------------------------------------------------------------------------------------

describe('6.22 document ids chosen by the client are checked', () => {
  beforeEach(() => h.reset());

  const cases = [
    ['a place', () => parent(), 'places', () => make.place()],
    ['a schedule', () => parent(), 'schedules', () => make.schedule()],
    ['a site rule', () => parent(), 'sites', () => make.site()],
    ['a task', () => parent(), 'tasks', () => make.task()],
    ['an alert', () => parent(), 'alerts', () => make.alert(U.founder, 'limit', 'c1')],
    ['a device record', () => kid(), 'devices', () => make.device(U.kid1)],
    ['a request', () => kid(), 'children/c1/requests', () => make.request(U.kid1)],
    ['a message', () => kid(), 'children/c1/messages', () => make.message(U.kid1, 'child')],
  ];
  for (const [what, actor, path, data] of cases) {
    test(`${what} cannot be stored under an id of 41 characters or with odd characters`, async () => {
      await refused(setDoc(ref(actor(), A(`${path}/${long(41)}`)), data()));
      await refused(setDoc(ref(actor(), A(`${path}/has space`)), data()));
      await refused(setDoc(ref(actor(), A(`${path}/semi;colon`)), data()));
      await refused(setDoc(ref(actor(), A(`${path}/dot.dot`)), data()));
      await allowed(setDoc(ref(actor(), A(`${path}/${long(40)}`)), data())); // control
      await allowed(setDoc(ref(actor(), A(`${path}/Ok_id-123`)), data()));
    });
  }

  test('a family cannot be created under an id with odd characters or of 41 characters', async () => {
    await h.empty();
    await refused(flows.createFamily(parent(), 'bad id with spaces'));
    await refused(flows.createFamily(parent(), long(41)));
    await allowed(flows.createFamily(parent(), long(40)));
  });
});

// ---- Fields that never change ---------------------------------------------------------------------------

describe('6.23 immutable fields', () => {
  beforeEach(() => h.reset());

  test('member records: nobody can change role, code, addedBy, joinedAt or platform; not even a parent', async () => {
    for (const actor of [h.a.founder, h.a.parent2, h.a.kid1]) {
      const member = ref(actor, A(`members/${U.kid1}`));
      await refused(updateDoc(member, { role: 'parent' }));
      await refused(updateDoc(member, { role: 'parent', childId: null }));
      await refused(updateDoc(member, { code: null }));
      await refused(updateDoc(member, { code: CODES.openChild }));
      await refused(updateDoc(member, { addedBy: 'someoneElse' }));
      await refused(updateDoc(member, { joinedAt: serverTimestamp() }));
      await refused(updateDoc(member, { platform: 'ios' }));
    }
    const original = await h.peek(A(`members/${U.kid1}`));
    assert.deepEqual([original.role, original.code, original.addedBy], ['child', 'XSEDKD22', U.founder]);
  });

  test('member records: a parent cannot demote another parent or the founder, or promote a child', async () => {
    await refused(updateDoc(ref(h.a.parent2, A(`members/${U.founder}`)), { role: 'child', childId: 'c1' }));
    await refused(updateDoc(ref(h.a.founder, A(`members/${U.parent2}`)), { role: 'child', childId: 'c1' }));
    await refused(updateDoc(ref(h.a.founder, A(`members/${U.kid2}`)), { role: 'parent', childId: null }));
    await refused(setDoc(ref(h.a.founder, A(`members/${U.kid2}`)), make.founderMember(U.founder)));
  });

  test('member records: relabelling is limited to a sensible name and an existing child profile', async () => {
    const member = ref(parent(), A(`members/${U.kid1}`));
    await refused(updateDoc(member, { name: '' }));
    await refused(updateDoc(member, { name: long(41) }));
    await refused(updateDoc(member, { name: 7 }));
    await refused(updateDoc(member, { childId: 'cGhost' }));
    await refused(updateDoc(member, { childId: null }));
    await refused(updateDoc(member, { childId: 'c1/messages/m1' }));
    await refused(updateDoc(ref(parent(), A(`members/${U.parent2}`)), { childId: 'c1' })); // a parent has no child profile
    await refused(updateDoc(member, { name: 'ok', nickname: 'extra field' }));
    await allowed(updateDoc(member, { name: long(40), childId: 'c2' })); // control
  });

  test('the family document: owner, version and creation time never change', async () => {
    for (const actor of [h.a.founder, h.a.parent2]) {
      const family = ref(actor, A());
      await refused(updateDoc(family, { owner: U.parent2 === actor.uid ? U.parent2 : U.kid1 }));
      await refused(updateDoc(family, { v: 3 }));
      await refused(updateDoc(family, { createdAt: serverTimestamp() }));
      await refused(updateDoc(family, { name: 'ok', plan: 'premium' }));
      await refused(updateDoc(family, { name: '' }));
      await refused(updateDoc(family, { name: long(61) }));
      await refused(setDoc(family, make.family(actor.uid)));
    }
    await allowed(updateDoc(ref(parent(), A()), { name: long(60) })); // control
  });

  test('messages: from, text, at and by can never be changed, by anyone', async () => {
    for (const actor of [h.a.founder, h.a.parent2, h.a.kid1]) {
      for (const id of ['m1', 'm2']) {
        const message = ref(actor, A(`children/c1/messages/${id}`));
        await refused(updateDoc(message, { from: 'child' }));
        await refused(updateDoc(message, { from: 'parent' }));
        await refused(updateDoc(message, { text: 'rewritten' }));
        await refused(updateDoc(message, { at: serverTimestamp() }));
        await refused(updateDoc(message, { by: actor.uid }));
        await refused(deleteDoc(message));
      }
    }
    assert.equal((await h.peek(A('children/c1/messages/m1'))).text, 'Have a great day at school!');
  });

  test('messages: an existing message cannot be replaced by writing a new one under the same id', async () => {
    await refused(setDoc(ref(parent(), A('children/c1/messages/m2')), make.message(U.founder, 'parent')));
    await refused(setDoc(ref(kid(), A('children/c1/messages/m1')), make.message(U.kid1, 'child')));
  });

  test('requests: a parent answers once and can change nothing but the answer', async () => {
    const request = ref(parent(), A('children/c1/requests/r1'));
    await refused(updateDoc(request, { ...make.answer(U.founder, 'approved'), minutes: 5 }));
    await refused(updateDoc(request, { ...make.answer(U.founder, 'approved'), label: 'edited' }));
    await refused(updateDoc(request, { ...make.answer(U.founder, 'approved'), kind: 'bedtime' }));
    await refused(updateDoc(request, { ...make.answer(U.founder, 'approved'), by: U.founder }));
    await refused(updateDoc(request, { ...make.answer(U.founder, 'approved'), at: serverTimestamp() }));
    await refused(updateDoc(request, { status: 'approved' })); // unsigned
    await allowed(updateDoc(request, make.answer(U.founder, 'approved')));
    // answered: no second answer, by the same or the other parent
    await refused(updateDoc(request, make.answer(U.founder, 'denied')));
    await refused(updateDoc(ref(h.a.parent2, A('children/c1/requests/r1')), make.answer(U.parent2, 'denied')));
    await refused(updateDoc(request, { status: 'pending' }));
    await refused(updateDoc(request, { resolvedAt: serverTimestamp() }));
  });

  test('requests: a parent cannot create a request in a child\'s name', async () => {
    await refused(setDoc(ref(parent(), A('children/c1/requests/rForged')), make.request(U.founder)));
    await refused(setDoc(ref(parent(), A('children/c1/requests/rForged')), make.request(U.kid1)));
  });

  test('alerts: only "unread" changes, and only to false', async () => {
    const alert = ref(parent(), A('alerts/n1'));
    await refused(updateDoc(alert, { title: 'edited' }));
    await refused(updateDoc(alert, { body: 'edited' }));
    await refused(updateDoc(alert, { kind: 'sos' }));
    await refused(updateDoc(alert, { childId: 'c2' }));
    await refused(updateDoc(alert, { at: serverTimestamp() }));
    await refused(updateDoc(alert, { by: U.kid1 }));
    await refused(updateDoc(alert, { unread: false, title: 'edited' }));
    await allowed(updateDoc(alert, { unread: false }));
    await refused(updateDoc(alert, { unread: true }));
    await refused(setDoc(alert, make.alert(U.founder, 'limit', 'c1')));
  });

  test('pairing codes: role, family, creator, creation time and expiry never change', async () => {
    for (const actor of [h.a.founder, h.a.parent2]) {
      const code = ref(actor, `pairing/${CODES.taken}`);
      await refused(updateDoc(code, { role: 'parent' }));
      await refused(updateDoc(code, { familyId: FAM_B }));
      await refused(updateDoc(code, { createdBy: actor.uid === U.founder ? U.parent2 : U.kid1 }));
      await refused(updateDoc(code, { createdAt: serverTimestamp() }));
      await refused(updateDoc(code, { expiresAt: minutesAhead(10) }));
      await refused(updateDoc(code, { claimName: "Mum's iPhone" }));
      await refused(updateDoc(code, { claimPlatform: 'ios' }));
    }
  });

  test('device records: the owner of a record never changes', async () => {
    await refused(updateDoc(ref(kid(), A('devices/devKid1')), { uid: U.founder, lastSeenAt: serverTimestamp() }));
    await refused(updateDoc(ref(parent(), A('devices/devKid1')), { uid: U.founder, lastSeenAt: serverTimestamp() }));
    await refused(updateDoc(ref(parent(), A('devices/devKid1')), { name: 'renamed by a parent', lastSeenAt: serverTimestamp() }));
    await allowed(updateDoc(ref(kid(), A('devices/devKid1')), { name: 'Vivo', lastSeenAt: serverTimestamp() })); // control
  });

  test('the check-in status cannot be written by a parent or deleted by anyone', async () => {
    await refused(setDoc(ref(parent(), A('children/c1/live/status')), make.liveStatus(U.founder)));
    await refused(updateDoc(ref(parent(), A('children/c1/live/status')), { checkInAt: serverTimestamp() }));
    await refused(deleteDoc(ref(parent(), A('children/c1/live/status'))));
    await refused(deleteDoc(ref(kid(), A('children/c1/live/status'))));
  });
});

// ---- Things that must never be possible -----------------------------------------------------------------

describe('6.24 the founder, the family and "one family per account"', () => {
  beforeEach(() => h.reset());

  test('the founder\'s member record cannot be deleted: not by the founder, not by another parent, not by a child', async () => {
    await refused(deleteDoc(ref(h.a.founder, A(`members/${U.founder}`))));
    await refused(deleteDoc(ref(h.a.parent2, A(`members/${U.founder}`))));
    await refused(deleteDoc(ref(h.a.kid1, A(`members/${U.founder}`))));
    const batch = writeBatch(h.a.parent2.db); // not even hidden among permitted deletes
    batch.delete(ref(h.a.parent2, A(`members/${U.kid1}`)));
    batch.delete(ref(h.a.parent2, A(`members/${U.founder}`)));
    await refused(batch.commit());
    assert.equal((await h.peek(A(`members/${U.founder}`))).role, 'parent');
    await allowed(deleteDoc(ref(h.a.founder, A(`members/${U.parent2}`)))); // control: a non-founder parent can be removed
  });

  test('a family cannot be deleted by anyone', async () => {
    for (const key of ['founder', 'parent2', 'kid1', 'parentB', 'verified', 'none']) {
      await refused(deleteDoc(ref(h.a[key], A())));
    }
    assert.equal((await h.peek(A())).name, 'Carter family');
  });

  test('child profiles cannot be deleted (their history hangs below them)', async () => {
    await refused(deleteDoc(ref(h.a.founder, A('children/c1'))));
    await refused(deleteDoc(ref(h.a.parent2, A('children/c2'))));
  });

  test('an account that has a family cannot create a second one', async () => {
    await refused(flows.createFamily(h.a.founder, 'secondFamily00000001'));
    await refused(setDoc(ref(h.a.founder, 'families/secondFamily00000001'), make.family(U.founder)));
    const withoutPointer = writeBatch(h.a.founder.db);
    withoutPointer.set(ref(h.a.founder, 'families/secondFamily00000001'), make.family(U.founder));
    withoutPointer.set(ref(h.a.founder, `families/secondFamily00000001/members/${U.founder}`), make.founderMember(U.founder));
    await refused(withoutPointer.commit());
    assert.equal(await h.peek('families/secondFamily00000001'), undefined);
  });

  test('the founder cannot free itself for a second family by deleting or re-pointing users/{uid}', async () => {
    await refused(deleteDoc(ref(h.a.founder, `users/${U.founder}`)));
    await refused(setDoc(ref(h.a.founder, `users/${U.founder}`), make.userPointer('secondFamily00000001', 'parent')));
    const swap = writeBatch(h.a.founder.db); // delete the pointer and create the new family in one go
    swap.delete(ref(h.a.founder, `users/${U.founder}`));
    swap.set(ref(h.a.founder, 'families/secondFamily00000001'), make.family(U.founder));
    swap.set(ref(h.a.founder, `families/secondFamily00000001/members/${U.founder}`), make.founderMember(U.founder));
    await refused(swap.commit());
  });

  test('a family cannot be created for somebody else, or without its founder record and pointer', async () => {
    await h.empty();
    const founder = h.a.founder;
    await refused(setDoc(ref(founder, A()), make.family(U.founder))); // family alone
    await refused(setDoc(ref(founder, A(`members/${U.founder}`)), make.founderMember(U.founder))); // member alone
    await refused(setDoc(ref(founder, `users/${U.founder}`), make.userPointer(FAM_A, 'parent'))); // pointer alone
    const noMember = writeBatch(founder.db);
    noMember.set(ref(founder, A()), make.family(U.founder));
    noMember.set(ref(founder, `users/${U.founder}`), make.userPointer(FAM_A, 'parent'));
    await refused(noMember.commit());
    const noPointer = writeBatch(founder.db);
    noPointer.set(ref(founder, A()), make.family(U.founder));
    noPointer.set(ref(founder, A(`members/${U.founder}`)), make.founderMember(U.founder));
    await refused(noPointer.commit());
    const forSomeoneElse = writeBatch(founder.db);
    forSomeoneElse.set(ref(founder, A()), make.family(U.parent2));
    forSomeoneElse.set(ref(founder, A(`members/${U.parent2}`)), make.founderMember(U.parent2));
    forSomeoneElse.set(ref(founder, `users/${U.founder}`), make.userPointer(FAM_A, 'parent'));
    await refused(forSomeoneElse.commit());
    const extraMember = writeBatch(founder.db); // founder plus a second "founder-style" member in the same batch
    extraMember.set(ref(founder, A()), make.family(U.founder));
    extraMember.set(ref(founder, A(`members/${U.founder}`)), make.founderMember(U.founder));
    extraMember.set(ref(founder, A(`members/${U.kid1}`)), make.founderMember(U.founder));
    extraMember.set(ref(founder, `users/${U.founder}`), make.userPointer(FAM_A, 'parent'));
    await refused(extraMember.commit());
    await allowed(flows.createFamily(founder, FAM_A)); // control
  });

  test('founder-style member records cannot be added to a family that already exists', async () => {
    await refused(setDoc(ref(h.a.founder, A(`members/${U.joiner}`)), make.founderMember(U.founder)));
    await refused(setDoc(ref(h.a.joinerVerified, A(`members/${U.joinerVerified}`)), make.founderMember(U.joinerVerified)));
    await refused(setDoc(ref(h.a.founder, B(`members/${U.founder}`)), make.founderMember(U.founder)));
  });
});

describe('6.25 users/{uid} always tells the truth', () => {
  beforeEach(() => h.reset());

  test('an account cannot point users/{uid} at a family it is not in', async () => {
    await refused(setDoc(ref(h.a.verified, `users/${U.verified}`), make.userPointer(FAM_A, 'parent')));
    await refused(setDoc(ref(h.a.anon, `users/${U.anon}`), make.userPointer(FAM_A, 'child')));
    await refused(setDoc(ref(h.a.founder, `users/${U.founder}`), make.userPointer(FAM_B, 'parent')));
    await refused(setDoc(ref(h.a.kid1, `users/${U.kid1}`), make.userPointer(FAM_B, 'child')));
    await refused(setDoc(ref(h.a.claimer, `users/${U.claimer}`), make.userPointer(FAM_A, 'child')));
    await refused(setDoc(ref(h.a.verified, `users/${U.verified}`), make.userPointer('noSuchFamily00000001', 'parent')));
  });

  test('an account cannot state a role other than the one in its member record', async () => {
    await refused(setDoc(ref(h.a.kid1, `users/${U.kid1}`), make.userPointer(FAM_A, 'parent')));
    await refused(setDoc(ref(h.a.parent2, `users/${U.parent2}`), make.userPointer(FAM_A, 'child')));
    await refused(updateDoc(ref(h.a.kid1, `users/${U.kid1}`), { role: 'parent', updatedAt: serverTimestamp() }));
  });

  test('an account cannot write or delete somebody else\'s users document', async () => {
    await refused(setDoc(ref(h.a.parent2, `users/${U.founder}`), make.userPointer(FAM_A, 'parent')));
    await refused(setDoc(ref(h.a.founder, `users/${U.kid1}`), make.userPointer(FAM_A, 'child')));
    await refused(deleteDoc(ref(h.a.founder, `users/${U.kid1}`)));
    await refused(setDoc(ref(h.a.verified, `users/${U.founder}`), make.userPointer(FAM_A, 'parent')));
  });

  test('the pointer cannot be deleted while the account is still in that family, and can afterwards', async () => {
    await refused(deleteDoc(ref(h.a.kid1, `users/${U.kid1}`)));
    await refused(deleteDoc(ref(h.a.parent2, `users/${U.parent2}`)));
    await allowed(deleteDoc(ref(h.a.kid1, A(`members/${U.kid1}`))));
    await allowed(deleteDoc(ref(h.a.kid1, `users/${U.kid1}`)));
  });

  test('a pointer that goes with a member record in the same batch is only accepted if that record is accepted', async () => {
    const stranger = h.a.verified;
    const batch = writeBatch(stranger.db);
    batch.set(ref(stranger, A(`members/${U.verified}`)), make.founderMember(U.verified));
    batch.set(ref(stranger, `users/${U.verified}`), make.userPointer(FAM_A, 'parent'));
    await refused(batch.commit());
    assert.equal(await h.peek(`users/${U.verified}`), undefined);
  });
});

describe('6.26 server time: a document that looks stored must have been stamped by the server', () => {
  beforeEach(() => h.reset());

  test('arranged documents keep their original times when other fields are updated', async () => {
    const before = await h.peek(A('children/c1/requests/r1'));
    await allowed(updateDoc(ref(parent(), A('children/c1/requests/r1')), make.answer(U.founder, 'approved')));
    const after = await h.peek(A('children/c1/requests/r1'));
    assert.ok(after.at.isEqual(before.at), 'the request time is untouched by the answer');
    assert.ok(after.resolvedAt.toMillis() > before.at.toMillis());
  });

  test('a write stamped with the server time is stored with the time the server processed it', async () => {
    const started = Date.now();
    await allowed(setDoc(ref(kid(), A('children/c1/messages/mTime')), make.message(U.kid1, 'child')));
    const savedAt = (await h.peek(A('children/c1/messages/mTime'))).at.toMillis();
    assert.ok(Math.abs(savedAt - started) < 60_000);
  });

  test('a batch cannot smuggle a client-made time past the check next to valid writes', async () => {
    const batch = writeBatch(kid().db);
    batch.set(ref(kid(), A('children/c1/messages/mGood')), make.message(U.kid1, 'child'));
    batch.set(ref(kid(), A('children/c1/messages/mBackdated')), make.message(U.kid1, 'child', { at: minutesAgo(600) }));
    await refused(batch.commit());
    assert.equal(await h.peek(A('children/c1/messages/mGood')), undefined, 'nothing of a refused batch is stored');
  });
});
