import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Avatar, Card, IconBadge, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { APP_VARIANT, NO_SERVER_NOTE, SIDE_HOME } from '@/config/variant';
import { useStore, fmtDuration } from '@/state/store';
import { radius, shadow, spacing, useTheme } from '@/theme';

const HELP = [
  {
    q: 'How do I get more time?',
    a: 'Open Requests and pick how many minutes you need. Your family sees it and decides.',
  },
  {
    q: 'Why is an app blocked?',
    a: 'Your family blocked it for now. You can ask them to unlock it from Requests.',
  },
  {
    q: 'What can my family see?',
    a: 'Only what is listed under "What\'s shared with my family". Nothing runs in secret.',
  },
] as const;

export default function ChildProfileTab() {
  const { colors } = useTheme();
  const { childSelf, setRole, sosActive } = useStore();
  const [helpOpen, setHelpOpen] = useState(false);

  const left = Math.max(0, childSelf.limitMin - childSelf.usedMin);

  const switchMode = () => {
    setRole(null);
    (router.replace as any)('/');
  };

  // Parent-only and child-only builds have no chooser to switch through. The parent side is still
  // in the build, so one phone can show the whole loop: it opens as a clearly labelled demo.
  const openParentSide = () => {
    setRole('parent');
    (router.replace as any)(SIDE_HOME.parent);
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Avatar name={childSelf.name} size={92} ring />
        <Text variant="h1" style={styles.name}>
          {childSelf.name.split(' ')[0]}
        </Text>
        <Text variant="small" tone="muted">
          {childSelf.deviceName}
        </Text>
        {childSelf.bedtime && (
          <View style={[styles.paused, { backgroundColor: colors.primarySoft }]}>
            <Feather name="pause" size={13} color={colors.primary} />
            <Text variant="smallStrong" color={colors.primary}>
              Device paused
            </Text>
          </View>
        )}
      </View>

      <SectionLabel>Today</SectionLabel>
      <Card style={styles.today}>
        <View style={styles.stat}>
          <Text variant="h2" color={colors.primary}>
            {fmtDuration(childSelf.usedMin)}
          </Text>
          <Text variant="small" tone="muted">
            Used
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text variant="h2" color={colors.success}>
            {fmtDuration(left)}
          </Text>
          <Text variant="small" tone="muted">
            Left
          </Text>
        </View>
      </Card>

      <SectionLabel>My family</SectionLabel>
      <Card padded={false} style={styles.group}>
        <Row
          title="Message my family"
          subtitle="Chat with Mom & Dad"
          icon="message-circle"
          iconColor={colors.primary}
          onPress={() => (router.push as any)('/messages')}
        />
        <Row
          title="Emergency SOS"
          subtitle={sosActive ? 'SOS is on. Open it to say you are safe.' : 'Reach your family fast'}
          icon="alert-circle"
          iconColor={colors.danger}
          badge={sosActive ? 'ON' : undefined}
          badgeColor={colors.danger}
          onPress={() => (router.push as any)('/sos')}
        />
      </Card>

      <SectionLabel>About Haven</SectionLabel>
      <Card padded={false} style={styles.group}>
        <Row
          title="What's shared with my family"
          subtitle="See everything Haven shares"
          icon="eye"
          iconColor={colors.success}
          onPress={() => (router.push as any)('/transparency')}
        />
        <Row
          title="Help"
          subtitle="Quick answers"
          icon="help-circle"
          iconColor={colors.info}
          chevron={false}
          right={<Feather name={helpOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textFaint} />}
          onPress={() => setHelpOpen((open) => !open)}
        />
        {helpOpen && (
          <View style={[styles.help, { borderTopColor: colors.hairline }]}>
            {HELP.map((item) => (
              <View key={item.q}>
                <Text variant="smallStrong">{item.q}</Text>
                <Text variant="small" tone="muted" style={styles.helpAnswer}>
                  {item.a}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {APP_VARIANT === 'child' ? (
        // The Haven Kids app: there is no parent app to reach, so preview it here.
        <DemoSideRow icon="users" title="Demo: preview the parent app on this device" detail={NO_SERVER_NOTE} onPress={openParentSide} />
      ) : APP_VARIANT === 'parent' ? (
        // The Haven app, previewing the child side: this is the way back.
        <DemoSideRow
          icon="corner-up-left"
          title="Demo: back to the parent app"
          detail="You are previewing the child app inside Haven. This demo build has no server linking two phones."
          onPress={openParentSide}
        />
      ) : (
        <Card onPress={switchMode} style={styles.switch}>
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
 * (The parent side's Family tab has the same row.)
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
  top: { alignItems: 'center', paddingTop: spacing.lg, marginBottom: spacing.xl },
  name: { marginTop: spacing.md },
  paused: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },

  today: { flexDirection: 'row', marginBottom: spacing.xl },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1 },

  group: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, marginBottom: spacing.xl },
  help: {
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  helpAnswer: { marginTop: 2 },

  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },

  demo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, ...shadow(1) },
  demoPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  demoText: { flex: 1 },
  demoDetail: { marginTop: 2 },
});
