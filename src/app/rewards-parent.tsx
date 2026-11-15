import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { InlineNote } from '@/components/InlineNote';
import { Button, Card, Header, IconBadge, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { fmtDuration, useStore } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

type RewardId = 'bonus' | 'bedtime' | 'unlock';

// The four sample tasks are worth 70 points in total, so every reward here can be reached.
const REWARDS: { id: RewardId; label: string; cost: number; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'bonus', label: '30 min bonus time', cost: 30, icon: 'clock' },
  { id: 'bedtime', label: 'Later bedtime (weekend)', cost: 50, icon: 'moon' },
  { id: 'unlock', label: 'Unlock a game', cost: 70, icon: 'unlock' },
];

interface Granted {
  title: string;
  detail: string;
  /** False when nothing in the app changed, so the note is not dressed up as a success. */
  applied: boolean;
}

export default function RewardsParent() {
  const { colors } = useTheme();
  const { tasks, toggleTask, points, activeChild, activeChildId, grantBonus, toggleApp, live } = useStore();
  const [granted, setGranted] = useState<Granted | null>(null);
  const done = tasks.filter((t) => t.done).length;
  const firstName = activeChild.name.split(' ')[0];

  // Each reward does only what the app can really do, and the note says exactly what happened.
  const grant = (id: RewardId) => {
    if (id === 'bonus') {
      grantBonus(activeChildId, 30);
      setGranted({
        title: '30 minutes granted',
        detail: live
          ? `${firstName}'s daily limit is now ${fmtDuration(activeChild.limitMin + 30)}, from today on, until you lower it.`
          : `${firstName}'s limit today is now ${fmtDuration(activeChild.limitMin + 30)}.`,
        applied: true,
      });
      return;
    }
    if (id === 'unlock') {
      const game = activeChild.apps.find((a) => a.blocked && a.category === 'games');
      if (game) {
        toggleApp(activeChildId, game.id);
        setGranted({ title: `${game.name} unlocked`, detail: `It stays open for ${firstName} until you block it again in App Limits.`, applied: true });
      } else {
        setGranted({ title: 'No blocked game to unlock', detail: `${firstName} has no blocked games right now, so nothing changed.`, applied: false });
      }
      return;
    }
    setGranted({ title: 'Demo: later bedtime noted', detail: 'Schedules were not changed. Edit bedtime in Schedules to move it.', applied: false });
  };

  return (
    <Screen>
      <Header back title="Rewards & Tasks" />

      <LinearGradient
        colors={['#B45309', '#C2410C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
        accessible
        accessibilityLabel={`${points} points earned. ${done} of ${tasks.length} tasks done.`}>
        <View>
          <Text variant="small" color="rgba(255,255,255,0.9)">
            Points earned
          </Text>
          <Text variant="display" color="#FFFFFF">
            {points}
          </Text>
          <Text variant="small" color="rgba(255,255,255,0.9)">
            {done} of {tasks.length} tasks done
          </Text>
        </View>
        <Feather name="award" size={56} color="rgba(255,255,255,0.35)" />
      </LinearGradient>

      <SectionLabel>Tasks & chores</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {tasks.map((t) => (
          <View key={t.id} style={styles.task}>
            <View style={{ flex: 1 }}>
              <Text variant="title" style={t.done ? { textDecorationLine: 'line-through', color: colors.textFaint } : undefined}>
                {t.title}
              </Text>
              <Text variant="small" tone="muted">
                +{t.points} points
              </Text>
            </View>
            <Toggle value={t.done} onChange={() => toggleTask(t.id)} accessibilityLabel={`${t.title}, ${t.points} points, done`} />
          </View>
        ))}
      </Card>

      <SectionLabel>Reward catalog</SectionLabel>
      {granted != null && (
        <InlineNote
          tone={granted.applied ? 'success' : 'neutral'}
          title={granted.title}
          detail={granted.detail}
          style={{ marginBottom: spacing.md }}
        />
      )}
      <View style={{ gap: spacing.sm }}>
        {REWARDS.map((r) => {
          const can = points >= r.cost;
          return (
            <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge name={r.icon} color={colors.accent} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{r.label}</Text>
                <Text variant="small" tone="muted">
                  {can ? `${r.cost} points` : `${r.cost} points · ${r.cost - points} to go`}
                </Text>
              </View>
              <Button
                label={can ? 'Grant' : 'Locked'}
                accessibilityLabel={can ? `Grant ${r.label}` : `${r.label} is locked. ${r.cost - points} more points needed`}
                size="sm"
                variant={can ? 'primary' : 'secondary'}
                disabled={!can}
                onPress={() => grant(r.id)}
              />
            </Card>
          );
        })}
      </View>

      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.lg }}>
        Demo: granting a reward does not spend points.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, borderRadius: radius.card, marginBottom: spacing.xl, ...shadow(2) },
  task: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 56 },
});
