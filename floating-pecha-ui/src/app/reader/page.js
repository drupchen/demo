"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

import { uchen, inter, getSizes, getThemeCssVars } from '@/lib/theme';
import { useReaderPreferences } from '@/lib/useReaderPreferences';
import { useAudioPlayer, parseToMs } from '@/lib/useAudioPlayer';
import Footer from '@/app/components/Footer';
import ReaderNavbar from './ReaderNavbar';
import ReaderLayout from './ReaderLayout';
import CommentaryTab from './CommentaryTab';
import PlayerTab from './PlayerTab';
import InfoTab from './InfoTab';
import MiniPlayer from './MiniPlayer';
import SearchBar from './SearchBar';
import './reader.css';

// ==========================================
// HELPERS
// ==========================================
const TABS = [
  { key: 'commentary', label: 'Commentary' },
  { key: 'player',     label: 'Player' },
  { key: 'info',       label: 'Info' },
];

const COMMENTARY_COLORS = ['#D4AF37', '#4A90D9', '#E85D75', '#50B897', '#9B6BCD'];

/** Extract commentary group prefix from session ID (e.g. "A1_xxx" → "A") */
function getCommentaryGroup(sessionId) {
  const match = sessionId.match(/^([A-Za-z]+)/);
  return match ? match[1] : sessionId;
}

// ==========================================
// MAIN READER COMPONENT
// ==========================================
function ReaderContent() {
  const searchParams = useSearchParams();

  // URL parameters
  const instanceId     = searchParams.get('instance') || 'rpn_ngondro_1';
  const urlSession     = searchParams.get('session');
  const urlSylId       = searchParams.get('sylId');

  // Hooks
  const { prefs, updatePref, loaded } = useReaderPreferences();
  const audio = useAudioPlayer();

  // Data state
  const [manifest, setManifest]   = useState([]);
  const [sessions, setSessions]   = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // UI state
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [activeTab, setActiveTab]         = useState('commentary');
  const [activeSylId, setActiveSylId]     = useState(null);
  const [activeCommentary, setActiveCommentary] = useState(null);

  // Audio version preference (restored = cleaned audio when available)
  const [preferRestored, setPreferRestored] = useState(true);

  // Search match highlighting
  const [activeMatchSet, setActiveMatchSet] = useState(new Set());
  const [allMatchesSet, setAllMatchesSet] = useState(new Set());

  // Dual-scroll: playing segment highlight + auto-scroll
  const [playingSegSylIds, setPlayingSegSylIds] = useState(new Set());
  const [rootTextScrolledAt, setRootTextScrolledAt] = useState(0);
  const rootTextRef = useRef(null);

  // ----------------------------------------
  // URL-driven initial state
  // ----------------------------------------
  useEffect(() => {
    if (urlSession) {
      setActiveCommentary(getCommentaryGroup(urlSession));
      setActiveTab('player');
    }
    if (urlSylId) {
      setActiveSylId(urlSylId);
      setActiveTab('commentary');
    }
  }, [urlSession, urlSylId]);

  // ----------------------------------------
  // Data loading
  // ----------------------------------------
  useEffect(() => {
    const loadData = async () => {
      try {
        const [manifestRes, sessionsRes] = await Promise.all([
          fetch(`/data/archive/${instanceId}/manifest.json`),
          fetch(`/data/archive/${instanceId}/${instanceId}_compiled_sessions.json`)
        ]);
        if (manifestRes.ok && sessionsRes.ok) {
          const manifestData = await manifestRes.json();
          const sessionsData = await sessionsRes.json();
          setManifest(manifestData);
          setSessions(sessionsData);
        }
      } catch (error) {
        console.error("Error loading reader data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [instanceId]);

  // ----------------------------------------
  // Derived data: syllableMediaMap
  // ----------------------------------------
  const syllableMediaMap = useMemo(() => {
    const map = {};
    sessions.forEach(segment => {
      if (!segment.media_original && !segment.media_restored) return;

      segment.syl_uuids.forEach(uuid => {
        if (!map[uuid]) map[uuid] = [];
        const segId = segment.global_seg_id || segment.seg_id;
        const exists = map[uuid].some(opt => opt.global_seg_id === segId);
        if (!exists) {
          map[uuid].push({
            media_original: segment.media_original || '',
            media_restored: segment.media_restored || '',
            start: segment.start,
            end: segment.end,
            global_seg_id: segId,
            source_session: segment.source_session,
            syl_uuids: segment.syl_uuids,
          });
        }
      });
    });
    return map;
  }, [sessions]);

  // ----------------------------------------
  // Derived data: syllableDensityMap
  // ----------------------------------------
  const syllableDensityMap = useMemo(() => {
    const map = {};
    sessions.forEach(segment => {
      if (!segment.syl_uuids || !segment.source_session) return;
      segment.syl_uuids.forEach(uuid => {
        if (!map[uuid]) map[uuid] = new Set();
        map[uuid].add(getCommentaryGroup(segment.source_session));
      });
    });
    const counts = {};
    for (const uuid in map) {
      counts[uuid] = map[uuid].size;
    }
    return counts;
  }, [sessions]);

  // ----------------------------------------
  // Derived data: allCommentaryIds
  // ----------------------------------------
  const allCommentaryIds = useMemo(() => {
    const ids = new Set();
    sessions.forEach(segment => {
      if (segment.source_session) ids.add(getCommentaryGroup(segment.source_session));
    });
    return Array.from(ids).sort();
  }, [sessions]);

  // ----------------------------------------
  // Derived data: activeCommentarySegments
  // All segments from all sessions in the active commentary group.
  // ----------------------------------------
  const activeCommentarySegments = useMemo(() => {
    if (!activeCommentary) return [];
    return sessions
      .filter(seg => getCommentaryGroup(seg.source_session) === activeCommentary)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));
  }, [sessions, activeCommentary]);

  // ----------------------------------------
  // Derived data: coverageSet
  // ----------------------------------------
  const coverageSet = useMemo(() => {
    const set = new Set();
    activeCommentarySegments.forEach(seg => {
      if (seg.syl_uuids) {
        seg.syl_uuids.forEach(uuid => set.add(uuid));
      }
    });
    return set;
  }, [activeCommentarySegments]);

  // ----------------------------------------
  // Derived data: dynamic sizes from preferences
  // ----------------------------------------
  const sizes = useMemo(() => {
    if (!loaded) return getSizes();
    const { size, spacing } = prefs;
    const sizePresets = { XS: 1.25, S: 1.5, M: 1.75, L: 2.25, XL: 2.75 };
    const spacingPresets = { compact: 1.4, normal: 1.6, relaxed: 1.9 };
    return getSizes(
      sizePresets[size] || 1.75,
      spacingPresets[spacing] || 1.6
    );
  }, [prefs, loaded]);

  const sidebarSizes = useMemo(() => {
    if (!loaded) return getSizes(1.75 * 0.55);
    const { size, spacing } = prefs;
    const sizePresets = { XS: 1.25, S: 1.5, M: 1.75, L: 2.25, XL: 2.75 };
    const spacingPresets = { compact: 1.4, normal: 1.6, relaxed: 1.9 };
    const baseRem = sizePresets[size] || 1.75;
    return getSizes(baseRem * 0.55, spacingPresets[spacing] || 1.6);
  }, [prefs, loaded]);

  // ----------------------------------------
  // Derived data: paragraphs (syllables grouped at newlines)
  // ----------------------------------------
  const paragraphs = useMemo(() => {
    const result = [];
    let current = [];
    manifest.forEach(syl => {
      if (syl.text === '\n') {
        if (current.length > 0) result.push(current);
        current = [];
      } else {
        current.push(syl);
      }
    });
    if (current.length > 0) result.push(current);
    return result;
  }, [manifest]);

  // ----------------------------------------
  // Derived data: commentary color map
  // ----------------------------------------
  const commentaryColorMap = useMemo(() => {
    const map = {};
    allCommentaryIds.forEach((id, i) => {
      map[id] = COMMENTARY_COLORS[i % COMMENTARY_COLORS.length];
    });
    return map;
  }, [allCommentaryIds]);

  // ----------------------------------------
  // Derived data: current segment text for mini-player
  // ----------------------------------------
  const currentSegmentText = useMemo(() => {
    if (!activeCommentarySegments.length || !audio.currentTimeMs) return '';
    const currentSeg = activeCommentarySegments.find(seg => {
      const start = parseToMs(seg.start);
      const end = seg.end ? parseToMs(seg.end) : start + 10000;
      return audio.currentTimeMs >= start && audio.currentTimeMs < end;
    });
    if (!currentSeg) return '';
    return manifest
      .filter(syl => currentSeg.syl_uuids.includes(syl.id))
      .map(s => s.text === '\n' ? ' ' : s.text)
      .join('')
      .slice(0, 80);
  }, [activeCommentarySegments, audio.currentTimeMs, manifest]);

  // ----------------------------------------
  // Track currently-playing segment for root text highlighting
  // ----------------------------------------
  useEffect(() => {
    if (!activeCommentarySegments.length || !audio.currentTimeMs) {
      setPlayingSegSylIds(new Set());
      return;
    }
    const currentSeg = activeCommentarySegments.find(seg => {
      const start = parseToMs(seg.start);
      const end = seg.end ? parseToMs(seg.end) : start + 10000;
      return audio.currentTimeMs >= start && audio.currentTimeMs < end;
    });
    if (currentSeg) {
      setPlayingSegSylIds(new Set(currentSeg.syl_uuids));
    }
  }, [audio.currentTimeMs, activeCommentarySegments]);

  // Auto-scroll root text to follow playing segment
  useEffect(() => {
    if (playingSegSylIds.size === 0 || !rootTextRef.current) return;
    if (Date.now() - rootTextScrolledAt < 8000) return;
    const firstId = [...playingSegSylIds][0];
    const el = document.getElementById(firstId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [playingSegSylIds, rootTextScrolledAt]);

  // Scroll-lock detection for root text panel
  useEffect(() => {
    const el = rootTextRef.current;
    if (!el) return;
    const handleScroll = () => setRootTextScrolledAt(Date.now());
    el.addEventListener('wheel', handleScroll, { passive: true });
    el.addEventListener('touchmove', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleScroll);
      el.removeEventListener('touchmove', handleScroll);
    };
  }, []);

  // ----------------------------------------
  // Handlers
  // ----------------------------------------
  const handleSyllableClick = useCallback((sylId) => {
    setActiveSylId(prev => prev === sylId ? null : sylId);
    setSidebarOpen(true);
    setActiveTab('commentary');
  }, []);

  const handleCommentarySelect = useCallback((commentaryId, startSegment) => {
    setActiveCommentary(commentaryId);
    setActiveTab('player');
    setSidebarOpen(true);

    // Find segment to start from: explicit or first of commentary
    let segment = startSegment;
    if (!segment) {
      segment = sessions
        .filter(seg => getCommentaryGroup(seg.source_session) === commentaryId)
        .sort((a, b) => parseToMs(a.start) - parseToMs(b.start))[0];
    }

    if (segment) {
      const mediaSource = preferRestored
        ? (segment.media_restored || segment.media_original)
        : (segment.media_original || segment.media_restored);
      if (mediaSource) {
        audio.loadSource(mediaSource, parseToMs(segment.start));
      }

      const firstSylId = segment.syl_uuids?.[0];
      if (firstSylId) {
        setTimeout(() => {
          const el = document.getElementById(firstSylId);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [audio, sessions, preferRestored]);

  const handleSegmentClick = useCallback((segment) => {
    if (!segment?.sylUuids?.length) return;
    setRootTextScrolledAt(0);
    const el = document.getElementById(segment.sylUuids[0]);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleMatchSetsChange = useCallback((activeSet, allSet) => {
    setActiveMatchSet(activeSet);
    setAllMatchesSet(allSet);
  }, []);

  // ----------------------------------------
  // Loading state
  // ----------------------------------------
  if (isLoading || !loaded) {
    return (
      <div className={`min-h-screen flex items-center justify-center r-bg r-text-accent ${inter.className}`}>
        <span className="text-lg tracking-wide">Loading reading room...</span>
      </div>
    );
  }

  // ----------------------------------------
  // Sidebar content
  // ----------------------------------------
  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex border-b r-border">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`${inter.className} flex-1 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors duration-200 border-b-2 ${isActive ? 'r-tab-active' : 'r-tab'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 p-5 overflow-y-auto">
        {activeTab === 'commentary' && (
          <CommentaryTab
            activeSylId={activeSylId}
            syllableMediaMap={syllableMediaMap}
            manifest={manifest}
            allCommentaryIds={allCommentaryIds}
            onCommentarySelect={handleCommentarySelect}
            sidebarSizes={sidebarSizes}
            getCommentaryGroup={getCommentaryGroup}
          />
        )}

        {activeTab === 'player' && (
          <PlayerTab
            audio={audio}
            activeCommentary={activeCommentary}
            allCommentaryIds={allCommentaryIds}
            activeCommentarySegments={activeCommentarySegments}
            manifest={manifest}
            onCommentarySelect={handleCommentarySelect}
            onSegmentClick={handleSegmentClick}
            activeSylId={activeSylId}
            sidebarSizes={sidebarSizes}
            preferRestored={preferRestored}
            onTogglePreferRestored={() => setPreferRestored(prev => !prev)}
          />
        )}

        {activeTab === 'info' && (
          <InfoTab
            instanceId={instanceId}
            activeCommentary={activeCommentary}
            activeCommentarySegments={activeCommentarySegments}
            sessions={sessions}
          />
        )}
      </div>
    </div>
  );

  // ----------------------------------------
  // Render
  // ----------------------------------------
  return (
    <main className="min-h-screen flex flex-col r-bg r-text-1a" style={getThemeCssVars(prefs)}>
      <audio {...audio.audioProps} />

      <ReaderNavbar
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onToggleSearch={() => setSearchOpen(prev => !prev)}
        sidebarOpen={sidebarOpen}
        prefs={prefs}
        onUpdatePref={updatePref}
      />

      <SearchBar
        manifest={manifest}
        visible={searchOpen}
        onMatchSetsChange={handleMatchSetsChange}
      />

      <ReaderLayout sidebarOpen={sidebarOpen} sidebar={sidebarContent}>
        <div ref={rootTextRef} className="max-w-4xl mx-auto" style={{ padding: searchOpen ? '5rem 3rem 3rem 3rem' : '3rem' }}>
          <div className={`${uchen.className} text-justify`}>
            {paragraphs.map((paraSyls, pIdx) => {
              // Build coverage runs: consecutive syllables with same commentary set
              const runs = [];
              let runKey = null;
              let currentRun = null;
              paraSyls.forEach(syl => {
                const opts = syllableMediaMap[syl.id] || [];
                const groups = [];
                const seen = new Set();
                opts.forEach(opt => {
                  const g = getCommentaryGroup(opt.source_session);
                  if (!seen.has(g)) { seen.add(g); groups.push(g); }
                });
                groups.sort();
                const key = groups.join(',');
                if (key !== runKey) {
                  currentRun = { groups, syls: [] };
                  runs.push(currentRun);
                  runKey = key;
                }
                currentRun.syls.push(syl);
              });

              return (
                <div key={pIdx} className="r-paragraph">
                  {runs.map((run, rIdx) => {
                    const renderedSyls = run.syls.map(syl => {
                      const mediaOptions = syllableMediaMap[syl.id] || [];
                      const hasMedia = mediaOptions.length > 0;
                      const density = syllableDensityMap[syl.id] || 0;
                      const sizeStyle = sizes[syl.size?.toUpperCase()] || sizes.DEFAULT;

                      const isCovered = activeCommentary ? coverageSet.has(syl.id) : true;
                      const isSelected = activeSylId === syl.id;
                      const isInPlayingSegment = playingSegSylIds.has(syl.id);
                      const isActiveMatch = activeMatchSet.has(syl.id);
                      const isAnyMatch = allMatchesSet.has(syl.id);

                      const fontClass =
                        syl.nature === 'TEXT' || syl.nature === 'PUNCT' || syl.nature === 'SYM'
                          ? uchen.className
                          : 'font-sans';

                      let colorClass = hasMedia ? 'r-text' : 'r-text-muted';
                      let bgClass = '';
                      let extraClass = '';

                      if (isSelected) {
                        colorClass = 'r-text-accent';
                        extraClass = 'font-bold';
                      }
                      if (activeCommentary && !isCovered) {
                        colorClass = 'r-text-disabled r-syl-dimmed';
                      }
                      if (isActiveMatch) {
                        colorClass = '';
                        bgClass = 'r-match-active';
                      } else if (isAnyMatch) {
                        colorClass = '';
                        bgClass = 'r-match';
                      } else if (isInPlayingSegment) {
                        bgClass = 'r-syl-playing';
                      }

                      return (
                        <span
                          key={syl.id}
                          id={syl.id}
                          onClick={hasMedia ? () => handleSyllableClick(syl.id) : undefined}
                          className={`${fontClass} r-syl inline relative ${colorClass} ${bgClass} ${extraClass} ${
                            hasMedia && !isSelected ? 'cursor-pointer r-hover-red' : ''
                          } ${isInPlayingSegment ? 'rounded-sm' : ''}`}
                          style={sizeStyle}
                        >
                          {syl.text}
                          {density > 0 && !activeCommentary && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-[2px] pointer-events-none" aria-hidden="true">
                              {density === 1 && (
                                <span className="w-[3px] h-[3px] rounded-full opacity-40 r-density-dot" />
                              )}
                              {density >= 2 && density <= 3 && (
                                <>
                                  <span className="w-[3px] h-[3px] rounded-full opacity-40 r-density-dot" />
                                  <span className="w-[3px] h-[3px] rounded-full opacity-40 r-density-dot" />
                                </>
                              )}
                              {density >= 4 && (
                                <span className="w-[8px] h-[2px] rounded-full opacity-50 r-density-dot" />
                              )}
                            </span>
                          )}
                        </span>
                      );
                    });

                    // Uncovered run: render syllables inline
                    if (run.groups.length === 0) {
                      return <React.Fragment key={`r${rIdx}`}>{renderedSyls}</React.Fragment>;
                    }

                    // Covered run: block div with side border stripes
                    return (
                      <div key={`r${rIdx}`} className="relative">
                        <div className="absolute top-0 bottom-0 flex" style={{ right: 'calc(100% + 8px)', gap: '2px' }}>
                          {run.groups.map(g => (
                            <div key={g} className="rounded-full" style={{ width: '3px', backgroundColor: commentaryColorMap[g] }} />
                          ))}
                        </div>
                        {renderedSyls}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <Footer className="mt-8" style={{ paddingBottom: audio.audioSrc && activeCommentary ? '3.5rem' : undefined }} />
      </ReaderLayout>

      <MiniPlayer
        audio={audio}
        activeCommentary={activeCommentary}
        currentSegmentText={currentSegmentText}
        onExpand={() => {
          setSidebarOpen(true);
          setActiveTab('player');
        }}
      />
    </main>
  );
}

// ==========================================
// PAGE EXPORT WITH SUSPENSE BOUNDARY
// ==========================================
export default function ReaderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <span className={`${inter.className} text-lg tracking-wide r-text-accent`}>
            Loading configuration...
          </span>
        </div>
      }
    >
      <ReaderContent />
    </Suspense>
  );
}
