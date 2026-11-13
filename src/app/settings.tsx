import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { InlineNote } from '@/components/InlineNote';
import { Avatar, Card, Header, Row, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { useStore } from '@/state/store';
import { spacing, useTheme } from '@/theme';

/** Rows that have nothing behind them in this build. Tapping one says so right under its group. */
type DemoRow = 'profile' | 'data' | 'help' | 'terms';

const DEMO_NOTES: Record<DemoRow, { title: string; detail: string }> = {
  profile: { title: 'Demo: profile is fixed', detail: 'The parent account cannot be edited in this build.' },
  data: { title: 'Demo: nothing to export', detail: 'This build keeps sample data in memory only. Nothing was downloaded or deleted.' },
  help: { title: 'Demo: no help center yet', detail: 'There is no support site behind this build. Nothing was opened.' },
  terms: { title: 'Demo: no documents yet', detail: 'Terms and a privacy policy are not part of this build. Nothing was opened.' },
};

const EDIT_HIT_SLOP = { top: 14, bottom: 14, left: 12, right: 12 };

export default function Settings() {
  const { colors } = useTheme();
  const { setRole, resetOnboarding } = useStore();

  /** Pops back to the tabs first, so the replace swaps out the whole parent app, not just this screen. */
  const leaveTo = (href: string) => {
    if (router.canDismiss()) router.dismissAll();
    (router.replace as any)(href);
  };

  const replayIntro = () => {
    resetOnboarding();
    setRole(null);
    leaveTo('/onboarding');
  };
  const [push, setPush] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [biometric, setBiometric] = useState(true);
  const [demo, setDemo] = useState<DemoRow | null>(null);

  const signOut = () => {
    setRole(null);
    leaveTo('/');
  };

  const note = (rows: DemoRow[]) =>
    demo != null && rows.includes(demo) ? (
      <InlineNote tone="neutral" title={DEMO_NOTES[demo].title} detail={DEMO_NOTES[demo].detail} style={{ marginTop: -spacing.sm, marginBottom: spacing.xl }} />
    ) : null;

  return (
    <Screen>
      <Header back title="Settings" />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
        <Avatar name="Jordan Carter" size={52} />
        <View style={{ flex: 1 }}>
          <Text variant="title">Jordan Carter</Text>
          <Text variant="small" tone="muted">
            Parent · Free plan
          </Text>
        </View>
        <Pressable
          onPress={() => setDemo('profile')}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          hitSlop={EDIT_HIT_SLOP}
          style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text variant="smallStrong" color={colors.primary}>
            Edit
          </Text>
        </Pressable>
      </Card>
      {note(['profile'])}

      <SectionLabel>Notifications</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Push notifications" icon="bell" iconColor={colors.accent} chevron={false} right={<Toggle value={push} onChange={setPush} />} />
        <Row title="Weekly email digest" icon="mail" iconColor={colors.info} chevron={false} right={<Toggle value={emailDigest} onChange={setEmailDigest} />} />
      </Card>

      <SectionLabel>Privacy & security</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Require Face ID to open" icon="lock" iconColor={colors.primary} chevron={false} right={<Toggle value={biometric} onChange={setBiometric} />} />
        <Row title="Privacy & transparency" subtitle="What your child sees about sharing" icon="eye" iconColor={colors.success} onPress={() => (router.push as any)('/transparency?as=parent')} />
        <Row title="Data & export" subtitle="Download or delete your data" icon="database" iconColor={colors.textMuted} onPress={() => setDemo('data')} />
      </Card>
      {note(['data'])}

      <SectionLabel>About</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Help center" icon="help-circle" iconColor={colors.info} onPress={() => setDemo('help')} />
        <Row title="Terms & privacy policy" icon="file-text" iconColor={colors.textMuted} onPress={() => setDemo('terms')} />
        <Row title="Replay introduction" subtitle="See the welcome tour again" icon="play-circle" iconColor={colors.primary} onPress={replayIntro} />
        <Row title="Version" subtitle="Haven 1.0.0 (demo)" icon="info" iconColor={colors.textMuted} chevron={false} />
      </Card>
      {note(['help', 'terms'])}

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <Row title="Sign out" icon="log-out" danger chevron={false} onPress={signOut} />
      </Card>

      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.lg }}>
        Demo build: the switches on this screen reset when you close the app.
      </Text>
    </Screen>
  );
}
