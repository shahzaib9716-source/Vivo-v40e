import { Pressable, View, StyleSheet } from 'react-native';

import { radius, shadow, useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  /** Names the group for screen readers, e.g. "Report range". */
  accessibilityLabel?: string;
}

export function SegmentedControl({ options, value, onChange, accessibilityLabel }: Props) {
  const { colors, mode } = useTheme();
  // On the dark sunken track the plain surface colour barely shows, so lift the thumb a step.
  const thumb = mode === 'dark' ? colors.surfaceAlt : colors.surface;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrap, { backgroundColor: colors.surfaceSunken }]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityLabel={opt}
            accessibilityState={{ checked: active }}
            aria-checked={active}
            hitSlop={SEGMENT_HIT_SLOP}
            style={({ pressed }) => [
              styles.seg,
              active && [styles.active, { backgroundColor: thumb, borderColor: colors.border }],
              pressed && !active && { opacity: 0.55 },
            ]}>
            <Text variant="smallStrong" tone={active ? 'default' : 'muted'} numberOfLines={1}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Covers the track padding above and below a segment, so the whole 44pt height responds.
const SEGMENT_HIT_SLOP = { top: 3, bottom: 3 };

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3, borderRadius: radius.md, gap: 3 },
  // 38pt segments + 3pt track padding on each side = a 44pt control.
  seg: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  active: shadow(1),
});
