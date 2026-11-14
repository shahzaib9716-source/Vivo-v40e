/**
 * Dynamic app config. The static values live in app.json; this file adjusts them by the
 * APP_VARIANT environment variable, so one codebase builds two separately installable apps.
 *
 *   (unset)              combined build: both sides behind a role chooser. Use it for Expo Go and web.
 *   APP_VARIANT=parent   "Haven"        com.haven.familysafety.parent   scheme haven
 *   APP_VARIANT=child    "Haven Kids"   com.haven.familysafety.kids     scheme havenkids
 *
 * The app reads its variant at run time from Constants.expoConfig.extra.variant
 * (see src/config/variant.ts). Set the variable for every command that reads this config:
 * `expo start`, `expo prebuild`, `expo run:android`, a Gradle or EAS build. The slug is the same
 * for all three.
 */

/** Splash background for the child app: a deep coral. Keep in step with src/config/variant.ts. */
const CHILD_SPLASH = { light: '#E8553C', dark: '#3D1814' };

const CHILD_IMAGES = './assets/images/child';

/** @type {Record<string, (config: import('expo/config').ExpoConfig) => import('expo/config').ExpoConfig>} */
const VARIANTS = {
  parent: (config) => ({
    ...config,
    name: 'Haven',
    scheme: 'haven',
    ios: { ...config.ios, bundleIdentifier: 'com.haven.familysafety.parent' },
    android: { ...config.android, package: 'com.haven.familysafety.parent' },
    extra: { ...config.extra, variant: 'parent' },
  }),

  // Its own icon set and splash in the child accent (coral into pink), so the two apps are easy
  // to tell apart on a home screen.
  child: (config) => ({
    ...config,
    name: 'Haven Kids',
    scheme: 'havenkids',
    icon: `${CHILD_IMAGES}/icon.png`,
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.haven.familysafety.kids',
      icon: {
        light: `${CHILD_IMAGES}/icon.png`,
        dark: `${CHILD_IMAGES}/ios-icon-dark.png`,
        tinted: `${CHILD_IMAGES}/ios-icon-tinted.png`,
      },
    },
    android: {
      ...config.android,
      package: 'com.haven.familysafety.kids',
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        backgroundColor: '#FF7A59',
        foregroundImage: `${CHILD_IMAGES}/android-icon-foreground.png`,
        backgroundImage: `${CHILD_IMAGES}/android-icon-background.png`,
        monochromeImage: `${CHILD_IMAGES}/android-icon-monochrome.png`,
      },
    },
    web: { ...config.web, favicon: `${CHILD_IMAGES}/favicon.png` },
    plugins: withSplash(config.plugins, (props) => ({
      ...props,
      backgroundColor: CHILD_SPLASH.light,
      image: `${CHILD_IMAGES}/splash-icon.png`,
      dark: { ...props.dark, backgroundColor: CHILD_SPLASH.dark, image: `${CHILD_IMAGES}/splash-icon.png` },
    })),
    extra: { ...config.extra, variant: 'child' },
  }),
};

/** Returns the plugin list with the expo-splash-screen options passed through `change`. */
function withSplash(plugins = [], change) {
  const name = 'expo-splash-screen';
  const isSplash = (plugin) => plugin === name || (Array.isArray(plugin) && plugin[0] === name);
  if (!plugins.some(isSplash)) return [...plugins, [name, change({})]];
  return plugins.map((plugin) => (isSplash(plugin) ? [name, change((Array.isArray(plugin) && plugin[1]) || {})] : plugin));
}

/** @param {import('expo/config').ConfigContext} context */
module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT;

  // Unset (or empty): the combined build, exactly as app.json describes it.
  if (variant == null || variant === '') return config;

  if (!Object.hasOwn(VARIANTS, variant)) {
    throw new Error(
      `Unknown APP_VARIANT "${variant}". Use "parent" for the Haven app or "child" for the Haven Kids app, ` +
        'or leave it unset for the combined build with the role chooser.',
    );
  }
  return VARIANTS[variant](config);
};
