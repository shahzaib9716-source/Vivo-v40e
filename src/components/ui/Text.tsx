import { Text as RNText, TextProps } from 'react-native';

import { type as typeScale, useTheme } from '@/theme';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'accent' | 'success' | 'danger' | 'warning' | 'onPrimary' | 'inherit';

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  color?: string;
  center?: boolean;
}

export function Text({ variant = 'body', tone = 'default', color, center, style, ...rest }: Props) {
  const { colors } = useTheme();
  const toneColor: Record<Tone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    primary: colors.primary,
    accent: colors.accent,
    success: colors.success,
    danger: colors.danger,
    warning: colors.warning,
    onPrimary: colors.onPrimary,
    inherit: colors.text,
  };
  return (
    <RNText
      style={[typeScale[variant], { color: color ?? toneColor[tone] }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}
