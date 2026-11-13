import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { radius, shadow, spacing, useTheme } from '@/theme';

interface Props {
  onPress: () => void;
  /** What a screen reader says for the whole card. */
  label: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** A tappable card whose content sits in a row and ends in a chevron. */
export function LinkCard({ onPress, label, style, children }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.card,
        shadow(1),
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
        pressed && styles.pressed,
      ]}>
      {children}
      <Feather name="chevron-right" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
