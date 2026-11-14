import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { InlineNote } from '@/components/InlineNote';
import { DeviceList, LinkFootnote, LinkStatusCard, Step } from '@/components/LinkParts';
import { InlineConfirm } from '@/components/RuleForm';
import { Button, Card, Header, Screen, SectionLabel, Text } from '@/components/ui';
import { useLink } from '@/sync/link';
import { formatPairingCode } from '@/sync/types';
import { radius, spacing, useTheme } from '@/theme';

/** "14:05" */
function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The parent's side of linking: create a code, see who is linked, unlink. */
export default function Pairing() {
  const { colors } = useTheme();
  const link = useLink();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const code = link.pairingCode;

  // Count the code down while it is on screen.
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [code]);

  const makeCode = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await link.createPairingCode();
      setNow(Date.now());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setConfirmUnlink(false);
    await link.unlink();
  };

  const joined = link.role !== null;
  const canCreate = link.configured && link.status !== 'connecting';

  return (
    <Screen>
      <Header back title="Devices & Pairing" subtitle="Link your child's phone to yours" />

      <LinkStatusCard link={link} />

      {!link.configured ? (
        <InlineNote
          tone="neutral"
          title="What this means"
          detail="You can still show both sides on one phone with the “Demo: preview” row on the Family tab. To link two phones, build the app with a Firebase project (see docs/BACKEND.md)."
        />
      ) : (
        <>
          {code ? (
            <Card style={styles.codeCard}>
              <Text variant="small" tone="muted">
                Enter this code in Haven Kids
              </Text>
              <View
                accessible
                accessibilityLabel={`Pairing code: ${code.code.split('').join(' ')}`}
                style={[styles.code, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text variant="h1" selectable style={styles.codeText}>
                  {formatPairingCode(code.code)}
                </Text>
              </View>
              <Text variant="small" tone="muted">
                Works once · expires in {clock(code.expiresAt - now)}
              </Text>
            </Card>
          ) : null}

          <Button
            label={code ? 'Create a new code' : joined ? 'Add another device' : 'Create a link code'}
            icon={code ? 'refresh-cw' : 'plus'}
            variant={code ? 'secondary' : 'primary'}
            loading={busy}
            disabled={!canCreate}
            onPress={makeCode}
          />
          {problem ? <InlineNote tone="neutral" icon="alert-circle" title="That didn't work" detail={problem} style={styles.gapTop} /> : null}

          <SectionLabel style={styles.sectionGap}>On your child's phone</SectionLabel>
          <Card padded={false} style={styles.steps}>
            <Step n={1} text="Install and open Haven Kids" />
            <Step n={2} text="Go to the Me tab and tap “Family link”" />
            <Step n={3} text="Enter the code shown here" last />
          </Card>

          {joined ? (
            <>
              <SectionLabel>Linked devices</SectionLabel>
              <DeviceList devices={link.devices} />

              {confirmUnlink ? (
                <InlineConfirm
                  title="Unlink this device?"
                  detail="It keeps the data it has now, which stops updating. The other devices stay linked."
                  confirmLabel="Unlink"
                  onCancel={() => setConfirmUnlink(false)}
                  onConfirm={unlink}
                />
              ) : (
                <Button label="Unlink this device" icon="x-circle" variant="ghost" onPress={() => setConfirmUnlink(true)} />
              )}
            </>
          ) : (
            <Button
              label="I have a code from another parent"
              icon="log-in"
              variant="ghost"
              onPress={() => (router.push as any)('/link-device')}
            />
          )}

          <LinkFootnote>
            Linked phones share the family’s data through a server and update while both apps are open. This build does not send
            notifications to a closed app, and it has no accounts: the code is what connects the phones.
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
  gapTop: { marginTop: spacing.md },
  sectionGap: { marginTop: spacing.xl },
  steps: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
});
