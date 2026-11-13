import { Pressable, View, StyleSheet } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

export function SegmentedControl({ options, value, onChange }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceSunken }]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.seg, active && { backgroundColor: colors.surface }]}>
            <Text variant="smallStrong" tone={active ? 'default' : 'muted'}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3, borderRadius: radius.md, gap: 3 },
  seg: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
});
