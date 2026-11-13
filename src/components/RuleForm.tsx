import { ComponentRef, ReactNode, Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Header, Screen, SectionLabel, Text } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

/**
 * Building blocks for Haven's "add a rule" forms (schedules, places) and the
 * list screens that manage them. Everything here is theme-aware and uses
 * Pressable, so it behaves the same with touch, mouse and keyboard.
 */

type IconFamily = 'feather' | 'mci';

function Glyph({ name, family = 'feather', size, color }: { name: string; family?: IconFamily; size: number; color: string }) {
  if (family === 'mci') {
    return <MaterialCommunityIcons name={name as keyof typeof MaterialCommunityIcons.glyphMap} size={size} color={color} />;
  }
  return <Feather name={name as keyof typeof Feather.glyphMap} size={size} color={color} />;
}

/* -------------------------------------------------------------------------- */
/* Form screen                                                                */
/* -------------------------------------------------------------------------- */

export interface FormHandle {
  /** Scrolls so the field at `y` (its onLayout y inside the form body) sits just under the pinned preview. */
  reveal: (y: number) => void;
}

interface FormScreenProps {
  title: string;
  subtitle?: string;
  /** Optional block under the title that scrolls away with it (templates, quick picks). */
  lead?: ReactNode;
  /** Live preview. It pins to the top of the screen once the title has scrolled away. */
  preview: ReactNode;
  /** The fields. Keep the text input first so it stays above the keyboard. */
  children: ReactNode;
  saveLabel: string;
  onSave: () => void;
  /** Shown above the save button. Pass null while the form is valid or untouched. */
  error?: string | null;
  ref?: Ref<FormHandle>;
}

/** The preview is the second child of the scroll view. */
const PINNED = [1];

export function FormScreen({ title, subtitle, lead, preview, children, saveLabel, onSave, error, ref }: FormScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  /** Height of the title block, i.e. the scroll offset at which the preview pins. */
  const leadHeight = useRef(0);
  const [keyboardUp, setKeyboardUp] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      reveal: (y: number) => {
        scroll.current?.scrollTo({ y: Math.max(0, leadHeight.current + y - spacing.sm), animated: true });
      },
    }),
    [],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      setKeyboardUp(true);
      // Tuck the title away so the preview and the first field sit above the keyboard.
      scroll.current?.scrollTo({ y: leadHeight.current, animated: true });
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const onLeadLayout = (e: LayoutChangeEvent) => {
    leadHeight.current = e.nativeEvent.layout.height;
  };

  return (
    // Outermost on purpose: the avoiding view measures itself against its parent, so it has to
    // start at the top of the window (above the safe-area padding) to match the keyboard's frame.
    <KeyboardAvoidingView behavior="padding" style={[styles.flex, { backgroundColor: colors.bg }]}>
      <Screen scroll={false} padded={false}>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          stickyHeaderIndices={PINNED}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // On web this mode blurs the input on every scroll event, including programmatic ones.
          keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}>
          <View style={styles.gutter} onLayout={onLeadLayout}>
            <Header back title={title} subtitle={subtitle} />
            {lead}
          </View>
          <View style={[styles.pinned, { backgroundColor: colors.bg }]}>{preview}</View>
          <View style={styles.gutter}>{children}</View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: keyboardUp ? spacing.md : Math.max(insets.bottom, spacing.md),
            },
          ]}>
          {error ? (
            <Animated.View entering={FadeIn.duration(160)} style={styles.footerError} accessibilityLiveRegion="polite">
              <Feather name="alert-circle" size={15} color={colors.danger} />
              <Text variant="small" tone="danger" style={styles.flex}>
                {error}
              </Text>
            </Animated.View>
          ) : null}
          <Button label={saveLabel} icon="check" full onPress={onSave} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  label: string;
  /** Short value shown on the right of the label, e.g. a character count. */
  hint?: string;
  error?: string | null;
  children: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}

/** A labelled form section with an optional inline error underneath. */
export function Field({ label, hint, error, children, onLayout, style }: FieldProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, style]} onLayout={onLayout}>
      <View style={styles.fieldHead}>
        <SectionLabel style={styles.fieldLabel}>{label}</SectionLabel>
        {hint ? (
          <Text variant="tiny" tone="faint" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
      {error ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.fieldError} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={14} color={colors.danger} />
          <Text variant="small" tone="danger" style={styles.flex}>
            {error}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The instance a `TextField` ref points at (focus, blur, clear). */
export type TextFieldRef = ComponentRef<typeof TextInput>;

interface TextFieldProps extends TextInputProps {
  invalid?: boolean;
  ref?: Ref<TextFieldRef>;
}

/** Single-line text input in Haven's style, with focus and error borders. */
export function TextField({ invalid, style, onFocus, onBlur, ref, ...rest }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = focused ? colors.primary : invalid ? colors.danger : colors.border;

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textFaint}
      selectionColor={colors.primary}
      cursorColor={colors.primary}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.input, { backgroundColor: colors.surface, borderColor, color: colors.text }, style]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

interface OptionTileProps {
  icon: string;
  family?: IconFamily;
  /** Visible caption under the icon. Omit for an icon-only tile and pass `accessibilityLabel` instead. */
  label?: string;
  accessibilityLabel?: string;
  selected: boolean;
  /** Accent used for the selected state (#RRGGBB). */
  color: string;
  onPress: () => void;
}

/** A selectable icon tile. Lay several out in a row; each one takes an equal share. */
export function OptionTile({ icon, family, label, accessibilityLabel, selected, color, onPress }: OptionTileProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.tile,
        label ? styles.tileLabelled : null,
        { backgroundColor: selected ? color + '22' : colors.surfaceAlt, borderColor: selected ? color : colors.border },
        pressed && styles.pressed,
      ]}>
      <Glyph name={icon} family={family} size={22} color={selected ? color : colors.textMuted} />
      {label ? (
        <Text variant="tiny" tone={selected ? 'default' : 'muted'} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

interface PillProps {
  label: string;
  active?: boolean;
  /** Accent used for the active state (#RRGGBB). Defaults to the brand primary. */
  color?: string;
  icon?: string;
  iconFamily?: IconFamily;
  onPress: () => void;
  /** Share the row equally with sibling pills instead of hugging the label. */
  grow?: boolean;
  /** Use on the page background rather than inside a card. */
  raised?: boolean;
  accessibilityLabel?: string;
}

/** A pressable chip for shortcuts and single-choice options. */
export function Pill({ label, active, color, icon, iconFamily, onPress, grow, raised, accessibilityLabel }: PillProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.pill,
        grow && styles.pillGrow,
        {
          backgroundColor: active ? tint + '22' : raised ? colors.surface : colors.surfaceAlt,
          borderColor: active ? tint : colors.border,
        },
        pressed && styles.pressed,
      ]}>
      {icon ? <Glyph name={icon} family={iconFamily} size={14} color={active ? tint : colors.textMuted} /> : null}
      <Text variant="smallStrong" tone={active ? 'default' : 'muted'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* List actions                                                               */
/* -------------------------------------------------------------------------- */

interface IconButtonProps {
  icon: keyof typeof Feather.glyphMap;
  /** Read by screen readers; the button itself shows only the icon. */
  label: string;
  onPress: () => void;
  tone?: 'muted' | 'danger';
}

/** A small round icon button for secondary actions on a card. */
export function IconButton({ icon, label, onPress, tone = 'muted' }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.surfaceAlt, borderColor: colors.border },
        pressed && styles.pressed,
      ]}>
      <Feather name={icon} size={16} color={tone === 'danger' ? colors.danger : colors.textMuted} />
    </Pressable>
  );
}

interface InlineConfirmProps {
  title: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** An in-place "are you sure?" row. Used instead of a native alert so it also works on web. */
export function InlineConfirm({ title, detail, confirmLabel = 'Remove', cancelLabel = 'Cancel', onConfirm, onCancel }: InlineConfirmProps) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      accessibilityRole="alert"
      style={[styles.confirm, { backgroundColor: colors.dangerSoft }]}>
      <View style={styles.confirmText}>
        <Feather name="trash-2" size={16} color={colors.danger} style={styles.confirmIcon} />
        <View style={styles.flex}>
          <Text variant="smallStrong">{title}</Text>
          {detail ? (
            <Text variant="small" tone="muted">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.confirmActions}>
        <Button label={cancelLabel} size="sm" variant="secondary" onPress={onCancel} style={styles.flex} />
        <Button label={confirmLabel} size="sm" variant="danger" onPress={onConfirm} style={styles.flex} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  scrollContent: { paddingBottom: spacing.xxl },
  gutter: { paddingHorizontal: spacing.xl },
  pinned: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerError: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  field: { marginTop: spacing.md, marginBottom: spacing.sm },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
    marginRight: spacing.xs,
  },
  fieldLabel: { marginBottom: 0 },
  fieldError: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, marginLeft: spacing.xs },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontWeight: '600',
    // Web draws its own focus ring; the border colour already shows focus.
    outlineWidth: 0,
  },

  tile: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tileLabelled: { height: 66 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  pillGrow: { flex: 1, paddingHorizontal: spacing.xs },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirm: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, gap: spacing.md },
  confirmText: { flexDirection: 'row', gap: spacing.sm },
  confirmIcon: { marginTop: 1 },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
});
