import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';

import { InlineConfirm, TextField } from '@/components/RuleForm';
import { Avatar, Button, Card, Header, IconBadge, PlaceholderNotice, Row, Screen, SectionLabel, StatTile, Text } from '@/components/ui';
import { useStore, fmtDuration } from '@/state/store';
import { categoryColors, spacing, useTheme } from '@/theme';

const NAME_MAX = 24;

/** Trimmed, with runs of spaces collapsed, so initials and first names stay clean. */
const tidyName = (raw: string) => raw.trim().replace(/\s+/g, ' ');

/**
 * Opens the parent's Location tab so that Back, in the app and in the browser, leads to Home.
 * (router.dismissTo('/(parent)/location') also lands there, but on the web it writes Location over
 * the tabs' own history entry, so Back skips Home.) The same helper is in notifications.tsx.
 */
function openLocationTab() {
  if (router.canDismiss()) {
    // Back to the tabs this screen was opened from, then across to Location.
    router.dismissAll();
    (router.navigate as any)('/(parent)/location');
    return;
  }
  // Opened directly from a link: there are no tabs underneath, so put them in this screen's place.
  (router.replace as any)('/(parent)/location');
  if (Platform.OS !== 'web') return;
  // The browser still has a single entry. Once the tabs are showing, step to Home and straight back
  // in one update: nothing visible changes, and the browser gains a Home entry under Location.
  let frames = 0;
  const whenTabsShow = () => {
    if (window.location.pathname.endsWith('/location')) {
      (router.navigate as any)('/(parent)/dashboard');
      (router.navigate as any)('/(parent)/location');
    } else if (++frames < 180) {
      requestAnimationFrame(whenTabsShow);
    }
  };
  requestAnimationFrame(whenTabsShow);
}

export default function ChildProfile() {
  const { colors } = useTheme();
  const { activeChild, activeChildId, pauseDevice, resumeDevice, renameChild } = useStore();

  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  /** The name being typed, or null while the rename editor is closed. */
  const [draft, setDraft] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [unpair, setUnpair] = useState<'idle' | 'confirm' | 'demo'>('idle');

  const renaming = draft != null;
  const nameError = renaming && tried && !tidyName(draft) ? 'Type a name for this child.' : null;

  // The rename editor, the unpair confirmation and the demo note all open at the very bottom of
  // the screen, partly below the fold. Scroll them into view once they have been laid out.
  const expanded = renaming || unpair !== 'idle';
  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [expanded, unpair]);

  // The keyboard opens over the editor; once it is up, the avoiding view has made room to scroll.
  useEffect(() => {
    if (!renaming) return;
    const shown = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => shown.remove();
  }, [renaming]);

  const startRename = () => {
    setUnpair((state) => (state === 'confirm' ? 'idle' : state));
    setTried(false);
    setDraft(activeChild.name);
  };

  const cancelRename = () => {
    Keyboard.dismiss();
    setDraft(null);
  };

  const saveRename = () => {
    if (draft == null) return;
    const name = tidyName(draft);
    if (!name) {
      setTried(true);
      return;
    }
    if (name !== activeChild.name) renameChild(activeChildId, name);
    Keyboard.dismiss();
    setDraft(null);
  };

  const askUnpair = () => {
    Keyboard.dismiss();
    setDraft(null);
    setUnpair('confirm');
  };

  return (
    // Outermost so it lines up with the keyboard's frame (see RuleForm's FormScreen).
    <KeyboardAvoidingView behavior="padding" style={[styles.flex, { backgroundColor: colors.bg }]}>
      <Screen scroll={false} padded={false}>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Header back />

          <View style={styles.hero}>
            <Avatar name={activeChild.name} size={88} ring />
            <Text variant="h1" center numberOfLines={2} style={styles.name}>
              {activeChild.name}
            </Text>
            <Text variant="small" tone="muted" center>
              Age {activeChild.age} · {activeChild.deviceName}
            </Text>
          </View>

          <View style={styles.tiles}>
            <StatTile value={fmtDuration(activeChild.usedMin)} caption="Today" color={colors.primary} />
            <StatTile value={`${activeChild.battery}%`} caption="Battery" color={activeChild.battery < 30 ? colors.danger : colors.success} />
            <StatTile value={activeChild.online ? 'Online' : 'Offline'} caption={activeChild.place} color={colors.info} />
          </View>

          <View style={styles.tiles}>
            {activeChild.bedtime ? (
              <Button label="Resume device" icon="play" style={styles.flex} onPress={() => resumeDevice(activeChildId)} />
            ) : (
              <Button label="Pause device" icon="pause" variant="secondary" style={styles.flex} onPress={() => pauseDevice(activeChildId)} />
            )}
            <Button
              label="Message"
              icon="message-circle"
              variant="secondary"
              style={styles.flex}
              onPress={() => (router.push as any)(`/messages?childId=${activeChildId}`)}
            />
          </View>

          <SectionLabel>Controls</SectionLabel>
          <Card padded={false} style={styles.group}>
            <Row title="Screen Time" subtitle={`Limit ${fmtDuration(activeChild.limitMin)}/day`} icon="clock" iconColor={categoryColors.screenTime} onPress={() => (router.push as any)('/screen-time')} />
            <Row title="App Limits" subtitle={`${activeChild.apps.length} apps`} icon="grid" iconColor={categoryColors.apps} onPress={() => (router.push as any)('/app-limits')} />
            <Row title="Schedules" subtitle="Bedtime & school" icon="calendar" iconColor={categoryColors.schedules} onPress={() => (router.push as any)('/schedules')} />
            <Row title="Location" subtitle={activeChild.place} icon="map-pin" iconColor={categoryColors.location} onPress={openLocationTab} />
          </Card>

          <SectionLabel>Device</SectionLabel>
          <Card padded={false} style={styles.device}>
            {renaming ? (
              <Animated.View entering={FadeIn.duration(160)} style={styles.editor}>
                <View style={styles.editorHead}>
                  <IconBadge name="edit-2" color={colors.textMuted} size={40} />
                  <Text variant="title" style={styles.flex}>
                    Rename child
                  </Text>
                  <Text variant="tiny" tone="faint">
                    {draft.length}/{NAME_MAX}
                  </Text>
                </View>
                <TextField
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={saveRename}
                  placeholder="Child’s name"
                  maxLength={NAME_MAX}
                  invalid={!!nameError}
                  autoFocus
                  selectTextOnFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="off"
                  returnKeyType="done"
                  accessibilityLabel="Child’s name"
                />
                {nameError ? (
                  <View style={styles.error} accessibilityLiveRegion="polite">
                    <Feather name="alert-circle" size={14} color={colors.danger} />
                    <Text variant="small" tone="danger" style={styles.flex}>
                      {nameError}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.editorActions}>
                  <Button label="Cancel" size="sm" variant="secondary" onPress={cancelRename} style={styles.flex} />
                  <Button label="Save" size="sm" icon="check" onPress={saveRename} style={styles.flex} />
                </View>
              </Animated.View>
            ) : (
              <Row title="Rename child" subtitle={activeChild.name} icon="edit-2" iconColor={colors.textMuted} onPress={startRename} />
            )}

            {unpair === 'confirm' ? (
              <View style={styles.confirm}>
                <Row title="Unpair device" subtitle={activeChild.deviceName} icon="trash-2" danger />
                <InlineConfirm
                  title={`Unpair ${activeChild.deviceName}?`}
                  detail="Haven would stop managing this device, and its limits and schedules would switch off."
                  confirmLabel="Unpair"
                  onCancel={() => setUnpair('idle')}
                  onConfirm={() => setUnpair('demo')}
                />
              </View>
            ) : (
              <Row title="Unpair device" subtitle={activeChild.deviceName} icon="trash-2" danger chevron={false} onPress={askUnpair} />
            )}
          </Card>

          {unpair === 'demo' ? (
            <Animated.View entering={FadeIn.duration(160)} style={styles.demo} accessibilityLiveRegion="polite">
              <PlaceholderNotice note={`Demo: device not unpaired. Nothing was removed, and ${activeChild.deviceName} is still linked.`} />
            </Animated.View>
          ) : null}
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },

  hero: { alignItems: 'center', marginBottom: spacing.xl },
  name: { marginTop: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  group: { paddingHorizontal: spacing.lg, marginBottom: spacing.xl },

  device: { paddingHorizontal: spacing.lg },
  editor: { paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  editorActions: { flexDirection: 'row', gap: spacing.sm },
  // Sits tight under the field it belongs to.
  error: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.xs, marginLeft: spacing.xs },
  confirm: { paddingBottom: spacing.lg },
  demo: { marginTop: spacing.md },
});
