import { useCallback } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/state/store';
import { useTheme } from '@/theme';

export default function ChildLayout() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { setRole } = useStore();

  // Whichever way this side was reached (welcome screen, deep link, web reload, Back), screens
  // that read the role see the right one.
  useFocusEffect(
    useCallback(() => {
      setRole('child');
    }, [setRole]),
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: mode === 'dark' ? colors.accent : '#C2410C',
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 66 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600', marginTop: 2 },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color as string} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: ({ color, size }) => <Feather name="send" size={size - 2} color={color as string} /> }} />
      <Tabs.Screen name="rewards" options={{ title: 'Rewards', tabBarIcon: ({ color, size }) => <Feather name="award" size={size - 2} color={color as string} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: ({ color, size }) => <Feather name="smile" size={size - 2} color={color as string} /> }} />
    </Tabs>
  );
}
