import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CrossingSession } from '../../src/sync/placeCrossing.ts';

const zone = { id: 'home', name: 'Home', latitude: 0, longitude: 0, radius: 100, arrive: true, leave: true };
const fix = (longitude, measuredAt, accuracyM = 5) => ({ latitude: 0, longitude, accuracyM, measuredAt });

test('place crossings keep the last certain fix through an uncertain boundary', () => {
  const session = new CrossingSession();
  assert.deepEqual(session.update([zone], fix(0.002, 1000)), []);
  assert.deepEqual(session.update([zone], fix(0.0009, 2000, 50)), []);
  assert.deepEqual(session.update([zone], fix(0, 3000)), ['Arrived at Home']);
  assert.deepEqual(session.update([zone], fix(0.002, 2000)), []);
  assert.deepEqual(session.update([zone], fix(0.002, 4000)), ['Left Home']);
  assert.deepEqual(session.update([zone], fix(0, 400000)), []);
});

test('legacy places and disabled arrival alerts stay quiet', () => {
  const session = new CrossingSession();
  const places = [{ ...zone, arrive: false }, { ...zone, id: 'old', latitude: undefined }];
  session.update(places, fix(0.002, 1000));
  assert.deepEqual(session.update(places, fix(0, 2000)), []);
});
