import { useLocalSearchParams } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { useLink } from '@/sync/link';
import { spacing, useTheme } from '@/theme';

// Each line is written twice: once for the child reading about themselves, once for the parent.
const SHARED = [
  { icon: 'clock', label: 'Screen time', detail: 'How long you use your device each day', parentDetail: 'How long your child uses their device each day' },
  { icon: 'grid', label: 'Apps & time in them', detail: 'Which apps you use and for how long', parentDetail: 'Which apps they use and for how long' },
  { icon: 'map-pin', label: 'Location', detail: 'Where your device is, and places you visit', parentDetail: 'Where their device is, and places they visit' },
  { icon: 'battery', label: 'Battery level', detail: 'So your family knows if your device is low', parentDetail: 'So you know if their device is running low' },
] as const;

/**
 * A real family: exactly what travels between the phones in this version. It reads nothing from the
 * phone itself (no location, no usage, no battery), so those are listed as not shared.
 */
const LIVE_SHARED = [
  { icon: 'map-pin', label: 'Shared location', detail: 'A location you share once or every minute while the Me tab is open', parentDetail: 'The latest location your child chooses to share' },
  { icon: 'grid', label: 'Shared usage', detail: 'Launchable apps and foreground time when you share a usage report', parentDetail: 'Apps and foreground time in the latest report your child shared' },
  { icon: 'send', label: 'Requests', detail: 'When you ask for more time or to unlock an app', parentDetail: 'When your child asks for more time or to unlock an app' },
  { icon: 'check-circle', label: 'Check-ins', detail: 'The time you tap “Check in”. Not where you are', parentDetail: 'The time your child taps “Check in”. Not where they are' },
  { icon: 'message-circle', label: 'Messages in Haven', detail: 'The chat between you and your parent in this app', parentDetail: 'The chat between you and your child in this app' },
  { icon: 'alert-circle', label: 'SOS', detail: 'When you send an SOS and when you say you are safe', parentDetail: 'When your child sends an SOS and when it is cleared' },
  { icon: 'award', label: 'Tasks', detail: 'The tasks you tick off', parentDetail: 'The tasks your child ticks off' },
  { icon: 'smartphone', label: 'This phone', detail: 'Its name, and when Haven was last open on it', parentDetail: 'Each phone’s name, and when Haven was last open on it' },
] as const;

const LIVE_NOT_SHARED = [
  { label: 'Other messages, calls and photos', parentLabel: 'Other messages, calls and photos', detail: 'Haven does not read texts, chats, calls or your camera roll', parentDetail: 'Haven does not read texts, chats, calls or the camera roll' },
  { label: 'Browsing and what you watch', parentLabel: 'Browsing and what they watch', detail: 'Those parent screens are previews with example data only', parentDetail: 'Those screens are previews with example data only' },
  { label: 'Hidden tracking', parentLabel: 'Hidden tracking', detail: 'Nothing runs secretly — this screen shows it all', parentDetail: 'Nothing runs secretly. Your child sees this same list' },
] as const;

const NOT_SHARED = [
  { label: 'The content of your messages', parentLabel: 'The content of their messages', detail: 'Haven does not read your texts or chats', parentDetail: 'Haven does not read texts or chats' },
  { label: 'Your photos', parentLabel: 'Their photos', detail: 'Your camera roll stays private', parentDetail: 'The camera roll stays private' },
  { label: 'Calls, browsing and what you watch', parentLabel: 'Calls, browsing and what they watch', detail: 'Those parent screens are previews with sample data only', parentDetail: 'Those screens are previews with sample data only' },
  { label: 'Hidden tracking', parentLabel: 'Hidden tracking', detail: 'Nothing runs secretly — this screen shows it all', parentDetail: 'Nothing runs secretly. Your child sees this same list' },
] as const;

export default function Transparency() {
  const { colors } = useTheme();
  const { role, live } = useStore();
  const linkConfigured = useLink().configured;
  const { as } = useLocalSearchParams<{ as?: string }>();
  const parent = as === 'parent' || role === 'parent';
  // With a server in the build, this list is what linking really shares, before and after joining.
  // Only a build without one (a demo with no linking at all) shows the sample list.
  const real = live || linkConfigured;
  const shared = real ? LIVE_SHARED : SHARED;
  const notShared = real ? LIVE_NOT_SHARED : NOT_SHARED;
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
        {shared.map((s) => (
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
        {notShared.map((s) => (
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

