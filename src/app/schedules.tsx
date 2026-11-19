import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { IconButton, InlineConfirm } from '@/components/RuleForm';
import { DAY_SHORT, ScheduleFace, daysLabel, isActiveAt, nextStart, parseClock, spanMinutes } from '@/components/ScheduleFace';
import { Button, Card, Header, IconBadge, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { fmtDuration, useStore, type Schedule } from '@/state/store';
import { categoryColors, radius, spacing, useTheme } from '@/theme';
import { SampleNote } from '@/components/SampleNote';

/* The current minute, refreshed while the screen is open. Null on the server so web hydration matches. */
function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, 20_000);
  return () => clearInterval(id);
}
const readMinute = () => Math.floor(Date.now() / 60_000);
const readMinuteOnServer = () => null;

function useNow(): Date | null {
  const minute = useSyncExternalStore<number | null>(subscribeToClock, readMinute, readMinuteOnServer);
  return minute == null ? null : new Date(minute * 60_000);
}

/** "Every day · 10h overnight" */
function caption(s: Schedule) {
  const start = parseClock(s.start);
  const end = parseClock(s.end);
  if (start == null || end == null || start === end) return daysLabel(s.days);
  return `${daysLabel(s.days)} · ${fmtDuration(spanMinutes(start, end))}${end < start ? ' overnight' : ''}`;
}

/** What is running now, or what starts next. */
function summarise(schedules: Schedule[], now: Date | null) {
  const on = schedules.filter((s) => s.on);
  if (on.length === 0) return { title: 'All schedules are off', detail: 'Switch one on to use it' };
  if (!now) return { title: `${on.length} of ${schedules.length} switched on`, detail: 'Repeating every week' };

  const running = on.filter((s) => isActiveAt(s, now));
  if (running.length > 0) {
    const more = running.length > 1 ? ` · +${running.length - 1} more` : '';
    return { title: `${running[0].name} is on now`, detail: `Until ${running[0].end}${more}` };
  }

  const next = nextStart(on, now);
  if (!next) return { title: 'Nothing on right now', detail: 'No upcoming schedule this week' };
  const today = (now.getDay() + 6) % 7;
  const when =
    next.daysAhead === 0 ? 'today' : next.daysAhead === 1 ? 'tomorrow' : `on ${DAY_SHORT[(today + next.daysAhead) % 7]}`;
  return { title: 'Nothing on right now', detail: `Next: ${next.schedule.name} ${when} at ${next.schedule.start}` };
}

export default function Schedules() {
  const { colors } = useTheme();
  const { schedules, toggleSchedule, removeSchedule } = useStore();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const now = useNow();

  const onCount = schedules.filter((s) => s.on).length;
  const summary = summarise(schedules, now);
  const openAdd = () => (router.push as any)('/add-schedule');

  return (
    <Screen>
      <Header back title="Schedules & Bedtime" subtitle="When the device winds down" />
      <SampleNote about="schedules" />

      {schedules.length === 0 ? (
        <Card style={styles.empty}>
          <IconBadge name="moon" color={categoryColors.schedules} size={60} />
          <Text variant="h3" center style={{ marginTop: spacing.sm }}>
            No schedules yet
          </Text>
          <Text variant="body" tone="muted" center>
            Set a bedtime or school hours once, and the device winds down on its own every week.
          </Text>
          <Button label="Add a schedule" icon="plus" onPress={openAdd} style={{ marginTop: spacing.md }} />
        </Card>
      ) : (
        <>
          <Card style={styles.summary}>
            <IconBadge name="calendar" color={categoryColors.schedules} size={46} />
            <View style={styles.flex}>
              <Text variant="title" numberOfLines={2}>
                {summary.title}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={2}>
                {summary.detail}
              </Text>
            </View>
            <View style={[styles.count, { backgroundColor: onCount > 0 ? colors.successSoft : colors.surfaceSunken }]}>
              <Text variant="tiny" color={onCount > 0 ? colors.success : colors.textMuted}>
                {onCount}/{schedules.length} ON
              </Text>
            </View>
          </Card>

          <SectionLabel>Your schedules</SectionLabel>
          <View style={styles.list}>
            {schedules.map((s) => (
              <Card key={s.id}>
                <ScheduleFace
                  name={s.name}
                  icon={s.icon}
                  color={s.color}
                  start={s.start}
                  end={s.end}
                  days={s.days}
                  on={s.on}
                  activeNow={!!now && s.on && isActiveAt(s, now)}
                  right={<Toggle value={s.on} onChange={() => toggleSchedule(s.id)} />}
                />
                {confirmId === s.id ? (
                  <InlineConfirm
                    title={`Remove “${s.name}”?`}
                    detail="It stops applying straight away. You can add it again later."
                    onCancel={() => setConfirmId(null)}
                    onConfirm={() => {
                      removeSchedule(s.id);
                      setConfirmId(null);
                    }}
                  />
                ) : (
                  <View style={styles.foot}>
                    <Text variant="small" tone="muted" numberOfLines={1} style={styles.flex}>
                      {caption(s)}
                    </Text>
                    <IconButton icon="trash-2" label={`Remove ${s.name}`} onPress={() => setConfirmId(s.id)} />
                  </View>
                )}
              </Card>
            ))}
          </View>

          <Button label="Add a schedule" icon="plus" variant="secondary" onPress={openAdd} />

          <View style={styles.note}>
            <Feather name="repeat" size={14} color={colors.textFaint} style={styles.noteIcon} />
            <Text variant="small" tone="faint" style={styles.flex}>
              Schedules repeat every week on the days you pick. Switch one off to skip it without losing it.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  count: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  list: { gap: spacing.sm, marginBottom: spacing.xl },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  note: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  noteIcon: { marginTop: 2 },
});
