import { LinearGradient } from 'expo-linear-gradient';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, ProgressBar, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

/** Point costs in the parent's reward catalog (src/app/rewards-parent.tsx). */
const REWARD_COSTS = [30, 50, 70];

export default function ChildRewards() {
  const { colors } = useTheme();
  const { tasks, toggleTask, points } = useStore();
  const nextCost = REWARD_COSTS.find((c) => c > points);
  const goal = nextCost ?? REWARD_COSTS[REWARD_COSTS.length - 1];

  return (
    <Screen>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <Text variant="h1">Your rewards</Text>
      </View>

      <LinearGradient colors={['#F5A623', '#FF7A59']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text variant="small" color="rgba(255,255,255,0.9)">
              You have
            </Text>
            <Text variant="display" color="#FFFFFF">
              {points} pts
            </Text>
          </View>
          <Feather name="award" size={52} color="rgba(255,255,255,0.4)" />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <ProgressBar progress={Math.min(1, points / goal)} color="#FFFFFF" track="rgba(255,255,255,0.3)" height={10} />
          <Text variant="small" color="rgba(255,255,255,0.9)" style={{ marginTop: 6 }}>
            {nextCost ? `${nextCost - points} pts to your next reward` : 'All rewards unlocked. Ask a parent to grant one!'}
          </Text>
        </View>
      </LinearGradient>

      <SectionLabel>Today's tasks</SectionLabel>
      <View style={{ gap: spacing.sm }}>
        {tasks.map((t) => (
          <Card key={t.id} onPress={() => toggleTask(t.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={[styles.check, { backgroundColor: t.done ? colors.success : 'transparent', borderColor: t.done ? colors.success : colors.border }]}>
              {t.done && <Feather name="check" size={16} color="#FFFFFF" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title" style={t.done ? { color: colors.textFaint, textDecorationLine: 'line-through' } : undefined}>
                {t.title}
              </Text>
            </View>
            <View style={[styles.pts, { backgroundColor: colors.warningSoft }]}>
              <Text variant="smallStrong" color={colors.warning}>
                +{t.points}
              </Text>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: spacing.xl, borderRadius: radius.card, marginBottom: spacing.xl, ...shadow(2) },
  check: { width: 30, height: 30, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pts: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
});
