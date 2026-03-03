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
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m${seconds}s`;
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

  // --- Playlist State ---
  const [playlist, setPlaylist] = useState([]);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(-1);
  const [isContinuous, setIsContinuous] = useState(false);
  const playStateRef = useRef({ playlist: [], currentIndex: -1, isContinuous: false });

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

  const handleEnded = useCallback(() => {
    const { isContinuous: cont, currentIndex: idx, playlist: list } = playStateRef.current;
    if (!cont || idx < 0 || idx >= list.length - 1) {
      setIsPlaying(false);
      return;
    }
    // Auto-advance to next segment in playlist
    const nextIdx = idx + 1;
    const nextItem = list[nextIdx];
    if (nextItem && nextItem.src) {
      loadSource(nextItem.src, nextItem.startMs || 0, true);
      setCurrentPlaylistIndex(nextIdx);
      playStateRef.current.currentIndex = nextIdx;
    } else {
      setIsPlaying(false);
    }
  }, []);

  // --- Control methods ---

  const play = useCallback(() => {
    const el = audioRef.current;
    if (el && el.src) el.play().catch(() => { });
  }, []);

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el) el.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => { });
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

  const loadSource = useCallback((src, startMs = 0, autoPlay = true) => {
    const el = audioRef.current;
    if (!el) return;

    setAudioSrc(src);
    setCurrentTimeMs(startMs);
    setDurationMs(0);
    setIsPlaying(false);

    // Set src imperatively to keep user-gesture chain intact for autoplay
    el.src = src;
    el.load();

    if (startMs > 0) {
      el.currentTime = startMs / 1000;
    }
    if (autoPlay) {
      el.play().catch(() => { });
    }
  }, []);

  const loadPlaylist = useCallback((newPlaylist, startIndex = 0, autoPlay = true) => {
    if (!newPlaylist || newPlaylist.length === 0) return;
    setPlaylist(newPlaylist);
    setIsContinuous(true);
    setCurrentPlaylistIndex(startIndex);

    playStateRef.current = {
      playlist: newPlaylist,
      currentIndex: startIndex,
      isContinuous: true
    };

    const firstItem = newPlaylist[startIndex];
    if (firstItem && firstItem.src) {
      loadSource(firstItem.src, firstItem.startMs || 0, autoPlay);
    }
  }, [loadSource]);

  const nextTrack = useCallback(() => {
    const { currentIndex: idx, playlist: list } = playStateRef.current;
    if (idx >= list.length - 1) return;
    const nextIdx = idx + 1;
    const nextItem = list[nextIdx];
    if (nextItem && nextItem.src) {
      loadSource(nextItem.src, nextItem.startMs || 0, true);
      setCurrentPlaylistIndex(nextIdx);
      playStateRef.current.currentIndex = nextIdx;
    }
  }, [loadSource]);

  const prevTrack = useCallback(() => {
    const { currentIndex: idx, playlist: list } = playStateRef.current;
    if (idx <= 0) return;
    const prevIdx = idx - 1;
    const prevItem = list[prevIdx];
    if (prevItem && prevItem.src) {
      loadSource(prevItem.src, prevItem.startMs || 0, true);
      setCurrentPlaylistIndex(prevIdx);
      playStateRef.current.currentIndex = prevIdx;
    }
  }, [loadSource]);

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
    onEnded: handleEnded,
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
    loadPlaylist,
    nextTrack,
    prevTrack,
    setPlaybackRate,

    // Spread onto <audio>
    audioProps,
  };
}
