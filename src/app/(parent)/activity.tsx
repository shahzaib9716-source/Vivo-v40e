import { router } from 'expo-router';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { BarChart, Card, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { TODAY_INDEX, WEEKDAY_LETTERS, WEEKDAY_NAMES, sum, weekChange } from '@/components/reportData';
import { useStore, fmtDuration } from '@/state/store';
import { categoryColors, spacing, useTheme } from '@/theme';

export default function Activity() {
  const { colors } = useTheme();
  const { activeChild } = useStore();
  const firstName = activeChild.name.split(' ')[0];
  const data = activeChild.weekly.map((v, i) => ({ label: WEEKDAY_LETTERS[i] ?? '', value: v, highlight: i === TODAY_INDEX }));
  const avg = Math.round(sum(activeChild.weekly) / Math.max(1, activeChild.weekly.length));
  // Same derived comparison as the full report, so the two screens always agree.
  const change = weekChange(activeChild.weekly);
  const changeColor = change.direction === 'down' ? colors.success : change.direction === 'up' ? colors.danger : colors.textMuted;
  const chartSpoken = `Screen time this week. ${activeChild.weekly
    .map((v, i) => `${WEEKDAY_NAMES[i] ?? `Day ${i + 1}`}: ${fmtDuration(v)}`)
    .join(', ')}.`;

  return (
    <Screen>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <Text variant="h1" accessibilityRole="header">
          Activity
        </Text>
        <Text variant="body" tone="muted" style={{ marginTop: 2 }}>
          {firstName}'s week
        </Text>
      </View>

      <Card onPress={() => (router.push as any)('/reports')} style={{ marginBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
          <View>
            <Text variant="small" tone="muted">
              Daily average
            </Text>
            <Text variant="h2">{fmtDuration(avg)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="small" tone="muted">
              This week
            </Text>
            <Text variant="smallStrong" color={changeColor} accessibilityLabel={`${change.spoken} versus last week`}>
              {change.short} vs last
            </Text>
          </View>
        </View>
        <View accessible accessibilityRole="image" accessibilityLabel={chartSpoken}>
          <BarChart data={data} unit="min" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: spacing.md }}>
          <Text variant="smallStrong" color={colors.primary}>
            Full report
          </Text>
          <Feather name="chevron-right" size={16} color={colors.primary} />
        </View>
      </Card>

      <SectionLabel>Reports</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Screen Time Report" subtitle="Daily and weekly breakdown" icon="bar-chart-2" iconColor={categoryColors.reports} onPress={() => (router.push as any)('/reports')} />
        <Row title="App Usage" subtitle="Most used apps and categories" icon="grid" iconColor={categoryColors.apps} onPress={() => (router.push as any)('/app-limits')} />
        <Row title="Web Activity" subtitle="Top sites and categories" icon="globe" iconColor={categoryColors.web} badge="Preview" badgeColor={colors.warning} onPress={() => (router.push as any)('/feature/browsing')} />
      </Card>

      <SectionLabel>Communication</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Calls" subtitle="Recent call activity" icon="phone" iconColor={categoryColors.calls} badge="Preview" badgeColor={colors.warning} onPress={() => (router.push as any)('/feature/calls')} />
        <Row title="Messages" subtitle="Texting activity overview" icon="message-circle" iconColor={categoryColors.messages} badge="Preview" badgeColor={colors.warning} onPress={() => (router.push as any)('/feature/messages')} />
        <Row title="Social Apps" subtitle="Activity in social apps" icon="share-2" iconColor={categoryColors.social} badge="Preview" badgeColor={colors.warning} onPress={() => (router.push as any)('/feature/social')} />
      </Card>

      <SectionLabel>Web & Video</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Browsing History" subtitle="Visited sites overview" icon="compass" iconColor={categoryColors.browsing} badge="Preview" badgeColor={colors.warning} onPress={() => (router.push as any)('/feature/browsing')} />
        <Row title="Video Watch History" subtitle="Watched videos overview" icon="video" iconColor={categoryColors.youtube} badge="Preview" badgeColor={colors.warning} onPress={() => (router.push as any)('/feature/video')} />
      </Card>

      <SectionLabel>Alerts</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <Row title="Keyword Alerts" subtitle="Get notified about flagged words" icon="alert-triangle" iconColor={categoryColors.keywords} badge="Preview" badgeColor={colors.warning} onPress={() => (router.push as any)('/feature/keywords')} />
      </Card>
    </Screen>
  );
}
