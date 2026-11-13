import { createContext, useContext } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';

/**
 * Lets a container name the switch it holds. Row provides its title here, so a Toggle placed in
 * a Row's `right` slot is announced as "Push notifications, switch, on" without extra wiring.
 */
export const ToggleLabelContext = createContext<string | undefined>(undefined);

interface Props {
  value: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  /** What the switch controls. Defaults to the title of the Row it sits in. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Toggle({ value, onChange, disabled, accessibilityLabel, accessibilityHint }: Props) {
  const { colors } = useTheme();
  const inheritedLabel = useContext(ToggleLabelContext);
  // A faint-ink tint reads as "off" on both the light and the dark card surface.
  const offColor = colors.textFaint + '66';
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(value ? colors.success : offColor, { duration: 160 }),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(value ? 20 : 0, { duration: 160 }) }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange?.(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? inheritedLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => [styles.target, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const HIT_SLOP = { left: 8, right: 8 };

const styles = StyleSheet.create({
  // The track is 28pt tall. The padding makes the press target 44pt and the matching negative
  // margin keeps the layout footprint at 28pt, so rows do not grow. This also works on web,
  // where hitSlop is ignored.
  target: { paddingVertical: 8, marginVertical: -8 },
  track: { width: 48, height: 28, borderRadius: 999, padding: 3, justifyContent: 'center' },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
