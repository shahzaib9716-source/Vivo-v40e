
const fs = require('fs');
const path = require('path');

const EXPO_OWNER = 'zebi-1122';
const EXPO_PROJECT_ID = '6c3cab33-2dc1-44e3-8afe-138293e09ac9';

const FIREBASE_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

function readFirebaseConfig() {
  let raw = null;

  if (process.env.HAVEN_FIREBASE_CONFIG) {
    raw = JSON.parse(process.env.HAVEN_FIREBASE_CONFIG);
  } else {
    const file = path.join(__dirname, 'firebase.config.json');

    if (fs.existsSync(file)) {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  for (const key of ['apiKey', 'projectId', 'appId']) {
    if (typeof raw[key] !== 'string' || !raw[key]) {
      throw new Error(
        `Firebase configuration is missing "${key}".`
      );
    }
  }

  return Object.fromEntries(
    FIREBASE_KEYS
      .filter((key) => typeof raw[key] === 'string')
      .map((key) => [key, raw[key]])
  );
}

function withBackend(config) {
  const firebase = readFirebaseConfig();

  const firestoreEmulator =
    process.env.HAVEN_FIRESTORE_EMULATOR || null;

  const authEmulator =
    process.env.HAVEN_AUTH_EMULATOR || null;

  if (!firebase && !firestoreEmulator && !authEmulator) {
    return config;
  }

  const extra = { ...config.extra };

  if (firebase) {
    extra.firebase = firebase;
  }

  if (firestoreEmulator) {
    extra.firestoreEmulator = firestoreEmulator;
  }

  if (authEmulator) {
    extra.authEmulator = authEmulator;
  }

  const next = {
    ...config,
    extra,
  };

  const hosts = [
    ...new Set(
      [firestoreEmulator, authEmulator]
        .filter(Boolean)
        .map((value) => value.replace(/:\d+$/, ''))
    ),
  ];

  if (hosts.length === 0) {
    return next;
  }

  return {
    ...next,
    plugins: [
      ...(next.plugins ?? []),
      ...hosts.map((host) => [
        './plugins/withLocalEmulatorNetwork',
        { host },
      ]),
    ],
  };
}

function withUpdates(config) {
  const projectId = config.extra?.eas?.projectId;

  if (typeof projectId !== 'string' || !projectId) {
    return {
      ...config,
      updates: {
        ...config.updates,
        enabled: false,
      },
    };
  }

  return {
    ...config,
    runtimeVersion:
      config.runtimeVersion ?? {
        policy: 'fingerprint',
      },
    updates: {
      ...config.updates,
      enabled: true,
      url:
        config.updates?.url ??
        `https://u.expo.dev/${projectId}`,
    },
  };
}

function forAndroidSide(config, side) {
  if (!side) return config;
  if (side !== 'parent' && side !== 'child') throw new Error('HAVEN_ANDROID_SIDE must be parent or child.');
  if (!config.extra?.firebase) throw new Error('Paired Android builds require Firebase configuration.');
  const child = side === 'child';
  const images = './assets/images/child';
  return {
    ...config,
    name: child ? 'Haven Child' : 'Haven Parent',
    scheme: 'haven-' + side,
    icon: child ? images + '/icon.png' : config.icon,
    android: {
      ...config.android,
      package: config.android.package + '.' + side,
      adaptiveIcon: child ? {
        ...config.android.adaptiveIcon,
        foregroundImage: images + '/android-icon-foreground.png',
        backgroundImage: images + '/android-icon-background.png',
        monochromeImage: images + '/android-icon-monochrome.png',
      } : config.android.adaptiveIcon,
    },
    extra: { ...config.extra, androidSide: side },
    updates: { ...config.updates, enabled: false },
  };
}

module.exports = ({ config }) => {
  const linkedConfig = {
    ...config,
    owner: EXPO_OWNER,
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        projectId: EXPO_PROJECT_ID,
      },
    },
  };

  return forAndroidSide(withUpdates(withBackend(linkedConfig)), process.env.HAVEN_ANDROID_SIDE);
};
