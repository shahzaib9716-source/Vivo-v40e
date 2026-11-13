import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';

import { radius, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * A stylized, abstract map surface — not real tiles or any external map data.
 * Used to represent a location view in the demo without a native maps module.
 */
export function MockMap({
  height = 200,
  pinColor,
  pinLabel,
  rounded = true,
}: {
  height?: number;
  pinColor?: string;
  pinLabel?: string;
  rounded?: boolean;
}) {
  const { colors, mode } = useTheme();
  const land = mode === 'dark' ? '#1C2430' : '#E9EEF5';
  const road = mode === 'dark' ? '#2B3747' : '#FFFFFF';
  const park = mode === 'dark' ? '#17301F' : '#DCEFE0';
  const water = mode === 'dark' ? '#132A3A' : '#CFE4F5';
  const tint = pinColor ?? colors.primary;

  return (
    <View style={{ height, borderRadius: rounded ? radius.lg : 0, overflow: 'hidden', backgroundColor: land }}>
      <Svg width="100%" height="100%" viewBox="0 0 320 200">
        <Path d="M0 120 Q 80 90 160 130 T 320 110 V200 H0 Z" fill={water} opacity={0.9} />
        <Path d="M190 0 h60 v70 h-60 Z" fill={park} />
        <Path d="M0 60 H320" stroke={road} strokeWidth={10} />
        <Path d="M0 150 H320" stroke={road} strokeWidth={8} />
        <Path d="M90 0 V200" stroke={road} strokeWidth={9} />
        <Path d="M230 0 V200" stroke={road} strokeWidth={7} />
        <Path d="M160 0 V200" stroke={road} strokeWidth={5} opacity={0.8} />
        <SvgCircle cx={160} cy={100} r={26} fill={tint} opacity={0.14} />
      </Svg>
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={[styles.pin, { backgroundColor: tint }]}>
          <Feather name="user" size={16} color="#FFFFFF" />
        </View>
        <View style={[styles.pinStem, { backgroundColor: tint }]} />
      </View>
      {pinLabel && (
        <View style={[styles.label, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="smallStrong">{pinLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 14, alignItems: 'center', justifyContent: 'center' },
  pin: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  pinStem: { width: 3, height: 10, marginTop: -2, borderRadius: 2 },
  label: { position: 'absolute', bottom: 12, left: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
});
