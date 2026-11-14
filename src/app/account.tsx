import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { InlineNote } from '@/components/InlineNote';
import { LinkFootnote, LinkStatusCard, useLinkAction } from '@/components/LinkParts';
import { Field, InlineConfirm, TextField } from '@/components/RuleForm';
import { Button, Card, Header, IconBadge, Row, Screen, SectionLabel, SegmentedControl, Text } from '@/components/ui';
import { SIDE_HOME } from '@/config/variant';
import { useLink } from '@/sync/link';
import { spacing, useTheme } from '@/theme';

/**
 * The parent's account: sign in or create it, confirm the email address, create the family.
 *
 * What is shown follows the link layer, not a wizard position, so the screen is right after a
 * restart, on a second phone, or when the email is confirmed in the browser while it is open:
 *
 *   nobody signed in        -> sign in / create account
 *   email not confirmed     -> "confirm your email"
 *   confirmed, no family    -> create the family (or join one with a code from another parent)
 *   in a family as a parent -> the account, and the way out
 *
 * A child's phone never has an account screen: it joins with a code (see /link-device).
 */

type Mode = 'Sign in' | 'Create account';
const MODES: Mode[] = ['Sign in', 'Create account'];
const MIN_PASSWORD = 8;

export default function AccountScreen() {
  const { colors } = useTheme();
  const link = useLink();
  const act = useLinkAction();

  const [mode, setMode] = useState<Mode>('Sign in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [note, setNote] = useState<{ title: string; detail: string } | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

  const account = link.account && !link.account.anonymous ? link.account : null;
  const unconfirmed = account !== null && !account.emailVerified && link.role === null;

  // The email is usually confirmed in a browser. Coming back to the app checks straight away.
  const { refreshAccount } = link;
  useEffect(() => {
    if (!unconfirmed) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAccount().catch(() => {});
    });
    return () => sub.remove();
  }, [unconfirmed, refreshAccount]);

  const stage =
    !link.configured ? 'unconfigured'
    : link.role === 'parent' ? 'ready'
    : link.role === 'child' ? 'child'
    : link.pendingJoin ? 'waiting'
    : account === null ? (link.status === 'connecting' || link.status === 'offline' ? 'starting' : 'sign-in')
    : !account.emailVerified ? 'confirm'
    : link.status === 'needs-family' ? 'family'
    : 'looking';

  const leave = (href: string) => {
    if (router.canDismiss()) router.dismissAll();
    (router.replace as any)(href);
  };

  const cleanEmail = email.trim();
  const emailOk = /^\S+@\S+\.\S+$/.test(cleanEmail);
  const passwordOk = mode === 'Sign in' ? password.length > 0 : password.length >= MIN_PASSWORD;

  const submit = () => {
    if (!emailOk || !passwordOk) return;
    setNote(null);
    act.run('submit', () => (mode === 'Sign in' ? link.signIn(cleanEmail, password) : link.signUp(cleanEmail, password)), () => setPassword(''));
  };

  const forgot = () => {
    if (!emailOk) {
      setNote({ title: 'Enter your email address first', detail: 'Type the address of your account above, then tap “Forgot password” again.' });
      return;
    }
    setNote(null);
    act.run('forgot', () => link.resetPassword(cleanEmail), () =>
      setNote({ title: 'Check your email', detail: `If ${cleanEmail} has a Haven account, a link to choose a new password is on its way.` }),
    );
  };

  const checkConfirmed = () => {
    setNote(null);
    act.run('check', () =>
      link.refreshAccount().then((next) => {
        if (!next?.emailVerified) setNote({ title: 'Not confirmed yet', detail: 'Open the link in the email from Haven, then tap “I’ve confirmed it” again. It can take a minute to arrive; look in the spam folder too.' });
      }),
    );
  };

  const resend = () => {
    setNote(null);
    act.run('resend', () => link.sendVerification(), () => setNote({ title: 'Email sent', detail: `A new confirmation link is on its way to ${account?.email ?? 'your address'}.` }));
  };

  const age = childAge.trim() === '' ? undefined : Number(childAge);
  const ageOk = age === undefined || (Number.isInteger(age) && age >= 0 && age <= 25);
  const familyOk = familyName.trim().length > 0 && childName.trim().length > 0 && ageOk;

  const createFamily = () => {
    if (!familyOk) return;
    setNote(null);
    act.run('create', () => link.createFamily({ familyName: familyName.trim(), childName: childName.trim(), childAge: age }), () => setJustCreated(true));
  };

  const signOut = () => {
    setConfirmSignOut(false);
    setNote(null);
    setJustCreated(false);
    act.run('signout', () => link.signOut());
  };

  const sendReset = () => {
    const address = account?.email;
    if (!address) return;
    setNote(null);
    act.run('reset', () => link.resetPassword(address), () => setNote({ title: 'Check your email', detail: `A link to choose a new password is on its way to ${address}.` }));
  };

  const problem = act.problem ? <InlineNote tone="neutral" icon="alert-circle" title="That didn't work" detail={act.problem} style={styles.gap} /> : null;
  const info = note ? <InlineNote tone="info" title={note.title} detail={note.detail} style={styles.gap} /> : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Header back title="Parent account" subtitle={stage === 'ready' ? (link.familyName ?? 'Your family') : 'Sign in to set up your family'} />

        {stage === 'unconfigured' ? (
          <>
            <LinkStatusCard link={link} />
            <InlineNote tone="neutral" title="What this means" detail="This copy of Haven was built without a server, so there are no accounts. It shows sample data only." />
          </>
        ) : stage === 'starting' ? (
          <Card style={styles.center}>
            <IconBadge name={link.status === 'offline' ? 'wifi-off' : 'loader'} color={link.status === 'offline' ? colors.warning : colors.info} size={48} />
            <Text variant="title" center>
              {link.status === 'offline' ? 'No connection' : 'One moment…'}
            </Text>
            <Text variant="small" tone="muted" center>
              {link.status === 'offline' ? 'Haven needs the internet to sign in. Check the connection; this screen updates by itself.' : 'Checking whether someone is signed in on this device.'}
            </Text>
          </Card>
        ) : stage === 'child' ? (
          <>
            <LinkStatusCard link={link} />
            <InlineNote tone="neutral" title="This is a child’s phone" detail="It was linked with a code and has no parent account. Parent accounts are used on a parent’s phone." />
          </>
        ) : stage === 'waiting' ? (
          <>
            <LinkStatusCard link={link} />
            <Button label="Show the request" icon="clock" onPress={() => (router.push as any)('/link-device')} />
          </>
        ) : stage === 'sign-in' ? (
          <>
            {link.status === 'removed' ? <InlineNote tone="neutral" icon="user-x" title="This device was removed from the family" detail="A parent removed it. Sign in again, or ask for a new code, to come back." style={styles.gap} /> : null}
            <SegmentedControl options={MODES} value={mode} onChange={(next) => { setMode(next as Mode); setNote(null); act.clearProblem(); }} accessibilityLabel="Sign in or create an account" />
            <Card style={styles.form}>
              <Field label="Email">
                <TextField
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  accessibilityLabel="Email"
                />
              </Field>
              <Field label="Password" hint={mode === 'Create account' ? `At least ${MIN_PASSWORD} characters. Use one you do not use anywhere else.` : undefined}>
                <View style={styles.passwordRow}>
                  <TextField
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={mode === 'Sign in' ? 'current-password' : 'new-password'}
                    textContentType={mode === 'Sign in' ? 'password' : 'newPassword'}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    accessibilityLabel="Password"
                    style={styles.flex}
                  />
                  <Pressable
                    onPress={() => setShowPassword((shown) => !shown)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    style={styles.eye}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              </Field>
              <Button
                label={mode === 'Sign in' ? 'Sign in' : 'Create account'}
                icon={mode === 'Sign in' ? 'log-in' : 'user-plus'}
                loading={act.busy === 'submit'}
                disabled={!emailOk || !passwordOk || (act.busy !== null && act.busy !== 'submit')}
                onPress={submit}
                full
              />
              {mode === 'Sign in' ? <Button label="Forgot password" variant="ghost" size="sm" loading={act.busy === 'forgot'} onPress={forgot} /> : null}
            </Card>
            {problem}
            {info}
            <LinkFootnote>
              {mode === 'Sign in'
                ? 'Signing in on a new phone brings your family with it: the same children, rules and messages, on Android or iPhone.'
                : 'One account per parent. You will get an email with a link to confirm the address before the family can be created.'}
            </LinkFootnote>
          </>
        ) : stage === 'confirm' ? (
          <>
            <Card style={styles.center}>
              <IconBadge name="mail" color={colors.primary} size={56} />
              <Text variant="h3" center>
                Confirm your email
              </Text>
              <Text variant="small" tone="muted" center>
                We sent a link to {account?.email}. Open it, then come back here.
              </Text>
              <Button label="I’ve confirmed it" icon="check" loading={act.busy === 'check'} disabled={act.busy !== null && act.busy !== 'check'} onPress={checkConfirmed} full />
              <Button label="Send the email again" variant="secondary" loading={act.busy === 'resend'} disabled={act.busy !== null && act.busy !== 'resend'} onPress={resend} full />
            </Card>
            {problem}
            {info}
            <Button label="Use a different account" icon="log-out" variant="ghost" loading={act.busy === 'signout'} onPress={signOut} style={styles.gap} />
          </>
        ) : stage === 'family' ? (
          <>
            <InlineNote tone="success" icon="check-circle" title="You’re signed in" detail={`${account?.email} is confirmed. One more step: your family.`} style={styles.gapBottom} />
            <SectionLabel>Create your family</SectionLabel>
            <Card style={styles.form}>
              <Field label="Family name">
                <TextField value={familyName} onChangeText={setFamilyName} placeholder="Our family" maxLength={60} autoCapitalize="words" returnKeyType="next" accessibilityLabel="Family name" />
              </Field>
              <Field label="Your child’s first name" hint="You can add more children later, when you link their phones.">
                <TextField value={childName} onChangeText={setChildName} placeholder="First name" maxLength={60} autoCapitalize="words" returnKeyType="next" accessibilityLabel="Child’s first name" />
              </Field>
              <Field label="Age (optional)" error={ageOk ? undefined : 'Enter a whole number from 0 to 25.'}>
                <TextField value={childAge} onChangeText={(text) => setChildAge(text.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="Age" keyboardType="number-pad" maxLength={2} invalid={!ageOk} accessibilityLabel="Child’s age" />
              </Field>
              <Button label="Create family" icon="home" loading={act.busy === 'create'} disabled={!familyOk || (act.busy !== null && act.busy !== 'create')} onPress={createFamily} full />
            </Card>
            {problem}
            <SectionLabel style={styles.sectionGap}>Already have a family?</SectionLabel>
            <Card padded={false} style={styles.group}>
              <Row title="Join with a code from the other parent" subtitle="They create it under “Devices & Pairing”" icon="key" iconColor={colors.info} onPress={() => (router.push as any)('/link-device')} />
            </Card>
            <Button label="Use a different account" icon="log-out" variant="ghost" loading={act.busy === 'signout'} onPress={signOut} />
          </>
        ) : stage === 'looking' ? (
          <>
            <LinkStatusCard link={link} />
            {link.status === 'offline' ? (
              <Button label="Try again" icon="refresh-cw" loading={act.busy === 'check'} onPress={() => act.run('check', () => link.refreshAccount())} />
            ) : null}
            {problem}
            <Button label="Use a different account" icon="log-out" variant="ghost" loading={act.busy === 'signout'} onPress={signOut} style={styles.gap} />
          </>
        ) : (
          <>
            {justCreated ? (
              <InlineNote tone="success" icon="check-circle" title="Your family is ready" detail="Next, link your child’s phone: create a code here and enter it in Haven on their phone." style={styles.gapBottom} />
            ) : null}
            <Card style={styles.accountCard}>
              <IconBadge name="user" color={colors.primary} size={48} />
              <View style={styles.flex}>
                <Text variant="title" numberOfLines={1}>
                  {account?.email ?? 'Parent'}
                </Text>
                <Text variant="small" tone="muted">
                  Parent · {link.familyName ?? 'Your family'}
                </Text>
              </View>
            </Card>
            <LinkStatusCard link={link} />

            {justCreated ? <Button label="Link your child’s phone" icon="smartphone" onPress={() => (router.push as any)('/pairing')} style={styles.gapBottom} /> : null}

            <Card padded={false} style={styles.group}>
              <Row title="Devices & Pairing" subtitle="Link a phone, see who is in the family" icon="smartphone" iconColor={colors.info} onPress={() => (router.push as any)('/pairing')} />
              {account ? <Row title="Change password" subtitle="Sends a link to your email address" icon="lock" iconColor={colors.primary} chevron={false} onPress={sendReset} /> : null}
            </Card>
            {problem}
            {info}

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
                <Button label="Sign out on this device" icon="log-out" variant="ghost" loading={act.busy === 'signout'} onPress={() => setConfirmSignOut(true)} />
              )
            ) : null}
            {justCreated ? <Button label="Go to the dashboard" variant="secondary" onPress={() => leave(SIDE_HOME.parent)} style={styles.gap} /> : null}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl, marginBottom: spacing.lg },
  form: { gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.lg },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  group: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  gap: { marginTop: spacing.md },
  gapBottom: { marginBottom: spacing.lg },
  sectionGap: { marginTop: spacing.lg },
});
