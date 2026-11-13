import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Button, Card, Header, IconBadge, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

interface Sched {
  id: string;
  name: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  time: string;
  days: string;
  on: boolean;
}

const INITIAL: Sched[] = [
  { id: 'bed', name: 'Bedtime', icon: 'moon', color: '#5B51E0', time: '9:00 PM – 7:00 AM', days: 'Every day', on: true },
  { id: 'school', name: 'School hours', icon: 'book', color: '#2E8BFF', time: '8:30 AM – 3:00 PM', days: 'Mon – Fri', on: true },
  { id: 'dinner', name: 'Dinner & downtime', icon: 'coffee', color: '#FF7A59', time: '6:00 PM – 7:00 PM', days: 'Every day', on: false },
  { id: 'homework', name: 'Homework focus', icon: 'edit-3', color: '#12B5A6', time: '4:00 PM – 5:30 PM', days: 'Mon – Fri', on: true },
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Schedules() {
  const { colors } = useTheme();
  const [items, setItems] = useState(INITIAL);
  const toggle = (id: string) => setItems((p) => p.map((s) => (s.id === id ? { ...s, on: !s.on } : s)));

  return (
    <Screen>
      <Header back title="Schedules & Bedtime" subtitle="When the device winds down" />

      <SectionLabel>Active schedules</SectionLabel>
      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        {items.map((s) => (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge name={s.icon} color={s.color} size={46} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{s.name}</Text>
                <Text variant="small" tone="muted">
                  {s.time}
                </Text>
              </View>
              <Toggle value={s.on} onChange={() => toggle(s.id)} />
            </View>
            <View style={styles.days}>
              {DAYS.map((d, i) => {
                const active = s.days === 'Every day' || (s.days === 'Mon – Fri' && i < 5);
                return (
                  <View key={i} style={[styles.day, { backgroundColor: active && s.on ? s.color : colors.surfaceSunken }]}>
                    <Text variant="tiny" color={active && s.on ? '#FFFFFF' : colors.textFaint}>
                      {d}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        ))}
      </View>

      <Button label="Add a schedule" icon="plus" variant="secondary" onPress={() => {}} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  day: { flex: 1, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
