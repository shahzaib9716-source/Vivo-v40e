// The unit cases for the sync core: ids, labels, the schema table and its codecs, the reconcile,
// the single documents, the store's loader. Each `cases/*.cases.ts` exports a list of cases.
//
//   node --import ./tests/sync/register.mjs --test tests/sync/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import "./app-activity.test.mjs";
import "./activity-import.test.mjs";
const files = ['ids', 'labels', 'schema', 'reconcile', 'single', 'persist', 'scenarios'];

for (const file of files) {
  let cases = [];
  try {
    ({ cases } = await import(`./cases/${file}.cases.ts`));
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  test(file, async (t) => {
    for (const c of cases) await t.test(c.name, () => c.run(assert));
  });
}

test('GPS status distinguishes fix age, cache, missing measurements and clock skew', async () => {
  const { locationStatus } = await import('../../src/sync/locationStatus.ts');
  const now = 900000;
  assert.equal(locationStatus(now - 299999, false, now, false), 'Recent shared location');
  assert.equal(locationStatus(now - 300000, false, now, false), 'Stale location');
  assert.equal(locationStatus(null, false, now, false), 'Last report · GPS fix time unknown');
  assert.equal(locationStatus(now, true, now, false), 'Saved location · awaiting server confirmation');
  assert.equal(locationStatus(undefined, true, now, false), 'No cached location');
  assert.equal(locationStatus(now + 1, false, now, false), 'Last report · check device clocks');
  assert.equal(locationStatus(now, true, now, true), 'Location unavailable');
});

test('trip time scrubber selects only recorded points, by elapsed time', async () => {
  const { nearestTripIndex, tripFraction } = await import('../../src/sync/tripScrubber.ts');
  const times = [100, 110, 200];
  assert.equal(nearestTripIndex([], 0.5), -1);
  assert.equal(nearestTripIndex([100], 0.5), 0);
  assert.equal(nearestTripIndex(times, 0.12), 1);
  assert.equal(nearestTripIndex(times, 0.55), 1); // equidistant: prefer earlier fix
  assert.equal(nearestTripIndex(times, 0.56), 2);
  assert.equal(nearestTripIndex(times, -1), 0);
  assert.equal(nearestTripIndex(times, 2), 2);
  assert.equal(nearestTripIndex(times, NaN), 0);
  assert.equal(nearestTripIndex([100, 100, 200], 0), 0);
  assert.equal(tripFraction(times, 1), 0.1);
  assert.equal(tripFraction([], 0), 0);
  assert.equal(tripFraction([100], 0), 0);
  assert.equal(tripFraction([100, 100], 1), 0);
});

test('weekly snapshots replace same-day reports and expire by calendar date', async () => {
  const { recordDay, readDays } = await import('../../src/sync/usageWeek.ts');
  const row = (day, ms) => ({ day, ms });
  const days = [row('2026-10-31', 100), row('2026-11-01', 200), row('2026-11-07', 300)];
  assert.deepEqual(recordDay(days, '2026-11-07', 400), [days[1], row('2026-11-07', 400)]);
  assert.deepEqual(recordDay(days, '2026-11-15', 0), [row('2026-11-15', 0)]);
  assert.deepEqual(readDays([days[0], days[0]]), []);
  assert.throws(() => recordDay([], 'invalid', 1));
});

test('Android retained events fill missing days without erasing a longer previous observation', async () => {
  const { recordDay } = await import('../../src/sync/usageWeek.ts');
  const row = (day, ms) => ({ day, ms });
  const old = [row('2026-11-12', 10), row('2026-11-15', 100)];
  const events = [row('2026-11-13', 40), row('2026-11-15', 80), row('2026-11-16', 120)];
  assert.deepEqual(recordDay(old, '2026-11-19', 20, events), [events[0], old[1], events[2], row('2026-11-19', 20)]);
});

test('automatic usage refresh checks consent both before reading and before publishing', async () => {
  const { refreshUsage } = await import('../../src/sync/usageRefresh.ts');
  let enabled = false;
  let reads = 0;
  const writes = [];
  const publish = async row => { writes.push(row); };
  const read = async () => ++reads;
  assert.equal(await refreshUsage(() => enabled, read, publish), false);
  assert.equal(reads, 0);
  enabled = true;
  assert.equal(await refreshUsage(() => enabled, async () => { enabled = false; return read(); }, publish), false);
  assert.deepEqual(writes, []);
  enabled = true;
  assert.equal(await refreshUsage(() => enabled, read, publish), true);
  assert.deepEqual(writes, [2]);
});
