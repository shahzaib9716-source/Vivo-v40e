import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { BarChart, Card, Header, Screen, SectionLabel, SegmentedControl, StatTile, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { spacing, useTheme } from '@/theme';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Reports() {
  const { colors } = useTheme();
  const { activeChild } = useStore();
  const [range, setRange] = useState('Week');

  const data = activeChild.weekly.map((v, i) => ({ label: DAYS[i], value: v, highlight: i === 4 }));
  const total = activeChild.weekly.reduce((a, b) => a + b, 0);
  const avg = Math.round(total / 7);
  const topApps = [...activeChild.apps].sort((a, b) => b.usedMin - a.usedMin).slice(0, 4);

  return (
    <Screen>
      <Header back title="Screen Time Report" subtitle={activeChild.name.split(' ')[0]} />

      <View style={{ marginBottom: spacing.xl }}>
        <SegmentedControl options={['Day', 'Week', 'Month']} value={range} onChange={setRange} />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        <StatTile value={fmtDuration(avg)} caption="Daily average" color={colors.primary} />
        <StatTile value={fmtDuration(total)} caption="This week" color={colors.accent} />
        <StatTile value="↓12%" caption="vs last week" color={colors.success} />
      </View>

      <SectionLabel>Daily usage</SectionLabel>
      <Card style={{ marginBottom: spacing.xl }}>
        <BarChart data={data} height={160} />
      </Card>

      <SectionLabel>Most used apps</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {topApps.map((a, i) => (
          <View key={a.id} style={styles.appRow}>
            <Text variant="h3" tone="faint" style={{ width: 24 }}>
              {i + 1}
            </Text>
            <View style={[styles.appIcon, { backgroundColor: a.color + '22' }]}>
              <MaterialCommunityIcons name={a.icon as never} size={20} color={a.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title">{a.name}</Text>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.surfaceSunken, overflow: 'hidden', marginTop: 5 }}>
                <View style={{ height: '100%', width: `${(a.usedMin / topApps[0].usedMin) * 100}%`, backgroundColor: a.color, borderRadius: 999 }} />
              </View>
            </View>
            <Text variant="smallStrong" tone="muted">
              {fmtDuration(a.usedMin)}
            </Text>
          </View>
        ))}
      </Card>

      <SectionLabel>Highlights</SectionLabel>
      <Card>
        <Highlight icon="trending-down" color={colors.success} text="Screen time dropped 12% — nice balance this week." />
        <Highlight icon="moon" color={colors.primary} text="Bedtime kept 6 of 7 nights." />
        <Highlight icon="book-open" color={colors.info} text="Education apps were the most used category." />
      </Card>
    </Screen>
  );
}

function Highlight({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <View style={styles.hl}>
      <MaterialCommunityIcons name={icon as never} size={20} color={color} />
      <Text variant="small" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  appRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  appIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
