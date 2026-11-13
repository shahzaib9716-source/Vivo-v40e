import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';
import { fitFontSize } from './fitText';
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
  /** Spoken description. Defaults to the label and sublabel read together. */
  accessibilityLabel?: string;
}

const LINE_HEIGHT = 1.2;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ProgressRing({
  progress,
  size = 120,
  stroke = 12,
  color,
  track,
  label,
  sublabel,
  centerColor,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const c = color ?? colors.primary;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
  const offset = circumference * (1 - clamped);

  // Centre text. Sizes follow the hole in the ring (size minus the stroke on both sides), so a
  // 104pt ring gets a proportionally smaller label than a 168pt one.
  const hole = Math.max(0, size - stroke * 2);
  const labelBase = clamp(hole * 0.21, 11, 34);
  const sublabelBase = clamp(hole * 0.1, 10, 14);
  // The two lines form a block centred in the circle. Its top and bottom edges sit on a chord
  // that is narrower than the diameter; that chord is the widest either line may be.
  const blockHeight = (label ? labelBase : 0) * LINE_HEIGHT + (sublabel ? sublabelBase : 0) * LINE_HEIGHT;
  const chord = 2 * Math.sqrt(Math.max(0, (hole / 2) ** 2 - (blockHeight / 2) ** 2));
  const maxWidth = Math.max(0, chord - 8);
  const labelSize = label ? fitFontSize(label, labelBase, maxWidth) : 0;
  const sublabelSize = sublabel ? fitFontSize(sublabel, sublabelBase, maxWidth, 8) : 0;

  const spoken = accessibilityLabel ?? [label, sublabel].filter(Boolean).join(' ');

  return (
    <View
      accessible={spoken.length > 0}
      accessibilityRole={spoken ? 'text' : undefined}
      accessibilityLabel={spoken || undefined}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
        <View style={{ position: 'absolute', width: maxWidth, alignItems: 'center' }}>
          {label && (
            <Text
              variant="h1"
              color={centerColor}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              maxFontSizeMultiplier={1.2}
              style={{ fontSize: labelSize, lineHeight: Math.round(labelSize * LINE_HEIGHT), maxWidth, textAlign: 'center' }}>
              {label}
            </Text>
          )}
          {sublabel && (
            <Text
              variant="small"
              tone="muted"
              color={centerColor}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              maxFontSizeMultiplier={1.2}
              style={{
                fontSize: sublabelSize,
                lineHeight: Math.round(sublabelSize * LINE_HEIGHT),
                maxWidth,
                textAlign: 'center',
                opacity: centerColor ? 0.85 : 1,
              }}>
              {sublabel}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
