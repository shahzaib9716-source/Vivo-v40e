import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconBadge, Text } from '@/components/ui';
import type { Schedule } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';

/**
 * How a schedule looks on a card, plus the small time and weekday helpers the
 * schedules screens share. Days always run Monday to Sunday, like the store.
 */

export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const EVERY_DAY: readonly boolean[] = [true, true, true, true, true, true, true];
export const WEEKDAYS: readonly boolean[] = [true, true, true, true, true, false, false];
export const WEEKENDS: readonly boolean[] = [false, false, false, false, false, true, true];

const DAY_MINUTES = 24 * 60;

export function sameDays(a: readonly boolean[], b: readonly boolean[]) {
  return DAY_LETTERS.every((_, i) => !!a[i] === !!b[i]);
}

/** Minutes since midnight to the store's clock format: 1260 becomes "9:00 PM". */
export function clockLabel(minutes: number) {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h24 % 12 || 12}:${mm} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

/** "9:00 PM" to minutes since midnight, or null when the label is not a clock time. */
export function parseClock(label: string): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)\s*$/i.exec(label);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return ((hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + minute;
}

/** Length of a window in minutes. An end before the start means it runs past midnight. */
export function spanMinutes(start: number, end: number) {
  return (((end - start) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** "Every day", "Weekdays", "Mon – Wed" or "Mon, Wed, Fri". */
export function daysLabel(days: readonly boolean[]) {
  const picked = DAY_LETTERS.map((_, i) => i).filter((i) => !!days[i]);
  if (picked.length === 0) return 'No days';
  if (picked.length === 7) return 'Every day';
  if (sameDays(days, WEEKDAYS)) return 'Weekdays';
  if (sameDays(days, WEEKENDS)) return 'Weekends';
  const last = picked[picked.length - 1];
  if (picked.length >= 3 && last - picked[0] === picked.length - 1) return `${DAY_SHORT[picked[0]]} – ${DAY_SHORT[last]}`;
  return picked.map((i) => DAY_SHORT[i]).join(', ');
}

type Window = Pick<Schedule, 'start' | 'end' | 'days'>;

/** Monday-based weekday index and minutes since midnight for a date. */
function position(now: Date) {
  return { day: (now.getDay() + 6) % 7, minutes: now.getHours() * 60 + now.getMinutes() };
}

/** Whether the window covers `now`. An overnight window belongs to the day it starts on. */
export function isActiveAt(schedule: Window, now: Date) {
  const start = parseClock(schedule.start);
  const end = parseClock(schedule.end);
  if (start == null || end == null || start === end) return false;
  const { day, minutes } = position(now);
  if (start < end) return !!schedule.days[day] && minutes >= start && minutes < end;
  const yesterday = (day + 6) % 7;
  return (!!schedule.days[day] && minutes >= start) || (!!schedule.days[yesterday] && minutes < end);
}

/** The next time one of the switched-on schedules starts, looking up to a week ahead. */
export function nextStart<T extends Window & { on: boolean }>(schedules: readonly T[], now: Date) {
  const { day, minutes } = position(now);
  let best: { schedule: T; daysAhead: number; wait: number } | null = null;
  for (const schedule of schedules) {
    if (!schedule.on) continue;
    const start = parseClock(schedule.start);
    if (start == null) continue;
    for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
      if (!schedule.days[(day + daysAhead) % 7]) continue;
      const wait = daysAhead * DAY_MINUTES + start - minutes;
      if (wait <= 0) continue;
      if (!best || wait < best.wait) best = { schedule, daysAhead, wait };
      break;
    }
  }
  return best;
}

interface FaceProps {
  name: string;
  /** Shown in a faint tone while the name is empty (form preview). */
  placeholder?: string;
  icon: string; // Feather icon name
  color: string;
  start: string;
  end: string;
  days: readonly boolean[];
  on?: boolean;
  /** Adds an "On now" marker next to the time. */
  activeNow?: boolean;
  /** Trailing control, usually a toggle. */
  right?: ReactNode;
}

/** Icon, name, time window and weekday pills: the body of a schedule card. */
export function ScheduleFace({ name, placeholder = 'Schedule name', icon, color, start, end, days, on = true, activeNow, right }: FaceProps) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={styles.top}>
        <IconBadge name={icon} color={color} size={46} />
        <View style={styles.text}>
          <Text variant="title" tone={name ? 'default' : 'faint'} numberOfLines={1}>
            {name || placeholder}
          </Text>
          <View style={styles.meta}>
            <Text variant="small" tone="muted">
              {start} – {end}
            </Text>
            {activeNow ? (
              <View style={[styles.now, { backgroundColor: colors.successSoft }]}>
                <View style={[styles.nowDot, { backgroundColor: colors.success }]} />
                <Text variant="tiny" color={colors.success}>
                  On now
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {right}
      </View>

      <View style={styles.days} accessible accessibilityLabel={`Repeats: ${daysLabel(days)}`}>
        {DAY_LETTERS.map((letter, i) => {
          const picked = !!days[i];
          // Switched-off schedules keep their days visible as a soft tint.
          const backgroundColor = !picked ? colors.surfaceSunken : on ? color : color + '2B';
          const textColor = !picked ? colors.textFaint : on ? '#FFFFFF' : colors.textMuted;
          return (
            <View key={i} style={[styles.day, { backgroundColor }]}>
              <Text variant="tiny" color={textColor}>
                {letter}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: 2, marginTop: 1 },
  now: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  nowDot: { width: 6, height: 6, borderRadius: radius.pill },
  days: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  day: { flex: 1, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
