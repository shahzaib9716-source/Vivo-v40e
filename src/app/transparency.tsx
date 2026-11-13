import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, Screen, SectionLabel, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

const SHARED = [
  { icon: 'clock', label: 'Screen time', detail: 'How long you use your device each day' },
  { icon: 'grid', label: 'Apps & time in them', detail: 'Which apps you use and for how long' },
  { icon: 'map-pin', label: 'Location', detail: 'Where your device is, and places you visit' },
  { icon: 'battery', label: 'Battery level', detail: 'So your family knows if your device is low' },
] as const;

const NOT_SHARED = [
  { label: 'The content of your messages', detail: 'Haven does not read your texts or chats' },
  { label: 'Your photos', detail: 'Your camera roll stays private' },
  { label: 'Hidden tracking', detail: 'Nothing runs secretly — this screen shows it all' },
] as const;

export default function Transparency() {
  const { colors } = useTheme();
  return (
    <Screen>
      <Header back title="What's shared" subtitle="Haven is built on transparency" />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl, backgroundColor: colors.successSoft, borderColor: colors.success + '44' }}>
        <Feather name="shield" size={24} color={colors.success} />
        <Text variant="small" color={colors.success} style={{ flex: 1 }}>
          You can always open this screen to see exactly what your family can and can't see.
        </Text>
      </Card>

      <SectionLabel>Your family can see</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {SHARED.map((s) => (
          <View key={s.label} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
              <Feather name={s.icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title">{s.label}</Text>
              <Text variant="small" tone="muted">
                {s.detail}
              </Text>
            </View>
            <Feather name="check-circle" size={18} color={colors.success} />
          </View>
        ))}
      </Card>

      <SectionLabel>Your family cannot see</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {NOT_SHARED.map((s) => (
          <View key={s.label} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.surfaceSunken }]}>
              <Feather name="lock" size={18} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title">{s.label}</Text>
              <Text variant="small" tone="muted">
                {s.detail}
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
