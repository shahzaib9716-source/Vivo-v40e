import { DeviceSharing } from '@/components/DeviceSharing';
import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Avatar, Card, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { linkSummary } from '@/components/LinkParts';
import { useLink } from '@/sync/link';
import { useStore, fmtDuration } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';

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
  const { childSelf, setRole, sosMine: sosActive, live } = useStore();
  const link = useLink();
  const [helpOpen, setHelpOpen] = useState(false);

  const left = Math.max(0, childSelf.limitMin - childSelf.usedMin);

  const switchMode = () => {
    setRole(null);
    (router.replace as any)('/');
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
              {live ? 'Screen-time break' : 'Device paused'}
            </Text>
          </View>
        )}
      </View>

      <SectionLabel>{live ? 'My screen time' : 'Today'}</SectionLabel>
      {live ? (
        // In a real family the time used is not measured by this version: only the agreed limit is known.
        <Card style={styles.today}>
          <View style={styles.stat}>
            <Text variant="h2" color={colors.primary}>
              {fmtDuration(childSelf.limitMin)}
            </Text>
            <Text variant="small" tone="muted">
              Agreed for each day
            </Text>
          </View>
        </Card>
      ) : (
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
      )}

       {live && link.role === 'child' && link.familyId && link.childId && link.account && (
        <DeviceSharing key={[link.familyId, link.childId, link.account.uid].join('/')} family={link.familyId} child={link.childId} uid={link.account.uid} />
      )}
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
          title="Family link"
          subtitle={linkSummary(link).title}
          icon="link"
          iconColor={colors.primary}
          badge={link.role ? 'LINKED' : undefined}
          badgeColor={colors.success}
          onPress={() => (router.push as any)('/link-device')}
        />
        <Row
          title="What's shared with my family"
          subtitle="See everything Haven shares"
          icon="eye"
          iconColor={colors.success}
          onPress={() => (router.push as any)('/transparency')}
        />
        <Row
          title="What this version does"
          subtitle="On this phone, and what it leaves out"
          icon="list"
          iconColor={colors.primary}
          onPress={() => (router.push as any)('/about-version')}
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

      {/* Only a device that is not in a family can change sides: it shows sample data either way.
          In a family this phone is a child's phone, and the parent side is closed to it. */}
      {link.role === null ? (
        <Card onPress={switchMode} style={styles.switch}>
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
});

