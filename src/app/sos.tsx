import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { radius, spacing } from '@/theme';

/** How long the button has to be held before the SOS goes out. */
const HOLD_MS = 1500;
/** An activation that has no hold (a screen reader's double tap) must be repeated within this window. */
const CONFIRM_MS = 6000;
/** "I'm safe now" ignores presses this soon after the SOS goes out, while the holding finger is still lifting. */
const SETTLE_MS = 600;
/** Below this much room the hold button is drawn smaller so the whole screen still fits. */
const COMPACT_BELOW = 600;

// White text sits on these, so every stop is dark enough for body copy.
const DANGER_GRADIENT = ['#E3263A', '#C81E2E', '#A51616'] as const;
const SAFE_GRADIENT = ['#0A8259', '#06603F'] as const;
const DANGER_INK = '#B91C1C';
const DANGER_FILL = '#8E1220';
const SAFE_INK = '#06603F';
const WHITE = '#FFFFFF';

type Timer = ReturnType<typeof setTimeout>;
type Phase = 'idle' | 'holding' | 'released' | 'confirm';

const HINT: Record<Phase, string> = {
  idle: 'Press and hold to alert your family',
  holding: 'Keep holding…',
  released: 'You let go too soon. Hold until the circle fills up.',
  confirm: 'Press once more to send the SOS',
};

const noop = () => {};

export default function SOS() {
  const { childSelf, sosActive, triggerSOS, clearSOS } = useStore();

  // Measured rather than read from the window: a modal sheet is shorter than the screen, and a page
  // rendered on the server has no window to ask.
  const [compact, setCompact] = useState(false);
  const onColumnLayout = (event: LayoutChangeEvent) => setCompact(event.nativeEvent.layout.height < COMPACT_BELOW);

  // Starts out sent when an SOS is already running. It never goes back to false, so the screen keeps
  // its sent look while it closes after "I'm safe now".
  const [sent, setSent] = useState(sosActive);
  const showSent = sent || sosActive;
  const fired = useRef(false);
  const sentAt = useRef(0);

  const close = () => {
    if (router.canGoBack()) router.back();
    else (router.replace as any)('/(child)/home');
  };

  const send = () => {
    if (fired.current || sosActive) return;
    fired.current = true;
    sentAt.current = Date.now();
    triggerSOS();
    setSent(true);
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility('SOS sent. Your family has been alerted.');
  };

  const safe = () => {
    if (Date.now() - sentAt.current < SETTLE_MS) return;
    clearSOS();
    close();
  };

  // The SOS screen is a modal; the chat takes its place rather than opening on top of it.
  const openMessages = () => (router.replace as any)('/messages');

  return (
    <View style={[styles.root, { backgroundColor: showSent ? SAFE_GRADIENT[1] : DANGER_GRADIENT[2] }]}>
      <StatusBar style="light" />
      {showSent ? (
        <LinearGradient key="safe" colors={SAFE_GRADIENT} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient key="danger" colors={DANGER_GRADIENT} style={StyleSheet.absoluteFill} />
      )}

      <SafeAreaView style={styles.root}>
        <View style={styles.column} onLayout={onColumnLayout}>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={showSent ? 'Close and keep the SOS on' : 'Close'}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Feather name="x" size={24} color={WHITE} />
          </Pressable>

          {showSent ? (
            <SentPanel place={childSelf.place} onSafe={safe} onMessage={openMessages} />
          ) : (
            <HoldPanel compact={compact} onSend={send} onMessage={openMessages} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * The red screen. The SOS only goes out after the button has been held for HOLD_MS, and letting go
 * early cancels it. A timer decides when that is; the fill is only the picture of it.
 */
function HoldPanel({ compact, onSend, onMessage }: { compact: boolean; onSend: () => void; onMessage: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const progress = useSharedValue(0);

  const holdTimer = useRef<Timer | null>(null);
  const confirmTimer = useRef<Timer | null>(null);
  const forgetTimer = useRef<Timer | null>(null);
  /** True from press-in until that same press has delivered (or can no longer deliver) its onPress. */
  const pointerDown = useRef(false);
  const lastActivation = useRef(0);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (forgetTimer.current) clearTimeout(forgetTimer.current);
    },
    [],
  );

  const stopConfirm = () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
  };

  const startHold = () => {
    pointerDown.current = true;
    if (forgetTimer.current) clearTimeout(forgetTimer.current);
    forgetTimer.current = null;
    stopConfirm();
    if (holdTimer.current) clearTimeout(holdTimer.current);

    setPhase('holding');
    // The fill is the hold's progress bar, so it runs even when the system asks for less motion.
    progress.set(withTiming(1, { duration: HOLD_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      onSend();
    }, HOLD_MS);
  };

  const endHold = () => {
    // This press may still be followed by its own onPress. Forget it once that can no longer happen.
    if (forgetTimer.current) clearTimeout(forgetTimer.current);
    forgetTimer.current = setTimeout(() => {
      forgetTimer.current = null;
      pointerDown.current = false;
    }, 400);

    if (holdTimer.current == null) return; // held to the end: the SOS is already out
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    progress.set(withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }));
    setPhase('released');
  };

  /**
   * An activation with no press to hold: a screen reader's double tap, or a click made by assistive
   * software on the web. Two of them in a row stand in for the hold.
   */
  const activateWithoutHold = () => {
    const now = Date.now();
    if (now - lastActivation.current < 400) return; // one activation can arrive by two routes
    lastActivation.current = now;
    stopConfirm();

    if (phase === 'confirm') {
      onSend();
      return;
    }
    setPhase('confirm');
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(HINT.confirm);
    confirmTimer.current = setTimeout(() => {
      confirmTimer.current = null;
      setPhase('idle');
    }, CONFIRM_MS);
  };

  const onPress = () => {
    // A finger, mouse or key press was already handled as a hold by press-in and press-out.
    if (pointerDown.current) {
      pointerDown.current = false;
      return;
    }
    activateWithoutHold();
  };

  const outer = compact ? 172 : 204;
  const inner = outer - (compact ? 36 : 44);

  const fillStyle = useAnimatedStyle(() => ({ height: progress.get() * inner }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + progress.get() * 0.2,
    transform: [{ scale: 1 + progress.get() * 0.06 }],
  }));

  return (
    <>
      <View style={styles.body}>
        <Text variant="h1" color={WHITE} center>
          Emergency SOS
        </Text>
        <Text variant="body" color={WHITE} center style={styles.lead}>
          This alerts your family right away and shares your live location with them.
        </Text>

        <Pressable
          onPressIn={startHold}
          onPressOut={endHold}
          onPress={onPress}
          // Never fires (the hold completes first). Having it keeps a long touch on the web from
          // opening the browser's context menu, which would cancel the hold.
          onLongPress={noop}
          delayLongPress={HOLD_MS * 4}
          hitSlop={12}
          pressRetentionOffset={40}
          accessibilityRole="button"
          accessibilityLabel="Send SOS"
          accessibilityHint="Press and hold until the circle fills up. With a screen reader, activate it twice."
          accessibilityActions={[{ name: 'activate', label: 'Send SOS' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'activate') activateWithoutHold();
          }}
          style={[styles.hold, { width: outer, height: outer, marginVertical: compact ? spacing.lg : spacing.xxl }]}>
          <Animated.View style={[styles.halo, haloStyle]} />
          <View style={[styles.core, { width: inner, height: inner }]}>
            <HoldFace color={DANGER_INK} />
            {/* The fill grows up from the bottom and uncovers a white-on-red copy of the face. */}
            <Animated.View style={[styles.fill, fillStyle]}>
              <View style={[styles.fillFace, { width: inner, height: inner }]}>
                <HoldFace color={WHITE} />
              </View>
            </Animated.View>
          </View>
        </Pressable>

        <Text variant="smallStrong" color={WHITE} center accessibilityLiveRegion="polite" style={styles.hint}>
          {HINT[phase]}
        </Text>
      </View>

      <View style={styles.footer}>
        <ActionRow label="Message my family instead" onPress={onMessage} />
        <Text variant="small" color={WHITE} center>
          In danger right now? Call your local emergency number.
        </Text>
      </View>
    </>
  );
}

function HoldFace({ color }: { color: string }) {
  return (
    <>
      <Feather name="alert-circle" size={40} color={color} />
      <Text variant="h3" color={color} selectable={false} style={styles.faceLabel}>
        Hold to send
      </Text>
    </>
  );
}

/** The green screen, shown once the SOS is out. */
function SentPanel({ place, onSafe, onMessage }: { place: string; onSafe: () => void; onMessage: () => void }) {
  const pop = useSharedValue(0);

  useEffect(() => {
    pop.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [pop]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: pop.get(),
    transform: [{ scale: 0.85 + pop.get() * 0.15 }],
  }));

  return (
    <>
      <View style={styles.body} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Animated.View style={[styles.sentIcon, popStyle]}>
          <Feather name="check" size={52} color={WHITE} />
        </Animated.View>
        <Text variant="h1" color={WHITE} center style={styles.sentTitle}>
          SOS sent
        </Text>
        <Text variant="body" color={WHITE} center style={styles.lead}>
          Your family has been alerted and can see your live location. Stay where you are if it's safe.
        </Text>
        <View style={styles.chip}>
          <Feather name="map-pin" size={13} color={WHITE} />
          <Text variant="smallStrong" color={WHITE}>
            Sharing your location near {place}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={onSafe}
          accessibilityRole="button"
          accessibilityLabel="I'm safe now"
          accessibilityHint="Turns the SOS off and closes this screen"
          style={({ pressed }) => [styles.safeBtn, pressed && styles.pressed]}>
          <Feather name="check" size={20} color={SAFE_INK} />
          <Text variant="bodyStrong" color={SAFE_INK}>
            I'm safe now
          </Text>
        </Pressable>
        <ActionRow label="Message my family" onPress={onMessage} />
        <Text variant="small" color={WHITE} center>
          Closing this screen keeps the SOS on until you say you're safe.
        </Text>
      </View>
    </>
  );
}

function ActionRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={styles.actionIcon}>
        <Feather name="message-circle" size={20} color={WHITE} />
      </View>
      <Text variant="title" color={WHITE} style={styles.flex}>
        {label}
      </Text>
      <Feather name="chevron-right" size={20} color={WHITE} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  // Keeps the layout phone-shaped in a wide browser window.
  column: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
  pressed: { opacity: 0.8 },

  close: { alignSelf: 'flex-end', padding: spacing.lg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  lead: { marginTop: spacing.sm, maxWidth: 310 },

  hold: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.pill, backgroundColor: WHITE },
  core: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: radius.pill, backgroundColor: WHITE },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: DANGER_FILL },
  fillFace: { position: 'absolute', left: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  faceLabel: { marginTop: 6 },
  hint: { minHeight: 18 },

  sentIcon: {
    width: 108,
    height: 108,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentTitle: { marginTop: spacing.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },

  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  safeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: WHITE,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
