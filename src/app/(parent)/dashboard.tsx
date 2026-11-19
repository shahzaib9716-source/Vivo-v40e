import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Card, IconBadge, ProgressRing, Text } from '@/components/ui';
import { useStore, alertText, fmtDuration, agoOf, requestTitle, timeOf, updatedAgoOf, useNow } from '@/state/store';
import { useLink } from '@/sync/link';
import { categoryColors, radius, shadow, spacing, useTheme } from '@/theme';
import { OfflineBanner } from '@/components/OfflineBanner';

/** How many requests show before "Show all". */
const REQUEST_PREVIEW = 2;

/** Deeper reds than the theme's danger colour, so white text on the banner stays readable. */
const SOS_GRADIENT = ['#E5383B', '#B91C1C'] as const;
const SOS_INK = '#B91C1C';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { colors } = useTheme();
  const {
    children,
    activeChild,
    activeChildId,
    setActiveChildId,
    sosChild,
    live,
    requests,
    alerts,
    messages,
    pauseDevice,
    resumeDevice,
    grantBonus,
    resolveRequest,
    sosActive,
    clearSOS,
  } = useStore();
  const link = useLink();
  const [showAllRequests, setShowAllRequests] = useState(false);
  // A build with a server, on a device that is not in a family yet: everything below is sample data.
  const needsSetup = link.configured && link.role === null && link.status !== 'connecting';

  const pending = requests.filter((r) => r.status === 'pending');
  const visibleRequests = showAllRequests ? pending : pending.slice(0, REQUEST_PREVIEW);
  const unread = alerts.filter((a) => a.unread).length;
  const left = Math.max(0, activeChild.limitMin - activeChild.usedMin);
  const used = Math.min(1, activeChild.usedMin / activeChild.limitMin);
  const blocked = activeChild.apps.filter((a) => a.blocked).length;
  const firstName = activeChild.name.split(' ')[0];

  const thread = messages.filter((m) => m.childId === activeChildId);
  const lastMessage = thread.length > 0 ? thread[thread.length - 1] : null;

  // The store knows which child raised the SOS. Alerts are newest first.
  const now = useNow();
  const sosName = sosChild.name.split(' ')[0];
  const sosAlert = alerts.find((a) => (a.kind === 'sos' || /^sos\b/i.test(a.title)) && (a.childId == null || a.childId === sosChild.id));
  // A real family's phone has not said where it is, so no place is named for it.
  const sosDetail = (sosAlert ? alertText(sosAlert, children, live).body : null) ?? (live ? 'Raised just now' : `Live location shared · near ${sosChild.place}`);

  // In a real family there is no location to show (this version does not read it): the useful
  // next step is to reach the child.
  const viewSosLocation = () => {
    setActiveChildId(sosChild.id);
    if (live) (router.push as any)(`/messages?childId=${sosChild.id}`);
    else (router.push as any)('/(parent)/location');
  };

  // After a request is resolved its card leaves and the next one slides into the same spot, so a
  // quick second tap would land on a different request. Ignore presses for half a second.
  const lastResolve = useRef(0);
  const requestsScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const requestsY = useRef(0);
  const resolve = useCallback((id: string, approve: boolean) => {
    const now = Date.now();
    if (now - lastResolve.current < 500) return;
    lastResolve.current = now;
    resolveRequest(id, approve);
  }, [resolveRequest]);

  const [hello, setHello] = useState(greeting);
  useFocusEffect(
    useCallback(() => {
      setHello(greeting());
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView ref={requestsScrollRef} contentContainerStyle={{ paddingBottom: spacing.huge }} showsVerticalScrollIndicator={false}>
          {/* Top bar */}
          <View style={styles.topbar}>
            <View>
              <Text variant="small" tone="muted">
                {hello}
              </Text>
              <Text variant="h1">Your family</Text>
            </View>
            <Pressable
              onPress={() => (router.push as any)('/notifications')}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              style={({ pressed }) => [styles.bell, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <Feather name="bell" size={20} color={colors.text} />
              {unread > 0 && <View style={[styles.dot, { backgroundColor: colors.danger }]} />}
            </Pressable>
          </View>

          {/* SOS */}
          {sosActive && (
            <Animated.View entering={FadeInDown.duration(220)} accessibilityRole="alert" style={styles.sosWrap}>
              <LinearGradient colors={SOS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sos}>
                <View style={styles.sosHead}>
                  <View style={styles.sosIcon}>
                    <Feather name="alert-circle" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="h3" color="#FFFFFF">
                      SOS from {sosName}
                    </Text>
                    <Text variant="small" color="rgba(255,255,255,0.92)">
                      {sosDetail}
                    </Text>
                  </View>
                </View>
                <View style={styles.sosActions}>
                  <Pressable
                    onPress={viewSosLocation}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.sosBtn, styles.sosBtnSolid, pressed && styles.pressed]}>
                    <Feather name={live ? 'message-circle' : 'map-pin'} size={16} color={SOS_INK} />
                    <Text variant="smallStrong" color={SOS_INK}>
                      {live ? `Message ${sosName}` : 'View location'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={clearSOS}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.sosBtn, styles.sosBtnGhost, pressed && styles.pressed]}>
                    <Feather name="check" size={16} color="#FFFFFF" />
                    <Text variant="smallStrong" color="#FFFFFF">
                      Mark as safe
                    </Text>
                  </Pressable>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          <OfflineBanner style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }} />

          {/* Not in a family yet: say so, and offer the real setup. */}
          {needsSetup && (
            <View style={styles.setupWrap}>
              <Card onPress={() => (router.push as any)('/account')} style={styles.setup}>
                <IconBadge name="user-plus" color={colors.primary} size={44} />
                <View style={styles.flex}>
                  <Text variant="title">{link.status === 'needs-family' ? 'Create your family' : 'Set up your family'}</Text>
                  <Text variant="small" tone="muted">
                    You are looking at sample data. {link.status === 'needs-family' ? 'Finish setting up to see your own family here.' : 'Sign in or create your parent account to start.'}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textFaint} />
              </Card>
            </View>
          )}

          {/* Child selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kids}>
            {children.map((c) => {
              const active = c.id === activeChildId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setActiveChildId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={c.name}
                  style={({ pressed }) => [styles.kid, pressed && styles.pressed]}>
                  <View style={[styles.kidAvatar, active && { borderColor: colors.primary }]}>
                    <Avatar name={c.name} size={56} />
                    {/* "Online" is only known in the sample data: nothing reports it in a real family. */}
                    {c.online && !live && <View style={[styles.online, { borderColor: colors.bg }]} />}
                  </View>
                  <Text variant="smallStrong" tone={active ? 'default' : 'muted'}>
                    {c.name.split(' ')[0]}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => (router.push as any)('/pairing')}
              accessibilityRole="button"
              accessibilityLabel="Add a child"
              style={({ pressed }) => [styles.kid, pressed && styles.pressed]}>
              <View style={[styles.addKid, { borderColor: colors.border }]}>
                <Feather name="plus" size={22} color={colors.textMuted} />
              </View>
              <Text variant="smallStrong" tone="muted">
                Add
              </Text>
            </Pressable>
          </ScrollView>

          {/* Hero card */}
          <View style={{ paddingHorizontal: spacing.xl }}>
            <LinearGradient colors={activeChild.bedtime ? ['#3B3663', '#2A2748'] : ['#5B51E0', '#7A4FE0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="h2" color="#FFFFFF">
                    {firstName}
                  </Text>
                  <View style={styles.heroMeta}>
                    <Feather name="smartphone" size={13} color="rgba(255,255,255,0.8)" />
                    <Text variant="small" color="rgba(255,255,255,0.85)">
                      {activeChild.deviceName || (live ? 'No phone linked yet' : '')}
                    </Text>
                  </View>
                  {live ? (
                    // A real family: only what the phones really report. Battery, place and time
                    // used are not read by this version, so they are not shown as if they were.
                    <View style={styles.chips}>
                      <HeroChip icon="check-circle" label={activeChild.checkInAt != null ? `Checked in ${updatedAgoOf(activeChild, now)}` : 'No check-in yet'} />
                      <HeroChip icon={activeChild.bedtime ? 'moon' : 'circle'} label={activeChild.bedtime ? (live ? 'Break requested' : 'Paused') : 'Active'} />
                    </View>
                  ) : (
                    <View style={styles.chips}>
                      <HeroChip icon="battery" label={`${activeChild.battery}%`} />
                      <HeroChip icon="map-pin" label={activeChild.place} />
                      <HeroChip icon={activeChild.bedtime ? 'moon' : 'circle'} label={activeChild.bedtime ? (live ? 'Break requested' : 'Paused') : 'Active'} />
                    </View>
                  )}
                </View>
                <ProgressRing
                  progress={live ? 1 : used}
                  size={104}
                  stroke={11}
                  color="#FFFFFF"
                  track="rgba(255,255,255,0.25)"
                  label={fmtDuration(live ? activeChild.limitMin : left)}
                  sublabel={live ? 'a day' : 'left'}
                  centerColor="#FFFFFF"
                />
              </View>
              <View style={styles.heroActions}>
                {activeChild.bedtime ? (
                  <HeroBtn icon="play" label="Resume" onPress={() => resumeDevice(activeChildId)} />
                ) : (
                  <HeroBtn icon="pause" label={live ? 'Request screen break' : 'Pause device'} onPress={() => pauseDevice(activeChildId)} />
                )}
                <HeroBtn icon="plus-circle" label={live ? 'Limit +30 min' : 'Add 30 min'} onPress={() => grantBonus(activeChildId, 30)} />
              </View>
            </LinearGradient>
          </View>

          {/* Stat row */}
          <View style={styles.statRow}>
            {live ? (
              <MiniStat value={fmtDuration(activeChild.limitMin)} caption="Daily limit" color={colors.primary} icon="clock" onPress={() => router.push("/screen-time")} />
            ) : (
              <MiniStat value={fmtDuration(activeChild.usedMin)} caption="Used today" color={colors.primary} icon="clock" onPress={() => router.push("/screen-time")} />
            )}
            <MiniStat value={`${blocked}`} caption={live ? "App rules" : "Apps blocked"} color={colors.accent} icon="slash" onPress={() => router.push("/app-limits")} />
            <MiniStat value={`${pending.length}`} caption="Requests" color={colors.warning} icon="inbox" onPress={() => requestsScrollRef.current?.scrollTo({ y: requestsY.current, animated: true })} />
          </View>

          {/* Messages shortcut */}
          <View style={styles.messages}>
            <Card
              onPress={() => (router.push as any)(`/messages?childId=${activeChildId}`)}
              style={styles.messageCard}>
              <IconBadge name="message-circle" color={colors.primary} size={44} />
              <View style={styles.flex}>
                <Text variant="title" numberOfLines={1}>
                  Messages with {firstName}
                </Text>
                <Text variant="small" tone="muted" numberOfLines={1}>
                  {lastMessage ? `${lastMessage.from === 'parent' ? 'You' : firstName}: ${lastMessage.text}` : `Say hello to ${firstName}`}
                </Text>
              </View>
              {lastMessage && (
                <Text variant="tiny" tone="faint">
                  {timeOf(lastMessage)}
                </Text>
              )}
              <Feather name="chevron-right" size={20} color={colors.textFaint} />
            </Card>
          </View>

          {/* Pending requests */}
          <View style={styles.section} onLayout={(event) => { requestsY.current = event.nativeEvent.layout.y; }}>
            <SectionTitle
              title="Needs your approval"
              actionLabel={pending.length > REQUEST_PREVIEW ? (showAllRequests ? 'Show less' : `Show all ${pending.length}`) : undefined}
              onAction={() => setShowAllRequests((all) => !all)}
            />
            {live && pending.some((r) => r.kind === 'extra_time') ? (
              <Text variant="small" tone="muted" style={{ marginBottom: spacing.sm }}>
                Approving extra time raises the daily limit by that much, until you lower it again.
              </Text>
            ) : null}
            {pending.length === 0 ? (
              <View style={[styles.caughtUp, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.caughtUpIcon, { backgroundColor: colors.successSoft }]}>
                  <Feather name="check" size={18} color={colors.success} />
                </View>
                <View style={styles.flex}>
                  <Text variant="smallStrong">All caught up</Text>
                  <Text variant="small" tone="muted">
                    New requests from your children show up here.
                  </Text>
                </View>
              </View>
            ) : (
              visibleRequests.map((r) => {
                const kid = children.find((c) => c.id === r.childId);
                return (
                  <Card key={r.id} style={{ marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      {kid && <Avatar name={kid.name} size={40} />}
                      <View style={{ flex: 1 }}>
                        <Text variant="title">{requestTitle(r, kid)}</Text>
                        <Text variant="small" tone="muted">
                          {kid?.name.split(' ')[0]} · {agoOf(r, now)}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                      <Button label="Approve" size="sm" onPress={() => resolve(r.id, true)} style={{ flex: 1 }} />
                      <Button label="Decline" size="sm" variant="secondary" onPress={() => resolve(r.id, false)} style={{ flex: 1 }} />
                    </View>
                  </Card>
                );
              })
            )}
          </View>

          {/* Quick controls */}
          <View style={styles.section}>
            <SectionTitle title="Quick controls" actionLabel="All" onAction={() => (router.push as any)('/(parent)/controls')} />
            <View style={styles.grid}>
              <QuickTile icon="clock" label="Screen Time" color={categoryColors.screenTime} onPress={() => (router.push as any)('/screen-time')} />
              <QuickTile icon="grid" label="App Limits" color={categoryColors.apps} onPress={() => (router.push as any)('/app-limits')} />
              <QuickTile icon="globe" label="Web Filter" color={categoryColors.web} onPress={() => (router.push as any)('/web-filter')} />
              <QuickTile icon="map-pin" label="Location" color={categoryColors.location} onPress={() => (router.push as any)('/(parent)/location')} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function HeroChip({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={styles.heroChip}>
      <Feather name={icon} size={12} color="#FFFFFF" />
      <Text variant="tiny" color="#FFFFFF">
        {label}
      </Text>
    </View>
  );
}

function HeroBtn({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.8 }]}>
      <Feather name={icon} size={16} color="#FFFFFF" />
      <Text variant="smallStrong" color="#FFFFFF">
        {label}
      </Text>
    </Pressable>
  );
}

function MiniStat({ value, caption, color, icon, onPress }: { value: string; caption: string; color: string; icon: keyof typeof Feather.glyphMap; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${caption}: ${value}`} style={({ pressed }) => [styles.miniStat, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
      <Feather name={icon} size={16} color={color} />
      <Text variant="h3" style={{ marginTop: 4 }}>
        {value}
      </Text>
      <Text variant="tiny" tone="muted">
        {caption}
      </Text>
    </Pressable>
  );
}

function QuickTile({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.quick, { backgroundColor: colors.surface, borderColor: colors.border, ...shadow(1) }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}>
      <IconBadge name={icon} color={color} size={44} />
      <Text variant="smallStrong" style={{ marginTop: spacing.sm }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text variant="h3">{title}</Text>
      {actionLabel && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
          <Text variant="smallStrong" color={colors.primary}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  bell: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  dot: { position: 'absolute', top: 11, right: 12, width: 9, height: 9, borderRadius: 999 },
  sosWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  sos: { borderRadius: radius.card, padding: spacing.lg, gap: spacing.md, ...shadow(2) },
  sosHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sosIcon: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  sosActions: { flexDirection: 'row', gap: spacing.sm },
  sosBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.md },
  sosBtnSolid: { backgroundColor: '#FFFFFF' },
  sosBtnGhost: { backgroundColor: 'rgba(255,255,255,0.2)' },
  setupWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  setup: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kids: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.lg },
  kid: { alignItems: 'center', gap: 6 },
  kidAvatar: { padding: 2, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  online: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 999, backgroundColor: '#16B981', borderWidth: 2 },
  addKid: { width: 56, height: 56, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.card, padding: spacing.xl, ...shadow(2) },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  heroBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 12, borderRadius: radius.md },
  statRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  miniStat: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: 1 },
  messages: { paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  messageCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  caughtUp: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  caughtUpIcon: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: { width: '48%', flexGrow: 1, padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
});

