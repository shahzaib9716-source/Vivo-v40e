import { View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
}

interface Props {
  data: Bar[];
  height?: number;
  color?: string;
  unit?: string;
}

export function BarChart({ data, height = 140, color, unit }: Props) {
  const { colors } = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  const tint = color ?? colors.primary;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: spacing.sm }}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.value / max) * (height - 28));
        const on = d.highlight;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flex: 1, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
              <View
                style={{
                  width: '72%',
                  height: h,
                  borderRadius: radius.sm,
                  backgroundColor: on ? tint : tint + '33',
                }}
              />
            </View>
            <Text variant="tiny" tone={on ? 'default' : 'faint'}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
