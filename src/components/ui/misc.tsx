import { ReactNode, useState } from 'react';
import { Platform, Pressable, View, StyleSheet, ViewStyle } from 'react-native';

import { radius, spacing, type, useTheme } from '@/theme';
import { fitFontSize } from './fitText';
import { Text } from './Text';

/** Small uppercase section label above a group. */
export function SectionLabel({ children, style }: { children: string; style?: ViewStyle }) {
  return (
    <Text
      variant="tiny"
      tone="faint"
      accessibilityRole="header"
      // On web a header without a level becomes an <h1>; section labels sit one level below the title.
      {...(Platform.OS === 'web' ? ({ 'aria-level': 2 } as object) : null)}
      style={[{ textTransform: 'uppercase', marginBottom: spacing.sm, marginLeft: spacing.xs }, style]}>
      {children}
    </Text>
  );
}

// The chip is about 36pt tall; extend its press target to 44pt.
const CHIP_HIT_SLOP = { top: 5, bottom: 5 };

/** A pill chip for filters / tags. Pressable when `onPress` is given. */
export function Chip({
  label,
  active,
  color,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
  /** Spoken name, when it should say more than the visible label. */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  const box: ViewStyle = {
    backgroundColor: active ? tint : colors.surfaceAlt,
    borderColor: active ? tint : colors.border,
  };
  const text = (
    <Text variant="smallStrong" color={active ? '#FFFFFF' : colors.textMuted} numberOfLines={1}>
      {label}
    </Text>
  );

  if (!onPress) return <View style={[styles.chip, box]}>{text}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!active }}
      // Web has no "selected" state for buttons; a pressed toggle button is the equivalent.
      {...(Platform.OS === 'web' ? ({ 'aria-pressed': !!active } as object) : null)}
      hitSlop={CHIP_HIT_SLOP}
      style={({ pressed }) => [styles.chip, box, pressed && { opacity: 0.6 }]}>
      {text}
    </Pressable>
  );
}

/** A compact stat tile: big value + caption. */
export function StatTile({
  value,
  caption,
  color,
  icon,
  compact,
  accessibilityLabel,
}: {
  value: string;
  caption: string;
  color?: string;
  icon?: ReactNode;
  /** Use a smaller value size, for rows of tiles that hold longer values such as "19h 33m". */
  compact?: boolean;
  /** Spoken description. Defaults to "caption: value". */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  // Three tiles across a phone leave roughly 80pt for the value. Once the tile has been laid
  // out, step the font size down just enough for the value to stay on one line.
  const [width, setWidth] = useState(0);
  const base = compact ? type.h3.fontSize : type.h2.fontSize;
  const fontSize = width > 0 ? fitFontSize(value, base, width - spacing.lg * 2, 13) : base;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${caption}: ${value}`}
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.width);
        if (next !== width) setWidth(next);
      }}
      style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {icon}
      <Text
        variant={compact ? 'h3' : 'h2'}
        color={color}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ marginTop: icon ? 6 : 0, fontSize }}>
        {value}
      </Text>
      <Text variant="small" tone="muted" numberOfLines={2}>
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
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
