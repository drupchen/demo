'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { outfit } from '@/lib/theme';
import ReadingSettings from './ReadingSettings';

export default function ReaderNavbar({
  onToggleSidebar,
  onToggleSearch,
  onToggleContents,
  onOpenStudy,
  sidebarOpen,
  contentsOpen,
  hasContents,
  prefs,
  onUpdatePref,
  canAnnotate,
  annotateMode,
  onToggleAnnotate,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [settingsOpen]);

  return (
    <nav className={`${outfit.className} fixed top-0 z-60 w-full h-16 border-b px-6 md:px-10 flex items-center justify-between r-bg r-border`}>
      <div className="flex items-center gap-4">
        {/* Small brand seal — anchors the reader in the same visual lineage as the landing */}
        <Link
          href="/"
          className="rd-seal flex items-center justify-center w-7 h-7 rounded-full shrink-0"
          style={{
            background: 'radial-gradient(circle at 38% 30%, #E9C56B, #ECB320 58%, #A28348)',
            color: '#0A2347',
            fontSize: 12,
            boxShadow: '0 0 0 1px rgba(236, 179, 32, 0.42), 0 0 10px rgba(236, 179, 32, 0.28)',
          }}
          aria-label="Rabsal Dawa — home"
        >
          ༀ
        </Link>

        <Link
          href="/archive"
          className="group flex items-center gap-2.5 text-[10px] md:text-xs font-medium uppercase tracking-[0.18em] transition-colors duration-200 r-text-muted r-hover-accent"
          aria-label="Back to Catalog"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:-translate-x-1">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Catalog</span>
        </Link>
      </div>

      <div className="flex items-center gap-1">
        {canAnnotate && (
          <button
            onClick={onToggleAnnotate}
            className={`p-2 rounded-md transition-colors duration-200 ${annotateMode ? "r-text-accent" : "r-text-muted r-hover-accent"}`}
            aria-label={annotateMode ? "Quitter le mode annotation" : "Activer le mode annotation"}
            aria-pressed={annotateMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
        <button
          onClick={onToggleSearch}
          className="p-2 rounded-md transition-colors duration-200 r-text-muted r-hover-accent"
          aria-label="Toggle search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setSettingsOpen(prev => !prev)}
            className={`p-2 rounded-md transition-colors duration-200 text-sm font-semibold ${settingsOpen ? 'r-text-accent' : 'r-text-muted r-hover-accent'}`}
            aria-label="Reading settings"
          >
            Aa
          </button>

          {settingsOpen && prefs && onUpdatePref && (
            <ReadingSettings
              prefs={prefs}
              onUpdate={onUpdatePref}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>

        {hasContents && (
          <button
            onClick={onToggleContents}
            className={`p-2 rounded-md transition-colors duration-200 text-xs font-medium tracking-wide ${contentsOpen ? 'r-text-accent' : 'r-text-muted r-hover-accent'}`}
            aria-label={contentsOpen ? 'Close contents' : 'Open contents'}
          >
            Contents
          </button>
        )}

        {hasContents && onOpenStudy && (
          <button
            onClick={onOpenStudy}
            className="p-2 rounded-md transition-colors duration-200 text-xs font-medium tracking-wide r-text-muted r-hover-accent"
            aria-label="Open sapche study view"
          >
            Study
          </button>
        )}

        <button
          onClick={onToggleSidebar}
          className={`p-2 rounded-md transition-colors duration-200 ${sidebarOpen ? 'r-text-accent' : 'r-text-muted r-hover-accent'}`}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
