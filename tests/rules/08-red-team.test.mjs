// 8. Red team. Every test here is an attack that was really tried against firestore.rules by
// somebody who did not write them, from ten positions: no account, a fresh anonymous account, an
// unverified password account (also one registered with the owner's address), a verified account
// that is not an owner, an enrolled child device, a device that was removed, a device whose claim
// is still waiting, a parent and a child of another family, a second parent against the founder,
// and tokens with unusual claims. The attacker's client is modified: it sends whatever the SDK or
// the REST API can express (batches, transactions, field masks, transforms, queries).
//
// Two attacks got through the rules as they were, and the rules were changed (look for
// "Red team" in firestore.rules). Their tests are marked FOUND:
//   * a token whose email is verified but that does not come from email-and-password sign-in
//     counted as a verified parent account (8.10);
//   * an owner could found a second family by parking users/{uid} in another family (8.12).
//
// Tests named KNOWN LIMIT show what the rules cannot stop (they cannot count, and some documents
// are permanent by design) together with what still holds and how a parent recovers. Tests named
// BY DESIGN show something an outsider can still do because the rules mean to allow it.
//
// `attack()` is `refused()` with a counter; the last test prints how many requests were tried.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import {
  arrayRemove, arrayUnion, collection, collectionGroup, deleteDoc, deleteField, doc, documentId, getCountFromServer, getDoc, getDocs,
  increment, limit, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';

import {
  A, allowed, allowedRead, B, claimOf, CODES, coll, emulatorAddress, FAM_A, FAM_B, flows, harness, make, minutesAgo, minutesAhead,
  OPS, OWNER_EMAIL, PROJECT_ID, ref, refused, stored, U,
} from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

let tried = 0;
/** The request must be refused with PERMISSION_DENIED. */
const attack = (promise) => {
  tried += 1;
  return refused(promise);
};

// ---- Attackers that are not among the suite's personas ------------------------------------------

const anonymousToken = () => ({ provider_id: 'anonymous', firebase: { sign_in_provider: 'anonymous', identities: {} } });
const passwordToken = (email, verified) => ({ email, email_verified: verified, firebase: { sign_in_provider: 'password', identities: { email: [email] } } });
/** Somebody with this uid and exactly these token claims. */
const actor = (uid, token, label = uid) => ({ key: uid, label, uid, selfId: uid, db: h.env.authenticatedContext(uid, token).firestore() });

/**
 * The whole operation catalogue of the suite (about 130 reads and writes against family A), as
 * `who`. Every operation must be refused except the ones named in `mayStill`.
 */
async function sweep(who, mayStill = []) {
  const unknown = mayStill.filter((name) => !OPS.some((operation) => operation.name === name));
  assert.deepEqual(unknown, [], 'every name in mayStill must be an operation of the catalogue');
  for (const operation of OPS) {
    if (mayStill.includes(operation.name)) continue;
    tried += 1;
    try {
      await refused(operation.run(who));
    } catch (error) {
      throw new Error(`"${operation.name}" was not refused for ${who.label}`, { cause: error });
    }
  }
}
/** What any signed-in account without a family may do: look at its own (missing) pointer and try a code. */
const STRANGER = ['read their own users document', 'claim an unclaimed child code of family A'];
const VERIFIED_STRANGER = [...STRANGER, 'claim an unclaimed parent code of family A'];

/** Each entry becomes one test: the request must be refused. */
function attacks(list) {
  for (const [name, run] of list) test(name, async () => { await attack(run()); });
}

// ---- A REST client: what a program without the SDK can send -------------------------------------
// The emulator accepts unsigned tokens, so any claims can be tried. (The real service checks the
// signature: there the claims are whatever Firebase Auth put in.)

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function idToken(uid, claims) {
  const iat = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', type: 'JWT' })}.${b64({ iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID, iat, exp: iat + 3600, auth_time: iat, sub: uid, user_id: uid, ...claims })}.`;
}
const restToken = {
  kid1: () => idToken(U.kid1, anonymousToken()),
  anon: () => idToken(U.anon, anonymousToken()),
  claimer: () => idToken(U.claimer, anonymousToken()),
  parentB: () => idToken(U.parentB, passwordToken('other.family@example.net', true)),
};
async function rest(token, method, path, body) {
  const { host, port } = emulatorAddress();
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`http://${host}:${port}/v1/projects/${PROJECT_ID}/databases/(default)/documents${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, text: await response.text() };
}
/** The REST request must be answered with 403 PERMISSION_DENIED. */
async function restAttack(token, method, path, body) {
  tried += 1;
  const answer = await rest(token, method, path, body);
  assert.equal(answer.status, 403, `${method} ${path} was answered with HTTP ${answer.status}: ${answer.text.slice(0, 300)}`);
}
const docName = (path) => `projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
function value(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: fieldsOf(v) } };
}
const fieldsOf = (object) => Object.fromEntries(Object.entries(object).map(([key, v]) => [key, value(v)]));
const serverTime = (...fields) => fields.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
/** One write of a commit: the fields in `data`, the field mask (fields in the mask but not in `data` are deleted), transforms. */
const write = (path, data, mask, transforms) => ({
  update: { name: docName(path), fields: fieldsOf(data) },
  ...(mask ? { updateMask: { fieldPaths: mask } } : {}),
  ...(transforms ? { updateTransforms: transforms } : {}),
});
const commit = (token, ...writes) => restAttack(token, 'POST', ':commit', { writes });
const allDescendants = (collectionId) => ({ structuredQuery: { from: [collectionId ? { collectionId, allDescendants: true } : { allDescendants: true }] } });

// ---- Arranged states ------------------------------------------------------------------------------

/** The child device of c1 has been removed by a parent; the code it once used was never tidied away. */
const KID1_REMOVED = () => ({
  [A(`members/${U.kid1}`)]: null,
  'pairing/XSEDKD22': { ...stored(make.pairing(FAM_A, U.founder, 'child'), minutesAgo(400)), ...stored(make.claim(U.kid1), minutesAgo(399)), approved: true },
});
/** The second parent has been removed; a code it made shortly before is still open and claimed. */
const PARENT2_REMOVED = () => ({
  [A(`members/${U.parent2}`)]: null,
  'pairing/P2MADEAA': { ...stored(make.pairing(FAM_A, U.parent2, 'parent'), minutesAgo(3)), ...stored(make.claim(U.joinerVerified), minutesAgo(2)) },
});
const arrangedWith = (extra) => async () => {
  await h.reset();
  await h.arrange(extra());
};

// =====================================================================================================

describe('8.1 no account: the REST API without a token', () => {
  before(() => h.reset());

  test('read single documents of a family, a pairing code, a users document', async () => {
    for (const path of [A(), A(`members/${U.founder}`), A('children/c1'), A('children/c1/messages/m1'), A('alerts/n1'), A('signals/sos'), `pairing/${CODES.openChild}`, `pairing/${CODES.taken}`, `users/${U.founder}`]) {
      await restAttack(null, 'GET', `/${path}`);
    }
  });

  test('list families, users, pairing codes and the collections of a family', async () => {
    for (const path of ['families', 'users', 'pairing', A('members'), A('children'), A('alerts'), A('devices'), A('children/c1/messages')]) {
      await restAttack(null, 'GET', `/${path}`);
      await restAttack(null, 'GET', `/${path}?showMissing=true`);
    }
  });

  test('query every family at once: collection groups, a query without a collection, counting', async () => {
    for (const id of ['members', 'children', 'messages', 'requests', 'alerts', 'devices', 'pairing', 'users', 'families']) {
      await restAttack(null, 'POST', ':runQuery', allDescendants(id));
    }
    await restAttack(null, 'POST', ':runQuery', allDescendants(null));
    await restAttack(null, 'POST', `/${A()}:runQuery`, allDescendants(null));
    await restAttack(null, 'POST', ':runAggregationQuery', { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'families' }] }, aggregations: [{ alias: 'n', count: {} }] } });
  });

  test('fetch several documents in one request, list the collection ids', async () => {
    await restAttack(null, 'POST', ':batchGet', { documents: [docName(A()), docName(A('children/c1')), docName(`pairing/${CODES.openChild}`)] });
    await restAttack(null, 'POST', ':listCollectionIds', {});
    await restAttack(null, 'POST', `/${A()}:listCollectionIds`, {});
  });

  test('write: claim a code, enrol itself, create a family, raise SOS, write outside the layout', async () => {
    await commit(null, write(`pairing/${CODES.openChild}`, { claimedBy: 'nobody', claimName: 'x', claimPlatform: 'android' }, ['claimedBy', 'claimName', 'claimPlatform'], serverTime('claimedAt')));
    await commit(null, write(A('members/nobody'), { role: 'parent', childId: null, name: 'x', platform: 'web', addedBy: 'nobody', code: null }, null, serverTime('joinedAt')));
    await commit(null, write('families/noAccountFamily00001', { v: 2, owner: 'nobody', name: 'x' }, null, serverTime('createdAt')));
    await commit(null, write(A('signals/sos'), { active: true, childId: 'c1', by: 'nobody' }, null, serverTime('at')));
    await commit(null, write('admin/config', { open: true }));
    await commit(null, { delete: docName(A('alerts/n1')) });
    await restAttack(null, 'POST', ':batchWrite', { writes: [write('admin/config', { open: true })] });
  });
});

// =====================================================================================================

describe('8.2 a fresh anonymous account', () => {
  before(() => h.reset());
  const me = () => h.a.anon;

  attacks([
    ['create a pairing code for a family that does not exist', () => setDoc(ref(me(), `pairing/${CODES.fresh}`), make.pairing('ghostFamily000000001', U.anon))],
    ['create a pairing code that names its own uid as the family', () => setDoc(ref(me(), `pairing/${CODES.fresh}`), make.pairing(U.anon, U.anon))],
    ['create a pairing code already claimed by itself and approved', () =>
      setDoc(ref(me(), `pairing/${CODES.fresh}`), { ...make.pairing(FAM_A, U.founder), ...make.claim(U.anon), approved: true })],
    ['become the founder of a family that has no family document (member record and pointer only)', () => {
      const batch = writeBatch(me().db);
      batch.set(ref(me(), `families/ghostFamily000000001/members/${U.anon}`), make.founderMember(U.anon));
      batch.set(ref(me(), `users/${U.anon}`), make.userPointer('ghostFamily000000001', 'parent'));
      return batch.commit();
    }],
    ['found a family under the id of the family that exists', () => flows.createFamily(me(), FAM_A)],
    ['found a family naming the real founder as its owner', () => flows.createFamily(me(), 'anonFamily0000000001', { family: make.family(U.founder) })],
    ['write a child profile under a family id that does not exist', () => setDoc(ref(me(), 'families/ghostFamily000000001/children/c1'), make.child())],
    ['raise an SOS under a family id that does not exist', () => setDoc(ref(me(), 'families/ghostFamily000000001/signals/sos'), make.sos(U.anon, true, 'c1'))],
    ['report presence under a family id that does not exist', () => setDoc(ref(me(), 'families/ghostFamily000000001/devices/dev1'), make.device(U.anon))],
    ['write a users pointer for itself at family A as a child', () => setDoc(ref(me(), `users/${U.anon}`), make.userPointer(FAM_A, 'child'))],
    ['write a users pointer for itself at a family that does not exist', () => setDoc(ref(me(), `users/${U.anon}`), make.userPointer('ghostFamily000000001', 'parent'))],
    ['claim, enrol itself, approve and point at the family, all in one batch', () => {
      const batch = flows.approveBatch(me(), FAM_A, CODES.openChild, claimOf(me()), { childId: 'c1' });
      batch.update(ref(me(), `pairing/${CODES.openChild}`), make.claim(U.anon));
      batch.set(ref(me(), `users/${U.anon}`), make.userPointer(FAM_A, 'child'));
      return batch.commit();
    }],
    ['claim a code and mark it approved in the same update', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), { ...make.claim(U.anon), approved: true })],
    ['claim a child code and turn it into a parent code in the same update', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), { ...make.claim(U.anon), role: 'parent' })],
    ['claim a code and move it to another family in the same update', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), { ...make.claim(U.anon), familyId: FAM_B })],
    ['claim a code and push its expiry out in the same update', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), { ...make.claim(U.anon), expiresAt: minutesAhead(600) })],
    ['claim a code in the founder\'s name, to have the founder\'s uid on the request', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), make.claim(U.founder))],
    ['claim with a device name that is a list', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), make.claim(U.anon, { claimName: ['Vivo V40e'] }))],
    ['claim with a device name that is a map', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), make.claim(U.anon, { claimName: { toString: 'Vivo' } }))],
    ['claim with a device name of 41 characters', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), make.claim(U.anon, { claimName: 'x'.repeat(41) }))],
    ['claim with a platform that is a list containing a valid one', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), make.claim(U.anon, { claimPlatform: ['android'] }))],
    ['claim with an extra field (a note for the parent)', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), { ...make.claim(U.anon), note: 'approve me' })],
    ['claim and remove the expiry field', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), { ...make.claim(U.anon), expiresAt: deleteField() })],
    ['delete a code nobody has claimed', () => deleteDoc(ref(me(), `pairing/${CODES.openChild}`))],
    ['delete a code somebody else has claimed', () => deleteDoc(ref(me(), `pairing/${CODES.taken}`))],
    ['delete a code that does not exist (to see a different answer)', () => deleteDoc(ref(me(), `pairing/${CODES.missing}`))],
    ['read a sub-collection below a pairing code', () => getDocs(coll(me(), `pairing/${CODES.openChild}/claims`))],
    ['write a document below a pairing code', () => setDoc(ref(me(), `pairing/${CODES.openChild}/claims/${U.anon}`), { approved: true })],
    ['write a document below its own users document', () => setDoc(ref(me(), `users/${U.anon}/private/role`), { role: 'parent' })],
    ['write a document below a member record', () => setDoc(ref(me(), A(`members/${U.founder}/grants/${U.anon}`)), { role: 'parent' })],
  ]);

  test('through REST: claim with a field mask that also deletes the expiry, or with a transform on the creation time', async () => {
    const claim = { claimedBy: U.anon, claimName: 'x', claimPlatform: 'android' };
    await commit(restToken.anon(), write(`pairing/${CODES.openChild}`, claim, ['claimedBy', 'claimName', 'claimPlatform', 'expiresAt'], serverTime('claimedAt')));
    await commit(restToken.anon(), write(`pairing/${CODES.openChild}`, claim, ['claimedBy', 'claimName', 'claimPlatform'], serverTime('claimedAt', 'createdAt')));
    await commit(restToken.anon(), write(`pairing/${CODES.openChild}`, claim, ['claimedBy', 'claimName', 'claimPlatform'], serverTime('claimedAt', 'expiresAt')));
    await commit(restToken.anon(), write(`pairing/${CODES.openChild}`, claim, ['claimedBy', 'claimName', 'claimPlatform'],
      [...serverTime('claimedAt'), { fieldPath: 'approved', maximum: { integerValue: '1' } }]));
    assert.equal((await h.peek(`pairing/${CODES.openChild}`)).claimedBy, null);
  });

  test('the whole catalogue of operations: nothing but its own pointer and a blind claim', () => sweep(actor('freshAnonAccount', anonymousToken()), STRANGER));
});

// =====================================================================================================

describe('8.3 an unverified password account, also one registered with the owner\'s address', () => {
  before(() => h.reset());
  const impostor = () => h.a.impostor; // owner@example.com, not verified
  const unverified = () => h.a.unverified;

  attacks([
    ['owner address, unverified: found a family', () => flows.createFamily(impostor(), 'impostorFamily000001')],
    ['owner address, unverified: found a family in a batch that also makes a pairing code', () => {
      const batch = writeBatch(impostor().db);
      batch.set(ref(impostor(), 'families/impostorFamily000001'), make.family(U.impostor));
      batch.set(ref(impostor(), `families/impostorFamily000001/members/${U.impostor}`), make.founderMember(U.impostor));
      batch.set(ref(impostor(), `users/${U.impostor}`), make.userPointer('impostorFamily000001', 'parent'));
      batch.set(ref(impostor(), `pairing/${CODES.fresh}`), make.pairing('impostorFamily000001', U.impostor, 'parent'));
      return batch.commit();
    }],
    ['owner address, unverified: claim a parent code', () => flows.claim(impostor(), CODES.openParent)],
    ['owner address, unverified: take the founder\'s place by writing a member record over it', () =>
      setDoc(ref(impostor(), A(`members/${U.founder}`)), make.founderMember(U.impostor))],
    ['owner address, unverified: read the founder\'s users document (same address, other account)', () => getDoc(ref(impostor(), `users/${U.founder}`))],
    ['owner address, unverified: read the family it would own if the address were enough', () => getDoc(ref(impostor(), A()))],
    ['unverified: found a family', () => flows.createFamily(unverified(), 'unverifiedFamily0001')],
    ['unverified: claim a parent code', () => flows.claim(unverified(), CODES.openParent)],
    ['unverified: claim a child code and a parent code in one batch', () => {
      const batch = writeBatch(unverified().db);
      batch.update(ref(unverified(), `pairing/${CODES.openChild}`), make.claim(U.unverified));
      batch.update(ref(unverified(), `pairing/${CODES.openParent}`), make.claim(U.unverified));
      return batch.commit();
    }],
  ]);

  test('through REST with a token that says email_verified false: found a family', async () => {
    const token = idToken(U.impostor, passwordToken(OWNER_EMAIL, false));
    await commit(token,
      write('families/impostorFamily000001', { v: 2, owner: U.impostor, name: 'x' }, null, serverTime('createdAt')),
      write(`families/impostorFamily000001/members/${U.impostor}`, { role: 'parent', childId: null, name: 'x', platform: 'web', addedBy: U.impostor, code: null }, null, serverTime('joinedAt')),
      write(`users/${U.impostor}`, { familyId: 'impostorFamily000001', role: 'parent' }, null, serverTime('updatedAt')));
  });
});

// =====================================================================================================

describe('8.4 a verified account that is not on the owner list', () => {
  before(() => h.reset());
  const me = () => h.a.verified;

  attacks([
    ['found a family', () => flows.createFamily(me(), 'verifiedFamily000001')],
    ['found a family naming the real founder as owner, with itself as the parent member', () =>
      flows.createFamily(me(), 'verifiedFamily000001', { family: make.family(U.founder) })],
    ['replace the existing family document with one it owns', () => setDoc(ref(me(), A()), make.family(U.verified))],
    ['add itself as a second owner of the existing family', () => updateDoc(ref(me(), A()), { owners: arrayUnion(U.verified) })],
    ['write itself into the family as a founder-style parent', () => setDoc(ref(me(), A(`members/${U.verified}`)), make.founderMember(U.verified))],
    ['write itself into the family as a parent "added by" the founder', () =>
      setDoc(ref(me(), A(`members/${U.verified}`)), make.member(U.founder, CODES.openParent, { name: 'x', platform: 'ios' }, 'parent', null))],
    ['claim a parent code and enrol itself in the same batch', () => {
      const batch = flows.approveBatch(me(), FAM_A, CODES.openParent, claimOf(me()), null);
      batch.update(ref(me(), `pairing/${CODES.openParent}`), make.claim(U.verified));
      return batch.commit();
    }],
    ['claim a parent code and approve it in the same update', () => updateDoc(ref(me(), `pairing/${CODES.openParent}`), { ...make.claim(U.verified), approved: true })],
    ['claim a child code and turn it into a parent code', () => updateDoc(ref(me(), `pairing/${CODES.openChild}`), { ...make.claim(U.verified), role: 'parent' })],
  ]);

  test('with a parent code claimed (not approved): still no way in', async () => {
    await h.reset();
    await allowed(flows.claim(me(), CODES.openParent)); // any verified account that knows the code may ask
    await attack(flows.approve(me(), FAM_A, CODES.openParent, claimOf(me()), null));
    await attack(setDoc(ref(me(), A(`members/${U.verified}`)), make.member(U.verified, CODES.openParent, claimOf(me()), 'parent', null)));
    await attack(updateDoc(ref(me(), `pairing/${CODES.openParent}`), { approved: true }));
    await attack(setDoc(ref(me(), `users/${U.verified}`), make.userPointer(FAM_A, 'parent')));
    await attack(getDoc(ref(me(), A())));
    await attack(getDocs(coll(me(), A('members'))));
    await attack(getDoc(ref(me(), A('children/c1'))));
    await attack(setDoc(ref(me(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.verified, 'parent')));
    assert.equal(await h.peek(A(`members/${U.verified}`)), undefined);
    await h.reset();
  });
});

// =====================================================================================================

describe('8.5 an enrolled child device (c1) with a modified app', () => {
  before(() => h.reset());
  const kid = () => h.a.kid1;
  const at = (path) => ref(kid(), A(path));

  describe('limits, app rules and pause, through transforms and merges', () => {
    attacks([
      ['raise its own daily limit with increment()', () => updateDoc(at('children/c1'), { limitMin: increment(600) })],
      ['lower its used minutes with increment(-168)', () => updateDoc(at('children/c1'), { usedMin: increment(-168) })],
      ['drop an app rule from its list with arrayRemove()', () => updateDoc(at('children/c1'), { apps: arrayRemove({ id: 'a7' }) })],
      ['add an app to its list with arrayUnion()', () => updateDoc(at('children/c1'), { apps: arrayUnion({ id: 'a10', blocked: false }) })],
      ['remove the pause by deleting the field', () => updateDoc(at('children/c1'), { bedtime: deleteField() })],
      ['merge a new limit into its profile', () => setDoc(at('children/c1'), { limitMin: 1440 }, { merge: true })],
      ['merge nothing into its profile (an empty update, to find a writable document)', () => setDoc(at('children/c1'), {}, { merge: true })],
      ['create a second profile for itself with no limits', () => setDoc(at('children/cMine'), make.child({ limitMin: 1440 }))],
      ['change the sibling\'s limit', () => updateDoc(at('children/c2'), { limitMin: 0 })],
      ['switch a schedule off inside a batch with a permitted write (ticking a task)', () => {
        const batch = writeBatch(kid().db);
        batch.update(at('tasks/t2'), { done: true });
        batch.update(at('schedules/s1'), { on: false });
        return batch.commit();
      }],
      ['unblock a site inside a batch with a permitted write (a check-in)', () => {
        const batch = writeBatch(kid().db);
        batch.set(at('children/c1/live/status'), make.liveStatus(U.kid1));
        batch.delete(at('sites/w1'));
        return batch.commit();
      }],
      ['change a place inside a transaction that first reads it', () =>
        runTransaction(kid().db, async (tx) => {
          const snapshot = await tx.get(at('places/p1'));
          tx.update(at('places/p1'), { radius: snapshot.data().radius + 100000 });
        }, { maxAttempts: 1 })],
    ]);

    test('through REST: a transform-only write on its limit, and a profile update hidden behind a field mask', async () => {
      await commit(restToken.kid1(), { transform: { document: docName(A('children/c1')), fieldTransforms: [{ fieldPath: 'limitMin', increment: { integerValue: '600' } }] } });
      await commit(restToken.kid1(), write(A('children/c1'), { limitMin: 1440 }, ['limitMin']));
      await commit(restToken.kid1(), write(A('children/c1'), {}, ['bedtime']));
      assert.equal((await h.peek(A('children/c1'))).limitMin, 240);
    });
  });

  describe('tasks: only the tick is the child\'s', () => {
    attacks([
      ['tick a task and raise its points in the same update', () => updateDoc(at('tasks/t2'), { done: true, points: increment(500) })],
      ['tick a task and retitle it in one batch (two writes to the same task)', () => {
        const batch = writeBatch(kid().db);
        batch.update(at('tasks/t2'), { done: true });
        batch.update(at('tasks/t2'), { title: 'Play games' });
        return batch.commit();
      }],
      ['set the tick to a string', () => updateDoc(at('tasks/t2'), { done: 'yes' })],
      ['set the tick to a number', () => updateDoc(at('tasks/t2'), { done: 1 })],
      ['set the tick to null', () => updateDoc(at('tasks/t2'), { done: null })],
      ['turn the tick into a map through a nested field path', () => updateDoc(at('tasks/t2'), { 'done.by': U.kid1 })],
      ['remove the tick field', () => updateDoc(at('tasks/t2'), { done: deleteField() })],
      ['replace a task by a whole document with other points', () => setDoc(at('tasks/t2'), make.task({ title: 'Tidy your room', points: 1000, done: true, ord: 1 }))],
      ['invent a task for itself', () => setDoc(at('tasks/tMine'), make.task({ points: 1000, done: true }))],
    ]);

    test('through REST: tick with a field mask that drops the title, or with a transform on the points', async () => {
      await commit(restToken.kid1(), write(A('tasks/t2'), { done: true }, ['done', 'title']));
      await commit(restToken.kid1(), write(A('tasks/t2'), { done: true }, ['done'], [{ fieldPath: 'points', increment: { integerValue: '500' } }]));
      await commit(restToken.kid1(), write(A('tasks/t2'), { done: true }, ['done'], [{ fieldPath: 'title', appendMissingElements: { values: [{ stringValue: 'x' }] } }]));
      assert.deepEqual((await h.peek(A('tasks/t2'))).points, 15);
    });

    test('control: the same REST client is accepted for what a child may do (read its profile, tick a task)', async () => {
      assert.equal((await rest(restToken.kid1(), 'GET', `/${A('children/c1')}`)).status, 200);
      assert.equal((await rest(restToken.kid1(), 'POST', ':commit', { writes: [write(A('tasks/t2'), { done: true }, ['done'])] })).status, 200);
      assert.equal((await h.peek(A('tasks/t2'))).done, true);
      await h.reset();
    });
  });

  describe('requests: asking is all it can do', () => {
    attacks([
      ['create a request and approve it in the same batch', () => {
        const batch = writeBatch(kid().db);
        batch.set(at('children/c1/requests/rSelf'), make.request(U.kid1));
        batch.update(at('children/c1/requests/rSelf'), make.answer(U.kid1, 'approved'));
        return batch.commit();
      }],
      ['create a request that already carries a parent\'s answer', () =>
        setDoc(at('children/c1/requests/rSelf'), { ...make.request(U.kid1), resolvedBy: U.founder, resolvedAt: serverTimestamp() })],
      ['create a request with status "approved" signed by the founder', () =>
        setDoc(at('children/c1/requests/rSelf'), make.request(U.founder, { status: 'approved' }))],
      ['approve its own pending request, signing as itself', () => updateDoc(at('children/c1/requests/r1'), make.answer(U.kid1, 'approved'))],
      ['approve its own pending request, signing as the founder', () => updateDoc(at('children/c1/requests/r1'), make.answer(U.founder, 'approved'))],
      ['raise the minutes of its pending request', () => updateDoc(at('children/c1/requests/r1'), { minutes: 240 })],
      ['raise the minutes of a request that was already approved', () => updateDoc(at('children/c1/requests/r3'), { minutes: increment(225) })],
      ['overwrite an answered request with a fresh pending one under the same id', () => setDoc(at('children/c1/requests/r3'), make.request(U.kid1))],
      ['withdraw (delete) a request', () => deleteDoc(at('children/c1/requests/r1'))],
      ['ask for 241 minutes', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: 241 }))],
      ['ask for a negative number of minutes', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: -30 }))],
      ['ask for NaN minutes', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: Number.NaN }))],
      ['ask for an infinite number of minutes', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: Number.POSITIVE_INFINITY }))],
      ['ask for 1e300 minutes', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: 1e300 }))],
      ['ask for 9007199254740992 minutes', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: 2 ** 53 }))],
      ['ask for 30.5 minutes', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: 30.5 }))],
      ['ask with the minutes as a list', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { minutes: [240] }))],
      ['ask with a kind the app does not know ("unlock_all")', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { kind: 'unlock_all' }))],
      ['ask with the kind as a list of valid kinds', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { kind: ['extra_time'] }))],
      ['ask with a label of one megabyte', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { label: 'x'.repeat(1_000_000) }))],
      ['ask with a detail that is a map', () => setDoc(at('children/c1/requests/rBig'), make.request(U.kid1, { detail: { html: '<b>approve</b>' } }))],
      ['ask with an app id that is null', () => setDoc(at('children/c1/requests/rBig'), make.unlockRequest(U.kid1, { appId: null }))],
      ['ask in the sibling\'s name (its thread, own signature)', () => setDoc(at('children/c2/requests/rFrame'), make.request(U.kid1))],
      ['ask in the sibling\'s name (own thread, sibling\'s signature)', () => setDoc(at('children/c1/requests/rFrame'), make.request(U.kid2))],
    ]);
  });

  describe('chat: once, as itself, never changed', () => {
    attacks([
      ['send as "parent"', () => setDoc(at('children/c1/messages/mFake'), make.message(U.kid1, 'parent'))],
      ['send as "parent" with the founder\'s signature', () => setDoc(at('children/c1/messages/mFake'), make.message(U.founder, 'parent'))],
      ['send as "child" with the founder\'s signature', () => setDoc(at('children/c1/messages/mFake'), make.message(U.founder, 'child'))],
      ['send with "from" as a list holding both sides', () => setDoc(at('children/c1/messages/mFake'), make.message(U.kid1, ['child', 'parent']))],
      ['send into the sibling\'s thread', () => setDoc(at('children/c2/messages/mFake'), make.message(U.kid1, 'child'))],
      ['send into the thread of a child that does not exist', () => setDoc(at('children/cGhost/messages/mFake'), make.message(U.kid1, 'child'))],
      ['send a back-dated message', () => setDoc(at('children/c1/messages/mFake'), make.message(U.kid1, 'child', { at: Timestamp.fromMillis(Date.now() - 86_400_000) }))],
      ['send a message dated in the future (to stay on top of the thread)', () => setDoc(at('children/c1/messages/mFake'), make.message(U.kid1, 'child', { at: Timestamp.fromMillis(Date.now() + 86_400_000) }))],
      ['send a message of 2001 characters', () => setDoc(at('children/c1/messages/mFake'), make.message(U.kid1, 'child', { text: 'x'.repeat(2001) }))],
      ['send a message whose text is a list', () => setDoc(at('children/c1/messages/mFake'), make.message(U.kid1, 'child', { text: ['a', 'b'] }))],
      ['send a message with an extra field (read: true)', () => setDoc(at('children/c1/messages/mFake'), { ...make.message(U.kid1, 'child'), read: true })],
      ['edit its own message', () => updateDoc(at('children/c1/messages/m2'), { text: 'I never asked that' })],
      ['overwrite its own message with a new one under the same id', () => setDoc(at('children/c1/messages/m2'), make.message(U.kid1, 'child', { text: 'new' }))],
      ['overwrite a parent\'s message', () => setDoc(at('children/c1/messages/m1'), make.message(U.kid1, 'child'))],
      ['delete a parent\'s message', () => deleteDoc(at('children/c1/messages/m3'))],
      ['delete its own message', () => deleteDoc(at('children/c1/messages/m2'))],
      ['delete a message and write a new one under its id in one batch', () => {
        const batch = writeBatch(kid().db);
        batch.delete(at('children/c1/messages/m1'));
        batch.set(at('children/c1/messages/m1'), make.message(U.kid1, 'child'));
        return batch.commit();
      }],
    ]);
  });

  describe('the parents\' feed', () => {
    attacks([
      ['read the alert it wrote itself', () => getDoc(at('alerts/n2'))],
      ['query the alerts about itself', () => getDocs(query(coll(kid(), A('alerts')), where('childId', '==', 'c1')))],
      ['query the alerts it signed', () => getDocs(query(coll(kid(), A('alerts')), where('by', '==', U.kid1)))],
      ['query one alert by its id', () => getDocs(query(coll(kid(), A('alerts')), where(documentId(), '==', 'n2')))],
      ['count the alerts', () => getCountFromServer(coll(kid(), A('alerts')))],
      ['count the unread alerts', () => getCountFromServer(query(coll(kid(), A('alerts')), where('unread', '==', true)))],
      ['add an alert about the sibling', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'sos', 'c2'))],
      ['add an alert about nobody', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'checkin', null))],
      ['add an alert of a parent-only kind ("report")', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'report', 'c1'))],
      ['add an alert whose kind is a list', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, ['checkin'], 'c1'))],
      ['add an alert that is already read', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'checkin', 'c1', { unread: false }))],
      ['add an alert signed by the founder', () => setDoc(at('alerts/nFake'), make.alert(U.founder, 'checkin', 'c1'))],
      ['add a back-dated alert', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'checkin', 'c1', { at: Timestamp.fromMillis(Date.now() - 86_400_000) }))],
      ['add an alert with a title of 121 characters', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'checkin', 'c1', { title: 'x'.repeat(121) }))],
      ['add an alert whose colour ends in a line break', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'checkin', 'c1', { color: '#2E8BFF\n' }))],
      ['add an alert whose colour is CSS, not a hex colour', () => setDoc(at('alerts/nFake'), make.alert(U.kid1, 'checkin', 'c1', { color: 'url(x)' }))],
      ['mark an alert as read', () => updateDoc(at('alerts/n2'), { unread: false })],
      ['overwrite its own alert', () => setDoc(at('alerts/n2'), make.alert(U.kid1, 'checkin', 'c1', { title: 'nothing happened' }))],
      ['delete its own alert', () => deleteDoc(at('alerts/n2'))],
      ['delete the alert about its SOS', () => deleteDoc(at('alerts/n1'))],
    ]);

    test('through REST: fetch alerts among documents it may read, count them, find them below the family', async () => {
      await restAttack(restToken.kid1(), 'POST', ':batchGet', { documents: [docName(A('children/c1')), docName(A('alerts/n1'))] });
      await restAttack(restToken.kid1(), 'POST', `/${A()}:runAggregationQuery`, { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'alerts' }] }, aggregations: [{ alias: 'n', count: {} }] } });
      await restAttack(restToken.kid1(), 'POST', `/${A()}:runQuery`, allDescendants('alerts'));
      await restAttack(restToken.kid1(), 'GET', `/${A('alerts')}?pageSize=1`);
    });
  });

  describe('the sibling\'s records', () => {
    attacks([
      ['query the children collection for its own document only (a query, not a get)', () => getDocs(query(coll(kid(), A('children')), where(documentId(), '==', 'c1')))],
      ['count the children', () => getCountFromServer(coll(kid(), A('children')))],
      ['query all requests of the family as a collection group', () => getDocs(collectionGroup(kid().db, 'requests'))],
      ['query its own requests as a collection group', () => getDocs(query(collectionGroup(kid().db, 'requests'), where('by', '==', U.kid1)))],
      ['query all live documents as a collection group', () => getDocs(collectionGroup(kid().db, 'live'))],
      ['read the sibling\'s check-in', () => getDoc(at('children/c2/live/status'))],
      ['count the sibling\'s messages', () => getCountFromServer(coll(kid(), A('children/c2/messages')))],
      ['write the sibling\'s check-in', () => setDoc(at('children/c2/live/status'), make.liveStatus(U.kid1))],
      ['write its own check-in signed by the sibling', () => setDoc(at('children/c1/live/status'), make.liveStatus(U.kid2))],
      ['write its own check-in with a time of its choosing', () => setDoc(at('children/c1/live/status'), make.liveStatus(U.kid1, { checkInAt: Timestamp.fromMillis(Date.now() - 3_600_000) }))],
      ['write a location document next to the check-in', () => setDoc(at('children/c1/live/location'), { lat: 0, lng: 0, by: U.kid1, checkInAt: serverTimestamp() })],
      ['take over the sibling\'s device record', () => setDoc(at('devices/devKid2'), make.device(U.kid1))],
      ['write a new device record signed by the sibling', () => setDoc(at('devices/devFake'), make.device(U.kid2))],
      ['write a new device record signed by the founder', () => setDoc(at('devices/devFake'), make.device(U.founder, { name: "Dad's iPhone", platform: 'ios' }))],
      ['hand its own device record to the founder', () => updateDoc(at('devices/devKid1'), { uid: U.founder })],
      ['delete the sibling\'s device record', () => deleteDoc(at('devices/devKid2'))],
    ]);

    test('through REST: everything below the family, below its own profile, and the sibling among its own documents', async () => {
      await restAttack(restToken.kid1(), 'POST', `/${A()}:runQuery`, allDescendants('requests'));
      await restAttack(restToken.kid1(), 'POST', `/${A()}:runQuery`, allDescendants('messages'));
      await restAttack(restToken.kid1(), 'POST', `/${A()}:runQuery`, allDescendants(null));
      await restAttack(restToken.kid1(), 'POST', `/${A('children/c1')}:runQuery`, allDescendants(null));
      await restAttack(restToken.kid1(), 'POST', `/${A('children/c1')}:runQuery`, allDescendants('messages'));
      await restAttack(restToken.kid1(), 'POST', ':batchGet', { documents: [docName(A('children/c1')), docName(A('children/c2'))] });
      await restAttack(restToken.kid1(), 'GET', `/${A('children')}?showMissing=true`);
      await restAttack(restToken.kid1(), 'POST', `/${A()}:listCollectionIds`, {});
      await restAttack(restToken.kid1(), 'POST', `/${A('children/c2')}:listCollectionIds`, {});
    });
  });

  describe('who it is: role, child, membership, pairing, pointer', () => {
    attacks([
      ['leave and come back as a founder-style parent in one batch', () => {
        const batch = writeBatch(kid().db);
        batch.delete(at(`members/${U.kid1}`));
        batch.set(at(`members/${U.kid1}`), make.founderMember(U.kid1));
        return batch.commit();
      }],
      ['leave and re-enrol itself as a parent with its old code in one batch', () => {
        const batch = writeBatch(kid().db);
        batch.delete(at(`members/${U.kid1}`));
        batch.set(at(`members/${U.kid1}`), make.member(U.founder, 'XSEDKD22', { name: 'Vivo V40e', platform: 'android' }, 'parent', null));
        return batch.commit();
      }],
      ['become a parent with increment-style tricks on its record (role as a list)', () => updateDoc(at(`members/${U.kid1}`), { role: arrayUnion('parent') })],
      ['remove its childId', () => updateDoc(at(`members/${U.kid1}`), { childId: deleteField() })],
      ['point itself at both children (childId as a list)', () => updateDoc(at(`members/${U.kid1}`), { childId: ['c1', 'c2'] })],
      ['rename itself to look like a parent\'s phone', () => updateDoc(at(`members/${U.kid1}`), { name: "Dad's iPhone" })],
      ['enrol a friend: a member record for another account', () => setDoc(at(`members/${U.joiner}`), make.member(U.kid1, CODES.openChild, { name: 'x', platform: 'android' }, 'child', 'c1'))],
      ['make a pairing code for a second parent', () => flows.createCode(kid(), FAM_A, CODES.fresh, 'parent')],
      ['make a pairing code signed by the founder', () => setDoc(ref(kid(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, 'parent'))],
      ['approve the claim that is waiting (enrol the claimer as a child)', () => flows.approve(kid(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' })],
      ['approve the waiting claim without a member record', () => updateDoc(ref(kid(), `pairing/${CODES.taken}`), { approved: true })],
      ['decline (delete) the claim that is waiting', () => deleteDoc(ref(kid(), `pairing/${CODES.taken}`))],
      ['read the claim that is waiting', () => getDoc(ref(kid(), `pairing/${CODES.taken}`))],
      ['claim a parent code of its own family', () => flows.claim(kid(), CODES.openParent)],
      ['claim a child code of its own family (to hold a second claim)', () => flows.claim(kid(), CODES.openChild)],
      ['say "parent" in its users pointer', () => setDoc(ref(kid(), `users/${U.kid1}`), make.userPointer(FAM_A, 'parent'))],
      ['say "parent" in its users pointer through an update of the role only', () => updateDoc(ref(kid(), `users/${U.kid1}`), { role: 'parent', updatedAt: serverTimestamp() })],
      ['point its users document at the other family', () => setDoc(ref(kid(), `users/${U.kid1}`), make.userPointer(FAM_B, 'child'))],
      ['add a field to its users pointer (admin: true)', () => setDoc(ref(kid(), `users/${U.kid1}`), { ...make.userPointer(FAM_A, 'child'), admin: true })],
      ['keep an old time in its users pointer', () => setDoc(ref(kid(), `users/${U.kid1}`), make.userPointer(FAM_A, 'child', { updatedAt: minutesAgo(600) }))],
      ['write the founder\'s users pointer', () => setDoc(ref(kid(), `users/${U.founder}`), make.userPointer(FAM_A, 'child'))],
      ['rename the family in a batch with a permitted write', () => {
        const batch = writeBatch(kid().db);
        batch.update(at('tasks/t2'), { done: true });
        batch.update(at(''), { name: 'Mia rules' });
        return batch.commit();
      }],
    ]);
  });

  describe('SOS while the sibling\'s SOS is active', () => {
    before(arrangedWith(() => ({ [A('signals/sos')]: stored(make.sos(U.kid2, true, 'c2'), minutesAgo(1)) })));
    const flag = () => at('signals/sos');

    attacks([
      ['raise its own SOS and clear it again in one batch, which would leave the sibling\'s SOS cleared', () => {
        const batch = writeBatch(kid().db);
        batch.set(flag(), make.sos(U.kid1, true, 'c1'));
        batch.set(flag(), make.sos(U.kid1, false, 'c1'));
        return batch.commit();
      }],
      ['clear the sibling\'s SOS in a transaction that reads it first', () =>
        runTransaction(kid().db, async (tx) => {
          const snapshot = await tx.get(flag());
          tx.set(flag(), make.sos(U.kid1, false, snapshot.data().childId));
        }, { maxAttempts: 1 })],
      ['clear it by updating "active" only', () => updateDoc(flag(), { active: false })],
      ['clear it by removing the "active" field', () => updateDoc(flag(), { active: deleteField() })],
      ['clear it with "active" as the number 0', () => setDoc(flag(), make.sos(U.kid1, 0, 'c2'))],
      ['clear it naming both children (childId as a list)', () => setDoc(flag(), make.sos(U.kid1, false, ['c1', 'c2']))],
      ['clear it signed by the sibling', () => setDoc(flag(), make.sos(U.kid2, false, 'c2'))],
      ['clear it signed by the founder', () => setDoc(flag(), make.sos(U.founder, false, 'c2'))],
      ['raise an SOS in the sibling\'s name', () => setDoc(flag(), make.sos(U.kid1, true, 'c2'))],
      ['raise an SOS for nobody', () => setDoc(flag(), make.sos(U.kid1, true, null))],
      ['raise its SOS with an extra field', () => setDoc(flag(), { ...make.sos(U.kid1, true, 'c1'), note: 'ignore Leo' })],
      ['raise its SOS back-dated', () => setDoc(flag(), make.sos(U.kid1, true, 'c1', { at: minutesAgo(600) }))],
      ['delete the flag', () => deleteDoc(flag())],
      ['write a second flag document ("sos2")', () => setDoc(at('signals/sos2'), make.sos(U.kid1, true, 'c1'))],
    ]);

    test('the sibling\'s SOS is still there', async () => {
      assert.deepEqual({ active: (await h.peek(A('signals/sos'))).active, childId: (await h.peek(A('signals/sos'))).childId }, { active: true, childId: 'c2' });
    });
  });
});

// =====================================================================================================

describe('8.6 a device that was removed from the family (its token is still valid)', () => {
  describe('the removed child device', () => {
    before(arrangedWith(KID1_REMOVED));
    const gone = () => h.a.kid1;

    test('BY DESIGN (test 1.7): the one thing left to it inside the family is deleting the "last seen" record that carries its own uid; no other record, and it cannot write one', async () => {
      await attack(deleteDoc(ref(gone(), A('devices/devKid2'))));
      await attack(deleteDoc(ref(gone(), A('devices/devFounder'))));
      await attack(deleteDoc(ref(gone(), A('devices/devNeverThere'))));
      await attack(updateDoc(ref(gone(), A('devices/devKid1')), { name: 'still here' }));
      await allowed(deleteDoc(ref(gone(), A('devices/devKid1'))));
      await attack(setDoc(ref(gone(), A('devices/devKid1')), make.device(U.kid1)));
      await h.reset();
      await h.arrange(KID1_REMOVED());
    });

    attacks([
      ['read the family it was in', () => getDoc(ref(gone(), A()))],
      ['read the profile it was enrolled as', () => getDoc(ref(gone(), A('children/c1')))],
      ['read its old chat thread', () => getDocs(coll(gone(), A('children/c1/messages')))],
      ['read its own old member record (it is gone: is there an answer?)', () => getDoc(ref(gone(), A(`members/${U.kid1}`)))],
      ['report presence again under its old device id', () => setDoc(ref(gone(), A('devices/devKid1')), make.device(U.kid1))],
      ['check in', () => setDoc(ref(gone(), A('children/c1/live/status')), make.liveStatus(U.kid1))],
      ['raise an SOS', () => setDoc(ref(gone(), A('signals/sos')), make.sos(U.kid1, true, 'c1'))],
      ['clear the SOS it raised while it was a member', () => setDoc(ref(gone(), A('signals/sos')), make.sos(U.kid1, false, 'c1'))],
      ['send a message', () => setDoc(ref(gone(), A('children/c1/messages/mGone')), make.message(U.kid1, 'child'))],
      ['add a "left" alert', () => setDoc(ref(gone(), A('alerts/nGone')), make.alert(U.kid1, 'left', 'c1'))],
      ['tick a task', () => updateDoc(ref(gone(), A('tasks/t2')), { done: true })],
      ['refresh its users pointer at the family', () => setDoc(ref(gone(), `users/${U.kid1}`), make.userPointer(FAM_A, 'child'))],
      ['put its member record back as it was', () => setDoc(ref(gone(), A(`members/${U.kid1}`)), make.member(U.founder, 'XSEDKD22', { name: 'Vivo V40e', platform: 'android' }, 'child', 'c1'))],
      ['put its member record back and refresh the pointer in one batch', () => {
        const batch = writeBatch(gone().db);
        batch.set(ref(gone(), A(`members/${U.kid1}`)), make.member(U.founder, 'XSEDKD22', { name: 'Vivo V40e', platform: 'android' }, 'child', 'c1'));
        batch.set(ref(gone(), `users/${U.kid1}`), make.userPointer(FAM_A, 'child'));
        return batch.commit();
      }],
      ['un-approve its used code to use it again', () => updateDoc(ref(gone(), 'pairing/XSEDKD22'), { approved: false })],
      ['claim its used code again', () => updateDoc(ref(gone(), 'pairing/XSEDKD22'), make.claim(U.kid1))],
      ['replace its used code by a fresh one', () => setDoc(ref(gone(), 'pairing/XSEDKD22'), make.pairing(FAM_A, U.founder, 'child'))],
    ]);

    test('the whole catalogue: nothing inside the family but that one deletion; outside it, its own pointer and a blind claim', () =>
      sweep(gone(), [...STRANGER, 'read the users document of the child device of c1', 'delete the users document of the child device of c1',
        'delete their own users document (not having left any family)', 'delete the device record of the child device of c1']));

    test('what is left to it is outside the family: its pointer, the code it once claimed, and asking again with a new code', async () => {
      await allowedRead(getDoc(ref(gone(), 'pairing/XSEDKD22'))); // the device that claimed a code may read and tidy it
      await allowed(deleteDoc(ref(gone(), 'pairing/XSEDKD22')));
      await attack(setDoc(ref(gone(), 'pairing/XSEDKD22'), make.pairing(FAM_A, U.kid1, 'child'))); // gone for good
      await allowed(deleteDoc(ref(gone(), `users/${U.kid1}`)));
      await allowed(flows.claim(gone(), CODES.openChild)); // like any stranger who is given a code: a parent must approve
      await attack(getDoc(ref(gone(), A())));
      await h.reset();
    });
  });

  describe('the removed second parent', () => {
    before(arrangedWith(PARENT2_REMOVED));
    const gone = () => h.a.parent2;

    attacks([
      ['read the code it made before it was removed', () => getDoc(ref(gone(), 'pairing/P2MADEAA'))],
      ['approve the claim on the code it made (enrol its accomplice as a parent)', () => flows.approve(gone(), FAM_A, 'P2MADEAA', claimOf(h.a.joinerVerified), null)],
      ['delete the code it made', () => deleteDoc(ref(gone(), 'pairing/P2MADEAA'))],
      ['make a new code', () => flows.createCode(gone(), FAM_A, CODES.fresh, 'parent')],
      ['put its member record back', () => setDoc(ref(gone(), A(`members/${U.parent2}`)), make.member(U.founder, 'XSEDPAR2', { name: "Mum's iPhone", platform: 'ios' }, 'parent', null))],
      ['delete the founder\'s device record', () => deleteDoc(ref(gone(), A('devices/devFounder')))],
      ['rewrite the device record it left behind', () => setDoc(ref(gone(), A('devices/devParent2')), make.device(U.parent2))],
      ['answer a request', () => updateDoc(ref(gone(), A('children/c1/requests/r1')), make.answer(U.parent2, 'approved'))],
      ['remove a child device', () => deleteDoc(ref(gone(), A(`members/${U.kid1}`)))],
    ]);

    test('the whole catalogue: nothing inside the family', () =>
      sweep(gone(), [...VERIFIED_STRANGER, 'delete their own users document (not having left any family)']));

    test('control: the remaining parent still approves the claim on that code, or declines it, and tidies the device record away', async () => {
      await allowed(flows.approve(h.a.founder, FAM_A, 'P2MADEAA', claimOf(h.a.joinerVerified), null));
      await allowed(deleteDoc(ref(h.a.founder, A('devices/devParent2'))));
      await h.reset();
    });
  });

  describe('who may delete a "last seen" record', () => {
    beforeEach(arrangedWith(KID1_REMOVED));

    test('a member cannot delete another member\'s record or probe for one; a stranger and no account cannot delete any', async () => {
      await attack(deleteDoc(ref(h.a.kid2, A('devices/devFounder'))));
      await attack(deleteDoc(ref(h.a.kid2, A('devices/devKid1')))); // left behind by the removed device: for a parent to tidy
      await attack(deleteDoc(ref(h.a.kid2, A('devices/devNeverThere'))));
      await attack(deleteDoc(ref(h.a.anon, A('devices/devFounder'))));
      await attack(deleteDoc(ref(h.a.anon, A('devices/devNeverThere'))));
      await attack(deleteDoc(ref(h.a.parentB, A('devices/devKid2'))));
      await attack(deleteDoc(ref(h.a.none, A('devices/devFounder'))));
      await allowed(deleteDoc(ref(h.a.kid2, A('devices/devKid2')))); // control: its own
      await allowed(deleteDoc(ref(h.a.founder, A('devices/devKid1')))); // control: a parent, any
    });

    test('a parent\'s removal batch goes through when one of the listed device records is already gone', async () => {
      const batch = writeBatch(h.a.founder.db);
      batch.delete(ref(h.a.founder, A(`members/${U.kid2}`)));
      batch.delete(ref(h.a.founder, A('devices/devKid2')));
      batch.delete(ref(h.a.founder, A('devices/devAlreadyGone')));
      await allowed(batch.commit());
    });
  });
});

// =====================================================================================================

describe('8.7 a device whose claim is waiting for a parent', () => {
  before(() => h.reset());
  const me = () => h.a.claimer; // claimed CODES.taken as "Pixel 9", android
  const code = () => ref(me(), `pairing/${CODES.taken}`);

  attacks([
    ['change the device name after the parent has seen it', () => updateDoc(code(), { claimName: "Mia's phone" })],
    ['change the platform', () => updateDoc(code(), { claimPlatform: 'ios' })],
    ['hand the claim to another account', () => updateDoc(code(), { claimedBy: U.joiner })],
    ['claim again with a new time (to look fresh)', () => updateDoc(code(), make.claim(U.claimer, { claimName: 'Pixel 9' }))],
    ['undo the claim so that the code can be claimed again', () => updateDoc(code(), { claimedBy: null, claimName: null, claimPlatform: null, claimedAt: null })],
    ['turn the child code into a parent code', () => updateDoc(code(), { role: 'parent' })],
    ['keep the code alive: a later expiry', () => updateDoc(code(), { expiresAt: minutesAhead(600) })],
    ['keep the code alive: a new creation time', () => updateDoc(code(), { createdAt: serverTimestamp() })],
    ['move the code to the other family', () => updateDoc(code(), { familyId: FAM_B })],
    ['name itself as the creator of the code', () => updateDoc(code(), { createdBy: U.claimer })],
    ['approve itself: the approval alone', () => updateDoc(code(), { approved: true })],
    ['approve itself: member record and approval in one batch', () => flows.approve(me(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' })],
    ['approve itself as a parent', () => flows.approve(me(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, null)],
    ['approve itself with the founder named as the approver', () =>
      flows.approve(me(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' }, { member: { addedBy: U.founder } })],
    ['approve itself and point its users document at the family in the same batch', () => {
      const batch = flows.approveBatch(me(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' });
      batch.set(ref(me(), `users/${U.claimer}`), make.userPointer(FAM_A, 'child'));
      return batch.commit();
    }],
    ['write the member record alone, as the parent would', () =>
      setDoc(ref(me(), A(`members/${U.claimer}`)), make.member(U.founder, CODES.taken, { name: 'Pixel 9', platform: 'android' }, 'child', 'c1'))],
    ['write a founder-style member record', () => setDoc(ref(me(), A(`members/${U.claimer}`)), make.founderMember(U.claimer))],
    ['point its users document at the family it learned from the code', () => setDoc(ref(me(), `users/${U.claimer}`), make.userPointer(FAM_A, 'child'))],
    ['read the family it learned from the code', () => getDoc(ref(me(), A()))],
    ['read the member record of the parent named in the code', () => getDoc(ref(me(), A(`members/${U.founder}`)))],
    ['read the users document of the parent named in the code', () => getDoc(ref(me(), `users/${U.founder}`))],
    ['list the members', () => getDocs(coll(me(), A('members')))],
    ['read the child profiles to pick one', () => getDocs(coll(me(), A('children')))],
    ['read the other codes of the family by query', () => getDocs(query(coll(me(), 'pairing'), where('familyId', '==', FAM_A)))],
    ['read the codes it claimed by query (a query, not a get)', () => getDocs(query(coll(me(), 'pairing'), where('claimedBy', '==', U.claimer)))],
    ['read another, unclaimed code of the family', () => getDoc(ref(me(), `pairing/${CODES.openChild}`))],
    ['delete another, unclaimed code of the family', () => deleteDoc(ref(me(), `pairing/${CODES.openChild}`))],
    ['report presence in the family', () => setDoc(ref(me(), A('devices/devPixel')), make.device(U.claimer))],
    ['announce itself in the parents\' feed', () => setDoc(ref(me(), A('alerts/nPixel')), make.alert(U.claimer, 'request', 'c1', { title: 'Please approve Pixel 9' }))],
    ['write a message to the parents', () => setDoc(ref(me(), A('children/c1/messages/mPixel')), make.message(U.claimer, 'child'))],
  ]);

  test('through REST: approve itself with a transform, a mask, or a precondition', async () => {
    await commit(restToken.claimer(), write(`pairing/${CODES.taken}`, { approved: true }, ['approved']));
    await commit(restToken.claimer(), { ...write(`pairing/${CODES.taken}`, { approved: true }, ['approved']), currentDocument: { exists: true } });
    await commit(restToken.claimer(), { transform: { document: docName(`pairing/${CODES.taken}`), fieldTransforms: [{ fieldPath: 'approved', maximum: { integerValue: '1' } }] } });
    await commit(restToken.claimer(),
      write(A(`members/${U.claimer}`), { role: 'child', childId: 'c1', name: 'Pixel 9', platform: 'android', addedBy: U.claimer, code: CODES.taken }, null, serverTime('joinedAt')),
      write(`pairing/${CODES.taken}`, { approved: true }, ['approved']));
    await restAttack(restToken.claimer(), 'POST', ':batchWrite', { writes: [write(`pairing/${CODES.taken}`, { approved: true }, ['approved'])] });
    assert.equal((await h.peek(`pairing/${CODES.taken}`)).approved, false);
  });

  test('a code it withdrew cannot be put back, by it or by another stranger', async () => {
    await h.reset();
    await allowed(deleteDoc(code())); // withdrawing its own claim is permitted
    await attack(setDoc(code(), { ...make.pairing(FAM_A, U.founder, 'child'), ...make.claim(U.claimer) }));
    await attack(setDoc(code(), make.pairing(FAM_A, U.claimer, 'child')));
    await attack(setDoc(ref(h.a.anon, `pairing/${CODES.taken}`), make.pairing(FAM_A, U.founder, 'child')));
    await attack(flows.claim(me(), CODES.taken));
    await h.reset();
  });

  test('with two claims waiting it cannot use one code\'s approval for the other', async () => {
    await h.reset();
    await allowed(flows.claim(me(), CODES.openChild));
    const cross = writeBatch(me().db);
    cross.set(ref(me(), A(`members/${U.claimer}`)), make.member(U.claimer, CODES.openChild, { name: 'Vivo V40e', platform: 'android' }, 'child', 'c1'));
    cross.update(code(), { approved: true });
    await attack(cross.commit());
    await h.reset();
  });

  test('KNOWN LIMIT: a stranger who learns a code can claim it first. What that gains: the family id and the parent\'s uid, nothing else. A parent declines it and makes another code.', async () => {
    await h.reset();
    const squatter = h.a.anon;
    await allowed(flows.claim(squatter, CODES.openChild, { claimName: "Mia's phone" })); // any name it likes
    const seen = (await getDoc(ref(squatter, `pairing/${CODES.openChild}`))).data();
    assert.deepEqual([seen.familyId, seen.createdBy, seen.role], [FAM_A, U.founder, 'child']);
    await attack(flows.claim(h.a.joiner, CODES.openChild)); // the phone the code was meant for is told "not valid"
    await attack(getDoc(ref(squatter, A())));
    await attack(getDocs(coll(squatter, A('members'))));
    await attack(getDoc(ref(squatter, A('children/c1'))));
    await attack(flows.approve(squatter, FAM_A, CODES.openChild, claimOf(squatter, { name: "Mia's phone" }), { childId: 'c1' }));
    // the parent sees a request whose 4 check characters match no phone in the room, declines, and starts again
    await allowed(deleteDoc(ref(h.a.founder, `pairing/${CODES.openChild}`)));
    await allowed(flows.createCode(h.a.founder, FAM_A, CODES.fresh));
    await allowed(flows.claim(h.a.joiner, CODES.fresh));
    await h.reset();
  });
});

// =====================================================================================================

describe('8.8 a parent and a child of another family (B) against family A', () => {
  before(() => h.reset());
  const pb = () => h.a.parentB;
  const kb = () => h.a.kidB;

  describe('pairing codes are one shared namespace', () => {
    attacks([
      ['B\'s parent makes a code for B signed by A\'s founder', () => setDoc(ref(pb(), `pairing/${CODES.fresh}`), make.pairing(FAM_B, U.founder))],
      ['B\'s parent re-issues the characters of a code that A has in use (taking it over)', () => setDoc(ref(pb(), `pairing/${CODES.taken}`), make.pairing(FAM_B, U.parentB))],
      ['B\'s parent moves A\'s open code to B', () => updateDoc(ref(pb(), `pairing/${CODES.openChild}`), { familyId: FAM_B })],
      ['B\'s parent approves the claim that is waiting in A', () => flows.approve(pb(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' })],
      ['B\'s parent enrols A\'s waiting claimer into B with A\'s code', () => flows.approve(pb(), FAM_B, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'cb1' })],
      ['B\'s parent enrols its own child device into A with a batch that approves nothing', () =>
        setDoc(ref(pb(), A(`members/${U.kidB}`)), make.member(U.parentB, 'XSEDKDBB', { name: 'iPad', platform: 'ios' }, 'child', 'c1'))],
      ['B\'s parent points its users document at A', () => setDoc(ref(pb(), `users/${U.parentB}`), make.userPointer(FAM_A, 'parent'))],
      ['B\'s parent renames A in a batch with a permitted write to B: neither must happen', () => {
        const batch = writeBatch(pb().db);
        batch.update(ref(pb(), B()), { name: 'B renamed' });
        batch.update(ref(pb(), A()), { name: 'A renamed' });
        return batch.commit();
      }],
      ['B\'s parent sends a message into A\'s thread in a batch with a message into its own', () => {
        const batch = writeBatch(pb().db);
        batch.set(ref(pb(), B('children/cb1/messages/mOwn')), make.message(U.parentB, 'parent'));
        batch.set(ref(pb(), A('children/c1/messages/mFromB')), make.message(U.parentB, 'parent'));
        return batch.commit();
      }],
      ['B\'s child raises an SOS in A in a batch with one in B', () => {
        const batch = writeBatch(kb().db);
        batch.set(ref(kb(), B('signals/sos')), make.sos(U.kidB, true, 'cb1'));
        batch.set(ref(kb(), A('signals/sos')), make.sos(U.kidB, true, 'cb1'));
        return batch.commit();
      }],
      ['B\'s child asks A\'s parents for time, naming a child of A', () => setDoc(ref(kb(), A('children/c1/requests/rFromB')), make.request(U.kidB))],
      ['B\'s child writes an alert into A\'s feed about its own child id', () => setDoc(ref(kb(), A('alerts/nFromB')), make.alert(U.kidB, 'sos', 'cb1'))],
    ]);

    for (const familyId of [`${FAM_B}/`, `/${FAM_B}`, `${FAM_B}//`, `./${FAM_B}`, ` ${FAM_B}`, `${FAM_B}\n`, `${FAM_B}/members/${U.parentB}/../..`, `${FAM_A}/../${FAM_B}`]) {
      test(`B's parent makes a code whose familyId is a path trick: ${JSON.stringify(familyId)}`, async () => {
        await attack(setDoc(ref(pb(), `pairing/${CODES.fresh}`), make.pairing(familyId, U.parentB)));
      });
    }

    test('the permitted half of those batches did not happen either', async () => {
      assert.equal((await h.peek(B())).name, 'Family B');
      assert.equal(await h.peek(B('children/cb1/messages/mOwn')), undefined);
      assert.equal((await h.peek(B('signals/sos'))).active, false);
    });
  });

  describe('a parent of B who is enrolled in A as a child device is a child in A, nothing more', () => {
    before(arrangedWith(() => ({
      [A(`members/${U.parentB}`)]: stored(make.member(U.founder, 'XSEDPBAC', { name: 'Galaxy S25', platform: 'android' }, 'child', 'c1'), minutesAgo(50)),
    })));

    test('the whole catalogue: everything a child device of c1 is refused stays refused', () =>
      sweep(h.a.parentB, OPS.filter((operation) => operation.allow.includes('kid1')).map((operation) => operation.name)));

    attacks([
      ['use its verified email to claim a parent code of A while it is in A', () => flows.claim(h.a.parentB, CODES.openParent)],
      ['make a code for A as it does for B', () => flows.createCode(h.a.parentB, FAM_A, CODES.fresh, 'parent')],
      ['make a code for A, signed as the parent it is in B', () => setDoc(ref(h.a.parentB, `pairing/${CODES.fresh}`), make.pairing(FAM_B, U.parentB, 'parent', { familyId: FAM_A }))],
      ['say "parent" in its pointer at A', () => setDoc(ref(h.a.parentB, `users/${U.parentB}`), make.userPointer(FAM_A, 'parent'))],
      ['FOUND (pointer): point its users document at A while it is still in the family the pointer names', () =>
        setDoc(ref(h.a.parentB, `users/${U.parentB}`), make.userPointer(FAM_A, 'child'))],
    ]);
  });
});

// =====================================================================================================

describe('8.9 a second parent against the founder', () => {
  before(() => h.reset());
  const me = () => h.a.parent2;
  const founderRecord = () => ref(me(), A(`members/${U.founder}`));

  attacks([
    ['remove the founder in a batch that also renames the family', () => {
      const batch = writeBatch(me().db);
      batch.update(ref(me(), A()), { name: 'Mine now' });
      batch.delete(founderRecord());
      return batch.commit();
    }],
    ['remove the founder and leave in the same batch', () => {
      const batch = writeBatch(me().db);
      batch.delete(founderRecord());
      batch.delete(ref(me(), A(`members/${U.parent2}`)));
      return batch.commit();
    }],
    ['remove the founder inside a transaction', () =>
      runTransaction(me().db, async (tx) => {
        await tx.get(founderRecord());
        tx.delete(founderRecord());
      }, { maxAttempts: 1 })],
    ['turn the founder into a child device', () => updateDoc(founderRecord(), { role: 'child', childId: 'c1' })],
    ['give the founder a childId', () => updateDoc(founderRecord(), { childId: 'c1' })],
    ['mark the founder as added by itself', () => updateDoc(founderRecord(), { addedBy: U.parent2 })],
    ['give the founder record a pairing code (as if it had been enrolled)', () => updateDoc(founderRecord(), { code: 'XSEDPAR2' })],
    ['overwrite the founder record with an enrolment record', () =>
      setDoc(founderRecord(), make.member(U.parent2, CODES.taken, { name: 'Pixel 9', platform: 'android' }, 'child', 'c1'))],
    ['overwrite the founder record in the batch that approves a waiting claim', () => {
      const batch = writeBatch(me().db);
      batch.set(founderRecord(), make.member(U.parent2, CODES.taken, { name: 'Pixel 9', platform: 'android' }, 'child', 'c1'));
      batch.update(ref(me(), `pairing/${CODES.taken}`), { approved: true });
      return batch.commit();
    }],
    ['name itself the owner of the family', () => updateDoc(ref(me(), A()), { owner: U.parent2 })],
    ['name itself the owner while renaming', () => updateDoc(ref(me(), A()), { name: 'Carter family', owner: U.parent2 })],
    ['replace the family document by one it owns', () => setDoc(ref(me(), A()), make.family(U.parent2))],
    ['remove the owner field', () => updateDoc(ref(me(), A()), { owner: deleteField() })],
    ['add a co-owner field', () => updateDoc(ref(me(), A()), { coOwner: U.parent2 })],
    ['change the layout version of the family', () => updateDoc(ref(me(), A()), { v: 3 })],
    ['re-date the family', () => updateDoc(ref(me(), A()), { createdAt: serverTimestamp() })],
    ['rename the family to an empty name', () => updateDoc(ref(me(), A()), { name: '' })],
    ['rename the family to a list', () => updateDoc(ref(me(), A()), { name: ['Carter', 'family'] })],
    ['found the family a second time: a founder-style record for itself', () => setDoc(ref(me(), A(`members/${U.parent2}`)), make.founderMember(U.parent2))],
    ['write the founder\'s users pointer', () => setDoc(ref(me(), `users/${U.founder}`), make.userPointer(FAM_A, 'parent'))],
    ['delete the founder\'s users pointer', () => deleteDoc(ref(me(), `users/${U.founder}`))],
    ['read the founder\'s users pointer', () => getDoc(ref(me(), `users/${U.founder}`))],
    ['enrol an accomplice without any code', () => setDoc(ref(me(), A(`members/${U.verified}`)), make.member(U.parent2, null, { name: 'x', platform: 'ios' }, 'parent', null))],
    ['enrol an accomplice with a code nobody claimed', () => flows.approve(me(), FAM_A, CODES.openParent, { uid: U.verified, name: 'x', platform: 'ios' }, null)],
    ['enrol an accomplice as a parent with the child code another device claimed', () => flows.approve(me(), FAM_A, CODES.taken, { uid: U.verified, name: 'Pixel 9', platform: 'android' }, null)],
    ['enrol the waiting child device as a parent', () => flows.approve(me(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, null)],
    ['enrol the waiting device with the founder named as approver', () =>
      flows.approve(me(), FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' }, { member: { addedBy: U.founder } })],
    ['enrol itself a second time as a child device', () => setDoc(ref(me(), A(`members/${U.parent2}`)), make.member(U.parent2, CODES.taken, { name: 'Pixel 9', platform: 'android' }, 'child', 'c1'))],
    ['make a code that never runs out', () => flows.createCode(me(), FAM_A, CODES.fresh, 'parent', { expiresAt: minutesAhead(60 * 24 * 365) })],
    ['make a code signed by the founder', () => setDoc(ref(me(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, 'parent'))],
    ['make a code that is claimed and approved from the start', () =>
      setDoc(ref(me(), `pairing/${CODES.fresh}`), { ...make.pairing(FAM_A, U.parent2, 'parent'), ...make.claim(U.verified), approved: true })],
    ['raise an SOS in a child\'s name', () => setDoc(ref(me(), A('signals/sos')), make.sos(U.parent2, true, 'c1'))],
    ['write a chat message as the child', () => setDoc(ref(me(), A('children/c1/messages/mFake')), make.message(U.parent2, 'child'))],
    ['write a chat message signed by the founder', () => setDoc(ref(me(), A('children/c1/messages/mFake')), make.message(U.founder, 'parent'))],
    ['edit the founder\'s chat message', () => updateDoc(ref(me(), A('children/c1/messages/m1')), { text: 'edited' })],
    ['delete a chat message', () => deleteDoc(ref(me(), A('children/c1/messages/m1')))],
    ['answer a request in the founder\'s name', () => updateDoc(ref(me(), A('children/c1/requests/r1')), make.answer(U.founder, 'approved'))],
    ['change the answer the founder gave', () => updateDoc(ref(me(), A('children/c1/requests/r3')), make.answer(U.parent2, 'denied'))],
    ['write a check-in for a child', () => setDoc(ref(me(), A('children/c1/live/status')), make.liveStatus(U.parent2))],
    ['take over the founder\'s device record', () => setDoc(ref(me(), A('devices/devFounder')), make.device(U.parent2))],
    ['delete a child profile', () => deleteDoc(ref(me(), A('children/c2')))],
    ['delete the family', () => deleteDoc(ref(me(), A()))],
  ]);

  test('the founder is still the founder', async () => {
    assert.equal((await h.peek(A())).owner, U.founder);
    assert.deepEqual([(await h.peek(A(`members/${U.founder}`))).role, (await h.peek(A(`members/${U.founder}`))).code], ['parent', null]);
  });

  test('KNOWN LIMIT: a second parent has every parent power. It can relabel the founder, remove the other members, delete what is deletable. It cannot remove or replace the founder, who can remove it.', async () => {
    await allowed(updateDoc(founderRecord(), { name: 'not the founder' }));
    await allowed(deleteDoc(ref(me(), A('devices/devFounder'))));
    await allowed(deleteDoc(ref(me(), A(`members/${U.kid1}`))));
    await allowed(deleteDoc(ref(me(), A('alerts/n1'))));
    await attack(deleteDoc(founderRecord()));
    await allowed(deleteDoc(ref(h.a.founder, A(`members/${U.parent2}`)))); // the founder's answer
    await attack(getDoc(ref(me(), A())));
    await h.reset();
  });
});

// =====================================================================================================

describe('8.10 tokens with unusual claims', () => {
  before(() => h.reset());
  const provider = (name) => ({ sign_in_provider: name, identities: {} });
  // Each of these claims to be, or to be as good as, the verified owner. (In the real service the
  // claims come from Firebase Auth; a "custom" token needs the project's service-account key, the
  // others need a sign-in method that Haven does not use to be switched on in the console.)
  const NOT_PASSWORD = {
    'custom token': { email: OWNER_EMAIL, email_verified: true, firebase: provider('custom') },
    'Google sign-in': { email: OWNER_EMAIL, email_verified: true, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['1'], email: [OWNER_EMAIL] } } },
    'Apple sign-in': { email: OWNER_EMAIL, email_verified: true, firebase: provider('apple.com') },
    'Microsoft sign-in': { email: OWNER_EMAIL, email_verified: true, firebase: provider('microsoft.com') },
    'phone sign-in': { email: OWNER_EMAIL, email_verified: true, phone_number: '+15555550100', firebase: provider('phone') },
    'an OIDC provider': { email: OWNER_EMAIL, email_verified: true, firebase: provider('oidc.example') },
    'a SAML provider': { email: OWNER_EMAIL, email_verified: true, firebase: provider('saml.example') },
    'sign_in_provider null': { email: OWNER_EMAIL, email_verified: true, firebase: provider(null) },
    'sign_in_provider "Password"': { email: OWNER_EMAIL, email_verified: true, firebase: provider('Password') },
    'sign_in_provider a list': { email: OWNER_EMAIL, email_verified: true, firebase: provider(['password']) },
    'anonymous sign-in': { email: OWNER_EMAIL, email_verified: true, provider_id: 'anonymous', firebase: provider('anonymous') },
    'no firebase claim': { email: OWNER_EMAIL, email_verified: true, firebase: undefined },
    'an empty firebase claim': { email: OWNER_EMAIL, email_verified: true, firebase: {} },
    'a firebase claim that is a string': { email: OWNER_EMAIL, email_verified: true, firebase: 'password' },
  };
  let n = 0;
  for (const [how, token] of Object.entries(NOT_PASSWORD)) {
    const uid = `oddToken${String(++n).padStart(2, '0')}`;
    test(`FOUND: verified owner address, ${how}: found a family, claim a parent code`, async () => {
      const who = actor(uid, token);
      await attack(flows.createFamily(who, `oddFamily${uid}`));
      await attack(flows.claim(who, CODES.openParent));
      await attack(getDoc(ref(who, A())));
    });
  }

  const PASSWORD_BUT_NOT_THE_OWNER = {
    'the owner address in capitals': passwordToken('OWNER@EXAMPLE.COM', true),
    'the owner address with one capital': passwordToken('Owner@example.com', true),
    'the owner address followed by a space': passwordToken(`${OWNER_EMAIL} `, true),
    'the owner address with a display name': passwordToken(`Owner <${OWNER_EMAIL}>`, true),
    'the owner address as a list': { ...passwordToken(OWNER_EMAIL, true), email: [OWNER_EMAIL] },
    'the owner address as a longer address': passwordToken(`${OWNER_EMAIL}.evil.example`, true),
    'a sub-address of the owner': passwordToken(OWNER_EMAIL.replace('@', '+x@'), true),
    'no email claim at all': { email_verified: true, firebase: provider('password') },
    'email_verified as the string "true"': { ...passwordToken(OWNER_EMAIL, false), email_verified: 'true' },
    'email_verified as the number 1': { ...passwordToken(OWNER_EMAIL, false), email_verified: 1 },
    'email_verified missing': { email: OWNER_EMAIL, firebase: provider('password') },
    'the owner address only in identities': { ...passwordToken('someone@example.net', true), firebase: { sign_in_provider: 'password', identities: { email: [OWNER_EMAIL] } } },
    'custom claims owner/admin/parent': { ...passwordToken('someone@example.net', true), owner: true, admin: true, role: 'parent', familyId: FAM_A },
  };
  for (const [how, token] of Object.entries(PASSWORD_BUT_NOT_THE_OWNER)) {
    const uid = `oddToken${String(++n).padStart(2, '0')}`;
    test(`password sign-in, ${how}: found a family`, async () => {
      const who = actor(uid, token);
      await attack(flows.createFamily(who, `oddFamily${uid}`));
      await attack(getDoc(ref(who, A())));
      await attack(getDoc(ref(who, A('alerts/n1'))));
    });
  }

  attacks([
    ['email_verified as a string: claim a parent code', () => flows.claim(actor('oddVerifiedString', { ...passwordToken('x@example.net', false), email_verified: 'true' }), CODES.openParent)],
    ['email_verified as 1: claim a parent code', () => flows.claim(actor('oddVerifiedOne', { ...passwordToken('x@example.net', false), email_verified: 1 }), CODES.openParent)],
    ['anonymous token with custom claims role/childId/familyId: read the family', () => getDoc(ref(actor('oddClaimsChild', { ...anonymousToken(), role: 'parent', childId: 'c1', familyId: FAM_A, parent: true }), A()))],
    ['anonymous token with custom claims: read the profile the claims name', () => getDoc(ref(actor('oddClaimsChild2', { ...anonymousToken(), role: 'child', childId: 'c1', familyId: FAM_A }), A('children/c1')))],
    ['a uid that ends in a slash after the founder\'s uid: read the family', () => getDoc(ref(actor(`${U.founder}/`, anonymousToken()), A()))],
    ['a uid that is a path through the founder\'s record: read the family', () => getDoc(ref(actor(`${U.founder}/../${U.founder}`, anonymousToken()), A()))],
    ['a uid that is a path to a document it could write: read the family', () => getDoc(ref(actor(`${U.kid1}/x`, anonymousToken()), A()))],
    ['the founder\'s uid in capitals: read the family', () => getDoc(ref(actor(U.founder.toUpperCase(), passwordToken(OWNER_EMAIL, true)), A()))],
    ['the founder\'s uid with a trailing space: read the family', () => getDoc(ref(actor(`${U.founder} `, passwordToken(OWNER_EMAIL, true)), A()))],
  ]);

  test('through REST: a custom-provider token with the verified owner address founds a family', async () => {
    const uid = 'restCustomOwner';
    await commit(idToken(uid, { email: OWNER_EMAIL, email_verified: true, firebase: provider('custom') }),
      write('families/restCustomFamily0001', { v: 2, owner: uid, name: 'x' }, null, serverTime('createdAt')),
      write(`families/restCustomFamily0001/members/${uid}`, { role: 'parent', childId: null, name: 'x', platform: 'web', addedBy: uid, code: null }, null, serverTime('joinedAt')),
      write(`users/${uid}`, { familyId: 'restCustomFamily0001', role: 'parent' }, null, serverTime('updatedAt')));
  });

  test('the whole catalogue with a custom-provider "verified owner" token: a stranger, and not a verified one', () =>
    sweep(actor('sweepCustomOwner', NOT_PASSWORD['custom token']), STRANGER));
  test('the whole catalogue with an anonymous token that carries the verified owner address: a stranger', () =>
    sweep(actor('sweepAnonOwner', NOT_PASSWORD['anonymous sign-in']), STRANGER));
  test('the whole catalogue with a token without the firebase claim: a stranger', () =>
    sweep(actor('sweepNoFirebase', NOT_PASSWORD['no firebase claim']), STRANGER));
  test('the whole catalogue with the owner address in capitals (verified, password): a verified stranger, not an owner', () =>
    sweep(actor('sweepUpperOwner', PASSWORD_BUT_NOT_THE_OWNER['the owner address in capitals']), VERIFIED_STRANGER));

  test('control: the same family batch is accepted from the verified owner address with password sign-in', async () => {
    await h.empty();
    await allowed(flows.createFamily(actor('realOwnerAccount', passwordToken(OWNER_EMAIL, true)), 'realOwnerFamily00001'));
    await h.reset();
  });
});

// =====================================================================================================

describe('8.11 pairing codes: reuse, replay, resurrection, hijacking', () => {
  const USED = 'XSEDKD22'; // the code that enrolled the child device of c1; here it was never tidied away
  before(arrangedWith(() => ({
    [`pairing/${USED}`]: { ...stored(make.pairing(FAM_A, U.founder, 'child'), minutesAgo(400)), ...stored(make.claim(U.kid1), minutesAgo(399)), approved: true },
    'pairing/EXPREDAA': stored(make.pairing(FAM_A, U.founder, 'child', { expiresAt: minutesAgo(5) }), minutesAgo(20)),
    'pairing/LATECLAM': { ...stored(make.pairing(FAM_A, U.founder, 'child', { expiresAt: minutesAgo(25) }), minutesAgo(40)), ...stored(make.claim(U.joiner), minutesAgo(26)) },
  })));
  const stranger = () => h.a.joiner2;
  const used = (who) => ref(who, `pairing/${USED}`);

  attacks([
    ['a stranger claims a code that was used', () => flows.claim(stranger(), USED)],
    ['a stranger reads a code that was used', () => getDoc(used(stranger()))],
    ['a stranger deletes a used code to free its characters', () => deleteDoc(used(stranger()))],
    ['the enrolled device un-approves its used code', () => updateDoc(used(h.a.kid1), { approved: false })],
    ['the enrolled device hands its used code to a friend', () => updateDoc(used(h.a.kid1), { claimedBy: U.joiner2, approved: false })],
    ['a parent un-approves a used code to enrol another device with it', () => updateDoc(used(h.a.founder), { approved: false })],
    ['a parent re-opens a used code by clearing the claim', () => updateDoc(used(h.a.founder), { claimedBy: null, claimName: null, claimPlatform: null, claimedAt: null, approved: false })],
    ['a parent overwrites a used code with a fresh one', () => setDoc(used(h.a.founder), make.pairing(FAM_A, U.founder, 'child'))],
    ['a parent approves a used code a second time for another account', () => flows.approve(h.a.founder, FAM_A, USED, { uid: U.joiner2, name: 'Vivo V40e', platform: 'android' }, { childId: 'c2' })],
    ['a parent enrols a second account naming the used code, approving nothing', () =>
      setDoc(ref(h.a.founder, A(`members/${U.joiner2}`)), make.member(U.founder, USED, { name: 'Vivo V40e', platform: 'android' }, 'child', 'c2'))],
    ['a parent enrols a second account naming the used code, in the batch that approves another waiting claim', () => {
      const batch = flows.approveBatch(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' });
      batch.set(ref(h.a.founder, A(`members/${U.joiner2}`)), make.member(U.founder, USED, { name: 'Vivo V40e', platform: 'android' }, 'child', 'c2'));
      return batch.commit();
    }],
    ['two accounts enrolled with one approval (the second names the same code)', () => {
      const batch = flows.approveBatch(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' });
      batch.set(ref(h.a.founder, A(`members/${U.joiner2}`)), make.member(U.founder, CODES.taken, { name: 'Pixel 9', platform: 'android' }, 'child', 'c1'));
      return batch.commit();
    }],
    ['a stranger claims a code that ran out', () => flows.claim(stranger(), 'EXPREDAA')],
    ['a stranger claims a code that ran out, with its own later expiry', () => updateDoc(ref(stranger(), 'pairing/EXPREDAA'), { ...make.claim(U.joiner2), expiresAt: minutesAhead(10) })],
    ['a parent revives a code that ran out by moving its expiry', () => updateDoc(ref(h.a.founder, 'pairing/EXPREDAA'), { expiresAt: minutesAhead(10) })],
    ['a parent revives a code that ran out by re-dating it', () => updateDoc(ref(h.a.founder, 'pairing/EXPREDAA'), { createdAt: serverTimestamp(), expiresAt: minutesAhead(10) })],
    ['a parent writes a new code over the one that ran out (same characters)', () => setDoc(ref(h.a.founder, 'pairing/EXPREDAA'), make.pairing(FAM_A, U.founder, 'child'))],
    ['a parent approves a claim after the grace period', () => flows.approve(h.a.founder, FAM_A, 'LATECLAM', claimOf(h.a.joiner), { childId: 'c1' })],
    ['the late claimer approves itself', () => flows.approve(h.a.joiner, FAM_A, 'LATECLAM', claimOf(h.a.joiner), { childId: 'c1' })],
    ['a stranger takes over a waiting claim', () => updateDoc(ref(stranger(), `pairing/${CODES.taken}`), make.claim(U.joiner2))],
    ['a stranger takes over a waiting claim but keeps the name the parent saw', () => updateDoc(ref(stranger(), `pairing/${CODES.taken}`), { claimedBy: U.joiner2 })],
    ['a stranger declines somebody else\'s waiting claim', () => deleteDoc(ref(stranger(), `pairing/${CODES.taken}`))],
    ['the approving parent enrols another account than the one that claimed', () => flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.joiner2, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' })],
    ['the approving parent enrols the claimer under another name than it claimed with', () => flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: "Mia's phone", platform: 'android' }, { childId: 'c1' })],
    ['the approving parent enrols the claimer with another platform than it claimed with', () => flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'ios' }, { childId: 'c1' })],
    ['the approving parent enrols the claimer of a child code as a parent', () => flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, null)],
    ['approval whose member record is removed again by the same batch (the code would be spent on nobody)', () => {
      const batch = flows.approveBatch(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' });
      batch.delete(ref(h.a.founder, A(`members/${U.claimer}`)));
      return batch.commit();
    }],
    ['enrolment whose code is deleted by the same batch instead of being marked used', () => {
      const batch = writeBatch(h.a.founder.db);
      batch.set(ref(h.a.founder, A(`members/${U.claimer}`)), make.member(U.founder, CODES.taken, { name: 'Pixel 9', platform: 'android' }, 'child', 'c1'));
      batch.delete(ref(h.a.founder, `pairing/${CODES.taken}`));
      return batch.commit();
    }],
    ['a stranger: a member record written and deleted in one batch, to carry a users pointer', () => {
      const who = stranger();
      const batch = writeBatch(who.db);
      batch.set(ref(who, A(`members/${U.joiner2}`)), make.founderMember(U.joiner2));
      batch.delete(ref(who, A(`members/${U.joiner2}`)));
      batch.set(ref(who, `users/${U.joiner2}`), make.userPointer(FAM_A, 'parent'));
      return batch.commit();
    }],
    ['a child device approves a waiting claim in the batch in which a parent record for itself would exist "afterwards"', () => {
      const who = h.a.kid2;
      const batch = flows.approveBatch(who, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c2' });
      batch.set(ref(who, A(`members/${U.kid2}`)), make.founderMember(U.kid2));
      return batch.commit();
    }],
    ['the approving parent enrols the claimer with a role as a list', () =>
      flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' }, { member: { role: ['child', 'parent'] } })],
    ['the approving parent enrols the claimer with an extra field (admin: true)', () =>
      flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' }, { member: { admin: true } })],
    ['the approving parent enrols the claimer as a child of another family\'s profile', () =>
      flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'cb1' })],
    ['the approving parent back-dates the enrolment', () =>
      flows.approve(h.a.founder, FAM_A, CODES.taken, { uid: U.claimer, name: 'Pixel 9', platform: 'android' }, { childId: 'c1' }, { member: { joinedAt: minutesAgo(10_000) } })],
  ]);

  test('nobody was enrolled and no code changed', async () => {
    assert.equal(await h.peek(A(`members/${U.joiner2}`)), undefined);
    assert.equal(await h.peek(A(`members/${U.claimer}`)), undefined);
    assert.equal((await h.peek(`pairing/${USED}`)).approved, true);
    assert.equal((await h.peek(`pairing/${CODES.taken}`)).claimedBy, U.claimer);
  });
});

// =====================================================================================================

describe('8.12 creating a family: the owner list, one family each, the founder\'s place', () => {
  // A second account that also holds a verified owner address (as when the list has two entries).
  let second = null;
  const otherOwner = () => (second ??= actor('ownerTwoAccount', passwordToken(OWNER_EMAIL, true), 'second owner-listed account'));

  describe('against the family that exists', () => {
    before(() => h.reset());
    attacks([
      ['another owner-listed account founds "its" family under the existing id', () => flows.createFamily(otherOwner(), FAM_A)],
      ['another owner-listed account writes a founder record for itself into the existing family', () => setDoc(ref(otherOwner(), A('members/ownerTwoAccount')), make.founderMember('ownerTwoAccount'))],
      ['another owner-listed account names itself owner of the existing family', () => updateDoc(ref(otherOwner(), A()), { owner: 'ownerTwoAccount' })],
      ['another owner-listed account points its users document at the existing family', () => setDoc(ref(otherOwner(), 'users/ownerTwoAccount'), make.userPointer(FAM_A, 'parent'))],
      ['another owner-listed account reads the existing family', () => getDoc(ref(otherOwner(), A()))],
      ['another owner-listed account founds a family for the existing founder (to bind it elsewhere)', () => {
        const who = otherOwner();
        const batch = writeBatch(who.db);
        batch.set(ref(who, 'families/forcedFamily00000001'), make.family(U.founder));
        batch.set(ref(who, `families/forcedFamily00000001/members/${U.founder}`), make.founderMember(U.founder));
        batch.set(ref(who, `users/${U.founder}`), make.userPointer('forcedFamily00000001', 'parent'));
        return batch.commit();
      }],
      ['another owner-listed account founds two families in one batch', () => {
        const who = otherOwner();
        const batch = writeBatch(who.db);
        for (const fid of ['twinFamily0000000001', 'twinFamily0000000002']) {
          batch.set(ref(who, `families/${fid}`), make.family(who.uid));
          batch.set(ref(who, `families/${fid}/members/${who.uid}`), make.founderMember(who.uid));
        }
        batch.set(ref(who, `users/${who.uid}`), make.userPointer('twinFamily0000000001', 'parent'));
        return batch.commit();
      }],
      ['another owner-listed account founds a family whose founder record is a child', () =>
        flows.createFamily(otherOwner(), 'oddFounderFamily0001', { member: make.founderMember('ownerTwoAccount', { role: 'child', childId: 'c1' }) })],
      ['another owner-listed account founds a family and a second parent record in the same batch', () => {
        const who = otherOwner();
        const batch = writeBatch(who.db);
        batch.set(ref(who, 'families/twoParents000000001'), make.family(who.uid));
        batch.set(ref(who, `families/twoParents000000001/members/${who.uid}`), make.founderMember(who.uid));
        batch.set(ref(who, `families/twoParents000000001/members/${U.verified}`), make.founderMember(U.verified, { addedBy: who.uid }));
        batch.set(ref(who, `users/${who.uid}`), make.userPointer('twoParents000000001', 'parent'));
        return batch.commit();
      }],
      ['another owner-listed account founds a family with a 41-character id', () => flows.createFamily(otherOwner(), 'f'.repeat(41))],
      ['another owner-listed account founds a family whose id contains a space', () => flows.createFamily(otherOwner(), 'my family')],
      ['another owner-listed account founds a family whose id ends in a line break', () => flows.createFamily(otherOwner(), 'lineBreakFamily00001\n')],
      ['another owner-listed account founds a family whose id contains a dot', () => flows.createFamily(otherOwner(), 'dot.family')],
      ['another owner-listed account founds a family with layout version "2" (a string)', () => flows.createFamily(otherOwner(), 'stringVersion0000001', { family: make.family('ownerTwoAccount', { v: '2' }) })],
      ['another owner-listed account founds a family with a back-dated creation time', () => flows.createFamily(otherOwner(), 'backDated00000000001', { family: make.family('ownerTwoAccount', { createdAt: minutesAgo(10_000) }) })],
      ['the founder founds a second family and moves its pointer there in the same batch', () => flows.createFamily(h.a.founder, 'secondFamily00000002')],
      ['the founder founds a second family, keeping its pointer where it is', () => {
        const who = h.a.founder;
        const batch = writeBatch(who.db);
        batch.set(ref(who, 'families/secondFamily00000002'), make.family(U.founder));
        batch.set(ref(who, `families/secondFamily00000002/members/${U.founder}`), make.founderMember(U.founder));
        batch.set(ref(who, `users/${U.founder}`), make.userPointer(FAM_A, 'parent'));
        return batch.commit();
      }],
    ]);

    test('control: that second owner-listed account can found one family of its own', async () => {
      await allowed(flows.createFamily(otherOwner(), 'ownerTwoFamily000001'));
      await attack(flows.createFamily(otherOwner(), 'ownerTwoFamily000002'));
      await h.reset();
    });
  });

  describe('FOUND: a second family through another family (the users pointer parked elsewhere)', () => {
    // The founder of A has also been enrolled, properly, as a parent of family B.
    beforeEach(arrangedWith(() => ({
      [B(`members/${U.founder}`)]: stored(make.member(U.parentB, 'XSEDFNDB', { name: "Dad's iPhone", platform: 'ios' }, 'parent', null), minutesAgo(30)),
    })));
    const founder = () => h.a.founder;
    const pointer = () => ref(founder(), `users/${U.founder}`);

    test('the founder cannot move its pointer to the other family, so it can never be deleted, so no second family', async () => {
      await attack(setDoc(pointer(), make.userPointer(FAM_B, 'parent'))); // step 1 of the attack: this used to be accepted
      await attack(updateDoc(pointer(), { familyId: FAM_B, updatedAt: serverTimestamp() }));
      await attack(deleteDoc(pointer()));
      await attack(flows.createFamily(founder(), 'secondFamily00000003'));
      assert.equal((await h.peek(`users/${U.founder}`)).familyId, FAM_A);
    });

    test('not in one batch either: move the pointer, leave the other family, found the second one', async () => {
      const move = writeBatch(founder().db);
      move.set(pointer(), make.userPointer(FAM_B, 'parent'));
      move.delete(ref(founder(), B(`members/${U.founder}`)));
      await attack(move.commit());
      const all = writeBatch(founder().db);
      all.delete(ref(founder(), B(`members/${U.founder}`)));
      all.delete(pointer());
      all.set(ref(founder(), 'families/secondFamily00000003'), make.family(U.founder));
      all.set(ref(founder(), `families/secondFamily00000003/members/${U.founder}`), make.founderMember(U.founder));
      await attack(all.commit());
      assert.equal(await h.peek('families/secondFamily00000003'), undefined);
    });

    test('control: an account that has left its family may point at the next one (alone, or in the batch that leaves)', async () => {
      const mover = h.a.parent2; // a parent of A, also enrolled in B
      await h.arrange({ [B(`members/${U.parent2}`)]: stored(make.member(U.parentB, 'XSEDP2NB', { name: "Mum's iPhone", platform: 'ios' }, 'parent', null)) });
      await attack(setDoc(ref(mover, `users/${U.parent2}`), make.userPointer(FAM_B, 'parent'))); // still in A
      const batch = writeBatch(mover.db);
      batch.delete(ref(mover, A(`members/${U.parent2}`)));
      batch.set(ref(mover, `users/${U.parent2}`), make.userPointer(FAM_B, 'parent'));
      await allowed(batch.commit());
      await allowed(setDoc(ref(mover, `users/${U.parent2}`), make.userPointer(FAM_B, 'parent'))); // refreshing it is fine
      await attack(setDoc(ref(mover, `users/${U.parent2}`), make.userPointer(FAM_A, 'parent'))); // and A is closed to it
    });

    test('control: a device that was removed and then enrolled elsewhere moves its stale pointer without deleting it first', async () => {
      await h.arrange({ [A(`members/${U.kid1}`)]: null, [B(`members/${U.kid1}`)]: stored(make.member(U.parentB, 'XSEDK1NB', { name: 'Vivo V40e', platform: 'android' }, 'child', 'cb1')) });
      await allowed(setDoc(ref(h.a.kid1, `users/${U.kid1}`), make.userPointer(FAM_B, 'child')));
    });
  });
});

// =====================================================================================================

describe('8.13 unexpected ids, types and sizes', () => {
  before(() => h.reset());
  const kid = () => h.a.kid1;
  const founder = () => h.a.founder;
  const ODD_IDS = ['r1\n', '\nr1', 'r 1', 'r.1', 'r%2F1', 'ré1', '..r1', 'r1\u0000', '‮r1', 'x'.repeat(41)];

  for (const id of ODD_IDS) {
    test(`a child device creates documents whose id is ${JSON.stringify(id.length > 20 ? `${id.slice(0, 5)}… (${id.length} characters)` : id)}`, async () => {
      await attack(setDoc(doc(kid().db, A('children/c1/requests'), id), make.request(U.kid1)));
      await attack(setDoc(doc(kid().db, A('children/c1/messages'), id), make.message(U.kid1, 'child')));
      await attack(setDoc(doc(kid().db, A('alerts'), id), make.alert(U.kid1, 'checkin', 'c1')));
      await attack(setDoc(doc(kid().db, A('devices'), id), make.device(U.kid1)));
      await attack(setDoc(doc(founder().db, A('children'), id), make.child({ name: 'Odd' })));
      await attack(setDoc(doc(founder().db, A('places'), id), make.place()));
      await attack(setDoc(doc(founder().db, A('tasks'), id), make.task()));
    });
  }

  attacks([
    ['a parent makes a pairing code that ends in a line break', () => setDoc(doc(founder().db, 'pairing', 'ABCDEFG2\n'), make.pairing(FAM_A, U.founder))],
    ['a parent makes a pairing code in lower case', () => setDoc(doc(founder().db, 'pairing', 'abcdefgh'), make.pairing(FAM_A, U.founder))],
    ['a parent makes a pairing code with a look-alike letter (O)', () => setDoc(doc(founder().db, 'pairing', 'ABCDEFGO'), make.pairing(FAM_A, U.founder))],
    ['a parent makes a pairing code of 4 characters (easier to guess)', () => setDoc(doc(founder().db, 'pairing', 'ABCD'), make.pairing(FAM_A, U.founder))],
    ['a parent makes a pairing code for the role "admin"', () => setDoc(ref(founder(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, 'admin'))],
    ['a parent makes a pairing code whose role is a list', () => setDoc(ref(founder(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, ['child', 'parent']))],
    ['a parent makes a pairing code whose expiry is a number', () => setDoc(ref(founder(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, 'child', { expiresAt: Date.now() + 600_000 }))],
    ['a parent makes a pairing code whose expiry is the server time itself', () => setDoc(ref(founder(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, 'child', { expiresAt: serverTimestamp() }))],
    ['a parent makes a pairing code whose "approved" is null', () => setDoc(ref(founder(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, 'child', { approved: null }))],
    ['a parent makes a pairing code whose claimedBy is an empty string', () => setDoc(ref(founder(), `pairing/${CODES.fresh}`), make.pairing(FAM_A, U.founder, 'child', { claimedBy: '' }))],
    ['a child device ticks a task through a field path into a map', () => updateDoc(ref(kid(), A('tasks/t2')), { 'done.value': true })],
    ['a child device writes a check-in whose time is a map of seconds and nanoseconds', () =>
      setDoc(ref(kid(), A('children/c1/live/status')), make.liveStatus(U.kid1, { checkInAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } }))],
    ['a child device writes a check-in whose time is a string', () => setDoc(ref(kid(), A('children/c1/live/status')), make.liveStatus(U.kid1, { checkInAt: new Date().toISOString() }))],
    ['a child device signs with its uid in a list', () => setDoc(ref(kid(), A('children/c1/live/status')), make.liveStatus([U.kid1]))],
    ['a child device reports presence with a name of one megabyte', () => setDoc(ref(kid(), A('devices/devKid1')), make.device(U.kid1, { name: 'x'.repeat(1_000_000) }))],
    ['a child device reports presence with an empty name', () => setDoc(ref(kid(), A('devices/devKid1')), make.device(U.kid1, { name: '' }))],
    ['a child device reports presence with a platform it invented', () => setDoc(ref(kid(), A('devices/devKid1')), make.device(U.kid1, { platform: 'harmonyos' }))],
    ['a child device reports presence with a nested map as platform', () => setDoc(ref(kid(), A('devices/devKid1')), make.device(U.kid1, { platform: { os: 'android' } }))],
    ['a parent sets a limit of NaN', () => updateDoc(ref(founder(), A('children/c1')), { limitMin: Number.NaN })],
    ['a parent sets a limit of infinity', () => updateDoc(ref(founder(), A('children/c1')), { limitMin: Number.POSITIVE_INFINITY })],
    ['a parent sets a limit of 1441 minutes', () => updateDoc(ref(founder(), A('children/c1')), { limitMin: 1441 })],
    ['a parent sets a negative limit', () => updateDoc(ref(founder(), A('children/c1')), { limitMin: -1 })],
    ['a parent sets a limit as a string', () => updateDoc(ref(founder(), A('children/c1')), { limitMin: '600' })],
    ['a parent stores 61 app rules', () => updateDoc(ref(founder(), A('children/c1')), { apps: Array.from({ length: 61 }, (_, i) => ({ id: `a${i}` })) })],
    ['a parent stores the app rules as a map', () => updateDoc(ref(founder(), A('children/c1')), { apps: { a1: { blocked: false } } })],
    ['a parent stores 8 days of history', () => updateDoc(ref(founder(), A('children/c1')), { weekly: [1, 2, 3, 4, 5, 6, 7, 8] })],
    ['a parent adds an unknown field to a child profile', () => updateDoc(ref(founder(), A('children/c1')), { secretNote: 'x' })],
    ['a parent removes a field from a child profile', () => updateDoc(ref(founder(), A('children/c1')), { bedtime: deleteField() })],
    ['a parent makes a place with a radius of NaN', () => setDoc(ref(founder(), A('places/pOdd')), make.place({ radius: Number.NaN }))],
    ['a parent makes a place with an infinite radius', () => setDoc(ref(founder(), A('places/pOdd')), make.place({ radius: Number.POSITIVE_INFINITY }))],
    ['a parent makes a task worth 1001 points', () => setDoc(ref(founder(), A('tasks/tOdd')), make.task({ points: 1001 }))],
    ['a parent makes a task worth 10.5 points', () => setDoc(ref(founder(), A('tasks/tOdd')), make.task({ points: 10.5 }))],
    ['a parent makes a site rule for a host of 254 characters', () => setDoc(ref(founder(), A('sites/wOdd')), make.site({ host: 'h'.repeat(254) }))],
    ['a parent makes a site rule on a list that is neither blocked nor allowed', () => setDoc(ref(founder(), A('sites/wOdd')), make.site({ list: 'ignored' }))],
    ['a parent makes a schedule whose colour ends in a line break', () => setDoc(ref(founder(), A('schedules/sOdd')), make.schedule({ color: '#FF7A59\n' }))],
    ['a parent makes a schedule with 6 days', () => setDoc(ref(founder(), A('schedules/sOdd')), make.schedule({ days: [true, true, true, true, true, true] }))],
    ['a parent relabels a member with a name of 41 characters', () => updateDoc(ref(founder(), A(`members/${U.kid1}`)), { name: 'x'.repeat(41) })],
    ['a parent points a child device at a child id that is a path to another document', () => updateDoc(ref(founder(), A(`members/${U.kid1}`)), { childId: 'c2/live/status' })],
    ['a parent points a child device at a child id with a trailing slash', () => updateDoc(ref(founder(), A(`members/${U.kid1}`)), { childId: 'c2/' })],
    ['a parent points a child device at no child', () => updateDoc(ref(founder(), A(`members/${U.kid1}`)), { childId: null })],
  ]);
});

// =====================================================================================================

describe('8.14 queries that would return more than single reads allow', () => {
  before(() => h.reset());
  const GROUPS = ['families', 'users', 'pairing', 'members', 'devices', 'children', 'live', 'requests', 'messages', 'alerts', 'places', 'schedules', 'sites', 'tasks', 'signals'];

  for (const key of ['anon', 'claimer', 'kid1', 'kidB', 'parentB', 'founder']) {
    test(`${key}: every collection as a collection group, across all families`, async () => {
      for (const id of GROUPS) await attack(getDocs(collectionGroup(h.a[key].db, id)));
      await attack(getCountFromServer(collectionGroup(h.a[key].db, 'members')));
      await attack(getDocs(query(collectionGroup(h.a[key].db, 'members'), where('role', '==', 'parent'), limit(1))));
      await attack(getDocs(query(collectionGroup(h.a[key].db, 'pairing'), where('claimedBy', '==', null))));
    });
    test(`${key}: list, count and query the top-level collections`, async () => {
      const who = h.a[key];
      for (const id of ['families', 'users', 'pairing']) {
        await attack(getDocs(collection(who.db, id)));
        await attack(getCountFromServer(collection(who.db, id)));
        await attack(getDocs(query(collection(who.db, id), limit(1))));
      }
      await attack(getDocs(query(collection(who.db, 'families'), where(documentId(), '==', FAM_A))));
      await attack(getDocs(query(collection(who.db, 'families'), where('owner', '==', who.selfId))));
      await attack(getDocs(query(collection(who.db, 'users'), where(documentId(), '==', who.selfId))));
      await attack(getDocs(query(collection(who.db, 'pairing'), where(documentId(), '==', CODES.openChild))));
      await attack(getDocs(query(collection(who.db, 'pairing'), where('createdBy', '==', who.selfId))));
      await attack(getDocs(query(collection(who.db, 'pairing'), where('claimedBy', '==', who.selfId), limit(1))));
      await attack(getDocs(query(collection(who.db, 'pairing'), where('familyId', '==', FAM_A), where('approved', '==', false))));
    });
  }

  test('through REST as a stranger and as another family\'s parent: descendants of family A, counts, batch reads', async () => {
    for (const token of [restToken.anon(), restToken.parentB()]) {
      await restAttack(token, 'POST', `/${A()}:runQuery`, allDescendants(null));
      await restAttack(token, 'POST', `/${A()}:runQuery`, allDescendants('members'));
      await restAttack(token, 'POST', `/${A()}:runQuery`, { structuredQuery: { from: [{ collectionId: 'members' }], limit: 1 } });
      await restAttack(token, 'POST', `/${A()}:runAggregationQuery`, { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'children' }] }, aggregations: [{ alias: 'n', count: {} }] } });
      await restAttack(token, 'POST', ':batchGet', { documents: [docName(A()), docName(A(`members/${U.founder}`)), docName(`pairing/${CODES.openChild}`)] });
      await restAttack(token, 'GET', `/${A('members')}?showMissing=true`);
      await restAttack(token, 'POST', `/${A()}:listCollectionIds`, {});
    }
  });
});

// =====================================================================================================

describe('8.15 lasting damage a member can do, and what the rules can and cannot do about it', () => {
  beforeEach(() => h.reset());

  test('KNOWN LIMIT: a child device can write as many messages, requests, alerts and device records as it likes (rules cannot count); only messages are permanent', async () => {
    const kid = h.a.kid1;
    const flood = writeBatch(kid.db);
    for (let i = 0; i < 50; i++) flood.set(ref(kid, A(`children/c1/messages/flood${i}`)), make.message(U.kid1, 'child', { text: 'x'.repeat(2000) }));
    for (let i = 0; i < 50; i++) flood.set(ref(kid, A(`children/c1/requests/flood${i}`)), make.request(U.kid1));
    for (let i = 0; i < 50; i++) flood.set(ref(kid, A(`alerts/flood${i}`)), make.alert(U.kid1, 'sos', 'c1'));
    for (let i = 0; i < 50; i++) flood.set(ref(kid, A(`devices/flood${i}`)), make.device(U.kid1));
    await allowed(flood.commit());
    // what a parent can do: delete requests, alerts and device records, and remove the device
    await allowed(deleteDoc(ref(h.a.founder, A('children/c1/requests/flood0'))));
    await allowed(deleteDoc(ref(h.a.founder, A('alerts/flood0'))));
    await allowed(deleteDoc(ref(h.a.founder, A('devices/flood0'))));
    await attack(deleteDoc(ref(h.a.founder, A('children/c1/messages/flood0')))); // chat is never deleted, by design
    await allowed(deleteDoc(ref(h.a.founder, A(`members/${U.kid1}`))));
    await attack(setDoc(ref(kid, A('children/c1/messages/floodAfter')), make.message(U.kid1, 'child')));
  });

  test('KNOWN LIMIT: a child device can fake feed entries about itself (an SOS alert without an SOS, "left" without leaving); it cannot touch other entries', async () => {
    const kid = h.a.kid1;
    await allowed(setDoc(ref(kid, A('alerts/nFakeLeft')), make.alert(U.kid1, 'left', 'c1', { title: 'Mia’s phone left the family' })));
    await allowed(setDoc(ref(kid, A('alerts/nFakeSos')), make.alert(U.kid1, 'sos', 'c1', { title: 'Weekly report is ready' })));
    await attack(setDoc(ref(kid, A('alerts/nFakeLeo')), make.alert(U.kid1, 'left', 'c2')));
    await attack(deleteDoc(ref(kid, A('alerts/nFakeLeft'))));
    assert.equal((await h.peek(A(`members/${U.kid1}`))).role, 'child');
  });

  test('KNOWN LIMIT: a child device can leave with its SOS raised; a parent clears it', async () => {
    const kid = h.a.kid2;
    await h.arrange({ [A('signals/sos')]: stored(make.sos(U.founder, false, 'c1')) });
    const batch = writeBatch(kid.db);
    batch.set(ref(kid, A('signals/sos')), make.sos(U.kid2, true, 'c2'));
    batch.delete(ref(kid, A(`members/${U.kid2}`)));
    await allowed(batch.commit());
    await attack(setDoc(ref(kid, A('signals/sos')), make.sos(U.kid2, true, 'c2'))); // gone: no more writes
    await allowed(setDoc(ref(h.a.founder, A('signals/sos')), make.sos(U.founder, false, 'c2')));
  });

  test('KNOWN LIMIT: a member can occupy a device id that is free (ids are per phone, records are per account); the phone that returns to it cannot report presence until a parent deletes the record', async () => {
    // the child device of c1 unlinks: its "last seen" record goes. The sibling knew the id from the device list.
    await allowed(deleteDoc(ref(h.a.kid1, A('devices/devKid1'))));
    await allowed(setDoc(ref(h.a.kid2, A('devices/devKid1')), make.device(U.kid2, { name: 'Vivo V40e' })));
    await attack(setDoc(ref(h.a.kid1, A('devices/devKid1')), make.device(U.kid1))); // the app ignores this failure: presence only
    await attack(deleteDoc(ref(h.a.kid1, A('devices/devKid1'))));
    // nothing else of the phone is affected
    await allowed(setDoc(ref(h.a.kid1, A('children/c1/live/status')), make.liveStatus(U.kid1)));
    await allowed(setDoc(ref(h.a.kid1, A('signals/sos')), make.sos(U.kid1, true, 'c1')));
    // a parent deletes the squatting record and the phone reports again
    await allowed(deleteDoc(ref(h.a.founder, A('devices/devKid1'))));
    await allowed(setDoc(ref(h.a.kid1, A('devices/devKid1')), make.device(U.kid1)));
    // a parent's own id can be occupied the same way once its record is gone, and the parent frees it itself
    await allowed(deleteDoc(ref(h.a.parent2, A('devices/devFounder'))));
    await allowed(setDoc(ref(h.a.kid2, A('devices/devFounder')), make.device(U.kid2, { name: "Dad's iPhone", platform: 'ios' })));
    await attack(setDoc(ref(h.a.founder, A('devices/devFounder')), make.device(U.founder)));
    await allowed(deleteDoc(ref(h.a.founder, A('devices/devFounder'))));
    await allowed(setDoc(ref(h.a.founder, A('devices/devFounder')), make.device(U.founder)));
  });

  test('KNOWN LIMIT: a child profile, once created by any parent, can never be deleted (its history hangs below it); its content can be corrected', async () => {
    await allowed(setDoc(ref(h.a.parent2, A('children/cJunk')), make.child({ name: 'junk', ord: Number.NaN, apps: Array.from({ length: 60 }, () => 'x'.repeat(1000)) })));
    await attack(deleteDoc(ref(h.a.founder, A('children/cJunk'))));
    await allowed(updateDoc(ref(h.a.founder, A('children/cJunk')), { name: 'Spare profile', apps: [], ord: 99 }));
  });

  test('a child device cannot make the SOS flag, its check-in or a task unwritable for others', async () => {
    const kid = h.a.kid1;
    await allowed(setDoc(ref(kid, A('signals/sos')), make.sos(U.kid1, true, 'c1')));
    await allowed(setDoc(ref(h.a.founder, A('signals/sos')), make.sos(U.founder, false, 'c1'))); // a parent can always clear
    await allowed(setDoc(ref(h.a.kid2, A('signals/sos')), make.sos(U.kid2, true, 'c2'))); // the sibling can always raise
    await allowed(updateDoc(ref(kid, A('tasks/t2')), { done: true }));
    await allowed(updateDoc(ref(h.a.founder, A('tasks/t2')), { done: false, title: 'Tidy your room, really' }));
    await allowed(deleteDoc(ref(h.a.founder, A('tasks/t2'))));
  });

  test('a waiting claim does not block the family: more codes can be made, and the stale one deleted, also after it ran out', async () => {
    await h.arrange({ 'pairing/STALEAAA': { ...stored(make.pairing(FAM_A, U.founder, 'child', { expiresAt: minutesAgo(45) }), minutesAgo(60)), ...stored(make.claim(U.anon), minutesAgo(50)) } });
    await allowed(flows.createCode(h.a.founder, FAM_A, CODES.fresh));
    await allowed(flows.createCode(h.a.parent2, FAM_A, CODES.fresh2, 'parent'));
    await allowed(deleteDoc(ref(h.a.parent2, 'pairing/STALEAAA')));
    await allowed(deleteDoc(ref(h.a.founder, `pairing/${CODES.taken}`)));
  });
});

// =====================================================================================================

describe('8.16 the reverse: Firestore\'s limits must not refuse what the app sends', () => {
  beforeEach(() => h.reset());

  test('documents at their largest permitted size are accepted: profile with 60 app rules, longest names, longest message, request and alert', async () => {
    const big = make.child({
      name: 'N'.repeat(60), deviceName: 'D'.repeat(60), place: 'P'.repeat(60), placeIcon: 'i'.repeat(40), age: 25, battery: 100, usedMin: 1440, limitMin: 1440,
      apps: Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, name: 'App '.repeat(10), icon: 'gamepad-variant', color: '#12B5A6', category: 'games', usedMin: 1440, limitMin: 1440, blocked: true })),
    });
    await allowed(setDoc(ref(h.a.founder, A('children/cBig')), big));
    await allowed(updateDoc(ref(h.a.founder, A('children/cBig')), { limitMin: 0 }));
    await allowed(setDoc(ref(h.a.kid1, A('children/c1/messages/mBig')), make.message(U.kid1, 'child', { text: '\u{1F600}'.repeat(1000) })));
    await allowed(setDoc(ref(h.a.kid1, A(`children/c1/requests/${'r'.repeat(40)}`)), make.unlockRequest(U.kid1, { label: 'L'.repeat(80), detail: 'D'.repeat(200), appId: 'a'.repeat(40), minutes: 240 })));
    await allowed(setDoc(ref(h.a.kid1, A(`alerts/${'n'.repeat(40)}`)), make.alert(U.kid1, 'request', 'c1', { icon: 'i'.repeat(40), title: 'T'.repeat(120), body: 'B'.repeat(240) })));
    await allowed(setDoc(ref(h.a.founder, A('sites/wBig')), make.site({ host: 'h'.repeat(253) })));
  });

  test('20 writes in one batch (the app\'s largest) are accepted for every kind of parent document, and 20 for a child device', async () => {
    const parent = h.a.founder;
    const profiles = writeBatch(parent.db);
    for (let i = 0; i < 20; i++) profiles.set(ref(parent, A(`children/cBatch${i}`)), make.child({ name: `Child ${i}`, ord: i }));
    await allowed(profiles.commit());
    const mixed = writeBatch(parent.db);
    for (let i = 0; i < 5; i++) {
      mixed.set(ref(parent, A(`schedules/sBatch${i}`)), make.schedule({ ord: i }));
      mixed.set(ref(parent, A(`places/pBatch${i}`)), make.place({ ord: i }));
      mixed.set(ref(parent, A(`alerts/nBatch${i}`)), make.alert(U.founder, 'report', null));
      mixed.set(ref(parent, A(`children/cBatch${i}/messages/mBatch`)), make.message(U.founder, 'parent')); // one more lookup each
    }
    await allowed(mixed.commit());
    const kid = h.a.kid1;
    const child = writeBatch(kid.db);
    for (let i = 0; i < 9; i++) child.set(ref(kid, A(`alerts/nKid${i}`)), make.alert(U.kid1, 'request', 'c1'));
    for (let i = 0; i < 9; i++) child.set(ref(kid, A(`children/c1/requests/rKid${i}`)), make.request(U.kid1));
    child.set(ref(kid, A('signals/sos')), make.sos(U.kid1, true, 'c1'));
    child.set(ref(kid, A('children/c1/live/status')), make.liveStatus(U.kid1));
    await allowed(child.commit());
  });

  test('a parent removes a device that has 19 "last seen" records in one batch of 20 (accepted here; see the note on lookups)', async () => {
    // Worst case by Firestore's own counting, if no lookup were shared between the writes of a
    // batch: 3 for the member record + 1 per device record = 22, above the limit of 20. The
    // emulator shares the lookup of the caller's member record, and so, as far as its
    // documentation says, does the service ("some document access calls may be cached"). Sending
    // the member record's removal in a batch of its own would not depend on that.
    const docs = {};
    for (let i = 0; i < 19; i++) docs[A(`devices/many${i}`)] = stored(make.device(U.kid1));
    await h.arrange(docs);
    const batch = writeBatch(h.a.founder.db);
    batch.delete(ref(h.a.founder, A(`members/${U.kid1}`)));
    for (let i = 0; i < 19; i++) batch.delete(ref(h.a.founder, A(`devices/many${i}`)));
    await allowed(batch.commit());
  });

  test('the pointer write of a joining device and of a returning parent is still one accepted write', async () => {
    await allowed(setDoc(ref(h.a.kid1, `users/${U.kid1}`), make.userPointer(FAM_A, 'child')));
    await allowed(setDoc(ref(h.a.founder, `users/${U.founder}`), make.userPointer(FAM_A, 'parent')));
    await allowed(flows.claim(h.a.joiner, CODES.openChild));
    await allowed(flows.approve(h.a.founder, FAM_A, CODES.openChild, claimOf(h.a.joiner), { newChild: { id: 'cJoin', name: 'Noa' } }));
    assert.equal(await flows.finishJoin(h.a.joiner, CODES.openChild), FAM_A);
  });
});

// =====================================================================================================

test('8.17 how many requests were tried', (t) => {
  t.diagnostic(`red team: ${tried} requests that must be refused were sent in this file, and all were refused`);
  assert.ok(tried > 0);
});
