import { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

/** Small uppercase section label above a group. */
export function SectionLabel({ children, style }: { children: string; style?: ViewStyle }) {
  return (
    <Text variant="tiny" tone="faint" style={[{ textTransform: 'uppercase', marginBottom: spacing.sm, marginLeft: spacing.xs }, style]}>
      {children}
    </Text>
  );
}

/** A pill chip for filters / tags. */
export function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  return (
    <View
      onTouchEnd={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: active ? tint : colors.surfaceAlt,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? tint : colors.border,
      }}>
      <Text variant="smallStrong" color={active ? '#FFFFFF' : colors.textMuted}>
        {label}
      </Text>
    </View>
  );
}

/** A compact stat tile: big value + caption. */
export function StatTile({
  value,
  caption,
  color,
  icon,
}: {
  value: string;
  caption: string;
  color?: string;
  icon?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {icon}
      <Text variant="h2" color={color} style={{ marginTop: icon ? 6 : 0 }}>
        {value}
      </Text>
      <Text variant="small" tone="muted">
        {caption}
      </Text>
    </View>
  );
}

/** Divider line. */
export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs }} />;
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
