import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineNote } from '@/components/InlineNote';
import { Avatar, Card, IconBadge, MockMap, Row, SectionLabel, Text } from '@/components/ui';
import { nowLabel, updatedAgoOf, useNow, useStore } from '@/state/store';
import { categoryColors, radius, spacing, useTheme } from '@/theme';
import { SampleNote } from '@/components/SampleNote';

// Child chips are about 34pt tall; extend the press target to 44pt.
const CHIP_HIT_SLOP = { top: 5, bottom: 5 };
const LINK_HIT_SLOP = { top: 14, bottom: 14, left: 12, right: 12 };

/** The last demo action, kept with the child it was for so it never shows under another child. */
interface DemoAction {
  kind: 'directions' | 'ping';
  childId: string;
  time: string;
}

export default function Location() {
  const { colors } = useTheme();
  const { children, activeChild, activeChildId, setActiveChildId, places, live } = useStore();
  const [action, setAction] = useState<DemoAction | null>(null);
  const now = useNow();

  const firstName = activeChild.name.split(' ')[0];
  const shownAction = action?.childId === activeChildId ? action : null;
  const run = (kind: DemoAction['kind']) => setAction({ kind, childId: activeChildId, time: nowLabel() });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
            <Text variant="h1" accessibilityRole="header">
              Location
            </Text>
          </View>
          <SampleNote about="location" style={{ marginHorizontal: spacing.xl }} />

          {/* Child chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {children.map((c) => {
              const active = c.id === activeChildId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setActiveChildId(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${c.name.split(' ')[0]}'s location`}
                  accessibilityState={{ selected: active }}
                  hitSlop={CHIP_HIT_SLOP}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Avatar name={c.name} size={22} />
                  <Text variant="smallStrong" color={active ? colors.onPrimary : colors.textMuted}>
                    {c.name.split(' ')[0]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: spacing.xl }}>
            <View style={[styles.mapWrap, { borderColor: colors.border }]}>
              <MockMap height={260} pinColor={colors.primary} rounded={false} />
            </View>

            <Card style={{ marginTop: -28, marginHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={activeChild.name} size={46} />
              <View style={{ flex: 1 }}>
                {live ? (
                  // A real family: only what the phone really sent. A check-in carries a time, not a place.
                  <>
                    <Text variant="title">{activeChild.checkInAt != null ? `${firstName} checked in ${updatedAgoOf(activeChild, now)}` : `${firstName} has not checked in yet`}</Text>
                    <Text variant="small" tone="muted">
                      Time only: this version does not read where the phone is
                    </Text>
                  </>
                ) : (
                  <>
                    <Text variant="title">
                      {firstName} is at {activeChild.place}
                    </Text>
                    <Text variant="small" tone="muted">
                      Updated {updatedAgoOf(activeChild, now)}
                    </Text>
                  </>
                )}
              </View>
              {live ? null : (
                <View accessible accessibilityLabel={`Battery ${activeChild.battery} percent`} style={{ alignItems: 'center' }}>
                  <Feather name="battery" size={18} color={activeChild.battery < 30 ? colors.danger : colors.success} />
                  <Text variant="tiny" tone="muted">
                    {activeChild.battery}%
                  </Text>
                </View>
              )}
            </Card>
          </View>

          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <View style={styles.actions}>
              <ActionTile icon="navigation" label="Directions" color={categoryColors.location} onPress={() => run('directions')} />
              <ActionTile icon="bell" label="Ping device" color={colors.accent} onPress={() => run('ping')} />
              <ActionTile icon="clock" label="History" color={colors.info} onPress={() => (router.push as any)('/location-history')} />
            </View>
            {shownAction?.kind === 'ping' && (
              <InlineNote
                tone="success"
                title={`Ping sent to ${activeChild.deviceName}`}
                detail={`${shownAction.time} · Demo only, no real device was contacted.`}
                style={styles.note}
              />
            )}
            {shownAction?.kind === 'directions' && (
              <InlineNote
                icon="navigation"
                title={`Directions to ${activeChild.place}`}
                detail="Demo only. On a real device this opens your maps app; nothing was opened."
                style={styles.note}
              />
            )}
          </View>

          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <SectionLabel style={{ marginBottom: 0 }}>Places & geofences</SectionLabel>
              <Pressable
                onPress={() => (router.push as any)('/geofences')}
                accessibilityRole="link"
                accessibilityLabel="Manage places and geofences"
                hitSlop={LINK_HIT_SLOP}
                style={({ pressed }) => pressed && { opacity: 0.6 }}>
                <Text variant="smallStrong" color={colors.primary}>
                  Manage
                </Text>
              </Pressable>
            </View>
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {places.map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.radius}m · ${[p.arrive && 'arrive', p.leave && 'leave'].filter(Boolean).join(' & ') || 'no'} alerts`}
                  icon={p.icon}
                  iconFamily="mci"
                  iconColor={categoryColors.geofence}
                  onPress={() => (router.push as any)('/geofences')}
                />
              ))}
              {places.length === 0 && (
                <Row
                  title="No places yet"
                  subtitle="Add home, school and other places"
                  icon="map-pin"
                  iconColor={categoryColors.geofence}
                  onPress={() => (router.push as any)('/geofences')}
                />
              )}
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ActionTile({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionTile,
        { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}>
      <IconBadge name={icon} color={color} size={40} />
      <Text variant="smallStrong" style={{ marginTop: 6 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Vertical padding leaves room for the chips' extended press target inside the scroller.
  chips: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingTop: 5, paddingBottom: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  mapWrap: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  note: { marginTop: spacing.md },
});
