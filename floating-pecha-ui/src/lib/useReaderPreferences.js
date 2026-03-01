'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'reader-preferences';

const VALID = {
  size: ['XS', 'S', 'M', 'L', 'XL'],
  theme: ['light', 'sepia', 'dark'],
  spacing: ['compact', 'normal', 'relaxed'],
};

const DEFAULTS = {
  size: 'M',
  theme: 'light',
  spacing: 'normal',
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      size: VALID.size.includes(parsed.size) ? parsed.size : DEFAULTS.size,
      theme: VALID.theme.includes(parsed.theme) ? parsed.theme : DEFAULTS.theme,
      spacing: VALID.spacing.includes(parsed.spacing) ? parsed.spacing : DEFAULTS.spacing,
    };
  } catch {
    return null;
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable (private browsing, quota exceeded)
  }
}

// useSyncExternalStore subscriptions for hydration-safe "is client" detection
function subscribeToNothing(cb) {
  // No external store changes to listen for
  return () => {};
}
function getIsClient() {
  return true;
}
function getIsServer() {
  return false;
}

/**
 * Hook that manages reader display preferences with localStorage persistence.
 *
 * @returns {{ prefs: { size: string, theme: string, spacing: string }, updatePref: (key: string, value: string) => void, loaded: boolean }}
 */
export function useReaderPreferences() {
  // Hydration-safe client detection -- `loaded` is false on server, true on client
  const loaded = useSyncExternalStore(subscribeToNothing, getIsClient, getIsServer);

  // Lazy initializer: reads localStorage on first client render
  const [prefs, setPrefs] = useState(() => {
    if (typeof window === 'undefined') return DEFAULTS;
    return loadPrefs() || DEFAULTS;
  });

  // Persist to localStorage whenever prefs change
  useEffect(() => {
    if (loaded) {
      savePrefs(prefs);
    }
  }, [prefs, loaded]);

  const updatePref = useCallback((key, value) => {
    setPrefs((prev) => {
      if (!(key in prev)) return prev;
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  }, []);

  return { prefs, updatePref, loaded };
}
