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
      onSegmentClick?.(transcript[activeSegIndex], false);
    }
  }, [activeSegIndex, transcript, onSegmentClick]);

  if (!activeSession) {
    return (
      <div className={`${inter.className} text-sm text-center py-12`}
           style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
        Select a session to start listening
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -mx-5 -mb-5">
      {/* Session Switcher */}
      <div className="flex gap-1.5 px-5 py-3 overflow-x-auto border-b flex-shrink-0"
           style={{ borderColor: 'var(--reader-border, #E5E7EB)' }}>
        {allSessionIds.map(id => {
          const shortId = id.split('_')[0];
          const isActive = activeSession === id;
          return (
            <button
              key={id}
              onClick={() => onSessionSelect(id)}
              className={`${inter.className} px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider whitespace-nowrap transition-all`}
              style={{
                backgroundColor: isActive ? 'var(--reader-accent, #D4AF37)' : 'var(--reader-bg-elevated, #F5F5F5)',
                color: isActive ? '#FFFFFF' : 'var(--reader-text-secondary, #6B7280)',
              }}
            >
              {shortId}
            </button>
          );
        })}
      </div>

      {/* Player Controls */}
      <div className="px-5 py-4 border-b flex-shrink-0"
           style={{ borderColor: 'var(--reader-border, #E5E7EB)' }}>
        {/* Play/Pause + Time */}
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={audio.togglePlay}
            className="w-10 h-10 rounded-full text-white flex items-center justify-center transition-colors flex-shrink-0"
            style={{ backgroundColor: 'var(--reader-accent, #D4AF37)' }}
            aria-label={audio.isPlaying ? 'Pause' : 'Play'}
          >
            {audio.isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
            )}
          </button>

          <div className="flex-1">
            <div className={`${inter.className} flex justify-between text-[10px] font-medium mb-1`}
                 style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
              <span>{formatDurationMs(audio.currentTimeMs)}</span>
              <span>{formatDurationMs(totalDurationMs)}</span>
            </div>
            {/* Progress bar */}
            <div
              className="h-1.5 rounded-full cursor-pointer relative"
              style={{ backgroundColor: 'var(--reader-bg-elevated, #F5F5F5)' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audio.seekTo(Math.floor(pct * totalDurationMs));
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  backgroundColor: 'var(--reader-accent, #D4AF37)',
                  width: totalDurationMs > 0 ? `${(audio.currentTimeMs / totalDurationMs) * 100}%` : '0%',
                }}
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
                  className="h-full rounded-sm transition-all cursor-pointer"
                  style={{
                    width: `${Math.max(widthPct, 0.5)}%`,
                    backgroundColor: isActive
                      ? 'var(--reader-accent, #D4AF37)'
                      : isPast
                        ? 'var(--reader-accent, #D4AF37)'
                        : 'var(--reader-bg-elevated, #F5F5F5)',
                    opacity: isPast && !isActive ? 0.4 : 1,
                  }}
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
              className={`${inter.className} px-2 py-1 rounded text-[10px] font-bold transition-all`}
              style={{
                backgroundColor: audio.playbackRate === rate ? 'var(--reader-text-primary, #2D3436)' : 'transparent',
                color: audio.playbackRate === rate ? 'var(--reader-bg-surface, #FFFFFF)' : 'var(--reader-text-secondary, #6B7280)',
              }}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Synced Transcript */}
      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {transcript.map((seg, idx) => {
          const isActive = idx === activeSegIndex;
          const isFuture = activeSegIndex >= 0 && idx > activeSegIndex;

          return (
            <button
              key={seg.id}
              id={`seg-${seg.id}`}
              onClick={() => audio.seekTo(seg.startTimeMs)}
              className="w-full text-left p-3 rounded-lg transition-all"
              style={{
                backgroundColor: isActive ? 'var(--reader-accent-subtle, #FDF8EE)' : 'transparent',
                opacity: isFuture ? 0.5 : isActive ? 1 : 0.85,
              }}
            >
              <span className={`${uchen.className} text-base leading-relaxed`}
                    style={{ color: 'var(--reader-text-primary, #2D3436)' }}>
                {seg.syllables.map((syl, i) => (
                  <span key={syl.id || i}
                        style={activeSylId === syl.id ? { color: 'var(--reader-accent, #D4AF37)', fontWeight: 'bold' } : undefined}>
                    {syl.text}
                  </span>
                ))}
              </span>
              <span className={`${inter.className} inline-flex ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full align-middle`}
                    style={{
                      color: 'var(--reader-text-secondary, #6B7280)',
                      backgroundColor: 'var(--reader-bg-elevated, #F5F5F5)',
                    }}>
                {formatDurationBadge(seg.durationMs)}
              </span>
            </button>
          );
        })}

        {/* Return to current button */}
        {activeSegIndex >= 0 && (
          <ReturnButton
            userScrolledAt={userScrolledAt}
            setUserScrolledAt={setUserScrolledAt}
            transcript={transcript}
            activeSegIndex={activeSegIndex}
          />
        )}
      </div>
    </div>
  );
}

// Separate component to avoid re-rendering the entire transcript on scroll
function ReturnButton({ userScrolledAt, setUserScrolledAt, transcript, activeSegIndex }) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const timeSinceScroll = Date.now() - userScrolledAt;
    if (timeSinceScroll < 8000 && userScrolledAt > 0) {
      setShowButton(true);
      const timer = setTimeout(() => setShowButton(false), 8000 - timeSinceScroll);
      return () => clearTimeout(timer);
    }
    setShowButton(false);
  }, [userScrolledAt]);

  if (!showButton) return null;

  return (
    <button
      onClick={() => {
        setUserScrolledAt(0);
        const el = document.getElementById(`seg-${transcript[activeSegIndex]?.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
      className={`${inter.className} sticky bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-bold shadow-lg`}
      style={{
        backgroundColor: 'var(--reader-text-primary, #2D3436)',
        color: 'var(--reader-bg-surface, #FFFFFF)',
      }}
    >
      ↓ Return to current
    </button>
  );
}
