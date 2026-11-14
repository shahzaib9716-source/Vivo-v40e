import type { FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * Web: the SDK's own persistence (IndexedDB, falling back to localStorage), so a reload keeps the
 * person signed in. Android and iOS use ./authInstance.native.ts instead, which Metro picks by its
 * file name.
 */
export function createAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}
