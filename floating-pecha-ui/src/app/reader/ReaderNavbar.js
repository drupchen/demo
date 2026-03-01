'use client';

import { useState, useRef, useEffect } from 'react';
import { inter } from '@/lib/theme';
import ReadingSettings from './ReadingSettings';

/**
 * Fixed top navigation bar for the reader page.
 */
export default function ReaderNavbar({
  onToggleSidebar,
  onToggleSearch,
  sidebarOpen,
  prefs,
  onUpdatePref,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  // Close settings popover on outside click
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
    <nav
      className="fixed top-0 z-[60] w-full h-16 border-b px-6 md:px-10 flex items-center justify-between"
      style={{
        backgroundColor: 'var(--reader-bg-primary, #FFFFFF)',
        borderColor: 'var(--reader-border, #E5E7EB)',
      }}
    >
      {/* Left: back to catalog */}
      <a
        href="/archive"
        className={`${inter.className} group flex items-center gap-2.5 text-[10px] md:text-xs font-semibold uppercase tracking-[0.18em] transition-colors duration-200`}
        style={{ color: 'var(--reader-text-muted, #9CA3AF)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--reader-accent, #D4AF37)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--reader-text-muted, #9CA3AF)'; }}
        aria-label="Back to Catalog"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200 group-hover:-translate-x-1"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Catalog</span>
      </a>

      {/* Right: search + settings + sidebar toggles */}
      <div className="flex items-center gap-1">
        {/* Search toggle */}
        <button
          onClick={onToggleSearch}
          className="p-2 rounded-md transition-colors duration-200"
          style={{ color: 'var(--reader-text-muted, #9CA3AF)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--reader-accent, #D4AF37)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--reader-text-muted, #9CA3AF)'; }}
          aria-label="Toggle search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Reading settings toggle */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setSettingsOpen(prev => !prev)}
            className={`${inter.className} p-2 rounded-md transition-colors duration-200 text-sm font-bold`}
            style={{
              color: settingsOpen
                ? 'var(--reader-accent, #D4AF37)'
                : 'var(--reader-text-muted, #9CA3AF)',
            }}
            onMouseEnter={(e) => {
              if (!settingsOpen) e.currentTarget.style.color = 'var(--reader-accent, #D4AF37)';
            }}
            onMouseLeave={(e) => {
              if (!settingsOpen) e.currentTarget.style.color = 'var(--reader-text-muted, #9CA3AF)';
            }}
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

        {/* Sidebar toggle */}
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-md transition-colors duration-200"
          style={{
            color: sidebarOpen
              ? 'var(--reader-accent, #D4AF37)'
              : 'var(--reader-text-muted, #9CA3AF)',
          }}
          onMouseEnter={(e) => {
            if (!sidebarOpen) e.currentTarget.style.color = 'var(--reader-accent, #D4AF37)';
          }}
          onMouseLeave={(e) => {
            if (!sidebarOpen) e.currentTarget.style.color = 'var(--reader-text-muted, #9CA3AF)';
          }}
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
