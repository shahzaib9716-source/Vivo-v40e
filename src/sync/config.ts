import Constants from 'expo-constants';

/**
 * The Firebase web config for this build, or null when the build has none.
 *
 * It comes from `firebase.config.json` in the project root (or the HAVEN_FIREBASE_CONFIG
 * environment variable) by way of app.config.js, which puts it in `extra.firebase`. These
 * values identify the Firebase project; they are not passwords. Access is decided by
 * firestore.rules.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  projectId: string;
  appId: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function read(): FirebaseWebConfig | null {
  try {
    const raw: unknown = Constants.expoConfig?.extra?.firebase;
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.apiKey !== 'string' || typeof c.projectId !== 'string' || typeof c.appId !== 'string') return null;
    if (!c.apiKey || !c.projectId || !c.appId) return null;
    return c as unknown as FirebaseWebConfig;
  } catch {
    return null;
  }
}

function readEmulator(): { host: string; port: number } | null {
  try {
    const raw: unknown = Constants.expoConfig?.extra?.firestoreEmulator;
    if (typeof raw !== 'string' || !raw.includes(':')) return null;
    const [host, port] = raw.split(':');
    const n = Number(port);
    return host && Number.isInteger(n) && n > 0 ? { host, port: n } : null;
  } catch {
    return null;
  }
}

export const FIREBASE_CONFIG: FirebaseWebConfig | null = read();

/** For local testing only: "host:port" of a Firestore emulator (HAVEN_FIRESTORE_EMULATOR). */
export const FIRESTORE_EMULATOR = readEmulator();

/** True when this build can link devices. */
export const isBackendConfigured = FIREBASE_CONFIG !== null;
