import { View, StyleSheet } from 'react-native';

import { Button, Card, Header, IconBadge, MockMap, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { useStore } from '@/state/store';
import { categoryColors, spacing, useTheme } from '@/theme';

export default function Geofences() {
  const { colors } = useTheme();
  const { places, togglePlaceAlert } = useStore();

  return (
    <Screen>
      <Header back title="Places & Geofences" subtitle="Get alerts on arrival and departure" />

      <View style={{ borderRadius: 18, overflow: 'hidden', marginBottom: spacing.xl }}>
        <MockMap height={180} pinColor={categoryColors.geofence} pinLabel="3 places" rounded={false} />
      </View>

      <SectionLabel>Saved places</SectionLabel>
      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        {places.map((p) => (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
              <IconBadge name={p.icon} family="mci" color={categoryColors.geofence} size={46} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{p.name}</Text>
                <Text variant="small" tone="muted">
                  Radius {p.radius}m
                </Text>
              </View>
            </View>
            <View style={styles.alertRow}>
              <Text variant="small" tone="muted">
                Alert on arrival
              </Text>
              <Toggle value={p.arrive} onChange={() => togglePlaceAlert(p.id, 'arrive')} />
            </View>
            <View style={styles.alertRow}>
              <Text variant="small" tone="muted">
                Alert on departure
              </Text>
              <Toggle value={p.leave} onChange={() => togglePlaceAlert(p.id, 'leave')} />
            </View>
          </Card>
        ))}
      </View>

      <Button label="Add a place" icon="plus" variant="secondary" onPress={() => {}} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  alertRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
});
