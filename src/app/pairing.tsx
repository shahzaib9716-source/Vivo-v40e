import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { InlineNote } from '@/components/InlineNote';
import { CheckCode, DeviceList, LinkFootnote, LinkStatusCard, PLATFORM, Step, useLinkAction } from '@/components/LinkParts';
import { Field, InlineConfirm, TextField } from '@/components/RuleForm';
import { Button, Card, Chip, Header, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { useLink } from '@/sync/link';
import { formatPairingCode, type FamilyMember, type LinkRole } from '@/sync/types';
import { radius, spacing, useTheme } from '@/theme';

/** "14:05" */
function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The choice "a child who has no profile yet" in the child picker. */
const NEW_CHILD = '+new';

/**
 * The parent's side of linking: make a one-time code, check and approve the phone that used it,
 * see who is in the family, remove a phone.
 *
 * Nothing here decides who may do what: the server does (firestore.rules). A code does nothing
 * until a parent approves the phone that used it, and approval is refused for any phone other than
 * the one that claimed the code.
 */
export default function Pairing() {
  const { colors } = useTheme();
  const link = useLink();
  const { children } = useStore();
  const act = useLinkAction();
  const [now, setNow] = useState(() => Date.now());
  /** Which child the claiming phone belongs to: a child id, NEW_CHILD, or null while nothing is picked. */
  const [picked, setPicked] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const offer = link.offer;
  const claim = offer?.claim ?? null;
  const isParent = link.role === 'parent';
  const online = link.status === 'linked';

  // Count the code down while it is on screen.
  useEffect(() => {
    if (!offer) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [offer]);

  // Children that already have a phone are still offered: a child can get a new phone.
  const linkedChildIds = new Set(link.members.filter((m) => m.role === 'child' && m.childId).map((m) => m.childId as string));
  // With one child and no choice made, that child is the suggestion.
  const choice = picked ?? (children.length === 1 ? children[0].id : null);
  const childName = (childId: string) => children.find((c) => c.id === childId)?.name.split(' ')[0] ?? null;

  const makeCode = (role: LinkRole) => {
    setDone(null);
    setPicked(null);
    setNewName('');
    act.run(`code-${role}`, () => link.createPairingCode(role).then(() => setNow(Date.now())));
  };

  const cancelCode = () => act.run('cancel', () => link.cancelPairingCode());

  const approveTarget = (): { childId: string } | { newChildName: string } | null | undefined => {
    if (offer?.role === 'parent') return null;
    if (choice === NEW_CHILD) return newName.trim() ? { newChildName: newName.trim() } : undefined;
    return choice ? { childId: choice } : undefined;
  };
  const target = approveTarget();
  const canApprove = claim !== null && target !== undefined;

  const approve = () => {
    if (!claim || target === undefined) return;
    const who = offer?.role === 'parent' ? 'as a parent' : choice === NEW_CHILD ? `as ${newName.trim()}’s phone` : `as ${childName(choice ?? '') ?? 'your child'}’s phone`;
    const name = claim.name;
    act.run('approve', () => link.approveClaim(target), () => setDone(`“${name}” joined ${who}.`));
  };
  const decline = () => act.run('decline', () => link.declineClaim(), () => setDone('The request was declined. That code no longer works.'));

  const remove = () => {
    const member = removing;
    if (!member) return;
    setRemoving(null);
    setDone(null);
    act.run('remove', () => link.removeMember(member.uid), () => setDone(`“${member.name}” was removed. It has no access to the family any more.`));
  };

  return (
    <Screen>
      <Header back title="Devices & Pairing" subtitle={isParent ? (link.familyName ?? 'Your family') : 'Link your child’s phone to yours'} />

      <LinkStatusCard link={link} />

      {!link.configured ? (
        <InlineNote tone="neutral" title="What this means" detail="This copy of Haven was built without a server, so phones cannot be linked. It shows sample data only." />
      ) : !isParent ? (
        <>
          {link.role === 'child' ? (
            <InlineNote tone="neutral" title="This is a child’s phone" detail="Codes are made on a parent’s phone, under “Devices & Pairing”." />
          ) : (
            <>
              <SectionLabel>Before you can link a phone</SectionLabel>
              <Card padded={false} style={styles.steps}>
                <Step n={1} text="Sign in or create your parent account" />
                <Step n={2} text="Confirm your email address" />
                <Step n={3} text="Create your family, then come back here" last />
              </Card>
              <Button label="Set up your account" icon="user" onPress={() => (router.push as any)('/account')} />
            </>
          )}
        </>
      ) : (
        <>
          {done ? <InlineNote tone="success" icon="check-circle" title="Done" detail={done} style={styles.gapBottom} /> : null}

          {offer ? (
            <Card style={styles.codeCard}>
              <Text variant="small" tone="muted">
                {offer.role === 'child' ? 'Enter this code in Haven on your child’s phone' : 'Give this code to the other parent'}
              </Text>
              <View
                accessible
                accessibilityLabel={`Pairing code: ${offer.code.split('').join(' ')}`}
                style={[styles.code, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text variant="h1" selectable style={styles.codeText}>
                  {formatPairingCode(offer.code)}
                </Text>
              </View>
              <Text variant="small" tone="muted" center>
                {claim ? 'A phone has used this code. Check it below.' : `Works once · expires in ${clock(offer.expiresAt - now)}`}
              </Text>
              {!claim ? <Button label="Cancel this code" variant="ghost" size="sm" loading={act.busy === 'cancel'} onPress={cancelCode} /> : null}
            </Card>
          ) : null}

          {offer && claim ? (
            <Card style={styles.claimCard}>
              <Text variant="title">“{claim.name}” wants to join</Text>
              <Text variant="small" tone="muted">
                {PLATFORM[claim.platform] ?? claim.platform} · {offer.role === 'child' ? 'as a child’s phone' : 'as another parent, with full control'}
              </Text>
              <CheckCode check={claim.check} caption="Approve only if the other phone shows these same 4 characters." />

              {offer.role === 'child' ? (
                <View style={styles.picker}>
                  <Text variant="smallStrong">Whose phone is it?</Text>
                  <View style={styles.chips}>
                    {children.map((child) => (
                      <Chip
                        key={child.id}
                        label={linkedChildIds.has(child.id) ? `${child.name.split(' ')[0]} (new phone)` : child.name.split(' ')[0]}
                        active={choice === child.id}
                        onPress={() => setPicked(child.id)}
                      />
                    ))}
                    <Chip label="Another child" active={choice === NEW_CHILD} onPress={() => setPicked(NEW_CHILD)} />
                  </View>
                  {choice === NEW_CHILD ? (
                    <Field label="Child’s first name">
                      <TextField value={newName} onChangeText={setNewName} placeholder="First name" maxLength={60} autoCapitalize="words" accessibilityLabel="Child’s first name" />
                    </Field>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.claimActions}>
                <Button label="Decline" variant="secondary" loading={act.busy === 'decline'} disabled={act.busy !== null && act.busy !== 'decline'} onPress={decline} style={styles.flex} />
                <Button label="Approve" icon="check" loading={act.busy === 'approve'} disabled={!canApprove || (act.busy !== null && act.busy !== 'approve')} onPress={approve} style={styles.flex} />
              </View>
            </Card>
          ) : null}

          {!claim ? (
            <>
              <SectionLabel>{offer ? 'Make a different code' : 'Add a device'}</SectionLabel>
              <Card padded={false} style={styles.group}>
                <Row
                  title="A child’s phone"
                  subtitle="Requests, check-ins, chat and SOS. Cannot change rules."
                  icon="smartphone"
                  iconColor={colors.accent}
                  onPress={online ? () => makeCode('child') : undefined}
                />
                <Row
                  title="Another parent"
                  subtitle="Their own account, with the same control as you"
                  icon="users"
                  iconColor={colors.primary}
                  onPress={online ? () => makeCode('parent') : undefined}
                />
              </Card>
              {!online ? <InlineNote tone="neutral" icon="wifi-off" title="Needs a connection" detail="A code can be made once this phone can reach the server again." style={styles.gapBottom} /> : null}
            </>
          ) : null}
          {act.problem ? <InlineNote tone="neutral" icon="alert-circle" title="That didn't work" detail={act.problem} style={styles.gapBottom} /> : null}

          {offer && !claim ? (
            <>
              <SectionLabel>{offer.role === 'child' ? 'On your child’s phone' : 'On the other parent’s phone'}</SectionLabel>
              <Card padded={false} style={styles.steps}>
                <Step n={1} text="Install and open Haven" />
                {offer.role === 'child' ? (
                  <>
                    <Step n={2} text="Choose “This is my child’s device”" />
                    <Step n={3} text="Enter the code, then compare the 4 characters" last />
                  </>
                ) : (
                  <>
                    <Step n={2} text="Choose “I’m a parent” and create their own account" />
                    <Step n={3} text="Tap “Join with a parent’s code”" last />
                  </>
                )}
              </Card>
            </>
          ) : null}

          <SectionLabel>In this family</SectionLabel>
          <DeviceList devices={link.members} onRemove={online ? setRemoving : undefined} childName={childName} />
          {removing ? (
            <View style={styles.gapBottom}>
              <InlineConfirm
                title={`Remove “${removing.name}”?`}
                detail={
                  removing.role === 'child'
                    ? 'That phone goes back to sample data and can no longer see or send anything. To link it again it needs a new code.'
                    : 'That account can no longer see or change anything in this family. To come back it needs a new code.'
                }
                confirmLabel="Remove"
                onCancel={() => setRemoving(null)}
                onConfirm={remove}
              />
            </View>
          ) : null}

          <Card padded={false} style={styles.group}>
            <Row title="Parent account" subtitle={link.account?.email ?? 'Sign-in and password'} icon="user" iconColor={colors.primary} onPress={() => (router.push as any)('/account')} />
          </Card>

          <LinkFootnote>
            A code works once and for 15 minutes, and a phone joins only when you approve it here. Linked phones update while the apps are
            open; this version does not send notifications to a closed app.
          </LinkFootnote>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl, marginBottom: spacing.lg },
  code: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  codeText: { letterSpacing: 4 },
  claimCard: { gap: spacing.lg, marginBottom: spacing.lg },
  claimActions: { flexDirection: 'row', gap: spacing.md },
  picker: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  gapBottom: { marginBottom: spacing.lg },
  group: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  steps: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
});
