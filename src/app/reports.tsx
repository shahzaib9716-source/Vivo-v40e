import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { BarChart, Card, Header, Screen, SectionLabel, SegmentedControl, StatTile, Text } from '@/components/ui';
import {
  Change,
  MONTH_WEEK_LABELS,
  TODAY_INDEX,
  WEEKDAY_LETTERS,
  WEEKDAY_NAMES,
  changeBetween,
  hourlyBuckets,
  monthlyTotals,
  peakIndex,
  previousMonthTotal,
  sum,
} from '@/components/reportData';
import { Child, useStore, fmtDuration } from '@/state/store';
import { spacing, useTheme } from '@/theme';
import { SampleNote } from '@/components/SampleNote';

const RANGES = ['Day', 'Week', 'Month'] as const;
type Range = (typeof RANGES)[number];

interface Bar {
  label: string;
  /** Full name for screen readers, e.g. "Thursday" for "T". */
  name: string;
  value: number;
  highlight: boolean;
}

interface Report {
  /** Total minutes covered by the range; the app list is scaled to it. */
  total: number;
  tiles: { value: string; caption: string }[];
  change: Change;
  /** Caption of the change tile, e.g. "vs last week". */
  changeCaption: string;
  chartTitle: string;
  bars: Bar[];
  /** What the highlighted bar means, e.g. "Today". */
  legend: string;
  busiest: string;
  /** Lower-case period name used in sentences: "today", "this week". */
  period: string;
  trendText: string;
  busiestText: string;
}

function buildReport(child: Child, range: Range): Report {
  if (range === 'Day') {
    const buckets = hourlyBuckets(child.usedMin);
    const peak = peakIndex(buckets.map((b) => b.value));
    const left = Math.max(0, child.limitMin - child.usedMin);
    const change = changeBetween(child.usedMin, child.weekly[TODAY_INDEX - 1] ?? 0);
    const busy = child.usedMin > 0;
    return {
      total: child.usedMin,
      tiles: [
        { value: fmtDuration(child.usedMin), caption: 'Used today' },
        { value: fmtDuration(left), caption: 'Left today' },
      ],
      change,
      changeCaption: 'vs yesterday',
      chartTitle: 'Today by time of day',
      bars: buckets.map((b, i) => ({ label: b.label, name: b.range, value: b.value, highlight: busy && i === peak })),
      legend: 'Busiest time',
      busiest: busy ? `${buckets[peak].range} · ${fmtDuration(buckets[peak].value)}` : 'No screen time yet',
      period: 'today',
      trendText: trendSentence(change, 'yesterday'),
      busiestText: busy
        ? `Busiest time was ${buckets[peak].range} (${fmtDuration(buckets[peak].value)}).`
        : 'No screen time recorded yet today.',
    };
  }

  if (range === 'Week') {
    const total = sum(child.weekly);
    const totals = monthlyTotals(child.weekly);
    const change = changeBetween(totals[3], totals[2]);
    const peak = peakIndex(child.weekly);
    return {
      total,
      tiles: [
        { value: fmtDuration(Math.round(total / 7)), caption: 'Daily avg' },
        { value: fmtDuration(total), caption: 'This week' },
      ],
      change,
      changeCaption: 'vs last week',
      chartTitle: 'Daily usage',
      bars: child.weekly.map((v, i) => ({
        label: WEEKDAY_LETTERS[i] ?? '',
        name: WEEKDAY_NAMES[i] ?? `Day ${i + 1}`,
        value: v,
        highlight: i === TODAY_INDEX,
      })),
      legend: 'Today',
      busiest: `${WEEKDAY_NAMES[peak]} · ${fmtDuration(child.weekly[peak] ?? 0)}`,
      period: 'this week',
      trendText:
        change.direction === 'down'
          ? `Screen time dropped ${Math.abs(change.percent)}% — nice balance this week.`
          : trendSentence(change, 'last week'),
      busiestText: `Busiest day was ${WEEKDAY_NAMES[peak]} (${fmtDuration(child.weekly[peak] ?? 0)}).`,
    };
  }

  const totals = monthlyTotals(child.weekly);
  const total = sum(totals);
  const change = changeBetween(total, previousMonthTotal(child.weekly));
  const peak = peakIndex(totals);
  const peakName = MONTH_WEEK_LABELS[peak].toLowerCase();
  return {
    total,
    tiles: [
      { value: fmtDuration(Math.round(total / 28)), caption: 'Daily avg' },
      { value: fmtDuration(total), caption: '4-week total' },
    ],
    change,
    changeCaption: 'vs last month',
    chartTitle: 'Weekly totals',
    bars: totals.map((v, i) => ({
      label: MONTH_WEEK_LABELS[i],
      name: MONTH_WEEK_LABELS[i],
      value: v,
      highlight: i === totals.length - 1,
    })),
    legend: 'This week',
    busiest: `${MONTH_WEEK_LABELS[peak]} · ${fmtDuration(totals[peak])}`,
    period: 'in the last 4 weeks',
    trendText: trendSentence(change, 'the 4 weeks before'),
    busiestText: `Busiest week was ${peakName} (${fmtDuration(totals[peak])}).`,
  };
}

function trendSentence(change: Change, against: string) {
  if (change.direction === 'flat') return `Screen time is about the same as ${against}.`;
  return `Screen time is ${change.direction} ${Math.abs(change.percent)}% on ${against}.`;
}

function topCategory(child: Child) {
  const minutes: Record<string, number> = {};
  for (const app of child.apps) minutes[app.category] = (minutes[app.category] ?? 0) + app.usedMin;
  const [name] = Object.entries(minutes).sort((a, b) => b[1] - a[1])[0] ?? [];
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

export default function Reports() {
  const { colors } = useTheme();
  const { activeChild } = useStore();
  const [range, setRange] = useState<Range>('Week');

  const report = buildReport(activeChild, range);
  const { change } = report;
  const changeColor = change.direction === 'down' ? colors.success : change.direction === 'up' ? colors.danger : colors.textMuted;

  // App minutes are stored for today only; scale them so the list adds up with the chosen range.
  const scale = range === 'Day' || activeChild.usedMin <= 0 ? 1 : report.total / activeChild.usedMin;
  const topApps = [...activeChild.apps]
    .sort((a, b) => b.usedMin - a.usedMin)
    .slice(0, 4)
    .map((a) => ({ ...a, minutes: Math.round(a.usedMin * scale) }));
  const topMinutes = Math.max(1, topApps[0]?.minutes ?? 0);
  const category = topCategory(activeChild);

  const chartSpoken = `${report.chartTitle}. ${report.bars.map((b) => `${b.name}: ${fmtDuration(b.value)}`).join(', ')}.`;

  return (
    <Screen>
      <Header back title="Screen Time Report" subtitle={activeChild.name.split(' ')[0]} />
      <SampleNote about="usage" />

      <View style={{ marginBottom: spacing.xl }}>
        <SegmentedControl
          options={[...RANGES]}
          value={range}
          onChange={(v) => setRange(RANGES.find((r) => r === v) ?? 'Week')}
          accessibilityLabel="Report range"
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        <StatTile compact value={report.tiles[0].value} caption={report.tiles[0].caption} color={colors.primary} />
        <StatTile compact value={report.tiles[1].value} caption={report.tiles[1].caption} color={colors.accent} />
        <StatTile
          compact
          value={change.short}
          caption={report.changeCaption}
          color={changeColor}
          accessibilityLabel={`${report.changeCaption}: ${change.spoken}`}
        />
      </View>

      <SectionLabel>{report.chartTitle}</SectionLabel>
      <Card style={{ marginBottom: spacing.xl }}>
        <View style={styles.chartHead}>
          <View style={{ flex: 1 }}>
            <Text variant="tiny" tone="faint" style={{ textTransform: 'uppercase' }}>
              Busiest
            </Text>
            <Text variant="smallStrong" numberOfLines={1}>
              {report.busiest}
            </Text>
          </View>
          <View style={styles.legend}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text variant="tiny" tone="muted">
              {report.legend}
            </Text>
          </View>
        </View>
        <View accessible accessibilityRole="image" accessibilityLabel={chartSpoken}>
          <BarChart data={report.bars} height={160} />
        </View>
      </Card>

      <SectionLabel>{`Most used apps ${report.period}`}</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {topApps.map((a, i) => (
          <View
            key={a.id}
            accessible
            accessibilityLabel={`Number ${i + 1}: ${a.name}, ${fmtDuration(a.minutes)}`}
            style={styles.appRow}>
            <Text variant="h3" tone="faint" style={{ width: 24 }}>
              {i + 1}
            </Text>
            <View style={[styles.appIcon, { backgroundColor: a.color + '22' }]}>
              <MaterialCommunityIcons name={a.icon as never} size={20} color={a.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title" numberOfLines={1}>
                {a.name}
              </Text>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.surfaceSunken, overflow: 'hidden', marginTop: 5 }}>
                <View style={{ height: '100%', width: `${(a.minutes / topMinutes) * 100}%`, backgroundColor: a.color, borderRadius: 999 }} />
              </View>
            </View>
            <Text variant="smallStrong" tone="muted">
              {fmtDuration(a.minutes)}
            </Text>
          </View>
        ))}
      </Card>

      <SectionLabel>Highlights</SectionLabel>
      <Card>
        <Highlight
          icon={change.direction === 'down' ? 'trending-down' : change.direction === 'up' ? 'trending-up' : 'minus'}
          color={changeColor}
          text={report.trendText}
        />
        <Highlight icon={range === 'Day' ? 'clock' : 'calendar'} color={colors.primary} text={report.busiestText} />
        {category != null && <Highlight icon="grid" color={colors.info} text={`${category} apps took the most time ${report.period}.`} />}
      </Card>

      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.lg }}>
        Demo data. Hourly and 4-week figures are worked out from the sample week.
      </Text>
    </Screen>
  );
}

function Highlight({ icon, color, text }: { icon: keyof typeof Feather.glyphMap; color: string; text: string }) {
  return (
    <View style={styles.hl}>
      <Feather name={icon} size={20} color={color} />
      <Text variant="small" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chartHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 },
  legendDot: { width: 8, height: 8, borderRadius: 999 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  appIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
