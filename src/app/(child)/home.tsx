import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinkCard } from '@/components/child/LinkCard';
import { Toast, useToast } from '@/components/child/Toast';
import { ProgressRing, Text } from '@/components/ui';
import { useLink } from '@/sync/link';
import { useStore, fmtDuration, nowLabel, timeOf, type ManagedApp } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';
import { OfflineBanner } from '@/components/OfflineBanner';

type FeatherName = keyof typeof Feather.glyphMap;

const PARENTS_NAME = 'Mom & Dad';
/** How long the Check in tile stays green after a check-in. */
const CHECKED_IN_MS = 4000;

// Gradients that carry white text. The coral is a step deeper than the raw accent so labels stay readable.
const HERO_ACTIVE = ['#F2603D', '#E8457A'] as const;
const HERO_PAUSED = ['#3B3663', '#2A2748'] as const;
const SOS_BANNER = ['#E3263A', '#B91C1C'] as const;
const SOS_INK = '#B91C1C';

export default function ChildHome() {
  const { colors } = useTheme();
  // Only this child's own SOS shows here: in a family with two children the other one's is not theirs to clear.
  const { childSelf, tasks, messages, checkIn, sosMine: sosActive, clearSOS, live } = useStore();
  const linkStatus = useLink().status;
  const toast = useToast();

  const firstName = childSelf.name.split(' ')[0];
  const paused = childSelf.bedtime;
  const left = Math.max(0, childSelf.limitMin - childSelf.usedMin);
  const progress = childSelf.limitMin > 0 ? Math.min(1, childSelf.usedMin / childSelf.limitMin) : 1;
  // Time used is only known in the sample data: a real family's phone is not measured by this version.
  const outOfTime = !live && !paused && left === 0;
  const apps = childSelf.apps.filter((a) => !a.blocked).slice(0, 8);
  const blockedCount = childSelf.apps.length - childSelf.apps.filter((a) => !a.blocked).length;
  const openTasks = tasks.filter((t) => !t.done).length;
  const thread = messages.filter((m) => m.childId === childSelf.id);
  const lastMessage = thread.length > 0 ? thread[thread.length - 1] : null;

  // ----- Check in: the tile turns green for a few seconds and a toast spells out what was shared -----
  const [checkedIn, setCheckedIn] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    },
    [],
  );

  const onCheckIn = () => {
    if (checkedIn) return;
    checkIn();
    setCheckedIn(true);
    // In a real family the phone does not know where it is, so the toast names no place.
    toast.show({ title: live ? 'Checked in' : `Checked in at ${childSelf.place}`, detail: `Your family can see it · ${nowLabel()}` });
    checkTimer.current = setTimeout(() => {
      checkTimer.current = null;
      setCheckedIn(false);
    }, CHECKED_IN_MS);
  };

  const onSafe = () => {
    clearSOS();
    toast.show({ title: 'SOS turned off', detail: "Glad you're safe." });
  };

  const askForTime = () => (router.push as any)('/(child)/requests');

  const appsHeading = live ? 'App rules your family set' : paused ? 'Paused for now' : outOfTime ? 'Waiting for more time' : 'You can use now';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView edges={['top']} style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.top}>
            <View style={styles.flex}>
              <Text variant="small" tone="muted">
                {paused ? 'Taking a break' : 'Hi there'}
              </Text>
              <Text variant="display" numberOfLines={1}>
                {firstName} 👋
              </Text>
            </View>
            {paused && (
              <View style={[styles.pausedPill, { backgroundColor: colors.primarySoft }]}>
                <Feather name="pause" size={13} color={colors.primary} />
                <Text variant="smallStrong" color={colors.primary}>
                  Paused
                </Text>
              </View>
            )}
          </View>
          <OfflineBanner style={{ marginBottom: spacing.lg }} />

          {/* SOS in progress */}
          {sosActive && (
            <LinearGradient colors={SOS_BANNER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sos}>
              <View style={styles.sosRow} accessible accessibilityRole="alert">
                <View style={styles.sosIcon}>
                  <Feather name="alert-circle" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.flex}>
                  <Text variant="title" color="#FFFFFF">
                    SOS sent: your family has been alerted
                  </Text>
                  <Text variant="small" color="rgba(255,255,255,0.92)" style={styles.sosDetail}>
                    {live ? 'They see it when Haven is open on their phone. If you are in danger, call them or the emergency number.' : "They can see your live location until you say you're safe."}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onSafe}
                accessibilityRole="button"
                accessibilityLabel="I'm safe now"
                style={({ pressed }) => [styles.sosBtn, pressed && styles.pressed]}>
                <Feather name="check" size={18} color={SOS_INK} />
                <Text variant="bodyStrong" color={SOS_INK}>
                  I'm safe now
                </Text>
              </Pressable>
            </LinearGradient>
          )}

          {/* Time today, or the paused state */}
          {paused ? (
            <LinearGradient colors={HERO_PAUSED} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.moon}>
                <Feather name="moon" size={30} color="#FFFFFF" />
              </View>
              <Text variant="h2" color="#FFFFFF" center style={styles.heroTitle}>
                {live ? 'Time for a screen break' : 'Your device is paused'}
              </Text>
              <Text variant="small" color="rgba(255,255,255,0.85)" center style={styles.heroBody}>
                {live
                  ? 'Your family asked for a break from screens for now. You can still check in, message your family or send an SOS.'
                  : 'Apps are resting for now. You can still check in, message your family or send an SOS.'}
              </Text>
              <View style={styles.heroChip}>
                <Feather name="clock" size={13} color="#FFFFFF" />
                <Text variant="smallStrong" color="#FFFFFF">
                  {live ? `Your limit is ${fmtDuration(childSelf.limitMin)} a day` : left > 0 ? `${fmtDuration(left)} left for later` : 'No time left today'}
                </Text>
              </View>
              <HeroButton label="Ask for more time" onPress={askForTime} />
            </LinearGradient>
          ) : (
            <LinearGradient colors={HERO_ACTIVE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View
                style={styles.ring}
                accessible
                accessibilityRole="text"
                accessibilityLabel={live ? `Your limit is ${fmtDuration(childSelf.limitMin)} a day` : `${fmtDuration(left)} left today`}>
                <ProgressRing progress={live ? 1 : progress} size={150} stroke={14} color="#FFFFFF" track="rgba(255,255,255,0.28)" />
                <View style={styles.ringCenter}>
                  <Text variant="h1" color="#FFFFFF">
                    {fmtDuration(live ? childSelf.limitMin : left)}
                  </Text>
                  <Text variant="smallStrong" color="#FFFFFF">
                    {live ? 'a day' : 'left today'}
                  </Text>
                </View>
              </View>
              {/* In a real family the phone's use is not measured by this version, so there is no
                  "used" and no "left" to show: only the limit the family agreed. */}
              <Text variant="smallStrong" color="#FFFFFF" center style={styles.heroUsed}>
                {live
                  ? 'The screen time your family agreed for each day'
                  : outOfTime
                    ? "You've used all your time for today"
                    : `You've used ${fmtDuration(childSelf.usedMin)} of ${fmtDuration(childSelf.limitMin)} today`}
              </Text>
              {(outOfTime || live) && <HeroButton label="Ask for more time" onPress={askForTime} />}
            </LinearGradient>
          )}

          {/* Quick actions */}
          <View style={styles.actions}>
            <QuickAction icon="plus-circle" label="Ask for time" color={colors.primary} onPress={askForTime} />
            <QuickAction
              icon={checkedIn ? 'check' : 'map-pin'}
              label={checkedIn ? 'Checked in' : 'Check in'}
              hint={checkedIn ? undefined : live ? 'Tells your family you checked in, with the time. Not where you are' : 'Tells your family where you are'}
              color={checkedIn ? colors.success : colors.info}
              confirmed={checkedIn}
              onPress={onCheckIn}
            />
            <QuickAction icon="alert-circle" label="SOS" color={colors.danger} onPress={() => (router.push as any)('/sos')} />
          </View>

          {/* Not linked yet: this device is still showing sample data */}
          {linkStatus === 'signed-out' || linkStatus === 'removed' ? (
            <LinkCard onPress={() => (router.push as any)('/link-device')} label="Link this device to your family" style={styles.gapLg}>
              <View style={[styles.family, { backgroundColor: colors.success }]}>
                <Feather name="link" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="title">Link to your family</Text>
                <Text variant="small" tone="muted">
                  Enter the code from your parent's phone
                </Text>
              </View>
            </LinkCard>
          ) : null}

          {/* Family chat */}
          <LinkCard
            onPress={() => (router.push as any)('/messages')}
            label={lastMessage ? `Message family. Last message: ${lastMessage.text}` : 'Message family'}
            style={styles.gapLg}>
            <View style={[styles.family, { backgroundColor: colors.primary }]}>
              <Feather name="users" size={20} color={colors.onPrimary} />
            </View>
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <Text variant="title" numberOfLines={1} style={styles.flex}>
                  Message family
                </Text>
                {lastMessage && (
                  <Text variant="tiny" tone="faint">
                    {timeOf(lastMessage)}
                  </Text>
                )}
              </View>
              <Text variant="small" tone="muted" numberOfLines={1}>
                {lastMessage
                  ? `${lastMessage.from === 'child' ? 'You' : PARENTS_NAME}: ${lastMessage.text}`
                  : `Say hi to ${PARENTS_NAME}`}
              </Text>
            </View>
          </LinkCard>

          {/* Tasks nudge */}
          {openTasks > 0 && (
            <LinkCard
              onPress={() => (router.push as any)('/(child)/rewards')}
              label={`${openTasks} ${openTasks === 1 ? 'task' : 'tasks'} to earn points`}
              style={styles.gapMd}>
              <View style={[styles.tile, { backgroundColor: colors.warningSoft }]}>
                <Feather name="check-square" size={20} color={colors.warning} />
              </View>
              <View style={styles.flex}>
                <Text variant="title">
                  {openTasks} {openTasks === 1 ? 'task' : 'tasks'} to earn points
                </Text>
                <Text variant="small" tone="muted">
                  Finish them to unlock rewards
                </Text>
              </View>
            </LinkCard>
          )}

          {/* Apps */}
          <Text variant="h3" style={styles.sectionTitle}>
            {appsHeading}
          </Text>
          <View style={[styles.appCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow(1)]}>
            {live && (
              <View style={[styles.appNote, { backgroundColor: colors.surfaceAlt }]}>
                <Feather name="info" size={14} color={colors.textMuted} />
                <Text variant="small" tone="muted" style={styles.flex}>
                  These are example apps. This version of Haven does not look at which apps are on this phone, and it does not close them.
                </Text>
              </View>
            )}
            {(paused || outOfTime) && !live && (
              <View style={[styles.appNote, { backgroundColor: colors.surfaceAlt }]}>
                <Feather name={paused ? 'moon' : 'clock'} size={14} color={colors.textMuted} />
                <Text variant="small" tone="muted" style={styles.flex}>
                  {paused
                    ? 'These open again when your family resumes your device.'
                    : 'These open again when your family adds more time.'}
                </Text>
              </View>
            )}
            <View style={styles.appGrid}>
              {apps.map((a) => (
                <AppTile key={a.id} app={a} state={paused ? 'paused' : outOfTime ? 'spent' : 'open'} live={live} />
              ))}
            </View>
            {apps.length === 0 && (
              <Text variant="small" tone="faint" center>
                No apps are open right now
              </Text>
            )}
          </View>

          {blockedCount > 0 && (
            <Pressable
              onPress={() => (router.push as any)('/unlock-request')}
              accessibilityRole="button"
              accessibilityLabel={`${blockedCount} ${blockedCount === 1 ? 'app is' : 'apps are'} blocked. Ask to unlock`}
              style={({ pressed }) => [styles.blocked, pressed && styles.pressed]}>
              <Feather name="lock" size={14} color={colors.textMuted} />
              <Text variant="small" tone="muted" style={styles.flex}>
                {blockedCount} {blockedCount === 1 ? 'app is' : 'apps are'} blocked
              </Text>
              <Text variant="smallStrong" tone="primary">
                Ask to unlock
              </Text>
              <Feather name="chevron-right" size={16} color={colors.primary} />
            </Pressable>
          )}

          {/* Transparency */}
          <LinkCard
            onPress={() => (router.push as any)('/transparency')}
            label="See exactly what Haven shares with your family"
            style={styles.gapLg}>
            <Feather name="eye" size={18} color={colors.success} />
            <Text variant="small" tone="muted" style={styles.flex}>
              See exactly what Haven shares with your family
            </Text>
          </LinkCard>
        </ScrollView>
      </SafeAreaView>
      <Toast message={toast.message} />
    </View>
  );
}

function QuickAction({
  icon,
  label,
  hint,
  color,
  confirmed = false,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  hint?: string;
  color: string;
  /** Draws the tile in its "done" look. Presses still reach `onPress`, which decides what to do. */
  confirmed?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.qa,
        shadow(1),
        {
          backgroundColor: confirmed ? colors.successSoft : colors.surface,
          borderColor: confirmed ? colors.success : colors.border,
          borderWidth: confirmed ? 1 : StyleSheet.hairlineWidth,
        },
        pressed && !confirmed && styles.qaPressed,
      ]}>
      <View style={[styles.qaIcon, { backgroundColor: confirmed ? color : color + '1F' }]}>
        <Feather name={icon} size={22} color={confirmed ? colors.surface : color} />
      </View>
      <Text variant="smallStrong" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A translucent pill button for the gradient hero. */
function HeroButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.heroBtn, pressed && styles.pressed]}>
      <Feather name="plus-circle" size={16} color="#FFFFFF" />
      <Text variant="smallStrong" color="#FFFFFF">
        {label}
      </Text>
    </Pressable>
  );
}

function AppTile({ app, state, live }: { app: ManagedApp; state: 'open' | 'paused' | 'spent'; live: boolean }) {
  const { colors } = useTheme();
  // In a real family only the agreed limit is known, not the time used.
  const appLeft = app.limitMin == null ? null : live ? app.limitMin : Math.max(0, app.limitMin - app.usedMin);
  const resting = state !== 'open' || appLeft === 0;
  const caption =
    state === 'paused' ? 'Paused' : state === 'spent' || appLeft === 0 ? "Time's up" : appLeft == null ? 'Anytime' : live ? `${fmtDuration(appLeft)} a day` : `${fmtDuration(appLeft)} left`;

  return (
    <View style={styles.appItem} accessible accessibilityRole="text" accessibilityLabel={`${app.name}, ${caption}`}>
      <View style={styles.appIconWrap}>
        <View style={[styles.appIcon, { backgroundColor: app.color + '22' }, resting && styles.appResting]}>
          <MaterialCommunityIcons name={app.icon as never} size={26} color={app.color} />
        </View>
        {state === 'paused' && (
          <View style={[styles.appLock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="lock" size={10} color={colors.textMuted} />
          </View>
        )}
      </View>
      <Text variant="tiny" tone={resting ? 'muted' : 'default'} numberOfLines={1} style={styles.appName}>
        {app.name}
      </Text>
      <Text variant="tiny" tone={resting ? 'faint' : 'muted'} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  pressed: { opacity: 0.8 },
  gapMd: { marginTop: spacing.md },
  gapLg: { marginTop: spacing.lg },

  top: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  pausedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    marginBottom: 6,
  },

  sos: { borderRadius: radius.card, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.lg, ...shadow(2) },
  sosRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sosIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosDetail: { marginTop: 2 },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
  },

  hero: { alignItems: 'center', padding: spacing.xl, borderRadius: radius.card, ...shadow(2) },
  ring: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  heroUsed: { marginTop: spacing.md },
  moon: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { marginTop: spacing.md },
  heroBody: { marginTop: 4, maxWidth: 290 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  qa: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: spacing.lg, paddingHorizontal: spacing.xs, borderRadius: radius.lg },
  qaPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  qaIcon: { width: 46, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },

  family: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tile: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  appCard: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
  },
  appNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  appItem: { width: '25%', alignItems: 'center', paddingHorizontal: 2 },
  appIconWrap: { width: 56, height: 56 },
  appIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  appResting: { opacity: 0.45 },
  appLock: {
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
  appName: { marginTop: 6 },

  blocked: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
});
