import { ReactNode } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { radius, spacing, useTheme } from '@/theme';
import { IconBadge } from './IconBadge';
import { Text } from './Text';

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
      {right}
      {chevron && onPress && <Feather name="chevron-right" size={20} color={colors.textFaint} />}
    </View>
  );

  if (!onPress) return <View style={styles.wrap}>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
