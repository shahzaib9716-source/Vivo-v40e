import { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { InlineNote } from '@/components/InlineNote';
import { Button, Card, Header, IconBadge, Screen, SectionLabel, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import { SampleNote } from '@/components/SampleNote';

interface Routine {
  id: string;
  name: string;
  desc: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  allows: string;
}

const ROUTINES: Routine[] = [
  { id: 'homework', name: 'Homework focus', desc: 'Only school apps allowed', icon: 'edit-3', color: '#12B5A6', allows: 'SchoolHub, Canvas' },
  { id: 'sleep', name: 'Sleep', desc: 'Everything paused except calls', icon: 'moon', color: '#5B51E0', allows: 'Phone only' },
  { id: 'family', name: 'Family time', desc: 'Screens off at the table', icon: 'heart', color: '#FF7A59', allows: 'Nothing' },
  { id: 'outdoor', name: 'Outdoor play', desc: 'Camera and music only', icon: 'sun', color: '#F5A623', allows: 'Camera, BeatBox' },
];

export default function Routines() {
  const { colors } = useTheme();
  const [active, setActive] = useState<string | null>('homework');
  const [createNote, setCreateNote] = useState(false);
  const activeRoutine = ROUTINES.find((r) => r.id === active);

  return (
    <Screen>
      <Header back title="Routines & Focus" subtitle="One tap to change the rules" />
      <SampleNote about="demo" />

      <View
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
        <Feather name={activeRoutine ? activeRoutine.icon : 'circle'} size={16} color={activeRoutine ? activeRoutine.color : colors.textFaint} />
        <Text variant="small" tone="muted" style={{ flex: 1 }}>
          {activeRoutine ? `${activeRoutine.name} is on. Allowed: ${activeRoutine.allows}.` : 'No routine is on. Normal rules apply.'}
        </Text>
      </View>

      <SectionLabel>Focus modes</SectionLabel>
      <View style={{ gap: spacing.sm }}>
        {ROUTINES.map((r) => {
          const on = active === r.id;
          return (
            <Card key={r.id} style={on ? { borderColor: r.color, borderWidth: 1.5 } : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconBadge name={r.icon} color={r.color} size={48} soft={!on} />
                <View style={{ flex: 1 }}>
                  <Text variant="title">{r.name}</Text>
                  <Text variant="small" tone="muted">
                    {r.desc}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                    <Feather name="check" size={12} color={colors.textFaint} />
                    <Text variant="tiny" tone="faint">
                      Allows: {r.allows}
                    </Text>
                  </View>
                </View>
              </View>
              <Button
                label={on ? 'Active now' : 'Activate'}
                accessibilityLabel={on ? `${r.name} is active. Turn off` : `Activate ${r.name}`}
                size="sm"
                variant={on ? 'secondary' : 'primary'}
                icon={on ? 'check' : 'play'}
                style={{ marginTop: spacing.md }}
                onPress={() => setActive(on ? null : r.id)}
              />
            </Card>
          );
        })}
      </View>

      <Button label="Create a routine" icon="plus" variant="ghost" style={{ marginTop: spacing.lg }} onPress={() => setCreateNote(true)} />
      {createNote && (
        <InlineNote
          tone="neutral"
          title="Demo: custom routines aren't available"
          detail="This build has the four focus modes above. Nothing was created."
          style={{ marginTop: spacing.sm }}
        />
      )}

      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.lg }}>
        Demo: routines switch on this screen only and do not change a device.
      </Text>
    </Screen>
  );
}
