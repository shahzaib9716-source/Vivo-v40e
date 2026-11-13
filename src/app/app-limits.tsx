import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card, Chip, Header, Text, Toggle } from '@/components/ui';
import { ManagedApp, useStore, fmtDuration } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';
import { ScrollView } from 'react-native-gesture-handler';
import { Screen } from '@/components/ui/Screen';

const FILTERS = ['All', 'Social', 'Games', 'Video', 'Messaging', 'Education'] as const;

export default function AppLimits() {
  const { colors } = useTheme();
  const { activeChild, activeChildId, toggleApp, setAppLimit } = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const apps = [...activeChild.apps]
    .filter((a) => filter === 'All' || a.category === filter.toLowerCase())
    .sort((a, b) => b.usedMin - a.usedMin);

  return (
    <Screen>
      <Header back title="App Limits" subtitle={`${activeChild.apps.length} apps on ${activeChild.deviceName}`} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      <View style={{ gap: spacing.sm }}>
        {apps.map((app) => (
          <AppCard key={app.id} app={app} onToggle={() => toggleApp(activeChildId, app.id)} onCycleLimit={() => {
            const next = app.limitMin == null ? 30 : app.limitMin >= 120 ? null : app.limitMin + 30;
            setAppLimit(activeChildId, app.id, next);
          }} />
        ))}
      </View>
    </Screen>
  );
}

function AppCard({ app, onToggle, onCycleLimit }: { app: ManagedApp; onToggle: () => void; onCycleLimit: () => void }) {
  const { colors } = useTheme();
  const overLimit = app.limitMin != null && app.usedMin >= app.limitMin;
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: app.color + '22' }]}>
          <MaterialCommunityIcons name={app.icon as never} size={22} color={app.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">{app.name}</Text>
          <Text variant="small" tone="muted" style={{ textTransform: 'capitalize' }}>
            {app.category} · {fmtDuration(app.usedMin)} today
          </Text>
        </View>
        <Toggle value={!app.blocked} onChange={onToggle} />
      </View>

      <View style={styles.limitRow}>
        <View style={{ flex: 1 }}>
          <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                width: app.limitMin ? `${Math.min(100, (app.usedMin / app.limitMin) * 100)}%` : '100%',
                backgroundColor: app.blocked ? colors.textFaint : overLimit ? colors.danger : app.color,
                borderRadius: 999,
              }}
            />
          </View>
        </View>
        <View onTouchEnd={onCycleLimit} style={[styles.limitBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
          <Text variant="tiny" tone={app.blocked ? 'danger' : 'muted'}>
            {app.blocked ? 'Blocked' : app.limitMin ? `Limit ${fmtDuration(app.limitMin)}` : 'No limit'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  limitBtn: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
});
