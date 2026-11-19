import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid as Permissions } from 'react-native';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './remote';

export interface AppUsage { pkg: string; label: string; ms: number }
interface DeviceModule {
  currentFix(): Promise<{ latitude: number; longitude: number; accuracyM: number }>;
  readUsage(): Promise<AppUsage[]>;
  openUsageSettings(): Promise<void>;
}
export const device = requireOptionalNativeModule<DeviceModule>('HavenDevice');

export async function requestFix() {
  if (!device) throw Error('Install the Android version of Haven.');
  const { ACCESS_FINE_LOCATION: fine, ACCESS_COARSE_LOCATION: coarse } = Permissions.PERMISSIONS;
  const result = await Permissions.requestMultiple([coarse, fine]);
  if (result[fine] !== 'granted' && result[coarse] !== 'granted') {
    throw Error('Allow location while using Haven in Android Settings to share a check-in.');
  }
  return device.currentFix();
}

const usageRef = (family: string, child: string) => doc(db(), 'families', family, 'children', child, 'usage', 'latest');

export function shareUsage(family: string, child: string, by: string, apps: AppUsage[], measuredAt: number) {
  if (apps.length > 1000) throw Error('The device exceeds the 1,000-app report limit.');
  return runTransaction(db(), async tx => {
    tx.set(usageRef(family, child), { apps, measuredAt, by, receivedAt: serverTimestamp() });
  });
}
export function clearUsage(family: string, child: string) {
  return runTransaction(db(), async tx => { tx.delete(usageRef(family, child)); });
}
export function listenUsage(family: string, child: string, data: (apps: AppUsage[], at: number) => void, error: (e: Error) => void) {
  return onSnapshot(usageRef(family, child), snap => {
    const value = snap.data();
    if (!value) { data([], 0); return; }
    if (!Array.isArray(value.apps) || !Number.isSafeInteger(value.measuredAt) ||
        !value.apps.every(a => a && typeof a.pkg === 'string' && typeof a.label === 'string' && Number.isSafeInteger(a.ms) && a.ms >= 0)) {
      error(Error('Invalid device report.')); return;
    }
    data(value.apps, value.measuredAt);
  }, error);
}
