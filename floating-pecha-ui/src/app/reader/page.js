"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Import our single source of truth
import { uchen, inter, SIZES, getThemeCssVars } from '@/lib/theme';

// ==========================================
// 1. TIME PARSING & FORMATTING LOGIC
// ==========================================
const parseToSeconds = (ts) => {
  if (!ts) return 0;
  if (!ts.includes(':')) return parseFloat(ts) || 0;

  const [hms, ms] = ts.split(',');
  const parts = hms.split(':').map(Number);
  let seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return seconds + (ms ? parseInt(ms) / 1000 : 0);
};

const formatDuration = (startTs, endTs) => {
  const start = parseToSeconds(startTs);
  const end = endTs ? parseToSeconds(endTs) : start + 10;
  const totalSeconds = Math.round(end - start);
  if (totalSeconds <= 0) return '1s';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return secs === 0 ? `${mins}mn` : `${mins}mn${secs}s`;
};

// ==========================================
// 2. MAIN READER COMPONENT
// ==========================================
function ReaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Extract variables from the URL
  const instanceId = searchParams.get('instance') || 'rpn_ngondro_1';
  const anchorSylId = searchParams.get('sylId'); // The segment's first syllable
  const searchQuery = searchParams.get('q');     // The user's exact search term

  const [manifest, setManifest] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeId, setActiveId] = useState(null);
  const [contextOptions, setContextOptions] = useState([]);

  // Load manifest and session data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [manifestRes, sessionsRes] = await Promise.all([
          fetch(`/data/${instanceId}/manifest.json`),
          fetch(`/data/${instanceId}/${instanceId}_compiled_sessions.json`)
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

  // Map syllables to their media segments
  const syllableMediaMap = useMemo(() => {
    const map = {};
    sessions.forEach(segment => {
      const mediaSource = segment.media_restored || segment.media_original || segment.media;
      if (mediaSource) {
        segment.syl_uuids.forEach(uuid => {
          if (!map[uuid]) map[uuid] = [];
          const exists = map[uuid].some(opt => opt.segId === (segment.global_seg_id || segment.seg_id));
          if (!exists) {
            map[uuid].push({
              mediaUrl: mediaSource,
              startTime: segment.start,
              endTime: segment.end,
              segId: segment.global_seg_id || segment.seg_id,
              source: segment.source_session,
              sylUuids: segment.syl_uuids
            });
          }
        });
      }
    });
    return map;
  }, [sessions]);

// Deep Linking Highlight Effect (Auto-scroll & Click multi-syllable phrases)
  useEffect(() => {
    if (!isLoading && manifest.length > 0 && anchorSylId && Object.keys(syllableMediaMap).length > 0) {

      let targetUuids = [anchorSylId]; // Default to the first syllable of the segment

      // If we have a specific search query, find ALL syllables it spans across
      if (searchQuery) {
        const mediaOptions = syllableMediaMap[anchorSylId];
        if (mediaOptions && mediaOptions.length > 0) {
          const segmentUuids = mediaOptions[0].sylUuids;

          let concatenatedText = "";
          let charIndexToUuid = [];

          // Reconstruct the segment text and map every character index to its source syllable UUID
          for (const uuid of segmentUuids) {
            const syl = manifest.find(s => s.id === uuid);
            if (syl) {
              const startIdx = concatenatedText.length;
              concatenatedText += syl.text;
              const endIdx = concatenatedText.length;

              // Map every character index of this syllable back to its UUID
              for (let i = startIdx; i < endIdx; i++) {
                charIndexToUuid[i] = uuid;
              }
            }
          }

          // Find the user's search term in our reconstructed text
          const cleanQuery = searchQuery.trim();
          const matchIndex = concatenatedText.indexOf(cleanQuery);

          if (matchIndex !== -1) {
            // Collect EVERY unique syllable UUID that the search string touches!
            const matchedUuids = new Set();
            for (let i = matchIndex; i < matchIndex + cleanQuery.length; i++) {
              if (charIndexToUuid[i]) {
                matchedUuids.add(charIndexToUuid[i]);
              }
            }
            targetUuids = Array.from(matchedUuids);
          }
        }
      }

      // Slight delay to ensure React has painted the DOM fully
      const timer = setTimeout(() => {
        if (targetUuids.length > 0) {
          // 1. Scroll to and click the FIRST syllable in the phrase to open the media player
          const firstSyllable = document.getElementById(targetUuids[0]);
          if (firstSyllable) {
            firstSyllable.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstSyllable.click();
          }

          // 2. Highlight ALL syllables that make up the matched phrase
          targetUuids.forEach(uuid => {
            const targetSyllable = document.getElementById(uuid);
            if (targetSyllable) {
              targetSyllable.classList.add(
                'bg-[#f7f3e7]',
                'text-[#D4AF37]',
                'font-bold',
                'rounded',
                'px-1',
                'transition-colors',
                'duration-700'
              );

              // Fade the highlight out gracefully after 4 seconds
              setTimeout(() => {
                targetSyllable.classList.remove('bg-[#f7f3e7]', 'text-[#D4AF37]', 'font-bold', 'rounded', 'px-1');
              }, 4000);
            }
          });
        }
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [anchorSylId, searchQuery, isLoading, manifest.length, syllableMediaMap]);

  // Session storage scroll restoration (for returning from the player)
  useEffect(() => {
    if (isLoading) return;
    const savedPos = sessionStorage.getItem('ebook-scroll-pos');
    const savedActiveId = sessionStorage.getItem('ebook-active-id');
    if (savedActiveId && syllableMediaMap[savedActiveId]) {
      setActiveId(savedActiveId);
      setContextOptions(syllableMediaMap[savedActiveId]);
      sessionStorage.removeItem('ebook-active-id');
    }
    if (savedPos) {
      setTimeout(() => {
        window.scrollTo({ top: parseInt(savedPos), behavior: 'instant' });
        sessionStorage.removeItem('ebook-scroll-pos');
      }, 150);
    }
  }, [syllableMediaMap, isLoading]);

  const handleSyllableClick = (syllable, options) => {
    if (activeId === syllable.id) {
      setActiveId(null);
      setContextOptions([]);
    } else {
      setActiveId(syllable.id);
      setContextOptions(options);
    }
  };

  const navigateToPlayer = (opt) => {
    sessionStorage.setItem('ebook-scroll-pos', window.scrollY.toString());
    if (activeId) sessionStorage.setItem('ebook-active-id', activeId);
    router.push(`/player?instance=${instanceId}&session=${opt.source}&time=${opt.startTime}&media=${encodeURIComponent(opt.mediaUrl)}&sylId=${activeId}`);
  };

  const renderSegmentText = (opt, currentActiveId) => {
    const segmentSyllables = manifest.filter(s => opt.sylUuids.includes(s.id));
    return segmentSyllables.map(s => {
      if (s.text === '\n') return " ";
      const isTarget = currentActiveId === s.id;
      const baseStyle = SIZES[s.size?.toUpperCase()] || SIZES.DEFAULT;
      return (
        <span
          key={`ctx-${s.id}`}
          className={isTarget ? "text-[var(--theme-gold)] font-bold" : "text-black"}
          style={{
            ...baseStyle,
            fontSize: `${parseFloat(baseStyle.fontSize) * 0.55}rem`,
            lineHeight: "1.55"
          }}
        >
          {s.text}
        </span>
      );
    });
  };

  if (isLoading) {
    return <div className={`min-h-screen flex items-center justify-center bg-[#F7FAFC] text-[#C19A5B] text-xl ${inter.className}`}>Loading reading room...</div>;
  }

  return (
    <main className="min-h-screen bg-[#F7FAFC]" style={getThemeCssVars()}>

      {/* FLOATING STICKY BAR */}
      <nav className="sticky top-0 z-50 w-full bg-[#F7FAFC]/80 backdrop-blur-md border-b border-gray-200 py-4 px-8 md:px-12">
        <div className="max-w-5xl mx-auto flex items-center">
          <button
            onClick={() => router.push('/')}
            className="group flex items-center gap-2 text-[var(--theme-gray)] hover:text-[var(--theme-hover-red)] transition-all"
            aria-label="Back to Catalog"
          >
            <span className="text-2xl transition-transform group-hover:-translate-x-1">←</span>
            <span className={`${inter.className} text-xs font-bold uppercase tracking-[0.2em]`}>
              Back to Catalog
            </span>
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto p-4 md:p-12">
        <div className="bg-[#F9F9F7] rounded-xl shadow-2xl border border-gray-100">
          <div className="p-8 md:p-16 text-justify leading-relaxed">
            {manifest.map((syl) => {
              if (syl.text === '\n') return <div key={syl.id} className="block h-8" />;

              const mediaOptions = syllableMediaMap[syl.id] || [];
              const hasMedia = mediaOptions.length > 0;
              const hasMultipleSegments = mediaOptions.length > 1;
              const isSelected = activeId === syl.id;

              const fontClass = (syl.nature === 'TEXT' || syl.nature === 'PUNCT' || syl.nature === 'SYM') ? uchen.className : 'font-sans';
              const sizeStyle = SIZES[syl.size?.toUpperCase()] || SIZES.DEFAULT;

              let textColorClass = "text-black";
              if (!hasMedia) textColorClass = "text-[var(--theme-no-media)]";
              else if (isSelected) textColorClass = "text-[var(--theme-gold)] font-bold";

              return (
                <React.Fragment key={syl.id}>
                  <span
                    id={syl.id}
                    onClick={hasMedia ? () => handleSyllableClick(syl, mediaOptions) : undefined}
                    className={`${fontClass} inline transition-all duration-300 ${textColorClass} ${
                      hasMedia ? "cursor-pointer hover:text-[var(--theme-hover-red)]" : ""
                    } ${
                      hasMultipleSegments ? "border-b border-[var(--theme-gold)]" : (hasMedia ? "border-b border-transparent" : "")
                    }`}
                    style={{ ...sizeStyle, whiteSpace: 'pre-wrap' }}
                  >
                    {syl.text}
                  </span>

                  {isSelected && (
                    <div className="block w-full my-8 clear-both cursor-default">
                      <div className="bg-[#EBEBEB] border-y-2 border-[var(--theme-gold-border)] py-12 px-8 md:px-16 -mx-8 md:-mx-16 relative shadow-[inner_0_2px_10px_rgba(0,0,0,0.05)] animate-in fade-in zoom-in-95 duration-300">
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveId(null); }}
                          className="absolute top-4 left-4 md:top-6 md:left-6 text-2xl font-light text-[var(--theme-gray)] hover:text-[var(--theme-hover-red)] transition-colors leading-none"
                          aria-label="Close"
                        >
                          ✕
                        </button>

                        <div className="max-w-4xl mx-auto" style={{ textAlign: 'left' }}>
                          <ul className="divide-y divide-[var(--theme-gold-divide)]">
                            {contextOptions.map((opt, idx) => (
                              <li key={idx} className="py-6 first:pt-0 last:pb-0">
                                <button
                                  onClick={() => navigateToPlayer(opt)}
                                  className="w-full text-left hover:bg-white/60 p-4 rounded-xl transition-all flex flex-col md:flex-row gap-4 items-start md:items-end justify-between"
                                >
                                  <div className={`${uchen.className} flex-grow`}>
                                    {renderSegmentText(opt, activeId)}
                                  </div>
                                  <div className="flex-shrink-0 pt-2 md:pt-0">
                                    <span className={`${inter.className} inline-flex items-center justify-center px-1.5 py-0.5 text-sm font-medium text-[var(--theme-badge-text)] bg-[var(--theme-badge-color)] rounded-full opacity-80 tracking-wide`}>
                                      {formatDuration(opt.startTime, opt.endTime)}
                                    </span>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F7FAFC] text-[#C19A5B] text-xl">Loading configuration...</div>}>
      <ReaderContent />
    </Suspense>
  );
}