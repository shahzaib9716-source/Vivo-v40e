import { useNow } from '@/state/store';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, IconBadge, Text } from '@/components/ui';
import type { FamilyMember, LinkState, LinkStatus } from '@/sync/types';
import { radius, spacing, useTheme } from '@/theme';

/** Pieces shared by the account and linking screens (/account, /pairing, /link-device). */

export const PLATFORM: Record<string, string> = { android: 'Android', ios: 'iPhone', web: 'Browser' };

/**
 * Runs link actions for a screen: one at a time, with the failure kept as a sentence to show.
 * (A promise chain rather than try/finally: these screens are built with the React Compiler.)
 */
export function useLinkAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const run = (name: string, action: () => Promise<unknown>, done?: () => void) => {
    if (busy) return;
    setBusy(name);
    setProblem(null);
    action()
      .then(() => done?.())
      .catch((e: unknown) => setProblem(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.'))
      .then(() => setBusy(null));
  };
  return { busy, problem, run, clearProblem: () => setProblem(null) };
}

function seen(device: FamilyMember, now: number): string {
  // A member is an account. A child's account lives on one phone; a parent's can be signed in on several.
  if (device.isThisAccount) return device.role === 'child' ? 'This device' : 'You';
  if (device.lastSeenAt == null) return 'Not seen yet';
  const minutes = Math.floor((now - device.lastSeenAt) / 60000);
  if (minutes < 2) return 'Active now';
  if (minutes < 60) return `Seen ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Seen ${hours} h ago` : 'Seen a while ago';
}

/** One sentence each for the top of a linking screen. */
export function linkSummary(link: LinkState): { title: string; detail: string; tone: 'ok' | 'idle' | 'warn' } {
  const others = Math.max(0, link.members.length - 1);
  const text: Record<LinkStatus, { title: string; detail: string; tone: 'ok' | 'idle' | 'warn' }> = {
    unconfigured: {
      title: "Linking isn't set up in this build",
      detail: 'This copy was built without a server, so each app keeps its own data on its own phone.',
      tone: 'idle',
    },
    'signed-out': { title: 'Not linked yet', detail: 'This device shows sample data until it joins a family.', tone: 'idle' },
    'needs-family': { title: 'Signed in, no family yet', detail: 'This account has no family yet. Create one to link devices.', tone: 'idle' },
    waiting: {
      title: 'Waiting for a parent',
      detail: link.pendingJoin ? `Ask a parent to approve this device. Both phones show the check ${link.pendingJoin.check}.` : 'Ask a parent to approve this device.',
      tone: 'idle',
    },
    removed: { title: 'This device was removed', detail: 'A parent removed it from the family. It shows sample data again.', tone: 'warn' },
    connecting: { title: 'Connecting…', detail: 'Reaching your family’s data.', tone: 'idle' },
    linked: {
      title: others === 0 ? 'Family created' : `Linked with ${others} other ${others === 1 ? 'device' : 'devices'}`,
      detail:
        others === 0
          ? 'No other device has joined yet. Create a code and enter it on the other phone.'
          : 'Changes on one phone reach the others while the apps are open.',
      tone: 'ok',
    },
    offline:
      link.role === null
        ? { title: "Can't reach the server", detail: 'Haven needs a connection to finish setting up. This updates by itself when it is back.', tone: 'warn' }
        : { title: 'Linked, but offline', detail: link.error ?? 'Changes are kept and sent when the connection is back.', tone: 'warn' },
    error: { title: 'There is a problem with the link', detail: link.error ?? 'Try again in a moment.', tone: 'warn' },
  };
  const summary = text[link.status];
  // Why something just ended or was refused (a declined request, a refused change): said here,
  // whatever the status, so it is not lost when the screen moves on.
  if (link.error && link.status !== 'offline' && link.status !== 'error') return { ...summary, detail: link.error };
  return summary;
}

export function LinkStatusCard({ link }: { link: LinkState }) {
  const { colors } = useTheme();
  const summary = linkSummary(link);
  const tint = summary.tone === 'ok' ? colors.success : summary.tone === 'warn' ? colors.warning : colors.info;
  const icon = summary.tone === 'ok' ? 'link' : summary.tone === 'warn' ? 'wifi-off' : link.status === 'connecting' ? 'loader' : 'link-2';
  return (
    <Card style={styles.status}>
      <IconBadge name={icon} color={tint} size={48} />
      <View style={styles.flex}>
        <Text variant="title">{summary.title}</Text>
        <Text variant="small" tone="muted">
          {summary.detail}
        </Text>
      </View>
    </Card>
  );
}

/**
 * The members of the family. With `onRemove`, every member a parent may remove (anyone but this
 * account and the person who created the family) gets a remove control.
 */
export function DeviceList({ devices, onRemove, childName }: { devices: FamilyMember[]; onRemove?: (member: FamilyMember) => void; childName?: (childId: string) => string | null }) {
  const { colors } = useTheme();
  const now = useNow();
  if (devices.length === 0) return null;
  return (
    <Card padded={false} style={styles.list}>
      {devices.map((device, index) => (
        <View
          key={device.uid}
          accessible
          accessibilityLabel={`${device.name}, ${device.role}, ${PLATFORM[device.platform] ?? device.platform}, ${seen(device, now)}`}
          style={[styles.device, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline }]}>
          <IconBadge
            name={device.platform === 'web' ? 'monitor' : 'smartphone'}
            color={device.role === 'parent' ? colors.primary : colors.accent}
            size={40}
          />
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {device.name}
            </Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {memberRole(device, childName)} · {PLATFORM[device.platform] ?? device.platform}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: device.isThisAccount ? colors.primarySoft : colors.surfaceSunken }]}>
            <Text variant="tiny" color={device.isThisAccount ? colors.primary : colors.textMuted}>
              {seen(device, now)}
            </Text>
          </View>
          {onRemove && !device.isThisAccount && !device.isOwner ? (
            <Pressable
              onPress={() => onRemove(device)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${device.name}`}
              style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

function memberRole(member: FamilyMember, childName?: (childId: string) => string | null): string {
  if (member.role === 'parent') return member.isOwner ? 'Parent · created the family' : 'Parent';
  const name = member.childId && childName ? childName(member.childId) : null;
  return name ? `${name}’s phone` : 'Child';
}

/**
 * The four characters both phones show while a phone waits to be approved. They are the end of the
 * joining phone's account id, so a different phone that used the code shows different characters.
 */
export function CheckCode({ check, caption }: { check: string; caption: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={`Check: ${check.split('').join(' ')}. ${caption}`} style={styles.checkWrap}>
      <View style={styles.checkRow}>
        {check.split('').map((ch, index) => (
          <View key={index} style={[styles.checkCell, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text variant="h2">{ch}</Text>
          </View>
        ))}
      </View>
      <Text variant="small" tone="muted" center>
        {caption}
      </Text>
    </View>
  );
}

/** A numbered instruction. */
export function Step({ n, text, last }: { n: number; text: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.step, !last && { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.stepNum, { backgroundColor: colors.primarySoft }]}>
        <Text variant="smallStrong" color={colors.primary}>
          {n}
        </Text>
      </View>
      <Text variant="body" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

/** The small print under a linking screen: what the link does and does not do. */
export function LinkFootnote({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.note}>
      <Feather name="info" size={14} color={colors.textFaint} style={styles.noteIcon} />
      <Text variant="small" tone="faint" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  list: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  device: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  checkWrap: { alignItems: 'center', gap: spacing.sm },
  checkRow: { flexDirection: 'row', gap: spacing.sm },
  checkCell: { width: 48, height: 56, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  noteIcon: { marginTop: 2 },
});

