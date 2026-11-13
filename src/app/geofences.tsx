import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { PlaceMap } from '@/components/PlaceMap';
import { IconButton, InlineConfirm } from '@/components/RuleForm';
import { Button, Card, Header, IconBadge, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { useStore } from '@/state/store';
import { categoryColors, radius, spacing, useTheme } from '@/theme';

/** "Mia is here now", "Mia and Leo are here now" */
function hereNow(names: string[]) {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is here now`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are here now`;
}

export default function Geofences() {
  const { colors } = useTheme();
  const { places, children, togglePlaceAlert, removePlace } = useStore();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const count = places.length;
  const mapLabel = count === 0 ? 'No places yet' : `${count} ${count === 1 ? 'place' : 'places'}`;
  const openAdd = () => (router.push as any)('/add-place');

  return (
    <Screen>
      <Header back title="Places & Geofences" subtitle="Get alerts on arrival and departure" />

      <View style={[styles.map, { borderColor: colors.border }]}>
        <PlaceMap height={180} label={mapLabel} markers={places.map((p) => ({ id: p.id, icon: p.icon }))} />
      </View>

      {count === 0 ? (
        <Card style={styles.empty}>
          <IconBadge name="map-marker-radius" family="mci" color={categoryColors.geofence} size={60} />
          <Text variant="h3" center style={{ marginTop: spacing.sm }}>
            No saved places
          </Text>
          <Text variant="body" tone="muted" center>
            Add home, school or practice to get a heads-up when your child arrives or leaves.
          </Text>
          <Button label="Add a place" icon="plus" onPress={openAdd} style={{ marginTop: spacing.md }} />
        </Card>
      ) : (
        <>
          <SectionLabel>Saved places</SectionLabel>
          <View style={styles.list}>
            {places.map((p) => {
              const here = hereNow(children.filter((c) => c.place === p.name).map((c) => c.name.split(' ')[0]));
              const confirming = confirmId === p.id;
              return (
                <Card key={p.id}>
                  <View style={styles.head}>
                    <IconBadge name={p.icon} family="mci" color={categoryColors.geofence} size={46} />
                    <View style={styles.flex}>
                      <Text variant="title" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text variant="small" tone="muted" numberOfLines={1}>
                        {p.radius} m radius
                      </Text>
                    </View>
                    {confirming ? null : <IconButton icon="trash-2" label={`Remove ${p.name}`} onPress={() => setConfirmId(p.id)} />}
                  </View>

                  {here ? (
                    <View style={[styles.here, { backgroundColor: colors.successSoft }]}>
                      <View style={[styles.hereDot, { backgroundColor: colors.success }]} />
                      <Text variant="tiny" color={colors.success}>
                        {here}
                      </Text>
                    </View>
                  ) : null}

                  <View style={[styles.alerts, { borderTopColor: colors.border }]}>
                    <View style={styles.alertRow}>
                      <Feather name="log-in" size={15} color={colors.textMuted} />
                      <Text variant="small" tone="muted" style={styles.flex}>
                        Alert on arrival
                      </Text>
                      <Toggle value={p.arrive} onChange={() => togglePlaceAlert(p.id, 'arrive')} />
                    </View>
                    <View style={styles.alertRow}>
                      <Feather name="log-out" size={15} color={colors.textMuted} />
                      <Text variant="small" tone="muted" style={styles.flex}>
                        Alert on departure
                      </Text>
                      <Toggle value={p.leave} onChange={() => togglePlaceAlert(p.id, 'leave')} />
                    </View>
                  </View>

                  {confirming ? (
                    <InlineConfirm
                      title={`Remove “${p.name}”?`}
                      detail="You’ll stop getting arrival and departure alerts for it."
                      onCancel={() => setConfirmId(null)}
                      onConfirm={() => {
                        removePlace(p.id);
                        setConfirmId(null);
                      }}
                    />
                  ) : null}
                </Card>
              );
            })}
          </View>

          <Button label="Add a place" icon="plus" variant="secondary" onPress={openAdd} />
        </>
      )}

      <View style={styles.note}>
        <Feather name="shield" size={14} color={colors.textFaint} style={styles.noteIcon} />
        <Text variant="small" tone="faint" style={styles.flex}>
          Location sharing is never hidden. Your child can always see that it is on under “What’s shared”.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  map: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing.xl },
  list: { gap: spacing.sm, marginBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  here: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  hereDot: { width: 6, height: 6, borderRadius: radius.pill },
  alerts: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  note: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  noteIcon: { marginTop: 2 },
});
