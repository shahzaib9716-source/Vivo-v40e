import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button, Card, Header, IconBadge, Screen, Text } from '@/components/ui';
import { useStore, type Alert } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

type Kind = 'location' | 'screen' | 'safety';
type Filter = 'all' | Kind;

const FILTERS: { key: Filter; label: string; empty: string }[] = [
  { key: 'all', label: 'All', empty: 'No notifications yet' },
  { key: 'location', label: 'Location', empty: 'No location alerts yet' },
  { key: 'screen', label: 'Screen time', empty: 'No screen time alerts yet' },
  { key: 'safety', label: 'Safety', empty: 'No safety alerts yet' },
];

/** Feather icon names the store uses for each kind of alert. A Map, so odd names cannot hit Object's own keys. */
const KIND_BY_ICON = new Map<string, Kind>([
  ['map-pin', 'location'],
  ['navigation', 'location'],
  ['map', 'location'],
  ['home', 'location'],
  ['clock', 'screen'],
  ['moon', 'screen'],
  ['pause-circle', 'screen'],
  ['smartphone', 'screen'],
  ['alert-circle', 'safety'],
  ['alert-triangle', 'safety'],
  ['alert-octagon', 'safety'],
  ['shield', 'safety'],
  ['lock', 'safety'],
]);

const isSOS = (a: Alert) => /^sos\b/i.test(a.title);

/** Sorts an alert into a filter by its icon first, then by the wording of its title. */
function kindOf(a: Alert): Kind | null {
  if (isSOS(a)) return 'safety';
  const byIcon = KIND_BY_ICON.get(a.icon);
  if (byIcon) return byIcon;
  const title = a.title.toLowerCase();
  if (/\b(arrived|left|checked in|location|geofence)\b/.test(title)) return 'location';
  if (/\b(limit|screen time|paused|bedtime|minutes)\b/.test(title)) return 'screen';
  if (/\b(safety|blocked|report|alert)\b/.test(title)) return 'safety';
  return null;
}

export default function Notifications() {
  const { colors } = useTheme();
  const { alerts, markAlertsRead, sosActive, clearSOS, childSelf, setActiveChildId } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  // Opening the screen marks everything as read, which clears the bell on the dashboard. The dots
  // stay for this visit, so it is still clear which alerts are new.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set(alerts.filter((a) => a.unread).map((a) => a.id)));
  const unreadKey = alerts
    .filter((a) => a.unread)
    .map((a) => a.id)
    .join('|');

  useEffect(() => {
    if (!unreadKey) return;
    const ids = unreadKey.split('|');
    setFresh((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])));
    const timer = setTimeout(markAlertsRead, 600);
    return () => clearTimeout(timer);
  }, [unreadKey, markAlertsRead]);

  // Alerts are stored newest first. While an SOS is open, the latest one is the live emergency: it
  // is pinned to the top, above anything that arrived after it.
  const liveSosId = sosActive ? alerts.find(isSOS)?.id : undefined;
  const matching = alerts.filter((a) => filter === 'all' || kindOf(a) === filter);
  const shown = [...matching.filter((a) => a.id === liveSosId), ...matching.filter((a) => a.id !== liveSosId)];
  const newCount = alerts.filter((a) => a.unread || fresh.has(a.id)).length;
  const current = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const viewLocation = () => {
    // An SOS always comes from the child using the child app.
    setActiveChildId(childSelf.id);
    (router.push as any)('/(parent)/location');
  };

  return (
    <Screen>
      <Header back title="Notifications" subtitle={newCount > 0 ? `${newCount} new` : undefined} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
        keyboardShouldPersistTaps="handled">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Show ${f.key === 'all' ? 'all notifications' : `${f.label.toLowerCase()} notifications`}`}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border },
                pressed && styles.pressed,
              ]}>
              <Text variant="smallStrong" color={active ? colors.onPrimary : colors.textMuted}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.list}>
        {shown.map((a) => {
          const isNew = a.unread || fresh.has(a.id);

          if (isSOS(a)) {
            const live = a.id === liveSosId;
            return (
              <View
                key={a.id}
                accessibilityRole={live ? 'alert' : undefined}
                style={[
                  styles.sos,
                  { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
                  live && styles.sosLive,
                  live && shadow(2),
                ]}>
                <View style={styles.row}>
                  <IconBadge name="alert-circle" color={colors.danger} size={44} soft={false} />
                  <View style={styles.flex}>
                    <Text variant="title">{a.title}</Text>
                    <Text variant="small" tone="muted">
                      {a.body}
                    </Text>
                  </View>
                  <View style={styles.meta}>
                    <Text variant="tiny" tone="muted">
                      {a.ago}
                    </Text>
                    {isNew && <View style={[styles.dot, { backgroundColor: colors.danger }]} />}
                  </View>
                </View>

                {live ? (
                  <View style={[styles.tag, { backgroundColor: colors.danger }]}>
                    <Text variant="tiny" color="#FFFFFF">
                      ACTIVE NOW
                    </Text>
                  </View>
                ) : sosActive ? null : (
                  <View style={[styles.tag, { backgroundColor: colors.surface }]}>
                    <Feather name="check" size={12} color={colors.success} />
                    <Text variant="tiny" color={colors.success}>
                      MARKED SAFE
                    </Text>
                  </View>
                )}

                <View style={styles.sosActions}>
                  <Button
                    label="View location"
                    icon="map-pin"
                    size="sm"
                    variant={live ? 'danger' : 'secondary'}
                    onPress={viewLocation}
                    style={styles.flex}
                  />
                  {live && <Button label="Mark as safe" icon="check" size="sm" variant="secondary" onPress={clearSOS} style={styles.flex} />}
                </View>
              </View>
            );
          }

          return (
            <Card key={a.id} style={isNew ? { borderColor: colors.primary + '55' } : undefined}>
              <View style={styles.row}>
                <IconBadge name={a.icon} color={a.color} size={44} />
                <View style={styles.flex}>
                  <Text variant="title">{a.title}</Text>
                  <Text variant="small" tone="muted">
                    {a.body}
                  </Text>
                </View>
                <View style={styles.meta}>
                  <Text variant="tiny" tone="faint">
                    {a.ago}
                  </Text>
                  {isNew && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                </View>
              </View>
            </Card>
          );
        })}
      </View>

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="bell-off" size={20} color={colors.textFaint} />
          <Text variant="small" tone="faint" center>
            {current.empty}
          </Text>
          {filter !== 'all' && alerts.length > 0 && (
            <Pressable
              onPress={() => setFilter('all')}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => pressed && styles.pressed}>
              <Text variant="smallStrong" color={colors.primary}>
                Show all notifications
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.empty}>
          <Feather name="check-circle" size={20} color={colors.textFaint} />
          <Text variant="small" tone="faint">
            You're all caught up
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  // The chip row runs edge to edge, past the screen's side padding, so it can scroll on narrow phones.
  filters: { marginHorizontal: -spacing.xl, marginBottom: spacing.lg, flexGrow: 0 },
  filtersContent: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  chip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { alignItems: 'flex-end', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 999 },

  sos: { padding: spacing.lg, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, gap: spacing.md },
  sosLive: { borderWidth: 1.5 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  sosActions: { flexDirection: 'row', gap: spacing.sm },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
});
