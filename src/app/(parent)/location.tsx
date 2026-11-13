import { router } from 'expo-router';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Card, IconBadge, MockMap, Row, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { categoryColors, radius, spacing, useTheme } from '@/theme';

export default function Location() {
  const { colors } = useTheme();
  const { children, activeChild, activeChildId, setActiveChildId, places } = useStore();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.huge }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
            <Text variant="h1">Location</Text>
          </View>

          {/* Child chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {children.map((c) => {
              const active = c.id === activeChildId;
              return (
                <View key={c.id} onTouchEnd={() => setActiveChildId(c.id)} style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
                  <Avatar name={c.name} size={22} />
                  <Text variant="smallStrong" color={active ? '#FFFFFF' : colors.textMuted}>
                    {c.name.split(' ')[0]}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: spacing.xl }}>
            <View style={[styles.mapWrap, { borderColor: colors.border }]}>
              <MockMap height={260} pinColor={colors.primary} pinLabel={activeChild.place} rounded={false} />
            </View>

            <Card style={{ marginTop: -28, marginHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={activeChild.name} size={46} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{activeChild.name.split(' ')[0]} is at {activeChild.place}</Text>
                <Text variant="small" tone="muted">
                  Updated {activeChild.updatedAgo}
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Feather name="battery-charging" size={18} color={activeChild.battery < 30 ? colors.danger : colors.success} />
                <Text variant="tiny" tone="muted">
                  {activeChild.battery}%
                </Text>
              </View>
            </Card>
          </View>

          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <View style={styles.actions}>
              <ActionTile icon="navigation" label="Directions" color={categoryColors.location} />
              <ActionTile icon="bell" label="Ping device" color={colors.accent} />
              <ActionTile icon="clock" label="History" color={colors.info} onPress={() => (router.push as any)('/location-history')} />
            </View>
          </View>

          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <SectionLabel style={{ marginBottom: 0 }}>Places & geofences</SectionLabel>
              <Text variant="smallStrong" color={colors.primary} onPress={() => (router.push as any)('/geofences')}>
                Manage
              </Text>
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
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ActionTile({ icon, label, color, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <View onTouchEnd={onPress} style={[styles.actionTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <IconBadge name={icon} color={color} size={40} />
      <Text variant="smallStrong" style={{ marginTop: 6 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  mapWrap: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
});
