import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Avatar, Card, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { categoryColors, radius, shadow, spacing, useTheme } from '@/theme';

export default function Family() {
  const { colors } = useTheme();
  const { children, setRole } = useStore();

  const switchMode = () => {
    setRole(null);
    (router.replace as any)('/');
  };

  return (
    <Screen>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <Text variant="h1">Family</Text>
      </View>

      {/* Premium card */}
      <LinearGradient colors={['#FF7A59', '#FF5E8A', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.premium}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="star" size={16} color="#FFFFFF" />
            <Text variant="smallStrong" color="#FFFFFF">
              Haven Premium
            </Text>
          </View>
          <Text variant="h3" color="#FFFFFF" style={{ marginTop: 6 }}>
            Unlock the full toolkit
          </Text>
          <Text variant="small" color="rgba(255,255,255,0.9)" style={{ marginTop: 2 }}>
            Unlimited children, full reports & alerts
          </Text>
        </View>
        <View style={styles.premiumBtn} onTouchEnd={() => (router.push as any)('/subscription')}>
          <Text variant="smallStrong" color="#FF5E8A">
            View plans
          </Text>
        </View>
      </LinearGradient>

      <SectionLabel>Children</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {children.map((c) => (
          <Row
            key={c.id}
            title={c.name}
            subtitle={`${c.deviceName} · Age ${c.age}`}
            onPress={() => (router.push as any)('/child-profile')}
            right={<Avatar name={c.name} size={36} />}
            chevron
          />
        ))}
        <Row title="Add a child" subtitle="Pair a new device" icon="plus" iconColor={colors.primary} onPress={() => (router.push as any)('/pairing')} />
      </Card>

      <SectionLabel>Engagement</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Rewards & Tasks" subtitle="Set chores and bonus time" icon="gift" iconColor={categoryColors.rewards} onPress={() => (router.push as any)('/rewards-parent')} />
        <Row title="Notifications" subtitle="Alerts and activity feed" icon="bell" iconColor={colors.accent} onPress={() => (router.push as any)('/notifications')} />
      </Card>

      <SectionLabel>Account</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Devices & Pairing" subtitle="Manage linked devices" icon="smartphone" iconColor={colors.info} onPress={() => (router.push as any)('/pairing')} />
        <Row title="Settings" subtitle="App, privacy and account" icon="settings" iconColor={colors.textMuted} onPress={() => (router.push as any)('/settings')} />
        <Row title="Subscription" subtitle="Haven Premium" icon="credit-card" iconColor={categoryColors.rewards} onPress={() => (router.push as any)('/subscription')} />
        <Row title="Help & Support" subtitle="Guides and contact" icon="help-circle" iconColor={colors.success} onPress={() => (router.push as any)('/settings')} />
      </Card>

      <Card onPress={switchMode} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        <Feather name="repeat" size={16} color={colors.primary} />
        <Text variant="smallStrong" color={colors.primary}>
          Switch mode
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  premium: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderRadius: radius.card, marginBottom: spacing.xl, ...shadow(2) },
  premiumBtn: { backgroundColor: '#FFFFFF', paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
});
