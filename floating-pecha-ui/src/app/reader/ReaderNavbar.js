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
  canAnnotate,
  annotateMode,
  onToggleAnnotate,
  transcriptReady,
  transcriptionOn,
  onToggleTranscription,
  isMobile = false,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  // Tap-to-show tooltip with auto-dismiss (touch devices have no un-hover).
  const [tipShown, setTipShown] = useState(null);
  const tipTimerRef = useRef(null);
  const flashTip = (name) => {
    setTipShown(name);
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => setTipShown(null), 1600);
  };
  useEffect(() => () => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
  }, []);

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
    <nav className={`${outfit.className} fixed top-0 z-60 w-full h-16 border-b pl-2 pr-2 md:px-10 flex items-center justify-between r-bg r-border`}>
      <div className="flex items-center gap-2 md:gap-4">
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
        {onToggleTranscription && (
          <span className="r-tip-wrap flex">
            <button
              onClick={() => { flashTip('transcription'); if (transcriptReady) onToggleTranscription?.(); }}
              disabled={!transcriptReady}
              className={`flex items-center justify-center p-2 rounded-md transition-all duration-200 ${
                !transcriptReady
                  ? "r-text-disabled opacity-50 cursor-not-allowed"
                  : transcriptionOn
                    ? "r-text-accent r-icon-pressed"
                    : "r-text-muted r-hover-accent"
              }`}
              aria-label={
                !transcriptReady
                  ? "No transcription available"
                  : transcriptionOn
                    ? "Hide transcription"
                    : "Show transcription"
              }
              aria-pressed={transcriptionOn}
            >
              {!transcriptReady ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 3a2 2 0 0 0-2 2" />
                  <path d="M19 3a2 2 0 0 1 2 2" />
                  <path d="M21 19a2 2 0 0 1-2 2" />
                  <path d="M5 21a2 2 0 0 1-2-2" />
                  <path d="M9 3h1" />
                  <path d="M14 3h1" />
                  <path d="M9 21h1" />
                  <path d="M14 21h1" />
                  <path d="M3 9v1" />
                  <path d="M21 9v1" />
                  <path d="M3 14v1" />
                  <path d="M21 14v1" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              )}
            </button>
            <span className={`r-tip ${tipShown === 'transcription' ? 'r-tip-show' : ''}`}>Transcription</span>
          </span>
        )}

        {canAnnotate && (
          <span className="r-tip-wrap flex">
            <button
              onClick={() => { onToggleAnnotate(); flashTip('comment'); }}
              className={`flex items-center justify-center p-2 rounded-md transition-all duration-200 ${annotateMode ? "r-text-accent r-icon-pressed" : "r-text-muted r-hover-accent"}`}
              aria-label={annotateMode ? "Exit notes mode" : "Enter notes mode"}
              aria-pressed={annotateMode}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                <line x1="8" y1="10" x2="16" y2="10" />
                <line x1="8" y1="13.5" x2="13.5" y2="13.5" />
              </svg>
            </button>
            <span className={`r-tip ${tipShown === 'comment' ? 'r-tip-show' : ''}`}>Leave a comment</span>
          </span>
        )}
        <div className="r-tip-wrap relative" ref={settingsRef}>
          <button
            onClick={() => { setSettingsOpen(prev => !prev); flashTip('settings'); }}
            className={`p-2 rounded-md transition-all duration-200 text-sm font-semibold ${settingsOpen ? 'r-text-accent r-icon-pressed' : 'r-text-muted r-hover-accent'}`}
            aria-label="Reading settings"
          >
            Aa
          </button>
          <span className={`r-tip ${tipShown === 'settings' ? 'r-tip-show' : ''}`}>Text settings</span>

          {settingsOpen && prefs && onUpdatePref && (
            <ReadingSettings
              prefs={prefs}
              onUpdate={onUpdatePref}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>

        {/* Sidebar toggle — desktop only (gated on !isMobile so it switches at
            the same 1024px line as the body). On mobile the player sheet opens on
            recording-select and is controlled via the mini-player. */}
        {!isMobile && (
          <button
            onClick={onToggleSidebar}
            className="flex items-center justify-center p-2 rounded-md transition-colors duration-200 r-text-muted r-hover-accent"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M15 3v18" />
              {sidebarOpen ? <path d="m8 9 3 3-3 3" /> : <path d="m10 15-3-3 3-3" />}
            </svg>
          </button>
        )}
      </div>
    </nav>
  );
}
