import { ActivityIndicator, Pressable, View, ViewStyle, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Feather.glyphMap;
  iconRight?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  style?: ViewStyle;
  /** Spoken name, when it should say more than the visible label. Defaults to the label. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const HEIGHTS: Record<Size, number> = { sm: 38, md: 48, lg: 56 };
const FONT_SIZES: Record<Size, number> = { sm: 14, md: 16, lg: 17 };
// The small button is 38pt tall; extend its press target to 44pt.
const SMALL_HIT_SLOP = { top: 3, bottom: 3 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled,
  loading,
  full,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const { colors } = useTheme();
  const inactive = !!disabled || !!loading;

  const bg: Record<Variant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceAlt,
    ghost: 'transparent',
    danger: colors.danger,
  };
  const fg: Record<Variant, string> = {
    primary: colors.onPrimary,
    secondary: colors.text,
    ghost: colors.primary,
    danger: '#FFFFFF',
  };

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      aria-busy={loading ? true : undefined}
      hitSlop={size === 'sm' ? SMALL_HIT_SLOP : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHTS[size],
          backgroundColor: bg[variant],
          borderRadius: radius.md,
          opacity: disabled ? 0.45 : 1,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          alignSelf: full ? 'stretch' : 'auto',
        },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        // A ghost button has no fill of its own, so give the press something to show.
        pressed && variant === 'ghost' && { backgroundColor: colors.primarySoft },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.content}>
          {icon && <Feather name={icon} size={FONT_SIZES[size] + 2} color={fg[variant]} />}
          <Text style={{ fontSize: FONT_SIZES[size], fontWeight: '700' }} color={fg[variant]}>
            {label}
          </Text>
          {iconRight && <Feather name={iconRight} size={FONT_SIZES[size] + 2} color={fg[variant]} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
