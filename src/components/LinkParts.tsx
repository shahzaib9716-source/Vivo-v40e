import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { Card, IconBadge, Text } from '@/components/ui';
import type { LinkedDevice, LinkState, LinkStatus } from '@/sync/types';
import { radius, spacing, useTheme } from '@/theme';

/** Pieces shared by the two linking screens (parent: /pairing, child: /link-device). */

const PLATFORM: Record<string, string> = { android: 'Android', ios: 'iPhone', web: 'Browser' };

function seen(device: LinkedDevice, now: number): string {
  if (device.isThisDevice) return 'This device';
  const minutes = Math.floor((now - device.lastSeenAt) / 60000);
  if (minutes < 2) return 'Active now';
  if (minutes < 60) return `Seen ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Seen ${hours} h ago` : 'Seen a while ago';
}

/** One sentence each for the top of a linking screen. */
export function linkSummary(link: LinkState): { title: string; detail: string; tone: 'ok' | 'idle' | 'warn' } {
  const others = Math.max(0, link.devices.length - 1);
  const text: Record<LinkStatus, { title: string; detail: string; tone: 'ok' | 'idle' | 'warn' }> = {
    unconfigured: {
      title: "Linking isn't set up in this build",
      detail: 'This copy was built without a server, so each app keeps its own data on its own phone.',
      tone: 'idle',
    },
    unlinked: { title: 'Not linked yet', detail: 'This device keeps its own data until it joins a family.', tone: 'idle' },
    connecting: { title: 'Connecting…', detail: 'Reaching your family’s data.', tone: 'idle' },
    linked: {
      title: others === 0 ? 'Family created' : `Linked with ${others} other ${others === 1 ? 'device' : 'devices'}`,
      detail:
        others === 0
          ? 'No other device has joined yet. Create a code and enter it on the other phone.'
          : 'Changes on one phone reach the others while the apps are open.',
      tone: 'ok',
    },
    offline: { title: 'Linked, but offline', detail: link.error ?? 'Changes are kept and sent when the connection is back.', tone: 'warn' },
    error: { title: 'There is a problem with the link', detail: link.error ?? 'Try again in a moment.', tone: 'warn' },
  };
  return text[link.status];
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

export function DeviceList({ devices }: { devices: LinkedDevice[] }) {
  const { colors } = useTheme();
  const now = Date.now();
  if (devices.length === 0) return null;
  return (
    <Card padded={false} style={styles.list}>
      {devices.map((device, index) => (
        <View
          key={device.id}
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
              {device.role === 'parent' ? 'Parent' : 'Child'} · {PLATFORM[device.platform] ?? device.platform}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: device.isThisDevice ? colors.primarySoft : colors.surfaceSunken }]}>
            <Text variant="tiny" color={device.isThisDevice ? colors.primary : colors.textMuted}>
              {seen(device, now)}
            </Text>
          </View>
        </View>
      ))}
    </Card>
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
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  noteIcon: { marginTop: 2 },
});
