import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  progress: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
  centerColor?: string;
}

export function ProgressRing({ progress, size = 120, stroke = 12, color, track, label, sublabel, centerColor }: Props) {
  const { colors } = useTheme();
  const c = color ?? colors.primary;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? colors.surfaceSunken} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      {(label || sublabel) && (
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          {label && (
            <Text variant="h1" color={centerColor}>
              {label}
            </Text>
          )}
          {sublabel && (
            <Text variant="small" tone="muted">
              {sublabel}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
