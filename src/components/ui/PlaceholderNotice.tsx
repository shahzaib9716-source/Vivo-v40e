import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Shown on feature screens whose backend is not wired up in this build.
 * Keeps the category fully present in the UI while being honest that the
 * data shown is sample/preview content.
 */
export function PlaceholderNotice({ note }: { note?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.warningSoft }]}>
      <Feather name="info" size={16} color={colors.warning} />
      <Text variant="small" color={colors.warning} style={{ flex: 1 }}>
        {note ?? 'Preview screen — layout and sample data only. Not connected to a live source in this build.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
});
