import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';

import { IconButton, TextField, type TextFieldRef } from '@/components/RuleForm';
import { Button, Card, Header, IconBadge, Row, Screen, SectionLabel, Text } from '@/components/ui';
import { useStore, type SiteRule } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';
import { SampleNote } from '@/components/SampleNote';

type ListKind = SiteRule['list'];

const COPY: Record<
  ListKind,
  { title: string; subtitle: string; emptyTitle: string; emptyBody: string; note: string; other: string }
> = {
  blocked: {
    title: 'Blocked sites',
    subtitle: 'These never open, whatever the category settings say',
    emptyTitle: 'No blocked sites yet',
    emptyBody: 'Add an address above and it stops opening on your children’s devices.',
    note: 'Your child sees a clear “Blocked by your family” page for these sites, so the rule is never hidden.',
    other: 'Always allowed',
  },
  allowed: {
    title: 'Always allowed',
    subtitle: 'These always open, even when their category is blocked',
    emptyTitle: 'Nothing always allowed yet',
    emptyBody: 'Add an address above and it keeps opening, even when its category is blocked.',
    note: 'Category filters and Safe Search still apply to every other site.',
    other: 'Blocked sites',
  },
};

/** A real family: the lists are saved and shared with the parents, but nothing filters the web. */
const LIVE_COPY: Record<ListKind, { subtitle: string; emptyBody: string; note: string }> = {
  blocked: {
    subtitle: 'Sites your family agreed not to use',
    emptyBody: 'Add an address above to save it in your family’s list.',
    note: 'This version of Haven does not filter the web: the list is an agreement, not a block.',
  },
  allowed: {
    subtitle: 'Sites your family agreed are fine',
    emptyBody: 'Add an address above to save it in your family’s list.',
    note: 'This version of Haven does not filter the web: the list is an agreement.',
  },
};

const HOST_MAX = 253;
const UNDO_MS = 6000;

/** Labels of letters, digits and hyphens, at least one dot, and a real-looking top-level domain. */
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/;

/** "https://www.Example.com:443/page?x=1" becomes "example.com". */
function normaliseHost(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

const countLabel = (n: number) => `${n} ${n === 1 ? 'site' : 'sites'}`;

export default function SiteList() {
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const { sites, addSite, removeSite, live } = useStore();

  const rawList = params.list as string | string[] | undefined;
  const list: ListKind = (Array.isArray(rawList) ? rawList[0] : rawList) === 'allowed' ? 'allowed' : 'blocked';
  const copy = live ? { ...COPY[list], ...LIVE_COPY[list] } : COPY[list];
  const tint = list === 'blocked' ? colors.danger : colors.success;
  const rowIcon = list === 'blocked' ? 'slash' : 'check';

  // Newest first, so a site that was just added shows up right under the input.
  const items = sites.filter((s) => s.list === list).reverse();
  // Sites that were already here when the screen opened stay still; later ones fade in.
  const [openedWith] = useState(() => new Set(items.map((s) => s.id)));

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The same host on the other list. A site can only be on one of them. */
  const [conflict, setConflict] = useState<SiteRule | null>(null);
  const [removed, setRemoved] = useState<SiteRule | null>(null);
  const input = useRef<TextFieldRef>(null);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const reset = () => {
    setText('');
    setError(null);
    setConflict(null);
  };

  const submit = () => {
    const host = normaliseHost(text);
    setConflict(null);
    if (!host) {
      setError('Type a site address, like example.com.');
      input.current?.focus();
      return;
    }
    if (!DOMAIN.test(host)) {
      setError('That doesn’t look like a site address. Try something like example.com.');
      input.current?.focus();
      return;
    }
    if (sites.some((s) => s.host === host && s.list === list)) {
      setError(`${host} is already on this list.`);
      input.current?.focus();
      return;
    }
    const elsewhere = sites.find((s) => s.host === host);
    if (elsewhere) {
      setError(null);
      setConflict(elsewhere);
      return;
    }
    addSite(host, list);
    setRemoved(null);
    reset();
    // Keep typing: on web the button press took focus away from the input.
    input.current?.focus();
  };

  const moveHere = () => {
    if (!conflict) return;
    removeSite(conflict.id);
    addSite(conflict.host, list);
    reset();
  };

  const remove = (site: SiteRule) => {
    removeSite(site.id);
    setRemoved(site);
  };

  const undo = () => {
    if (!removed) return;
    addSite(removed.host, removed.list);
    setRemoved(null);
  };

  return (
    // Outermost so it lines up with the keyboard's frame; the list stays scrollable above the keyboard.
    <KeyboardAvoidingView behavior="padding" style={[styles.flex, { backgroundColor: colors.bg }]}>
      <Screen>
        <Header back title={copy.title} subtitle={copy.subtitle} />
        <SampleNote about="saved" />

        <SectionLabel>Add a site</SectionLabel>
        <View style={styles.addRow}>
          <TextField
            ref={input}
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (error) setError(null);
              if (conflict) setConflict(null);
            }}
            onSubmitEditing={submit}
            submitBehavior="submit"
            placeholder="example.com"
            invalid={!!error}
            maxLength={HOST_MAX}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            keyboardType="url"
            inputMode="url"
            returnKeyType="done"
            accessibilityLabel={`Site address to add to ${copy.title}`}
            style={styles.input}
          />
          <Button label="Add" icon="plus" onPress={submit} style={styles.addBtn} />
        </View>

        {error ? (
          <Animated.View entering={FadeIn.duration(160)} style={styles.message} accessibilityLiveRegion="polite">
            <Feather name="alert-circle" size={14} color={colors.danger} style={styles.messageIcon} />
            <Text variant="small" tone="danger" style={styles.flex}>
              {error}
            </Text>
          </Animated.View>
        ) : conflict ? null : (
          <View style={styles.message}>
            <Text variant="small" tone="faint" style={styles.flex}>
              Just the address. You can leave out https:// and www.
            </Text>
          </View>
        )}

        {conflict ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
            <View style={styles.noticeText}>
              <Feather name="info" size={16} color={colors.warning} style={styles.messageIcon} />
              <View style={styles.flex}>
                <Text variant="smallStrong">
                  {conflict.host} is on your {copy.other} list
                </Text>
                <Text variant="small" tone="muted">
                  A site can only be on one list. Move it to {copy.title}?
                </Text>
              </View>
            </View>
            <View style={styles.noticeActions}>
              <Button label="Leave it" size="sm" variant="secondary" onPress={reset} style={styles.flex} />
              <Button label="Move it here" size="sm" onPress={moveHere} style={styles.flex} />
            </View>
          </Animated.View>
        ) : null}

        <View style={styles.listHead}>{items.length > 0 ? <SectionLabel>{countLabel(items.length)}</SectionLabel> : null}</View>

        {removed ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            accessibilityLiveRegion="polite"
            style={[styles.undo, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text variant="small" tone="muted" numberOfLines={1} style={styles.flex}>
              Removed {removed.host}
            </Text>
            <Pressable
              onPress={undo}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Undo removing ${removed.host}`}
              style={({ pressed }) => [styles.undoBtn, pressed && styles.pressed]}>
              <Feather name="rotate-ccw" size={14} color={colors.primary} />
              <Text variant="smallStrong" color={colors.primary}>
                Undo
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {items.length === 0 ? (
          <Card style={styles.empty}>
            <IconBadge name={list === 'blocked' ? 'x-circle' : 'check-circle'} color={tint} size={56} />
            <Text variant="h3" center style={styles.emptyTitle}>
              {copy.emptyTitle}
            </Text>
            <Text variant="body" tone="muted" center>
              {copy.emptyBody}
            </Text>
          </Card>
        ) : (
          <Card padded={false} style={styles.list}>
            {items.map((site) => {
              const row = (
                <Row
                  title={site.host}
                  icon={rowIcon}
                  iconColor={tint}
                  chevron={false}
                  right={<IconButton icon="x" label={`Remove ${site.host}`} onPress={() => remove(site)} />}
                />
              );
              return openedWith.has(site.id) ? (
                <View key={site.id}>{row}</View>
              ) : (
                <Animated.View key={site.id} entering={FadeIn.duration(200)}>
                  {row}
                </Animated.View>
              );
            })}
          </Card>
        )}

        <View style={styles.note}>
          <Feather name={list === 'blocked' ? 'eye' : 'shield'} size={14} color={colors.textFaint} style={styles.messageIcon} />
          <Text variant="small" tone="faint" style={styles.flex}>
            {copy.note}
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // minWidth lets the field shrink below a browser input's built-in width on narrow screens.
  input: { flex: 1, minWidth: 0 },
  // Same height as the text field next to it.
  addBtn: { height: 52, paddingHorizontal: spacing.lg },
  message: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, marginHorizontal: spacing.xs },
  messageIcon: { marginTop: 2 },

  notice: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, gap: spacing.md },
  noticeText: { flexDirection: 'row', gap: spacing.sm },
  noticeActions: { flexDirection: 'row', gap: spacing.sm },

  listHead: { marginTop: spacing.xl },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: spacing.xs },

  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  emptyTitle: { marginTop: spacing.sm },

  note: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
});
