"use client";

import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { uchen, inter } from '@/lib/theme';
import { parseToMs, formatDurationMs, formatDurationBadge } from '@/lib/useAudioPlayer';

export default function PlayerTab({
  audio,
  activeCommentary,
  allCommentaryIds,
  allTeachingGroups,
  activeTeachingFilter,
  onTeachingFilterChange,
  activeCommentarySegments,
  manifest,
  onCommentarySelect,
  onSegmentClick,
  onSegmentHover,
  activeSylId,
  sidebarSizes,
  preferRestored,
  onTogglePreferRestored,
  getCommentaryGroup,
  noSessionMessage,
  instanceId,
  teachingTitle,
}) {
  const transcriptRef = useRef(null);
  const [userScrolledAt, setUserScrolledAt] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);

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
        start: segment.start,
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

  // Sessions within current teaching group + navigation
  const { groupSessions, currentGroupIndex } = useMemo(() => {
    if (!activeCommentary) return { groupSessions: [], currentGroupIndex: -1 };
    const currentGroup = getCommentaryGroup(activeCommentary);
    const sessions = allCommentaryIds.filter(id => getCommentaryGroup(id) === currentGroup);
    const idx = sessions.indexOf(activeCommentary);
    return { groupSessions: sessions, currentGroupIndex: idx };
  }, [activeCommentary, allCommentaryIds, getCommentaryGroup]);

  const hasPrevSession = currentGroupIndex > 0;
  const hasNextSession = currentGroupIndex >= 0 && currentGroupIndex < groupSessions.length - 1;

  // Extract short session ID (e.g. "A1" from "A1_069 A-Yeshey Lama_1")
  const shortSessionId = useMemo(() => {
    if (!activeCommentary) return '';
    return activeCommentary.split('_')[0];
  }, [activeCommentary]);

  // Build segment URL helper
  const buildSegmentUrl = useCallback((seg) => {
    const url = new URL(window.location.origin + '/reader');
    url.searchParams.set('instance', instanceId);
    url.searchParams.set('session', activeCommentary);
    url.searchParams.set('time', seg.start);
    if (seg.sylUuids?.[0]) url.searchParams.set('sylId', seg.sylUuids[0]);
    return url.toString();
  }, [instanceId, activeCommentary]);

  // Right-click: copy link + show popover
  const handleSegmentContextMenu = useCallback((e, seg, idx) => {
    e.preventDefault();
    const url = buildSegmentUrl(seg);
    navigator.clipboard.writeText(url);
    const segText = seg.syllables.map(s => s.text).join('').trim();
    setContextMenu({
      segIdx: idx,
      segText,
      url,
      clickPosition: { top: e.clientY, left: e.clientX },
    });
  }, [buildSegmentUrl]);

  // Clamp context menu to viewport
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setMenuPosition({ top: 0, left: 0, ready: false });
      return;
    }
    const pop = contextMenuRef.current.getBoundingClientRect();
    const pad = 8;
    let { top, left } = contextMenu.clickPosition;

    if (top + pop.height > window.innerHeight - pad) top = window.innerHeight - pad - pop.height;
    if (top < pad) top = pad;
    if (left + pop.width > window.innerWidth - pad) left = window.innerWidth - pad - pop.width;
    if (left < pad) left = pad;

    setMenuPosition({ top, left, ready: true });
  }, [contextMenu]);

  // Click outside to close context menu
  useEffect(() => {
    if (!contextMenu) return;
    const close = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', close);
    };
  }, [contextMenu]);

  // "Copy with info" handler
  const copyWithInfo = useCallback(() => {
    if (!contextMenu) return;
    const text = `Listen to: "${contextMenu.segText}"\n(from ${teachingTitle || instanceId}, teaching instance ${instanceId}, session ${shortSessionId}, segment ${contextMenu.segIdx + 1})\n\n${contextMenu.url}`;
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  }, [contextMenu, teachingTitle, instanceId, shortSessionId]);

  // Slide animation on session/teaching change
  const [slideClass, setSlideClass] = useState('');
  const prevCommentaryRef = useRef(activeCommentary);

  useEffect(() => {
    const prev = prevCommentaryRef.current;
    prevCommentaryRef.current = activeCommentary;

    if (!prev || !activeCommentary || prev === activeCommentary) {
      setSlideClass('');
      return;
    }

    const prevGroup = getCommentaryGroup(prev);
    const currGroup = getCommentaryGroup(activeCommentary);

    if (prevGroup !== currGroup) {
      const prevIdx = allTeachingGroups.indexOf(prevGroup);
      const currIdx = allTeachingGroups.indexOf(currGroup);
      setSlideClass(currIdx > prevIdx ? 'r-slide-right' : 'r-slide-left');
    } else {
      const prevIdx = allCommentaryIds.indexOf(prev);
      const currIdx = allCommentaryIds.indexOf(activeCommentary);
      setSlideClass(currIdx > prevIdx ? 'r-slide-right' : 'r-slide-left');
    }

    const timer = setTimeout(() => setSlideClass(''), 350);
    return () => clearTimeout(timer);
  }, [activeCommentary, allCommentaryIds, allTeachingGroups, getCommentaryGroup]);

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

  // "No session on current location" fallback
  if (!activeCommentary && noSessionMessage) {
    return (
      <div className="flex flex-col h-full -mx-5 -mb-5">
        {/* Teaching Filter Buttons */}
        {allTeachingGroups.length > 0 && (
          <div className="flex gap-1.5 px-5 py-3 overflow-x-auto border-b flex-shrink-0 r-border">
            {allTeachingGroups.map(group => {
              const isActive = activeTeachingFilter === group;
              return (
                <button
                  key={group}
                  onClick={() => onTeachingFilterChange(group)}
                  className={`${inter.className} px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider whitespace-nowrap transition-all ${isActive ? 'r-chip-active' : 'r-chip-inactive'}`}
                >
                  Teaching {group}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 flex flex-col px-5 py-4">
          {/* Previous session — top */}
          <button
            onClick={() => noSessionMessage.prevSession && onCommentarySelect(noSessionMessage.prevSession)}
            disabled={!noSessionMessage.prevSession}
            className={`${inter.className} w-full text-center py-3 text-[11px] font-semibold rounded-lg transition-colors ${
              noSessionMessage.prevSession
                ? 'r-text-accent hover:underline hover:bg-black/5'
                : 'r-text-secondary opacity-40 cursor-not-allowed'
            }`}
          >
            ← Move to previous session
          </button>

          {/* Message — center */}
          <div className="flex-1 flex items-center justify-center">
            <p className={`${inter.className} text-sm r-text-secondary`}>
              No session on current location
            </p>
          </div>

          {/* Next session — bottom */}
          <button
            onClick={() => noSessionMessage.nextSession && onCommentarySelect(noSessionMessage.nextSession)}
            disabled={!noSessionMessage.nextSession}
            className={`${inter.className} w-full text-center py-3 text-[11px] font-semibold rounded-lg transition-colors ${
              noSessionMessage.nextSession
                ? 'r-text-accent hover:underline hover:bg-black/5'
                : 'r-text-secondary opacity-40 cursor-not-allowed'
            }`}
          >
            Move to next session →
          </button>
        </div>
      </div>
    );
  }

  if (!activeCommentary) {
    return (
      <div className="flex flex-col h-full -mx-5 -mb-5 items-center justify-center">
        <div className={`${inter.className} text-sm text-center py-12 r-text-secondary`}>
          Select a commentary from the text to start listening.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -mx-5 -mb-5">
      {/* Teaching Filter Buttons */}
      {allTeachingGroups.length > 0 && (
        <div className="flex gap-1.5 px-5 py-3 overflow-x-auto border-b flex-shrink-0 r-border">
          {allTeachingGroups.map(group => {
            const isActive = activeTeachingFilter === group;
            return (
              <button
                key={group}
                onClick={() => onTeachingFilterChange(group)}
                className={`${inter.className} px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider whitespace-nowrap transition-all ${isActive ? 'r-chip-active' : 'r-chip-inactive'}`}
              >
                Teaching {group}
              </button>
            );
          })}
        </div>
      )}

      {/* Player Controls */}
      <div className="px-5 py-4 border-b flex-shrink-0 r-border">
        {/* Current session label */}
        <div className={`${inter.className} text-[10px] font-medium tracking-wider uppercase mb-2 r-text-secondary`}>
          Current session: {shortSessionId}
        </div>

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
            {/* Progress bar — display only */}
            <div className="h-1.5 rounded-full relative r-progress-track">
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
                  className={`h-full rounded-sm transition-all cursor-pointer ${isActive ? 'r-timeline-active' : isPast ? 'r-timeline-past' : 'r-timeline-future'
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
                className={`${inter.className} px-2 py-1 rounded text-[10px] font-bold transition-all ${audio.playbackRate === rate ? 'r-btn-active' : 'r-text-secondary'
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
                className={`${inter.className} px-2.5 py-1 text-[10px] font-bold transition-all ${!preferRestored ? 'r-btn-active' : 'r-text-secondary'
                  }`}
              >
                Original
              </button>
              <button
                onClick={() => !preferRestored && onTogglePreferRestored()}
                className={`${inter.className} px-2.5 py-1 text-[10px] font-bold transition-all ${preferRestored ? 'r-btn-active' : 'r-text-secondary'
                  }`}
              >
                Restored
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Synced Transcript — ALL segments */}
      <div ref={transcriptRef} className={`flex-1 overflow-y-auto px-5 py-4 space-y-1 ${slideClass}`}>
        {/* Previous session button — always visible, grayed when unavailable */}
        <button
          onClick={() => hasPrevSession && onCommentarySelect(groupSessions[currentGroupIndex - 1])}
          disabled={!hasPrevSession}
          className={`${inter.className} w-full text-center py-3 mb-2 text-[11px] font-semibold rounded-lg transition-colors ${
            hasPrevSession
              ? 'r-text-accent hover:underline hover:bg-black/5'
              : 'r-text-secondary opacity-40 cursor-not-allowed'
          }`}
        >
          ← Move to previous session
        </button>

        {transcript.map((seg, idx) => {
          const isActive = idx === activeSegIndex;
          const isFuture = activeSegIndex >= 0 && idx > activeSegIndex;

          return (
            <button
              key={seg.id}
              id={`seg-${seg.id}`}
              onClick={() => { audio.seekTo(seg.startTimeMs); audio.play(); }}
              onContextMenu={(e) => handleSegmentContextMenu(e, seg, idx)}
              onMouseEnter={() => !isActive && onSegmentHover?.(seg)}
              onMouseLeave={() => !isActive && onSegmentHover?.(null)}
              className={`w-full text-left p-3 rounded-lg transition-all ${isActive ? 'r-seg-active' : ''} ${isFuture ? 'r-seg-future' : ''}`}
              style={{ opacity: isFuture ? undefined : isActive ? 1 : 0.85 }}
            >
              <span className={`${inter.className} text-[9px] font-medium r-text-secondary opacity-50 mr-1.5`}>
                {idx + 1}
              </span>
              {isActive && (
                <span className={`${inter.className} text-[10px] font-bold uppercase tracking-wider r-text-accent mr-2`}>
                  Current
                </span>
              )}
              <span className={`${uchen.className} leading-relaxed r-text`}>
                {seg.syllables.map((syl, i) => {
                  const sylStyle = sidebarSizes?.[syl.size?.toUpperCase()] || sidebarSizes?.DEFAULT || {};
                  const isActiveSyl = syl.id === activeSylId;
                  return (
                    <span
                      key={syl.id || i}
                      style={sylStyle}
                      className={isActiveSyl ? 'r-text-accent font-bold' : ''}
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

        {/* Next session button — always visible, grayed when unavailable */}
        <button
          onClick={() => hasNextSession && onCommentarySelect(groupSessions[currentGroupIndex + 1])}
          disabled={!hasNextSession}
          className={`${inter.className} w-full text-center py-3 mt-2 text-[11px] font-semibold rounded-lg transition-colors ${
            hasNextSession
              ? 'r-text-accent hover:underline hover:bg-black/5'
              : 'r-text-secondary opacity-40 cursor-not-allowed'
          }`}
        >
          Move to next session →
        </button>

        {activeSegIndex >= 0 && (
          <ReturnButton
            userScrolledAt={userScrolledAt}
            setUserScrolledAt={setUserScrolledAt}
            transcript={transcript}
            activeSegIndex={activeSegIndex}
          />
        )}
      </div>

      {/* Right-click context menu popover — portal to body to escape transform containing block */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-72 r-bg-surface border r-border shadow-2xl rounded-2xl overflow-hidden"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            visibility: menuPosition.ready ? 'visible' : 'hidden',
          }}
        >
          <div className="bg-white/50 backdrop-blur-md p-4">
            <p className={`${inter.className} text-[10px] uppercase tracking-widest font-bold r-text-accent mb-3`}>
              Link copied
            </p>
            <div className={`${inter.className} text-[11px] space-y-1 mb-4`}>
              {teachingTitle && (
                <p><span className="r-text-secondary">Teaching: </span><span className="r-text-primary font-medium">{teachingTitle}</span></p>
              )}
              <p><span className="r-text-secondary">Instance: </span><span className="r-text-primary font-medium">{instanceId}</span></p>
              <p><span className="r-text-secondary">Session: </span><span className="r-text-primary font-medium">{shortSessionId}</span></p>
              <p><span className="r-text-secondary">Segment: </span><span className="r-text-primary font-medium">{contextMenu.segIdx + 1}</span></p>
            </div>
            <button
              onClick={copyWithInfo}
              className={`${inter.className} w-full text-center py-2 rounded-lg text-[11px] font-bold r-bg-accent text-white transition-colors hover:opacity-90`}
            >
              Copy with info
            </button>
          </div>
        </div>,
        document.body
      )}
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
