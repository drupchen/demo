"use client";

import React, { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

import { uchen, inter, getSizes, getThemeCssVars } from '@/lib/theme';
import { useReaderPreferences } from '@/lib/useReaderPreferences';
import { useAudioPlayer, parseToMs } from '@/lib/useAudioPlayer';
import Footer from '@/app/components/Footer';
import ReaderNavbar from './ReaderNavbar';
import ReaderLayout from './ReaderLayout';

// ==========================================
// SIDEBAR TAB DEFINITIONS
// ==========================================
const TABS = [
  { key: 'commentary', label: 'Commentary' },
  { key: 'player',     label: 'Player' },
  { key: 'info',       label: 'Info' },
];

// ==========================================
// MAIN READER COMPONENT
// ==========================================
function ReaderContent() {
  const searchParams = useSearchParams();

  // URL parameters
  const instanceId     = searchParams.get('instance') || 'rpn_ngondro_1';
  const urlSession     = searchParams.get('session');
  const urlSylId       = searchParams.get('sylId');
  const searchQuery    = searchParams.get('q');

  // Hooks
  const { prefs, loaded } = useReaderPreferences();
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
  const [activeSession, setActiveSession] = useState(null);

  // ----------------------------------------
  // URL-driven initial state
  // ----------------------------------------
  useEffect(() => {
    if (urlSession) {
      setActiveSession(urlSession);
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
      const mediaSource = segment.media_restored || segment.media_original || segment.media;
      if (mediaSource) {
        segment.syl_uuids.forEach(uuid => {
          if (!map[uuid]) map[uuid] = [];
          const exists = map[uuid].some(
            opt => opt.segId === (segment.global_seg_id || segment.seg_id)
          );
          if (!exists) {
            map[uuid].push({
              mediaUrl: mediaSource,
              startTime: segment.start,
              endTime: segment.end,
              segId: segment.global_seg_id || segment.seg_id,
              source: segment.source_session,
              sylUuids: segment.syl_uuids,
            });
          }
        });
      }
    });
    return map;
  }, [sessions]);

  // ----------------------------------------
  // Derived data: syllableDensityMap
  // Count distinct source_session values per syllable UUID.
  // ----------------------------------------
  const syllableDensityMap = useMemo(() => {
    const map = {};
    sessions.forEach(segment => {
      if (!segment.syl_uuids || !segment.source_session) return;
      segment.syl_uuids.forEach(uuid => {
        if (!map[uuid]) map[uuid] = new Set();
        map[uuid].add(segment.source_session);
      });
    });
    // Convert Sets to counts
    const counts = {};
    for (const uuid in map) {
      counts[uuid] = map[uuid].size;
    }
    return counts;
  }, [sessions]);

  // ----------------------------------------
  // Derived data: allSessionIds
  // Sorted unique session IDs from all segments.
  // ----------------------------------------
  const allSessionIds = useMemo(() => {
    const ids = new Set();
    sessions.forEach(segment => {
      if (segment.source_session) ids.add(segment.source_session);
    });
    return Array.from(ids).sort();
  }, [sessions]);

  // ----------------------------------------
  // Derived data: activeSessionSegments
  // Segments for the active session, sorted by start time.
  // ----------------------------------------
  const activeSessionSegments = useMemo(() => {
    if (!activeSession) return [];
    return sessions
      .filter(seg => seg.source_session === activeSession)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));
  }, [sessions, activeSession]);

  // ----------------------------------------
  // Derived data: coverageSet
  // Set of all syl_uuids from activeSessionSegments.
  // ----------------------------------------
  const coverageSet = useMemo(() => {
    const set = new Set();
    activeSessionSegments.forEach(seg => {
      if (seg.syl_uuids) {
        seg.syl_uuids.forEach(uuid => set.add(uuid));
      }
    });
    return set;
  }, [activeSessionSegments]);

  // ----------------------------------------
  // Derived data: dynamic sizes from preferences
  // ----------------------------------------
  const sizes = useMemo(() => {
    if (!loaded) return getSizes();
    const { size, spacing } = prefs;
    const sizePresets = { S: 1.75, M: 2.25, L: 2.75, XL: 3.25 };
    const spacingPresets = { compact: 1.4, normal: 1.6, relaxed: 1.9 };
    return getSizes(
      sizePresets[size] || 2.25,
      spacingPresets[spacing] || 1.6
    );
  }, [prefs, loaded]);

  // ----------------------------------------
  // Handlers
  // ----------------------------------------
  const handleSyllableClick = useCallback((sylId) => {
    setActiveSylId(prev => {
      if (prev === sylId) return null;
      return sylId;
    });
    setSidebarOpen(true);
    setActiveTab('commentary');
  }, []);

  const handleSessionSelect = useCallback((sessionId, startSegment) => {
    setActiveSession(sessionId);
    setActiveTab('player');
    setSidebarOpen(true);
    if (startSegment) {
      const mediaSource = startSegment.media_restored || startSegment.media_original || startSegment.media;
      if (mediaSource) {
        audio.loadSource(mediaSource, parseToMs(startSegment.start));
      }
    }
  }, [audio]);

  // ----------------------------------------
  // Loading state
  // ----------------------------------------
  if (isLoading || !loaded) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${inter.className}`}
        style={{ backgroundColor: 'var(--reader-bg-primary, #FFFFFF)', color: 'var(--reader-accent, #D4AF37)' }}
      >
        <span className="text-lg tracking-wide">Loading reading room...</span>
      </div>
    );
  }

  // ----------------------------------------
  // Sidebar content
  // ----------------------------------------
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div
        className="flex border-b"
        style={{ borderColor: 'var(--reader-border, #E5E7EB)' }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`${inter.className} flex-1 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors duration-200 border-b-2`}
              style={{
                color: isActive
                  ? 'var(--reader-text-primary, #1A1A1A)'
                  : 'var(--reader-text-muted, #9CA3AF)',
                borderBottomColor: isActive
                  ? 'var(--reader-accent, #D4AF37)'
                  : 'transparent',
                backgroundColor: 'transparent',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 p-5 overflow-y-auto">
        {activeTab === 'commentary' && (
          <div>
            <p
              className={`${inter.className} text-xs`}
              style={{ color: 'var(--reader-text-secondary, #4A4A4A)' }}
            >
              {allSessionIds.length} session{allSessionIds.length !== 1 ? 's' : ''} available
            </p>
            {activeSylId && (
              <p
                className={`${inter.className} text-xs mt-2`}
                style={{ color: 'var(--reader-text-muted, #9CA3AF)' }}
              >
                Selected: {activeSylId}
              </p>
            )}
          </div>
        )}

        {activeTab === 'player' && (
          <div>
            <p
              className={`${inter.className} text-xs`}
              style={{ color: 'var(--reader-text-secondary, #4A4A4A)' }}
            >
              {activeSession
                ? `Active: ${activeSession}`
                : 'Select a session'}
            </p>
            {activeSession && (
              <p
                className={`${inter.className} text-xs mt-2`}
                style={{ color: 'var(--reader-text-muted, #9CA3AF)' }}
              >
                {activeSessionSegments.length} segment{activeSessionSegments.length !== 1 ? 's' : ''} in session
              </p>
            )}
          </div>
        )}

        {activeTab === 'info' && (
          <div>
            <p
              className={`${inter.className} text-xs`}
              style={{ color: 'var(--reader-text-secondary, #4A4A4A)' }}
            >
              Instance: {instanceId}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // ----------------------------------------
  // Render
  // ----------------------------------------
  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        ...getThemeCssVars(prefs),
        backgroundColor: 'var(--reader-bg-primary, #FFFFFF)',
        color: 'var(--reader-text-primary, #1A1A1A)',
      }}
    >
      {/* Hidden audio element */}
      <audio {...audio.audioProps} />

      <ReaderNavbar
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onToggleSearch={() => setSearchOpen(prev => !prev)}
        sidebarOpen={sidebarOpen}
      />

      <ReaderLayout sidebarOpen={sidebarOpen} sidebar={sidebarContent}>
        {/* Root text */}
        <div className="p-12 max-w-4xl mx-auto">
          <div className={`${uchen.className} text-justify`}>
            {manifest.map(syl => {
              if (syl.text === '\n') return <div key={syl.id} id={syl.id} className="h-6" />;

              const mediaOptions = syllableMediaMap[syl.id] || [];
              const hasMedia = mediaOptions.length > 0;
              const density = syllableDensityMap[syl.id] || 0;
              const sizeStyle = sizes[syl.size?.toUpperCase()] || sizes.DEFAULT;

              // Coverage overlay: when a session is active, dim uncovered syllables
              const isCovered = activeSession ? coverageSet.has(syl.id) : true;
              const isSelected = activeSylId === syl.id;

              // Will be wired in Task 11 (dual-scroll)
              const isInPlayingSegment = false;

              const fontClass =
                syl.nature === 'TEXT' || syl.nature === 'PUNCT' || syl.nature === 'SYM'
                  ? uchen.className
                  : 'font-sans';

              // Color classes using CSS vars
              let textColor = 'var(--reader-text-primary, #2D3436)';
              let fontWeight = '';
              if (!hasMedia) {
                textColor = 'var(--reader-text-muted, #9CA3AF)';
              }
              if (isSelected) {
                textColor = 'var(--reader-accent, #D4AF37)';
                fontWeight = 'bold';
              }
              if (activeSession && !isCovered) {
                textColor = 'var(--reader-text-disabled, #D1D5DB)';
              }

              return (
                <span
                  key={syl.id}
                  id={syl.id}
                  onClick={hasMedia ? () => handleSyllableClick(syl.id) : undefined}
                  className={`${fontClass} inline relative ${
                    hasMedia && !isSelected ? 'cursor-pointer' : ''
                  } ${isInPlayingSegment ? 'rounded-sm' : ''}`}
                  style={{
                    ...sizeStyle,
                    color: textColor,
                    fontWeight,
                    whiteSpace: 'pre-wrap',
                    opacity: (activeSession && !isCovered) ? 0.35 : 1,
                    transition: 'opacity 500ms, color 300ms, background-color 300ms',
                    backgroundColor: isInPlayingSegment ? 'var(--reader-accent-subtle, #FDF8EE)' : 'transparent',
                  }}
                  onMouseEnter={hasMedia && !isSelected ? (e) => {
                    e.currentTarget.style.color = 'var(--theme-hover-red, #8B1D1D)';
                  } : undefined}
                  onMouseLeave={hasMedia && !isSelected ? (e) => {
                    e.currentTarget.style.color = textColor;
                  } : undefined}
                >
                  {syl.text}
                  {/* Density indicator dots */}
                  {density > 0 && !activeSession && (
                    <span
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-[2px] pointer-events-none"
                      aria-hidden="true"
                    >
                      {density === 1 && (
                        <span className="w-[3px] h-[3px] rounded-full opacity-40" style={{ backgroundColor: 'var(--reader-accent, #D4AF37)' }} />
                      )}
                      {density >= 2 && density <= 3 && (
                        <>
                          <span className="w-[3px] h-[3px] rounded-full opacity-40" style={{ backgroundColor: 'var(--reader-accent, #D4AF37)' }} />
                          <span className="w-[3px] h-[3px] rounded-full opacity-40" style={{ backgroundColor: 'var(--reader-accent, #D4AF37)' }} />
                        </>
                      )}
                      {density >= 4 && (
                        <span className="w-[8px] h-[2px] rounded-full opacity-50" style={{ backgroundColor: 'var(--reader-accent, #D4AF37)' }} />
                      )}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <Footer className="mt-8" />
      </ReaderLayout>
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
          <span className={`${inter.className} text-lg tracking-wide`} style={{ color: '#D4AF37' }}>
            Loading configuration...
          </span>
        </div>
      }
    >
      <ReaderContent />
    </Suspense>
  );
}
