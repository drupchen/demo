"use client";

import { useCallback } from "react";
import { inter } from "@/lib/theme";

/**
 * Thumb-zone audio bar for mobile. Purely a view over the shared
 * `useAudioPlayer` instance — it adds no playback state of its own:
 * title left, previous-segment / play-pause / next-segment on the right,
 * and a thin edge-to-edge progress/seek bar pinned to the bottom edge.
 *
 * Segment stepping (prev/next) is delegated to the parent via
 * `onPrevSegment` / `onNextSegment`, matching the rest of the player which
 * navigates by segment rather than by seconds.
 *
 * Tapping the title area expands the full PlayerTab sheet via `onExpand`.
 */
export default function MobileAudioBar({
  audio,
  title,
  onPrevSegment,
  onNextSegment,
  studyMode,
  onToggleStudyMode,
  studyAvailable,
  onTogglePlay,
  onExpand,
}) {
  const { isPlaying, currentTimeMs, durationMs, audioSrc } = audio;

  const pct =
    durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0;

  const handleSeek = useCallback(
    (e) => {
      if (!durationMs) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.seekTo(frac * durationMs);
    },
    [audio, durationMs]
  );

  // Nothing loaded yet → keep the bottom edge clean.
  if (!audioSrc) return null;

  const btn =
    "flex items-center justify-center w-11 h-11 flex-shrink-0 rounded-full r-text-1a active:bg-black/10 transition-colors";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[70] border-t border-black/[0.08]"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,248,244,0.98) 100%)",
        backdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center gap-1 px-2 h-16">
        {/* Title — tap to open the full player */}
        <button
          type="button"
          onClick={onExpand}
          className={`${inter.className} flex-1 min-w-0 text-left px-2 py-2`}
          aria-label="Open player"
        >
          <span className="block truncate text-[13px] font-semibold r-text-1a">
            {title || "Now playing"}
          </span>
          <span className="block text-[10px] r-text-muted uppercase tracking-[0.15em]">
            Tap to open player
          </span>
        </button>

        {/* Study segment (loop one segment) — only while the read-along is shown */}
        {studyAvailable && onToggleStudyMode && (
          <button
            type="button"
            onClick={onToggleStudyMode}
            className={btn}
            aria-label="Study segment — loop one transcript segment"
            aria-pressed={studyMode}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={studyMode ? "var(--theme-hover-red, #8B1D1D)" : "currentColor"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 10c0-4.4-3.6-8-8-8s-8 3.6-8 8 3.6 8 8 8h8" />
              <path d="m16 14 4 4-4 4" />
            </svg>
          </button>
        )}

        {/* Previous segment — hidden in loop mode (stepping makes no sense) */}
        {!studyMode && (
          <button
            type="button"
            onClick={onPrevSegment}
            className={btn}
            aria-label="Previous segment"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="11 19 4 12 11 5" />
              <polyline points="20 19 13 12 20 5" />
            </svg>
          </button>
        )}

        {/* Play / Pause */}
        <button
          type="button"
          onClick={onTogglePlay || audio.togglePlay}
          className="flex items-center justify-center w-11 h-11 flex-shrink-0 rounded-full text-white r-bg-accent active:opacity-90 transition-opacity"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Loop mode hides the next-segment arrow; this spacer fills its slot so
            the play button stays put instead of sliding to the edge. */}
        {studyMode && <div className="w-11 flex-shrink-0" aria-hidden="true" />}

        {/* Next segment — hidden in loop mode (stepping makes no sense) */}
        {!studyMode && (
          <button
            type="button"
            onClick={onNextSegment}
            className={btn}
            aria-label="Next segment"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 19 20 12 13 5" />
              <polyline points="4 19 11 12 4 5" />
            </svg>
          </button>
        )}
      </div>

      {/* Edge-to-edge progress / seek bar */}
      <div
        className="absolute left-0 right-0 bottom-0 h-2 cursor-pointer"
        onClick={handleSeek}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="absolute left-0 right-0 bottom-0 h-1 r-progress-track" />
        <div
          className="absolute left-0 bottom-0 h-1 r-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
