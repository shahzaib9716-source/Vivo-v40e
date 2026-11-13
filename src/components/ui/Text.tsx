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
    success: colors.successText,
    danger: colors.dangerText,
    warning: colors.warningText,
    onPrimary: colors.onPrimary,
    inherit: colors.text,
  };
  // The status colours are tuned for fills and icons. As small text on a light surface they are
  // too pale, so text asked for in one of them is drawn in its darker text variant.
  const readable =
    color === colors.success ? colors.successText : color === colors.warning ? colors.warningText : color === colors.danger ? colors.dangerText : color;
  return (
    <RNText
      style={[typeScale[variant], { color: readable ?? toneColor[tone] }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}
