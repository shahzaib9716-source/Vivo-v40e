import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo, Text } from '@/components/ui';
import { SIDE_HOME, SPLASH_BG, type AppSide } from '@/config/variant';
import { useStore } from '@/state/store';
import { useLink } from '@/sync/link';
import { radius, shadow, spacing, useTheme } from '@/theme';

export default function Welcome() {
  const { colors, mode } = useTheme();
  const { role, setRole, hasOnboarded, ready } = useStore();
  const link = useLink();

  // Which side to open. A device that is in a family has the role the server gave it; otherwise it
  // is the side picked here the last time. Neither: the chooser below.
  const side: AppSide | null = link.role ?? role;

  // Right after a start the link layer is still reading what this device is. Wait for that briefly
  // before offering a choice, so a linked phone never shows the chooser first.
  const undecided = link.configured && link.status === 'connecting' && side === null;
  const [waited, setWaited] = useState(false);
  /** Set by the chooser: it does its own navigation, so the redirect below must not run as well. */
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (!undecided) return;
    const timer = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(timer);
  }, [undecided]);

  // Hold on the splash colour until the saved flag is read, so a returning user never sees the intro flash.
  if (!ready || (undecided && !waited)) {
    return <View style={{ flex: 1, backgroundColor: mode === 'dark' ? SPLASH_BG.dark : SPLASH_BG.light }} />;
  }

  // First run: show the introduction before the role chooser.
  if (!hasOnboarded) {
    return <Redirect href={'/onboarding' as any} />;
  }

  if (side && !chosen) {
    return <Redirect href={SIDE_HOME[side] as any} />;
  }

  // First setup, or after "Switch mode": choose the side. With a server in the build, the next
  // step is the real setup (a parent's account, or a code on a child's phone); both can be skipped
  // to look around with sample data.
  const go = (next: AppSide) => {
    setChosen(true);
    setRole(next);
    (router.replace as any)(SIDE_HOME[next]);
    if (link.configured) (router.push as any)(next === 'parent' ? '/account' : '/link-device');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={['#5B51E0', '#7A4FE0', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={[styles.blob, { top: -40, right: -30 }]} />
        <View style={[styles.blob, { bottom: 10, left: -50, width: 160, height: 160 }]} />
        <SafeAreaView edges={['top']}>
          <View style={styles.heroInner}>
            <Entrance offset={0} scaleFrom={0.9}>
              <Logo size={72} color="rgba(255,255,255,0.18)" />
            </Entrance>
            <Entrance delay={60} style={{ marginTop: spacing.lg }}>
              <Text variant="display" color="#FFFFFF">
                Haven
              </Text>
            </Entrance>
            <Entrance delay={110} style={{ marginTop: 6 }}>
              <Text variant="body" color="rgba(255,255,255,0.85)" center style={{ maxWidth: 280 }}>
                One calm place to keep your family safe, balanced, and connected.
              </Text>
            </Entrance>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
        <ScrollView contentContainerStyle={styles.bottom} bounces={false} showsVerticalScrollIndicator={false}>
          <Entrance delay={150} style={styles.intro}>
            <Text variant="h3" style={{ marginBottom: spacing.xs }}>
              Who's setting up?
            </Text>
            <Text variant="small" tone="muted" style={{ marginBottom: spacing.lg }}>
              Choose how this device is used. Once it joins your family, that role is fixed by your family’s account.
            </Text>
          </Entrance>

          <Entrance delay={200}>
            <RoleCard
              title="I'm a parent"
              subtitle="Manage limits, see activity and locations across your family."
              icon="users"
              color={colors.primary}
              onPress={() => go('parent')}
            />
          </Entrance>
          <Entrance delay={250}>
            <RoleCard
              title="This is my child's device"
              subtitle="Set up Haven on your child's phone or tablet."
              icon="smartphone"
              color={colors.accent}
              onPress={() => go('child')}
            />
          </Entrance>

          <Entrance delay={320} offset={8} style={styles.footerWrap}>
            <View style={styles.footer}>
              <Feather name="lock" size={13} color={colors.textFaint} />
              <Text variant="tiny" tone="faint" style={{ flex: 1 }}>
                Haven is built around transparency — children can always see what's shared and limited.
              </Text>
            </View>
          </Entrance>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** Fades its children in while sliding them up a few points. Runs once on mount. */
function Entrance({
  delay = 0,
  offset = 14,
  scaleFrom = 1,
  style,
  children,
}: {
  delay?: number;
  offset?: number;
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })));
  }, [delay, t]);

  const aStyle = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v,
      transform: [{ translateY: (1 - v) * offset }, { scale: scaleFrom + (1 - scaleFrom) * v }],
    };
  });

  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>;
}

function RoleCard({ title, subtitle, icon, color, onPress }: { title: string; subtitle: string; icon: keyof typeof Feather.glyphMap; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.roleCard,
        { backgroundColor: colors.surface, borderColor: colors.border, ...shadow(1) },
        pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 },
      ]}>
      <View style={[styles.roleIcon, { backgroundColor: color + '1F' }]}>
        <Feather name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h3">{title}</Text>
        <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Feather name="arrow-right" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: '42%', minHeight: 230, justifyContent: 'center', overflow: 'hidden' },
  heroInner: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  blob: { position: 'absolute', width: 200, height: 200, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  bottomSafe: { flex: 1 },
  // Constrained and centred so the chooser stays readable on a wide web window.
  bottom: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.md },
  intro: { gap: spacing.md },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  roleIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  footerWrap: { marginTop: 'auto' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
});
