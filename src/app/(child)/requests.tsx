import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { LinkCard } from '@/components/child/LinkCard';
import { Toast, useToast } from '@/components/child/Toast';
import { Card, IconBadge, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore, fmtDuration, agoOf, useNow, type FamilyRequest } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

const QUICK = [15, 30, 60] as const;
/** How long a time tile shows "Sent". The tiles do not take another tap until it is over. */
const SENT_MS = 2600;
/** How long a new row in "Your requests" stays highlighted. */
const FRESH_MS = 4000;

type Status = FamilyRequest['status'];
type Colors = ReturnType<typeof useTheme>['colors'];

const STATUS: Record<Status, { label: string; note: string }> = {
  pending: { label: 'Waiting', note: 'Waiting for your family' },
  approved: { label: 'Approved', note: 'Your family said yes' },
  denied: { label: 'Not now', note: 'Your family said not now' },
};

function statusTint(colors: Colors, status: Status) {
  if (status === 'approved') return { dot: colors.success, soft: colors.successSoft };
  if (status === 'denied') return { dot: colors.danger, soft: colors.dangerSoft };
  return { dot: colors.warning, soft: colors.warningSoft };
}

export default function ChildRequests() {
  const { colors } = useTheme();
  const { childSelf, requests, requestExtraTime, live } = useStore();
  const toast = useToast();

  const mine = requests.filter((r) => r.childId === childSelf.id);
  const waiting = mine.filter((r) => r.status === 'pending').length;
  const blockedCount = childSelf.apps.filter((a) => a.blocked).length;
  const left = Math.max(0, childSelf.limitMin - childSelf.usedMin);

  // Anything that was not in the list when this screen first drew is new, and arrives highlighted.
  // That covers a time request sent here as well as an unlock request sent from /unlock-request.
  const [knownAtStart] = useState(() => new Set(mine.map((r) => r.id)));

  const [justSent, setJustSent] = useState<number | null>(null);
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A ref as well as the state, because two quick taps can land before the first one has re-rendered.
  const resting = useRef(false);

  useEffect(
    () => () => {
      if (sentTimer.current) clearTimeout(sentTimer.current);
    },
    [],
  );

  const askForTime = (minutes: number) => {
    if (resting.current || minutes <= 0) return;
    resting.current = true;
    requestExtraTime(minutes);
    setJustSent(minutes);
    toast.show({ title: `Asked for ${minutes} more minutes`, detail: 'Waiting for your family to answer' });
    sentTimer.current = setTimeout(() => {
      sentTimer.current = null;
      resting.current = false;
      setJustSent(null);
    }, SENT_MS);
  };

  const unlockDetail =
    blockedCount === 0
      ? 'Nothing is blocked right now'
      : `${blockedCount} blocked ${blockedCount === 1 ? 'app' : 'apps'} you can ask about`;

  return (
    <Screen footer={<Toast message={toast.message} />}>
      <View style={styles.header}>
        <Text variant="h1">Ask a parent</Text>
        <Text variant="body" tone="muted" style={styles.headerDetail}>
          {waiting === 0
            ? 'Send a quick request'
            : `${waiting} ${waiting === 1 ? 'request is' : 'requests are'} waiting for an answer`}
        </Text>
      </View>

      <SectionLabel>More screen time</SectionLabel>
      <View style={styles.tiles}>
        {QUICK.map((minutes) => (
          <TimeTile
            key={minutes}
            minutes={minutes}
            sent={justSent === minutes}
            resting={justSent != null}
            onPress={() => askForTime(minutes)}
          />
        ))}
      </View>
      <Text variant="small" tone="muted" style={styles.tilesNote}>
        {childSelf.bedtime
          ? 'Your device is paused right now.'
          : live
            ? `Your limit is ${fmtDuration(childSelf.limitMin)} a day.`
            : left > 0
              ? `You have ${fmtDuration(left)} left today.`
              : "You've used all your time for today."}{' '}
        Your family decides on every request.
      </Text>

      <SectionLabel>Unlock an app</SectionLabel>
      <LinkCard
        onPress={() => (router.push as any)('/unlock-request')}
        label={`Request to unlock an app. ${unlockDetail}`}
        style={styles.unlock}>
        <View style={[styles.unlockIcon, { backgroundColor: colors.accentSoft }]}>
          <Feather name="unlock" size={20} color={colors.accent} />
        </View>
        <View style={styles.flex}>
          <Text variant="title">Request to unlock an app</Text>
          <Text variant="small" tone="muted">
            {unlockDetail}
          </Text>
        </View>
      </LinkCard>

      <SectionLabel>Your requests</SectionLabel>
      <Card padded={false} style={styles.list}>
        {mine.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={22} color={colors.textFaint} />
            <Text variant="small" tone="muted" center>
              No requests yet. Anything you ask for shows up here.
            </Text>
          </View>
        ) : (
          mine.map((r, index) => <RequestRow key={r.id} request={r} isNew={!knownAtStart.has(r.id)} divider={index > 0} />)
        )}
      </Card>
    </Screen>
  );
}

function TimeTile({
  minutes,
  sent,
  resting,
  onPress,
}: {
  minutes: number;
  /** This tile's request has just gone out. */
  sent: boolean;
  /** Some tile's request has just gone out, so none of them take a tap for a moment. */
  resting: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={resting}
      accessibilityRole="button"
      accessibilityLabel={sent ? `Asked for ${minutes} more minutes` : `Ask for ${minutes} more minutes`}
      accessibilityState={{ disabled: resting }}
      style={({ pressed }) => [
        styles.tile,
        shadow(1),
        {
          backgroundColor: sent ? colors.successSoft : colors.surface,
          borderColor: sent ? colors.success : colors.border,
          borderWidth: sent ? 1 : StyleSheet.hairlineWidth,
        },
        resting && !sent && styles.tileResting,
        pressed && styles.tilePressed,
      ]}>
      <View style={[styles.circle, { backgroundColor: sent ? colors.success : colors.primarySoft }]}>
        {sent ? (
          <Feather name="check" size={24} color={colors.surface} />
        ) : (
          <Text variant="h3" color={colors.primary}>
            +{minutes}
          </Text>
        )}
      </View>
      <Text variant={sent ? 'smallStrong' : 'small'} tone={sent ? 'default' : 'muted'}>
        {sent ? 'Sent' : 'minutes'}
      </Text>
    </Pressable>
  );
}

function RequestRow({ request, isNew, divider }: { request: FamilyRequest; isNew: boolean; divider: boolean }) {
  const { colors } = useTheme();
  const tint = statusTint(colors, request.status);

  // A new row slides in and stays tinted for a few seconds so it is easy to spot.
  const [fresh, setFresh] = useState(isNew);
  const appear = useSharedValue(isNew ? 0 : 1);
  const asked = agoOf(request, useNow());

  useEffect(() => {
    if (!isNew) return;
    appear.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(() => setFresh(false), FRESH_MS);
    return () => clearTimeout(timer);
  }, [isNew, appear]);

  const appearStyle = useAnimatedStyle(() => ({
    opacity: appear.get(),
    transform: [{ translateY: (1 - appear.get()) * -8 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: withTiming(fresh ? 1 : 0, { duration: 400 }) }));

  const kind =
    request.kind === 'unlock_app'
      ? { icon: 'unlock', color: colors.accent }
      : request.kind === 'bedtime'
        ? { icon: 'moon', color: colors.info }
        : { icon: 'clock', color: colors.primary };

  return (
    <Animated.View
      accessible
      accessibilityLabel={`${request.label}, asked ${asked}. ${STATUS[request.status].note}`}
      style={[
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
        appearStyle,
      ]}>
      <Animated.View style={[styles.glow, { backgroundColor: colors.primarySoft }, glowStyle]} />
      <IconBadge name={kind.icon} color={kind.color} size={40} />
      <View style={styles.flex}>
        <Text variant="title" numberOfLines={1}>
          {request.label}
        </Text>
        <View style={styles.rowDetail}>
          <Text variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
            Asked {asked}
          </Text>
          {fresh && (
            <View style={[styles.newTag, { backgroundColor: colors.primary }]}>
              <Text variant="tiny" color={colors.onPrimary}>
                NEW
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: tint.soft }]}>
        <View style={[styles.badgeDot, { backgroundColor: tint.dot }]} />
        <Text variant="tiny">{STATUS[request.status].label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  header: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  headerDetail: { marginTop: 2 },

  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.lg, borderRadius: radius.card },
  tilePressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  tileResting: { opacity: 0.5 },
  circle: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tilesNote: { marginTop: spacing.md, marginBottom: spacing.xl, marginHorizontal: spacing.xs },

  unlock: { marginBottom: spacing.xl },
  unlockIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: spacing.lg },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  // Reaches a little into the card's side padding so the tint reads as a band, not a box.
  glow: { position: 'absolute', top: 4, bottom: 4, left: -spacing.sm, right: -spacing.sm, borderRadius: radius.md },
  rowDetail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 1 },
  newTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  badgeDot: { width: 6, height: 6, borderRadius: radius.pill },
});
