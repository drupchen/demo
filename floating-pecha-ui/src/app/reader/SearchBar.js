"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { inter } from '@/lib/theme';

export default function SearchBar({ manifest, visible, onMatchSetsChange }) {
  const [localQuery, setLocalQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(-1);

  // Build compressed-text search index
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

  // Scroll to a match
  const scrollToMatch = useCallback((uuids) => {
    if (!uuids || uuids.length === 0) return;
    const el = document.getElementById(uuids[0]);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Run search when query changes
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
      if (uuidsArr.length > 0) {
        newMatches.push(uuidsArr);
      }
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

  // Update highlight sets whenever matches or active index changes
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

  // Clear search when hidden
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
    <div
      className="fixed top-16 z-[55] w-full border-b px-4 md:px-10 h-12 flex items-center backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--reader-bg-primary, #FAFAFA) 95%, transparent)',
        borderColor: 'var(--reader-border, #E5E7EB)',
      }}
    >
      <div className="max-w-5xl mx-auto w-full flex items-center gap-4">
        <div className="relative flex-grow max-w-sm">
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Find in teaching..."
            autoFocus
            className={`${inter.className} w-full pl-9 pr-9 py-1.5 border rounded-lg focus:outline-none text-sm transition-all`}
            style={{
              backgroundColor: 'var(--reader-bg-surface, #FFFFFF)',
              borderColor: 'var(--reader-border, #E5E7EB)',
              color: 'var(--reader-text-primary, #2D3436)',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--reader-accent, #D4AF37)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--reader-border, #E5E7EB)'; }}
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
               style={{ color: 'var(--reader-text-muted, #9CA3AF)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {localQuery && (
            <button
              onClick={() => setLocalQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: 'var(--reader-text-muted, #9CA3AF)' }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {matches.length > 0 && (
          <div className={`${inter.className} flex items-center gap-3 text-sm`}>
            <span className="font-bold tracking-widest uppercase text-[10px] whitespace-nowrap"
                  style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
              {activeMatchIdx + 1} / {matches.length}
            </span>
            <div className="flex items-center border rounded-md overflow-hidden"
                 style={{
                   borderColor: 'var(--reader-border, #E5E7EB)',
                   backgroundColor: 'var(--reader-bg-surface, #FFFFFF)',
                 }}>
              <button onClick={handlePrev} className="p-1.5 transition-colors"
                      style={{ color: 'var(--reader-accent, #D4AF37)' }}
                      aria-label="Previous match">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <div className="w-px h-4" style={{ backgroundColor: 'var(--reader-border, #E5E7EB)' }} />
              <button onClick={handleNext} className="p-1.5 transition-colors"
                      style={{ color: 'var(--reader-accent, #D4AF37)' }}
                      aria-label="Next match">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {localQuery && matches.length === 0 && (
          <span className={`${inter.className} text-xs tracking-wide`}
                style={{ color: 'var(--reader-text-muted, #9CA3AF)' }}>
            No matches
          </span>
        )}
      </div>
    </div>
  );
}
