import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Card, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { categoryColors, spacing, useTheme } from '@/theme';

export default function Controls() {
  const { colors } = useTheme();
  const { activeChild } = useStore();

  return (
    <Screen>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <Text variant="h1">Controls</Text>
        <Text variant="body" tone="muted" style={{ marginTop: 2 }}>
          Rules and limits for {activeChild.name.split(' ')[0]}
        </Text>
      </View>

      <Card onPress={() => (router.push as any)('/child-profile')} style={{ marginBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={activeChild.name} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="title">{activeChild.name}</Text>
          <Text variant="small" tone="muted">
            {activeChild.deviceName} · Age {activeChild.age}
          </Text>
        </View>
        <Text variant="smallStrong" color={colors.primary}>
          Edit
        </Text>
      </Card>

      <SectionLabel>Time</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Screen Time" subtitle="Daily limit and usage" icon="clock" iconColor={categoryColors.screenTime} onPress={() => (router.push as any)('/screen-time')} />
        <Row title="Schedules & Bedtime" subtitle="School time, bedtime, downtime" icon="calendar" iconColor={categoryColors.schedules} onPress={() => (router.push as any)('/schedules')} />
        <Row title="Routines & Focus" subtitle="Homework and focus modes" icon="target" iconColor={categoryColors.routines} onPress={() => (router.push as any)('/routines')} />
      </Card>

      <SectionLabel>Content</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="App Limits" subtitle="Per-app time and blocking" icon="grid" iconColor={categoryColors.apps} onPress={() => (router.push as any)('/app-limits')} />
        <Row title="Web & Content Filter" subtitle="Categories and safe search" icon="globe" iconColor={categoryColors.web} onPress={() => (router.push as any)('/web-filter')} />
        <Row title="Age Ratings" subtitle="Allowed content ratings" icon="shield" iconColor={colors.info} onPress={() => (router.push as any)('/feature/age-ratings')} />
      </Card>

      <SectionLabel>Approvals</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <Row title="App Installs" subtitle="Approve new app downloads" icon="download" iconColor={categoryColors.apps} onPress={() => (router.push as any)('/feature/app-installs')} />
        <Row title="Purchases" subtitle="Approve in-app and store purchases" icon="shopping-bag" iconColor={categoryColors.rewards} onPress={() => (router.push as any)('/feature/purchases')} />
      </Card>
    </Screen>
  );
}
