import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0B0F',
    textSecondary: '#5F636B',
    background: '#FFFFFF',
    surface: '#F2F3F5',
    border: '#E2E4E8',
    tint: '#208AEF',
  },
  dark: {
    text: '#F5F6F7',
    textSecondary: '#A9ADB4',
    background: '#000000',
    surface: '#1A1B1E',
    border: '#2A2C30',
    tint: '#4DA3F5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 64 } as const;

export const Radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});
