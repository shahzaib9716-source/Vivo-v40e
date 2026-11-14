import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin wrappers around AsyncStorage that never throw and never reject, so the store can call them
 * from effects and event handlers without guarding every call. A missing native module, a full
 * disk or a blocked `localStorage` all end up as "nothing read" or "not written".
 *
 * The storage call itself is made synchronously, before the first await. On web that means the
 * value is already in `localStorage` when the function returns, which a save made while the page
 * is being hidden depends on.
 */

/** The stored string, or null when the key is missing or could not be read. */
export async function readKey(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Resolves to false when the value could not be written. */
export async function writeKey(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Resolves to false when the key could not be removed. */
export async function removeKey(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
