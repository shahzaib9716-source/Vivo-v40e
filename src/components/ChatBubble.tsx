import { ReactNode, useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { palette, radius, spacing, useTheme } from '@/theme';

/** Where a bubble sits inside a run of messages from the same sender. */
export type BubblePosition = 'single' | 'first' | 'middle' | 'last';

/** Which brand colour the current sender's bubbles use: parents are primary, kids are accent. */
export type BubbleTone = 'primary' | 'accent';

type Colors = ReturnType<typeof useTheme>['colors'];

const ROUND = radius.card;
const JOINED = 6;

/**
 * Fill, text and soft-wash colours for the current sender.
 *
 * The coral accent is the same in light and dark mode and is too light to carry white body text
 * (about 2.6:1), so accent bubbles use the theme's ink colour instead, which reads at about 7:1.
 */
export function bubbleTint(tone: BubbleTone, colors: Colors) {
  return tone === 'accent'
    ? { fill: colors.accent, text: palette.light.text, soft: colors.accentSoft }
    : { fill: colors.primary, text: colors.onPrimary, soft: colors.primarySoft };
}

/** Fades and lifts its children into place once, when they first mount. */
export function AppearIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.set(withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
  }, [shown]);

  const motion = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 8 }],
  }));

  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}

interface ChatBubbleProps {
  text: string;
  /** True when the person using this device sent the message. */
  mine: boolean;
  /** Colour used for `mine` bubbles. */
  tone: BubbleTone;
  position?: BubblePosition;
  /** Fade the bubble in on mount. Used for messages that arrive while the chat is open. */
  animate?: boolean;
  accessibilityLabel?: string;
}

export function ChatBubble({ text, mine, tone, position = 'single', animate = false, accessibilityLabel }: ChatBubbleProps) {
  const { colors } = useTheme();
  const tint = bubbleTint(tone, colors);

  // Corners on the sender's side tighten where two bubbles in the same run touch.
  const top = position === 'middle' || position === 'last' ? JOINED : ROUND;
  const bottom = position === 'middle' || position === 'first' ? JOINED : ROUND;
  const shape: ViewStyle = mine
    ? { borderTopRightRadius: top, borderBottomRightRadius: bottom }
    : { borderTopLeftRadius: top, borderBottomLeftRadius: bottom };

  const fill: ViewStyle = mine
    ? { backgroundColor: tint.fill, borderColor: tint.fill }
    : { backgroundColor: colors.surface, borderColor: colors.border };

  const bubble = (
    <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel} style={[styles.bubble, shape, fill]}>
      <Text selectable color={mine ? tint.text : colors.text} style={styles.text}>
        {text}
      </Text>
    </View>
  );

  const slot = [styles.slot, mine ? styles.mine : styles.theirs];
  return animate ? <AppearIn style={slot}>{bubble}</AppearIn> : <View style={slot}>{bubble}</View>;
}

/** Three softly bouncing dots in an incoming bubble, shown while the other person is typing. */
export function TypingBubble({ accessibilityLabel = 'Typing' }: { accessibilityLabel?: string }) {
  const { colors } = useTheme();
  const clock = useSharedValue(0);

  useEffect(() => {
    clock.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock]);

  return (
    <AppearIn style={[styles.slot, styles.theirs]}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        accessibilityLiveRegion="polite"
        style={[styles.bubble, styles.typing, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TypingDot index={0} clock={clock} color={colors.textMuted} />
        <TypingDot index={1} clock={clock} color={colors.textMuted} />
        <TypingDot index={2} clock={clock} color={colors.textMuted} />
      </View>
    </AppearIn>
  );
}

function TypingDot({ index, clock, color }: { index: number; clock: SharedValue<number>; color: string }) {
  const motion = useAnimatedStyle(() => {
    // Each dot rises during the first half of its own cycle, offset from the one before it.
    const phase = (clock.get() - index * 0.16 + 1) % 1;
    const lift = phase < 0.5 ? Math.sin(phase * 2 * Math.PI) : 0;
    return { opacity: 0.35 + 0.65 * lift, transform: [{ translateY: -3 * lift }] };
  });

  return <Animated.View style={[styles.dot, { backgroundColor: color }, motion]} />;
}

const styles = StyleSheet.create({
  slot: { maxWidth: '80%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: ROUND,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 15, lineHeight: 21 },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderBottomLeftRadius: ROUND,
  },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
});
