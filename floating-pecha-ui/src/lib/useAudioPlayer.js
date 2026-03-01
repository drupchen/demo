'use client';

import { useState, useRef, useCallback } from 'react';

// ==========================================
// UTILITY FUNCTIONS (exported standalone)
// ==========================================

/**
 * Parse an SRT timestamp "HH:MM:SS,mmm" to milliseconds.
 * Also accepts "HH:MM:SS.mmm" (dot separator).
 *
 * @param {string} ts - Timestamp string, e.g. "00:01:23,456"
 * @returns {number} Milliseconds
 */
export function parseToMs(ts) {
  if (!ts || typeof ts !== 'string') return 0;
  // Normalize comma to dot for splitting
  const normalized = ts.replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3) return 0;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const secParts = parts[2].split('.');
  const seconds = parseInt(secParts[0], 10) || 0;
  const millis = parseInt((secParts[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;

  return (hours * 3600 + minutes * 60 + seconds) * 1000 + millis;
}

/**
 * Format milliseconds to "M:SS" display string.
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted string, e.g. "3:45"
 */
export function formatDurationMs(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format milliseconds to a short badge string: "1s", "2mn", "3mn45s".
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Badge string
 */
export function formatDurationBadge(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes}mn`;
  return `${minutes}mn${seconds}s`;
}

// ==========================================
// HOOK
// ==========================================

/**
 * Centralized audio playback hook.
 *
 * Usage:
 *   const { audioProps, isPlaying, currentTimeMs, ... } = useAudioPlayer();
 *   return <audio {...audioProps} />;
 */
export function useAudioPlayer() {
  const audioRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [audioSrc, setAudioSrc] = useState(null);

  // --- Event handlers ---

  const handleTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      setCurrentTimeMs(Math.round(el.currentTime * 1000));
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (el && Number.isFinite(el.duration)) {
      setDurationMs(Math.round(el.duration * 1000));
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  // --- Control methods ---

  const play = useCallback(() => {
    const el = audioRef.current;
    if (el && el.src) el.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el) el.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const seekTo = useCallback((ms) => {
    const el = audioRef.current;
    if (el) {
      el.currentTime = ms / 1000;
      setCurrentTimeMs(ms);
    }
  }, []);

  const loadSource = useCallback((src, startMs = 0) => {
    setAudioSrc(src);
    setCurrentTimeMs(startMs);
    setDurationMs(0);
    setIsPlaying(false);

    // Wait for next tick so the <audio> element picks up the new src
    requestAnimationFrame(() => {
      const el = audioRef.current;
      if (el) {
        el.load();
        if (startMs > 0) {
          el.currentTime = startMs / 1000;
        }
      }
    });
  }, []);

  const setPlaybackRate = useCallback((rate) => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
    setPlaybackRateState(rate);
  }, []);

  // --- Props to spread onto <audio> ---

  const audioProps = {
    ref: audioRef,
    src: audioSrc,
    onTimeUpdate: handleTimeUpdate,
    onLoadedMetadata: handleLoadedMetadata,
    onPlay: handlePlay,
    onPause: handlePause,
    preload: 'metadata',
    style: { display: 'none' },
  };

  return {
    // State
    isPlaying,
    currentTimeMs,
    durationMs,
    playbackRate,
    audioSrc,

    // Methods
    play,
    pause,
    togglePlay,
    seekTo,
    loadSource,
    setPlaybackRate,

    // Spread onto <audio>
    audioProps,
  };
}
