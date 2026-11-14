import { useColorScheme } from 'react-native';

/**
 * Haven design system.
 * Original brand: a calm violet-indigo primary with a warm coral accent.
 * Not derived from any existing product — built for this project.
 */

const brand = {
  primary: '#5B51E0',
  primaryPressed: '#4A41C9',
  accent: '#FF7A59',
  success: '#16B981',
  warning: '#F59E0B',
  // Deep enough for white text on a filled red button or tag (4.8:1).
  danger: '#DC2626',
  info: '#3B9EFF',
};

export const palette = {
  light: {
    ...brand,
    bg: '#F6F6FB',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F0F7',
    surfaceSunken: '#ECECF4',
    border: '#E7E7F0',
    hairline: '#EEEEF4',
    text: '#17161F',
    textMuted: '#5F5E73',
    textFaint: '#716F87',
    // Status colours darkened for small text on light surfaces (4.5:1 or better).
    successText: '#0B7A55',
    warningText: '#92400E',
    dangerText: '#C5302F',
    onPrimary: '#FFFFFF',
    primarySoft: '#ECEAFC',
    accentSoft: '#FFEAE2',
    successSoft: '#DCF7ED',
    warningSoft: '#FDF0D8',
    dangerSoft: '#FDE4E4',
    infoSoft: '#E2F0FF',
    overlay: 'rgba(16,15,25,0.45)',
  },
  dark: {
    ...brand,
    primary: '#7A72F0',
    primaryPressed: '#6A62E0',
    bg: '#0D0D13',
    surface: '#17171F',
    surfaceAlt: '#1F1F29',
    surfaceSunken: '#121219',
    border: '#2A2A36',
    hairline: '#23232E',
    text: '#F4F4FA',
    textMuted: '#A2A1B5',
    textFaint: '#8A899E',
    successText: '#16B981',
    warningText: '#F59E0B',
    dangerText: '#FF6B6B',
    onPrimary: '#FFFFFF',
    primarySoft: '#262146',
    accentSoft: '#3A271F',
    successSoft: '#0F3329',
    warningSoft: '#3A2D12',
    dangerSoft: '#3A1D1F',
    infoSoft: '#132A42',
    overlay: 'rgba(0,0,0,0.6)',
  },
} as const;

export type ThemeColors = typeof palette.light;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  card: 20,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2 },
  title: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
  smallStrong: { fontSize: 13, fontWeight: '700' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.2 },
} as const;

/** Distinct accent colors per feature category, for icons and tiles. */
export const categoryColors = {
  screenTime: '#5B51E0',
  apps: '#12B5A6',
  web: '#F5862B',
  location: '#2E8BFF',
  schedules: '#8B5CF6',
  routines: '#EC4899',
  geofence: '#0EA5E9',
  reports: '#6366F1',
  rewards: '#F5A623',
  calls: '#34C759',
  messages: '#22C55E',
  social: '#E1306C',
  browsing: '#FF6A3D',
  youtube: '#FF3B30',
  keywords: '#A855F7',
  sos: '#FB4A4A',
  family: '#5B51E0',
} as const;

export function shadow(level: 1 | 2 | 3 = 1) {
  const presets = {
    1: { shadowColor: '#1A1340', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    2: { shadowColor: '#1A1340', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
    3: { shadowColor: '#1A1340', shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  };
  return presets[level];
}

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { mode: scheme, colors: palette[scheme] };
}
