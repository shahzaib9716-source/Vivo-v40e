import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Button, Card, Chip, Header, ProgressRing, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { categoryColors, radius, spacing, useTheme } from '@/theme';

const PRESETS = [60, 120, 180, 240];

export default function ScreenTime() {
  const { colors } = useTheme();
  const { activeChild, activeChildId, adjustLimit, grantBonus, pauseDevice, resumeDevice } = useStore();
  const left = Math.max(0, activeChild.limitMin - activeChild.usedMin);
  const progress = Math.min(1, activeChild.usedMin / activeChild.limitMin);

  const byCategory = Object.entries(
    activeChild.apps.reduce<Record<string, number>>((acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + a.usedMin;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <Screen>
      <Header back title="Screen Time" subtitle={activeChild.name.split(' ')[0]} />

      <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <ProgressRing progress={progress} size={168} stroke={16} label={fmtDuration(left)} sublabel="remaining today" />
        <Text variant="small" tone="muted" style={{ marginTop: spacing.md }}>
          {fmtDuration(activeChild.usedMin)} used of {fmtDuration(activeChild.limitMin)}
        </Text>
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <SectionLabel>Daily limit</SectionLabel>
        <Card>
          <View style={styles.stepper}>
            <StepBtn icon="minus" onPress={() => adjustLimit(activeChildId, -15)} />
            <View style={{ alignItems: 'center' }}>
              <Text variant="display">{fmtDuration(activeChild.limitMin)}</Text>
              <Text variant="small" tone="muted">
                per day
              </Text>
            </View>
            <StepBtn icon="plus" onPress={() => adjustLimit(activeChildId, 15)} />
          </View>
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <Chip key={p} label={fmtDuration(p)} active={activeChild.limitMin === p} onPress={() => adjustLimit(activeChildId, p - activeChild.limitMin)} />
            ))}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <SectionLabel>Where the time goes</SectionLabel>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {byCategory.map(([cat, mins]) => (
            <View key={cat} style={styles.catRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text variant="smallStrong" style={{ textTransform: 'capitalize' }}>
                  {cat}
                </Text>
                <Text variant="small" tone="muted">
                  {fmtDuration(mins)}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${(mins / byCategory[0][1]) * 100}%`, backgroundColor: categoryColors.screenTime, borderRadius: 999 }} />
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button label="Add 30 minutes today" icon="plus-circle" variant="secondary" onPress={() => grantBonus(activeChildId, 30)} />
        {activeChild.bedtime ? (
          <Button label="Resume device" icon="play" onPress={() => resumeDevice(activeChildId)} />
        ) : (
          <Button label="Pause device now" icon="pause" variant="danger" onPress={() => pauseDevice(activeChildId)} />
        )}
      </View>
    </Screen>
  );
}

function StepBtn({ icon, onPress }: { icon: keyof typeof Feather.glyphMap; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View onTouchEnd={onPress} style={[styles.stepBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <Feather name={icon} size={22} color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  presets: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' },
  catRow: { paddingVertical: spacing.sm },
});
