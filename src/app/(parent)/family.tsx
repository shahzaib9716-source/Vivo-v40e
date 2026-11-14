import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Avatar, Card, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { linkSummary } from '@/components/LinkParts';
import { useLink } from '@/sync/link';
import { useStore } from '@/state/store';
import { categoryColors, radius, shadow, spacing, useTheme } from '@/theme';

export default function Family() {
  const { colors } = useTheme();
  const { children, activeChild, setActiveChildId, setRole } = useStore();
  const link = useLink();
  const account = link.account && !link.account.anonymous ? link.account : null;

  // "/messages" opens the conversation with the child the parent is currently viewing.
  const chatName = activeChild.name.split(' ')[0];

  const switchMode = () => {
    setRole(null);
    (router.replace as any)('/');
  };

  const openProfile = (childId: string) => {
    // The profile screen shows the active child, so pick the one that was tapped first.
    setActiveChildId(childId);
    (router.push as any)('/child-profile');
  };

  return (
    <Screen>
      <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <Text variant="h1">Family</Text>
      </View>

      {/* Premium card */}
      <LinearGradient colors={['#C2410C', '#BE185D', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.premium}>
        <View style={styles.premiumText}>
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
        <Pressable
          onPress={() => (router.push as any)('/subscription')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="View Haven Premium plans"
          style={({ pressed }) => [styles.premiumBtn, pressed && styles.premiumBtnPressed]}>
          <Text variant="smallStrong" color="#BE185D">
            View plans
          </Text>
        </Pressable>
      </LinearGradient>

      <SectionLabel>Children</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {children.map((c) => (
          <Row
            key={c.id}
            title={c.name}
            subtitle={`${c.deviceName} · Age ${c.age}`}
            onPress={() => openProfile(c.id)}
            right={<Avatar name={c.name} size={36} />}
            chevron
          />
        ))}
        <Row title="Add a child" subtitle="Pair a new device" icon="plus" iconColor={colors.primary} onPress={() => (router.push as any)('/pairing')} />
      </Card>

      <SectionLabel>Engagement</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Messages" subtitle={`Chat with ${chatName}`} icon="message-circle" iconColor={colors.primary} onPress={() => (router.push as any)('/messages')} />
        <Row title="Rewards & Tasks" subtitle="Set chores and bonus time" icon="gift" iconColor={categoryColors.rewards} onPress={() => (router.push as any)('/rewards-parent')} />
        <Row title="Notifications" subtitle="Alerts and activity feed" icon="bell" iconColor={colors.accent} onPress={() => (router.push as any)('/notifications')} />
      </Card>

      <SectionLabel>Account</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row
          title="Parent account"
          subtitle={account ? (account.email ?? 'Signed in') : link.configured ? 'Sign in to set up your family' : 'Not available in this build'}
          icon="user"
          iconColor={colors.primary}
          onPress={() => (router.push as any)('/account')}
        />
        <Row title="Devices & Pairing" subtitle={linkSummary(link).title} icon="smartphone" iconColor={colors.info} badge={link.role ? 'LINKED' : undefined} badgeColor={colors.success} onPress={() => (router.push as any)('/pairing')} />
        <Row title="Settings" subtitle="App, privacy and account" icon="settings" iconColor={colors.textMuted} onPress={() => (router.push as any)('/settings')} />
        <Row title="Subscription" subtitle="Free plan · see Premium" icon="credit-card" iconColor={categoryColors.rewards} onPress={() => (router.push as any)('/subscription')} />
        <Row title="Help & Support" subtitle="Guides and contact" icon="help-circle" iconColor={colors.success} onPress={() => (router.push as any)('/settings')} />
      </Card>

      {/* Only a device that is not in a family can change sides: it shows sample data either way.
          In a family the side is the role the server gave this account. */}
      {link.role === null ? (
        <Card onPress={switchMode} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
          <Feather name="repeat" size={16} color={colors.primary} />
          <Text variant="smallStrong" color={colors.primary}>
            Switch mode
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  premium: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, marginBottom: spacing.xl, ...shadow(2) },
  premiumText: { flex: 1 },
  // Tall enough to tap comfortably; the white pill sits on the gradient in both colour modes.
  premiumBtn: { backgroundColor: '#FFFFFF', minHeight: 40, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.pill },
  premiumBtnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
