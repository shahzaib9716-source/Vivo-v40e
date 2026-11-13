import { ReactNode } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { spacing, useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  large?: boolean;
}

export function Header({ title, subtitle, back, right, large }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { paddingTop: large ? spacing.sm : spacing.md }]}>
      <View style={styles.topRow}>
        {back ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : (router.replace as any)('/'))}
            hitSlop={10}
            style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="chevron-left" size={22} color={colors.text} />
          </Pressable>
        ) : (
          <View />
        )}
        {right}
      </View>
      {title != null && (
        <View style={{ marginTop: back ? spacing.md : 0 }}>
          <Text variant={large ? 'display' : 'h1'}>{title}</Text>
          {subtitle && (
            <Text variant="body" tone="muted" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  iconBtn: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
