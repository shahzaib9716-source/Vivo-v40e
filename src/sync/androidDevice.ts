import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid as Permissions } from 'react-native';
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { localDay, readDays, recordDay, type UsageDay } from './usageWeek';
import { db } from './remote';

export interface AppUsage { pkg: string; label: string; ms: number; weeklyMs?: number; lastUsedAt?: number }
export interface DevicePermissions {
  usage: boolean;
  location: boolean;
  admin: boolean;
  owner: boolean;
  notifications: boolean;
  batteryExempt: boolean;
  screeningRole?: boolean;
  screeningEnabled?: boolean;
}

export interface TripEvent {
  event: 'started' | 'fix' | 'stopped';
  scope: string;
  session: string;
  message: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  measuredAt?: number;
}
interface DeviceModule {
  addListener?(name: 'onTrip', listener: (event: TripEvent) => void): { remove(): void };
  startTrip?(scope: string, session: string, threshold: number): Promise<void>;
  endTrip?(): Promise<void>;
  tripScope?(): Promise<string | null>;
  chooseCheckinImage?(): Promise<string | null>;
  recordVoiceNote?(): Promise<string | null>;
  playVoiceNote?(audio: string): Promise<void>;
  takeCheckinPhoto?(): Promise<string | null>;
  permissionStatus?(): Promise<DevicePermissions>;
  batteryPercent?(): Promise<number>;
  requestScreeningRole?(): Promise<void>;
  setScreeningEnabled?(value: boolean): Promise<void>;
  openAdminActivation?(): Promise<void>;
  openBatterySettings?(): Promise<void>;
  applyPolicy(payload: string): Promise<string>;
  clearPolicy(): Promise<void>;
  currentFix(): Promise<{ latitude: number; longitude: number; accuracyM: number; measuredAt: number }>;
  readUsage(): Promise<{ apps: AppUsage[]; screenMs: number; measuredAt: number; days?: UsageDay[] }>;
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

export function shareUsage(family: string, child: string, by: string, apps: AppUsage[], measuredAt: number, screenMs: number, observed?: UsageDay[]) {
  if (apps.length > 1000) throw Error('The device exceeds the 1,000-app report limit.');
  return runTransaction(db(), async tx => {
    const ref = usageRef(family, child);
    const previous = (await tx.get(ref)).data();
    if (previous && previous.measuredAt > measuredAt) throw Error('A newer usage report has already been shared.');
    const days = recordDay(previous?.days, localDay(measuredAt), screenMs, observed);
    tx.set(ref, { apps, measuredAt, screenMs, days, by, receivedAt: serverTimestamp() });
  });
}
export function clearUsage(family: string, child: string) {
  return runTransaction(db(), async tx => { tx.delete(usageRef(family, child)); });
}
export function listenUsage(family: string, child: string, data: (apps: AppUsage[], at: number, screenMs: number | undefined, days: UsageDay[]) => void, error: (e: Error) => void) {
  return onSnapshot(usageRef(family, child), snap => {
    const value = snap.data();
    if (!value) { data([], 0, undefined, []); return; }
    if (!Array.isArray(value.apps) || !Number.isSafeInteger(value.measuredAt) ||
        !value.apps.every(a => a && typeof a.pkg === 'string' && typeof a.label === 'string' && Number.isSafeInteger(a.ms) && a.ms >= 0)) {
      error(Error('Invalid device report.')); return;
    }
    const apps: AppUsage[] = value.apps.map(a => ({
      pkg: a.pkg,
      label: a.label,
      ms: a.ms,
      weeklyMs: Number.isSafeInteger(a.weeklyMs) && a.weeklyMs > 0 && a.weeklyMs <= 7 * 93600000 ? a.weeklyMs : undefined,
      lastUsedAt: Number.isSafeInteger(a.lastUsedAt) && a.lastUsedAt > 0 && a.lastUsedAt <= value.measuredAt ? a.lastUsedAt : undefined,
    }));
    data(apps, value.measuredAt, Number.isSafeInteger(value.screenMs) ? value.screenMs : undefined, readDays(value.days));
  }, error);
}

export interface PackageRule { pkg: string; minutes: number; blocked: boolean }
export function policyCollection(family: string, child: string) {
  return collection(db(), 'families', family, 'children', child, 'packageRules');
}
export function listenPolicy(family: string, child: string, data: (rules: PackageRule[]) => void, error: (e: Error) => void) {
  return onSnapshot(policyCollection(family, child), { includeMetadataChanges: true }, snap => {
    if (snap.metadata.fromCache) return;
    data(snap.docs.map(d => ({ pkg: d.id, minutes: d.get('minutes'), blocked: d.get('blocked') })));
  }, error);
}
