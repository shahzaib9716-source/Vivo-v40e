import { View } from 'react-native';

import { radius, useTheme } from '@/theme';

interface Props {
  progress: number; // 0..1
  color?: string;
  track?: string;
  height?: number;
}

export function ProgressBar({ progress, color, track, height = 8 }: Props) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: track ?? colors.surfaceSunken, overflow: 'hidden' }}>
      <View style={{ width: `${clamped * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: color ?? colors.primary }} />
    </View>
  );
}
