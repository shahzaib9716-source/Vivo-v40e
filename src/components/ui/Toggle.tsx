import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';

interface Props {
  value: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(value ? colors.success : colors.surfaceSunken, { duration: 160 }),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(value ? 20 : 0, { duration: 160 }) }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange?.(!value)}
      hitSlop={8}
      style={{ opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={[{ width: 48, height: 28, borderRadius: 999, padding: 3, justifyContent: 'center' }, trackStyle]}>
        <Animated.View
          style={[
            { width: 22, height: 22, borderRadius: 999, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
            knobStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
