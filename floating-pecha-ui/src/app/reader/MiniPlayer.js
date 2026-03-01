"use client";

import { inter, uchen } from '@/lib/theme';
import { formatDurationMs } from '@/lib/useAudioPlayer';

export default function MiniPlayer({ audio, activeSession, currentSegmentText, onExpand }) {
  if (!audio.audioSrc || !activeSession) return null;

  const progress = audio.durationMs > 0 ? (audio.currentTimeMs / audio.durationMs) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] h-14 backdrop-blur-xl border-t shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
         style={{
           backgroundColor: 'color-mix(in srgb, var(--reader-bg-surface, #FFFFFF) 95%, transparent)',
           borderColor: 'var(--reader-border, #E5E7EB)',
         }}>
      {/* Thin progress bar at top edge */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ backgroundColor: 'var(--reader-bg-elevated, #F5F5F5)' }}>
        <div className="h-full transition-all duration-200"
             style={{
               backgroundColor: 'var(--reader-accent, #D4AF37)',
               width: `${progress}%`,
             }} />
      </div>

      <div className="h-full flex items-center px-4 gap-3 max-w-5xl mx-auto">
        {/* Play/Pause */}
        <button
          onClick={audio.togglePlay}
          className="w-8 h-8 rounded-full text-white flex items-center justify-center transition-colors flex-shrink-0"
          style={{ backgroundColor: 'var(--reader-accent, #D4AF37)' }}
          aria-label={audio.isPlaying ? 'Pause' : 'Play'}
        >
          {audio.isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21" />
            </svg>
          )}
        </button>

        {/* Session + segment text */}
        <button onClick={onExpand} className="flex-1 min-w-0 text-left">
          <p className={`${inter.className} text-[10px] font-bold uppercase tracking-wider`}
             style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
            {activeSession.split('_').slice(0, 2).join(' ')}
          </p>
          <p className={`${uchen.className} text-xs truncate`}
             style={{ color: 'var(--reader-text-primary, #2D3436)' }}>
            {currentSegmentText || '...'}
          </p>
        </button>

        {/* Time */}
        <span className={`${inter.className} text-[10px] font-medium flex-shrink-0`}
              style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          {formatDurationMs(audio.currentTimeMs)} / {formatDurationMs(audio.durationMs)}
        </span>

        {/* Expand button */}
        <button
          onClick={onExpand}
          className="p-2 transition-colors"
          style={{ color: 'var(--reader-text-secondary, #6B7280)' }}
          aria-label="Open player"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
