import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Header, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore, type AppCategory, type ManagedApp } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

/** How long the "Request sent" screen stays up before going back on its own. */
const RETURN_AFTER_MS = 1800;

const CATEGORY: Record<AppCategory, string> = {
  social: 'Social',
  games: 'Games',
  video: 'Video',
  education: 'Education',
  music: 'Music',
  web: 'Web',
  messaging: 'Messaging',
  creativity: 'Creativity',
};

export default function UnlockRequest() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { childSelf, requests, requestUnlock, live } = useStore();

  const [sentApp, setSentApp] = useState<ManagedApp | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs, because two quick taps can land before the first one has re-rendered the screen.
  const asked = useRef(false);
  const gone = useRef(false);

  useEffect(
    () => () => {
      if (returnTimer.current) clearTimeout(returnTimer.current);
    },
    [],
  );

  const blocked = childSelf.apps.filter((a) => a.blocked);
  // Newest first, as the store keeps them.
  const myUnlocks = requests.filter((r) => r.childId === childSelf.id && r.kind === 'unlock_app');
  const isRequested = (appId: string) => myUnlocks.some((r) => r.appId === appId && r.status === 'pending');
  const wasDeclined = (appId: string) => myUnlocks.find((r) => r.appId === appId)?.status === 'denied';

  const leave = () => {
    if (gone.current) return;
    gone.current = true;
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = null;
    if (router.canGoBack()) router.back();
    else (router.replace as any)('/(child)/requests');
  };

  const ask = (app: ManagedApp) => {
    if (asked.current || isRequested(app.id)) return;
    asked.current = true;
    requestUnlock(app.id);
    setSentApp(app);
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`Request sent. Your family was asked to unlock ${app.name}.`);
    returnTimer.current = setTimeout(() => {
      returnTimer.current = null;
      // Already on the way out (a back swipe, say): going back again would leave the child app.
      if (navigation.isFocused()) leave();
    }, RETURN_AFTER_MS);
  };

  if (sentApp) {
    return (
      <Screen scroll={false} contentStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <View style={styles.sent} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
          <SentBadge app={sentApp} />
          <Text variant="h1" center style={styles.sentTitle}>
            Request sent
          </Text>
          <Text variant="body" tone="muted" center style={styles.sentBody}>
            Your family was asked to unlock {sentApp.name}. Their answer will show up in Requests.
          </Text>
        </View>
        <Button label="Done" onPress={leave} full />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        back
        title="Unlock an app"
        subtitle={blocked.length > 0 ? 'Pick an app to ask your family about' : undefined}
      />

      {blocked.length === 0 ? (
        <Card style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.successSoft }]}>
            <Feather name="unlock" size={30} color={colors.success} />
          </View>
          <Text variant="h2" center>
            {live ? 'No apps listed here' : 'Nothing is blocked'}
          </Text>
          <Text variant="body" tone="muted" center style={styles.emptyBody}>
            {live ? 'For a managed Android restriction, message your parent and include the app name.' : 'All of your apps are open right now. If your family blocks one, you can ask about it here.'}
          </Text>
          <Button label="Got it" variant="secondary" onPress={leave} full style={styles.emptyButton} />
        </Card>
      ) : (
        <>
          <SectionLabel>{blocked.length === 1 ? '1 blocked app' : `${blocked.length} blocked apps`}</SectionLabel>
          <View style={styles.list}>
            {blocked.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                requested={isRequested(app.id)}
                declined={wasDeclined(app.id)}
                onPress={() => ask(app)}
              />
            ))}
          </View>
          <View style={styles.note}>
            <Feather name="info" size={14} color={colors.textMuted} />
            <Text variant="small" tone="muted" style={styles.flex}>
              Your family sees your request and decides. You’ll find their answer in Requests.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function AppRow({
  app,
  requested,
  declined,
  onPress,
}: {
  app: ManagedApp;
  /** A request for this app is still waiting, so the row cannot be tapped. */
  requested: boolean;
  /** The last request for this app was turned down. It can be asked for again. */
  declined: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  // Kept short: next to the icon and the pill there is room for about twenty characters at phone width.
  const detail = declined && !requested ? `${CATEGORY[app.category]} · Not now last time` : CATEGORY[app.category];

  return (
    <Pressable
      onPress={onPress}
      disabled={requested}
      accessibilityRole="button"
      accessibilityLabel={requested ? `${app.name}, ${detail}. Requested, waiting for your family` : `Ask to unlock ${app.name}, ${detail}`}
      accessibilityState={{ disabled: requested }}
      style={({ pressed }) => [
        styles.row,
        shadow(1),
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.rowPressed,
      ]}>
      <AppIcon app={app} dimmed={requested} />
      <View style={styles.flex}>
        <Text variant="title" numberOfLines={1}>
          {app.name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {requested ? (
        <View style={[styles.pill, { backgroundColor: colors.surfaceAlt }]}>
          <Feather name="clock" size={13} color={colors.textMuted} />
          <Text variant="smallStrong" tone="muted">
            Requested
          </Text>
        </View>
      ) : (
        <View style={[styles.pill, { backgroundColor: colors.primary }]}>
          <Feather name="send" size={13} color={colors.onPrimary} />
          <Text variant="smallStrong" color={colors.onPrimary}>
            Ask
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** The app's own icon with a small padlock on its corner. */
function AppIcon({ app, dimmed }: { app: ManagedApp; dimmed: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.icon, { backgroundColor: app.color + '22' }, dimmed && styles.dimmed]}>
        <MaterialCommunityIcons name={app.icon as never} size={26} color={app.color} />
      </View>
      <View style={[styles.lock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="lock" size={10} color={colors.textMuted} />
      </View>
    </View>
  );
}

function SentBadge({ app }: { app: ManagedApp }) {
  const { colors } = useTheme();
  const pop = useSharedValue(0);

  useEffect(() => {
    pop.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [pop]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: pop.get(),
    transform: [{ scale: 0.85 + pop.get() * 0.15 }],
  }));

  return (
    <Animated.View style={[styles.sentBadge, popStyle]}>
      <View style={[styles.sentIcon, { backgroundColor: app.color + '22' }]}>
        <MaterialCommunityIcons name={app.icon as never} size={44} color={app.color} />
      </View>
      <View style={[styles.sentCheck, { backgroundColor: colors.success, borderColor: colors.bg }]}>
        <Feather name="check" size={18} color={colors.bg} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  iconWrap: { width: 52, height: 52 },
  icon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
  lock: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg, marginHorizontal: spacing.xs },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, marginTop: spacing.sm },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyBody: { marginTop: spacing.sm, maxWidth: 300 },
  emptyButton: { marginTop: spacing.xl },

  sent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sentBadge: { width: 96, height: 96 },
  sentIcon: { width: 96, height: 96, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  sentCheck: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentTitle: { marginTop: spacing.xl },
  sentBody: { marginTop: spacing.sm, maxWidth: 300 },
});

