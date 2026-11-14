import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { InlineNote } from '@/components/InlineNote';
import { DeviceList, LinkFootnote, LinkStatusCard, Step } from '@/components/LinkParts';
import { InlineConfirm, TextField } from '@/components/RuleForm';
import { Button, Card, Header, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { APP_VARIANT } from '@/config/variant';
import { useStore } from '@/state/store';
import { useLink } from '@/sync/link';
import { formatPairingCode, normalisePairingCode, PAIRING_CODE_LENGTH, type LinkRole } from '@/sync/types';
import { spacing, useTheme } from '@/theme';

/** Joining a family with a code from the parent's phone. Mostly the child's screen. */
export default function LinkDevice() {
  const { colors } = useTheme();
  const link = useLink();
  const { role } = useStore();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // The side this device joins as: a single-side app knows; the combined app uses the side in view.
  const joinAs: LinkRole = (APP_VARIANT ?? role ?? 'child') === 'parent' ? 'parent' : 'child';
  const code = normalisePairingCode(input);
  const complete = code.length === PAIRING_CODE_LENGTH;
  const joined = link.role !== null;

  const join = async () => {
    if (busy || !complete) return;
    setBusy(true);
    setProblem(null);
    try {
      await link.joinWithCode(code, joinAs);
      setInput('');
      setJustLinked(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setConfirmUnlink(false);
    setJustLinked(false);
    await link.unlink();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Header back title="Family link" subtitle={joinAs === 'child' ? 'Connect this device to your family' : 'Join your family from this device'} />

        <LinkStatusCard link={link} />

        {!link.configured ? (
          <InlineNote
            tone="neutral"
            title="What this means"
            detail="Both sides can still be shown on one phone with the “Demo: preview” row. Linking two phones needs a build with a server."
          />
        ) : joined ? (
          <>
            {justLinked ? (
              <InlineNote
                tone="success"
                title="You're linked"
                detail={
                  joinAs === 'child'
                    ? 'This device now shows your family’s data. Requests, check-ins and SOS reach your parent’s phone.'
                    : 'This device now shows your family’s data and stays in step with the others.'
                }
                style={styles.gapBottom}
              />
            ) : null}

            <SectionLabel>Linked devices</SectionLabel>
            <DeviceList devices={link.devices} />

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

            {justLinked ? <Button label="Done" icon="check" onPress={() => router.back()} style={styles.gapBottom} /> : null}

            {confirmUnlink ? (
              <InlineConfirm
                title="Unlink this device?"
                detail="It keeps the data it has now, which stops updating. Your family is not told automatically."
                confirmLabel="Unlink"
                onCancel={() => setConfirmUnlink(false)}
                onConfirm={unlink}
              />
            ) : (
              <Button label="Unlink this device" icon="x-circle" variant="ghost" onPress={() => setConfirmUnlink(true)} />
            )}
          </>
        ) : (
          <>
            <SectionLabel>Enter the code</SectionLabel>
            <Card style={styles.entry}>
              <TextField
                value={formatPairingCode(input)}
                onChangeText={(text) => {
                  setInput(normalisePairingCode(text));
                  setProblem(null);
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
                invalid={problem !== null}
                accessibilityLabel="Pairing code"
                style={styles.input}
              />
              <Text variant="small" tone="muted" center>
                {PAIRING_CODE_LENGTH} letters and numbers from the parent's phone
              </Text>
              <Button label="Link this device" icon="link" loading={busy} disabled={!complete} onPress={join} full />
            </Card>
            {problem ? <InlineNote tone="neutral" icon="alert-circle" title="That didn't work" detail={problem} style={styles.gapBottom} /> : null}

            <SectionLabel>Where to find the code</SectionLabel>
            <Card padded={false} style={styles.group}>
              <Step n={1} text="On the parent's phone, open Haven" />
              <Step n={2} text="Family tab, then “Devices & Pairing”" />
              <Step n={3} text="Tap “Create a link code” and read it out" last />
            </Card>

            <LinkFootnote>
              Linking replaces the sample data on this device with your family’s data. It shares what is listed under “What’s shared”
              and nothing else.
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
  group: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  gapBottom: { marginBottom: spacing.lg },
});
