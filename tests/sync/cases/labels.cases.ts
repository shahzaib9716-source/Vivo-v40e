import { agoLabel, clockLabel } from '@/sync/labels';
import type { Case } from '../support/assert';

const MIN = 60_000;
const NOW = 1_700_000_000_000;

export const cases: Case[] = [
  {
    name: 'agoLabel: just now, minutes, hours, days',
    run(t) {
      t.equal(agoLabel(NOW, NOW), 'just now');
      t.equal(agoLabel(NOW - 59_000, NOW), 'just now');
      t.equal(agoLabel(NOW - MIN, NOW), '1m ago');
      t.equal(agoLabel(NOW - 59 * MIN, NOW), '59m ago');
      t.equal(agoLabel(NOW - 60 * MIN, NOW), '1h ago');
      t.equal(agoLabel(NOW - 23 * 60 * MIN, NOW), '23h ago');
      t.equal(agoLabel(NOW - 24 * 60 * MIN, NOW), '1d ago');
      t.equal(agoLabel(NOW - 9 * 24 * 60 * MIN, NOW), '9d ago');
    },
  },
  {
    name: 'agoLabel: the short form the alert list uses',
    run(t) {
      t.equal(agoLabel(NOW, NOW, true), 'now');
      t.equal(agoLabel(NOW - 5 * MIN, NOW, true), '5m');
      t.equal(agoLabel(NOW - 2 * 60 * MIN, NOW, true), '2h');
      t.equal(agoLabel(NOW - 3 * 24 * 60 * MIN, NOW, true), '3d');
    },
  },
  {
    name: 'agoLabel: a time in the future (the other clock runs ahead) reads as now',
    run(t) {
      t.equal(agoLabel(NOW + 5 * MIN, NOW), 'just now');
      t.equal(agoLabel(NOW + 5 * MIN, NOW, true), 'now');
    },
  },
  {
    name: 'clockLabel: h:mm AM/PM in the local time zone',
    run(t) {
      const at = (h: number, m: number) => new Date(2026, 0, 15, h, m).getTime();
      t.equal(clockLabel(at(0, 5)), '12:05 AM');
      t.equal(clockLabel(at(9, 30)), '9:30 AM');
      t.equal(clockLabel(at(12, 0)), '12:00 PM');
      t.equal(clockLabel(at(15, 42)), '3:42 PM');
      t.equal(clockLabel(at(23, 59)), '11:59 PM');
    },
  },
];
