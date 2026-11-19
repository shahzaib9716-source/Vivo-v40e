import assert from 'node:assert/strict';
import test from 'node:test';
import { rankAppActivity } from '../../src/sync/appActivity.ts';

test('usage ranking classifies by exact package and supports label and package search', () => {
  const reports = [
    { pkg: 'com.whatsapp', label: 'WhatsApp', ms: 5000 },
    { pkg: 'example.whatsapp', label: 'WhatsApp', ms: 7000 },
    { pkg: 'com.google.android.youtube', label: 'YouTube', ms: 6000 },
    { pkg: 'com.netflix.mediaclient', label: 'Netflix', ms: 4000 },
  ];
  assert.deepEqual(rankAppActivity(reports, 'social').map(app => app.pkg), ['com.google.android.youtube', 'com.whatsapp']);
  assert.deepEqual(rankAppActivity(reports, 'video', ' NETFLIX '), [reports[3]]);
  assert.deepEqual(rankAppActivity(reports, 'all', 'EXAMPLE.'), [reports[1]]);
  assert.equal(reports[0].pkg, 'com.whatsapp');
});
