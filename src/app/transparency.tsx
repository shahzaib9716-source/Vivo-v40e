import { useLocalSearchParams } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { spacing, useTheme } from '@/theme';

// Each line is written twice: once for the child reading about themselves, once for the parent.
const SHARED = [
  { icon: 'clock', label: 'Screen time', detail: 'How long you use your device each day', parentDetail: 'How long your child uses their device each day' },
  { icon: 'grid', label: 'Apps & time in them', detail: 'Which apps you use and for how long', parentDetail: 'Which apps they use and for how long' },
  { icon: 'map-pin', label: 'Location', detail: 'Where your device is, and places you visit', parentDetail: 'Where their device is, and places they visit' },
  { icon: 'battery', label: 'Battery level', detail: 'So your family knows if your device is low', parentDetail: 'So you know if their device is running low' },
] as const;

const NOT_SHARED = [
  { label: 'The content of your messages', parentLabel: 'The content of their messages', detail: 'Haven does not read your texts or chats', parentDetail: 'Haven does not read texts or chats' },
  { label: 'Your photos', parentLabel: 'Their photos', detail: 'Your camera roll stays private', parentDetail: 'The camera roll stays private' },
  { label: 'Calls, browsing and what you watch', parentLabel: 'Calls, browsing and what they watch', detail: 'Those parent screens are previews with sample data only', parentDetail: 'Those screens are previews with sample data only' },
  { label: 'Hidden tracking', parentLabel: 'Hidden tracking', detail: 'Nothing runs secretly — this screen shows it all', parentDetail: 'Nothing runs secretly. Your child sees this same list' },
] as const;

export default function Transparency() {
  const { colors } = useTheme();
  const { role } = useStore();
  const { as } = useLocalSearchParams<{ as?: string }>();
  const parent = as === 'parent' || role === 'parent';
  return (
    <Screen>
      <Header back title="What's shared" subtitle="Haven is built on transparency" />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl, backgroundColor: colors.successSoft, borderColor: colors.success + '44' }}>
        <Feather name="shield" size={24} color={colors.success} />
        {/* Body ink rather than green-on-green, so the promise is easy to read in both modes. */}
        <Text variant="small" style={{ flex: 1 }}>
          {parent
            ? 'Your child can open this same screen at any time. Nothing here is hidden from them.'
            : "You can always open this screen to see exactly what your family can and can't see."}
        </Text>
      </Card>

      <SectionLabel>{parent ? 'You can see' : 'Your family can see'}</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {SHARED.map((s) => (
          <View key={s.label} accessible accessibilityLabel={`Shared: ${s.label}. ${parent ? s.parentDetail : s.detail}`} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
              <Feather name={s.icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title">{s.label}</Text>
              <Text variant="small" tone="muted">
                {parent ? s.parentDetail : s.detail}
              </Text>
            </View>
            <Feather name="check-circle" size={18} color={colors.success} />
          </View>
        ))}
      </Card>

      <SectionLabel>{parent ? 'You cannot see' : 'Your family cannot see'}</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {NOT_SHARED.map((s) => (
          <View key={s.label} accessible accessibilityLabel={`Not shared: ${parent ? s.parentLabel : s.label}. ${parent ? s.parentDetail : s.detail}`} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.surfaceSunken }]}>
              <Feather name="lock" size={18} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title">{parent ? s.parentLabel : s.label}</Text>
              <Text variant="small" tone="muted">
                {parent ? s.parentDetail : s.detail}
              </Text>
            </View>
            <Feather name="x-circle" size={18} color={colors.textFaint} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
