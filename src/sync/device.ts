import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** What firestore.rules accepts as `platform`. */
export function platformName(): 'android' | 'ios' | 'web' {
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

const FALLBACK: Record<string, string> = { android: 'Android phone', ios: 'iPhone', web: 'Web browser' };

/**
 * A name for this phone that a parent will recognise in the list of devices: the name the owner
 * gave it, else its model. At most 40 characters and never empty, as the rules demand.
 */
export function deviceLabel(): string {
  let name: string | null = null;
  try {
    name = Platform.OS === 'web' ? null : (Device.deviceName ?? Device.modelName);
  } catch {
    name = null;
  }
  const clean = (name ?? '').trim();
  return Array.from(clean || FALLBACK[platformName()]).slice(0, 40).join('');
}
