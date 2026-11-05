
/**
 * AeroSync Theme
 *
 * Shared design system for the AeroSync application.
 * Maintains the original Expo theme exports while providing
 * consistent styling across all AeroSync screens.
 */

import '@/global.css';
import { Platform } from 'react-native';

// --------------------------------------------------
// ORIGINAL EXPO THEME
// --------------------------------------------------

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light &
  keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset =
  Platform.select({ ios: 50, android: 80 }) ?? 0;

export const MaxContentWidth = 800;

// --------------------------------------------------
// AEROSYNC BRAND COLORS
// --------------------------------------------------

export const AeroSyncColors = {
  // Brand
  primary: '#EF1729',
  primaryDark: '#C8102E',
  primaryLight: '#FDE9EC',

  // Backgrounds
  background: '#F4F3F3',
  surface: '#FFFFFF',
  surfaceSecondary: '#FAFAFA',

  // Text
  text: '#242424',
  textSecondary: '#777777',
  textMuted: '#999999',
  textLight: '#FFFFFF',

  // Borders
  border: '#EAEAEA',
  borderDark: '#DADADA',

  // Status colors
  success: '#16834A',
  successLight: '#E6F5ED',

  warning: '#A86B08',
  warningLight: '#FFF2DA',

  info: '#2878C8',
  infoLight: '#EAF3FC',

  danger: '#C8102E',
  dangerLight: '#FDE9EC',

  // General
  white: '#FFFFFF',
  black: '#000000',
} as const;

// --------------------------------------------------
// AEROSYNC TYPOGRAPHY
// --------------------------------------------------

export const AeroSyncTypography = {
  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 15,
    lg: 18,
    xl: 20,
    xxl: 24,
    title: 30,
  },

  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },
} as const;

// --------------------------------------------------
// AEROSYNC SPACING
// --------------------------------------------------

export const AeroSyncSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 30,
  pageBottom: 50,
} as const;

// --------------------------------------------------
// AEROSYNC BORDER RADIUS
// --------------------------------------------------

export const AeroSyncRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  round: 999,
} as const;

// --------------------------------------------------
// AEROSYNC COMPONENT DIMENSIONS
// --------------------------------------------------

export const AeroSyncComponents = {
  buttonHeight: 54,
  inputHeight: 56,
  iconSize: 42,
  headerIconSize: 48,
  cardPadding: 18,
} as const;

// --------------------------------------------------
// AEROSYNC SHADOWS
// --------------------------------------------------

export const AeroSyncShadows = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },

  button: {
    shadowColor: '#EF1729',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 3,
  },
} as const;

// --------------------------------------------------
// AEROSYNC STATUS LABELS
// --------------------------------------------------

export const AeroSyncStatus = {
  registered: {
    label: 'Registered',
    color: AeroSyncColors.info,
    background: AeroSyncColors.infoLight,
  },

  loading: {
    label: 'Loading',
    color: AeroSyncColors.warning,
    background: AeroSyncColors.warningLight,
  },

  offloaded: {
    label: 'Offloaded',
    color: AeroSyncColors.success,
    background: AeroSyncColors.successLight,
  },

  pending: {
    label: 'Pending',
    color: AeroSyncColors.warning,
    background: AeroSyncColors.warningLight,
  },

  approved: {
    label: 'Approved',
    color: AeroSyncColors.success,
    background: AeroSyncColors.successLight,
  },

  rejected: {
    label: 'Rejected',
    color: AeroSyncColors.danger,
    background: AeroSyncColors.dangerLight,
  },

  cancelled: {
    label: 'Cancelled',
    color: AeroSyncColors.textSecondary,
    background: AeroSyncColors.surfaceSecondary,
  },
} as const;
