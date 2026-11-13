import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export const unstable_settings = { initialRouteName: 'dashboard' };

export default function ParentLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
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
