// 5. Abuse of pairing codes. A code is the only way into a family, so every step is attacked:
// guessing, claiming, reading, approving, enrolling, reusing and creating codes.
//
// States that cannot be produced through the rules (a code that expired, an approval that is
// overdue) are arranged with the rules switched off.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { deleteDoc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

import {
  A, allowed, B, claimOf, CODES, coll, FAM_A, FAM_B, flows, harness, make, matrixTests, minutesAgo, minutesAhead, omit,
  ref, refused, U,
} from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

const parent = () => h.a.founder;
const device = () => h.a.joiner; // a fresh anonymous device that knows a code

/** A stored pairing code of family A, in whatever state a test needs. */
function codeDoc({ fid = FAM_A, by = U.founder, role = 'child', createdMinAgo = 1, expiresInMin = 14, claim = null, approved = false } = {}) {
  return {
    familyId: fid, role, createdBy: by, createdAt: minutesAgo(createdMinAgo), expiresAt: minutesAhead(expiresInMin),
    claimedBy: claim ? claim.uid : null,
    claimName: claim ? claim.name : null,
    claimPlatform: claim ? claim.platform : null,
    claimedAt: claim ? minutesAgo(Math.max(createdMinAgo - 0.5, 0)) : null,
    approved,
  };
}
const pairing = (code) => `pairing/${code}`;
const EXPIRED = 'EXPDAAAA';
const STALE = 'STAKEAAA';
const USED = 'XSEDAAAA';

describe('5.1 claiming a code', () => {
  beforeEach(() => h.reset());

  test('a code that does not exist cannot be claimed', async () => {
    await refused(flows.claim(device(), CODES.missing));
    assert.equal(await h.peek(pairing(CODES.missing)), undefined, 'and the attempt does not create it');
  });

  test('a missing code, an expired code and a taken code are refused in the same way: a guess learns nothing', async () => {
    await h.arrange({ [pairing(EXPIRED)]: codeDoc({ createdMinAgo: 20, expiresInMin: -5 }) });
    const outcomes = [];
    for (const code of [CODES.missing, EXPIRED, CODES.taken]) {
      const claimError = await refused(flows.claim(device(), code));
      const readError = await refused(getDoc(ref(device(), pairing(code))));
      const deleteError = await refused(deleteDoc(ref(device(), pairing(code))));
      outcomes.push([claimError.code, readError.code, deleteError.code].join(' '));
    }
    assert.deepEqual(outcomes, Array(3).fill('permission-denied permission-denied permission-denied'));
  });

  test('an expired code cannot be claimed (expiresAt has passed)', async () => {
    await h.arrange({ [pairing(EXPIRED)]: codeDoc({ createdMinAgo: 10, expiresInMin: -1 }) });
    await refused(flows.claim(device(), EXPIRED));
  });

  test('a code cannot be claimed more than 15 minutes after the server stored it, whatever expiresAt says', async () => {
    await h.arrange({ [pairing(STALE)]: codeDoc({ createdMinAgo: 16, expiresInMin: 4 }) });
    await refused(flows.claim(device(), STALE));
  });

  test('control: a code can still be claimed in its 15th minute', async () => {
    await h.arrange({ [pairing(STALE)]: codeDoc({ createdMinAgo: 14, expiresInMin: 1 }) });
    await allowed(flows.claim(device(), STALE));
  });

  test('a code somebody else already claimed cannot be claimed', async () => {
    await refused(flows.claim(device(), CODES.taken));
    assert.equal((await h.peek(pairing(CODES.taken))).claimedBy, U.claimer);
  });

  test('a device cannot claim twice or change its claim afterwards', async () => {
    await allowed(flows.claim(device(), CODES.openChild));
    await refused(flows.claim(device(), CODES.openChild));
    await refused(updateDoc(ref(device(), pairing(CODES.openChild)), { claimName: "Dad's iPhone" }));
    await refused(updateDoc(ref(device(), pairing(CODES.openChild)), { claimPlatform: 'ios' }));
    await refused(updateDoc(ref(device(), pairing(CODES.openChild)), { claimedAt: serverTimestamp() }));
  });

  test('a claim cannot be handed on or undone by editing the code', async () => {
    const claimed = ref(h.a.claimer, pairing(CODES.taken));
    await refused(updateDoc(claimed, { claimedBy: U.joiner }));
    await refused(updateDoc(claimed, { claimedBy: null, claimName: null, claimPlatform: null, claimedAt: null }));
    await refused(updateDoc(ref(parent(), pairing(CODES.taken)), { claimedBy: null, claimName: null, claimPlatform: null, claimedAt: null }));
  });

  test('a device cannot claim in somebody else\'s name', async () => {
    await refused(updateDoc(ref(device(), pairing(CODES.openChild)), make.claim(U.kid2)));
    await refused(updateDoc(ref(device(), pairing(CODES.openChild)), make.claim(U.founder)));
  });

  test('a claim cannot change anything else on the code', async () => {
    const open = ref(device(), pairing(CODES.openChild));
    await refused(updateDoc(open, { ...make.claim(U.joiner), approved: true }));
    await refused(updateDoc(open, { ...make.claim(U.joiner), role: 'parent' }));
    await refused(updateDoc(open, { ...make.claim(U.joiner), familyId: FAM_B }));
    await refused(updateDoc(open, { ...make.claim(U.joiner), expiresAt: minutesAhead(600) }));
    await refused(updateDoc(open, { ...make.claim(U.joiner), createdBy: U.joiner }));
    await refused(updateDoc(open, { ...make.claim(U.joiner), note: 'let me in' }));
    await allowed(updateDoc(open, make.claim(U.joiner))); // control
  });

  test('a claim needs a device name, a known platform and the server time', async () => {
    const open = ref(device(), pairing(CODES.openChild));
    await refused(updateDoc(open, make.claim(U.joiner, { claimName: '' })));
    await refused(updateDoc(open, make.claim(U.joiner, { claimName: 'x'.repeat(41) })));
    await refused(updateDoc(open, make.claim(U.joiner, { claimName: 42 })));
    await refused(updateDoc(open, make.claim(U.joiner, { claimPlatform: 'windows' })));
    await refused(updateDoc(open, make.claim(U.joiner, { claimedAt: Timestamp.now() })));
    await refused(updateDoc(open, make.claim(U.joiner, { claimedAt: null })));
    await refused(updateDoc(open, omit(make.claim(U.joiner), 'claimName')));
    await refused(updateDoc(open, { claimedBy: U.joiner }));
    await allowed(updateDoc(open, make.claim(U.joiner))); // control
  });

  test('a parent code cannot be claimed by an anonymous device', async () => {
    await refused(flows.claim(h.a.joiner, CODES.openParent));
    await refused(flows.claim(h.a.anon, CODES.openParent));
  });

  test('a parent code cannot be claimed by an account with an unverified email', async () => {
    await refused(flows.claim(h.a.joinerUnverified, CODES.openParent));
    await refused(flows.claim(h.a.impostor, CODES.openParent)); // unverified, using the owner's address
  });

  test('control: a parent code can be claimed by an account with a verified email', async () => {
    await allowed(flows.claim(h.a.joinerVerified, CODES.openParent));
  });

  test('without a token nothing can be claimed', async () => {
    await refused(updateDoc(ref(h.a.none, pairing(CODES.openChild)), make.claim('noAccount')));
  });

  test('somebody already in the family cannot claim one of its codes', async () => {
    await refused(flows.claim(h.a.kid1, CODES.openChild));
    await refused(flows.claim(h.a.parent2, CODES.openParent));
    await refused(flows.claim(h.a.founder, CODES.openParent));
  });

  test('writing a whole document at a guessed code neither creates nor replaces it', async () => {
    const forged = { ...codeDoc({ claim: claimOf(device()) }), createdAt: serverTimestamp(), claimedAt: serverTimestamp() };
    await refused(setDoc(ref(device(), pairing(CODES.missing)), forged));
    await refused(setDoc(ref(device(), pairing(CODES.missing)), make.claim(U.joiner), { merge: true }));
    await refused(setDoc(ref(device(), pairing(CODES.openChild)), forged));
  });
});

describe('5.2 reading codes', () => {
  before(() => h.reset());

  test('a device cannot read a code it knows before claiming it', async () => {
    await refused(getDoc(ref(device(), pairing(CODES.openChild))));
    await refused(getDoc(ref(h.a.joinerVerified, pairing(CODES.openParent))));
  });

  test('nobody can list or query codes: not a stranger, not a claimer, not a child, not even a parent', async () => {
    for (const key of ['joiner', 'verified', 'claimer', 'kid1', 'parentB', 'founder', 'parent2']) {
      const actor = h.a[key];
      await refused(getDocs(coll(actor, 'pairing')));
      await refused(getDocs(query(coll(actor, 'pairing'), where('familyId', '==', FAM_A))));
      await refused(getDocs(query(coll(actor, 'pairing'), where('claimedBy', '==', actor.uid))));
      await refused(getDocs(query(coll(actor, 'pairing'), where('approved', '==', false))));
      await refused(getDocs(query(coll(actor, 'pairing'), where('createdBy', '==', actor.uid))));
    }
  });

  test('a claimer reads its own claim and nobody else\'s', async () => {
    await allowed(getDoc(ref(h.a.claimer, pairing(CODES.taken))));
    await refused(getDoc(ref(h.a.claimer, pairing(CODES.openChild))));
    await refused(getDoc(ref(h.a.joiner, pairing(CODES.taken))));
    await refused(getDoc(ref(h.a.verified, pairing(CODES.taken))));
  });

  test('a parent reads the codes of its own family only', async () => {
    await allowed(getDoc(ref(h.a.parent2, pairing(CODES.taken))));
    await refused(getDoc(ref(h.a.parent2, pairing(CODES.bOpen))));
    await refused(getDoc(ref(h.a.parentB, pairing(CODES.taken))));
  });

  test('a code that does not exist reads as "refused" for everyone, parents included', async () => {
    for (const key of ['none', 'joiner', 'claimer', 'kid1', 'founder', 'parentB']) {
      await refused(getDoc(ref(h.a[key], pairing(CODES.missing))));
    }
  });
});

describe('5.3 approving a claim and enrolling the device', () => {
  beforeEach(() => h.reset());
  const claim = () => claimOf(h.a.claimer, { name: 'Pixel 9' });
  const memberRef = (actor, uid = U.claimer) => ref(actor, A(`members/${uid}`));
  const memberData = (over = {}) => make.member(U.founder, CODES.taken, claim(), 'child', 'c1', over);
  /** The approval batch with one thing wrong in the member record. */
  const approveWith = (over, actor = parent()) => flows.approve(actor, FAM_A, CODES.taken, claim(), { childId: 'c1' }, { member: over });

  test('control: the correct approval batch is accepted', async () => {
    await allowed(approveWith({}));
    assert.equal((await h.peek(A(`members/${U.claimer}`))).role, 'child');
  });

  test('approving without the member record is refused', async () => {
    await refused(updateDoc(ref(parent(), pairing(CODES.taken)), { approved: true }));
    assert.equal((await h.peek(pairing(CODES.taken))).approved, false);
  });

  test('creating the member record without approving the code is refused', async () => {
    await refused(setDoc(memberRef(parent()), memberData()));
    assert.equal(await h.peek(A(`members/${U.claimer}`)), undefined);
  });

  test('member record and approval as two separate writes are refused in either order', async () => {
    await refused(setDoc(memberRef(parent()), memberData()));
    await refused(updateDoc(ref(parent(), pairing(CODES.taken)), { approved: true }));
    await refused(setDoc(memberRef(parent()), memberData()));
  });

  test('a claimer cannot approve itself', async () => {
    const claimer = h.a.claimer;
    await refused(updateDoc(ref(claimer, pairing(CODES.taken)), { approved: true }));
    await refused(setDoc(memberRef(claimer), make.member(U.claimer, CODES.taken, claim(), 'child', 'c1')));
    await refused(setDoc(memberRef(claimer), make.member(U.founder, CODES.taken, claim(), 'child', 'c1'))); // signing as the parent
    const batch = writeBatch(claimer.db);
    batch.set(memberRef(claimer), make.member(U.claimer, CODES.taken, claim(), 'child', 'c1'));
    batch.update(ref(claimer, pairing(CODES.taken)), { approved: true });
    await refused(batch.commit());
    const asFounder = writeBatch(claimer.db);
    asFounder.set(memberRef(claimer), make.member(U.founder, CODES.taken, claim(), 'child', 'c1'));
    asFounder.update(ref(claimer, pairing(CODES.taken)), { approved: true });
    await refused(asFounder.commit());
  });

  test('a claimer cannot write users/{uid} for the family before it has been approved', async () => {
    await refused(setDoc(ref(h.a.claimer, `users/${U.claimer}`), make.userPointer(FAM_A, 'child')));
    await refused(setDoc(ref(h.a.claimer, `users/${U.claimer}`), make.userPointer(FAM_A, 'parent')));
    await allowed(approveWith({}));
    await refused(setDoc(ref(h.a.claimer, `users/${U.claimer}`), make.userPointer(FAM_A, 'parent'))); // approved as a child only
    await allowed(setDoc(ref(h.a.claimer, `users/${U.claimer}`), make.userPointer(FAM_A, 'child')));
  });

  test('a code nobody claimed cannot be approved, with or without a member record', async () => {
    await refused(updateDoc(ref(parent(), pairing(CODES.openChild)), { approved: true }));
    const batch = writeBatch(parent().db);
    batch.set(memberRef(parent(), U.joiner), make.member(U.founder, CODES.openChild, claimOf(h.a.joiner), 'child', 'c1'));
    batch.update(ref(parent(), pairing(CODES.openChild)), { approved: true });
    await refused(batch.commit());
  });

  test('an account other than the one that claimed cannot be enrolled with the code', async () => {
    const batch = writeBatch(parent().db);
    batch.set(memberRef(parent(), U.joiner), make.member(U.founder, CODES.taken, claim(), 'child', 'c1'));
    batch.update(ref(parent(), pairing(CODES.taken)), { approved: true });
    await refused(batch.commit());
  });

  test('the member record must have the role the code was made for', async () => {
    await refused(approveWith({ role: 'parent', childId: null })); // a child code used to make a parent
    await h.arrange({ [pairing(CODES.fresh)]: codeDoc({ role: 'parent', claim: claimOf(h.a.joinerVerified) }) });
    const asChild = writeBatch(parent().db); // a parent code used to enrol a child device
    asChild.set(memberRef(parent(), U.joinerVerified), make.member(U.founder, CODES.fresh, claimOf(h.a.joinerVerified), 'child', 'c1'));
    asChild.update(ref(parent(), pairing(CODES.fresh)), { approved: true });
    await refused(asChild.commit());
    await refused(approveWith({ role: 'admin' }));
  });

  test('the member record must carry the name the device claimed with', async () => {
    await refused(approveWith({ name: "Dad's iPhone" }));
  });

  test('the member record must carry the platform the device claimed with', async () => {
    await refused(approveWith({ platform: 'ios' }));
  });

  test('a child device cannot be enrolled for a child profile that does not exist', async () => {
    await refused(approveWith({ childId: 'cGhost' }));
    await refused(approveWith({ childId: null }));
    await refused(approveWith({ childId: 7 }));
    await refused(approveWith({ childId: '' }));
  });

  test('a child device cannot be enrolled with a childId that is a path to some other document', async () => {
    await refused(approveWith({ childId: 'c1/messages/m1' }));
    await refused(approveWith({ childId: `../members/${U.founder}` }));
  });

  test('control: the child profile may be created in the same batch as the enrolment', async () => {
    await allowed(flows.approve(parent(), FAM_A, CODES.taken, claim(), { newChild: { id: 'cBrandNew', name: 'Noa' } }));
  });

  test('a parent member cannot be given a childId', async () => {
    await h.arrange({ [pairing(CODES.fresh)]: codeDoc({ role: 'parent', claim: claimOf(h.a.joinerVerified) }) });
    const batch = writeBatch(parent().db);
    batch.set(memberRef(parent(), U.joinerVerified), make.member(U.founder, CODES.fresh, claimOf(h.a.joinerVerified), 'parent', 'c1'));
    batch.update(ref(parent(), pairing(CODES.fresh)), { approved: true });
    await refused(batch.commit());
    const good = flows.approveBatch(parent(), FAM_A, CODES.fresh, claimOf(h.a.joinerVerified), null);
    await allowed(good.commit()); // control
  });

  test('the member record must name the code that is being approved', async () => {
    await refused(approveWith({ code: CODES.openChild }));
    await refused(approveWith({ code: null }));
    await refused(approveWith({ code: 'XSEDKD22' }));
    await refused(approveWith({ code: CODES.missing }));
  });

  test('a claim cannot be approved once the grace period after the code\'s end is over', async () => {
    await h.arrange({ [pairing(STALE)]: codeDoc({ createdMinAgo: 31, expiresInMin: -16, claim: claimOf(device()) }) });
    await refused(flows.approve(parent(), FAM_A, STALE, claimOf(device()), { childId: 'c1' }));
    await refused(updateDoc(ref(parent(), pairing(STALE)), { approved: true }));
  });

  test('the grace period is counted from the server\'s creation time, whatever expiresAt says', async () => {
    await h.arrange({ [pairing(STALE)]: codeDoc({ createdMinAgo: 31, expiresInMin: 3, claim: claimOf(device()) }) });
    await refused(flows.approve(parent(), FAM_A, STALE, claimOf(device()), { childId: 'c1' }));
  });

  test('control: a claim made in time can still be approved shortly after the code has ended', async () => {
    await h.arrange({ [pairing(STALE)]: codeDoc({ createdMinAgo: 20, expiresInMin: -5, claim: claimOf(device()) }) });
    await allowed(flows.approve(parent(), FAM_A, STALE, claimOf(device()), { childId: 'c1' }));
  });

  test('an approved code cannot be approved again, un-approved or claimed by someone else', async () => {
    await allowed(approveWith({}));
    await refused(updateDoc(ref(parent(), pairing(CODES.taken)), { approved: true, claimedBy: U.joiner }));
    await refused(updateDoc(ref(parent(), pairing(CODES.taken)), { approved: false }));
    await refused(flows.claim(device(), CODES.taken));
    await refused(updateDoc(ref(h.a.claimer, pairing(CODES.taken)), { approved: false }));
  });

  test('an approved code cannot be reused to enrol another member', async () => {
    await allowed(approveWith({}));
    const other = claimOf(device(), { name: 'Pixel 9' });
    await refused(setDoc(memberRef(parent(), U.joiner), make.member(U.founder, CODES.taken, other, 'child', 'c1')));
    const batch = writeBatch(parent().db);
    batch.set(memberRef(parent(), U.joiner), make.member(U.founder, CODES.taken, other, 'child', 'c1'));
    batch.update(ref(parent(), pairing(CODES.taken)), { approved: true });
    await refused(batch.commit());
  });

  test('a removed member cannot be re-added with its old, used code', async () => {
    await allowed(approveWith({}));
    await allowed(deleteDoc(memberRef(parent())));
    // the used code is still there, approved
    await refused(setDoc(memberRef(parent()), memberData()));
    await refused(approveWith({}));
    // ... and after it has been tidied away
    await allowed(deleteDoc(ref(parent(), pairing(CODES.taken))));
    await refused(setDoc(memberRef(parent()), memberData()));
    await refused(approveWith({}));
  });

  test('re-creating a code with the same characters does not bring a removed member back without a new claim', async () => {
    await allowed(approveWith({}));
    await allowed(deleteDoc(memberRef(parent())));
    await allowed(deleteDoc(ref(parent(), pairing(CODES.taken))));
    await allowed(flows.createCode(parent(), FAM_A, CODES.taken, 'child'));
    await refused(setDoc(memberRef(parent()), memberData()));
    await refused(approveWith({}));
    // the removed device itself, without its old member record, cannot use the old approval either
    await refused(setDoc(ref(h.a.claimer, `users/${U.claimer}`), make.userPointer(FAM_A, 'child')));
    await refused(getDoc(ref(h.a.claimer, A())));
  });

  test('a code of one family cannot enrol anyone into another family', async () => {
    const attacker = h.a.parentB;
    const batch = writeBatch(attacker.db);
    batch.set(ref(attacker, B(`members/${U.claimer}`)), make.member(U.parentB, CODES.taken, claim(), 'child', 'cb1'));
    batch.update(ref(attacker, pairing(CODES.taken)), { approved: true });
    await refused(batch.commit());
    await h.arrange({ [pairing(CODES.fresh)]: codeDoc({ fid: FAM_B, by: U.parentB, claim: claimOf(device()) }) });
    await refused(flows.approve(parent(), FAM_A, CODES.fresh, claimOf(device()), { childId: 'c1' })); // B's code into family A
  });

  test('a parent cannot enrol somebody as a founder-style member (no code)', async () => {
    await refused(setDoc(memberRef(parent(), U.joiner), make.founderMember(U.joiner)));
    await refused(setDoc(memberRef(parent(), U.joiner), make.founderMember(U.founder)));
  });

  test('after approval the device is exactly what it was approved as: the child device of that one child', async () => {
    await allowed(flows.approve(parent(), FAM_A, CODES.taken, claim(), { childId: 'c2' }));
    const joined = h.a.claimer;
    await allowed(flows.finishJoin(joined, CODES.taken, 'child'));
    await allowed(getDoc(ref(joined, A('children/c2'))));
    await refused(getDoc(ref(joined, A('children/c1'))));
    await refused(getDocs(coll(joined, A('children'))));
    await refused(updateDoc(ref(joined, A('children/c2')), { limitMin: 1440 }));
    await refused(flows.createCode(joined, FAM_A, CODES.fresh, 'parent'));
    await refused(updateDoc(ref(joined, A(`members/${U.claimer}`)), { role: 'parent', childId: null }));
  });
});

describe('5.4 creating codes', () => {
  beforeEach(() => h.reset());
  const create = (code, over = {}, actor = parent(), fid = FAM_A) => setDoc(ref(actor, pairing(code)), make.pairing(fid, actor.selfId, 'child', over));

  test('control: a parent creates an 8-character code that lasts 15 minutes', async () => {
    await allowed(create(CODES.fresh));
  });

  for (const [why, code] of [
    ['7 characters', 'ABCDEFG'],
    ['9 characters', 'ABCDEFGHJ'],
    ['1 character', 'A'],
    ['40 characters', 'A'.repeat(40)],
    ['lower case', 'abcdefgh'],
    ['mixed case', 'ABCDefgh'],
    ['the letter O', 'ABCDEFGO'],
    ['the digit 0', 'ABCDEFG0'],
    ['the letter I', 'ABCDEFGI'],
    ['the digit 1', 'ABCDEFG1'],
    ['the letter L', 'ABCDEFGL'],
    ['a dash', 'ABCD-FGH'],
    ['a space', 'ABCD FGH'],
    ['a dot', 'ABCD.FGH'],
  ]) {
    test(`a code with ${why} ("${code}") is refused`, async () => {
      await refused(create(code));
    });
  }

  test('a code cannot be made to last longer than the 15 minutes (plus the 5 minutes allowed for a fast phone clock)', async () => {
    await refused(create(CODES.fresh, { expiresAt: minutesAhead(21) }));
    await refused(create(CODES.fresh, { expiresAt: minutesAhead(60) }));
    await refused(create(CODES.fresh, { expiresAt: minutesAhead(60 * 24 * 365) }));
    await allowed(create(CODES.fresh, { expiresAt: minutesAhead(15) })); // control
  });

  test('a code whose expiry is 15 to 20 minutes ahead is stored, but still stops working after 15 minutes', async () => {
    await allowed(create(CODES.fresh, { expiresAt: minutesAhead(19) }));
    // the same code, 16 minutes later (arranged: only the server's creation time is moved back)
    const later = await h.peek(pairing(CODES.fresh));
    await h.arrange({ [pairing(CODES.fresh)]: { ...later, createdAt: minutesAgo(16) } });
    await refused(flows.claim(device(), CODES.fresh));
  });

  test('a code cannot be created already expired, or with an expiry that is not a time', async () => {
    await refused(create(CODES.fresh, { expiresAt: minutesAgo(1) }));
    await refused(create(CODES.fresh, { expiresAt: Date.now() + 600_000 }));
    await refused(create(CODES.fresh, { expiresAt: '2099-01-01T00:00:00Z' }));
    await refused(create(CODES.fresh, { expiresAt: null }));
    await refused(setDoc(ref(parent(), pairing(CODES.fresh)), omit(make.pairing(FAM_A, U.founder, 'child'), 'expiresAt')));
  });

  test('a code cannot be created already claimed or already approved', async () => {
    await refused(create(CODES.fresh, { approved: true }));
    await refused(create(CODES.fresh, { claimedBy: U.joiner, claimName: 'Vivo V40e', claimPlatform: 'android', claimedAt: serverTimestamp() }));
    await refused(create(CODES.fresh, { claimedBy: U.joiner }));
    await refused(create(CODES.fresh, { claimName: 'Vivo V40e' }));
    await refused(create(CODES.fresh, { claimPlatform: 'android' }));
    await refused(create(CODES.fresh, { claimedAt: serverTimestamp() }));
  });

  test('a code can only be for a child or a parent', async () => {
    await refused(create(CODES.fresh, { role: 'admin' }));
    await refused(create(CODES.fresh, { role: 'owner' }));
    await refused(create(CODES.fresh, { role: null }));
    await refused(create(CODES.fresh, { role: ['parent'] }));
  });

  test('a code must be signed by its creator and stamped by the server', async () => {
    await refused(create(CODES.fresh, { createdBy: U.parent2 }));
    await refused(create(CODES.fresh, { createdAt: Timestamp.now() }));
    await refused(create(CODES.fresh, { createdAt: minutesAhead(30) })); // a creation time in the future would stretch the 15 minutes
    await refused(create(CODES.fresh, { createdAt: null }));
  });

  test('a code cannot point at a family its creator is not a parent of, or at no family at all', async () => {
    await refused(create(CODES.fresh, {}, parent(), FAM_B));
    await refused(create(CODES.fresh, {}, parent(), 'noSuchFamily00000001'));
    await refused(create(CODES.fresh, { familyId: null }));
    await refused(create(CODES.fresh, { familyId: 42 }));
    await refused(create(CODES.fresh, {}, h.a.kid1));
    await refused(create(CODES.fresh, {}, h.a.verified));
    await refused(create(CODES.fresh, {}, h.a.none));
  });

  test('an existing code cannot be written again: not to reset a claim, extend it or change its role', async () => {
    await refused(create(CODES.taken)); // would wipe the claim
    await refused(create(CODES.openChild, { expiresAt: minutesAhead(15) }));
    await refused(setDoc(ref(parent(), pairing(CODES.openChild)), make.pairing(FAM_A, U.founder, 'parent')));
    await refused(updateDoc(ref(parent(), pairing(CODES.openChild)), { role: 'parent' }));
    await refused(updateDoc(ref(parent(), pairing(CODES.openChild)), { expiresAt: minutesAhead(14) }));
    await refused(updateDoc(ref(parent(), pairing(CODES.openChild)), { createdAt: serverTimestamp() }));
    await refused(updateDoc(ref(parent(), pairing(CODES.openChild)), { familyId: FAM_B }));
    await refused(updateDoc(ref(parent(), pairing(CODES.openChild)), { createdBy: U.parent2 }));
  });

  test('a parent of another family cannot overwrite, read or delete a code by guessing its characters', async () => {
    const other = h.a.parentB;
    await refused(setDoc(ref(other, pairing(CODES.openChild)), make.pairing(FAM_B, U.parentB, 'child')));
    await refused(getDoc(ref(other, pairing(CODES.openChild))));
    await refused(deleteDoc(ref(other, pairing(CODES.openChild))));
    assert.equal((await h.peek(pairing(CODES.openChild))).familyId, FAM_A);
  });
});

describe('5.5 a device that claimed a code but has not been approved has no access to the family', () => {
  matrixTests(h, ['claimer']);
});
