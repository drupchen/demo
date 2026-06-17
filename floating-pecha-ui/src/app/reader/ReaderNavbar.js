'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { outfit } from '@/lib/theme';
import ReadingSettings from './ReadingSettings';

export default function ReaderNavbar({
  onToggleSidebar,
  center,
  sidebarOpen,
  prefs,
  onUpdatePref,
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
      <div className="flex items-center gap-2 md:gap-4">
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
          <span className="hidden md:inline">Catalog</span>
        </Link>
      </div>

      {/* Center: always-visible search */}
      <div className="flex-1 flex items-center justify-center px-2 md:px-4 min-w-0">
        {center}
      </div>

      <div className="flex items-center gap-1">
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

        {/* Sidebar toggle — desktop only. On mobile the player sheet opens on
            recording-select and is controlled via the mini-player. */}
        <button
          onClick={onToggleSidebar}
          className={`hidden md:flex items-center justify-center p-2 rounded-md transition-colors duration-200 ${sidebarOpen ? 'r-text-accent' : 'r-text-muted r-hover-accent'}`}
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
