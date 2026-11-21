import Constants from 'expo-constants';

export type AppSide = 'parent' | 'child';

const side = Constants.expoConfig?.extra?.androidSide;
export const BUILD_SIDE: AppSide | null = side === 'parent' || side === 'child' ? side : null;
export const APP_NAME = BUILD_SIDE === 'parent' ? 'Haven Parent' : BUILD_SIDE === 'child' ? 'Haven Child' : 'Haven';

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
