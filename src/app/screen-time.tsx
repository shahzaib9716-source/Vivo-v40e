import { useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { InlineNote } from '@/components/InlineNote';
import { Button, Card, Chip, Header, ProgressRing, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { categoryColors, radius, spacing, useTheme } from '@/theme';
import { DeviceReport } from '@/components/DeviceReport';
import { useLink } from '@/sync/link';

const PRESETS = [60, 120, 180, 240];
const STEP = 15;

type Action = 'bonus' | 'paused' | 'resumed';

export default function ScreenTime() {
  const { colors } = useTheme();
  const { activeChild, activeChildId, adjustLimit, grantBonus, pauseDevice, resumeDevice, live } = useStore();
  const [lastAction, setLastAction] = useState<Action | null>(null);

  const link = useLink();
  const firstName = activeChild.name.split(' ')[0];
  const left = Math.max(0, activeChild.limitMin - activeChild.usedMin);
  const progress = activeChild.limitMin > 0 ? Math.min(1, activeChild.usedMin / activeChild.limitMin) : 1;

  const byCategory = Object.entries(
    activeChild.apps.reduce<Record<string, number>>((acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + a.usedMin;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topMinutes = Math.max(1, byCategory[0]?.[1] ?? 0);

  const notes: Record<Action, { title: string; detail: string }> = {
    // In a real family extra time raises the daily limit itself (there is no today-only bonus in
    // this version), and a break is shown on the child's phone: nothing is locked.
    bonus: live
      ? { title: '30 minutes added', detail: `The daily limit is now ${fmtDuration(activeChild.limitMin)}, from today on, until you lower it.` }
      : { title: '30 minutes added', detail: `Today's limit is now ${fmtDuration(activeChild.limitMin)}.` },
    paused: live
      ? { title: 'Screen-time break', detail: `${firstName}'s phone shows a break until you end it. The phone itself is not locked.` }
      : { title: 'Device paused', detail: `${firstName}'s device stays paused until you resume it.` },
    resumed: live
      ? { title: 'Break ended', detail: `${firstName}'s phone shows the daily limit again.` }
      : { title: 'Device resumed', detail: `${firstName} has ${fmtDuration(left)} left today.` },
  };

  return (
    <Screen>
      <Header back title="Screen Time" subtitle={firstName} />
      

      {live ? (link.familyId && link.role === 'parent' && <DeviceReport key={link.familyId + '/' + activeChildId} family={link.familyId} child={activeChildId} />) : <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <ProgressRing progress={progress} size={168} stroke={16} label={fmtDuration(left)} sublabel="remaining today" />
        <Text variant="small" tone="muted" style={{ marginTop: spacing.md }}>
          {fmtDuration(activeChild.usedMin)} used of {fmtDuration(activeChild.limitMin)}
        </Text>
      </Card>}

      <View style={{ marginTop: spacing.xl }}>
        <SectionLabel>Daily limit</SectionLabel>
        <Card>
          <View style={styles.stepper}>
            <StepBtn
              icon="minus"
              label={`Lower the daily limit by ${STEP} minutes`}
              disabled={activeChild.limitMin <= STEP}
              onPress={() => adjustLimit(activeChildId, -STEP)}
            />
            <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`Daily limit ${fmtDuration(activeChild.limitMin)}`} style={{ alignItems: 'center' }}>
              <Text variant="display">{fmtDuration(activeChild.limitMin)}</Text>
              <Text variant="small" tone="muted">
                per day
              </Text>
            </View>
            <StepBtn icon="plus" label={`Raise the daily limit by ${STEP} minutes`} onPress={() => adjustLimit(activeChildId, STEP)} />
          </View>
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <Chip
                key={p}
                label={fmtDuration(p)}
                accessibilityLabel={`Set the daily limit to ${fmtDuration(p)}`}
                active={activeChild.limitMin === p}
                onPress={() => adjustLimit(activeChildId, p - activeChild.limitMin)}
              />
            ))}
          </View>
        </Card>
      </View>

      {!live && <View style={{ marginTop: spacing.xl }}>
        <SectionLabel>Where the time goes</SectionLabel>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {byCategory.map(([cat, mins]) => (
            <View key={cat} accessible accessibilityLabel={`${cat}: ${fmtDuration(mins)}`} style={styles.catRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text variant="smallStrong" style={{ textTransform: 'capitalize' }}>
                  {cat}
                </Text>
                <Text variant="small" tone="muted">
                  {fmtDuration(mins)}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${(mins / topMinutes) * 100}%`, backgroundColor: categoryColors.screenTime, borderRadius: 999 }} />
              </View>
            </View>
          ))}
        </Card>
      </View>}

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button
          label={live ? 'Raise the limit by 30 minutes' : 'Add 30 minutes today'}
          icon="plus-circle"
          variant="secondary"
          onPress={() => {
            grantBonus(activeChildId, 30);
            setLastAction('bonus');
          }}
        />
        {activeChild.bedtime ? (
          <Button
            label={live ? 'End the break' : 'Resume device'}
            icon="play"
            onPress={() => {
              resumeDevice(activeChildId);
              setLastAction('resumed');
            }}
          />
        ) : (
          <Button
            label={live ? 'Start a screen-time break' : 'Pause device now'}
            icon="pause"
            variant="danger"
            onPress={() => {
              pauseDevice(activeChildId);
              setLastAction('paused');
            }}
          />
        )}
        {lastAction != null && (
          <InlineNote
            tone={lastAction === 'paused' ? 'info' : 'success'}
            icon={lastAction === 'paused' ? 'pause-circle' : undefined}
            title={notes[lastAction].title}
            detail={notes[lastAction].detail}
          />
        )}
      </View>
    </Screen>
  );
}

function StepBtn({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.stepBtn,
        { backgroundColor: pressed ? colors.surfaceSunken : colors.surfaceAlt, borderColor: colors.border, opacity: disabled ? 0.4 : 1 },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}>
      <Feather name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  presets: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' },
  catRow: { paddingVertical: spacing.sm },
});

