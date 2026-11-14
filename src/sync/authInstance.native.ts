import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';

/**
 * Android and iOS: the account is kept in AsyncStorage, so the person stays signed in across
 * restarts. Without this the SDK keeps it in memory only and every start would be signed out.
 * (`getReactNativePersistence` is typed by ./firebase-auth-rn.d.ts.)
 */
export function createAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Already initialised (a fast refresh during development): use that instance.
    return getAuth(app);
  }
}
