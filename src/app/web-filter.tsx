import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, Header, IconBadge, Row, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

interface Cat {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  blocked: boolean;
}

const INITIAL: Cat[] = [
  { id: 'adult', label: 'Adult content', icon: 'eye-off', color: '#FB4A4A', blocked: true },
  { id: 'violence', label: 'Violence', icon: 'alert-octagon', color: '#F59E0B', blocked: true },
  { id: 'gambling', label: 'Gambling', icon: 'dollar-sign', color: '#EC4899', blocked: true },
  { id: 'social', label: 'Social networks', icon: 'share-2', color: '#2E8BFF', blocked: false },
  { id: 'games', label: 'Online games', icon: 'target', color: '#8B5CF6', blocked: false },
  { id: 'shopping', label: 'Shopping', icon: 'shopping-bag', color: '#12B5A6', blocked: false },
  { id: 'news', label: 'News', icon: 'file-text', color: '#6366F1', blocked: false },
];

export default function WebFilter() {
  const { colors } = useTheme();
  const [cats, setCats] = useState(INITIAL);
  const [safeSearch, setSafeSearch] = useState(true);
  const [safeMode, setSafeMode] = useState(true);
  const blockedCount = cats.filter((c) => c.blocked).length;

  const toggle = (id: string) => setCats((p) => p.map((c) => (c.id === id ? { ...c, blocked: !c.blocked } : c)));

  return (
    <Screen>
      <Header back title="Web & Content Filter" />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
        <IconBadge name="shield" color={colors.success} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="title">Protection is on</Text>
          <Text variant="small" tone="muted">
            {blockedCount} categories blocked
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.successSoft }]}>
          <Text variant="tiny" color={colors.success}>
            ACTIVE
          </Text>
        </View>
      </Card>

      <SectionLabel>Safety</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Safe Search" subtitle="Filter explicit results in search" icon="search" iconColor={colors.primary} chevron={false} right={<Toggle value={safeSearch} onChange={setSafeSearch} />} />
        <Row title="Safe Browsing mode" subtitle="Force restricted mode on sites" icon="lock" iconColor={colors.info} chevron={false} right={<Toggle value={safeMode} onChange={setSafeMode} />} />
      </Card>

      <SectionLabel>Blocked categories</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {cats.map((c) => (
          <Row
            key={c.id}
            title={c.label}
            icon={c.icon}
            iconColor={c.color}
            chevron={false}
            right={<Toggle value={c.blocked} onChange={() => toggle(c.id)} />}
          />
        ))}
      </Card>

      <SectionLabel>Specific sites</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <Row title="Blocked sites" subtitle="3 sites" icon="x-circle" iconColor={colors.danger} onPress={() => {}} />
        <Row title="Always allowed" subtitle="5 sites" icon="check-circle" iconColor={colors.success} onPress={() => {}} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
