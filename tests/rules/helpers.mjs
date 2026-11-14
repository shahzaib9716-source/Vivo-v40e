// Shared set-up for the Firestore security-rules tests.
//
// What is in here:
//   * the connection to the Firestore emulator (never a real project),
//   * the people ("personas") the tests act as, each with the token Firebase Auth would really
//     issue for them,
//   * builders for every document exactly as the app writes it (server timestamps and all),
//   * a small arranged world (family A, family B, some pairing codes) written with the rules
//     switched off, so that each test can start from a known state,
//   * the flows of SPEC section 3 as functions that go THROUGH the rules,
//   * the catalogue of operations used for the "who may do what" matrix.
//
// The test files run one after the other (see "test:rules" in package.json): they share one
// emulator project, so they must not run at the same time.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  FieldValue,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

// ---- Emulator ---------------------------------------------------------------------------------

// HAVEN_RULES_PROJECT runs a file against another emulator project (rules and data are kept per
// project id), so that one file can be worked on while the suite runs elsewhere.
export const PROJECT_ID = process.env.HAVEN_RULES_PROJECT || 'demo-haven-rules';
// The rules under test. HAVEN_RULES_FILE points the suite at another file, which is how one
// checks that the tests notice a weakened rule (see tests/rules/README.md).
export const RULES_PATH = process.env.HAVEN_RULES_FILE || fileURLToPath(new URL('../../firestore.rules', import.meta.url));

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]', '::1'];

/** Where the Firestore emulator listens. `firebase emulators:exec` sets the variable itself. */
export function emulatorAddress() {
  const raw = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
  const cut = raw.lastIndexOf(':');
  const host = raw.slice(0, cut);
  const port = Number(raw.slice(cut + 1));
  if (!LOOPBACK.includes(host) || !Number.isInteger(port)) {
    throw new Error(`FIRESTORE_EMULATOR_HOST must point at an emulator on this machine, got "${raw}"`);
  }
  return { host, port };
}

export const OWNER_EMAIL = 'owner@example.com';

const OWNER_LIST = /function ownerEmails\(\) \{\s*return \[([^\]]*)\];\s*\}/;

/** The addresses listed in ownerEmails() in the rules file, as written there. */
export function ownerEmailsInRules(source = readFileSync(RULES_PATH, 'utf8')) {
  const found = OWNER_LIST.exec(source);
  if (!found) throw new Error('ownerEmails() was not found in the rules file in the form "return [ ... ];"');
  return found[1].split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => entry.replace(/^['"]|['"]$/g, ''));
}

/**
 * The rules under test: the file as it is, except that the owner list is replaced by the tests'
 * own address. The real list is edited before publishing; the tests must neither depend on a
 * real person's address nor contain one.
 */
export function readRules() {
  const source = readFileSync(RULES_PATH, 'utf8');
  ownerEmailsInRules(source); // fails loudly when the function has changed shape
  return source.replace(OWNER_LIST, `function ownerEmails() {\n      return ['${OWNER_EMAIL}'];\n    }`);
}

// ---- Personas ---------------------------------------------------------------------------------
// Tokens carry exactly what Firebase Auth issues (checked against the Auth emulator): an
// anonymous token has no email claims at all; a password account has email, email_verified and
// the "password" provider. Nobody but the founder persona holds a verified OWNER_EMAIL.

const anonymousToken = () => ({ provider_id: 'anonymous', firebase: { sign_in_provider: 'anonymous', identities: {} } });
const passwordToken = (email, verified) => ({
  email,
  email_verified: verified,
  firebase: { sign_in_provider: 'password', identities: { email: [email] } },
});

export const U = {
  founder: 'founderA',
  parent2: 'parentTwoA',
  kid1: 'kidMiaDevice',
  kid2: 'kidLeoDevice',
  parentB: 'parentOfB',
  kidB: 'kidDeviceB',
  anon: 'strangerAnon',
  verified: 'strangerVerified',
  unverified: 'strangerUnverified',
  impostor: 'impostorOwnerMail',
  claimer: 'claimerAnonDevice',
  joiner: 'joinerAnonDevice',
  joiner2: 'joinerTwoAnonDevice',
  joinerVerified: 'joinerVerifiedAcct',
  joinerUnverified: 'joinerUnverifiedAcct',
};

export const PERSONAS = [
  { key: 'founder', uid: U.founder, token: passwordToken(OWNER_EMAIL, true), label: 'founder (parent, family A)' },
  { key: 'parent2', uid: U.parent2, token: passwordToken('second.parent@example.org', true), label: 'second parent (family A)' },
  { key: 'kid1', uid: U.kid1, token: anonymousToken(), label: 'child device of c1 (family A)' },
  { key: 'kid2', uid: U.kid2, token: anonymousToken(), label: 'child device of c2 (family A)' },
  { key: 'none', uid: null, token: null, label: 'no token' },
  { key: 'anon', uid: U.anon, token: anonymousToken(), label: 'anonymous stranger' },
  { key: 'verified', uid: U.verified, token: passwordToken('stranger@example.net', true), label: 'verified stranger (not on the owner list)' },
  { key: 'unverified', uid: U.unverified, token: passwordToken('new.account@example.net', false), label: 'unverified stranger' },
  { key: 'impostor', uid: U.impostor, token: passwordToken(OWNER_EMAIL, false), label: 'unverified account using the owner email' },
  { key: 'parentB', uid: U.parentB, token: passwordToken('other.family@example.net', true), label: 'parent of family B' },
  { key: 'kidB', uid: U.kidB, token: anonymousToken(), label: 'child device of family B' },
  { key: 'claimer', uid: U.claimer, token: anonymousToken(), label: 'device that claimed a code but is not approved' },
  { key: 'joiner', uid: U.joiner, token: anonymousToken(), label: 'new anonymous device' },
  { key: 'joiner2', uid: U.joiner2, token: anonymousToken(), label: 'another new anonymous device' },
  { key: 'joinerVerified', uid: U.joinerVerified, token: passwordToken('grandma@example.org', true), label: 'new verified account' },
  { key: 'joinerUnverified', uid: U.joinerUnverified, token: passwordToken('uncle@example.org', false), label: 'new unverified account' },
];

export const PARENTS = ['founder', 'parent2'];
export const KIDS = ['kid1', 'kid2'];
export const MEMBERS = [...PARENTS, ...KIDS];
/** Signed in, but not in family A. */
export const OUTSIDERS = ['anon', 'verified', 'unverified', 'impostor', 'parentB', 'kidB', 'claimer'];

// ---- Ids ----------------------------------------------------------------------------------------

export const FAM_A = 'familyAaaaaaaaaaaaa1';
export const FAM_B = 'familyBbbbbbbbbbbbb1';

/** Pairing codes: 8 characters from ABCDEFGHJKMNPQRSTUVWXYZ23456789. */
export const CODES = {
  openChild: 'CHKDAAAA', // family A, for a child, nobody has claimed it
  openParent: 'PARENTAA', // family A, for a second parent, nobody has claimed it
  taken: 'TAKENAAA', // family A, for a child, claimed by the "claimer" persona, not approved
  bOpen: 'FAMBAAAA', // family B, for a child, nobody has claimed it
  fresh: 'NEWCD234', // not in the arranged world
  fresh2: 'NEWCD567',
  missing: 'ZZZZZZZZ', // never exists
};

// ---- Small helpers --------------------------------------------------------------------------------

// What the emulator database holds right now: 'arranged' (the world below), 'empty', or unknown;
// `dirty` says a test may have changed it since. One test file is one process with one harness,
// so this lives at module level. It lets a test skip putting the world back when nothing can
// have changed: a refused write changes nothing.
const database = { world: null, dirty: true };

/** The operation must succeed. (It may have changed the database.) */
export const allowed = (promise) => {
  database.dirty = true;
  return assertSucceeds(promise);
};
/** A read that must succeed. */
export const allowedRead = (promise) => assertSucceeds(promise);
/** The operation must fail with PERMISSION_DENIED; any other outcome fails the test. */
export const refused = async (promise) => {
  try {
    return await assertFails(promise);
  } catch (error) {
    database.dirty = true; // it went through, or failed for a reason that is a bug in the test
    throw error;
  }
};

export const minutesAgo = (n) => Timestamp.fromMillis(Date.now() - n * 60_000);
export const minutesAhead = (n) => Timestamp.fromMillis(Date.now() + n * 60_000);

export function omit(object, ...keys) {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
}

/** The document as it is stored once the server has replaced `serverTimestamp()`. */
export function stored(data, at = minutesAgo(5)) {
  const out = {};
  for (const [key, value] of Object.entries(data)) out[key] = value instanceof FieldValue ? at : value;
  return out;
}

export const A = (path = '') => `families/${FAM_A}${path ? '/' + path : ''}`;
export const B = (path = '') => `families/${FAM_B}${path ? '/' + path : ''}`;

/** First snapshot that really came from the server, as the sync engine waits for. */
export function firstServerSnapshot(target) {
  return new Promise((resolve, reject) => {
    const stop = onSnapshot(
      target,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;
        stop();
        resolve(snapshot);
      },
      (error) => reject(error),
    );
  });
}

/**
 * A running listener whose events can be awaited: `until(test)` resolves with the first event
 * (past or future) for which `test(event)` is true. An event is { snapshot } or { error }.
 */
export function watch(target) {
  const events = [];
  const waiting = [];
  const push = (event) => {
    events.push(event);
    for (const waiter of [...waiting]) {
      if (waiter.test(event)) {
        waiting.splice(waiting.indexOf(waiter), 1);
        waiter.resolve(event);
      }
    }
  };
  const stop = onSnapshot(target, { includeMetadataChanges: true }, (snapshot) => push({ snapshot }), (error) => push({ error }));
  return {
    events,
    stop,
    until(testEvent, ms = 5000) {
      const seen = events.find(testEvent);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const waiter = { test: testEvent, resolve };
        waiting.push(waiter);
        setTimeout(() => reject(new Error(`the listener saw no such event within ${ms} ms`)), ms).unref();
      });
    },
  };
}

export const ref = (actor, path) => doc(actor.db, path);
export const coll = (actor, path) => collection(actor.db, path);
/** The bounded "newest n" query the sync engine uses for requests, messages and alerts. */
export const newest = (actor, path, n) => query(collection(actor.db, path), orderBy('at', 'desc'), limit(n));

// ---- Documents as the app writes them ---------------------------------------------------------------
// Sample values mirror the seed data in src/state/store.tsx.

const apps = () => [
  { id: 'a1', name: 'Streamly', icon: 'play-circle', color: '#FF3B30', category: 'video', usedMin: 62, limitMin: 90, blocked: false },
  { id: 'a2', name: 'Chatter', icon: 'message-text', color: '#22C55E', category: 'messaging', usedMin: 40, limitMin: null, blocked: false },
  { id: 'a3', name: 'Photogram', icon: 'camera', color: '#E1306C', category: 'social', usedMin: 35, limitMin: 45, blocked: false },
  { id: 'a4', name: 'PuzzleQuest', icon: 'puzzle', color: '#8B5CF6', category: 'games', usedMin: 28, limitMin: 60, blocked: false },
  { id: 'a5', name: 'SchoolHub', icon: 'school', color: '#2E8BFF', category: 'education', usedMin: 25, limitMin: null, blocked: false },
  { id: 'a6', name: 'BeatBox', icon: 'music', color: '#F5A623', category: 'music', usedMin: 18, limitMin: null, blocked: false },
  { id: 'a7', name: 'Voxel Arena', icon: 'gamepad-variant', color: '#12B5A6', category: 'games', usedMin: 15, limitMin: 30, blocked: true },
  { id: 'a8', name: 'Canvas', icon: 'palette', color: '#EC4899', category: 'creativity', usedMin: 12, limitMin: null, blocked: false },
  { id: 'a9', name: 'Web', icon: 'web', color: '#F5862B', category: 'web', usedMin: 22, limitMin: null, blocked: false },
];

/** The app list with Photogram blocked: what "block an app" writes into children/{cid}.apps. */
export const blockedApps = () => apps().map((app) => (app.id === 'a3' ? { ...app, blocked: true } : app));
export const sampleApps = apps;

const ALL_DAYS = [true, true, true, true, true, true, true];
const WEEKDAYS = [true, true, true, true, true, false, false];

export const SEED = {
  places: [
    ['p1', { name: 'Home', icon: 'home', radius: 150, arrive: true, leave: true, ord: 0 }],
    ['p2', { name: 'School', icon: 'school', radius: 200, arrive: true, leave: true, ord: 1 }],
    ['p3', { name: "Grandma's", icon: 'account-heart', radius: 120, arrive: true, leave: false, ord: 2 }],
  ],
  schedules: [
    ['s1', { name: 'Bedtime', icon: 'moon', color: '#5B51E0', start: '9:00 PM', end: '7:00 AM', days: ALL_DAYS, on: true, ord: 0 }],
    ['s2', { name: 'School hours', icon: 'book', color: '#2E8BFF', start: '8:30 AM', end: '3:00 PM', days: WEEKDAYS, on: true, ord: 1 }],
    ['s3', { name: 'Dinner & downtime', icon: 'coffee', color: '#FF7A59', start: '6:00 PM', end: '7:00 PM', days: ALL_DAYS, on: false, ord: 2 }],
    ['s4', { name: 'Homework focus', icon: 'edit-3', color: '#12B5A6', start: '4:00 PM', end: '5:30 PM', days: WEEKDAYS, on: true, ord: 3 }],
  ],
  tasks: [
    ['t1', { title: 'Finish homework', points: 20, done: true, ord: 0 }],
    ['t2', { title: 'Tidy your room', points: 15, done: false, ord: 1 }],
    ['t3', { title: 'Read for 20 minutes', points: 25, done: false, ord: 2 }],
    ['t4', { title: 'Help with dinner', points: 10, done: false, ord: 3 }],
  ],
  sites: [
    ['w1', { host: 'chatroulette.example', list: 'blocked', ord: 0 }],
    ['w2', { host: 'freebets.example', list: 'blocked', ord: 1 }],
    ['w3', { host: 'shockvideos.example', list: 'blocked', ord: 2 }],
    ['w4', { host: 'schoolportal.example', list: 'allowed', ord: 3 }],
    ['w5', { host: 'kidsencyclopedia.example', list: 'allowed', ord: 4 }],
    ['w6', { host: 'mathpractice.example', list: 'allowed', ord: 5 }],
  ],
};

export const make = {
  family: (uid, over = {}) => ({ v: 2, owner: uid, name: 'Carter family', createdAt: serverTimestamp(), ...over }),
  founderMember: (uid, over = {}) => ({
    role: 'parent', childId: null, name: "Dad's iPhone", platform: 'ios', joinedAt: serverTimestamp(), addedBy: uid, code: null, ...over,
  }),
  /** The record a parent writes when approving a claim. */
  member: (parentUid, code, claim, role, childId, over = {}) => ({
    role, childId, name: claim.name, platform: claim.platform, joinedAt: serverTimestamp(), addedBy: parentUid, code, ...over,
  }),
  userPointer: (fid, role, over = {}) => ({ familyId: fid, role, updatedAt: serverTimestamp(), ...over }),
  pairing: (fid, uid, role = 'child', over = {}) => ({
    familyId: fid, role, createdBy: uid, createdAt: serverTimestamp(), expiresAt: minutesAhead(15),
    claimedBy: null, claimName: null, claimPlatform: null, claimedAt: null, approved: false, ...over,
  }),
  claim: (uid, over = {}) => ({ claimedBy: uid, claimName: 'Vivo V40e', claimPlatform: 'android', claimedAt: serverTimestamp(), ...over }),
  device: (uid, over = {}) => ({ uid, name: 'Vivo V40e', platform: 'android', lastSeenAt: serverTimestamp(), ...over }),
  child: (over = {}) => ({
    name: 'Mia Carter', age: 11, deviceName: '', battery: 72, online: true, bedtime: false, usedMin: 168, limitMin: 240,
    place: 'School', placeIcon: 'school', apps: apps(), weekly: [180, 210, 160, 240, 168, 95, 120], ord: 0, ...over,
  }),
  liveStatus: (uid, over = {}) => ({ checkInAt: serverTimestamp(), by: uid, ...over }),
  request: (uid, over = {}) => ({
    kind: 'extra_time', label: '30 more minutes', detail: 'Mia asked for extra screen time', minutes: 30,
    status: 'pending', at: serverTimestamp(), by: uid, ...over,
  }),
  unlockRequest: (uid, over = {}) => ({
    kind: 'unlock_app', label: 'Unlock Voxel Arena', detail: 'Mia wants to open a blocked app', appId: 'a7',
    status: 'pending', at: serverTimestamp(), by: uid, ...over,
  }),
  answer: (uid, status = 'approved', over = {}) => ({ status, resolvedBy: uid, resolvedAt: serverTimestamp(), ...over }),
  message: (uid, from, over = {}) => ({ from, text: 'Be home by 6 for dinner.', at: serverTimestamp(), by: uid, ...over }),
  alert: (uid, kind, childId, over = {}) => ({
    kind, childId, icon: 'map-pin', color: '#2E8BFF', title: 'Mia checked in', body: '4:12 PM', unread: true,
    at: serverTimestamp(), by: uid, ...over,
  }),
  place: (over = {}) => ({ name: 'Swimming pool', icon: 'swim', radius: 180, arrive: true, leave: false, ord: 1731580000000, ...over }),
  schedule: (over = {}) => ({
    name: 'Screen-free Sunday', icon: 'sun', color: '#FF7A59', start: '10:00 AM', end: '12:00 PM',
    days: [false, false, false, false, false, false, true], on: true, ord: 1731580000001, ...over,
  }),
  site: (over = {}) => ({ host: 'videos.example', list: 'blocked', ord: 1731580000002, ...over }),
  task: (over = {}) => ({ title: 'Walk the dog', points: 15, done: false, ord: 1731580000003, ...over }),
  sos: (uid, active, childId, over = {}) => ({ active, childId, by: uid, at: serverTimestamp(), ...over }),
};

// ---- The arranged world -----------------------------------------------------------------------------
// Written with the rules switched off. Every document has the shape the rules would have
// accepted from the app (the builders above), with the server times filled in.

export function worldDocs() {
  const docs = {};
  const put = (path, data, at) => { docs[path] = stored(data, at); };

  // accounts
  put(`users/${U.founder}`, make.userPointer(FAM_A, 'parent'));
  put(`users/${U.parent2}`, make.userPointer(FAM_A, 'parent'));
  put(`users/${U.kid1}`, make.userPointer(FAM_A, 'child'));
  put(`users/${U.kid2}`, make.userPointer(FAM_A, 'child'));
  put(`users/${U.parentB}`, make.userPointer(FAM_B, 'parent'));
  put(`users/${U.kidB}`, make.userPointer(FAM_B, 'child'));

  // family A
  put(A(), make.family(U.founder), minutesAgo(600));
  put(A(`members/${U.founder}`), make.founderMember(U.founder), minutesAgo(600));
  put(A(`members/${U.parent2}`), make.member(U.founder, 'XSEDPAR2', { name: "Mum's iPhone", platform: 'ios' }, 'parent', null), minutesAgo(500));
  put(A(`members/${U.kid1}`), make.member(U.founder, 'XSEDKD22', { name: 'Vivo V40e', platform: 'android' }, 'child', 'c1'), minutesAgo(400));
  put(A(`members/${U.kid2}`), make.member(U.parent2, 'XSEDKD33', { name: "Leo's Phone", platform: 'android' }, 'child', 'c2'), minutesAgo(300));
  put(A('devices/devFounder'), make.device(U.founder, { name: "Dad's iPhone", platform: 'ios' }));
  put(A('devices/devParent2'), make.device(U.parent2, { name: "Mum's iPhone", platform: 'ios' }));
  put(A('devices/devKid1'), make.device(U.kid1));
  put(A('devices/devKid2'), make.device(U.kid2, { name: "Leo's Phone" }));
  put(A('children/c1'), make.child({ deviceName: 'Vivo V40e' }));
  put(A('children/c2'), make.child({ name: 'Leo Carter', age: 8, deviceName: "Leo's Phone", battery: 44, usedMin: 96, limitMin: 150, place: 'Home', placeIcon: 'home', ord: 1 }));
  put(A('children/c1/live/status'), make.liveStatus(U.kid1));
  put(A('children/c2/live/status'), make.liveStatus(U.kid2));
  put(A('children/c1/requests/r1'), make.request(U.kid1), minutesAgo(5));
  put(A('children/c1/requests/r3'), { ...stored(make.request(U.kid1, { label: '15 more minutes', minutes: 15 }), minutesAgo(90)), ...stored(make.answer(U.founder, 'approved'), minutesAgo(80)) });
  put(A('children/c2/requests/r2'), make.unlockRequest(U.kid2, { detail: 'Leo wants to open a blocked app' }), minutesAgo(20));
  put(A('children/c1/messages/m1'), make.message(U.founder, 'parent', { text: 'Have a great day at school!' }), minutesAgo(300));
  put(A('children/c1/messages/m2'), make.message(U.kid1, 'child', { text: "Thanks! Can I go to Alex's after school?" }), minutesAgo(200));
  put(A('children/c1/messages/m3'), make.message(U.parent2, 'parent', { text: 'Yes, be home by 6 for dinner.' }), minutesAgo(190));
  put(A('children/c2/messages/m4'), make.message(U.founder, 'parent', { text: 'Homework first, then games' }), minutesAgo(100));
  put(A('alerts/n1'), make.alert(U.founder, 'geofence', 'c1', { title: 'Mia arrived at School', body: 'Geofence · 8:42 AM' }), minutesAgo(60));
  put(A('alerts/n2'), make.alert(U.kid1, 'checkin', 'c1'), minutesAgo(30));
  put(A('alerts/n3'), make.alert(U.founder, 'report', null, { icon: 'shield', color: '#16B981', title: 'Weekly report is ready', body: 'Screen time down 12% this week', unread: false }), minutesAgo(1500));
  for (const [id, data] of SEED.places) put(A(`places/${id}`), data);
  for (const [id, data] of SEED.schedules) put(A(`schedules/${id}`), data);
  for (const [id, data] of SEED.sites) put(A(`sites/${id}`), data);
  for (const [id, data] of SEED.tasks) put(A(`tasks/${id}`), data);
  put(A('signals/sos'), make.sos(U.kid1, true, 'c1'), minutesAgo(2));

  // pairing codes of family A
  put(`pairing/${CODES.openChild}`, make.pairing(FAM_A, U.founder, 'child'), minutesAgo(1));
  put(`pairing/${CODES.openParent}`, make.pairing(FAM_A, U.founder, 'parent'), minutesAgo(1));
  put(`pairing/${CODES.taken}`, { ...stored(make.pairing(FAM_A, U.founder, 'child'), minutesAgo(2)), ...stored(make.claim(U.claimer, { claimName: 'Pixel 9' }), minutesAgo(1)) });

  // family B (its founder is not on this project's owner list: arranged, not created through the rules)
  put(`families/${FAM_B}`, make.family(U.parentB, { name: 'Family B' }), minutesAgo(900));
  put(B(`members/${U.parentB}`), make.founderMember(U.parentB, { name: 'Galaxy S25', platform: 'android' }), minutesAgo(900));
  put(B(`members/${U.kidB}`), make.member(U.parentB, 'XSEDKDBB', { name: 'iPad', platform: 'ios' }, 'child', 'cb1'), minutesAgo(800));
  put(B('devices/devParentB'), make.device(U.parentB, { name: 'Galaxy S25' }));
  put(B('devices/devKidB'), make.device(U.kidB, { name: 'iPad', platform: 'ios' }));
  put(B('children/cb1'), make.child({ name: 'Noor', age: 9, deviceName: 'iPad' }));
  put(B('children/cb1/live/status'), make.liveStatus(U.kidB));
  put(B('children/cb1/requests/rb1'), make.request(U.kidB, { detail: 'Noor asked for extra screen time' }));
  put(B('children/cb1/messages/mb1'), make.message(U.parentB, 'parent'));
  put(B('alerts/nb1'), make.alert(U.kidB, 'checkin', 'cb1', { title: 'Noor checked in' }));
  put(B('places/pb1'), make.place({ name: 'Home', ord: 0 }));
  put(B('schedules/sb1'), make.schedule({ ord: 0 }));
  put(B('sites/wb1'), make.site({ ord: 0 }));
  put(B('tasks/tb1'), make.task({ ord: 0 }));
  put(B('signals/sos'), make.sos(U.parentB, false, null));
  put(`pairing/${CODES.bOpen}`, make.pairing(FAM_B, U.parentB, 'child'), minutesAgo(1));

  return docs;
}

// ---- Harness ----------------------------------------------------------------------------------------

/**
 * One per test file. `start()` loads firestore.rules into the emulator for PROJECT_ID and signs
 * every persona in; `reset()` puts the arranged world back; `empty()` leaves the database empty.
 */
export function harness() {
  const h = { env: null, a: {} };

  h.start = async (rules = readRules()) => {
    setLogLevel('error'); // refused writes are expected here; do not print each one
    const { host, port } = emulatorAddress();
    h.env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port, rules } });
    for (const persona of PERSONAS) {
      const context = persona.token === null ? h.env.unauthenticatedContext() : h.env.authenticatedContext(persona.uid, persona.token);
      h.a[persona.key] = { key: persona.key, label: persona.label, uid: persona.uid, selfId: persona.uid ?? 'noAccount', db: context.firestore() };
    }
  };

  /** Runs `fn(db)` with the rules switched off. For arranging state only. */
  h.admin = (fn) => h.env.withSecurityRulesDisabled((context) => fn(context.firestore()));

  /** Writes (or, with null, deletes) documents with the rules switched off. */
  h.arrange = (docs) =>
    h.admin(async (db) => {
      database.dirty = true;
      const batch = writeBatch(db);
      for (const [path, data] of Object.entries(docs)) {
        if (data === null) batch.delete(doc(db, path));
        else batch.set(doc(db, path), data);
      }
      await batch.commit();
    });

  /** Reads a document with the rules switched off: `undefined` when it does not exist. */
  h.peek = async (path) => {
    let data;
    await h.admin(async (db) => { data = (await getDoc(doc(db, path))).data(); });
    return data;
  };

  // After empty() or reset() the database counts as "possibly changed": most tests write to it
  // freely. Only tests that start with ensure() rely on the bookkeeping, and all their writes
  // go through allowed()/refused().
  h.empty = async () => {
    await h.env.clearFirestore();
    database.world = 'empty';
    database.dirty = true;
  };

  h.reset = async () => {
    await h.env.clearFirestore();
    await h.arrange(worldDocs());
    database.world = 'arranged';
    database.dirty = true;
  };

  /** Puts the database into the given state unless it is known to be in it already. */
  h.ensure = async (world = 'arranged') => {
    if (!database.dirty && database.world === world) return;
    await (world === 'empty' ? h.empty() : h.reset());
    database.dirty = false;
  };

  h.stop = async () => {
    if (h.env) await h.env.cleanup();
  };

  return h;
}

// ---- The flows of SPEC section 3, through the rules ----------------------------------------------------

export const flows = {
  /**
   * 3.1 step 2: family, the founder's member record and users pointer in one batch.
   * `docs` replaces any of the three documents (for tests that send a wrong one).
   */
  createFamily(actor, fid, docs = {}) {
    const batch = writeBatch(actor.db);
    batch.set(doc(actor.db, 'families', fid), docs.family ?? make.family(actor.selfId));
    batch.set(doc(actor.db, 'families', fid, 'members', actor.selfId), docs.member ?? make.founderMember(actor.selfId));
    batch.set(doc(actor.db, 'users', actor.selfId), docs.user ?? make.userPointer(fid, 'parent'));
    return batch.commit();
  },

  /** 3.1 step 3: one child, the seed places, schedules and tasks. No sites, no SOS document. */
  seedWrites(actor, fid, childId = 'c1', childName = 'Mia Carter') {
    const writes = [[`families/${fid}/children/${childId}`, make.child({ name: childName, deviceName: '', ord: 0 })]];
    for (const [id, data] of SEED.places) writes.push([`families/${fid}/places/${id}`, data]);
    for (const [id, data] of SEED.schedules) writes.push([`families/${fid}/schedules/${id}`, data]);
    for (const [id, data] of SEED.tasks) writes.push([`families/${fid}/tasks/${id}`, data]);
    return writes;
  },
  seed(actor, fid, childId, childName) {
    const batch = writeBatch(actor.db);
    for (const [path, data] of flows.seedWrites(actor, fid, childId, childName)) batch.set(doc(actor.db, path), data);
    return batch.commit();
  },

  /** 3.2 step 1 */
  createCode(actor, fid, code, role = 'child', over = {}) {
    return setDoc(doc(actor.db, 'pairing', code), make.pairing(fid, actor.selfId, role, over));
  },

  /** 3.2 step 2: a blind update; the device cannot read the code first. */
  claim(actor, code, over = {}) {
    return updateDoc(doc(actor.db, 'pairing', code), make.claim(actor.selfId, over));
  },

  /**
   * 3.2 step 3. `target` is { childId } for an existing child, { newChild: { id, name } } for a new
   * one, or null for a parent code. `claim` = { uid, name, platform } as read from the code.
   */
  approveBatch(actor, fid, code, claim, target, over = {}) {
    const batch = writeBatch(actor.db);
    let childId = null;
    if (target && target.newChild) {
      childId = target.newChild.id;
      batch.set(doc(actor.db, 'families', fid, 'children', childId), make.child({ name: target.newChild.name, deviceName: claim.name, ord: Date.now() }));
    } else if (target) {
      childId = target.childId;
      batch.update(doc(actor.db, 'families', fid, 'children', childId), { deviceName: claim.name });
    }
    const role = target ? 'child' : 'parent';
    batch.set(doc(actor.db, 'families', fid, 'members', claim.uid), make.member(actor.selfId, code, claim, role, childId, over.member));
    batch.update(doc(actor.db, 'pairing', code), { approved: true });
    return batch;
  },
  approve(actor, fid, code, claim, target, over) {
    return flows.approveBatch(actor, fid, code, claim, target, over).commit();
  },

  /** 3.2 step 4, the joining device: read the approved code, write users/{uid}, tidy the code away. */
  async finishJoin(actor, code, role = 'child') {
    const snapshot = await getDoc(doc(actor.db, 'pairing', code));
    const { familyId, approved } = snapshot.data();
    if (approved !== true) throw new Error('the code is not approved yet');
    await setDoc(doc(actor.db, 'users', actor.selfId), make.userPointer(familyId, role));
    await deleteDoc(doc(actor.db, 'pairing', code));
    return familyId;
  },
};

/** What the claimer wrote, as the approving parent reads it from the code. */
export const claimOf = (actor, over = {}) => ({ uid: actor.selfId, name: 'Vivo V40e', platform: 'android', ...over });

// ---- Who may do what: the operation catalogue ---------------------------------------------------------
// Every operation is written the way its rightful actor would issue it against family A in the
// arranged world ("by" is the caller, times are server times), so when it is refused for someone
// else the reason is who they are, not a malformed request. `allow` lists the personas for whom
// it must succeed; for every other persona it must be refused.

const op = (name, kind, allow, run) => ({ name, kind, allow, run });
const at = ref;
const col = coll;

export const OPS = [
  // users
  op('read the founder\'s users document', 'read', ['founder'], (a) => getDoc(at(a, `users/${U.founder}`))),
  op('read the users document of the child device of c1', 'read', ['kid1'], (a) => getDoc(at(a, `users/${U.kid1}`))),
  op('read their own users document', 'read', [...MEMBERS, ...OUTSIDERS], (a) => getDoc(at(a, `users/${a.selfId}`))),
  op('list users', 'read', [], (a) => getDocs(col(a, 'users'))),
  op('query users by family', 'read', [], (a) => getDocs(query(col(a, 'users'), where('familyId', '==', FAM_A)))),
  op('point their own users document at family A as a parent', 'write', PARENTS, (a) => setDoc(at(a, `users/${a.selfId}`), make.userPointer(FAM_A, 'parent'))),
  op('point their own users document at family A as a child', 'write', KIDS, (a) => setDoc(at(a, `users/${a.selfId}`), make.userPointer(FAM_A, 'child'))),
  op('overwrite the founder\'s users document', 'write', ['founder'], (a) => setDoc(at(a, `users/${U.founder}`), make.userPointer(FAM_A, 'parent'))),
  op('delete the founder\'s users document', 'write', [], (a) => deleteDoc(at(a, `users/${U.founder}`))),
  op('delete the users document of the child device of c1', 'write', [], (a) => deleteDoc(at(a, `users/${U.kid1}`))),
  op('delete their own users document (not having left any family)', 'write', [], (a) => deleteDoc(at(a, `users/${a.selfId}`))),

  // pairing
  op('read an unclaimed pairing code of family A', 'read', PARENTS, (a) => getDoc(at(a, `pairing/${CODES.openChild}`))),
  op('read a claimed pairing code of family A', 'read', [...PARENTS, 'claimer'], (a) => getDoc(at(a, `pairing/${CODES.taken}`))),
  op('read a pairing code that does not exist', 'read', [], (a) => getDoc(at(a, `pairing/${CODES.missing}`))),
  op('list pairing codes', 'read', [], (a) => getDocs(col(a, 'pairing'))),
  op('query pairing codes of family A', 'read', [], (a) => getDocs(query(col(a, 'pairing'), where('familyId', '==', FAM_A)))),
  op('query pairing codes they claimed', 'read', [], (a) => getDocs(query(col(a, 'pairing'), where('claimedBy', '==', a.selfId)))),
  op('create a pairing code for family A', 'write', PARENTS, (a) => setDoc(at(a, `pairing/${CODES.fresh}`), make.pairing(FAM_A, a.selfId, 'child'))),
  op('create a parent pairing code for family A', 'write', PARENTS, (a) => setDoc(at(a, `pairing/${CODES.fresh}`), make.pairing(FAM_A, a.selfId, 'parent'))),
  op('claim an unclaimed child code of family A', 'write', OUTSIDERS, (a) => updateDoc(at(a, `pairing/${CODES.openChild}`), make.claim(a.selfId))),
  op('claim an unclaimed parent code of family A', 'write', ['verified', 'parentB'], (a) => updateDoc(at(a, `pairing/${CODES.openParent}`), make.claim(a.selfId))),
  op('claim a code somebody else already claimed', 'write', [], (a) => updateDoc(at(a, `pairing/${CODES.taken}`), make.claim(a.selfId))),
  op('approve a claimed code without enrolling anyone', 'write', [], (a) => updateDoc(at(a, `pairing/${CODES.taken}`), { approved: true })),
  op('extend the expiry of a pairing code', 'write', [], (a) => updateDoc(at(a, `pairing/${CODES.openChild}`), { expiresAt: minutesAhead(14) })),
  op('replace a pairing code of family A with their own', 'write', [], (a) => setDoc(at(a, `pairing/${CODES.openChild}`), make.pairing(FAM_A, a.selfId, 'parent'))),
  op('delete an unclaimed pairing code of family A', 'write', PARENTS, (a) => deleteDoc(at(a, `pairing/${CODES.openChild}`))),
  op('delete a claimed pairing code of family A', 'write', [...PARENTS, 'claimer'], (a) => deleteDoc(at(a, `pairing/${CODES.taken}`))),

  // the family document
  op('read the family document', 'read', MEMBERS, (a) => getDoc(at(a, A()))),
  op('list families', 'read', [], (a) => getDocs(col(a, 'families'))),
  op('query families by owner', 'read', [], (a) => getDocs(query(col(a, 'families'), where('owner', '==', U.founder)))),
  op('rename the family', 'write', PARENTS, (a) => updateDoc(at(a, A()), { name: 'The Carters' })),
  op('hand the family to another owner', 'write', [], (a) => updateDoc(at(a, A()), { owner: a.key === 'founder' ? U.parent2 : a.selfId })),
  op('delete the family', 'write', [], (a) => deleteDoc(at(a, A()))),
  op('create a family of their own (the complete batch)', 'write', [], (a) => flows.createFamily(a, `ownFamily${a.key}`)),
  op('create a bare family document', 'write', [], (a) => setDoc(at(a, `families/bareFamily${a.key}`), make.family(a.selfId))),

  // members
  op('read the founder\'s member record', 'read', MEMBERS, (a) => getDoc(at(a, A(`members/${U.founder}`)))),
  op('read a child device\'s member record', 'read', MEMBERS, (a) => getDoc(at(a, A(`members/${U.kid1}`)))),
  op('list members', 'read', MEMBERS, (a) => getDocs(col(a, A('members')))),
  op('write a member record for themselves as a parent', 'write', [], (a) => setDoc(at(a, A(`members/${a.selfId}`)), make.founderMember(a.selfId))),
  op('write a member record for themselves as the child device of c1', 'write', [], (a) =>
    setDoc(at(a, A(`members/${a.selfId}`)), make.member(a.selfId, CODES.openChild, { name: 'Vivo V40e', platform: 'android' }, 'child', 'c1'))),
  op('write a member record for a made-up account', 'write', [], (a) =>
    setDoc(at(a, A('members/madeUpAccount')), make.member(a.selfId, CODES.taken, { name: 'Pixel 9', platform: 'android' }, 'parent', null))),
  op('relabel the child device of c1', 'write', PARENTS, (a) => updateDoc(at(a, A(`members/${U.kid1}`)), { name: "Mia's phone" })),
  op('point the child device of c1 at child c2', 'write', PARENTS, (a) => updateDoc(at(a, A(`members/${U.kid1}`)), { childId: 'c2' })),
  op('turn the child device of c1 into a parent', 'write', [], (a) => updateDoc(at(a, A(`members/${U.kid1}`)), { role: 'parent', childId: null })),
  op('remove the child device of c1 from the family', 'write', [...PARENTS, 'kid1'], (a) => deleteDoc(at(a, A(`members/${U.kid1}`)))),
  op('remove the second parent from the family', 'write', PARENTS, (a) => deleteDoc(at(a, A(`members/${U.parent2}`)))),
  op('remove the founder from the family', 'write', [], (a) => deleteDoc(at(a, A(`members/${U.founder}`)))),
  op('delete a member record under their own uid', 'write', ['parent2', 'kid1', 'kid2'], (a) => deleteDoc(at(a, A(`members/${a.selfId}`)))),

  // devices (presence)
  op('read a device record', 'read', MEMBERS, (a) => getDoc(at(a, A('devices/devFounder')))),
  op('list devices', 'read', MEMBERS, (a) => getDocs(col(a, A('devices')))),
  op('report presence under a new device id', 'write', MEMBERS, (a) => setDoc(at(a, A(`devices/dev-${a.key}`)), make.device(a.selfId))),
  op('take over the founder\'s device record', 'write', ['founder'], (a) => setDoc(at(a, A('devices/devFounder')), make.device(a.selfId))),
  op('take over the device record of the child device of c1', 'write', ['kid1'], (a) => setDoc(at(a, A('devices/devKid1')), make.device(a.selfId))),
  op('delete the device record of the child device of c1', 'write', [...PARENTS, 'kid1'], (a) => deleteDoc(at(a, A('devices/devKid1')))),
  op('delete the founder\'s device record', 'write', PARENTS, (a) => deleteDoc(at(a, A('devices/devFounder')))),

  // children
  op('read the profile of child c1', 'read', [...PARENTS, 'kid1'], (a) => getDoc(at(a, A('children/c1')))),
  op('read the profile of child c2', 'read', [...PARENTS, 'kid2'], (a) => getDoc(at(a, A('children/c2')))),
  op('list children', 'read', PARENTS, (a) => getDocs(col(a, A('children')))),
  op('add a child profile', 'write', PARENTS, (a) => setDoc(at(a, A('children/cNew')), make.child({ name: 'Zoe Carter', age: 5, ord: 2 }))),
  op('change the daily limit of child c1', 'write', PARENTS, (a) => updateDoc(at(a, A('children/c1')), { limitMin: 600 })),
  op('pause the device of child c1', 'write', PARENTS, (a) => updateDoc(at(a, A('children/c1')), { bedtime: true })),
  op('change the app rules of child c1', 'write', PARENTS, (a) => updateDoc(at(a, A('children/c1')), { apps: blockedApps() })),
  op('rename child c1', 'write', PARENTS, (a) => updateDoc(at(a, A('children/c1')), { name: 'Mia C.' })),
  op('change the daily limit of child c2', 'write', PARENTS, (a) => updateDoc(at(a, A('children/c2')), { limitMin: 600 })),
  op('delete the profile of child c1', 'write', [], (a) => deleteDoc(at(a, A('children/c1')))),

  // live status (check-in)
  op('read the check-in status of child c1', 'read', [...PARENTS, 'kid1'], (a) => getDoc(at(a, A('children/c1/live/status')))),
  op('read the check-in status of child c2', 'read', [...PARENTS, 'kid2'], (a) => getDoc(at(a, A('children/c2/live/status')))),
  op('list the live documents of child c1', 'read', [...PARENTS, 'kid1'], (a) => getDocs(col(a, A('children/c1/live')))),
  op('check in as child c1', 'write', ['kid1'], (a) => setDoc(at(a, A('children/c1/live/status')), make.liveStatus(a.selfId))),
  op('check in as child c2', 'write', ['kid2'], (a) => setDoc(at(a, A('children/c2/live/status')), make.liveStatus(a.selfId))),
  op('write another live document of child c1', 'write', [], (a) => setDoc(at(a, A('children/c1/live/location')), make.liveStatus(a.selfId))),
  op('delete the check-in status of child c1', 'write', [], (a) => deleteDoc(at(a, A('children/c1/live/status')))),

  // requests
  op('read a request of child c1', 'read', [...PARENTS, 'kid1'], (a) => getDoc(at(a, A('children/c1/requests/r1')))),
  op('list the newest requests of child c1', 'read', [...PARENTS, 'kid1'], (a) => getDocs(newest(a, A('children/c1/requests'), 100))),
  op('list the newest requests of child c2', 'read', [...PARENTS, 'kid2'], (a) => getDocs(newest(a, A('children/c2/requests'), 100))),
  op('ask for more time as child c1', 'write', ['kid1'], (a) => setDoc(at(a, A('children/c1/requests/rNew')), make.request(a.selfId))),
  op('ask for more time as child c2', 'write', ['kid2'], (a) => setDoc(at(a, A('children/c2/requests/rNew')), make.request(a.selfId))),
  op('approve a request of child c1', 'write', PARENTS, (a) => updateDoc(at(a, A('children/c1/requests/r1')), make.answer(a.selfId, 'approved'))),
  op('deny a request of child c1', 'write', PARENTS, (a) => updateDoc(at(a, A('children/c1/requests/r1')), make.answer(a.selfId, 'denied'))),
  op('delete a request of child c1', 'write', PARENTS, (a) => deleteDoc(at(a, A('children/c1/requests/r1')))),

  // messages
  op('read a message in the thread of child c1', 'read', [...PARENTS, 'kid1'], (a) => getDoc(at(a, A('children/c1/messages/m1')))),
  op('list the newest messages of child c1', 'read', [...PARENTS, 'kid1'], (a) => getDocs(newest(a, A('children/c1/messages'), 300))),
  op('list the newest messages of child c2', 'read', [...PARENTS, 'kid2'], (a) => getDocs(newest(a, A('children/c2/messages'), 300))),
  op('send a message as a parent into the thread of child c1', 'write', PARENTS, (a) => setDoc(at(a, A('children/c1/messages/mNew')), make.message(a.selfId, 'parent'))),
  op('send a message as the child into the thread of child c1', 'write', ['kid1'], (a) => setDoc(at(a, A('children/c1/messages/mNew')), make.message(a.selfId, 'child'))),
  op('send a message as the child into the thread of child c2', 'write', ['kid2'], (a) => setDoc(at(a, A('children/c2/messages/mNew')), make.message(a.selfId, 'child'))),
  op('edit a message', 'write', [], (a) => updateDoc(at(a, A('children/c1/messages/m2')), { text: 'edited' })),
  op('delete a message', 'write', [], (a) => deleteDoc(at(a, A('children/c1/messages/m2')))),

  // alerts
  op('read an alert', 'read', PARENTS, (a) => getDoc(at(a, A('alerts/n1')))),
  op('list the newest alerts', 'read', PARENTS, (a) => getDocs(newest(a, A('alerts'), 200))),
  op('add a check-in alert about child c1', 'write', [...PARENTS, 'kid1'], (a) => setDoc(at(a, A('alerts/nNew')), make.alert(a.selfId, 'checkin', 'c1'))),
  op('add an SOS alert about child c2', 'write', [...PARENTS, 'kid2'], (a) => setDoc(at(a, A('alerts/nNew')), make.alert(a.selfId, 'sos', 'c2', { title: 'SOS from Leo' }))),
  op('add a parent-only kind of alert about child c1', 'write', PARENTS, (a) => setDoc(at(a, A('alerts/nNew')), make.alert(a.selfId, 'limit', 'c1', { title: 'Limit reached' }))),
  op('add an alert about nobody in particular', 'write', PARENTS, (a) => setDoc(at(a, A('alerts/nNew')), make.alert(a.selfId, 'report', null, { title: 'Weekly report is ready' }))),
  op('mark an alert as read', 'write', PARENTS, (a) => updateDoc(at(a, A('alerts/n1')), { unread: false })),
  op('rewrite the title of an alert', 'write', [], (a) => updateDoc(at(a, A('alerts/n1')), { title: 'Nothing happened' })),
  op('delete an alert', 'write', PARENTS, (a) => deleteDoc(at(a, A('alerts/n2')))),

  // places, schedules, sites
  op('read a place', 'read', MEMBERS, (a) => getDoc(at(a, A('places/p1')))),
  op('list places', 'read', MEMBERS, (a) => getDocs(col(a, A('places')))),
  op('add a place', 'write', PARENTS, (a) => setDoc(at(a, A('places/pNew')), make.place())),
  op('change a place', 'write', PARENTS, (a) => updateDoc(at(a, A('places/p1')), { arrive: false })),
  op('delete a place', 'write', PARENTS, (a) => deleteDoc(at(a, A('places/p1')))),
  op('read a schedule', 'read', MEMBERS, (a) => getDoc(at(a, A('schedules/s1')))),
  op('list schedules', 'read', MEMBERS, (a) => getDocs(col(a, A('schedules')))),
  op('add a schedule', 'write', PARENTS, (a) => setDoc(at(a, A('schedules/sNew')), make.schedule())),
  op('switch a schedule off', 'write', PARENTS, (a) => updateDoc(at(a, A('schedules/s1')), { on: false })),
  op('delete a schedule', 'write', PARENTS, (a) => deleteDoc(at(a, A('schedules/s1')))),
  op('read a site rule', 'read', MEMBERS, (a) => getDoc(at(a, A('sites/w1')))),
  op('list site rules', 'read', MEMBERS, (a) => getDocs(col(a, A('sites')))),
  op('add a site rule', 'write', PARENTS, (a) => setDoc(at(a, A('sites/wNew')), make.site())),
  op('move a blocked site to the allowed list', 'write', PARENTS, (a) => updateDoc(at(a, A('sites/w1')), { list: 'allowed' })),
  op('delete a site rule', 'write', PARENTS, (a) => deleteDoc(at(a, A('sites/w1')))),

  // tasks
  op('read a task', 'read', MEMBERS, (a) => getDoc(at(a, A('tasks/t2')))),
  op('list tasks', 'read', MEMBERS, (a) => getDocs(col(a, A('tasks')))),
  op('add a task', 'write', PARENTS, (a) => setDoc(at(a, A('tasks/tNew')), make.task())),
  op('change the title of a task', 'write', PARENTS, (a) => updateDoc(at(a, A('tasks/t2')), { title: 'Play games' })),
  op('change the points of a task', 'write', PARENTS, (a) => updateDoc(at(a, A('tasks/t2')), { points: 1000 })),
  op('tick a task', 'write', MEMBERS, (a) => updateDoc(at(a, A('tasks/t2')), { done: true })),
  op('delete a task', 'write', PARENTS, (a) => deleteDoc(at(a, A('tasks/t2')))),

  // the SOS flag (in the arranged world it is raised by the child device of c1)
  op('read the SOS flag', 'read', MEMBERS, (a) => getDoc(at(a, A('signals/sos')))),
  op('list signals', 'read', MEMBERS, (a) => getDocs(col(a, A('signals')))),
  op('raise the SOS flag as child c1', 'write', ['kid1'], (a) => setDoc(at(a, A('signals/sos')), make.sos(a.selfId, true, 'c1'))),
  op('raise the SOS flag as child c2', 'write', ['kid2'], (a) => setDoc(at(a, A('signals/sos')), make.sos(a.selfId, true, 'c2'))),
  op('clear the SOS flag raised by child c1', 'write', [...PARENTS, 'kid1'], (a) => setDoc(at(a, A('signals/sos')), make.sos(a.selfId, false, 'c1'))),
  op('clear the SOS flag raised by child c1, signing as child c2', 'write', [], (a) => setDoc(at(a, A('signals/sos')), make.sos(a.selfId, false, 'c2'))),
  op('write another signal document', 'write', [], (a) => setDoc(at(a, A('signals/lockdown')), make.sos(a.selfId, false, null))),
  op('delete the SOS flag', 'write', [], (a) => deleteDoc(at(a, A('signals/sos')))),

  // anything the rules do not name
  op('read a document outside the layout', 'read', [], (a) => getDoc(at(a, 'admin/config'))),
  op('write a document outside the layout', 'write', [], (a) => setDoc(at(a, 'admin/config'), { open: true })),
  op('read an unknown sub-collection of the family', 'read', [], (a) => getDocs(col(a, A('secrets')))),
  op('write into an unknown sub-collection of the family', 'write', [], (a) => setDoc(at(a, A('secrets/s1')), { open: true })),
  op('query every family\'s messages at once (collection group)', 'read', [], (a) => getDocs(collectionGroup(a.db, 'messages'))),
  op('query every family\'s members at once (collection group)', 'read', [], (a) => getDocs(collectionGroup(a.db, 'members'))),
  op('query every family\'s children at once (collection group)', 'read', [], (a) => getDocs(collectionGroup(a.db, 'children'))),
];

/**
 * One test per (persona, operation): allowed exactly for the personas the operation lists.
 * The arranged world is put back before a test only when an earlier one may have changed it.
 */
export function matrixTests(h, personaKeys) {
  for (const key of personaKeys) {
    const persona = PERSONAS.find((p) => p.key === key);
    for (const operation of OPS) {
      const expectAllowed = operation.allow.includes(key);
      test(`${persona.label}: ${operation.name}: ${expectAllowed ? 'allowed' : 'refused'}`, async () => {
        await h.ensure('arranged');
        const actor = h.a[key];
        if (!expectAllowed) await refused(operation.run(actor));
        else if (operation.kind === 'write') await allowed(operation.run(actor));
        else await allowedRead(operation.run(actor));
      });
    }
  }
}
