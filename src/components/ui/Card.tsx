import { ReactNode } from 'react';
import { Pressable, StyleProp, View, ViewStyle, StyleSheet } from 'react-native';

import { radius, shadow, spacing, useTheme } from '@/theme';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
  tone?: 'surface' | 'alt';
}

export function Card({ children, onPress, style, padded = true, elevated = true, tone = 'surface' }: Props) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: tone === 'surface' ? colors.surface : colors.surfaceAlt,
    borderRadius: radius.card,
    ...(padded ? { padding: spacing.lg } : null),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...(elevated ? shadow(1) : null),
  };

  // Flattened so the caller's padding replaces the default. On web an inline style object would
  // otherwise beat padding that comes from a StyleSheet class.
  const merged = StyleSheet.flatten([base, style]);

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [merged, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={merged}>{children}</View>;
}
