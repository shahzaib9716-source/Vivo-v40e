import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Avatar, Card, IconBadge, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { APP_VARIANT, NO_SERVER_NOTE, SIDE_HOME } from '@/config/variant';
import { linkSummary } from '@/components/LinkParts';
import { useLink } from '@/sync/link';
import { useStore } from '@/state/store';
import { categoryColors, radius, shadow, spacing, useTheme } from '@/theme';

export default function Family() {
  const { colors } = useTheme();
  const { children, activeChild, setActiveChildId, setRole } = useStore();
  const link = useLink();
  const previewNote = link.configured ? 'Opens the other side on this phone. To use two phones, link them under “Devices & Pairing”.' : NO_SERVER_NOTE;

  // "/messages" opens the conversation with the child the parent is currently viewing.
  const chatName = activeChild.name.split(' ')[0];

  const switchMode = () => {
    setRole(null);
    (router.replace as any)('/');
  };

  // Parent-only and child-only builds have no chooser to switch through. The child side is still
  // in the build, so one phone can show the whole loop: it opens as a clearly labelled demo.
  const openChildSide = () => {
    setRole('child');
    (router.replace as any)(SIDE_HOME.child);
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
        <Row title="Devices & Pairing" subtitle={linkSummary(link).title} icon="smartphone" iconColor={colors.info} badge={link.role ? 'LINKED' : undefined} badgeColor={colors.success} onPress={() => (router.push as any)('/pairing')} />
        <Row title="Settings" subtitle="App, privacy and account" icon="settings" iconColor={colors.textMuted} onPress={() => (router.push as any)('/settings')} />
        <Row title="Subscription" subtitle="Free plan · see Premium" icon="credit-card" iconColor={categoryColors.rewards} onPress={() => (router.push as any)('/subscription')} />
        <Row title="Help & Support" subtitle="Guides and contact" icon="help-circle" iconColor={colors.success} onPress={() => (router.push as any)('/settings')} />
      </Card>

      {APP_VARIANT === 'parent' ? (
        // The Haven app: there is no child app to reach, so preview it here.
        <DemoSideRow icon="smartphone" title="Demo: preview the child app on this device" detail={previewNote} onPress={openChildSide} />
      ) : APP_VARIANT === 'child' ? (
        // The Haven Kids app, previewing the parent side: this is the way back.
        <DemoSideRow
          icon="corner-up-left"
          title="Demo: back to the child app"
          detail="You are previewing the parent app inside Haven Kids."
          onPress={openChildSide}
        />
      ) : (
        <Card onPress={switchMode} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
          <Feather name="repeat" size={16} color={colors.primary} />
          <Text variant="smallStrong" color={colors.primary}>
            Switch mode
          </Text>
        </Card>
      )}
    </Screen>
  );
}

/**
 * Takes the place of "Switch mode" in a parent-only or child-only build: a card-sized row that
 * opens the other side on this device, with a line saying why it is there. The title may wrap.
 * (The child side's Me tab has the same row.)
 */
function DemoSideRow({ icon, title, detail, onPress }: { icon: keyof typeof Feather.glyphMap; title: string; detail: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => [styles.demo, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.demoPressed]}>
      <IconBadge name={icon} color={colors.primary} size={40} />
      <View style={styles.demoText}>
        <Text variant="title">{title}</Text>
        <Text variant="small" tone="muted" style={styles.demoDetail}>
          {detail}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  premium: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, marginBottom: spacing.xl, ...shadow(2) },
  premiumText: { flex: 1 },
  // Tall enough to tap comfortably; the white pill sits on the gradient in both colour modes.
  premiumBtn: { backgroundColor: '#FFFFFF', minHeight: 40, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.pill },
  premiumBtnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },

  demo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, ...shadow(1) },
  demoPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  demoText: { flex: 1 },
  demoDetail: { marginTop: 2 },
});
