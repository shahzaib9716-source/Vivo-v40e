import { ID_PATTERN, idOk, newId } from '@/sync/ids';
import type { Case } from '../support/assert';
import { makeRng } from '../model/prng';

export const cases: Case[] = [
  {
    name: 'newId: prefix, the time in base 36, six random base-36 characters',
    run(t) {
      const id = newId('m', 1_700_000_000_000, () => 0);
      t.equal(id, `m${(1_700_000_000_000).toString(36)}000000`);
      t.ok(/^m[0-9a-z]+$/.test(newId('m')));
      t.equal(newId('r', 0, () => 0.9999999).slice(-6), 'zzzzzz');
      t.equal(newId('p').length, 1 + Date.now().toString(36).length + 6);
    },
  },
  {
    name: 'newId: always a valid Firestore document id for the rules (idOk)',
    run(t) {
      for (const prefix of ['c', 'r', 'n', 'p', 's', 'm', 'w', 't']) {
        const id = newId(prefix);
        t.ok(idOk(id), id);
        t.ok(id.length <= 40);
      }
      t.ok(ID_PATTERN.test('abc_DEF-123'));
      t.ok(!idOk(''));
      t.ok(!idOk('a/b'));
      t.ok(!idOk('a b'));
      t.ok(!idOk('x'.repeat(41)));
      t.ok(!idOk(42));
    },
  },
  {
    name: 'newId: two devices in the same millisecond do not collide',
    run(t) {
      // The old ids were prefix + Date.now(): the same on two phones that acted in the same millisecond.
      const a = makeRng(1);
      const b = makeRng(2);
      const seen = new Set<string>();
      const now = 1_700_000_000_000;
      for (let i = 0; i < 5000; i++) {
        seen.add(newId('m', now, a.next));
        seen.add(newId('m', now, b.next));
      }
      t.equal(seen.size, 10000);
    },
  },
  {
    name: 'newId: 50,000 ids from the real clock and the real random source are all different',
    run(t) {
      const seen = new Set<string>();
      for (let i = 0; i < 50000; i++) seen.add(newId('n'));
      t.equal(seen.size, 50000);
    },
  },
];
