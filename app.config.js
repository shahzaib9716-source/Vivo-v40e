/**
 * Dynamic app config. The static values live in app.json; this file adds what depends on the
 * build environment:
 *
 *   - the Firebase web config that links phones (firebase.config.json, or HAVEN_FIREBASE_CONFIG)
 *   - EAS Update, once the project has an EAS project id (see docs/RELEASE.md)
 *   - local emulator settings for test builds
 *
 * Haven is one app for Android and iOS. The parent or child role is chosen in the app at setup
 * and then fixed by the server; it is not a build setting.
 */

const fs = require('fs');
const path = require('path');

const FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

/**
 * The backend that links two phones (see docs/BACKEND.md). The Firebase web config is read from
 * the HAVEN_FIREBASE_CONFIG environment variable (a JSON string) or from firebase.config.json
 * next to this file. With neither, the build has no backend and linking is switched off.
 * HAVEN_FIRESTORE_EMULATOR and HAVEN_AUTH_EMULATOR ("host:port") point the app at local Firebase
 * emulators for tests.
 */
function readFirebaseConfig() {
  let raw = null;
  if (process.env.HAVEN_FIREBASE_CONFIG) {
    raw = JSON.parse(process.env.HAVEN_FIREBASE_CONFIG);
  } else {
    const file = path.join(__dirname, 'firebase.config.json');
    if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  if (!raw || typeof raw !== 'object') return null;
  for (const key of ['apiKey', 'projectId', 'appId']) {
    if (typeof raw[key] !== 'string' || !raw[key]) {
      throw new Error(`The Firebase config is missing "${key}". Copy the whole firebaseConfig object from the Firebase console.`);
    }
  }
  return Object.fromEntries(FIREBASE_KEYS.filter((key) => typeof raw[key] === 'string').map((key) => [key, raw[key]]));
}

/** Adds the backend settings to `extra`, for every variant. */
function withBackend(config) {
  const firebase = readFirebaseConfig();
  const firestoreEmulator = process.env.HAVEN_FIRESTORE_EMULATOR || null;
  const authEmulator = process.env.HAVEN_AUTH_EMULATOR || null;
  if (!firebase && !firestoreEmulator && !authEmulator) return config;
  const next = { ...config, extra: { ...config.extra, firebase, firestoreEmulator, authEmulator } };
  // Local emulators speak plain HTTP, which Android refuses by default. Allow it to their host
  // in test builds that name an emulator, and only in those.
  const hosts = [...new Set([firestoreEmulator, authEmulator].filter(Boolean).map((value) => value.replace(/:\d+$/, '')))];
  if (hosts.length === 0) return next;
  return { ...next, plugins: [...(next.plugins ?? []), ...hosts.map((host) => ['./plugins/withLocalEmulatorNetwork', { host }])] };
}

/**
 * EAS Update: over-the-air updates for JavaScript and assets. Switched on only when the project is
 * linked to EAS (`eas init` writes extra.eas.projectId into app.json). The runtime version is a
 * fingerprint of everything native, so an update is only ever offered to builds it is compatible
 * with: a JavaScript change goes over the air, a native change needs a new build.
 */
function withUpdates(config) {
  const projectId = config.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || !projectId) {
    return { ...config, updates: { ...config.updates, enabled: false } };
  }
  return {
    ...config,
    runtimeVersion: config.runtimeVersion ?? { policy: 'fingerprint' },
    updates: { ...config.updates, url: config.updates?.url ?? `https://u.expo.dev/${projectId}` },
  };
}

/** @param {import('expo/config').ConfigContext} context */
module.exports = ({ config }) => withUpdates(withBackend(config));
