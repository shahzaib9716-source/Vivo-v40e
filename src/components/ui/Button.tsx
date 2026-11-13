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
}

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
}: Props) {
  const { colors } = useTheme();
  const heights = { sm: 38, md: 48, lg: 56 };
  const fontSizes = { sm: 14, md: 16, lg: 17 };

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
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          backgroundColor: bg[variant],
          borderRadius: radius.md,
          opacity: disabled ? 0.45 : 1,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          alignSelf: full ? 'stretch' : 'auto',
        },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.content}>
          {icon && <Feather name={icon} size={fontSizes[size] + 2} color={fg[variant]} />}
          <Text style={{ fontSize: fontSizes[size], fontWeight: '700' }} color={fg[variant]}>
            {label}
          </Text>
          {iconRight && <Feather name={iconRight} size={fontSizes[size] + 2} color={fg[variant]} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
