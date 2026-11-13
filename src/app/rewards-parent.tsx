import { LinearGradient } from 'expo-linear-gradient';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Button, Card, Header, IconBadge, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { useStore } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

const REWARDS = [
  { id: 'r1', label: '30 min bonus time', cost: 50, icon: 'clock' as const },
  { id: 'r2', label: 'Later bedtime (weekend)', cost: 80, icon: 'moon' as const },
  { id: 'r3', label: 'Unlock a game for a day', cost: 120, icon: 'unlock' as const },
];

export default function RewardsParent() {
  const { colors } = useTheme();
  const { tasks, toggleTask, points, activeChildId, grantBonus } = useStore();
  const done = tasks.filter((t) => t.done).length;

  return (
    <Screen>
      <Header back title="Rewards & Tasks" />

      <LinearGradient colors={['#F5A623', '#FF7A59']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
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
            <Toggle value={t.done} onChange={() => toggleTask(t.id)} />
          </View>
        ))}
      </Card>

      <SectionLabel>Reward catalog</SectionLabel>
      <View style={{ gap: spacing.sm }}>
        {REWARDS.map((r) => {
          const can = points >= r.cost;
          return (
            <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge name={r.icon} color={colors.accent} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{r.label}</Text>
                <Text variant="small" tone="muted">
                  {r.cost} points
                </Text>
              </View>
              <Button
                label={can ? 'Grant' : 'Locked'}
                size="sm"
                variant={can ? 'primary' : 'secondary'}
                disabled={!can}
                onPress={() => grantBonus(activeChildId, 30)}
              />
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, borderRadius: radius.card, marginBottom: spacing.xl, ...shadow(2) },
  task: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
});
