import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';

import { FIREBASE_CONFIG } from './config';
import { LinkError } from './types';

/**
 * The one Firebase app of this build. Authentication (./auth) and Cloud Firestore (./remote) both
 * hang off it, which is how Firestore learns who is signed in.
 */
export function firebaseApp(): FirebaseApp {
  if (!FIREBASE_CONFIG) throw new LinkError('not-configured', 'Linking is not set up in this build.');
  return getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
}
