// 7. Firestore limits how many other documents the rules may look up (exists/get/getAfter/
// existsAfter): 10 per write and 20 per batch. Past the limit the request is refused, so a flow
// that needs too many lookups would fail for a legitimate user.
//
// How this file measures: a parent's chat message into a child's thread costs exactly one extra
// lookup (does that child exist?). Adding k such messages, each to a DIFFERENT child, to a batch
// adds k lookups. The largest k that is still accepted tells how many of the 20 the batch itself
// used. The first test checks the measuring stick: 20 lookups pass, the 21st is refused.
//
// What the numbers mean. The emulator counts a document once per request, however many writes
// of the batch look it up, and does not count documents that the batch itself writes. Those are
// the "measured" figures printed by each test. Each test also states the WORST CASE: every
// lookup in the rules counted separately, nothing shared. The assertion is that the measured
// figure does not exceed the worst case, and every worst case is itself within the limits:
//
//   flow                                    writes   worst case   limit
//   family creation (batch 1)                  3          8         20
//   seed (batch 2)                            12         12         20   (one per write)
//   approval, existing or new child            3          8         20
//   approval, second parent                    2          6         20
//   parent removes a member + 1 device         2          4         20
//   child leaves (device, member, pointer)     3          3         20
//   costliest single write (member record
//   in the approval batch)                     1          4         10

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { writeBatch } from 'firebase/firestore';

import { A, allowed, CODES, FAM_A, flows, harness, make, ref, refused, SEED, stored, U } from './helpers.mjs';

const h = harness();
before(() => h.start());
after(() => h.stop());

const BATCH_LIMIT = 20;
const SPARE_CHILDREN = Array.from({ length: 20 }, (_, i) => `spare${String(i + 1).padStart(2, '0')}`);
const parent = () => h.a.founder;

async function arrangeWorldWithSpareChildren() {
  await h.reset();
  const docs = {};
  for (const id of SPARE_CHILDREN) docs[A(`children/${id}`)] = make.child({ name: `Spare ${id}` });
  await h.arrange(docs);
}

/** Adds k writes that each cost one lookup of a different document. */
function addLookups(batch, k) {
  for (const id of SPARE_CHILDREN.slice(0, k)) {
    batch.set(ref(parent(), A(`children/${id}/messages/mProbe`)), make.message(U.founder, 'parent'));
  }
}

/** How many of the 20 lookups a batch uses. `build(batch)` adds the writes of the flow. */
async function lookupsUsed(build) {
  for (let extra = BATCH_LIMIT - 1; extra >= 0; extra--) {
    const batch = writeBatch(parent().db);
    build(batch);
    addLookups(batch, extra);
    try {
      await batch.commit();
      return BATCH_LIMIT - extra;
    } catch (error) {
      if (error.code !== 'permission-denied') throw error;
    }
  }
  return Infinity; // refused even on its own
}

describe('7. document lookups stay within Firestore\'s limits (10 per write, 20 per batch)', () => {
  beforeEach(arrangeWorldWithSpareChildren);

  test('the measuring stick: the emulator accepts 20 lookups in a batch and refuses the 21st', async () => {
    // 1 lookup for "is the sender a parent" (shared by all writes) + one per child thread
    const twenty = writeBatch(parent().db);
    addLookups(twenty, 19);
    const twentyOne = writeBatch(parent().db);
    addLookups(twentyOne, 20);
    await refused(twentyOne.commit());
    await allowed(twenty.commit());
  });

  test('seed batch (1 child, 3 places, 4 schedules, 4 tasks = 12 writes): at most 12 lookups of 20', async (t) => {
    const used = await lookupsUsed((batch) => {
      for (const [path, data] of flows.seedWrites(parent(), FAM_A)) batch.set(ref(parent(), path), data);
    });
    t.diagnostic(`seed batch: measured ${used} of ${BATCH_LIMIT} lookups (worst case 12)`);
    assert.ok(used <= 12, `the seed batch used ${used} lookups`);
  });

  test('a seed batch of 20 writes, and one of 60, is accepted as well', async () => {
    const big = (count) => {
      const batch = writeBatch(parent().db);
      for (let i = 0; i < count; i++) batch.set(ref(parent(), A(`places/pSeed${i}`)), { ...SEED.places[0][1], ord: i });
      return batch.commit();
    };
    await allowed(big(20));
    await allowed(big(60));
  });

  test('approval batch onto an existing child (device name + member record + approval): at most 8 lookups of 20', async (t) => {
    // worst case: 1 (child update) + 4 (member record) + 3 (approval)
    const claim = { uid: U.claimer, name: 'Pixel 9', platform: 'android' };
    const used = await lookupsUsed((batch) => {
      batch.update(ref(parent(), A('children/c1')), { deviceName: claim.name });
      batch.set(ref(parent(), A(`members/${U.claimer}`)), make.member(U.founder, CODES.taken, claim, 'child', 'c1'));
      batch.update(ref(parent(), `pairing/${CODES.taken}`), { approved: true });
    });
    t.diagnostic(`approval batch, existing child: measured ${used} of ${BATCH_LIMIT} lookups (worst case 8)`);
    assert.ok(used <= 8, `the approval batch used ${used} lookups`);
  });

  test('approval batch with a new child profile: at most 8 lookups of 20', async (t) => {
    const claim = { uid: U.claimer, name: 'Pixel 9', platform: 'android' };
    const used = await lookupsUsed((batch) => {
      batch.set(ref(parent(), A('children/cBrandNew')), make.child({ name: 'Noa', deviceName: claim.name, ord: Date.now() }));
      batch.set(ref(parent(), A(`members/${U.claimer}`)), make.member(U.founder, CODES.taken, claim, 'child', 'cBrandNew'));
      batch.update(ref(parent(), `pairing/${CODES.taken}`), { approved: true });
    });
    t.diagnostic(`approval batch, new child: measured ${used} of ${BATCH_LIMIT} lookups (worst case 8)`);
    assert.ok(used <= 8, `the approval batch used ${used} lookups`);
  });

  test('approval batch for a second parent (member record + approval): at most 6 lookups of 20', async (t) => {
    const claim = { uid: U.joinerVerified, name: "Grandma's iPhone", platform: 'ios' };
    await h.arrange({
      [`pairing/${CODES.fresh}`]: {
        ...stored(make.pairing(FAM_A, U.founder, 'parent')),
        ...stored(make.claim(claim.uid, { claimName: claim.name, claimPlatform: claim.platform })),
      },
    });
    const used = await lookupsUsed((batch) => {
      batch.set(ref(parent(), A(`members/${claim.uid}`)), make.member(U.founder, CODES.fresh, claim, 'parent', null));
      batch.update(ref(parent(), `pairing/${CODES.fresh}`), { approved: true });
    });
    t.diagnostic(`approval batch, second parent: measured ${used} of ${BATCH_LIMIT} lookups (worst case 6)`);
    assert.ok(used <= 6, `the approval batch used ${used} lookups`);
  });

  test('removing a member (member record + its device record in one batch): at most 4 lookups of 20', async (t) => {
    // worst case: 3 (member record) + 1 per device record
    const used = await lookupsUsed((batch) => {
      batch.delete(ref(parent(), A(`members/${U.kid1}`)));
      batch.delete(ref(parent(), A('devices/devKid1')));
    });
    t.diagnostic(`removal batch: measured ${used} of ${BATCH_LIMIT} lookups (worst case 4)`);
    assert.ok(used <= 4, `the removal batch used ${used} lookups`);
  });

  test('answering a request together with the limit change, and marking 3 alerts read: at most one lookup per write', async (t) => {
    const answer = await lookupsUsed((batch) => {
      batch.update(ref(parent(), A('children/c1/requests/r1')), make.answer(U.founder, 'approved'));
      batch.update(ref(parent(), A('children/c1')), { limitMin: 270, bedtime: false });
    });
    await arrangeWorldWithSpareChildren();
    const markRead = await lookupsUsed((batch) => {
      for (const id of ['n1', 'n2', 'n3']) batch.update(ref(parent(), A(`alerts/${id}`)), { unread: false });
    });
    t.diagnostic(`answer + limit: measured ${answer} of ${BATCH_LIMIT} (worst case 2); mark 3 alerts read: measured ${markRead} of ${BATCH_LIMIT} (worst case 3)`);
    assert.ok(answer <= 2 && markRead <= 3);
  });

  test('the family-creation batch and a child leaving are accepted (not measurable with the stick; worst case 8 and 3 lookups)', async () => {
    await h.empty();
    await allowed(flows.createFamily(parent(), FAM_A));
    await arrangeWorldWithSpareChildren();
    const kid = h.a.kid1;
    const leave = writeBatch(kid.db);
    leave.delete(ref(kid, A('devices/devKid1')));
    leave.delete(ref(kid, A(`members/${U.kid1}`)));
    leave.delete(ref(kid, `users/${U.kid1}`));
    await allowed(leave.commit());
  });

  test('a seed batch stays within the limit even if every lookup is counted, as long as it has at most 20 writes', async () => {
    // one lookup per write (is the writer a parent): the seed of SPEC 3.1 has 12 writes
    assert.ok(flows.seedWrites(parent(), FAM_A).length <= BATCH_LIMIT);
  });
});
