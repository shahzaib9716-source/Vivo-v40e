import { View, ViewStyle } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { radius } from '@/theme';

type Family = 'feather' | 'ion' | 'mci';

interface Props {
  name: string;
  color: string;
  size?: number;
  family?: Family;
  style?: ViewStyle;
  soft?: boolean;
}

/** A rounded tinted tile holding an icon — the recurring motif across Haven. */
export function IconBadge({ name, color, size = 44, family = 'feather', style, soft = true }: Props) {
  const iconSize = Math.round(size * 0.5);
  const Comp = family === 'ion' ? Ionicons : family === 'mci' ? MaterialCommunityIcons : Feather;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: soft ? color + '22' : color,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      {/* @ts-expect-error icon name is validated by caller against the chosen family */}
      <Comp name={name} size={iconSize} color={soft ? color : '#FFFFFF'} />
    </View>
  );
}
