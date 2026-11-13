import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, Screen, SegmentedControl, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import { useState } from 'react';

interface Stop {
  place: string;
  icon: keyof typeof Feather.glyphMap;
  time: string;
  dur: string;
  color: string;
}

const STOPS: Stop[] = [
  { place: 'Home', icon: 'home', time: '7:10 AM', dur: 'Left at 8:05 AM', color: '#16B981' },
  { place: 'School', icon: 'book', time: '8:42 AM', dur: 'Arrived · still here', color: '#2E8BFF' },
  { place: 'On the way', icon: 'navigation', time: '8:05 AM', dur: '37 min commute', color: '#8B5CF6' },
];

export default function LocationHistory() {
  const { colors } = useTheme();
  const [range, setRange] = useState('Today');

  const ordered = [STOPS[0], STOPS[2], STOPS[1]];

  return (
    <Screen>
      <Header back title="Location History" />
      <View style={{ marginBottom: spacing.xl }}>
        <SegmentedControl options={['Today', 'Week', 'Month']} value={range} onChange={setRange} />
      </View>

      <Card>
        {ordered.map((s, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.node, { backgroundColor: s.color }]}>
                <Feather name={s.icon} size={14} color="#FFFFFF" />
              </View>
              {i < ordered.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
            </View>
            <View style={{ flex: 1, paddingBottom: i < ordered.length - 1 ? spacing.xl : 0 }}>
              <Text variant="title">{s.place}</Text>
              <Text variant="small" tone="muted">
                {s.dur}
              </Text>
              <Text variant="tiny" tone="faint" style={{ marginTop: 2 }}>
                {s.time}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.lg }}>
        Location history is kept for 30 days on Haven Premium.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 28 },
  node: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginVertical: 4 },
});
