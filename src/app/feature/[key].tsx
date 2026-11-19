import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { InlineNote } from '@/components/InlineNote';
import { Button, Card, Header, IconBadge, PlaceholderNotice, Row, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { ImportedActivityReport } from '@/components/ImportedActivityReport';
import { DeviceReport } from '@/components/DeviceReport';
import { useLink } from '@/sync/link';
import { useStore, nowLabel } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

type Kind = 'monitor' | 'approval' | 'rating';

interface SampleItem {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  meta?: string;
  tone?: 'default' | 'danger' | 'success' | 'muted';
}

interface FeatureDef {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  kind: Kind;
  toggleLabel?: string;
  sampleLabel?: string;
  sample?: SampleItem[];
}

const FEATURES: Record<string, FeatureDef> = {
  calls: {
    title: 'Calls',
    subtitle: 'Recent call activity',
    icon: 'phone',
    color: '#34C759',
    kind: 'monitor',
    toggleLabel: 'Show call activity',
    sampleLabel: 'Sample activity',
    sample: [
      { title: 'Grandma', subtitle: 'Incoming · 4:12 PM', icon: 'phone-incoming', meta: '6m', tone: 'success' },
      { title: 'Alex', subtitle: 'Outgoing · 2:30 PM', icon: 'phone-outgoing', meta: '12m' },
      { title: 'Unknown', subtitle: 'Missed · 1:05 PM', icon: 'phone-missed', meta: '—', tone: 'danger' },
      { title: 'Coach Dan', subtitle: 'Incoming · 11:20 AM', icon: 'phone-incoming', meta: '3m', tone: 'success' },
    ],
  },
  messages: {
    title: 'Messages',
    subtitle: 'Texting activity overview',
    icon: 'message-circle',
    color: '#22C55E',
    kind: 'monitor',
    toggleLabel: 'Show messaging activity',
    sampleLabel: 'Busiest contacts today',
    sample: [
      { title: 'Class group', subtitle: 'Group chat', icon: 'users', meta: '48 msgs' },
      { title: 'Alex', subtitle: 'Direct messages', icon: 'user', meta: '23 msgs' },
      { title: 'Mom', subtitle: 'Direct messages', icon: 'user', meta: '9 msgs' },
    ],
  },
  social: {
    title: 'Social Apps',
    subtitle: 'Activity in social apps',
    icon: 'share-2',
    color: '#E1306C',
    kind: 'monitor',
    toggleLabel: 'Show social activity',
    sampleLabel: 'Time by app',
    sample: [
      { title: 'Photogram', subtitle: 'Social', icon: 'camera', meta: '35m' },
      { title: 'Chatter', subtitle: 'Messaging', icon: 'message-square', meta: '40m' },
    ],
  },
  browsing: {
    title: 'Browsing History',
    subtitle: 'Visited sites overview',
    icon: 'compass',
    color: '#FF6A3D',
    kind: 'monitor',
    toggleLabel: 'Show browsing activity',
    sampleLabel: 'Top categories',
    sample: [
      { title: 'Education', subtitle: 'school portals, wikis', icon: 'book-open', meta: '41m', tone: 'success' },
      { title: 'Video', subtitle: 'streaming sites', icon: 'play', meta: '28m' },
      { title: 'Gaming', subtitle: 'game wikis, forums', icon: 'target', meta: '15m' },
      { title: 'Blocked attempts', subtitle: 'filtered by Haven', icon: 'shield-off', meta: '2', tone: 'danger' },
    ],
  },
  video: {
    title: 'Video Watch History',
    subtitle: 'Watched videos overview',
    icon: 'video',
    color: '#FF3B30',
    kind: 'monitor',
    toggleLabel: 'Show video activity',
    sampleLabel: 'Recently watched',
    sample: [
      { title: 'Science experiments', subtitle: 'Education · 12m', icon: 'play-circle', meta: 'OK', tone: 'success' },
      { title: 'Gaming highlights', subtitle: 'Entertainment · 18m', icon: 'play-circle', meta: 'OK' },
      { title: 'Music video', subtitle: 'Music · 4m', icon: 'play-circle', meta: 'OK' },
    ],
  },
  keywords: {
    title: 'Keyword Alerts',
    subtitle: 'Get notified about flagged words',
    icon: 'alert-triangle',
    color: '#A855F7',
    kind: 'monitor',
    toggleLabel: 'Enable keyword alerts',
    sampleLabel: 'Watchlist',
    sample: [
      { title: 'bullying terms', subtitle: '12 words', icon: 'flag', meta: 'On', tone: 'danger' },
      { title: 'self-harm terms', subtitle: '9 words', icon: 'flag', meta: 'On', tone: 'danger' },
      { title: 'adult terms', subtitle: '20 words', icon: 'flag', meta: 'On', tone: 'danger' },
      { title: 'Custom words', subtitle: 'Add your own', icon: 'plus', meta: '', tone: 'muted' },
    ],
  },
  'app-installs': {
    title: 'App Installs',
    subtitle: 'Approve new app downloads',
    icon: 'download',
    color: '#12B5A6',
    kind: 'approval',
    toggleLabel: 'Require approval for new apps',
    sampleLabel: 'Waiting for approval',
    sample: [
      { title: 'Voxel Arena', subtitle: 'Games · rated 12+', icon: 'box' },
      { title: 'PuzzleQuest 2', subtitle: 'Games · rated 7+', icon: 'box' },
    ],
  },
  purchases: {
    title: 'Purchases',
    subtitle: 'Approve in-app and store purchases',
    icon: 'shopping-bag',
    color: '#F5A623',
    kind: 'approval',
    toggleLabel: 'Require approval for purchases',
    sampleLabel: 'Waiting for approval',
    sample: [
      { title: 'Coin pack', subtitle: 'PuzzleQuest · $4.99', icon: 'dollar-sign' },
      { title: 'Season pass', subtitle: 'Voxel Arena · $9.99', icon: 'dollar-sign' },
    ],
  },
  'age-ratings': {
    title: 'Age Ratings',
    subtitle: 'Allowed content ratings',
    icon: 'shield',
    color: '#3B9EFF',
    kind: 'rating',
  },
};

const RATINGS = ['3+', '7+', '12+', '16+', '18+'];

/** One approve / deny decision made on this screen. Kept in memory only, for this visit. */
interface Decision {
  index: number;
  status: 'approved' | 'denied';
  time: string;
}

const SOURCE_STATUS: Record<string, string> = {
  calls: 'Call activity requires an eligible Android call-log integration. Family check-ins remain available in Haven.',
  messages: 'SMS activity requires an eligible Android SMS integration. Family chat is available in Haven.',
  keywords: 'Keyword alerts need an explicitly authorized content source before rules can run.',
};

export default function FeatureScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { live, activeChild } = useStore();
  const link = useLink();
  const category = key === 'social' ? 'social' : key === 'video' || key === 'video-usage' ? 'video' : key === 'app-usage' ? 'all' : null;
  if (live && link.role === 'parent' && (key === 'web' || key === 'browsing' || key === 'video-import')) {
    return <ImportedActivityReport key={link.familyId + '/' + activeChild.id + '/' + key}
      child={activeChild.name} source={key === 'video-import' ? 'youtube' : 'chrome'} initialDomains={key === 'web'} />;
  }
  if (live && category) {
    const title = key === 'social' ? 'Social Apps' : category === 'video' ? 'Video-app usage' : 'App Usage';
    return <Screen>
      <Header back title={title} subtitle={activeChild.name} />
      {category === 'video' && <Card>
        <Text>This report shows Android foreground app usage. Import an authorized YouTube export to view watch records.</Text>
        <Button label="Open watch history import" variant="secondary" onPress={() => router.push('/feature/video-import')} />
      </Card>}
      {link.role === 'parent' && link.familyId && <DeviceReport key={link.familyId + '/' + activeChild.id + '/' + category}
        family={link.familyId} child={activeChild.id} view={category} />}
    </Screen>;
  }
  if (live && key && SOURCE_STATUS[key]) {
    return <Screen>
      <Header back title={key === 'web' ? 'Web Activity' : FEATURES[key].title} />
      <Card><Text variant="title">Integration required</Text><Text>{SOURCE_STATUS[key]}</Text></Card>
    </Screen>;
  }
  return <PreviewFeature key={key} featureKey={key === 'web' ? 'browsing' : key} />;
}

function PreviewFeature({ featureKey }: { featureKey?: string }) {
  const def = FEATURES[featureKey ?? ''] ?? FEATURES.calls;
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(def.kind !== 'monitor');
  const [rating, setRating] = useState('12+');
  // Newest first.
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const sample = def.sample ?? [];
  const isMonitor = def.kind === 'monitor';
  // App installs, purchases and age ratings are examples as well: nothing on a phone asks for them.
  const isExample = def.kind === 'approval' || def.kind === 'rating';
  const isApproval = def.kind === 'approval';
  const pending = sample.map((item, index) => ({ item, index })).filter(({ index }) => !decisions.some((d) => d.index === index));
  const latest = decisions[0];

  const decide = (index: number, status: Decision['status']) =>
    setDecisions((prev) => [{ index, status, time: nowLabel() }, ...prev.filter((d) => d.index !== index)]);
  const undo = (index: number) => setDecisions((prev) => prev.filter((d) => d.index !== index));

  // The sample list fades between dimmed (off) and full strength (on).
  const sampleFade = useAnimatedStyle(() => ({ opacity: withTiming(enabled ? 1 : DIMMED_OPACITY, { duration: 180 }) }));

  const toneColor = (t?: string) =>
    t === 'danger' ? colors.danger : t === 'success' ? colors.success : t === 'muted' ? colors.textFaint : colors.text;

  return (
    <Screen>
      <Header back title={def.title} />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <IconBadge name={def.icon} color={def.color} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="title">{def.title}</Text>
          <Text variant="small" tone="muted">
            {def.subtitle}
          </Text>
        </View>
        {(isMonitor || isExample) && (
          <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
            <Text variant="tiny" color={colors.warning}>
              Preview
            </Text>
          </View>
        )}
      </Card>

      {isMonitor && <PlaceholderNotice note="Preview screen — sample data shown for layout. Live monitoring is not connected in this build." />}
      {isExample && (
        <PlaceholderNotice note="Preview screen — the requests and settings here are examples. Nothing on your child’s phone asks for approval, and nothing is saved or enforced in this build." />
      )}

      {def.toggleLabel && (
        <Card style={{ marginBottom: spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
            <Text variant="title" style={{ flex: 1 }}>
              {def.toggleLabel}
            </Text>
            <Toggle value={enabled} onChange={setEnabled} accessibilityLabel={def.toggleLabel} />
          </View>
        </Card>
      )}

      {def.kind === 'rating' && (
        <>
          <SectionLabel>Maximum allowed rating</SectionLabel>
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {RATINGS.map((r) => (
              <Row
                key={r}
                title={`Ages ${r}`}
                icon={rating === r ? 'check-circle' : 'circle'}
                iconColor={rating === r ? colors.success : colors.textFaint}
                chevron={false}
                accessibilityRole="radio"
                checked={rating === r}
                onPress={() => setRating(r)}
              />
            ))}
          </Card>
          <Text variant="tiny" tone="faint" style={styles.footnote}>
            Content rated above {rating} would need your approval. Demo: this choice is kept on this screen only.
          </Text>
        </>
      )}

      {/* Monitoring categories: sample rows only. Off = dimmed with a prompt, on = the sample list. */}
      {isMonitor && sample.length > 0 && (
        <>
          <View style={styles.sampleHead}>
            <SectionLabel style={{ marginBottom: 0 }}>{def.sampleLabel ?? 'Details'}</SectionLabel>
            <View style={[styles.badge, { backgroundColor: colors.surfaceSunken }]}>
              <Text variant="tiny" tone="muted">
                Sample data
              </Text>
            </View>
          </View>
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {enabled ? (
            <Animated.View style={sampleFade}>
              {sample.map((item, i) => (
                <View key={i} style={styles.item}>
                  <IconBadge name={item.icon} color={def.color} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text variant="title" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text variant="small" tone="muted">
                      {item.subtitle}
                    </Text>
                  </View>
                  {item.meta != null && (
                    <Text variant="smallStrong" color={toneColor(item.tone)}>
                      {item.meta}
                    </Text>
                  )}
                </View>
              ))}
            </Animated.View>
            ) : (
              <View style={styles.offState}>
                <Feather name="eye-off" size={20} color={colors.textMuted} />
                <Text variant="smallStrong">Turn on to see activity</Text>
                <Text variant="small" tone="muted" center>
                  Sample rows appear here when this is on.
                </Text>
              </View>
            )}
          </Card>
          <Text variant="tiny" tone="faint" style={styles.footnote}>
            {enabled
              ? 'These rows are made-up examples. Nothing is read from a real device.'
              : 'Turning this on only reveals the sample rows. Nothing is read from a real device.'}
          </Text>
        </>
      )}

      {isApproval && (
        <>
          <SectionLabel>{def.sampleLabel ?? 'Details'}</SectionLabel>
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {!enabled ? (
              <EmptyLine icon="slash" text="Approval is off. Turn it on to review requests before they go through." />
            ) : pending.length === 0 ? (
              <EmptyLine icon="check-circle" text="Nothing is waiting. New requests show up here." />
            ) : (
              pending.map(({ item, index }) => (
                <View key={index} style={styles.item}>
                  <IconBadge name={item.icon} color={def.color} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text variant="title" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text variant="small" tone="muted">
                      {item.subtitle}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <MiniBtn icon="check" color={colors.success} label={`Approve ${item.title}`} onPress={() => decide(index, 'approved')} />
                    <MiniBtn icon="x" color={colors.danger} label={`Deny ${item.title}`} onPress={() => decide(index, 'denied')} />
                  </View>
                </View>
              ))
            )}
          </Card>

          {latest != null && (
            <InlineNote
              tone={latest.status === 'approved' ? 'success' : 'neutral'}
              icon={latest.status === 'approved' ? 'check-circle' : 'x-circle'}
              title={`${sample[latest.index].title} ${latest.status}`}
              detail="Demo only. Nothing was installed, bought or blocked."
              style={{ marginTop: spacing.md }}
            />
          )}

          <Button
            label={decisions.length > 0 ? `Approval history (${decisions.length})` : 'Approval history'}
            accessibilityLabel={`${showHistory ? 'Hide' : 'Show'} approval history, ${decisions.length} resolved`}
            variant="secondary"
            icon="clock"
            iconRight={showHistory ? 'chevron-up' : 'chevron-down'}
            style={{ marginTop: spacing.xl }}
            onPress={() => setShowHistory((v) => !v)}
          />

          {showHistory && (
            <View style={{ marginTop: spacing.md }}>
              <SectionLabel>Resolved in this session</SectionLabel>
              <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
                {decisions.length === 0 ? (
                  <EmptyLine icon="clock" text="Nothing approved or denied yet. Decisions you make here are listed until you leave this screen." />
                ) : (
                  decisions.map((d) => {
                    const approved = d.status === 'approved';
                    const item = sample[d.index];
                    return (
                      <View key={d.index} style={styles.item}>
                        <IconBadge name={approved ? 'check' : 'x'} color={approved ? colors.success : colors.danger} size={38} />
                        <View style={{ flex: 1 }}>
                          <Text variant="title" numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text variant="small" tone="muted">
                            {approved ? 'Approved' : 'Denied'} · {d.time}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => undo(d.index)}
                          accessibilityRole="button"
                          accessibilityLabel={`Undo decision for ${item.title}`}
                          hitSlop={UNDO_HIT_SLOP}
                          style={({ pressed }) => [styles.undo, pressed && { opacity: 0.6 }]}>
                          <Text variant="smallStrong" color={colors.primary}>
                            Undo
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </Card>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function EmptyLine({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Feather name={icon} size={18} color={colors.textFaint} />
      <Text variant="small" tone="muted" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

function MiniBtn({
  icon,
  color,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={MINI_HIT_SLOP}
      style={({ pressed }) => [styles.miniBtn, { backgroundColor: color + (pressed ? '44' : '22') }, pressed && { transform: [{ scale: 0.94 }] }]}>
      <Feather name={icon} size={18} color={color} />
    </Pressable>
  );
}

const DIMMED_OPACITY = 0.28;
// 40pt buttons with 2pt of slop each side reach a 44pt target without overlapping their neighbour.
const MINI_HIT_SLOP = 2;
const UNDO_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  miniBtn: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  sampleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  offState: { alignItems: 'center', gap: 6, paddingVertical: spacing.xxl },
  offOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  offPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    ...shadow(2),
  },
  footnote: { marginTop: spacing.sm, marginHorizontal: spacing.xs },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  undo: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
});
