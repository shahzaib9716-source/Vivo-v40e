import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, ProgressRing, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

export default function ChildHome() {
  const { colors } = useTheme();
  const { childSelf, tasks } = useStore();
  const left = Math.max(0, childSelf.limitMin - childSelf.usedMin);
  const progress = Math.min(1, childSelf.usedMin / childSelf.limitMin);
  const allowed = childSelf.apps.filter((a) => !a.blocked).slice(0, 6);
  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
            <Text variant="small" tone="muted">
              {childSelf.bedtime ? 'Wind-down time' : 'Hi there'}
            </Text>
            <Text variant="display">{childSelf.name.split(' ')[0]} 👋</Text>
          </View>

          {/* Time ring */}
          <LinearGradient colors={childSelf.bedtime ? ['#3B3663', '#2A2748'] : ['#FF7A59', '#FF5E8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <ProgressRing progress={progress} size={150} stroke={14} color="#FFFFFF" track="rgba(255,255,255,0.25)" label={fmtDuration(left)} sublabel="left today" centerColor="#FFFFFF" />
            <Text variant="small" color="rgba(255,255,255,0.9)" style={{ marginTop: spacing.md }}>
              {childSelf.bedtime ? 'Device is paused right now' : `You've used ${fmtDuration(childSelf.usedMin)} today`}
            </Text>
          </LinearGradient>

          {/* Quick actions */}
          <View style={styles.actions}>
            <QuickAction icon="plus-circle" label="Ask for time" color={colors.primary} onPress={() => (router.push as any)('/(child)/requests')} />
            <QuickAction icon="map-pin" label="Check in" color={colors.info} onPress={() => {}} />
            <QuickAction icon="alert-circle" label="SOS" color={colors.danger} onPress={() => (router.push as any)('/sos')} />
          </View>

          {/* Tasks nudge */}
          {openTasks > 0 && (
            <Card onPress={() => (router.push as any)('/(child)/rewards')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl }}>
              <View style={[styles.taskIcon, { backgroundColor: colors.warningSoft }]}>
                <Feather name="check-square" size={20} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="title">{openTasks} tasks to earn points</Text>
                <Text variant="small" tone="muted">
                  Finish them to unlock rewards
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textFaint} />
            </Card>
          )}

          {/* Allowed now */}
          <Text variant="h3" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
            You can use now
          </Text>
          <View style={styles.appGrid}>
            {allowed.map((a) => (
              <View key={a.id} style={styles.appItem}>
                <View style={[styles.appIcon, { backgroundColor: a.color + '22' }]}>
                  <MaterialCommunityIcons name={a.icon as never} size={26} color={a.color} />
                </View>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {a.name}
                </Text>
              </View>
            ))}
          </View>

          {/* Transparency */}
          <Card onPress={() => (router.push as any)('/transparency')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl }}>
            <Feather name="eye" size={18} color={colors.success} />
            <Text variant="small" tone="muted" style={{ flex: 1 }}>
              See exactly what Haven shares with your family
            </Text>
            <Feather name="chevron-right" size={18} color={colors.textFaint} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.qa, { backgroundColor: colors.surface, borderColor: colors.border, ...shadow(1) }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={[styles.qaIcon, { backgroundColor: color + '1F' }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text variant="smallStrong">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', padding: spacing.xl, borderRadius: radius.card, ...shadow(2) },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  qa: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  qaIcon: { width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  taskIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  appItem: { width: '21%', alignItems: 'center', gap: 6 },
  appIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
});
