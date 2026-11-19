import assert from 'node:assert/strict';
import test from 'node:test';
import { domainCounts, parseActivityImport, scanImportedActivity } from '../../src/sync/activityImport.ts';

test('Chrome imports omit query strings, deduplicate and rank real domains', () => {
  const rows = [
    { url: 'https://example.com/page?q=private#section', time_usec: 1700000000000000 },
    { url: 'https://example.com/page?q=other', time_usec: 1700000000000000 },
    { url: 'https://example.com/next', time_usec: 1700000001000000 },
    { url: 'file:///private', time_usec: 1700000001000000 },
  ];
  const actual = parseActivityImport(JSON.stringify({ 'Browser History': rows }), 'chrome');
  assert.deepEqual(actual.map(row => row.page), ['https://example.com/next', 'https://example.com/page']);
  assert.deepEqual(domainCounts(actual), [{ host: 'example.com', count: 2 }]);
});

test('YouTube imports accept only supported watch URLs with exported timestamps', () => {
  const time = '2026-11-18T13:00:00Z';
  const actual = parseActivityImport(JSON.stringify([
    { title: 'Watched an example', titleUrl: 'https://youtu.be/dQw4w9WgXcQ', time },
    { titleUrl: 'https://example.com/watch?v=dQw4w9WgXcQ', time },
    { titleUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', time: 'invalid' },
  ]), 'youtube');
  assert.equal(actual.length, 1);
  assert.equal(actual[0].at, Date.parse(time));
  assert.equal(actual[0].title, 'Watched an example');
  assert.throws(() => parseActivityImport('[]', 'chrome'));
});

test('keyword rules match source fields, consolidate duplicates and distinguish whole words', () => {
  const row = { key: '1', host: 'example.com', page: 'https://example.com/private', title: 'Shopping for ART supplies', at: 1 };
  assert.deepEqual(scanImportedActivity([row], 'art,ART,shop,private', true)[0].matched, ['art']);
  assert.deepEqual(scanImportedActivity([row], 'shop,example.com', false)[0].matched, ['shop', 'example.com']);
  assert.deepEqual(scanImportedActivity([row], 'suppl,private', true), []);
});
