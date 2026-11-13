import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Button, Card, Header, IconBadge, PlaceholderNotice, Row, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

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
      { title: 'Tunnel', subtitle: 'Social', icon: 'activity', meta: '18m' },
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
      { title: 'Snapline', subtitle: 'Social · rated 13+', icon: 'box' },
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

export default function FeatureScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const def = FEATURES[key ?? ''] ?? FEATURES.calls;
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(def.kind !== 'monitor');
  const [rating, setRating] = useState('12+');
  const [resolved, setResolved] = useState<Record<number, 'approved' | 'denied'>>({});

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
      </Card>

      {def.kind === 'monitor' && <PlaceholderNotice note="Preview screen — sample data shown for layout. Live monitoring is not connected in this build." />}

      {def.toggleLabel && (
        <Card style={{ marginBottom: spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="title" style={{ flex: 1 }}>
              {def.toggleLabel}
            </Text>
            <Toggle value={enabled} onChange={setEnabled} />
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
                onPress={() => setRating(r)}
              />
            ))}
          </Card>
        </>
      )}

      {def.sample && (
        <>
          <SectionLabel>{def.sampleLabel ?? 'Details'}</SectionLabel>
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {def.sample.map((item, i) => (
              <View key={i} style={styles.item}>
                <IconBadge name={item.icon} color={def.color} size={38} />
                <View style={{ flex: 1 }}>
                  <Text variant="title">{item.title}</Text>
                  <Text variant="small" tone="muted">
                    {item.subtitle}
                  </Text>
                </View>
                {def.kind === 'approval' ? (
                  resolved[i] ? (
                    <Text variant="smallStrong" color={resolved[i] === 'approved' ? colors.success : colors.danger}>
                      {resolved[i] === 'approved' ? 'Approved' : 'Denied'}
                    </Text>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <MiniBtn icon="check" color={colors.success} onPress={() => setResolved((p) => ({ ...p, [i]: 'approved' }))} />
                      <MiniBtn icon="x" color={colors.danger} onPress={() => setResolved((p) => ({ ...p, [i]: 'denied' }))} />
                    </View>
                  )
                ) : (
                  item.meta != null && (
                    <Text variant="smallStrong" color={toneColor(item.tone)}>
                      {item.meta}
                    </Text>
                  )
                )}
              </View>
            ))}
          </Card>
        </>
      )}

      {def.kind === 'approval' && (
        <Button label="Approval history" variant="secondary" icon="clock" style={{ marginTop: spacing.xl }} onPress={() => {}} />
      )}
    </Screen>
  );
}

function MiniBtn({ icon, color, onPress }: { icon: keyof typeof Feather.glyphMap; color: string; onPress: () => void }) {
  return (
    <View onTouchEnd={onPress} style={[styles.miniBtn, { backgroundColor: color + '22' }]}>
      <Feather name={icon} size={18} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  miniBtn: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
