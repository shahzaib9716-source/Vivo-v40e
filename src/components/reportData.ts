/**
 * Sample figures for the Activity and Report screens.
 *
 * The store only holds one day (`usedMin`) and one week (`weekly`) per child, so the hourly and
 * monthly views are worked out from those two. Everything here is plain arithmetic on the stored
 * numbers: the same child always gets the same charts, and nothing changes between renders.
 */

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** In the sample week "today" is Friday: `weekly[4]` is the same number as the child's `usedMin`. */
export const TODAY_INDEX = 4;

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Splits `total` across `weights` in whole numbers that still add up to `total`. */
function distribute(total: number, weights: number[]): number[] {
  const weightSum = sum(weights);
  if (total <= 0 || weightSum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / weightSum);
  const whole = exact.map(Math.floor);
  // Hand the minutes lost to rounding to the buckets that were closest to the next minute.
  const byRemainder = exact
    .map((v, i) => ({ i, rest: v - whole[i] }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  const spare = total - sum(whole);
  for (let k = 0; k < spare; k++) whole[byRemainder[k % byRemainder.length].i] += 1;
  return whole;
}

export interface HourBucket {
  /** Short axis label, e.g. "4p". */
  label: string;
  /** Spoken / written range, e.g. "4–6 PM". */
  range: string;
  value: number;
}

const HOUR_BLOCKS: { label: string; range: string; share: number }[] = [
  { label: '6a', range: '6–8 AM', share: 6 },
  { label: '8a', range: '8–10 AM', share: 2 },
  { label: '10a', range: '10 AM–12 PM', share: 2 },
  { label: '12p', range: '12–2 PM', share: 6 },
  { label: '2p', range: '2–4 PM', share: 8 },
  { label: '4p', range: '4–6 PM', share: 26 },
  { label: '6p', range: '6–8 PM', share: 30 },
  { label: '8p', range: '8–10 PM', share: 20 },
];

/**
 * Today's minutes spread over two-hour blocks: a typical school-day shape (little during school,
 * most after it), nudged per child by a small offset taken from `usedMin` itself.
 */
export function hourlyBuckets(usedMin: number): HourBucket[] {
  const used = Math.max(0, Math.round(usedMin));
  const weights = HOUR_BLOCKS.map((b, i) => b.share + ((used + i * 7) % 5));
  const minutes = distribute(used, weights);
  return HOUR_BLOCKS.map((b, i) => ({ label: b.label, range: b.range, value: minutes[i] }));
}

export const MONTH_WEEK_LABELS = ['3 wks ago', '2 wks ago', 'Last week', 'This week'];

/**
 * Four weekly totals, oldest first; the last one is the stored week. The three earlier weeks are
 * the stored week's total shifted by gaps between its own days, so each child gets a different
 * month that never changes.
 */
export function monthlyTotals(weekly: number[]): number[] {
  const [mon = 0, tue = 0, , thu = 0, fri = 0, sat = 0, sun = 0] = weekly;
  const thisWeek = sum(weekly);
  return [thisWeek + (mon - sat), thisWeek - (tue - fri), thisWeek + (tue + thu) - (fri + sun), thisWeek].map((v) =>
    Math.max(0, v),
  );
}

/** Total for the four weeks before the ones in `monthlyTotals`, derived the same way. */
export function previousMonthTotal(weekly: number[]): number {
  const [, , , , , sat = 0, sun = 0] = weekly;
  return Math.max(0, sum(monthlyTotals(weekly)) + 4 * (sun - sat));
}

export interface Change {
  /** Whole percent; negative means less screen time than before. */
  percent: number;
  direction: 'down' | 'up' | 'flat';
  /** Compact form for a tile, e.g. "↓12%". */
  short: string;
  /** Screen-reader form, e.g. "down 12 percent". */
  spoken: string;
}

export function changeBetween(now: number, before: number): Change {
  const percent = before > 0 ? Math.round(((now - before) / before) * 100) : 0;
  if (percent === 0) return { percent, direction: 'flat', short: '0%', spoken: 'no change' };
  const direction = percent < 0 ? 'down' : 'up';
  const size = Math.abs(percent);
  return {
    percent,
    direction,
    short: `${direction === 'down' ? '↓' : '↑'}${size}%`,
    spoken: `${direction} ${size} percent`,
  };
}

/** This week against the derived week before it. */
export function weekChange(weekly: number[]): Change {
  const totals = monthlyTotals(weekly);
  return changeBetween(totals[3], totals[2]);
}

/** Index of the largest value (the first one, when several tie). */
export function peakIndex(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}
