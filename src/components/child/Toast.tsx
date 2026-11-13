import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { radius, shadow, spacing, useTheme } from '@/theme';

export interface ToastMessage {
  title: string;
  detail?: string;
  icon?: keyof typeof Feather.glyphMap;
}

/**
 * Holds the message for a <Toast /> and clears it again after `duration` ms.
 * Showing a new message while one is up replaces it and restarts the clock.
 */
export function useToast(duration = 3200) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback(
    (next: ToastMessage) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      timer.current = setTimeout(() => {
        timer.current = null;
        setMessage(null);
      }, duration);
    },
    [duration],
  );

  return { message, show };
}

/**
 * A short confirmation that floats over the bottom of its parent, so nothing in the layout moves
 * when it appears. It never takes touches. Pass `null` to hide it.
 *
 * It is drawn in the theme's inverse colours (ink on light, paper on dark) so it stands apart
 * from the cards behind it in both modes.
 */
export function Toast({ message, bottom = spacing.lg }: { message: ToastMessage | null; bottom?: number }) {
  const { colors } = useTheme();
  const shown = useSharedValue(0);

  // Keep drawing the last message while the toast fades out.
  const [last, setLast] = useState(message);
  if (message && message !== last) setLast(message);
  const content = message ?? last;
  const visible = message != null;

  useEffect(() => {
    shown.set(withTiming(visible ? 1 : 0, { duration: visible ? 200 : 160, easing: Easing.out(Easing.cubic) }));
  }, [visible, shown]);

  // Android and web announce the live region below; iOS needs to be told.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !message) return;
    AccessibilityInfo.announceForAccessibility(message.detail ? `${message.title}. ${message.detail}` : message.title);
  }, [message]);

  const motion = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 12 }],
  }));

  return (
    <View style={[styles.anchor, { bottom }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        aria-hidden={!visible}
        style={[styles.toast, { backgroundColor: colors.text }, motion]}>
        {content && (
          <>
            <View style={[styles.icon, { backgroundColor: colors.success }]}>
              <Feather name={content.icon ?? 'check'} size={16} color={colors.text} />
            </View>
            <View style={styles.text}>
              <Text variant="smallStrong" color={colors.bg} numberOfLines={2}>
                {content.title}
              </Text>
              {content.detail != null && (
                <Text variant="small" color={colors.bg} numberOfLines={2} style={styles.detail}>
                  {content.detail}
                </Text>
              )}
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 440,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: radius.lg,
    ...shadow(3),
  },
  icon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1 },
  detail: { opacity: 0.78, marginTop: 1 },
});
