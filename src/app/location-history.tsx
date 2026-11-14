import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, Screen, SectionLabel, SegmentedControl, Text } from '@/components/ui';
import { Child, useStore } from '@/state/store';
import { categoryColors, radius, spacing, useTheme } from '@/theme';
import { SampleNote } from '@/components/SampleNote';

const RANGES = ['Today', 'Week', 'Month'] as const;
type Range = (typeof RANGES)[number];

type Kind = 'home' | 'school' | 'trip' | 'outing' | 'week';

interface Entry {
  title: string;
  detail: string;
  /** Small third line: a time, or the places visited. */
  meta: string;
  kind: Kind;
}

interface History {
  heading: string;
  summary: string;
  entries: Entry[];
}

const ICONS: Record<Kind, keyof typeof Feather.glyphMap> = {
  home: 'home',
  school: 'book',
  trip: 'navigation',
  outing: 'map-pin',
  week: 'calendar',
};

/*
 * Small fixed sample datasets. Nothing is read from a device: the only inputs are the child's
 * current place (so "today" ends where the Location tab says they are) and which child it is
 * (so two children do not show the same outings).
 */

function todayEntries(place: string): Entry[] {
  const leftHome: Entry = { title: 'Home', detail: 'Left at 8:05 AM', meta: 'From 7:10 AM', kind: 'home' };
  const tripToSchool: Entry = { title: 'On the way', detail: '37 min trip', meta: '8:05 AM', kind: 'trip' };
  if (place === 'School') {
    return [leftHome, tripToSchool, { title: 'School', detail: 'Arrived · still here', meta: '8:42 AM', kind: 'school' }];
  }
  const school: Entry = { title: 'School', detail: 'Stayed 6h 28m', meta: '8:42 AM – 3:10 PM', kind: 'school' };
  const tripBack: Entry = { title: 'On the way', detail: '25 min trip', meta: '3:10 PM', kind: 'trip' };
  const last: Entry =
    place === 'Home'
      ? { title: 'Home', detail: 'Arrived · still here', meta: '3:35 PM', kind: 'home' }
      : { title: place, detail: 'Arrived · still here', meta: '3:35 PM', kind: 'outing' };
  return [leftHome, tripToSchool, school, tripBack, last];
}

const OUTINGS = [
  { thu: 'Soccer practice', tue: 'Library', sat: 'Park', weeks: ['Soccer practice, Library', "Grandma's", "Park, Grandma's, Dentist", 'Library, Park'] },
  { thu: 'Swim class', tue: 'Art club', sat: 'Playground', weeks: ['Swim class, Art club', 'Playground', "Grandma's, Park", 'Swim class, Library, Dentist'] },
];

function buildHistory(child: Child, range: Range): History {
  const first = child.name.split(' ')[0];
  // Stable per child: the same child always gets the same set of outings.
  const outings = OUTINGS[[...child.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % OUTINGS.length];
  const today = todayEntries(child.place);

  if (range === 'Today') {
    const trips = today.filter((e) => e.kind === 'trip').length;
    return {
      heading: 'Today',
      summary: `${today.length - trips} stops and ${trips} ${trips === 1 ? 'trip' : 'trips'} so far. ${first} is at ${child.place} now.`,
      entries: today,
    };
  }

  if (range === 'Week') {
    const todayRoute = today
      .filter((e) => e.kind !== 'trip')
      .map((e) => e.title)
      .join(' → ');
    const entries: Entry[] = [
      { title: 'Today', detail: todayRoute, meta: `At ${child.place} now`, kind: 'school' },
      { title: 'Thursday', detail: `Home → School → ${outings.thu} → Home`, meta: 'Away 8h 10m', kind: 'outing' },
      { title: 'Wednesday', detail: 'Home → School → Home', meta: 'Away 6h 55m', kind: 'school' },
      { title: 'Tuesday', detail: `Home → School → ${outings.tue} → Home`, meta: 'Away 7h 40m', kind: 'outing' },
      { title: 'Monday', detail: 'Home → School → Home', meta: 'Away 6h 50m', kind: 'school' },
      { title: 'Sunday', detail: "Home → Grandma's → Home", meta: 'Away 3h 20m', kind: 'outing' },
      { title: 'Saturday', detail: `Home → ${outings.sat} → Home`, meta: 'Away 1h 45m', kind: 'outing' },
    ];
    return { heading: 'Last 7 days', summary: '5 school days and 4 other places in the last 7 days.', entries };
  }

  const schoolDays = [5, 5, 4, 5];
  const titles = ['This week', 'Last week', '2 weeks ago', '3 weeks ago'];
  const entries: Entry[] = titles.map((title, i) => {
    const places = outings.weeks[i].split(', ').length;
    return {
      title,
      detail: `${schoolDays[i]} school days · ${places} other ${places === 1 ? 'place' : 'places'}`,
      meta: outings.weeks[i],
      kind: 'week',
    };
  });
  const otherVisits = outings.weeks.reduce((n, w) => n + w.split(', ').length, 0);
  return {
    heading: 'Last 4 weeks',
    summary: `${schoolDays.reduce((a, b) => a + b, 0)} school days and ${otherVisits} other visits in the last 4 weeks.`,
    entries,
  };
}

export default function LocationHistory() {
  const { colors } = useTheme();
  const { activeChild } = useStore();
  const [range, setRange] = useState<Range>('Today');

  const history = buildHistory(activeChild, range);
  const nodeColor: Record<Kind, string> = {
    home: colors.success,
    school: categoryColors.location,
    trip: categoryColors.schedules,
    outing: colors.accent,
    week: categoryColors.reports,
  };

  return (
    <Screen>
      <Header back title="Location History" subtitle={activeChild.name.split(' ')[0]} />
      <SampleNote about="location" />
      <View style={{ marginBottom: spacing.lg }}>
        <SegmentedControl
          options={[...RANGES]}
          value={range}
          onChange={(v) => setRange(RANGES.find((r) => r === v) ?? 'Today')}
          accessibilityLabel="History range"
        />
      </View>

      <View style={[styles.summary, { backgroundColor: colors.primarySoft }]}>
        <Feather name="map" size={16} color={colors.primary} />
        <Text variant="small" style={{ flex: 1 }}>
          {history.summary}
        </Text>
      </View>

      <SectionLabel>{history.heading}</SectionLabel>
      <Card>
        {history.entries.map((s, i) => {
          const last = i === history.entries.length - 1;
          return (
            <View key={`${range}-${i}`} accessible accessibilityLabel={`${s.title}. ${s.detail}. ${s.meta}`} style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.node, { backgroundColor: nodeColor[s.kind] }]}>
                  <Feather name={ICONS[s.kind]} size={14} color="#FFFFFF" />
                </View>
                {!last && <View style={[styles.line, { backgroundColor: colors.border }]} />}
              </View>
              <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.xl }}>
                <Text variant="title">{s.title}</Text>
                <Text variant="small" tone="muted">
                  {s.detail}
                </Text>
                <Text variant="tiny" tone="faint" style={{ marginTop: 2 }}>
                  {s.meta}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.lg }}>
        Sample history for this demo. Location history is kept for 30 days on Haven Premium.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 28 },
  node: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginVertical: 4 },
});
