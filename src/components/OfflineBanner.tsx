import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Text } from '@/components/ui';
import { useLink } from '@/sync/link';
import { radius, spacing, useTheme } from '@/theme';

/**
 * Shown at the top of each side's home screen while a phone that is in a family has no connection.
 * For a safety app this must be visible where the app opens, not only under "Family link": a child
 * should know that an SOS or a request is waiting on this phone, and a parent that what they see may
 * be out of date.
 */
export function OfflineBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const link = useLink();
  if (link.status !== 'offline' || link.role === null) return null;
  const detail =
    link.role === 'child'
      ? 'Requests, messages and SOS are kept on this phone and sent when the connection is back. In an emergency, call.'
      : 'What you see may be out of date, and new requests or an SOS from your child arrive when the connection is back.';
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`No connection. ${detail}`}
      style={[styles.wrap, { backgroundColor: colors.warningSoft, borderColor: colors.warning + '55' }, style]}>
      <Feather name="wifi-off" size={18} color={colors.warningText} style={styles.icon} />
      <View style={styles.flex}>
        <Text variant="smallStrong">No connection</Text>
        <Text variant="small" tone="muted">
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  icon: { marginTop: 2 },
  flex: { flex: 1 },
});
