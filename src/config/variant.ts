/**
 * Haven is one app with two sides. Which side a device shows is chosen when it is set up and,
 * once the device is in a family, fixed by the role the server gave it (see src/app/_layout.tsx).
 * It is not a build setting: Android and iOS get the same app.
 */
export type AppSide = 'parent' | 'child';

/** The name on the home screen. */
export const APP_NAME = 'Haven';

/** First screen of each side. */
export const SIDE_HOME: Record<AppSide, string> = {
  parent: '/(parent)/dashboard',
  child: '/(child)/home',
};

/**
 * Background of the native splash screen, for screens that hold its colour while the app gets
 * ready. Keep in step with the splash settings in app.json.
 */
export const SPLASH_BG: Record<'light' | 'dark', string> = { light: '#5B51E0', dark: '#1B183F' };
