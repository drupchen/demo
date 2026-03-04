"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { inter } from '@/lib/theme';

export default function SearchBar({ manifest, visible, onMatchSetsChange, initialQuery = '' }) {
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const [matches, setMatches] = useState([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(-1);

  const searchIndex = useMemo(() => {
    let compressedText = '';
    const charIndexToUuid = [];
    manifest.forEach(syl => {
      if (syl && syl.text) {
        for (let i = 0; i < syl.text.length; i++) {
          const char = syl.text[i];
          if (!/[ \n\r\t་།]/.test(char)) {
            compressedText += char.toLowerCase();
            charIndexToUuid.push(syl.id);
          }
        }
      }
    });
    return { compressedText, charIndexToUuid };
  }, [manifest]);

  const scrollToMatch = useCallback((uuids) => {
    if (!uuids || uuids.length === 0) return;
    const el = document.getElementById(uuids[0]);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    if (!localQuery.trim()) {
      setMatches([]);
      setActiveMatchIdx(-1);
      onMatchSetsChange?.(new Set(), new Set());
      return;
    }

    const cleanQuery = localQuery.replace(/[ \n\r\t་།]/g, '').toLowerCase();
    if (!cleanQuery) {
      setMatches([]);
      setActiveMatchIdx(-1);
      onMatchSetsChange?.(new Set(), new Set());
      return;
    }

    const { compressedText, charIndexToUuid } = searchIndex;
    const newMatches = [];
    let startIndex = 0;
    let matchIdx = compressedText.indexOf(cleanQuery, startIndex);
    const MAX_MATCHES = 500;

    while (matchIdx !== -1 && newMatches.length < MAX_MATCHES) {
      const matchedUuids = new Set();
      for (let i = matchIdx; i < matchIdx + cleanQuery.length; i++) {
        if (charIndexToUuid[i]) matchedUuids.add(charIndexToUuid[i]);
      }
      const uuidsArr = Array.from(matchedUuids);
      if (uuidsArr.length > 0) newMatches.push(uuidsArr);
      startIndex = matchIdx + cleanQuery.length;
      matchIdx = compressedText.indexOf(cleanQuery, startIndex);
    }

    setMatches(newMatches);
    if (newMatches.length > 0) {
      setActiveMatchIdx(0);
      setTimeout(() => scrollToMatch(newMatches[0]), 50);
    } else {
      setActiveMatchIdx(-1);
    }
  }, [localQuery, searchIndex, scrollToMatch, onMatchSetsChange]);

  useEffect(() => {
    const activeSet = new Set(matches[activeMatchIdx] || []);
    const allSet = new Set(matches.flat());
    onMatchSetsChange?.(activeSet, allSet);
  }, [matches, activeMatchIdx, onMatchSetsChange]);

  const handleNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (activeMatchIdx + 1) % matches.length;
    setActiveMatchIdx(nextIdx);
    scrollToMatch(matches[nextIdx]);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (activeMatchIdx - 1 + matches.length) % matches.length;
    setActiveMatchIdx(prevIdx);
    scrollToMatch(matches[prevIdx]);
  };

  useEffect(() => {
    if (!visible) {
      setLocalQuery('');
      setMatches([]);
      setActiveMatchIdx(-1);
      onMatchSetsChange?.(new Set(), new Set());
    }
  }, [visible, onMatchSetsChange]);

  if (!visible) return null;

  return (
    <div className="fixed top-16 z-[55] w-full border-b px-4 md:px-10 h-12 flex items-center backdrop-blur-xl r-searchbar">
      <div className="max-w-5xl mx-auto w-full flex items-center gap-4">
        <div className="relative flex-grow max-w-sm">
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Find in teaching..."
            autoFocus
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
        </div>

        {matches.length > 0 && (
          <div className={`${inter.className} flex items-center gap-3 text-sm`}>
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
          <span className={`${inter.className} text-xs tracking-wide r-text-muted`}>
            No matches
          </span>
        )}
      </div>
    </div>
  );
}
