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
  GOLD: '#D4AF37',
  GOLD_BORDER: '#D4AF3780',
  GOLD_DIVIDER: '#D4AF374D',
  GRAY: '#9CA3AF',
  BADGE_TEXT: '#ffffff',
  BADGE_COLOR: '#818589',
  HOVER_RED: '#8B1D1D',
  NO_MEDIA: '#9DB9C9',         // NEW: Color for text without audio in the reader
  FUTURE_TEXT: '#D1D5DB',      // NEW: Color for upcoming text in the player (Tailwind gray-300)
};

// ==========================================
// 3. SIZES (THE PECHA SCALING)
// ==========================================
const BIG_SIZE_REM = 2.25;
const SMALL_RATIO = 0.70;

export const SIZES = {
  TITLE: { fontSize: "3rem", lineHeight: "1.3", fontWeight: "" },
  BIG: { fontSize: `${BIG_SIZE_REM}rem`, lineHeight: "1.6" },
  SMALL: { fontSize: `${BIG_SIZE_REM * SMALL_RATIO}rem`, lineHeight: "1.6", verticalAlign: "0.33em" },
  DEFAULT: { fontSize: "1.5rem", lineHeight: "1.6" }
};

// ==========================================
// 4. CSS VARIABLE GENERATOR
// ==========================================
export const getThemeCssVars = () => ({
  '--theme-gold': COLORS.GOLD,
  '--theme-gold-border': COLORS.GOLD_BORDER,
  '--theme-gold-divide': COLORS.GOLD_DIVIDER,
  '--theme-gray': COLORS.GRAY,
  '--theme-badge-text': COLORS.BADGE_TEXT,
  '--theme-badge-color': COLORS.BADGE_COLOR,
  '--theme-hover-red': COLORS.HOVER_RED,
  '--theme-no-media': COLORS.NO_MEDIA,
  '--theme-future-text': COLORS.FUTURE_TEXT,
});