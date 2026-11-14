import Constants from 'expo-constants';

/**
 * Which app this build is.
 *
 * One codebase builds three things (see app.config.js, which reads the APP_VARIANT environment
 * variable at build time and puts the answer in `extra.variant`):
 *   'parent'  the Haven app, parent side only
 *   'child'   the Haven Kids app, child side only
 *   null      the combined build with the role chooser, for Expo Go and web
 */
export type AppVariant = 'parent' | 'child';

function readVariant(): AppVariant | null {
  try {
    // `expoConfig` can be null and `extra` is absent when the config sets none.
    const value: unknown = Constants.expoConfig?.extra?.variant;
    return value === 'parent' || value === 'child' ? value : null;
  } catch {
    return null;
  }
}

export const APP_VARIANT: AppVariant | null = readVariant();

/** True in a parent-only or child-only build. Such a build has no role chooser and no "Switch mode". */
export const isSingleSide = APP_VARIANT !== null;

/** The name on the home screen. */
export const APP_NAME = APP_VARIANT === 'child' ? 'Haven Kids' : 'Haven';

/** First screen of each side. */
export const SIDE_HOME: Record<AppVariant, string> = {
  parent: '/(parent)/dashboard',
  child: '/(child)/home',
};

/**
 * Background of the native splash screen, for screens that hold its colour while the app gets
 * ready. Keep in step with the splash settings in app.json and app.config.js.
 */
export const SPLASH_BG: Record<'light' | 'dark', string> =
  APP_VARIANT === 'child' ? { light: '#E8553C', dark: '#3D1814' } : { light: '#5B51E0', dark: '#1B183F' };

/**
 * Shown next to every "preview the other app" control in a single-side build. There is no server
 * in this demo, so the Haven Kids app on one phone cannot reach the Haven app on another: each
 * installed app keeps its own demo data. The preview lets one phone show the whole loop.
 */
export const NO_SERVER_NOTE = 'This demo build has no server linking two phones, so each app keeps its own data.';
