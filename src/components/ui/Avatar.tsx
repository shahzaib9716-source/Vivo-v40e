import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

const AVATAR_COLORS = ['#5B51E0', '#FF7A59', '#12B5A6', '#2E8BFF', '#EC4899', '#F5A623'];

export function colorForName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ name, size = 44, ring }: { name: string; size?: number; ring?: boolean }) {
  const { colors } = useTheme();
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const bg = colorForName(name);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 3 : 0,
        borderColor: colors.surface,
      }}>
      <Text color="#FFFFFF" style={{ fontSize: size * 0.4, fontWeight: '700' }}>
        {initials}
      </Text>
    </View>
  );
}
