import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, Logo, Text } from '@/components/ui';
import { APP_NAME } from '@/config/variant';
import { useStore } from '@/state/store';
import { categoryColors, radius, shadow, spacing, useTheme } from '@/theme';

/**
 * First-run introduction: four swipeable slides in Haven's voice, shown before the side of the
 * app is chosen, so they speak to the parent who is setting it up.
 * Every illustration is original, composed from Views, SVG shapes, gradients and icons.
 */

type Colors = ReturnType<typeof useTheme>['colors'];
type FeatherName = keyof typeof Feather.glyphMap;
type SlideKey = 'balance' | 'safety' | 'transparency' | 'setup';

interface SlideDef {
  key: SlideKey;
  eyebrow: string;
  icon: FeatherName;
  title: string;
  body: string;
}

const SLIDES: SlideDef[] = [
  {
    key: 'balance',
    eyebrow: 'Screen time',
    icon: 'clock',
    title: 'Balance screen time, together',
    body: 'Agree on daily limits, bedtimes and focus hours as a family, and adjust them in a tap when life happens.',
  },
  {
    key: 'safety',
    eyebrow: 'Check-ins & SOS',
    icon: 'map-pin',
    title: "Know they're safe",
    body: 'Your child can check in with one tap, message you, and reach you with SOS the moment they need help.',
  },
  {
    key: 'transparency',
    eyebrow: 'Transparency',
    icon: 'eye',
    title: 'Built on transparency',
    body: "Nothing runs in secret: your child can always see exactly what Haven shares and what's limited.",
  },
  {
    key: 'setup',
    eyebrow: 'Pairing',
    icon: 'link',
    title: 'Set up in a minute',
    body: "Link your child's phone with a one-time code that you approve on your own phone, then agree together on what Haven will share.",
  },
];

const LAST = SLIDES.length - 1;

/** Content column never grows past this, so the flow stays phone-shaped on a wide web window. */
const MAX_W = 520;
const MAX_H = 900;

/** Illustrations are drawn on a fixed logical canvas and scaled to fit the space. */
const STAGE_W = 320;
const STAGE_H = 300;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.25;

function accentFor(key: SlideKey, colors: Colors): string {
  switch (key) {
    case 'balance':
      return colors.primary;
    case 'safety':
      return colors.info;
    case 'transparency':
      return colors.success;
    case 'setup':
      return colors.accent;
  }
}

export default function Onboarding() {
  const { colors, mode } = useTheme();
  const { completeOnboarding } = useStore();
  const win = useWindowDimensions();

  // Web starts from a fixed width so server and client render the same markup; onLayout then corrects it.
  const [pageW, setPageW] = useState(() => (Platform.OS === 'web' || win.width <= 0 ? 390 : Math.min(win.width, MAX_W)));
  const [pagerH, setPagerH] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const finished = useRef(false);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  /** Scroll position in pages: 0 on the first slide, 3 on the last. */
  const progress = useSharedValue(0);
  const appear = useSharedValue(0);

  useEffect(() => {
    appear.set(withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
  }, [appear]);

  const onIndex = useCallback((next: number) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const w = e.layoutMeasurement.width;
      if (w > 0) progress.set(e.contentOffset.x / w);
    },
  });

  useAnimatedReaction(
    () => Math.min(LAST, Math.max(0, Math.round(progress.get()))),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(onIndex, current);
    },
  );

  // Keep the current slide aligned if the page width changes (rotation, web resize).
  useEffect(() => {
    if (indexRef.current > 0) {
      scrollRef.current?.scrollTo({ x: indexRef.current * pageW, y: 0, animated: false });
    }
  }, [pageW, scrollRef]);

  // Android hardware back steps to the previous slide before leaving the app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (indexRef.current <= 0) return false;
      scrollRef.current?.scrollTo({ x: (indexRef.current - 1) * pageW, y: 0, animated: true });
      return true;
    });
    return () => sub.remove();
  }, [pageW, scrollRef]);

  const onColumnLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== pageW) setPageW(w);
  };

  const onPagerLayout = (e: LayoutChangeEvent) => {
    const h = Math.floor(e.nativeEvent.layout.height);
    if (h > 0 && h !== pagerH) setPagerH(h);
  };

  const goTo = (i: number) => {
    const target = Math.min(LAST, Math.max(0, i));
    scrollRef.current?.scrollTo({ x: target * pageW, y: 0, animated: true });
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    completeOnboarding();
    (router.replace as any)('/');
  };

  const isLast = index >= LAST;

  const enterStyle = useAnimatedStyle(() => ({
    opacity: appear.get(),
    transform: [{ translateY: (1 - appear.get()) * 12 }],
  }));

  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [LAST - 0.6, LAST - 0.1], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Soft accent wash that cross-fades from slide to slide */}
      <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
        {SLIDES.map((s, i) => (
          <Wash key={s.key} index={i} progress={progress} color={accentFor(s.key, colors)} dark={mode === 'dark'} />
        ))}
      </View>

      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <Animated.View style={[styles.column, enterStyle]} onLayout={onColumnLayout}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <Logo size={30} color={colors.primary} />
              <Text variant="h3">{APP_NAME}</Text>
            </View>
            <Animated.View style={skipStyle}>
              <Pressable
                onPress={finish}
                disabled={isLast}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Skip introduction"
                style={({ pressed }) => [styles.skip, pressed && { opacity: 0.55 }]}>
                <Text variant="bodyStrong" tone="muted">
                  Skip
                </Text>
              </Pressable>
            </Animated.View>
          </View>

          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            bounces={false}
            overScrollMode="never"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onLayout={onPagerLayout}
            style={styles.pager}>
            {SLIDES.map((s, i) => (
              // Explicit page size: each page fills the pager on native and web alike.
              <View key={s.key} style={[styles.page, { width: pageW, height: pagerH > 0 ? pagerH : undefined }]}>
                <Slide slide={s} index={i} progress={progress} pageW={pageW} />
              </View>
            ))}
          </Animated.ScrollView>

          <View style={styles.footer}>
            <View style={styles.dots}>
              {SLIDES.map((s, i) => (
                <Dot
                  key={s.key}
                  index={i}
                  progress={progress}
                  active={colors.primary}
                  inactive={colors.textFaint + '66'}
                  selected={i === index}
                  onPress={() => goTo(i)}
                />
              ))}
            </View>
            <Button
              label={isLast ? 'Get started' : 'Next'}
              iconRight="arrow-right"
              size="lg"
              full
              onPress={isLast ? finish : () => goTo(index + 1)}
              style={{ ...shadow(2), shadowColor: colors.primary, shadowOpacity: 0.28 }}
            />
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome: background wash, page dots                                  */
/* ------------------------------------------------------------------ */

function Wash({ index, progress, color, dark }: { index: number; progress: SharedValue<number>; color: string; dark: boolean }) {
  const aStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, aStyle]}>
      <LinearGradient colors={[color + (dark ? '2E' : '24'), color + '00']} style={styles.wash} />
    </Animated.View>
  );
}

function Dot({
  index,
  progress,
  active,
  inactive,
  selected,
  onPress,
}: {
  index: number;
  progress: SharedValue<number>;
  active: string;
  inactive: string;
  selected: boolean;
  onPress: () => void;
}) {
  const aStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const range = [index - 1, index, index + 1];
    return {
      width: interpolate(p, range, [8, 26, 8], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(p, range, [inactive, active, inactive]),
    };
  });
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`Go to slide ${index + 1} of ${SLIDES.length}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <Animated.View style={[styles.dot, aStyle]} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Slide                                                               */
/* ------------------------------------------------------------------ */

interface ArtProps {
  index: number;
  progress: SharedValue<number>;
  accent: string;
}

function Slide({ slide, index, progress, pageW }: { slide: SlideDef; index: number; progress: SharedValue<number>; pageW: number }) {
  const { colors } = useTheme();
  const accent = accentFor(slide.key, colors);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  const fitW = ((box?.w ?? pageW) - spacing.xxxl) / STAGE_W;
  const fitH = box ? (box.h - spacing.xl) / STAGE_H : MAX_SCALE;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitW, fitH));

  const onArtLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.round(width);
    const h = Math.round(height);
    if (!box || box.w !== w || box.h !== h) setBox({ w, h });
  };

  const artStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.get() - index);
    return {
      opacity: interpolate(d, [0, 0.9], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.94], Extrapolation.CLAMP) }],
    };
  });
  const headStyle = useAnimatedStyle(() => {
    const d = progress.get() - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.7], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: -d * 24 }],
    };
  });
  const bodyStyle = useAnimatedStyle(() => {
    const d = progress.get() - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: -d * 52 }],
    };
  });

  const art: ArtProps = { index, progress, accent };

  return (
    <View style={styles.slide}>
      <View style={styles.artArea} onLayout={onArtLayout}>
        <Animated.View style={artStyle}>
          <View style={{ width: STAGE_W * scale, height: STAGE_H * scale, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{ width: STAGE_W, height: STAGE_H, transform: [{ scale }] }}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Illustration: ${slide.title}`}>
              {slide.key === 'balance' && <BalanceArt {...art} />}
              {slide.key === 'safety' && <SafetyArt {...art} />}
              {slide.key === 'transparency' && <TransparencyArt {...art} />}
              {slide.key === 'setup' && <SetupArt {...art} />}
            </View>
          </View>
        </Animated.View>
      </View>

      <View style={styles.copy}>
        <Animated.View style={[styles.copyHead, headStyle]}>
          <View style={[styles.eyebrow, { backgroundColor: accent + '1F' }]}>
            <Feather name={slide.icon} size={12} color={accent} />
            <Text variant="tiny" style={styles.eyebrowText}>
              {slide.eyebrow}
            </Text>
          </View>
          <Text center style={styles.headline} accessibilityRole="header">
            {slide.title}
          </Text>
        </Animated.View>
        <Animated.View style={bodyStyle}>
          <Text variant="body" tone="muted" center style={styles.body}>
            {slide.body}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Illustration building blocks                                        */
/* ------------------------------------------------------------------ */

/** Moves its children a little further than the page while swiping, for a layered feel. */
function Drift({
  index,
  progress,
  depth,
  style,
  children,
}: {
  index: number;
  progress: SharedValue<number>;
  depth: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(-1, Math.min(1, index - progress.get())) * depth }],
  }));
  return <Animated.View style={[style, aStyle]}>{children}</Animated.View>;
}

/** Soft glow, a dotted orbit and a few sparkles behind every illustration. */
function Backdrop({ id, accent }: { id: string; accent: string }) {
  const glow = `ob-glow-${id}`;
  return (
    <Svg width={STAGE_W} height={STAGE_H} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={glow} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={accent} stopOpacity={0.28} />
          <Stop offset="0.65" stopColor={accent} stopOpacity={0.1} />
          <Stop offset="1" stopColor={accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={160} cy={150} r={148} fill={`url(#${glow})`} />
      <Circle cx={160} cy={150} r={132} stroke={accent} strokeOpacity={0.22} strokeWidth={1.2} strokeDasharray="1 9" strokeLinecap="round" fill="none" />
      <Circle cx={22} cy={128} r={3.5} fill={accent} opacity={0.45} />
      <Circle cx={300} cy={112} r={2.5} fill={accent} opacity={0.4} />
      <Circle cx={262} cy={286} r={3} fill={accent} opacity={0.3} />
      <Path d="M44 250 v10 M39 255 h10" stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.45} />
      <Path d="M236 14 v8 M232 18 h8" stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.4} />
    </Svg>
  );
}

/** Small floating card: tinted icon, a title and a caption. */
function FloatCard({ icon, tint, title, caption }: { icon: FeatherName; tint: string; title: string; caption: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.floatCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(2)]}>
      <View style={[styles.floatIcon, { backgroundColor: tint + '22' }]}>
        <Feather name={icon} size={15} color={tint} />
      </View>
      <View>
        <Text variant="smallStrong">{title}</Text>
        <Text variant="tiny" tone="faint">
          {caption}
        </Text>
      </View>
    </View>
  );
}

/** Round initial bubble standing in for a family member. */
function Initial({ letter, color, size = 28 }: { letter: string; color: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text color="#FFFFFF" style={{ fontSize: Math.round(size * 0.42), fontWeight: '800' }}>
        {letter}
      </Text>
    </View>
  );
}

/** Clockwise arc starting at 12 o'clock, covering `fraction` of the circle. */
function arcPath(cx: number, cy: number, r: number, fraction: number) {
  const a = fraction * 2 * Math.PI;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `M${cx} ${cy - r} A${r} ${r} 0 ${fraction > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/* 1. Balance screen time together                                     */
/* ------------------------------------------------------------------ */

function BalanceArt({ index, progress, accent }: ArtProps) {
  const { colors } = useTheme();
  const drift = { index, progress };
  return (
    <>
      <Backdrop id="balance" accent={accent} />

      <Drift {...drift} depth={14} style={[styles.abs, { left: 64, top: 44 }]}>
        <View style={[styles.dial, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(3)]}>
          <Svg width={192} height={192} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id="ob-ring" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.accent} />
                <Stop offset="1" stopColor={colors.primary} />
              </SvgLinearGradient>
            </Defs>
            <Circle cx={96} cy={96} r={74} stroke={colors.surfaceSunken} strokeWidth={14} fill="none" />
            <Path d={arcPath(96, 96, 74, 0.68)} stroke="url(#ob-ring)" strokeWidth={14} strokeLinecap="round" fill="none" />
          </Svg>
          <Text variant="tiny" tone="faint" style={styles.upper}>
            Today
          </Text>
          <Text style={styles.dialValue}>1h 20m</Text>
          <Text variant="small" tone="muted">
            left of 3h
          </Text>
        </View>
      </Drift>

      <Drift {...drift} depth={40} style={[styles.abs, { left: 0, top: 20 }]}>
        <FloatCard icon="moon" tint={colors.primary} title="Bedtime" caption="9:00 PM" />
      </Drift>

      <Drift {...drift} depth={64} style={[styles.abs, { right: 0, top: 170 }]}>
        <FloatCard icon="check-circle" tint={colors.success} title="+15 min" caption="Approved" />
      </Drift>

      <Drift {...drift} depth={26} style={[styles.abs, styles.centerRow, { bottom: 2 }]}>
        <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(2)]}>
          <View style={styles.row}>
            <Initial letter="A" color={colors.primary} />
            <View style={{ marginLeft: -9 }}>
              <Initial letter="M" color={colors.accent} />
            </View>
          </View>
          <Text variant="smallStrong">Agreed together</Text>
        </View>
      </Drift>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Know they are safe                                               */
/* ------------------------------------------------------------------ */

function SafetyArt({ index, progress, accent }: ArtProps) {
  const { colors, mode } = useTheme();
  const drift = { index, progress };
  const road = mode === 'dark' ? colors.border : colors.surface;
  return (
    <>
      <Backdrop id="safety" accent={accent} />

      <Drift {...drift} depth={14} style={[styles.abs, { left: 24, top: 38 }]}>
        <View style={[styles.mapShadow, { backgroundColor: colors.surfaceAlt }, shadow(3)]}>
          <View style={[styles.map, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Svg width={272} height={204} viewBox="0 0 272 204">
              {/* water, a park, a few streets: an abstract neighbourhood, not real map data */}
              <Path d="M0 156 Q 62 130 124 160 T 272 142 V204 H0 Z" fill={colors.infoSoft} />
              <Rect x={168} y={-8} width={88} height={80} rx={16} fill={colors.successSoft} />
              <Path d="M0 92 H272" stroke={road} strokeWidth={10} />
              <Path d="M96 0 V204" stroke={road} strokeWidth={9} />
              <Path d="M146 0 L206 204" stroke={road} strokeWidth={6} />
              {/* saved place with its alert radius */}
              <Circle cx={206} cy={52} r={37} fill={accent} fillOpacity={0.14} stroke={accent} strokeWidth={1.5} strokeDasharray="5 5" />
              {/* the walk from home */}
              <Path d="M62 126 C 86 100, 120 110, 146 90 S 184 74, 194 62" stroke={accent} strokeWidth={3.2} strokeLinecap="round" strokeDasharray="0.5 8" fill="none" />
            </Svg>
            <View style={[styles.homeMarker, { left: 44, top: 110, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="home-variant" size={17} color={colors.primary} />
            </View>
            <View style={[styles.childPin, { left: 188, top: 34, backgroundColor: colors.accent, borderColor: colors.surface }]}>
              <Text color="#FFFFFF" style={styles.pinLetter}>
                M
              </Text>
            </View>
          </View>
        </View>
      </Drift>

      <Drift {...drift} depth={38} style={[styles.abs, { left: 4, top: 22 }]}>
        <View style={[styles.pill, styles.pillSmall, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(2)]}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text variant="tiny" tone="muted">
            Checked in 2m ago
          </Text>
        </View>
      </Drift>

      <Drift {...drift} depth={58} style={[styles.abs, { left: 38, top: 214 }]}>
        <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(3)]}>
          <View style={[styles.floatIcon, { backgroundColor: colors.successSoft }]}>
            <Feather name="check" size={16} color={colors.success} />
          </View>
          <View style={styles.flex}>
            <Text variant="smallStrong" numberOfLines={1}>
              Mia checked in
            </Text>
            <Text variant="tiny" tone="faint" numberOfLines={1}>
              Check-in · 8:42 AM
            </Text>
          </View>
          <MaterialCommunityIcons name="school" size={18} color={accent} />
        </View>
      </Drift>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Built on transparency                                            */
/* ------------------------------------------------------------------ */

function ShareRow({ icon, label, shared }: { icon: FeatherName; label: string; shared: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.shareRow, { borderTopColor: colors.hairline }]}>
      <View style={[styles.shareIcon, { backgroundColor: shared ? colors.primarySoft : colors.surfaceSunken }]}>
        <Feather name={icon} size={14} color={shared ? colors.primary : colors.textMuted} />
      </View>
      <Text variant="smallStrong" style={styles.flex} numberOfLines={1}>
        {label}
      </Text>
      {shared ? (
        <Feather name="check-circle" size={17} color={colors.success} />
      ) : (
        <View style={[styles.privateTag, { backgroundColor: colors.surfaceSunken }]}>
          <Feather name="lock" size={10} color={colors.textMuted} />
          <Text variant="tiny" tone="muted">
            Private
          </Text>
        </View>
      )}
    </View>
  );
}

function TransparencyArt({ index, progress, accent }: ArtProps) {
  const { colors } = useTheme();
  const drift = { index, progress };
  return (
    <>
      <Backdrop id="transparency" accent={accent} />

      {/* a second sheet behind, for depth */}
      <Drift {...drift} depth={8} style={[styles.abs, { left: 46, top: 40 }]}>
        <View style={[styles.shareBack, { backgroundColor: colors.surface, borderColor: colors.border }]} />
      </Drift>

      <Drift {...drift} depth={18} style={[styles.abs, { left: 36, top: 46 }]}>
        <View style={[styles.shareCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(3)]}>
          <View style={styles.shareHeader}>
            <View style={[styles.floatIcon, { backgroundColor: accent + '22' }]}>
              <Feather name="eye" size={15} color={accent} />
            </View>
            <View style={styles.flex}>
              <Text variant="smallStrong">What's shared</Text>
              <Text variant="tiny" tone="faint" numberOfLines={1}>
                Visible to you both
              </Text>
            </View>
          </View>
          <ShareRow icon="send" label="Requests" shared />
          <ShareRow icon="check-circle" label="Check-ins" shared />
          <ShareRow icon="message-circle" label="Other chats" shared={false} />
        </View>
      </Drift>

      <Drift {...drift} depth={40} style={[styles.abs, { right: 12, top: 20 }]}>
        <View style={[styles.shieldRing, { backgroundColor: colors.bg }]}>
          <LinearGradient colors={[accent, categoryColors.apps]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.shieldBadge}>
            <MaterialCommunityIcons name="shield-check" size={24} color="#FFFFFF" />
          </LinearGradient>
        </View>
      </Drift>

      <Drift {...drift} depth={58} style={[styles.abs, { right: 0, top: 236 }]}>
        <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(2)]}>
          <Initial letter="M" color={colors.accent} size={26} />
          <Text variant="smallStrong">Mia sees this too</Text>
        </View>
      </Drift>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Set up in a minute                                               */
/* ------------------------------------------------------------------ */

/** Hand-drawn decorative pattern for the pairing tile. It is not a scannable code. */
const PATTERN = ['1110111', '1010101', '1110111', '0101100', '1110101', '1010110', '1110011'];
const CELL = 8;
const GAP = 2;
const GRID_PX = PATTERN.length * CELL + (PATTERN.length - 1) * GAP;

const GRID_CELLS: { r: number; c: number }[] = [];
PATTERN.forEach((row, r) => {
  for (let c = 0; c < row.length; c++) {
    if (row[c] === '1') GRID_CELLS.push({ r, c });
  }
});

function SetupArt({ index, progress, accent }: ArtProps) {
  const { colors } = useTheme();
  const drift = { index, progress };
  return (
    <>
      <Backdrop id="setup" accent={accent} />

      {/* the link between the two devices */}
      <Drift {...drift} depth={32} style={StyleSheet.absoluteFill}>
        <Svg width={STAGE_W} height={STAGE_H}>
          <Path d="M92 62 C 98 14, 224 10, 231 90" stroke={accent} strokeWidth={2.6} strokeLinecap="round" strokeDasharray="1 8" fill="none" />
        </Svg>
      </Drift>

      {/* parent phone */}
      <Drift {...drift} depth={22} style={[styles.abs, { left: 30, top: 62 }]}>
        <View style={[styles.phone, styles.phoneParent, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(3)]}>
          <View style={[styles.notch, { backgroundColor: colors.surfaceSunken }]} />
          <Text variant="tiny" tone="faint" style={{ marginTop: 10 }}>
            Pair a device
          </Text>
          <View style={[styles.codeTile, { backgroundColor: colors.surfaceAlt }]}>
            <Svg width={GRID_PX} height={GRID_PX}>
              {GRID_CELLS.map(({ r, c }) => (
                <Rect key={`${r}-${c}`} x={c * (CELL + GAP)} y={r * (CELL + GAP)} width={CELL} height={CELL} rx={2} fill={colors.text} />
              ))}
            </Svg>
          </View>
          <View style={[styles.codePill, { backgroundColor: colors.primarySoft }]}>
            <Text color={colors.primary} style={styles.codeText}>
              4KQ-7PX
            </Text>
          </View>
          <View style={[styles.bar, { width: 60, marginTop: 12, backgroundColor: colors.surfaceSunken }]} />
        </View>
      </Drift>

      {/* child phone */}
      <Drift {...drift} depth={44} style={[styles.abs, { left: 176, top: 90 }]}>
        <View style={[styles.phone, styles.phoneChild, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(3)]}>
          <View style={[styles.notch, { backgroundColor: colors.surfaceSunken }]} />
          <View style={[styles.linkedCircle, { backgroundColor: colors.successSoft }]}>
            <Feather name="check" size={28} color={colors.success} />
          </View>
          <Text variant="smallStrong" style={{ marginTop: 10 }}>
            Linked
          </Text>
          <Text variant="tiny" tone="faint">
            Mia's Tablet
          </Text>
          <View style={[styles.bar, { width: 52, marginTop: 12, backgroundColor: colors.surfaceSunken }]} />
        </View>
      </Drift>

      <Drift {...drift} depth={32} style={[styles.abs, { left: 138, top: 4 }]}>
        <View style={[styles.linkRing, { backgroundColor: colors.bg }]}>
          <LinearGradient colors={[colors.primary, accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.linkBadge}>
            <Feather name="link" size={18} color="#FFFFFF" />
          </LinearGradient>
        </View>
      </Drift>

      <Drift {...drift} depth={60} style={[styles.abs, { right: 0, top: 246 }]}>
        <FloatCard icon="zap" tint={accent} title="About a minute" caption="Type the code, then approve" />
      </Drift>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noTouch: { pointerEvents: 'none' },
  safe: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_W, maxHeight: MAX_H },
  wash: { height: '64%' },

  topBar: {
    height: 56,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  skip: { minHeight: 40, paddingHorizontal: spacing.sm, justifyContent: 'center' },

  pager: { flex: 1 },
  // Clipped so drifting illustration layers never widen the scrollable area.
  page: { overflow: 'hidden' },
  slide: { flex: 1 },
  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { minHeight: 192, paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, alignItems: 'center' },
  copyHead: { alignItems: 'center' },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  eyebrowText: { textTransform: 'uppercase', letterSpacing: 0.8 },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: spacing.md, maxWidth: 340 },
  body: { lineHeight: 22, marginTop: spacing.sm + 2, maxWidth: 340 },

  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.xl },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 8 },
  dot: { height: 8, borderRadius: 4 },

  // illustration pieces
  abs: { position: 'absolute' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  centerRow: { left: 0, right: 0, alignItems: 'center' },
  upper: { textTransform: 'uppercase', letterSpacing: 0.8 },

  floatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingLeft: 9,
    paddingRight: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  floatIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillSmall: { paddingVertical: 7, paddingLeft: 11, paddingRight: 12, gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },

  dial: {
    width: 192,
    height: 192,
    borderRadius: 96,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialValue: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },

  mapShadow: { width: 272, height: 204, borderRadius: 28 },
  map: { width: 272, height: 204, borderRadius: 28, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  homeMarker: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childPin: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinLetter: { fontSize: 14, fontWeight: '800' },
  notice: {
    width: 244,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    paddingRight: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },

  shareBack: {
    width: 240,
    height: 196,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.6,
    transform: [{ rotate: '-6deg' }],
  },
  shareCard: { width: 248, borderRadius: 24, padding: 14, paddingBottom: 6, borderWidth: StyleSheet.hairlineWidth },
  shareHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  shareRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  shareIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  privateTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  shieldRing: { width: 50, height: 50, borderRadius: 17, padding: 3, transform: [{ rotate: '8deg' }] },
  shieldBadge: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  phone: { borderWidth: 1.5, alignItems: 'center', paddingTop: 9 },
  phoneParent: { width: 124, height: 204, borderRadius: 26 },
  phoneChild: { width: 110, height: 178, borderRadius: 24 },
  notch: { width: 34, height: 5, borderRadius: 3 },
  codeTile: { marginTop: 8, padding: 9, borderRadius: 14 },
  codePill: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  codeText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  bar: { height: 6, borderRadius: 3 },
  linkedCircle: { width: 54, height: 54, borderRadius: 27, marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  linkRing: { width: 44, height: 44, borderRadius: 22, padding: 3 },
  linkBadge: { flex: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
