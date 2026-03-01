# Unified Reader Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the two-page reader+player architecture with a single unified page featuring a context sidebar, persistent mini-player, commentary density indicators, coverage overlay, and reading preferences.

**Architecture:** The current `/reader/page.js` (523 lines) and `/player/page.js` (399 lines) are replaced by a modular component tree rooted in a new `/reader/page.js`. The sidebar contains three tabs (Commentary, Player, Info). Audio state lives in a `useAudioPlayer` hook shared between the sidebar Player tab and the mini-player bar. All existing data formats (manifest.json, compiled_sessions.json) are unchanged.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, no additional dependencies. No test framework (verification is visual via `npm run dev`).

**Design Spec:** `docs/plans/2026-03-01-unified-reader-redesign.md`

---

## Phase 1: Design System Foundation

### Task 1: Update theme.js with new color tokens and preference system

**Files:**
- Modify: `floating-pecha-ui/src/lib/theme.js`

**Step 1: Extend theme.js**

Replace the current `COLORS` object and `getThemeCssVars` function. Add theme presets (light/sepia/dark), size presets, and a function that generates CSS vars from a preferences object.

```js
// New COLORS — replace existing
export const COLORS = {
  GOLD: '#D4AF37',
  GOLD_SUBTLE: '#FDF8EE',
  GOLD_BORDER: '#D4AF3740',
  GOLD_DIVIDER: '#D4AF374D',
  CRIMSON: '#8B1D1D',
  CRIMSON_SUBTLE: '#8B1D1D1A',
  TEXT_PRIMARY: '#2D3436',
  TEXT_SECONDARY: '#6B7280',
  TEXT_MUTED: '#9DB9C9',
  TEXT_DISABLED: '#2D343659',
  BG_PRIMARY: '#FAFAFA',
  BG_SURFACE: '#FFFFFF',
  BG_ELEVATED: '#F5F5F5',
  BADGE_TEXT: '#ffffff',
  BADGE_COLOR: '#818589',
};

export const THEMES = {
  light: {
    '--bg-primary': '#FAFAFA',
    '--bg-surface': '#FFFFFF',
    '--bg-elevated': '#F5F5F5',
    '--text-primary': '#2D3436',
    '--text-secondary': '#6B7280',
    '--gold': '#D4AF37',
  },
  sepia: {
    '--bg-primary': '#FAF0E4',
    '--bg-surface': '#FFF8F0',
    '--bg-elevated': '#F5E6D3',
    '--text-primary': '#5B4636',
    '--text-secondary': '#8B7355',
    '--gold': '#D4AF37',
  },
  dark: {
    '--bg-primary': '#1A1A2E',
    '--bg-surface': '#232340',
    '--bg-elevated': '#2D2D4A',
    '--text-primary': '#E0E0E0',
    '--text-secondary': '#9CA3AF',
    '--gold': '#E8C547',
  },
};

export const SIZE_PRESETS = {
  S:  { base: 1.6, label: 'Compact' },
  M:  { base: 2.0, label: 'Normal' },
  L:  { base: 2.5, label: 'Large' },
  XL: { base: 3.0, label: 'Extra Large' },
};

export const SPACING_PRESETS = {
  compact:  { lineHeight: 1.4, label: 'Compact' },
  normal:   { lineHeight: 1.6, label: 'Normal' },
  relaxed:  { lineHeight: 1.8, label: 'Relaxed' },
};

// Replace existing SIZES — now dynamic based on base size
export const getSizes = (baseRem = 2.0, lineHeight = 1.6) => ({
  TITLE: { fontSize: `${baseRem * 1.5}rem`, lineHeight: '1.3', fontWeight: '' },
  BIG:   { fontSize: `${baseRem}rem`, lineHeight: `${lineHeight}` },
  SMALL: { fontSize: `${baseRem * 0.70}rem`, lineHeight: `${lineHeight}`, verticalAlign: '0.33em' },
  DEFAULT: { fontSize: `${baseRem * 0.75}rem`, lineHeight: `${lineHeight}` },
});

// Keep static SIZES as default export for backwards compat
export const SIZES = getSizes(2.0, 1.6);

// Replace existing getThemeCssVars — now accepts preferences
export const getThemeCssVars = (prefs = {}) => {
  const theme = THEMES[prefs.theme] || THEMES.light;
  return {
    '--gold': theme['--gold'],
    '--gold-subtle': COLORS.GOLD_SUBTLE,
    '--gold-border': COLORS.GOLD_BORDER,
    '--gold-divide': COLORS.GOLD_DIVIDER,
    '--crimson': COLORS.CRIMSON,
    '--crimson-subtle': COLORS.CRIMSON_SUBTLE,
    '--text-primary': theme['--text-primary'],
    '--text-secondary': theme['--text-secondary'],
    '--text-muted': COLORS.TEXT_MUTED,
    '--text-disabled': COLORS.TEXT_DISABLED,
    '--bg-primary': theme['--bg-primary'],
    '--bg-surface': theme['--bg-surface'],
    '--bg-elevated': theme['--bg-elevated'],
    '--badge-text': COLORS.BADGE_TEXT,
    '--badge-color': COLORS.BADGE_COLOR,
    // Legacy aliases so existing pages (landing, archive, world) still work
    '--theme-gold': theme['--gold'],
    '--theme-gold-border': COLORS.GOLD_BORDER,
    '--theme-gold-divide': COLORS.GOLD_DIVIDER,
    '--theme-gray': theme['--text-secondary'],
    '--theme-badge-text': COLORS.BADGE_TEXT,
    '--theme-badge-color': COLORS.BADGE_COLOR,
    '--theme-hover-red': COLORS.CRIMSON,
    '--theme-no-media': COLORS.TEXT_MUTED,
    '--theme-future-text': '#D1D5DB',
  };
};
```

**Step 2: Verify existing pages still work**

Run: `cd floating-pecha-ui && npm run dev`

Open `http://localhost:3000` — landing page should look identical (legacy aliases preserved).
Open `http://localhost:3000/archive` — should look identical.
Open `http://localhost:3000/world` — should look identical.

**Step 3: Commit**

```bash
git add floating-pecha-ui/src/lib/theme.js
git commit -m "feat(theme): add theme presets, dynamic sizing, and new color tokens

Extends the design system with light/sepia/dark themes, S/M/L/XL size
presets, and spacing options. Preserves legacy CSS variable aliases so
existing pages (landing, archive, world) continue working unchanged."
```

---

### Task 2: Create useReaderPreferences hook

**Files:**
- Create: `floating-pecha-ui/src/lib/useReaderPreferences.js`

**Step 1: Create the hook**

```js
"use client";

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'reader-preferences';

const DEFAULTS = {
  size: 'M',       // S | M | L | XL
  theme: 'light',  // light | sepia | dark
  spacing: 'normal' // compact | normal | relaxed
};

export function useReaderPreferences() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPrefs({ ...DEFAULTS, ...parsed });
      }
    } catch {
      // Ignore parse errors, use defaults
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  }, [prefs, loaded]);

  const updatePref = useCallback((key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }, []);

  return { prefs, updatePref, loaded };
}
```

**Step 2: Verify no lint errors**

Run: `cd floating-pecha-ui && npx eslint src/lib/useReaderPreferences.js`

**Step 3: Commit**

```bash
git add floating-pecha-ui/src/lib/useReaderPreferences.js
git commit -m "feat: add useReaderPreferences hook with localStorage persistence"
```

---

### Task 3: Create useAudioPlayer hook

This centralizes audio logic currently split across reader/page.js and player/page.js. It will be shared between the sidebar PlayerTab and the MiniPlayer.

**Files:**
- Create: `floating-pecha-ui/src/lib/useAudioPlayer.js`

**Step 1: Create the hook**

```js
"use client";

import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioPlayer() {
  const audioRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioSrc, setAudioSrc] = useState(null);

  // Sync playback rate to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, []);

  const seekTo = useCallback((ms) => {
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000;
      setCurrentTimeMs(ms);
    }
  }, []);

  const loadSource = useCallback((src, startMs = 0) => {
    setAudioSrc(src);
    // The actual seek happens in onLoadedMetadata
    setCurrentTimeMs(startMs);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTimeMs(Math.floor(audioRef.current.currentTime * 1000));
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDurationMs(Math.floor(audioRef.current.duration * 1000));
      // Seek to pending position if any
      if (currentTimeMs > 0) {
        audioRef.current.currentTime = currentTimeMs / 1000;
      }
      audioRef.current.playbackRate = playbackRate;
    }
  }, [currentTimeMs, playbackRate]);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  // The hidden <audio> element props — spread these onto an <audio> tag
  const audioProps = {
    ref: audioRef,
    src: audioSrc,
    onTimeUpdate: handleTimeUpdate,
    onLoadedMetadata: handleLoadedMetadata,
    onPlay: handlePlay,
    onPause: handlePause,
    preload: 'metadata',
    style: { display: 'none' },
  };

  return {
    audioProps,
    audioRef,
    isPlaying,
    currentTimeMs,
    durationMs,
    playbackRate,
    audioSrc,
    play,
    pause,
    togglePlay,
    seekTo,
    loadSource,
    setPlaybackRate,
  };
}

// Utility: parse SRT timestamp to milliseconds
export function parseToMs(ts) {
  if (!ts) return 0;
  if (!ts.includes(':')) return Math.floor((parseFloat(ts) || 0) * 1000);
  const [hms, ms] = ts.split(',');
  const parts = hms.split(':').map(Number);
  const seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return Math.floor((seconds + (ms ? parseInt(ms) / 1000 : 0)) * 1000);
}

// Utility: format milliseconds to human-readable duration
export function formatDurationMs(ms) {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds <= 0) return '0:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Utility: format short duration for badges (1s, 2mn, 3mn45s)
export function formatDurationBadge(ms) {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds <= 0) return '1s';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return secs === 0 ? `${mins}mn` : `${mins}mn${secs}s`;
}
```

**Step 2: Verify no lint errors**

Run: `cd floating-pecha-ui && npx eslint src/lib/useAudioPlayer.js`

**Step 3: Commit**

```bash
git add floating-pecha-ui/src/lib/useAudioPlayer.js
git commit -m "feat: add useAudioPlayer hook and audio utility functions

Centralizes audio playback logic (play/pause/seek/load) into a reusable
hook. Extracts time parsing and formatting utils from the old reader
and player pages."
```

---

## Phase 2: Page Layout Shell

### Task 4: Create the unified reader page skeleton

This replaces the current `reader/page.js` entirely. We build the three-zone layout (navbar + root text + sidebar + mini-player) as empty shells first.

**Files:**
- Rewrite: `floating-pecha-ui/src/app/reader/page.js`
- Create: `floating-pecha-ui/src/app/reader/ReaderNavbar.js`
- Create: `floating-pecha-ui/src/app/reader/ReaderLayout.js`

**Step 1: Create ReaderNavbar**

The fixed top navigation bar with back button, search toggle, reading settings, and sidebar toggle.

```js
"use client";

import { inter } from '@/lib/theme';

export default function ReaderNavbar({ onToggleSidebar, onToggleSearch, sidebarOpen }) {
  return (
    <nav className="fixed top-0 z-[60] w-full h-16 bg-[var(--bg-primary)]/95 backdrop-blur-xl border-b border-black/5 px-6">
      <div className="h-full flex items-center justify-between">
        {/* Left: Back */}
        <a
          href="/archive"
          className={`${inter.className} group flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--crimson)] transition-colors`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-x-1">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] hidden sm:inline">Catalog</span>
        </a>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Search toggle */}
          <button
            onClick={onToggleSearch}
            className="p-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all"
            aria-label="Search in text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* Sidebar toggle */}
          <button
            onClick={onToggleSidebar}
            className={`p-2.5 rounded-lg transition-all ${sidebarOpen ? 'text-[var(--gold)] bg-[var(--gold)]/10' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'}`}
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
```

**Step 2: Create ReaderLayout**

The flex container for root text panel + sidebar.

```js
"use client";

export default function ReaderLayout({ children, sidebar, sidebarOpen }) {
  return (
    <div className="flex h-[calc(100vh-64px)] mt-16">
      {/* Root text panel */}
      <div className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarOpen ? '' : ''}`}>
        {children}
      </div>

      {/* Sidebar */}
      <aside
        className={`
          w-[420px] flex-shrink-0 border-l border-black/5 bg-[var(--bg-surface)]
          overflow-y-auto transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full w-0 border-0 overflow-hidden'}
        `}
      >
        {sidebarOpen && sidebar}
      </aside>
    </div>
  );
}
```

**Step 3: Rewrite reader/page.js as a minimal shell**

Replace the entire 523-line file with a clean skeleton that loads data and renders the layout. We'll add the content components in subsequent tasks.

```js
"use client";

import React, { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { uchen, inter, getSizes, getThemeCssVars } from '@/lib/theme';
import { useReaderPreferences } from '@/lib/useReaderPreferences';
import { useAudioPlayer, parseToMs } from '@/lib/useAudioPlayer';
import ReaderNavbar from './ReaderNavbar';
import ReaderLayout from './ReaderLayout';
import Footer from '@/app/components/Footer';

function ReaderContent() {
  const searchParams = useSearchParams();
  const instanceId = searchParams.get('instance') || 'rpn_ngondro_1';
  const urlSessionId = searchParams.get('session');
  const urlSylId = searchParams.get('sylId');
  const urlQuery = searchParams.get('q');

  const { prefs, updatePref, loaded: prefsLoaded } = useReaderPreferences();
  const audio = useAudioPlayer();

  // Data
  const [manifest, setManifest] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('commentary'); // commentary | player | info
  const [activeSylId, setActiveSylId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [manifestRes, sessionsRes] = await Promise.all([
          fetch(`/data/archive/${instanceId}/manifest.json`),
          fetch(`/data/archive/${instanceId}/${instanceId}_compiled_sessions.json`)
        ]);
        if (manifestRes.ok && sessionsRes.ok) {
          setManifest(await manifestRes.json());
          setSessions(await sessionsRes.json());
        }
      } catch (error) {
        console.error("Error loading reader data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [instanceId]);

  // Build syllable → segments map
  const syllableMediaMap = useMemo(() => {
    const map = {};
    sessions.forEach(segment => {
      const mediaSource = segment.media_restored || segment.media_original || segment.media;
      if (mediaSource) {
        segment.syl_uuids.forEach(uuid => {
          if (!map[uuid]) map[uuid] = [];
          const exists = map[uuid].some(opt => opt.segId === (segment.global_seg_id || segment.seg_id));
          if (!exists) {
            map[uuid].push({
              mediaUrl: mediaSource,
              startTime: segment.start,
              endTime: segment.end,
              segId: segment.global_seg_id || segment.seg_id,
              source: segment.source_session,
              sylUuids: segment.syl_uuids,
              mediaOriginal: segment.media_original,
              mediaRestored: segment.media_restored,
            });
          }
        });
      }
    });
    return map;
  }, [sessions]);

  // Build syllable → density (count of distinct sessions)
  const syllableDensityMap = useMemo(() => {
    const map = {};
    sessions.forEach(segment => {
      segment.syl_uuids.forEach(uuid => {
        if (!map[uuid]) map[uuid] = new Set();
        map[uuid].add(segment.source_session);
      });
    });
    // Convert Sets to counts
    const counts = {};
    for (const [uuid, sessionSet] of Object.entries(map)) {
      counts[uuid] = sessionSet.size;
    }
    return counts;
  }, [sessions]);

  // Get all unique session IDs
  const allSessionIds = useMemo(() => {
    const ids = new Set();
    sessions.forEach(seg => ids.add(seg.source_session));
    return Array.from(ids).sort();
  }, [sessions]);

  // Active session segments
  const activeSessionSegments = useMemo(() => {
    if (!activeSession) return [];
    return sessions
      .filter(seg => seg.source_session === activeSession)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));
  }, [activeSession, sessions]);

  // Coverage set for active session
  const coverageSet = useMemo(() => {
    const set = new Set();
    activeSessionSegments.forEach(seg => {
      seg.syl_uuids.forEach(uuid => set.add(uuid));
    });
    return set;
  }, [activeSessionSegments]);

  // Dynamic sizes based on preferences
  const sizes = useMemo(() => {
    const sizePreset = { S: 1.6, M: 2.0, L: 2.5, XL: 3.0 }[prefs.size] || 2.0;
    const spacing = { compact: 1.4, normal: 1.6, relaxed: 1.8 }[prefs.spacing] || 1.6;
    return getSizes(sizePreset, spacing);
  }, [prefs.size, prefs.spacing]);

  // Handle URL-driven initial state
  useEffect(() => {
    if (urlSessionId && allSessionIds.includes(urlSessionId)) {
      setActiveSession(urlSessionId);
      setActiveTab('player');
    }
    if (urlSylId) {
      setActiveSylId(urlSylId);
      if (!urlSessionId) setActiveTab('commentary');
    }
  }, [urlSessionId, urlSylId, allSessionIds]);

  const handleSyllableClick = useCallback((sylId) => {
    if (activeSylId === sylId) {
      setActiveSylId(null);
    } else {
      setActiveSylId(sylId);
      setActiveTab('commentary');
      setSidebarOpen(true);
    }
  }, [activeSylId]);

  const handleSessionSelect = useCallback((sessionId, startSegment) => {
    setActiveSession(sessionId);
    setActiveTab('player');
    setSidebarOpen(true);
    // Load audio from first segment of this session
    const segs = sessions.filter(s => s.source_session === sessionId);
    if (segs.length > 0) {
      const target = startSegment || segs[0];
      const src = target.media_original || target.media;
      const startMs = parseToMs(target.start);
      audio.loadSource(src, startMs);
    }
  }, [sessions, audio]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]" style={getThemeCssVars(prefs)}>
        <span className={`${inter.className} text-[var(--text-secondary)] text-sm uppercase tracking-widest`}>
          Loading...
        </span>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]" style={getThemeCssVars(prefs)}>
      {/* Hidden audio element */}
      <audio {...audio.audioProps} />

      <ReaderNavbar
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onToggleSearch={() => setSearchOpen(prev => !prev)}
        sidebarOpen={sidebarOpen}
      />

      <ReaderLayout
        sidebarOpen={sidebarOpen}
        sidebar={
          <div className={`${inter.className} p-6`}>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-black/5 -mx-6 px-6">
              {['commentary', 'player', 'info'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] transition-all border-b-2 ${
                    activeTab === tab
                      ? 'text-[var(--crimson)] border-[var(--crimson)]'
                      : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab === 'commentary' ? 'Commentary' : tab === 'player' ? 'Player' : 'Info'}
                </button>
              ))}
            </div>

            {/* Tab content — placeholders for now */}
            {activeTab === 'commentary' && (
              <div className="text-[var(--text-secondary)] text-sm">
                {activeSylId
                  ? `Commentary for syllable: ${activeSylId.slice(0, 8)}...`
                  : `${allSessionIds.length} sessions available`
                }
              </div>
            )}
            {activeTab === 'player' && (
              <div className="text-[var(--text-secondary)] text-sm">
                {activeSession
                  ? `Playing session: ${activeSession}`
                  : 'Select a session to begin'
                }
              </div>
            )}
            {activeTab === 'info' && (
              <div className="text-[var(--text-secondary)] text-sm">
                Instance: {instanceId}
              </div>
            )}
          </div>
        }
      >
        {/* Root text — placeholder for now */}
        <div className="p-12 max-w-4xl mx-auto">
          <div className={`${uchen.className} text-justify leading-relaxed`}>
            {manifest.map(syl => {
              if (syl.text === '\n') return <div key={syl.id} className="h-6" />;

              const hasMedia = (syllableMediaMap[syl.id] || []).length > 0;
              const sizeStyle = sizes[syl.size?.toUpperCase()] || sizes.DEFAULT;

              return (
                <span
                  key={syl.id}
                  id={syl.id}
                  onClick={hasMedia ? () => handleSyllableClick(syl.id) : undefined}
                  className={`inline transition-colors duration-300 ${
                    hasMedia
                      ? 'text-[var(--text-primary)] cursor-pointer hover:text-[var(--crimson)]'
                      : 'text-[var(--text-muted)]'
                  } ${activeSylId === syl.id ? 'text-[var(--gold)] font-bold' : ''}`}
                  style={{ ...sizeStyle, whiteSpace: 'pre-wrap' }}
                >
                  {syl.text}
                </span>
              );
            })}
          </div>
        </div>
        <Footer />
      </ReaderLayout>
    </main>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]"><span className="text-gray-400 text-sm">Loading...</span></div>}>
      <ReaderContent />
    </Suspense>
  );
}
```

**Step 4: Verify the shell renders**

Run: `cd floating-pecha-ui && npm run dev`

Open `http://localhost:3000/reader?instance=rpn_ngondro_1` — should see:
- Fixed navbar at top with back button and sidebar toggle
- Tibetan text on the left
- Sidebar on the right with 3 tab buttons (Commentary / Player / Info)
- Clicking a syllable shows its ID in the sidebar
- Sidebar toggle button collapses/expands the sidebar

**Step 5: Commit**

```bash
git add floating-pecha-ui/src/app/reader/
git commit -m "feat(reader): scaffold unified reader with layout shell

Replaces the old 523-line reader page with a modular component tree.
Three-zone layout: navbar + root text panel + collapsible sidebar.
Data loading and syllable media mapping preserved from old reader.
Sidebar tabs are placeholders — content added in subsequent tasks."
```

---

## Phase 3: Root Text Enhancements

### Task 5: Add density indicators and coverage overlay to syllables

**Files:**
- Modify: `floating-pecha-ui/src/app/reader/page.js` (the syllable rendering loop)

**Step 1: Enhance the syllable rendering**

In the manifest `.map()` loop in `ReaderContent`, replace the current simple `<span>` with a version that includes:
- Density dots below syllables with commentary
- Coverage overlay (opacity reduction) when a session is active
- Active segment highlight

The syllable rendering section (inside `<div className={uchen.className}>`) becomes:

```js
{manifest.map(syl => {
  if (syl.text === '\n') return <div key={syl.id} className="h-6" />;

  const mediaOptions = syllableMediaMap[syl.id] || [];
  const hasMedia = mediaOptions.length > 0;
  const density = syllableDensityMap[syl.id] || 0;
  const sizeStyle = sizes[syl.size?.toUpperCase()] || sizes.DEFAULT;

  // Coverage overlay: when a session is active, dim uncovered syllables
  const isCovered = activeSession ? coverageSet.has(syl.id) : true;
  const isSelected = activeSylId === syl.id;

  // Find if this syllable is in the currently playing segment
  const isInPlayingSegment = false; // Will be wired in Phase 5

  let textClass = 'text-[var(--text-primary)]';
  if (!hasMedia) textClass = 'text-[var(--text-muted)]';
  if (isSelected) textClass = 'text-[var(--gold)] font-bold';
  if (activeSession && !isCovered) textClass = 'text-[var(--text-disabled)]';

  return (
    <span
      key={syl.id}
      id={syl.id}
      onClick={hasMedia ? () => handleSyllableClick(syl.id) : undefined}
      className={`inline relative transition-all duration-400 ${textClass} ${
        hasMedia && !isSelected ? 'cursor-pointer hover:text-[var(--crimson)]' : ''
      } ${isInPlayingSegment ? 'bg-[var(--gold-subtle)] rounded-sm' : ''}`}
      style={{
        ...sizeStyle,
        whiteSpace: 'pre-wrap',
        opacity: (activeSession && !isCovered) ? 0.35 : 1,
        transition: 'opacity 500ms, color 300ms, background-color 300ms',
      }}
    >
      {syl.text}
      {/* Density indicator */}
      {density > 0 && !activeSession && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-[2px] pointer-events-none"
          aria-hidden="true"
        >
          {density === 1 && <span className="w-[3px] h-[3px] rounded-full bg-[var(--gold)] opacity-40" />}
          {density >= 2 && density <= 3 && (
            <>
              <span className="w-[3px] h-[3px] rounded-full bg-[var(--gold)] opacity-40" />
              <span className="w-[3px] h-[3px] rounded-full bg-[var(--gold)] opacity-40" />
            </>
          )}
          {density >= 4 && (
            <span className="w-[8px] h-[2px] rounded-full bg-[var(--gold)] opacity-50" />
          )}
        </span>
      )}
    </span>
  );
})}
```

**Step 2: Verify visually**

Run: `cd floating-pecha-ui && npm run dev`

Open `http://localhost:3000/reader?instance=rpn_ngondro_1`:
- Syllables with commentary should have tiny gold dots below them
- Syllables without commentary should be muted blue-gray
- All text should be warm dark gray (not black)

**Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): add density indicators and coverage overlay

Syllables show gold dot indicators based on how many distinct sessions
reference them. When a session is active, uncovered syllables fade to
35% opacity. Uses the syllableDensityMap and coverageSet derived state."
```

---

## Phase 4: Context Sidebar Content

### Task 6: Build the CommentaryTab component

**Files:**
- Create: `floating-pecha-ui/src/app/reader/CommentaryTab.js`
- Modify: `floating-pecha-ui/src/app/reader/page.js` (import and use it)

**Step 1: Create CommentaryTab**

Shows available sessions for a selected syllable, or a general overview when nothing is selected.

```js
"use client";

import { useMemo } from 'react';
import { uchen, inter } from '@/lib/theme';
import { formatDurationBadge, parseToMs } from '@/lib/useAudioPlayer';

export default function CommentaryTab({ activeSylId, syllableMediaMap, manifest, allSessionIds, onSessionSelect }) {
  // Group segments by session for the selected syllable
  const sessionGroups = useMemo(() => {
    if (!activeSylId) return [];
    const segments = syllableMediaMap[activeSylId] || [];
    const groups = {};
    segments.forEach(seg => {
      if (!groups[seg.source]) {
        groups[seg.source] = [];
      }
      groups[seg.source].push(seg);
    });
    return Object.entries(groups).map(([sessionId, segs]) => ({
      sessionId,
      segments: segs,
      // Preview text from manifest
      previewText: segs[0]?.sylUuids
        ? manifest
            .filter(s => segs[0].sylUuids.includes(s.id))
            .map(s => s.text === '\n' ? ' ' : s.text)
            .join('')
            .slice(0, 60)
        : '',
      totalDurationMs: segs.reduce((acc, seg) => {
        const start = parseToMs(seg.startTime);
        const end = seg.endTime ? parseToMs(seg.endTime) : start + 10000;
        return acc + (end - start);
      }, 0),
    }));
  }, [activeSylId, syllableMediaMap, manifest]);

  // No syllable selected — show overview
  if (!activeSylId) {
    return (
      <div className="space-y-4">
        <p className={`${inter.className} text-[var(--text-secondary)] text-xs uppercase tracking-widest font-bold`}>
          {allSessionIds.length} Commentary Sessions
        </p>
        <p className={`${inter.className} text-[var(--text-secondary)] text-sm leading-relaxed`}>
          Click a syllable in the text to see which commentary sessions cover that passage.
        </p>
        <div className="space-y-2 mt-6">
          {allSessionIds.map(id => (
            <button
              key={id}
              onClick={() => onSessionSelect(id)}
              className={`${inter.className} w-full text-left px-4 py-3 rounded-lg border border-black/5 text-sm text-[var(--text-primary)] hover:border-[var(--gold)] hover:bg-[var(--gold-subtle)] transition-all`}
            >
              <span className="font-semibold">{id.split('_').slice(0, 2).join(' ')}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Syllable selected but no commentary found
  if (sessionGroups.length === 0) {
    return (
      <p className={`${inter.className} text-[var(--text-secondary)] text-sm`}>
        No commentary found for this syllable.
      </p>
    );
  }

  // Syllable selected — show matching sessions
  return (
    <div className="space-y-3">
      <p className={`${inter.className} text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold`}>
        {sessionGroups.length} {sessionGroups.length === 1 ? 'Session' : 'Sessions'} for this passage
      </p>

      {sessionGroups.map(({ sessionId, segments, previewText, totalDurationMs }) => (
        <button
          key={sessionId}
          onClick={() => onSessionSelect(sessionId, segments[0])}
          className="w-full text-left p-4 rounded-xl border border-black/5 hover:border-[var(--gold)] hover:bg-[var(--gold-subtle)] transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`${inter.className} text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider`}>
              {sessionId.split('_').slice(0, 2).join(' ')}
            </span>
            <span className={`${inter.className} text-[10px] font-medium text-[var(--badge-color)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full`}>
              {formatDurationBadge(totalDurationMs)}
            </span>
          </div>
          <p className={`${uchen.className} text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2`}>
            {previewText}
          </p>
          <div className={`${inter.className} mt-2 text-[10px] font-bold text-[var(--gold)] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity`}>
            Play from here →
          </div>
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Wire it into page.js**

In `ReaderContent`, import and replace the commentary placeholder:

```js
import CommentaryTab from './CommentaryTab';
```

Replace `{activeTab === 'commentary' && (...)}` with:

```js
{activeTab === 'commentary' && (
  <CommentaryTab
    activeSylId={activeSylId}
    syllableMediaMap={syllableMediaMap}
    manifest={manifest}
    allSessionIds={allSessionIds}
    onSessionSelect={handleSessionSelect}
  />
)}
```

**Step 3: Verify**

Open `http://localhost:3000/reader?instance=rpn_ngondro_1`:
- With no syllable selected: sidebar shows "18 Commentary Sessions" and a list of all sessions
- Click a syllable with commentary: sidebar shows matching sessions with preview text and duration
- Click a session card: should log the session switch (audio not yet wired)

**Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/reader/CommentaryTab.js floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): add CommentaryTab with session list and passage previews"
```

---

### Task 7: Build the PlayerTab component

**Files:**
- Create: `floating-pecha-ui/src/app/reader/PlayerTab.js`
- Modify: `floating-pecha-ui/src/app/reader/page.js`

**Step 1: Create PlayerTab**

Contains the session switcher, custom audio player with segment timeline, and synced transcript.

```js
"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { uchen, inter } from '@/lib/theme';
import { parseToMs, formatDurationMs, formatDurationBadge } from '@/lib/useAudioPlayer';

export default function PlayerTab({
  audio,
  activeSession,
  allSessionIds,
  activeSessionSegments,
  manifest,
  onSessionSelect,
  onSegmentClick,
  activeSylId,
}) {
  const transcriptRef = useRef(null);
  const [userScrolledAt, setUserScrolledAt] = useState(0);

  // Build transcript from segments
  const transcript = useMemo(() => {
    return activeSessionSegments.map(segment => {
      const syllables = manifest
        .filter(syl => segment.syl_uuids.includes(syl.id))
        .map(s => ({ id: s.id, text: s.text === '\n' ? ' ' : s.text }));

      const startTimeMs = parseToMs(segment.start);
      const endTimeMs = segment.end ? parseToMs(segment.end) : startTimeMs + 10000;

      return {
        id: segment.global_seg_id || segment.seg_id,
        startTimeMs,
        endTimeMs,
        durationMs: Math.max(0, endTimeMs - startTimeMs),
        syllables,
        sylUuids: segment.syl_uuids,
      };
    });
  }, [activeSessionSegments, manifest]);

  // Find active segment based on current time
  const activeSegIndex = useMemo(() => {
    const idx = transcript.findIndex(
      seg => audio.currentTimeMs >= seg.startTimeMs && audio.currentTimeMs < seg.endTimeMs
    );
    if (idx >= 0) return idx;
    // Fallback: find last segment that started before current time
    const past = transcript.filter(seg => seg.startTimeMs <= audio.currentTimeMs);
    return past.length > 0 ? transcript.indexOf(past[past.length - 1]) : -1;
  }, [audio.currentTimeMs, transcript]);

  // Total session duration
  const totalDurationMs = audio.durationMs || (transcript.length > 0
    ? transcript[transcript.length - 1].endTimeMs
    : 0);

  // Scroll-lock detection
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const handleScroll = () => setUserScrolledAt(Date.now());
    el.addEventListener('wheel', handleScroll, { passive: true });
    el.addEventListener('touchmove', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleScroll);
      el.removeEventListener('touchmove', handleScroll);
    };
  }, []);

  // Auto-scroll transcript to active segment
  useEffect(() => {
    if (activeSegIndex < 0 || !transcriptRef.current) return;
    if (Date.now() - userScrolledAt < 8000) return;

    const el = document.getElementById(`seg-${transcript[activeSegIndex]?.id}`);
    if (el && transcriptRef.current) {
      const container = transcriptRef.current;
      const targetTop = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
  }, [activeSegIndex, transcript, userScrolledAt]);

  // Notify parent of active segment change (for root text highlighting)
  useEffect(() => {
    if (activeSegIndex >= 0 && transcript[activeSegIndex]) {
      onSegmentClick?.(transcript[activeSegIndex], false); // false = don't seek, just highlight
    }
  }, [activeSegIndex, transcript, onSegmentClick]);

  if (!activeSession) {
    return (
      <div className={`${inter.className} text-[var(--text-secondary)] text-sm text-center py-12`}>
        Select a session to start listening
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -mx-6 -mb-6">
      {/* Session Switcher */}
      <div className="flex gap-1.5 px-6 py-3 overflow-x-auto border-b border-black/5 flex-shrink-0">
        {allSessionIds.map(id => {
          const shortId = id.split('_')[0];
          return (
            <button
              key={id}
              onClick={() => onSessionSelect(id)}
              className={`${inter.className} px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider whitespace-nowrap transition-all ${
                activeSession === id
                  ? 'bg-[var(--gold)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {shortId}
            </button>
          );
        })}
      </div>

      {/* Player Controls */}
      <div className="px-6 py-4 border-b border-black/5 flex-shrink-0">
        {/* Play/Pause + Time */}
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={audio.togglePlay}
            className="w-10 h-10 rounded-full bg-[var(--gold)] text-white flex items-center justify-center hover:bg-[var(--crimson)] transition-colors flex-shrink-0"
            aria-label={audio.isPlaying ? 'Pause' : 'Play'}
          >
            {audio.isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
            )}
          </button>

          <div className="flex-1">
            <div className={`${inter.className} flex justify-between text-[10px] text-[var(--text-secondary)] font-medium mb-1`}>
              <span>{formatDurationMs(audio.currentTimeMs)}</span>
              <span>{formatDurationMs(totalDurationMs)}</span>
            </div>
            {/* Progress bar */}
            <div
              className="h-1.5 bg-[var(--bg-elevated)] rounded-full cursor-pointer relative"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audio.seekTo(Math.floor(pct * totalDurationMs));
              }}
            >
              <div
                className="h-full bg-[var(--gold)] rounded-full transition-all duration-100"
                style={{ width: totalDurationMs > 0 ? `${(audio.currentTimeMs / totalDurationMs) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* Segment Timeline */}
        {transcript.length > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden gap-[1px] mt-2">
            {transcript.map((seg, idx) => {
              const widthPct = totalDurationMs > 0 ? (seg.durationMs / totalDurationMs) * 100 : 0;
              const isActive = idx === activeSegIndex;
              const isPast = idx < activeSegIndex;
              return (
                <button
                  key={seg.id}
                  onClick={() => audio.seekTo(seg.startTimeMs)}
                  className={`h-full rounded-sm transition-all ${
                    isActive ? 'bg-[var(--gold)]' : isPast ? 'bg-[var(--gold)]/40' : 'bg-[var(--bg-elevated)]'
                  } hover:bg-[var(--crimson)] cursor-pointer`}
                  style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                  title={`Segment ${idx + 1}`}
                />
              );
            })}
          </div>
        )}

        {/* Speed selector */}
        <div className="flex items-center gap-1 mt-3">
          {[0.75, 1, 1.25, 1.5, 2].map(rate => (
            <button
              key={rate}
              onClick={() => audio.setPlaybackRate(rate)}
              className={`${inter.className} px-2 py-1 rounded text-[10px] font-bold transition-all ${
                audio.playbackRate === rate
                  ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Synced Transcript */}
      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
        {transcript.map((seg, idx) => {
          const isActive = idx === activeSegIndex;
          const isFuture = activeSegIndex >= 0 && idx > activeSegIndex;

          return (
            <button
              key={seg.id}
              id={`seg-${seg.id}`}
              onClick={() => audio.seekTo(seg.startTimeMs)}
              className={`w-full text-left p-3 rounded-lg transition-all ${
                isActive ? 'bg-[var(--gold-subtle)]' : 'hover:bg-[var(--bg-elevated)]'
              }`}
              style={{ opacity: isFuture ? 0.5 : isActive ? 1 : 0.85 }}
            >
              <span className={`${uchen.className} text-base leading-relaxed text-[var(--text-primary)]`}>
                {seg.syllables.map((syl, i) => (
                  <span key={syl.id || i} className={activeSylId === syl.id ? 'text-[var(--gold)] font-bold' : ''}>
                    {syl.text}
                  </span>
                ))}
              </span>
              <span className={`${inter.className} inline-flex ml-2 text-[10px] font-medium text-[var(--badge-color)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded-full align-middle`}>
                {formatDurationBadge(seg.durationMs)}
              </span>
            </button>
          );
        })}

        {/* Return to current button */}
        {activeSegIndex >= 0 && Date.now() - userScrolledAt < 8000 && (
          <button
            onClick={() => {
              setUserScrolledAt(0);
              const el = document.getElementById(`seg-${transcript[activeSegIndex]?.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className={`${inter.className} sticky bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-surface)] text-xs font-bold shadow-lg`}
          >
            ↓ Return to current
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Wire into page.js**

Import and replace the player tab placeholder:

```js
import PlayerTab from './PlayerTab';
```

Replace `{activeTab === 'player' && (...)}` with:

```js
{activeTab === 'player' && (
  <PlayerTab
    audio={audio}
    activeSession={activeSession}
    allSessionIds={allSessionIds}
    activeSessionSegments={activeSessionSegments}
    manifest={manifest}
    onSessionSelect={handleSessionSelect}
    onSegmentClick={() => {}}
    activeSylId={activeSylId}
  />
)}
```

**Step 3: Verify**

Open the reader, click a syllable, click a session in the Commentary tab.
- Should switch to Player tab with session pills at top
- Audio player with play/pause, progress bar, segment timeline
- Synced transcript below
- Play audio — transcript should auto-scroll and highlight active segment

**Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/reader/PlayerTab.js floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): add PlayerTab with custom audio player and synced transcript

Includes session switcher pill bar, progress bar with segment timeline,
speed selector, and auto-scrolling transcript with scroll-lock detection."
```

---

### Task 8: Build the InfoTab component

**Files:**
- Create: `floating-pecha-ui/src/app/reader/InfoTab.js`
- Modify: `floating-pecha-ui/src/app/reader/page.js`

**Step 1: Create InfoTab**

```js
"use client";

import { inter } from '@/lib/theme';

export default function InfoTab({ instanceId, activeSession, activeSessionSegments, sessions }) {
  const firstSeg = activeSessionSegments[0];
  const hasRestored = Boolean(firstSeg?.media_restored);
  const totalSegments = activeSessionSegments.length;
  const uniqueSessions = new Set(sessions.map(s => s.source_session)).size;

  return (
    <div className={`${inter.className} space-y-6`}>
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-2">Teaching</h3>
        <p className="text-sm text-[var(--text-primary)] font-medium">{instanceId}</p>
      </div>

      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-2">Sessions</h3>
        <p className="text-sm text-[var(--text-primary)]">{uniqueSessions} recordings available</p>
      </div>

      {activeSession && (
        <>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-2">
              Active Session
            </h3>
            <p className="text-sm text-[var(--text-primary)] font-medium">{activeSession}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{totalSegments} segments</p>
          </div>

          {hasRestored && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                Audio Quality
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Restored audio available for this session
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

**Step 2: Wire into page.js, commit**

```bash
git add floating-pecha-ui/src/app/reader/InfoTab.js floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): add InfoTab with session metadata"
```

---

## Phase 5: Mini-Player Bar

### Task 9: Build the MiniPlayer component

**Files:**
- Create: `floating-pecha-ui/src/app/reader/MiniPlayer.js`
- Modify: `floating-pecha-ui/src/app/reader/page.js`

**Step 1: Create MiniPlayer**

```js
"use client";

import { inter, uchen } from '@/lib/theme';
import { formatDurationMs } from '@/lib/useAudioPlayer';

export default function MiniPlayer({ audio, activeSession, currentSegmentText, onExpand }) {
  if (!audio.audioSrc || !activeSession) return null;

  const progress = audio.durationMs > 0 ? (audio.currentTimeMs / audio.durationMs) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] h-14 bg-[var(--bg-surface)]/95 backdrop-blur-xl border-t border-black/5 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
      {/* Thin progress bar at top edge */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--bg-elevated)]">
        <div className="h-full bg-[var(--gold)] transition-all duration-200" style={{ width: `${progress}%` }} />
      </div>

      <div className="h-full flex items-center px-4 gap-3 max-w-5xl mx-auto">
        {/* Play/Pause */}
        <button
          onClick={audio.togglePlay}
          className="w-8 h-8 rounded-full bg-[var(--gold)] text-white flex items-center justify-center hover:bg-[var(--crimson)] transition-colors flex-shrink-0"
          aria-label={audio.isPlaying ? 'Pause' : 'Play'}
        >
          {audio.isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
          )}
        </button>

        {/* Session + segment text */}
        <button onClick={onExpand} className="flex-1 min-w-0 text-left">
          <p className={`${inter.className} text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider`}>
            {activeSession.split('_').slice(0, 2).join(' ')}
          </p>
          <p className={`${uchen.className} text-xs text-[var(--text-primary)] truncate`}>
            {currentSegmentText || '...'}
          </p>
        </button>

        {/* Time */}
        <span className={`${inter.className} text-[10px] text-[var(--text-secondary)] font-medium flex-shrink-0`}>
          {formatDurationMs(audio.currentTimeMs)} / {formatDurationMs(audio.durationMs)}
        </span>

        {/* Expand */}
        <button
          onClick={onExpand}
          className="p-2 text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors"
          aria-label="Open player"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Wire into page.js**

Add MiniPlayer after the ReaderLayout, passing appropriate props. Compute `currentSegmentText` from the active segment's syllables.

**Step 3: Verify**

- Select a session, start playing audio
- Mini-player appears at the bottom with session name, play/pause, progress, time
- Collapse sidebar — mini-player still visible
- Click expand — sidebar opens to Player tab

**Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/reader/MiniPlayer.js floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): add persistent Spotify-style mini-player bar"
```

---

## Phase 6: Reading Settings

### Task 10: Build the ReadingSettingsPopover

**Files:**
- Create: `floating-pecha-ui/src/app/reader/ReadingSettings.js`
- Modify: `floating-pecha-ui/src/app/reader/ReaderNavbar.js`

**Step 1: Create ReadingSettings**

A popover with size presets (S/M/L/XL), theme toggle (light/sepia/dark), and spacing (compact/normal/relaxed).

```js
"use client";

import { inter } from '@/lib/theme';

const SIZE_OPTIONS = [
  { key: 'S', label: 'S' },
  { key: 'M', label: 'M' },
  { key: 'L', label: 'L' },
  { key: 'XL', label: 'XL' },
];

const THEME_OPTIONS = [
  { key: 'light', label: 'Light', preview: 'bg-white border-gray-200' },
  { key: 'sepia', label: 'Sepia', preview: 'bg-[#FAF0E4] border-[#E8D5B7]' },
  { key: 'dark', label: 'Dark', preview: 'bg-[#1A1A2E] border-[#2D2D4A]' },
];

const SPACING_OPTIONS = [
  { key: 'compact', label: '—' },
  { key: 'normal', label: '=' },
  { key: 'relaxed', label: '≡' },
];

export default function ReadingSettings({ prefs, onUpdate, onClose }) {
  return (
    <div className={`${inter.className} absolute right-0 top-full mt-2 w-64 bg-[var(--bg-surface)] rounded-xl shadow-xl border border-black/5 p-5 z-[80]`}>
      {/* Size */}
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-2">Size</p>
        <div className="flex gap-1">
          {SIZE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onUpdate('size', opt.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                prefs.size === opt.key
                  ? 'bg-[var(--gold)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-2">Theme</p>
        <div className="flex gap-2">
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onUpdate('theme', opt.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${opt.preview} ${
                prefs.theme === opt.key
                  ? 'ring-2 ring-[var(--gold)] ring-offset-1'
                  : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spacing */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-2">Spacing</p>
        <div className="flex gap-1">
          {SPACING_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onUpdate('spacing', opt.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                prefs.spacing === opt.key
                  ? 'bg-[var(--gold)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Wire into ReaderNavbar with popover toggle state**

Add an `Aa` button between search and sidebar toggle. Pass `prefs` and `onUpdate` through from page.js.

**Step 3: Verify**

- Click Aa button — popover appears below navbar
- Change size preset — text size changes immediately in root text
- Change theme — background and text colors change
- Reload page — preferences persist

**Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/reader/ReadingSettings.js floating-pecha-ui/src/app/reader/ReaderNavbar.js floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): add reading settings popover with size, theme, spacing

Persisted to localStorage via useReaderPreferences hook. Size presets
scale all Tibetan text proportionally. Three themes: light, sepia, dark."
```

---

## Phase 7: Commentary-First Mode & Dual Scroll

### Task 11: Wire active segment highlighting in root text

When audio plays, the syllables belonging to the currently playing segment should highlight in the root text, and the root text should auto-scroll to show them.

**Files:**
- Modify: `floating-pecha-ui/src/app/reader/page.js`

**Step 1: Add active segment tracking**

Add state and logic to track which segment is currently playing, and pass its `syl_uuids` as a Set to the syllable renderer:

- Add `const [playingSegSylIds, setPlayingSegSylIds] = useState(new Set())` state
- In a `useEffect` watching `audio.currentTimeMs` and `activeSessionSegments`, find the active segment and update `playingSegSylIds`
- In the syllable loop, add `isInPlayingSegment = playingSegSylIds.has(syl.id)` check, apply `bg-[var(--gold-subtle)]` when true
- Add auto-scroll: when the active segment changes, scroll the root text to center the first syllable of that segment (with scroll-lock detection)

**Step 2: Add "Follow playback" pill**

When user manually scrolls the root text during playback and auto-scroll is paused, show a floating pill at the top of the text panel:

```js
<button className="sticky top-4 z-10 mx-auto block px-4 py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-surface)] text-xs font-bold shadow-lg">
  ↓ Follow playback
</button>
```

**Step 3: Verify**

- Select a session, play audio
- Root text should highlight the syllables being spoken (gold background)
- Root text auto-scrolls to follow playback
- Manually scroll root text — "Follow playback" pill appears
- Click pill — snaps back to current passage

**Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): wire dual-scroll commentary-first mode

Root text highlights syllables of the active audio segment and
auto-scrolls to follow playback. Includes scroll-lock detection
with a 'Follow playback' return pill."
```

---

## Phase 8: Search Integration

### Task 12: Move search into the navbar

Port the existing compressed-text search algorithm into the unified reader, displayed as a collapsible search bar in the navbar.

**Files:**
- Create: `floating-pecha-ui/src/app/reader/SearchBar.js`
- Modify: `floating-pecha-ui/src/app/reader/page.js`

**Step 1: Create SearchBar component**

Extract the search logic from the old reader (the `searchIndex`, `localQuery`, `matches`, `activeMatchIdx` state and effects). Render as a fixed bar below the navbar (same z-index pattern as current).

**Step 2: Add search match highlighting to syllable renderer**

Add the same `activeMatchSet` / `allMatchesSet` logic from the old reader. Apply the crimson highlight styles.

**Step 3: Verify**

- Click search icon in navbar — search bar appears
- Type Tibetan text — matches highlight in root text
- Prev/Next navigation works
- Close search — highlights clear

**Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/reader/SearchBar.js floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(reader): integrate find-in-teaching search into navbar

Ports the compressed-text search algorithm from the old reader.
Search bar collapses into the navbar. Match highlighting uses
crimson accent color."
```

---

## Phase 9: Migration & Cleanup

### Task 13: Add /player redirect and update archive links

**Files:**
- Modify: `floating-pecha-ui/src/app/player/page.js` (replace with redirect)
- Modify: `floating-pecha-ui/src/app/archive/page.js` (update links that pointed to /player)

**Step 1: Replace player/page.js with redirect**

```js
import { redirect } from 'next/navigation';

export default function PlayerRedirect({ searchParams }) {
  const instance = searchParams?.instance || 'rpn_ngondro_1';
  const session = searchParams?.session || '';
  const time = searchParams?.time || '';
  const sylId = searchParams?.sylId || '';

  let url = `/reader?instance=${instance}`;
  if (session) url += `&session=${session}`;
  if (time) url += `&time=${time}`;
  if (sylId) url += `&sylId=${sylId}`;

  redirect(url);
}
```

**Step 2: Update archive page links**

In `archive/page.js`, the search results currently link to `/reader` with the right params — these should continue working. Verify no links point to `/player` directly.

**Step 3: Verify**

- Navigate to `/player?instance=rpn_ngondro_1&session=A1&time=00:01:00` — should redirect to `/reader` with same params
- Archive page browse and search results still work

**Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/player/page.js floating-pecha-ui/src/app/archive/page.js
git commit -m "feat: redirect /player to /reader, update archive links

All existing deep links to /player now redirect to the unified reader
with equivalent params. Archive search results continue working."
```

---

### Task 14: Clean up legacy code and lint check

**Files:**
- Delete: `floating-pecha-ui/src/app/search/page.js` (legacy, superseded by archive)
- Modify: `floating-pecha-ui/src/app/reader/page.js` (remove any dead code)

**Step 1: Remove search/page.js**

```bash
rm floating-pecha-ui/src/app/search/page.js
rmdir floating-pecha-ui/src/app/search/
```

**Step 2: Run lint and build check**

```bash
cd floating-pecha-ui && npm run lint
cd floating-pecha-ui && npm run build
```

Fix any issues that arise.

**Step 3: Full smoke test**

- Landing page (`/`) — unchanged
- Archive (`/archive`) — browse and search work
- Reader (`/reader?instance=rpn_ngondro_1`) — full new experience
- World (`/world`) — gallery unchanged
- Player redirect (`/player?...`) — redirects correctly

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove legacy search page, lint fixes, build verification

Removes /search/page.js (superseded by archive search tab).
All pages pass lint and build checks."
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Foundation | Tasks 1-3 | Updated theme, preferences hook, audio hook |
| 2. Layout Shell | Task 4 | Unified page with navbar + sidebar skeleton |
| 3. Root Text | Task 5 | Density dots, coverage overlay |
| 4. Sidebar Content | Tasks 6-8 | Commentary tab, Player tab, Info tab |
| 5. Mini-Player | Task 9 | Spotify-style persistent audio bar |
| 6. Reading Settings | Task 10 | Font size, theme, spacing popover |
| 7. Commentary-First | Task 11 | Dual auto-scroll, active segment highlight |
| 8. Search | Task 12 | Navbar-integrated find-in-teaching |
| 9. Migration | Tasks 13-14 | Player redirect, cleanup, verification |

Each task is a single commit. Total: 14 commits across 9 phases.
