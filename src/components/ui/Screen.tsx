import { ReactNode } from 'react';
import { ScrollView, View, ViewStyle, StyleSheet } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/theme';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  background?: string;
  contentStyle?: ViewStyle;
  footer?: ReactNode;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
  background,
  contentStyle,
  footer,
}: Props) {
  const { colors } = useTheme();
  const pad = padded ? { paddingHorizontal: spacing.xl } : undefined;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background ?? colors.bg }]} edges={edges}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[{ paddingBottom: spacing.huge }, pad, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, pad, contentStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
});
