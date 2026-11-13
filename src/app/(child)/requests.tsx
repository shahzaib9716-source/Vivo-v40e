import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';

const QUICK = [15, 30, 60];

export default function ChildRequests() {
  const { colors } = useTheme();
  const { requests, requestExtraTime } = useStore();
  const mine = requests.filter((r) => r.childId === 'c1');

  const statusColor = (s: string) => (s === 'approved' ? colors.success : s === 'denied' ? colors.danger : colors.warning);
  const statusLabel = (s: string) => (s === 'approved' ? 'Approved' : s === 'denied' ? 'Not now' : 'Waiting');

  return (
    <Screen>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <Text variant="h1">Ask a parent</Text>
        <Text variant="body" tone="muted" style={{ marginTop: 2 }}>
          Send a quick request
        </Text>
      </View>

      <SectionLabel>More screen time</SectionLabel>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
        {QUICK.map((m) => (
          <Card key={m} onPress={() => requestExtraTime(m)} style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.lg }}>
            <View style={[styles.circle, { backgroundColor: colors.primarySoft }]}>
              <Text variant="h3" color={colors.primary}>
                +{m}
              </Text>
            </View>
            <Text variant="small" tone="muted" style={{ marginTop: 6 }}>
              minutes
            </Text>
          </Card>
        ))}
      </View>

      <SectionLabel>Unlock an app</SectionLabel>
      <Card onPress={() => requestExtraTime(0)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
        <View style={[styles.circle, { backgroundColor: colors.accentSoft, width: 44, height: 44 }]}>
          <Feather name="unlock" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">Request to unlock an app</Text>
          <Text variant="small" tone="muted">
            Pick a blocked app to ask about
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.textFaint} />
      </Card>

      <SectionLabel>Your requests</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {mine.length === 0 && (
          <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
            <Text variant="small" tone="faint">
              No requests yet
            </Text>
          </View>
        )}
        {mine.map((r) => (
          <View key={r.id} style={styles.reqRow}>
            <View style={{ flex: 1 }}>
              <Text variant="title">{r.label}</Text>
              <Text variant="small" tone="muted">
                {r.ago}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: statusColor(r.status) + '22' }]}>
              <Text variant="tiny" color={statusColor(r.status)}>
                {statusLabel(r.status)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  circle: { width: 56, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  reqRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
});
