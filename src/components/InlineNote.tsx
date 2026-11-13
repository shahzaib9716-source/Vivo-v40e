import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { radius, spacing, useTheme } from '@/theme';

type Tone = 'info' | 'success' | 'neutral';

interface Props {
  title: string;
  detail?: string;
  icon?: keyof typeof Feather.glyphMap;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}

/**
 * A short message shown in the page flow, right where an action happened: "Ping sent",
 * "Demo: no purchase made". It stays until the screen replaces or removes it, so nobody has to
 * read it against a timer, and it is announced to screen readers when it appears or changes.
 */
export function InlineNote({ title, detail, icon, tone = 'info', style }: Props) {
  const { colors } = useTheme();
  const shown = useSharedValue(0);

  // Fade in on mount, and again whenever the message changes so a replaced note is noticed.
  useEffect(() => {
    shown.set(0);
    shown.set(withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
  }, [title, detail, shown]);

  // Android and web announce the live region below; iOS needs to be told.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AccessibilityInfo.announceForAccessibility(detail ? `${title}. ${detail}` : title);
  }, [title, detail]);

  const motion = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 6 }],
  }));

  const palette: Record<Tone, { bg: string; fg: string; icon: keyof typeof Feather.glyphMap }> = {
    info: { bg: colors.infoSoft, fg: colors.info, icon: 'info' },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'check-circle' },
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted, icon: 'info' },
  };
  const look = palette[tone];

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { backgroundColor: look.bg, borderColor: look.fg + '33' }, motion, style]}>
      <Feather name={icon ?? look.icon} size={18} color={look.fg} style={styles.icon} />
      <View style={styles.text}>
        <Text variant="smallStrong">{title}</Text>
        {detail != null && (
          <Text variant="small" tone="muted" style={styles.detail}>
            {detail}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginTop: 1 },
  text: { flex: 1 },
  detail: { marginTop: 2 },
});
