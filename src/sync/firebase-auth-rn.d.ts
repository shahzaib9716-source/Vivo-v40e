/**
 * `getReactNativePersistence` is exported by the React Native build of @firebase/auth
 * (dist/rn/index.js, which Metro picks on Android and iOS), but not by the type declarations
 * TypeScript resolves: the package's export map lists a generic "types" entry before its
 * "react-native" one, and the first match wins, even with `customConditions: ["react-native"]`.
 * This adds the one missing declaration, copied from @firebase/auth/dist/rn/index.rn.d.ts.
 *
 * Only ./authInstance.native.ts may use it: the web build of the package has no such export.
 */
import type { Persistence, ReactNativeAsyncStorage } from '@firebase/auth';

declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
