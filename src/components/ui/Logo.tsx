import { View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { radius, shadow } from '@/theme';

/**
 * Haven logo mark — an original abstract: a sheltering roof over a heart,
 * drawn as vector paths. Not derived from any existing brand.
 */
export function Logo({ size = 56, color = '#5B51E0', style }: { size?: number; color?: string; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          ...shadow(2),
        },
        style,
      ]}>
      <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 48 48">
        {/* roof / shelter */}
        <Path d="M24 5 L43 19 L37 19 L37 20 L11 20 L11 19 L5 19 Z" fill="#FFFFFF" />
        {/* heart inside the haven */}
        <Path
          d="M24 41 C 12 32 14 23 20 23 C 23 23 24 26 24 26 C 24 26 25 23 28 23 C 34 23 36 32 24 41 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

export function LogoBadge({ size = 56 }: { size?: number }) {
  return <Logo size={size} />;
}

export const logoRadius = radius.lg;
