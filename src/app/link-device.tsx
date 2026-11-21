import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { InlineNote } from '@/components/InlineNote';
import { CheckCode, DeviceList, LinkFootnote, LinkStatusCard, Step, useLinkAction } from '@/components/LinkParts';
import { InlineConfirm, TextField } from '@/components/RuleForm';
import { Button, Card, Header, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { BUILD_SIDE, SIDE_HOME } from '@/config/variant';
import { useStore } from '@/state/store';
import { useLink } from '@/sync/link';
import { formatPairingCode, normalisePairingCode, PAIRING_CODE_LENGTH, type LinkRole } from '@/sync/types';
import { spacing, useTheme } from '@/theme';

/**
 * Joining a family with a one-time code from a parent's phone.
 *
 * A child's phone needs nothing else: entering the code signs it in without an email address, and
 * it is in the family once a parent has compared the 4-character check and approved it. A second
 * parent uses the same screen, signed in to their own confirmed account. Which of the two a phone
 * becomes is decided by the code, on the server, not by this screen.
 */
export default function LinkDevice() {
  const { colors } = useTheme();
  const link = useLink();
  const { role, children } = useStore();
  const act = useLinkAction();
  const [input, setInput] = useState('');
  const [justLinked, setJustLinked] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Until the server has given this device a role, the wording follows the side that was chosen here.
  const joinAs: LinkRole = link.role ?? BUILD_SIDE ?? (role === 'parent' ? 'parent' : 'child');
  const code = normalisePairingCode(input);
  const complete = code.length === PAIRING_CODE_LENGTH;
  const joined = link.role !== null;
  const account = link.account && !link.account.anonymous ? link.account : null;
  // A code for another parent is refused unless a confirmed parent account is signed in.
  const needsAccount = joinAs === 'parent' && !joined && !link.pendingJoin && (account === null || !account.emailVerified);
  const isOwner = link.members.some((m) => m.isThisAccount && m.isOwner);
  const childName = (childId: string) => children.find((c) => c.id === childId)?.name.split(' ')[0] ?? null;

  // Resolves once the code has been claimed. The device is linked when a parent approves it.
  const join = () => {
    if (!complete) return;
    act.run('join', () => link.joinWithCode(code), () => {
      setInput('');
      setJustLinked(true);
    });
  };

  const cancelJoin = () => {
    setJustLinked(false);
    act.run('cancel', () => link.cancelJoin());
  };

  const unlink = () => {
    setConfirmUnlink(false);
    setJustLinked(false);
    act.run('unlink', () => link.unlink());
  };

  const done = () => {
    if (router.canDismiss()) router.dismissAll();
    (router.replace as any)(SIDE_HOME[joinAs]);
  };

  const problem = act.problem ? <InlineNote tone="neutral" icon="alert-circle" title="That didn't work" detail={act.problem} style={styles.gapTop} /> : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Header back title="Family link" subtitle={joinAs === 'child' ? 'Connect this phone to your family' : 'Join your family from this phone'} />

        {/* While waiting, the card below says the same thing with the check: one is enough. */}
        {link.pendingJoin && !joined ? null : <LinkStatusCard link={link} />}

        {!link.configured ? (
          <InlineNote tone="neutral" title="What this means" detail="This copy of Haven was built without a server, so phones cannot be linked. It shows sample data only." />
        ) : joined ? (
          <>
            {justLinked ? (
              <InlineNote
                tone="success"
                icon="check-circle"
                title="You're linked"
                detail={
                  joinAs === 'child'
                    ? 'This phone now shows your family’s rules. Requests, check-ins, messages and SOS reach your parent’s phone.'
                    : 'This phone now shows your family’s data and stays in step with the others.'
                }
                style={styles.gapBottom}
              />
            ) : null}
            {(justLinked || BUILD_SIDE) ? <Button label="Done" icon="check" onPress={done} style={styles.gapBottom} /> : null}

            <SectionLabel>In this family</SectionLabel>
            <DeviceList devices={link.members} childName={childName} />

            {joinAs === 'child' ? (
              <Card padded={false} style={styles.group}>
                <Row
                  title="What's shared with my family"
                  subtitle="The link shares exactly this, nothing more"
                  icon="eye"
                  iconColor={colors.success}
                  onPress={() => (router.push as any)('/transparency')}
                />
              </Card>
            ) : null}

            {isOwner ? (
              <LinkFootnote>You created this family, so this account stays in it. To stop using it on this phone, sign out under “Parent account”.</LinkFootnote>
            ) : confirmUnlink ? (
              <InlineConfirm
                title="Unlink this phone?"
                detail={
                  joinAs === 'child'
                    ? 'This phone leaves the family and goes back to sample data. Your family sees that it left. To come back it needs a new code.'
                    : 'This account leaves the family and this phone goes back to sample data. To come back it needs a new code.'
                }
                confirmLabel="Unlink"
                onCancel={() => setConfirmUnlink(false)}
                onConfirm={unlink}
              />
            ) : (
              <Button label="Unlink this phone" icon="x-circle" variant="ghost" loading={act.busy === 'unlink'} onPress={() => setConfirmUnlink(true)} />
            )}
            {problem}
          </>
        ) : link.pendingJoin ? (
          <>
            <Card style={styles.waiting}>
              <Text variant="h3" center>
                Waiting for a parent
              </Text>
              <CheckCode check={link.pendingJoin.check} caption="The parent’s phone shows the same 4 characters under “Devices & Pairing”. This phone is linked as soon as they approve." />
            </Card>
            <Button label="Cancel the request" icon="x-circle" variant="ghost" loading={act.busy === 'cancel'} onPress={cancelJoin} />
            {problem}
          </>
        ) : needsAccount ? (
          <>
            <InlineNote
              tone="neutral"
              icon="user"
              title={account ? 'Confirm your email first' : 'Sign in first'}
              detail="A parent joins with their own account: sign in or create one, confirm the email address, then enter the code from the other parent."
              style={styles.gapBottom}
            />
            <Button label={account ? 'Open my account' : 'Sign in or create an account'} icon="user" onPress={() => (router.push as any)('/account')} />
          </>
        ) : (
          <>
            <SectionLabel>Enter the code</SectionLabel>
            <Card style={styles.entry}>
              <TextField
                value={formatPairingCode(input)}
                onChangeText={(text) => {
                  setInput(normalisePairingCode(text));
                  act.clearProblem();
                }}
                placeholder="XXXX-XXXX"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                maxLength={PAIRING_CODE_LENGTH + 1}
                returnKeyType="done"
                onSubmitEditing={join}
                invalid={act.problem !== null}
                accessibilityLabel="Pairing code"
                style={styles.input}
              />
              <Text variant="small" tone="muted" center>
                {PAIRING_CODE_LENGTH} letters and numbers from the parent’s phone
              </Text>
              <Button label={joinAs === 'child' ? 'Link this phone' : 'Join the family'} icon="link" loading={act.busy === 'join'} disabled={!complete} onPress={join} full />
            </Card>
            {act.problem ? <InlineNote tone="neutral" icon="alert-circle" title="That didn't work" detail={act.problem} style={styles.gapBottom} /> : null}

            <SectionLabel>Where to find the code</SectionLabel>
            <Card padded={false} style={styles.group}>
              <Step n={1} text="On the parent's phone, open Haven" />
              <Step n={2} text="Family tab, then “Devices & Pairing”" />
              <Step n={3} text={joinAs === 'child' ? 'Tap “A child’s phone” and read the code out' : 'Tap “Another parent” and read the code out'} last />
            </Card>

            <LinkFootnote>
              {joinAs === 'child'
                ? 'Linking replaces the sample data on this phone with your family’s. A parent has to approve this phone before anything is shared, and “What’s shared” lists exactly what that is.'
                : 'Linking replaces the sample data on this phone with your family’s. The other parent has to approve you before anything is shared.'}
            </LinkFootnote>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entry: { gap: spacing.md, marginBottom: spacing.lg },
  input: { textAlign: 'center', fontSize: 24, letterSpacing: 4, height: 60 },
  waiting: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl, marginBottom: spacing.lg },
  group: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  gapBottom: { marginBottom: spacing.lg },
  gapTop: { marginTop: spacing.md },
});
