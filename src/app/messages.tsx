import { ComponentRef, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputKeyPressEvent,
  type TextStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatWordSettings } from '@/components/ChatWordAlerts';
import { ChatBubble, TypingBubble, bubbleTint, type BubblePosition, type BubbleTone } from '@/components/ChatBubble';
import { Avatar, Text } from '@/components/ui';
import { useLink } from '@/sync/link';
import { useStore, timeOf, updatedAgoOf, useNow, type ChatMessage } from '@/state/store';
import { radius, spacing, useTheme } from '@/theme';

type Sender = ChatMessage['from'];
type Tint = ReturnType<typeof bubbleTint>;

const PARENTS_NAME = 'Mom & Dad';

const QUICK_REPLIES: Record<Sender, string[]> = {
  parent: ['On my way', 'Time for dinner', 'Call me please', 'Great job today!'],
  child: ["I'm here", 'Can you pick me up?', 'Running late', 'Love you'],
};

/**
 * No second device is paired in this demo, so the other side of the chat answers with one of these.
 * Each block is written in the voice of the person replying.
 */
interface Voice {
  /** Exact answers to the other side's quick replies. */
  matched: Record<string, string>;
  greeting: string;
  thanks: string;
  question: string;
  fallback: string[];
}

const CANNED: Record<Sender, Voice> = {
  child: {
    matched: {
      'on my way': 'Okay, see you soon!',
      'time for dinner': 'Coming! Be there in a minute.',
      'call me please': 'Okay, calling you now.',
      'great job today!': 'Thank you!! That made my day 💜',
    },
    greeting: 'Hi! 👋',
    thanks: "You're welcome 🙂",
    question: "Let me check, I'll tell you in a minute!",
    fallback: ['Okay! 👍', 'Got it, thanks!', 'Sounds good 🙂', 'Will do!'],
  },
  parent: {
    matched: {
      "i'm here": 'Thanks for letting us know 💜',
      'can you pick me up?': 'Of course. Leaving now, wait somewhere safe.',
      'running late': 'No problem, thanks for telling us. Be careful.',
      'love you': 'Love you too! 💜',
    },
    greeting: 'Hi sweetheart! 👋',
    thanks: 'Anytime 💜',
    question: 'Good question. Let me check and get back to you.',
    fallback: ['Got it, thanks for telling us 💜', 'Okay, sweetheart 👍', 'Sounds good!', 'Thanks for the update 🙂'],
  },
};

// On web, 'on-drag' blurs the input on every scroll event, including our own scroll to the newest
// message, so typing would be cut off mid-word. Dragging the list only dismisses a native keyboard.
const DISMISS_MODE = Platform.select({ ios: 'interactive', android: 'on-drag', default: 'none' } as const);

const TYPING_AFTER_MS = 400;
const REPLY_AFTER_MS = 1500;
const INPUT_MAX_HEIGHT = 120;
/** Messages from one sender within this many minutes share a single time label. */
const GROUP_WINDOW_MIN = 5;

function cannedReply(as: Sender, sentText: string, turn: number) {
  const voice = CANNED[as];
  const text = sentText.trim().toLowerCase();
  // Own-property check: someone may well type a word like "constructor".
  if (Object.prototype.hasOwnProperty.call(voice.matched, text)) return voice.matched[text];
  if (/\blove (you|u)\b/.test(text)) return 'Love you too! 💜';
  if (/^(hi|hiya|hello|hey)\b/.test(text)) return voice.greeting;
  if (/\b(thanks|thank you)\b/.test(text)) return voice.thanks;
  if (text.endsWith('?')) return voice.question;
  return voice.fallback[turn % voice.fallback.length];
}

function minutesOf(label: string) {
  const parts = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  if (!parts) return null;
  const hour = (Number(parts[1]) % 12) + (parts[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + Number(parts[2]);
}

interface Group {
  key: string;
  from: Sender;
  items: ChatMessage[];
  time: string;
}

/** Consecutive messages from one sender, sent close together, become one run with one time label. */
function groupMessages(list: ChatMessage[]) {
  const groups: Group[] = [];
  for (const message of list) {
    const last = groups[groups.length - 1];
    // A message with a real time is labelled from it; the sample messages keep their stored label.
    const label = timeOf(message);
    const before = last ? minutesOf(last.time) : null;
    const now = minutesOf(label);
    const close = before == null || now == null || (now >= before && now - before <= GROUP_WINDOW_MIN);
    const sameDay = !last || dayKeyOf(last.items[last.items.length - 1]) === dayKeyOf(message);
    if (last && last.from === message.from && close && sameDay) {
      last.items.push(message);
      last.time = label;
    } else {
      groups.push({ key: message.id, from: message.from, items: [message], time: label });
    }
  }
  return groups;
}

/** The calendar day a message was sent on; the sample messages, which have no time, count as today. */
function dayKeyOf(message: { at?: number }): string {
  const d = message.at != null ? new Date(message.at) : new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday", or the date, for the chip above a day's messages. */
function dayLabelOf(message: { at?: number }): string {
  if (message.at == null) return 'Today';
  const day = new Date(message.at);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKeyOf(message) === dayKeyOf({ at: today.getTime() })) return 'Today';
  if (dayKeyOf(message) === dayKeyOf({ at: yesterday.getTime() })) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function positionOf(index: number, count: number): BubblePosition {
  if (count === 1) return 'single';
  if (index === 0) return 'first';
  return index === count - 1 ? 'last' : 'middle';
}

export default function Messages() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { role, children, activeChild, childSelf, messages, sendMessage } = useStore();
  // In a linked family the other side is a real phone, so nothing is made up here.
  const link = useLink();
  const linked = link.role !== null;
  const now = useNow();

  const isChild = role === 'child';
  const me: Sender = isChild ? 'child' : 'parent';
  const other: Sender = isChild ? 'parent' : 'child';

  // A child only ever opens their own conversation. A parent can be sent to any of their children
  // with ?childId=, and lands on the child they are currently viewing otherwise.
  const rawId = params.childId as string | string[] | undefined;
  const paramId = Array.isArray(rawId) ? rawId[0] : rawId;
  const child = isChild ? childSelf : (children.find((c) => c.id === paramId) ?? activeChild);
  const childId = child.id;
  const firstName = child.name.split(' ')[0];
  const otherName = isChild ? PARENTS_NAME : child.name;
  const otherShort = isChild ? PARENTS_NAME : firstName;

  const tone: BubbleTone = isChild ? 'accent' : 'primary';
  const tint = bubbleTint(tone, colors);

  const thread = messages.filter((m) => m.childId === childId);
  const groups = groupMessages(thread);
  // Messages that were already here when the chat opened stay still; later ones fade in.
  const [openedWith] = useState(() => new Set(thread.map((m) => m.id)));

  // ----- Simulated reply from the other side -----
  const [typingIn, setTypingIn] = useState<string | null>(null);
  const typing = typingIn === childId;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTurn = useRef(0);

  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    [],
  );

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    sendMessage(childId, me, text);
    if (linked) return;

    // One canned answer per message at most. Sending again before it arrives restarts the wait,
    // so a quick burst of messages still gets a single reply.
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (replyTimer.current) clearTimeout(replyTimer.current);
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      setTypingIn(childId);
    }, TYPING_AFTER_MS);
    replyTimer.current = setTimeout(() => {
      replyTimer.current = null;
      setTypingIn(null);
      sendMessage(childId, other, cannedReply(other, text, replyTurn.current));
      replyTurn.current += 1;
    }, REPLY_AFTER_MS);
  };

  // ----- Keep the newest message in view -----
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const settled = useRef(false);

  const followNewest = () => listRef.current?.scrollToEnd({ animated: settled.current });

  useEffect(() => {
    if (!settled.current) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [thread.length, typing]);

  // ----- Keyboard: drop the home-indicator padding while the keyboard covers it -----
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // In a real family nothing reports who is online or where: only what the phones really sent.
  const status = linked
    ? isChild
      ? { label: 'Your family', dot: colors.textFaint }
      : child.checkInAt != null
        ? { label: `Checked in ${updatedAgoOf(child, now)}`, dot: colors.success }
        : { label: child.bedtime ? 'Screen time paused' : 'No check-in yet', dot: colors.textFaint }
    : typing
    ? { label: 'typing…', dot: colors.success }
    : isChild
      ? { label: 'Online now', dot: colors.success }
      : child.bedtime
        ? { label: 'Device paused', dot: colors.warning }
        : child.online
          ? { label: `Online · at ${child.place}`, dot: colors.success }
          : { label: `Last seen ${updatedAgoOf(child, now)}`, dot: colors.textFaint };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: colors.border }]}>
          <View style={[styles.column, styles.headerRow]}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : (router.replace as any)('/'))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [
                styles.backBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}>
              <Feather name="chevron-left" size={22} color={colors.text} />
            </Pressable>
            {isChild ? <ParentsAvatar size={40} /> : <Avatar name={child.name} size={40} />}
            <View style={styles.headerText}>
              <Text variant="h3" numberOfLines={1} accessibilityRole="header">
                {otherName}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                <Text variant="small" tone="muted" numberOfLines={1} style={styles.statusText}>
                  {status.label}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView
          ref={listRef}
          style={styles.root}
          contentContainerStyle={[styles.column, styles.listContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={DISMISS_MODE}
          onLayout={followNewest}
          onContentSizeChange={() => {
            followNewest();
            settled.current = true;
          }}>
          {link.role === 'child' && link.familyId && <ChatWordSettings key={link.familyId} family={link.familyId} />}
          {thread.length === 0 ? (
            <ThreadIntro empty isChild={isChild} firstName={firstName} tint={tint} linked={linked} />
          ) : (
            <>
              <ThreadIntro isChild={isChild} firstName={firstName} tint={tint} linked={linked} />
              <View style={styles.spacer} />
              {groups.map((group, groupIndex) => {
                const mine = group.from === me;
                const first = group.items[0];
                const newDay = groupIndex === 0 || dayKeyOf(groups[groupIndex - 1].items[0]) !== dayKeyOf(first);
                return (
                  <View key={`${group.key}-${groupIndex}`} style={styles.group}>
                    {newDay ? (
                      <View style={[styles.day, { backgroundColor: colors.surfaceAlt }]}>
                        <Text variant="tiny" tone="muted">
                          {dayLabelOf(first)}
                        </Text>
                      </View>
                    ) : null}
                    {group.items.map((message, index) => (
                      <ChatBubble
                        key={`${message.id}-${index}`}
                        text={message.text}
                        mine={mine}
                        tone={tone}
                        position={positionOf(index, group.items.length)}
                        animate={!openedWith.has(message.id)}
                        accessibilityLabel={`${mine ? 'You' : otherShort}: ${message.text}`}
                      />
                    ))}
                    <Text variant="tiny" tone="muted" style={[styles.time, mine && styles.timeMine]}>
                      {group.time}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
          {typing && (
            <View style={styles.group}>
              <TypingBubble accessibilityLabel={`${otherShort} is typing`} />
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.dock,
            { borderTopColor: colors.border, paddingBottom: keyboardOpen ? spacing.sm : Math.max(insets.bottom, spacing.sm) },
          ]}>
          <QuickReplies labels={QUICK_REPLIES[me]} tint={tint} onPick={send} />
          <Composer placeholder={`Message ${otherShort}`} tint={tint} onSend={send} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Stands in for the parents on the child's side, where there is no single name to draw initials from. */
function ParentsAvatar({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.parents, { width: size, height: size, backgroundColor: colors.primary }]}>
      <Feather name="users" size={Math.round(size * 0.45)} color={colors.onPrimary} />
    </View>
  );
}

/** Opens every thread: says who can see it, and that this build fakes the other side's replies. */
function ThreadIntro({ empty, isChild, firstName, tint, linked }: { empty?: boolean; isChild: boolean; firstName: string; tint: Tint; linked: boolean }) {
  const { colors } = useTheme();
  const them = isChild ? PARENTS_NAME : firstName;
  const body = empty
    ? `Say hi to ${them}. Type a message or tap a quick reply below. You both see everything in this chat.`
    : isChild
      ? 'You and your parents see the same messages here. Nothing in this chat is hidden from you.'
      : `You and ${firstName} see the same messages here. It is a conversation, not monitoring.`;

  return (
    <View style={[styles.intro, empty && styles.introEmpty]}>
      <View style={[styles.introIcon, { backgroundColor: tint.soft }]}>
        <Feather name="message-circle" size={24} color={tint.fill} />
      </View>
      <Text variant={empty ? 'h3' : 'title'} center>
        {empty ? 'No messages yet' : 'Family chat'}
      </Text>
      <Text variant="small" tone="muted" center style={styles.introBody}>
        {body}
      </Text>
      <View style={[styles.demo, { backgroundColor: colors.surfaceAlt }]}>
        <Feather name="info" size={12} color={colors.textMuted} />
        <Text variant="tiny" tone="muted">
          {linked ? 'Linked: messages go to the other phone' : 'Demo build: replies are simulated on this device'}
        </Text>
      </View>
    </View>
  );
}

/** One-tap messages in a row that scrolls sideways, with a soft fade while more sit off the right edge. */
function QuickReplies({ labels, tint, onPick }: { labels: string[]; tint: Tint; onPick: (text: string) => void }) {
  const { colors } = useTheme();
  const [hasMore, setHasMore] = useState(false);
  const metrics = useRef({ viewport: 0, content: 0, offset: 0 });

  const measure = (change: Partial<{ viewport: number; content: number; offset: number }>) => {
    Object.assign(metrics.current, change);
    const { viewport, content, offset } = metrics.current;
    setHasMore(viewport > 0 && content - viewport - offset > 8);
  };

  return (
    <View style={styles.column}>
      <ScrollView
        horizontal
        style={styles.quickScroll}
        contentContainerStyle={styles.quickRow}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onLayout={(event) => measure({ viewport: event.nativeEvent.layout.width })}
        onContentSizeChange={(width) => measure({ content: width })}
        onScroll={(event) => measure({ offset: event.nativeEvent.contentOffset.x })}>
        {labels.map((label) => (
          <QuickReply key={label} label={label} tint={tint} onPress={() => onPick(label)} />
        ))}
      </ScrollView>
      {hasMore && (
        <View style={styles.quickFade}>
          <LinearGradient
            colors={[colors.bg + '00', colors.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
    </View>
  );
}

function QuickReply({ label, tint, onPress }: { label: string; tint: Tint; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`Send quick reply: ${label}`}
      style={({ pressed }) => [
        styles.quick,
        { backgroundColor: pressed ? tint.soft : colors.surface, borderColor: pressed ? tint.fill : colors.border },
      ]}>
      <Text variant="smallStrong">{label}</Text>
    </Pressable>
  );
}

// A web textarea starts two rows tall; one row keeps the empty composer the same height as on native.
const WEB_INPUT_PROPS = Platform.OS === 'web' ? { rows: 1 } : {};
// Web only: a fixed line box so rows are 22px, and no browser focus ring (the field border shows focus).
const WEB_INPUT_STYLE = (Platform.OS === 'web' ? { lineHeight: 22, outlineStyle: 'none' } : null) as TextStyle | null;

function Composer({ placeholder, tint, onSend }: { placeholder: string; tint: Tint; onSend: (text: string) => void }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const canSend = draft.trim().length > 0;

  // Native multiline inputs grow with their text. On web the textarea has to be sized by hand.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node?.style) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, INPUT_MAX_HEIGHT)}px`;
  }, [draft]);

  const submit = () => {
    if (!canSend) return;
    onSend(draft);
    setDraft('');
    // Clicking the button takes focus on web; hand it back so the next message can be typed straight away.
    if (Platform.OS === 'web') inputRef.current?.focus();
  };

  // With a hardware keyboard on web, Enter sends and Shift+Enter adds a line.
  const onKeyPress = (event: TextInputKeyPressEvent) => {
    if (Platform.OS !== 'web') return;
    const key = event.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?: boolean };
    if (key.key === 'Enter' && !key.shiftKey && !key.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <View style={[styles.column, styles.composer]}>
      <View style={[styles.field, { backgroundColor: colors.surface, borderColor: focused ? tint.fill : colors.border }]}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onKeyPress={onKeyPress}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          selectionColor={tint.fill}
          multiline
          maxLength={500}
          accessibilityLabel={placeholder}
          style={[styles.input, WEB_INPUT_STYLE, { color: colors.text }]}
          {...WEB_INPUT_PROPS}
        />
      </View>
      <Pressable
        onPress={submit}
        disabled={!canSend}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        style={({ pressed }) => [
          styles.send,
          { backgroundColor: canSend ? tint.fill : colors.surfaceAlt },
          pressed && styles.sendPressed,
        ]}>
        <Feather name="arrow-up" size={20} color={canSend ? tint.text : colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Keeps the conversation a readable width on wide web windows; no effect on phones.
  column: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  pressed: { opacity: 0.7 },

  header: { paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  parents: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  statusDot: { width: 7, height: 7, borderRadius: radius.pill },
  statusText: { flexShrink: 1 },

  listContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xs },
  intro: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg },
  introEmpty: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxl },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  introBody: { maxWidth: 300 },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  spacer: { flexGrow: 1, minHeight: spacing.xl },
  day: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  group: { gap: 3, marginBottom: spacing.md },
  time: { marginTop: 3, marginHorizontal: spacing.xs },
  timeMine: { textAlign: 'right' },

  dock: { borderTopWidth: StyleSheet.hairlineWidth },
  quickScroll: { flexGrow: 0 },
  quickFade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 40, pointerEvents: 'none' },
  quickRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  quick: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  field: { flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, paddingHorizontal: spacing.lg },
  input: {
    fontSize: 16,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 0,
    maxHeight: INPUT_MAX_HEIGHT,
    textAlignVertical: 'center',
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendPressed: { opacity: 0.85, transform: [{ scale: 0.94 }] },
});
