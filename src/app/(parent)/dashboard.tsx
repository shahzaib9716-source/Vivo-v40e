import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Card, IconBadge, ProgressRing, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { categoryColors, radius, shadow, spacing, useTheme } from '@/theme';

export default function Dashboard() {
  const { colors } = useTheme();
  const { children, activeChild, activeChildId, setActiveChildId, requests, alerts, pauseDevice, resumeDevice, grantBonus, resolveRequest } = useStore();
  const pending = requests.filter((r) => r.status === 'pending');
  const unread = alerts.filter((a) => a.unread).length;
  const left = Math.max(0, activeChild.limitMin - activeChild.usedMin);
  const used = Math.min(1, activeChild.usedMin / activeChild.limitMin);
  const blocked = activeChild.apps.filter((a) => a.blocked).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge }} showsVerticalScrollIndicator={false}>
          {/* Top bar */}
          <View style={styles.topbar}>
            <View>
              <Text variant="small" tone="muted">
                Good afternoon
              </Text>
              <Text variant="h1">Your family</Text>
            </View>
            <Pressable onPress={() => (router.push as any)('/notifications')} style={[styles.bell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="bell" size={20} color={colors.text} />
              {unread > 0 && <View style={[styles.dot, { backgroundColor: colors.danger }]} />}
            </Pressable>
          </View>

          {/* Child selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kids}>
            {children.map((c) => {
              const active = c.id === activeChildId;
              return (
                <Pressable key={c.id} onPress={() => setActiveChildId(c.id)} style={styles.kid}>
                  <View style={[styles.kidAvatar, active && { borderColor: colors.primary }]}>
                    <Avatar name={c.name} size={56} />
                    {c.online && <View style={[styles.online, { borderColor: colors.bg }]} />}
                  </View>
                  <Text variant="smallStrong" tone={active ? 'default' : 'muted'}>
                    {c.name.split(' ')[0]}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => (router.push as any)('/pairing')} style={styles.kid}>
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
                    {activeChild.name.split(' ')[0]}
                  </Text>
                  <View style={styles.heroMeta}>
                    <Feather name="smartphone" size={13} color="rgba(255,255,255,0.8)" />
                    <Text variant="small" color="rgba(255,255,255,0.85)">
                      {activeChild.deviceName}
                    </Text>
                  </View>
                  <View style={styles.chips}>
                    <HeroChip icon="battery" label={`${activeChild.battery}%`} />
                    <HeroChip icon="map-pin" label={activeChild.place} />
                    <HeroChip icon={activeChild.bedtime ? 'moon' : 'circle'} label={activeChild.bedtime ? 'Paused' : 'Active'} />
                  </View>
                </View>
                <ProgressRing
                  progress={used}
                  size={104}
                  stroke={11}
                  color="#FFFFFF"
                  track="rgba(255,255,255,0.25)"
                  label={fmtDuration(left)}
                  sublabel="left"
                  centerColor="#FFFFFF"
                />
              </View>
              <View style={styles.heroActions}>
                {activeChild.bedtime ? (
                  <HeroBtn icon="play" label="Resume" onPress={() => resumeDevice(activeChildId)} />
                ) : (
                  <HeroBtn icon="pause" label="Pause device" onPress={() => pauseDevice(activeChildId)} />
                )}
                <HeroBtn icon="plus-circle" label="Add 30 min" onPress={() => grantBonus(activeChildId, 30)} />
              </View>
            </LinearGradient>
          </View>

          {/* Stat row */}
          <View style={styles.statRow}>
            <MiniStat value={fmtDuration(activeChild.usedMin)} caption="Used today" color={colors.primary} icon="clock" />
            <MiniStat value={`${blocked}`} caption="Apps blocked" color={colors.accent} icon="slash" />
            <MiniStat value={`${pending.length}`} caption="Requests" color={colors.warning} icon="inbox" />
          </View>

          {/* Pending requests */}
          {pending.length > 0 && (
            <View style={styles.section}>
              <SectionTitle title="Needs your approval" actionLabel="All" onAction={() => (router.push as any)('/(child)/requests')} />
              {pending.slice(0, 2).map((r) => {
                const kid = children.find((c) => c.id === r.childId);
                return (
                  <Card key={r.id} style={{ marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      {kid && <Avatar name={kid.name} size={40} />}
                      <View style={{ flex: 1 }}>
                        <Text variant="title">{r.label}</Text>
                        <Text variant="small" tone="muted">
                          {kid?.name.split(' ')[0]} · {r.ago}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                      <Button label="Approve" size="sm" onPress={() => resolveRequest(r.id, true)} style={{ flex: 1 }} />
                      <Button label="Decline" size="sm" variant="secondary" onPress={() => resolveRequest(r.id, false)} style={{ flex: 1 }} />
                    </View>
                  </Card>
                );
              })}
            </View>
          )}

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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.8 }]}>
      <Feather name={icon} size={16} color="#FFFFFF" />
      <Text variant="smallStrong" color="#FFFFFF">
        {label}
      </Text>
    </Pressable>
  );
}

function MiniStat({ value, caption, color, icon }: { value: string; caption: string; color: string; icon: keyof typeof Feather.glyphMap }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.miniStat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Feather name={icon} size={16} color={color} />
      <Text variant="h3" style={{ marginTop: 4 }}>
        {value}
      </Text>
      <Text variant="tiny" tone="muted">
        {caption}
      </Text>
    </View>
  );
}

function QuickTile({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, { backgroundColor: colors.surface, borderColor: colors.border, ...shadow(1) }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}>
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
        <Pressable onPress={onAction} hitSlop={8}>
          <Text variant="smallStrong" color={colors.primary}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  bell: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  dot: { position: 'absolute', top: 11, right: 12, width: 9, height: 9, borderRadius: 999 },
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
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: { width: '48%', flexGrow: 1, padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
});
