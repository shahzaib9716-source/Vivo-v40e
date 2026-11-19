import { useCallback } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/state/store';
import { useTheme } from '@/theme';

export default function ParentLayout() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { setRole } = useStore();

  // Whichever way this side was reached (welcome screen, deep link, web reload, Back), screens
  // that read the role see the right one.
  useFocusEffect(
    useCallback(() => {
      setRole('parent');
    }, [setRole]),
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: mode === 'dark' ? '#A7A1FF' : colors.primary,
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
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color as string} /> }}
      />
      <Tabs.Screen
        name="controls"
        options={{ title: 'Controls', tabBarIcon: ({ color, size }) => <Feather name="sliders" size={size - 2} color={color as string} /> }}
      />
      <Tabs.Screen
        name="location"
        options={{ title: 'Location', tabBarIcon: ({ color, size }) => <Feather name="map-pin" size={size - 2} color={color as string} /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{ title: 'Activity', tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size - 2} color={color as string} /> }}
      />
      <Tabs.Screen
        name="family"
        options={{ title: 'Family', tabBarIcon: ({ color, size }) => <Feather name="users" size={size - 2} color={color as string} /> }}
      />
    </Tabs>
  );
}

