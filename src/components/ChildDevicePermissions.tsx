import { useCallback, useState } from 'react';
import { AppState, Button, Linking, Platform, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, SectionLabel, Text } from '@/components/ui';
import { device, type DevicePermissions } from '@/sync/androidDevice';

export function ChildDevicePermissions() {
  const [status, setStatus] = useState<{ values: DevicePermissions; checkedAt: number }>();
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!device?.permissionStatus) return;
    setError('');
    try {
      setStatus({ values: await device.permissionStatus(), checkedAt: Date.now() });
    } catch {
      setStatus(undefined);
      setError('Android permission status could not be checked. Try Refresh.');
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]));

  if (Platform.OS !== 'android') return null;
  const values = status?.values;
  function open(action: () => Promise<unknown>) {
    setError('');
    void action().catch(() => setError('This settings screen is unavailable on your phone. Open Android Settings to manage permissions.'));
  }

  return <>
    <SectionLabel>Child device permissions</SectionLabel>
    <Card>
      {!device?.permissionStatus ? <Text>Install an updated Haven Android build to check device permissions here.</Text> : (
        <View style={{ gap: 10 }}>
          <Text accessibilityLiveRegion="polite">{status ? 'Last checked ' + new Date(status.checkedAt).toLocaleString() : 'Waiting for Android permission status'}</Text>
          <Text>Usage Access · {label(values?.usage, 'Granted', 'Required for usage reports')}</Text>
          <Button title="Open Usage Access" onPress={() => open(async () => device?.openUsageSettings())} />
          <Text>Foreground location · {label(values?.location, 'Granted', 'Required for GPS sharing')}</Text>
          <Text>Background location · Haven shares GPS from the open child screen.</Text>
          <Text>Notifications · {label(values?.notifications, 'Allowed', 'Disabled')}</Text>
          <Button title="Open Haven app settings" onPress={() => open(Linking.openSettings)} />
          <Text>Device Administrator · {label(values?.admin, 'Active', 'Inactive')}</Text>
          {values && !values.admin && device.openAdminActivation && <Button title="Review Android administrator activation" onPress={() => open(async () => device?.openAdminActivation?.())} />}
          <Text>Device Owner · {label(values?.owner, 'Enrolled', 'Enrollment required for enforcement')}</Text>
          <Text>Battery optimization · {label(values?.batteryExempt, 'Exempt', 'Android battery optimization applies')}</Text>
          <Text>Vivo background and autostart controls are managed in Funtouch OS settings.</Text>
          {device.openBatterySettings && <Button title="Open battery optimization settings" onPress={() => open(async () => device?.openBatterySettings?.())} />}
          <Button title="Refresh permissions" onPress={() => void refresh()} />
          {error && <Text accessibilityLiveRegion="polite">{error}</Text>}
        </View>
      )}
    </Card>
  </>;
}

function label(value: boolean | undefined, enabled: string, disabled: string) {
  return value === undefined ? 'Unknown' : value ? enabled : disabled;
}
