"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { uchen, inter } from '@/lib/theme';
import { parseToMs, formatDurationMs, formatDurationBadge } from '@/lib/useAudioPlayer';

export default function PlayerTab({
  audio,
  activeCommentary,
  allCommentaryIds,
  activeCommentarySegments,
  manifest,
  onCommentarySelect,
  onSegmentClick,
  activeSylId,
  sidebarSizes,
  preferRestored,
  onTogglePreferRestored,
}) {
  const transcriptRef = useRef(null);
  const [userScrolledAt, setUserScrolledAt] = useState(0);

  // Check if any segment in this commentary has restored audio
  const hasRestored = useMemo(() => {
    return activeCommentarySegments.some(seg => Boolean(seg.media_restored));
  }, [activeCommentarySegments]);

  // Build transcript from segments
  const transcript = useMemo(() => {
    return activeCommentarySegments.map(segment => {
      const syllables = manifest
        .filter(syl => segment.syl_uuids.includes(syl.id))
        .map(s => ({ id: s.id, text: s.text === '\n' ? ' ' : s.text, size: s.size }));

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
  }, [activeCommentarySegments, manifest]);

  // Find active segment based on current time
  const activeSegIndex = useMemo(() => {
    const idx = transcript.findIndex(
      seg => audio.currentTimeMs >= seg.startTimeMs && audio.currentTimeMs < seg.endTimeMs
    );
    if (idx >= 0) return idx;
    const past = transcript.filter(seg => seg.startTimeMs <= audio.currentTimeMs);
    return past.length > 0 ? transcript.indexOf(past[past.length - 1]) : -1;
  }, [audio.currentTimeMs, transcript]);

  // Total duration
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

  if (!activeCommentary) {
    return (
      <div className={`${inter.className} text-sm text-center py-12 r-text-secondary`}>
        Select a commentary to start listening
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -mx-5 -mb-5">
      {/* Commentary Switcher */}
      {allCommentaryIds.length > 1 && (
        <div className="flex gap-1.5 px-5 py-3 overflow-x-auto border-b flex-shrink-0 r-border">
          {allCommentaryIds.map(id => {
            const isActive = activeCommentary === id;
            return (
              <button
                key={id}
                onClick={() => onCommentarySelect(id)}
                className={`${inter.className} px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider whitespace-nowrap transition-all ${isActive ? 'r-chip-active' : 'r-chip-inactive'}`}
              >
                Commentary {id}
              </button>
            );
          })}
        </div>
      )}

      {/* Player Controls */}
      <div className="px-5 py-4 border-b flex-shrink-0 r-border">
        {/* Play/Pause + Time */}
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={audio.togglePlay}
            className="w-10 h-10 rounded-full text-white flex items-center justify-center transition-colors flex-shrink-0 r-bg-accent"
            aria-label={audio.isPlaying ? 'Pause' : 'Play'}
          >
            {audio.isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
            )}
          </button>

          <div className="flex-1">
            <div className={`${inter.className} flex justify-between text-[10px] font-medium mb-1 r-text-secondary`}>
              <span>{formatDurationMs(audio.currentTimeMs)}</span>
              <span>{formatDurationMs(totalDurationMs)}</span>
            </div>
            {/* Progress bar */}
            <div
              className="h-1.5 rounded-full cursor-pointer relative r-progress-track"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audio.seekTo(Math.floor(pct * totalDurationMs));
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-100 r-progress-fill"
                style={{ width: totalDurationMs > 0 ? `${(audio.currentTimeMs / totalDurationMs) * 100}%` : '0%' }}
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
                  className={`h-full rounded-sm transition-all cursor-pointer ${
                    isActive ? 'r-timeline-active' : isPast ? 'r-timeline-past' : 'r-timeline-future'
                  }`}
                  style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                  title={`Segment ${idx + 1}`}
                />
              );
            })}
          </div>
        )}

        {/* Speed selector + audio version toggle */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1">
            {[0.75, 1, 1.25, 1.5, 2].map(rate => (
              <button
                key={rate}
                onClick={() => audio.setPlaybackRate(rate)}
                className={`${inter.className} px-2 py-1 rounded text-[10px] font-bold transition-all ${
                  audio.playbackRate === rate ? 'r-btn-active' : 'r-text-secondary'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {hasRestored && onTogglePreferRestored && (
            <div className="flex rounded-md overflow-hidden border r-border">
              <button
                onClick={() => preferRestored && onTogglePreferRestored()}
                className={`${inter.className} px-2.5 py-1 text-[10px] font-bold transition-all ${
                  !preferRestored ? 'r-btn-active' : 'r-text-secondary'
                }`}
              >
                Original
              </button>
              <button
                onClick={() => !preferRestored && onTogglePreferRestored()}
                className={`${inter.className} px-2.5 py-1 text-[10px] font-bold transition-all ${
                  preferRestored ? 'r-btn-active' : 'r-text-secondary'
                }`}
              >
                Restored
              </button>
            </div>
          )}
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
              className={`w-full text-left p-3 rounded-lg transition-all ${isActive ? 'r-seg-active' : ''} ${isFuture ? 'r-seg-future' : ''}`}
              style={{ opacity: isFuture ? undefined : isActive ? 1 : 0.85 }}
            >
              <span className={`${uchen.className} leading-relaxed r-text`}>
                {seg.syllables.map((syl, i) => {
                  const sylStyle = sidebarSizes?.[syl.size?.toUpperCase()] || sidebarSizes?.DEFAULT || {};
                  const isHighlighted = activeSylId === syl.id;
                  return (
                    <span
                      key={syl.id || i}
                      className={isHighlighted ? 'r-text-accent font-bold' : ''}
                      style={sylStyle}
                    >
                      {syl.text}
                    </span>
                  );
                })}
              </span>
              <span className={`${inter.className} inline-flex ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full align-middle r-badge`}>
                {formatDurationBadge(seg.durationMs)}
              </span>
            </button>
          );
        })}

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
      className={`${inter.className} sticky bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-bold shadow-lg r-bg-inverted r-text-white`}
    >
      ↓ Return to current
    </button>
  );
}
