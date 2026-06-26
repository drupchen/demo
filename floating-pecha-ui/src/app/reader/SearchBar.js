"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { inter } from '@/lib/theme';

const STRIP = /[ \n\r\t ་།]/g;
const STRIP_TEST = /[ \n\r\t ་།]/;
const MAX_MATCHES = 500;

// Compress text the same way for the main and transcript indices: drop spaces,
// newlines, tsek (་) and shad (།), lowercase the rest.
function compress(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!STRIP_TEST.test(ch)) out += ch.toLowerCase();
  }
  return out;
}

export default function SearchBar({
  manifest,
  onMatchSetsChange,
  initialQuery = '',
  transcriptAvailable = false,
  transcriptSyllables = [],
  onTransMatchSetsChange,
  onTranscriptNavigate,
}) {
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [searchFocused, setSearchFocused] = useState(false);
  const [scope, setScope] = useState('main'); // 'main' | 'both' | 'transcript'
  // matches: ordered list of { type:'main'|'trans', pos, ids?, gid?, anchorId? }
  const [matches, setMatches] = useState([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(-1);
  const lastScrolledRef = useRef(-1);

  // No transcript for this text → force scope back to main.
  useEffect(() => {
    if (!transcriptAvailable && scope !== 'main') setScope('main');
  }, [transcriptAvailable, scope]);

  // Main-text index: compressed text + per-char syllable id, plus id→position.
  const mainIndex = useMemo(() => {
    let compressedText = '';
    const charIndexToUuid = [];
    const idToPos = new Map();
    manifest.forEach((syl, pos) => {
      if (!idToPos.has(syl?.id)) idToPos.set(syl?.id, pos);
      if (syl && syl.text) {
        for (let i = 0; i < syl.text.length; i++) {
          const char = syl.text[i];
          if (!STRIP_TEST.test(char)) {
            compressedText += char.toLowerCase();
            charIndexToUuid.push(syl.id);
          }
        }
      }
    });
    return { compressedText, charIndexToUuid, idToPos };
  }, [manifest]);

  // Transcript index, built like the main index but over the displayed
  // transcription syllables (so matches are syllable-level, not whole-segment).
  const transIndex = useMemo(() => {
    let compressedText = '';
    const charIndexToUuid = [];
    const uuidToAnchor = new Map();
    const uuidToSession = new Map();
    (transcriptSyllables || []).forEach((syl) => {
      uuidToAnchor.set(syl.id, syl.anchorId);
      uuidToSession.set(syl.id, syl.sessionId);
      if (syl.text) {
        for (let i = 0; i < syl.text.length; i++) {
          const char = syl.text[i];
          if (!STRIP_TEST.test(char)) {
            compressedText += char.toLowerCase();
            charIndexToUuid.push(syl.id);
          }
        }
      }
    });
    return { compressedText, charIndexToUuid, uuidToAnchor, uuidToSession };
  }, [transcriptSyllables]);

  const scrollToEntry = useCallback((entry) => {
    if (!entry) return;
    if (entry.type === 'main') {
      const el = document.getElementById(entry.ids?.[0]);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Transcript matches can live in any session, and only the loaded session's
    // transcript is on screen. Let the reader switch session (if needed), turn on
    // the transcript display, and scroll to the matched syllable.
    onTranscriptNavigate?.({
      sessionId: entry.sessionId,
      sylId: entry.ids?.[0],
      anchorId: entry.anchorId,
    });
  }, [onTranscriptNavigate]);

  // Keep a stable reference to the latest scrollToEntry so the highlight-report
  // effect below doesn't list it as a dependency: scrollToEntry's identity
  // changes every render (it closes over the reader's audio/session callbacks),
  // and that effect calls setState — depending on it would loop indefinitely.
  const scrollToEntryRef = useRef(scrollToEntry);
  useEffect(() => {
    scrollToEntryRef.current = scrollToEntry;
  }, [scrollToEntry]);

  // Recompute matches on query / scope / index change.
  useEffect(() => {
    const cleanQuery = localQuery.replace(STRIP, '').toLowerCase();
    if (!cleanQuery) {
      setMatches([]);
      setActiveMatchIdx(-1);
      return;
    }

    const result = [];

    if (scope === 'main' || scope === 'both') {
      const { compressedText, charIndexToUuid, idToPos } = mainIndex;
      let from = 0;
      let at = compressedText.indexOf(cleanQuery, from);
      while (at !== -1 && result.length < MAX_MATCHES) {
        const ids = [];
        const seen = new Set();
        for (let i = at; i < at + cleanQuery.length; i++) {
          const id = charIndexToUuid[i];
          if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        if (ids.length) {
          result.push({ type: 'main', ids, pos: idToPos.get(ids[0]) ?? 0 });
        }
        from = at + cleanQuery.length;
        at = compressedText.indexOf(cleanQuery, from);
      }
    }

    if ((scope === 'transcript' || scope === 'both') && transcriptAvailable) {
      const { compressedText, charIndexToUuid, uuidToAnchor, uuidToSession } = transIndex;
      let from = 0;
      let at = compressedText.indexOf(cleanQuery, from);
      while (at !== -1 && result.length < MAX_MATCHES) {
        const ids = [];
        const seen = new Set();
        for (let i = at; i < at + cleanQuery.length; i++) {
          const id = charIndexToUuid[i];
          if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        if (ids.length) {
          const anchorId = uuidToAnchor.get(ids[0]);
          result.push({
            type: 'trans',
            ids,
            anchorId,
            sessionId: uuidToSession.get(ids[0]),
            pos: mainIndex.idToPos.get(anchorId) ?? 0,
          });
        }
        from = at + cleanQuery.length;
        at = compressedText.indexOf(cleanQuery, from);
      }
    }

    // Document order so arrows traverse top→bottom across both layers.
    result.sort((a, b) => a.pos - b.pos || (a.type === b.type ? 0 : a.type === 'main' ? -1 : 1));

    lastScrolledRef.current = -1; // allow the new active match to scroll
    setMatches(result);
    setActiveMatchIdx(result.length ? 0 : -1);
  }, [localQuery, scope, mainIndex, transIndex, transcriptAvailable]);

  // Report highlight sets to the reader, and scroll to the active match.
  useEffect(() => {
    const mainAll = new Set();
    const transAll = new Set();
    matches.forEach((m) => {
      if (m.type === 'main') m.ids.forEach((id) => mainAll.add(id));
      else m.ids.forEach((id) => transAll.add(id));
    });
    const active = matches[activeMatchIdx];
    const mainActive = new Set(active?.type === 'main' ? active.ids : []);
    const transActive = new Set(active?.type === 'trans' ? active.ids : []);

    onMatchSetsChange?.(mainActive, mainAll);
    onTransMatchSetsChange?.(transActive, transAll);

    if (active && activeMatchIdx !== lastScrolledRef.current) {
      lastScrolledRef.current = activeMatchIdx;
      setTimeout(() => scrollToEntryRef.current(active), 30);
    }
  }, [matches, activeMatchIdx, onMatchSetsChange, onTransMatchSetsChange]);

  const handleNext = () => {
    if (matches.length === 0) return;
    setActiveMatchIdx((i) => (i + 1) % matches.length);
  };
  const handlePrev = () => {
    if (matches.length === 0) return;
    setActiveMatchIdx((i) => (i - 1 + matches.length) % matches.length);
  };

  const scopeBtn = (value, label, disabled = false) => {
    // No transcript → the whole control is inactive: every option is disabled
    // and rendered in the same muted gray (no active highlight), so the box
    // reads as one uniformly-grayed, non-tappable unit (see the container's
    // opacity below). With a transcript, normal active/secondary styling.
    const isDisabled = disabled || !transcriptAvailable;
    let cls;
    if (!transcriptAvailable) {
      cls = 'r-text-muted cursor-not-allowed';
    } else if (disabled) {
      cls = 'r-text-muted opacity-40 cursor-not-allowed';
    } else {
      cls = scope === value ? 'r-btn-active' : 'r-text-secondary';
    }
    return (
      <button
        key={value}
        onClick={() => !isDisabled && setScope(value)}
        disabled={isDisabled}
        title={!transcriptAvailable ? 'This text has no transcript' : undefined}
        className={`${inter.className} px-2 py-0.5 md:py-1 text-[10px] font-bold transition-all ${cls}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="flex items-center gap-2 w-full max-w-2xl mx-auto"
      onFocus={() => setSearchFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setSearchFocused(false);
      }}
    >
      <div className="relative flex-grow min-w-0">
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Find in teaching…"
          className={`${inter.className} w-full pl-9 pr-9 py-1.5 border rounded-lg focus:outline-none text-sm transition-all r-search-input`}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 r-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {localQuery && (
          <button
            onClick={() => setLocalQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors r-text-muted"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}

        {/* Mobile: scope options float below the focused field as a popup, so
            the search field itself is never shortened by an inline control. */}
        {searchFocused && (
          <div
            className={`md:hidden absolute left-0 top-full mt-2 z-[80] flex rounded-lg overflow-hidden border shadow-xl r-settings ${
              !transcriptAvailable ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            role="menu"
            title={transcriptAvailable ? 'Search scope' : 'No transcript for this text'}
          >
            {scopeBtn('main', 'Text')}
            {scopeBtn('both', 'Both', !transcriptAvailable)}
            {scopeBtn('transcript', 'Transcript', !transcriptAvailable)}
          </div>
        )}
      </div>

      {/* Desktop: inline segmented control. */}
      <div
        className={`hidden md:flex flex-row rounded-md overflow-hidden border r-border flex-shrink-0 ${
          !transcriptAvailable ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        title={transcriptAvailable ? 'Search scope' : 'No transcript for this text'}
      >
        {scopeBtn('main', 'Text')}
        {scopeBtn('both', 'Both', !transcriptAvailable)}
        {scopeBtn('transcript', 'Transcript', !transcriptAvailable)}
      </div>

      {matches.length > 0 && (
        <div className={`${inter.className} flex items-center gap-2 flex-shrink-0`}>
          <span className="font-bold tracking-widest uppercase text-[10px] whitespace-nowrap r-text-secondary">
            {activeMatchIdx + 1} / {matches.length}
          </span>
          <div className="flex items-center border rounded-md overflow-hidden r-search-nav">
            <button onClick={handlePrev} className="p-1.5 transition-colors r-text-accent" aria-label="Previous match">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <div className="w-px h-4 r-search-divider" />
            <button onClick={handleNext} className="p-1.5 transition-colors r-text-accent" aria-label="Next match">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {localQuery && matches.length === 0 && (
        <span className={`${inter.className} text-xs tracking-wide r-text-muted flex-shrink-0`}>
          No matches
        </span>
      )}
    </div>
  );
}
