import { Uchen, Inter } from 'next/font/google';

// ==========================================
// 1. TYPOGRAPHY (FONTS)
// ==========================================
export const uchen = Uchen({
  weight: '400',
  subsets: ['tibetan'],
  display: 'swap',
  variable: '--font-uchen',
});

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// ==========================================
// 2. COLORS
// ==========================================
export const COLORS = {
  // --- Legacy tokens (used across landing, archive, world pages) ---
  GOLD: '#D4AF37',
  GOLD_BORDER: '#D4AF3780',
  GOLD_DIVIDER: '#D4AF374D',
  GRAY: '#9CA3AF',
  BADGE_TEXT: '#ffffff',
  BADGE_COLOR: '#818589',
  HOVER_RED: '#8B1D1D',
  NO_MEDIA: '#9DB9C9',
  FUTURE_TEXT: '#D1D5DB',

  // --- New semantic tokens ---
  GOLD_SUBTLE: '#D4AF371A',     // Gold at ~10% opacity, for subtle highlights
  CRIMSON: '#8B1A1A',           // Deep crimson for accent/emphasis
  CRIMSON_SUBTLE: '#8B1A1A1A',  // Crimson at ~10% opacity

  // Text hierarchy
  TEXT_PRIMARY: '#1A1A1A',
  TEXT_SECONDARY: '#4A4A4A',
  TEXT_MUTED: '#9CA3AF',
  TEXT_DISABLED: '#D1D5DB',

  // Backgrounds
  BG_PRIMARY: '#FFFFFF',
  BG_SURFACE: '#F9FAFB',
  BG_ELEVATED: '#FFFFFF',
};

// ==========================================
// 3. THEMES
// ==========================================
export const THEMES = {
  light: {
    name: 'Light',
    textPrimary: '#1A1A1A',
    textSecondary: '#4A4A4A',
    textMuted: '#9CA3AF',
    textDisabled: '#D1D5DB',
    bgPrimary: '#FFFFFF',
    bgSurface: '#F9FAFB',
    bgElevated: '#FFFFFF',
    border: '#E5E7EB',
    accent: COLORS.GOLD,
    accentSubtle: COLORS.GOLD_SUBTLE,
  },
  sepia: {
    name: 'Sepia',
    textPrimary: '#3B2F1E',
    textSecondary: '#5C4A32',
    textMuted: '#8B7355',
    textDisabled: '#C4B59A',
    bgPrimary: '#F5ECD7',
    bgSurface: '#EDE3CC',
    bgElevated: '#FAF4E6',
    border: '#D4C4A0',
    accent: '#B8942A',
    accentSubtle: '#B8942A1A',
  },
  dark: {
    name: 'Dark',
    textPrimary: '#E5E5E5',
    textSecondary: '#A3A3A3',
    textMuted: '#6B6B6B',
    textDisabled: '#404040',
    bgPrimary: '#1A1A1A',
    bgSurface: '#242424',
    bgElevated: '#2E2E2E',
    border: '#3A3A3A',
    accent: '#E8C547',
    accentSubtle: '#E8C5471A',
  },
};

// ==========================================
// 4. SIZE PRESETS
// ==========================================
export const SIZE_PRESETS = {
  XS: { label: 'Extra Small', baseRem: 1.25 },
  S: { label: 'Small', baseRem: 1.5 },
  M: { label: 'Medium', baseRem: 1.75 },
  L: { label: 'Large', baseRem: 2.25 },
  XL: { label: 'Extra Large', baseRem: 2.75 },
};

// ==========================================
// 5. SPACING PRESETS
// ==========================================
export const SPACING_PRESETS = {
  compact: { label: 'Compact', lineHeight: 1.7 },
  normal: { label: 'Normal', lineHeight: 2.0 },
  relaxed: { label: 'Relaxed', lineHeight: 2.4 },
};

// ==========================================
// 6. DYNAMIC SIZE GENERATOR
// ==========================================
const SMALL_RATIO = 0.70;

/**
 * Generate SIZES object dynamically from a base rem value and lineHeight.
 * This lets the reader scale all text proportionally from user preferences.
 */
export function getSizes(baseRem = 1.75, lineHeight = 1.6) {
  const lh = String(lineHeight);
  return {
    TITLE: { fontSize: `${(baseRem * 1.333).toFixed(2)}rem`, lineHeight: '1.3', fontWeight: '' },
    BIG: { fontSize: `${baseRem}rem`, lineHeight: lh },
    SMALL: { fontSize: `${(baseRem * SMALL_RATIO).toFixed(2)}rem`, lineHeight: lh, verticalAlign: '0.33em' },
    DEFAULT: { fontSize: `${(baseRem * 0.667).toFixed(2)}rem`, lineHeight: lh },
  };
}

// ==========================================
// 7. STATIC SIZES (backwards compatibility)
// ==========================================
export const SIZES = getSizes(1.75, 1.6);

// ==========================================
// 8. CSS VARIABLE GENERATOR
// ==========================================

/**
 * Generate theme-aware CSS variables.
 *
 * When called with no arguments (or undefined prefs), it produces the same
 * legacy variable set as before so existing pages keep working.
 *
 * When called with a prefs object { size, theme, spacing }, it generates
 * additional semantic CSS variables for the new reader design.
 */
export function getThemeCssVars(prefs) {
  // --- Legacy variables (always emitted) ---
  const legacy = {
    '--theme-gold': COLORS.GOLD,
    '--theme-gold-border': COLORS.GOLD_BORDER,
    '--theme-gold-divide': COLORS.GOLD_DIVIDER,
    '--theme-gray': COLORS.GRAY,
    '--theme-badge-text': COLORS.BADGE_TEXT,
    '--theme-badge-color': COLORS.BADGE_COLOR,
    '--theme-hover-red': COLORS.HOVER_RED,
    '--theme-no-media': COLORS.NO_MEDIA,
    '--theme-future-text': COLORS.FUTURE_TEXT,
  };

  // If no prefs supplied, return legacy only (backwards compat)
  if (!prefs) return legacy;

  // Resolve presets
  const sizePreset = SIZE_PRESETS[prefs.size] || SIZE_PRESETS.M;
  const spacingPreset = SPACING_PRESETS[prefs.spacing] || SPACING_PRESETS.normal;
  const themeColors = THEMES[prefs.theme] || THEMES.light;

  const sizes = getSizes(sizePreset.baseRem, spacingPreset.lineHeight);

  return {
    ...legacy,

    // Theme colors
    '--reader-text-primary': themeColors.textPrimary,
    '--reader-text-secondary': themeColors.textSecondary,
    '--reader-text-muted': themeColors.textMuted,
    '--reader-text-disabled': themeColors.textDisabled,
    '--reader-bg-primary': themeColors.bgPrimary,
    '--reader-bg-surface': themeColors.bgSurface,
    '--reader-bg-elevated': themeColors.bgElevated,
    '--reader-border': themeColors.border,
    '--reader-accent': themeColors.accent,
    '--reader-accent-subtle': themeColors.accentSubtle,

    // Typography sizes
    '--reader-title-size': sizes.TITLE.fontSize,
    '--reader-title-lh': sizes.TITLE.lineHeight,
    '--reader-big-size': sizes.BIG.fontSize,
    '--reader-big-lh': sizes.BIG.lineHeight,
    '--reader-small-size': sizes.SMALL.fontSize,
    '--reader-small-lh': sizes.SMALL.lineHeight,
    '--reader-small-valign': sizes.SMALL.verticalAlign,
    '--reader-default-size': sizes.DEFAULT.fontSize,
    '--reader-default-lh': sizes.DEFAULT.lineHeight,
  };
}
