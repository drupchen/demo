"use client";

import { inter } from '@/lib/theme';

const SIZE_OPTIONS = [
  { key: 'S', label: 'S' },
  { key: 'M', label: 'M' },
  { key: 'L', label: 'L' },
  { key: 'XL', label: 'XL' },
];

const THEME_OPTIONS = [
  { key: 'light', label: 'Light', bg: '#FFFFFF', border: '#E5E7EB' },
  { key: 'sepia', label: 'Sepia', bg: '#FAF0E4', border: '#E8D5B7' },
  { key: 'dark', label: 'Dark', bg: '#1A1A2E', border: '#2D2D4A' },
];

const SPACING_OPTIONS = [
  { key: 'compact', label: '—' },
  { key: 'normal', label: '=' },
  { key: 'relaxed', label: '≡' },
];

export default function ReadingSettings({ prefs, onUpdate, onClose }) {
  return (
    <div
      className={`${inter.className} absolute right-0 top-full mt-2 w-64 rounded-xl shadow-xl border p-5 z-[80]`}
      style={{
        backgroundColor: 'var(--reader-bg-surface, #FFFFFF)',
        borderColor: 'var(--reader-border, #E5E7EB)',
      }}
    >
      {/* Size */}
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
           style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          Size
        </p>
        <div className="flex gap-1">
          {SIZE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onUpdate('size', opt.key)}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
              style={{
                backgroundColor: prefs.size === opt.key ? 'var(--reader-accent, #D4AF37)' : 'var(--reader-bg-elevated, #F5F5F5)',
                color: prefs.size === opt.key ? '#FFFFFF' : 'var(--reader-text-secondary, #6B7280)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
           style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          Theme
        </p>
        <div className="flex gap-2">
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onUpdate('theme', opt.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                prefs.theme === opt.key ? 'ring-2 ring-offset-1' : ''
              }`}
              style={{
                backgroundColor: opt.bg,
                borderColor: opt.border,
                color: opt.key === 'dark' ? '#E0E0E0' : '#2D3436',
                ...(prefs.theme === opt.key ? { '--tw-ring-color': 'var(--reader-accent, #D4AF37)' } : {}),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spacing */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
           style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          Spacing
        </p>
        <div className="flex gap-1">
          {SPACING_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onUpdate('spacing', opt.key)}
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
              style={{
                backgroundColor: prefs.spacing === opt.key ? 'var(--reader-accent, #D4AF37)' : 'var(--reader-bg-elevated, #F5F5F5)',
                color: prefs.spacing === opt.key ? '#FFFFFF' : 'var(--reader-text-secondary, #6B7280)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
