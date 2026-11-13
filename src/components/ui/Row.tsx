import { ReactNode } from 'react';
import { AccessibilityRole, Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { radius, spacing, useTheme } from '@/theme';
import { IconBadge } from './IconBadge';
import { Text } from './Text';
import { ToggleLabelContext } from './Toggle';

interface Props {
  title: string;
  subtitle?: string;
  icon?: string;
  iconFamily?: 'feather' | 'ion' | 'mci';
  iconColor?: string;
  onPress?: () => void;
  right?: ReactNode;
  chevron?: boolean;
  badge?: string;
  badgeColor?: string;
  danger?: boolean;
  /** Spoken name for a pressable row. Defaults to the title, subtitle and badge read together. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Role of a pressable row. Defaults to "button"; use "radio" for pick-one lists. */
  accessibilityRole?: AccessibilityRole;
  /** Checked state for "radio" / "checkbox" rows. */
  checked?: boolean;
}

export function Row({
  title,
  subtitle,
  icon,
  iconFamily = 'feather',
  iconColor,
  onPress,
  right,
  chevron = true,
  badge,
  badgeColor,
  danger,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  checked,
}: Props) {
  const { colors } = useTheme();
  const tint = iconColor ?? colors.primary;

  const content = (
    <View style={styles.row}>
      {icon && <IconBadge name={icon} family={iconFamily} color={danger ? colors.danger : tint} size={40} />}
      <View style={styles.text}>
        <Text variant="title" tone={danger ? 'danger' : 'default'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" tone="muted" numberOfLines={2} style={{ marginTop: 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {badge != null && (
        <View style={[styles.badge, { backgroundColor: (badgeColor ?? colors.primary) + '22' }]}>
          <Text variant="tiny" color={badgeColor ?? colors.primary}>
            {badge}
          </Text>
        </View>
      )}
      {/* A Toggle in the right slot takes the row title as its accessible name. */}
      {right != null && <ToggleLabelContext.Provider value={title}>{right}</ToggleLabelContext.Provider>}
      {chevron && onPress && <Feather name="chevron-right" size={20} color={colors.textFaint} />}
    </View>
  );

  if (!onPress) return <View style={styles.wrap}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, badge].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={checked != null ? { checked } : undefined}
      aria-checked={checked}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Rows with an icon are 56pt tall. The minimum keeps icon-less rows at a 44pt press target.
  wrap: { paddingVertical: spacing.sm, minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
