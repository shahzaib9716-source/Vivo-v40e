import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { APP_NAME } from '@/config/variant';
import { StoreProvider, useStore } from '@/state/store';
import { LinkProvider, useLink } from '@/sync/link';
import { ManagedDevicePolicy } from '@/components/ManagedDevicePolicy';
import { PolicyStatus } from '@/sync/policyStatus';
import { palette } from '@/theme';

export default function RootLayout() {
  const [policyStatus, setPolicyStatus] = useState('');
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = APP_NAME;
  }, []);

  const navTheme =
    scheme === 'dark'
      ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: palette.dark.bg, card: palette.dark.surface } }
      : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: palette.light.bg, card: palette.light.surface } };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <LinkProvider>
            <ThemeProvider value={navTheme}>
              <ManagedDevicePolicy onStatus={setPolicyStatus} />
              <PolicyStatus.Provider value={policyStatus}><Screens scheme={scheme} /></PolicyStatus.Provider>
              <StatusBar style="auto" />
            </ThemeProvider>
          </LinkProvider>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Every screen of the app, with the two sides closed to the wrong role.
 *
 * One app holds both sides. Which one a device may open:
 *   - in a family: the role the server gave this device's account (`link.role`). A child's phone
 *     cannot open the parent side, and a parent's cannot open the child side;
 *   - not in a family: both, with sample data, from the side chosen at setup.
 *
 * This is what the person sees, not what protects the data. A child's account is refused by the
 * server (firestore.rules) whatever a changed app sends; closing the screens just means the app
 * never offers what the server would refuse.
 */
function Screens({ scheme }: { scheme: 'light' | 'dark' }) {
  const link = useLink();
  const { role, setRole, linkedRoleAtStart } = useStore();
  // While the link layer is still reading this device's record at start, the role saved with it
  // stands in, so a deep link opened at a cold start cannot show the other side for a moment.
  const serverRole = link.role ?? (link.status === 'connecting' ? linkedRoleAtStart : null);

  // Keep the saved side in step with the server's, so screens that read the side agree with it and
  // the device stays on that side if it later leaves the family.
  useEffect(() => {
    if (serverRole && role !== serverRole) setRole(serverRole);
  }, [serverRole, role, setRole]);

  const parentAllowed = serverRole !== 'child';
  const childAllowed = serverRole !== 'parent';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette[scheme].bg },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="messages" />
      <Stack.Screen name="transparency" />
      <Stack.Screen name="link-device" />
      <Stack.Screen name="about-version" />

      {/* The parent side: the tabs and everything reached from them. */}
      <Stack.Protected guard={parentAllowed}>
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="account" />
        <Stack.Screen name="pairing" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="child-profile" />
        <Stack.Screen name="screen-time" />
        <Stack.Screen name="app-limits" />
        <Stack.Screen name="schedules" />
        <Stack.Screen name="add-schedule" />
        <Stack.Screen name="routines" />
        <Stack.Screen name="web-filter" />
        <Stack.Screen name="site-list" />
        <Stack.Screen name="geofences" />
        <Stack.Screen name="add-place" />
        <Stack.Screen name="location-history" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="reports" />
        <Stack.Screen name="rewards-parent" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="feature/[key]" />
      </Stack.Protected>

      {/* The child side. */}
      <Stack.Protected guard={childAllowed}>
        <Stack.Screen name="(child)" />
        <Stack.Screen name="sos" options={{ animation: 'fade_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="unlock-request" />
      </Stack.Protected>
    </Stack>
  );
}

