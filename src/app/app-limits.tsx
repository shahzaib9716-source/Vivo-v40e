import { DeviceReport } from '@/components/DeviceReport';
import { useLink } from '@/sync/link';
import { useState } from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { Card, Chip, Header, Screen, Text, Toggle } from '@/components/ui';
import { ManagedApp, useStore, fmtDuration } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';
import { SampleNote } from '@/components/SampleNote';

const FILTERS = ['All', 'Social', 'Games', 'Video', 'Messaging', 'Education'] as const;

// The limit pill is about 32pt tall; extend its press target to 44pt.
const PILL_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

export default function AppLimits() {
  const { live, activeChild } = useStore();
  const link = useLink();
  if (!live) return <SampleAppLimits />;
  return <Screen><Header back title="App limits" subtitle={activeChild.name} />
    {link.role === 'parent' && link.familyId && <DeviceReport manage key={link.familyId + '/' + activeChild.id} family={link.familyId} child={activeChild.id} />}
  </Screen>;
}
function SampleAppLimits() {
  const { colors } = useTheme();
  const { activeChild, activeChildId, toggleApp, setAppLimit } = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const apps = [...activeChild.apps]
    .filter((a) => filter === 'All' || a.category === filter.toLowerCase())
    .sort((a, b) => b.usedMin - a.usedMin);

  return (
    <Screen>
      <Header back title="App Limits" subtitle={`${activeChild.apps.length} configured app rules for ${activeChild.deviceName}`} />
      <SampleNote about="usage" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={f}
            accessibilityLabel={f === 'All' ? 'Show all apps' : `Show ${f.toLowerCase()} apps`}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>

      <Text variant="tiny" tone="faint" style={styles.hint}>
        Switch an app off to block it. Tap its limit to step through 30m, 1h, 1h 30m, 2h or no limit.
      </Text>

      <View style={{ gap: spacing.sm }}>
        {apps.map((app) => (
          <AppCard
            key={app.id}
            app={app}
            onToggle={() => toggleApp(activeChildId, app.id)}
            onCycleLimit={() => {
              const next = app.limitMin == null ? 30 : app.limitMin >= 120 ? null : app.limitMin + 30;
              setAppLimit(activeChildId, app.id, next);
            }}
          />
        ))}
        {apps.length === 0 && (
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <Feather name="grid" size={22} color={colors.textFaint} />
            <Text variant="small" tone="muted" center style={{ marginTop: spacing.sm }}>
              No {filter.toLowerCase()} apps on this device.
            </Text>
          </Card>
        )}
      </View>
    </Screen>
  );
}

function AppCard({ app, onToggle, onCycleLimit }: { app: ManagedApp; onToggle: () => void; onCycleLimit: () => void }) {
  const { colors } = useTheme();
  const overLimit = app.limitMin != null && app.usedMin >= app.limitMin;
  const limitText = app.blocked ? 'Blocked' : app.limitMin ? `Limit ${fmtDuration(app.limitMin)}` : 'No limit';
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: app.color + '22' }]}>
          <MaterialCommunityIcons name={app.icon as never} size={22} color={app.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {app.name}
          </Text>
          <Text variant="small" tone="muted" style={{ textTransform: 'capitalize' }}>
            {app.category} · {fmtDuration(app.usedMin)} today
          </Text>
        </View>
        <Toggle value={!app.blocked} onChange={onToggle} accessibilityLabel={`Allow ${app.name}`} />
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
        {/* A blocked app has no limit to change, so the pill is only a label then. */}
        <Pressable
          onPress={onCycleLimit}
          disabled={app.blocked}
          accessibilityRole="button"
          accessibilityLabel={app.blocked ? `${app.name} is blocked` : `${app.name}: ${limitText}`}
          accessibilityHint={app.blocked ? undefined : 'Changes the daily limit for this app'}
          accessibilityState={{ disabled: app.blocked }}
          hitSlop={PILL_HIT_SLOP}
          style={({ pressed }) => [
            styles.limitBtn,
            { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSunken : colors.surfaceAlt },
            pressed && { opacity: 0.8 },
          ]}>
          <Text variant="tiny" tone={app.blocked ? 'danger' : overLimit ? 'danger' : 'muted'}>
            {limitText}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Vertical padding leaves room for the chips' extended press target inside the scroller.
  filters: { flexGrow: 0, marginHorizontal: -spacing.xl },
  filtersContent: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: 4, paddingBottom: spacing.md },
  hint: { marginBottom: spacing.md, marginLeft: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  limitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

