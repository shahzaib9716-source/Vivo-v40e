import Constants from 'expo-constants';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { InlineNote } from '@/components/InlineNote';
import { InlineConfirm } from '@/components/RuleForm';
import { Avatar, Card, Header, Row, Screen, SectionLabel, Text, Toggle } from '@/components/ui';
import { APP_NAME } from '@/config/variant';
import { useLink } from '@/sync/link';
import { useStore } from '@/state/store';
import { spacing, useTheme } from '@/theme';

/** Rows that have nothing behind them in this build. Tapping one says so right under its group. */
type DemoRow = 'profile' | 'data' | 'help' | 'terms';

const DEMO_NOTES: Record<DemoRow, { title: string; detail: string }> = {
  profile: { title: 'Demo: profile is fixed', detail: 'The parent account cannot be edited in this build.' },
  data: { title: 'Demo: nothing to export', detail: 'Sample data is saved on this device only. Nothing was downloaded or deleted.' },
  help: { title: 'Demo: no help center yet', detail: 'There is no support site behind this build. Nothing was opened.' },
  terms: { title: 'Demo: no documents yet', detail: 'Terms and a privacy policy are not part of this build. Nothing was opened.' },
};

const LIVE_DATA_NOTE = {
  title: 'Export and deletion are not in this version',
  detail:
    'Your family’s data is kept in your family’s Firebase project and on its linked phones. Nothing was downloaded or deleted. docs/SECURITY.md (“Starting over”) explains how to delete it in the Firebase console.',
};

const EDIT_HIT_SLOP = { top: 14, bottom: 14, left: 12, right: 12 };

export default function Settings() {
  const { colors } = useTheme();
  const { setRole, resetOnboarding, resetDemoData, live } = useStore();
  const link = useLink();
  // Also while the link is still being worked out at start: a reset then would be taken for edits.
  const linked = link.role !== null || link.status === 'connecting';

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
  /** "Reset demo data": idle, asking to confirm, or done (the note stays until the screen closes). */
  const [reset, setReset] = useState<'idle' | 'confirm' | 'done'>('idle');
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutProblem, setSignOutProblem] = useState<string | null>(null);
  const account = link.account && !link.account.anonymous ? link.account : null;

  /** Back to the start screen, where the side of the app is chosen again. */
  const toChooser = () => {
    setRole(null);
    leaveTo('/');
  };

  const signOut = () => {
    setConfirmSignOut(false);
    setSignOutProblem(null);
    // The device goes back to sample data; the family stays as it is on the server.
    link
      .signOut()
      .then(toChooser)
      .catch((e: unknown) => setSignOutProblem(e instanceof Error && e.message ? e.message : 'Signing out did not work. Please try again.'));
  };

  // "Data & export" and "Reset demo data" share a group, and only one of them has a message
  // under it at a time.
  const showDataNote = () => {
    setDemo('data');
    setReset('idle');
  };

  const confirmReset = () => {
    resetDemoData();
    setDemo((row) => (row === 'data' ? null : row));
    setReset('done');
  };

  const note = (rows: DemoRow[]) => {
    if (demo == null || !rows.includes(demo)) return null;
    // In a real family the data is the family's own, kept in its Firebase project, not sample data.
    const text = demo === 'data' && live ? LIVE_DATA_NOTE : DEMO_NOTES[demo];
    return <InlineNote tone="neutral" title={text.title} detail={text.detail} style={{ marginTop: -spacing.sm, marginBottom: spacing.xl }} />;
  };

  return (
    <Screen>
      <Header back title="Settings" />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
        <Avatar name={account?.email ?? 'Jordan Carter'} size={52} />
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {account?.email ?? 'Jordan Carter'}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {account ? `Parent · ${link.familyName ?? 'no family yet'}` : 'Parent · sample profile'}
          </Text>
        </View>
        <Pressable
          onPress={() => (account ? (router.push as any)('/account') : setDemo('profile'))}
          accessibilityRole="button"
          accessibilityLabel={account ? 'Open parent account' : 'Edit profile'}
          hitSlop={EDIT_HIT_SLOP}
          style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text variant="smallStrong" color={colors.primary}>
            {account ? 'Account' : 'Edit'}
          </Text>
        </Pressable>
      </Card>
      {note(['profile'])}

      <SectionLabel>Notifications</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {live ? (
          // A real family: these switches would promise what this version does not do.
          <Row
            title="Not in this version"
            subtitle="Alerts show while Haven is open. No notifications to a closed app, no email digest."
            icon="bell-off"
            iconColor={colors.textMuted}
            onPress={() => (router.push as any)('/about-version')}
          />
        ) : (
          <>
            <Row title="Push notifications" icon="bell" iconColor={colors.accent} chevron={false} right={<Toggle value={push} onChange={setPush} />} />
            <Row title="Weekly email digest" icon="mail" iconColor={colors.info} chevron={false} right={<Toggle value={emailDigest} onChange={setEmailDigest} />} />
          </>
        )}
      </Card>

      <SectionLabel>Privacy & security</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        {live ? null : (
          <Row title="Require Face ID to open" icon="lock" iconColor={colors.primary} chevron={false} right={<Toggle value={biometric} onChange={setBiometric} />} />
        )}
        <Row title="Privacy & transparency" subtitle="What your child sees about sharing" icon="eye" iconColor={colors.success} onPress={() => (router.push as any)('/transparency?as=parent')} />
        <Row title="Data & export" subtitle="Download or delete your data" icon="database" iconColor={colors.textMuted} onPress={showDataNote} />
        {/* A device in a family shows the family's data, so there is no sample data to put back. */}
        {!linked && (
          <Row
            title="Reset demo data"
            subtitle="Restore the starting sample data"
            icon="rotate-ccw"
            iconColor={colors.textMuted}
            chevron={false}
            onPress={reset === 'confirm' ? undefined : () => setReset('confirm')}
          />
        )}
        {!linked && reset === 'confirm' && (
          <View style={{ paddingBottom: spacing.lg }}>
            <InlineConfirm
              title="Reset demo data?"
              detail="Limits, requests, alerts, places, schedules, rewards and messages go back to how they started. The saved copy on this device is cleared too."
              confirmLabel="Reset"
              onCancel={() => setReset('idle')}
              onConfirm={confirmReset}
            />
          </View>
        )}
      </Card>
      {note(['data'])}
      {reset === 'done' && (
        <InlineNote
          tone="success"
          title="Demo data reset"
          detail="Limits, requests, alerts, places, schedules, rewards and messages are back to how they started."
          style={{ marginTop: -spacing.sm, marginBottom: spacing.xl }}
        />
      )}

      <SectionLabel>About</SectionLabel>
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
        <Row title="Help center" icon="help-circle" iconColor={colors.info} onPress={() => setDemo('help')} />
        <Row title="Terms & privacy policy" icon="file-text" iconColor={colors.textMuted} onPress={() => setDemo('terms')} />
        <Row title="Replay introduction" subtitle="See the welcome tour again" icon="play-circle" iconColor={colors.primary} onPress={replayIntro} />
        <Row title="What this version does" subtitle="On this phone, and what it leaves out" icon="list" iconColor={colors.success} onPress={() => (router.push as any)('/about-version')} />
        <Row title="Version" subtitle={`${APP_NAME} ${Constants.expoConfig?.version ?? ''}`.trim()} icon="info" iconColor={colors.textMuted} chevron={false} />
      </Card>
      {note(['help', 'terms'])}

      {account ? (
        confirmSignOut ? (
          <InlineConfirm
            title="Sign out on this device?"
            detail="This device goes back to sample data. Your family stays as it is: signing in again, here or on another phone, brings it back."
            confirmLabel="Sign out"
            onCancel={() => setConfirmSignOut(false)}
            onConfirm={signOut}
          />
        ) : (
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            <Row title="Sign out" subtitle={account.email ?? undefined} icon="log-out" danger chevron={false} onPress={() => setConfirmSignOut(true)} />
          </Card>
        )
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <Row
            title={link.configured ? 'Sign in or set up your family' : 'Back to the start screen'}
            icon={link.configured ? 'user' : 'log-out'}
            onPress={link.configured ? () => (router.push as any)('/account') : toChooser}
          />
          {link.configured ? <Row title="Switch mode" subtitle="Choose parent or child again" icon="repeat" chevron={false} onPress={toChooser} /> : null}
        </Card>
      )}
      {signOutProblem ? <InlineNote tone="neutral" icon="alert-circle" title="That didn't work" detail={signOutProblem} style={{ marginTop: spacing.md }} /> : null}

      <Text variant="tiny" tone="faint" center style={{ marginTop: spacing.lg }}>
        {live ? 'Protect this phone with its own screen lock: anyone holding it unlocked can use Haven as you.' : 'The switches on this screen are examples: they are not saved and change nothing on the phone.'}
      </Text>
    </Screen>
  );
}
