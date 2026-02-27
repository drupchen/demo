"use client";

import React, { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Import our single source of truth
import { uchen, inter, SIZES, getThemeCssVars } from '@/lib/theme';
import Footer from '@/app/components/Footer';

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

  // --- NEW: LOCAL SEARCH STATE ---
  const [localQuery, setLocalQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(-1);

  // Load manifest and session data
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

  // --- NEW: BUILD SEARCH INDEX ---
  const searchIndex = useMemo(() => {
    let compressedText = "";
    let charIndexToUuid = [];
    manifest.forEach(syl => {
      if (syl && syl.text) {
        for (let i = 0; i < syl.text.length; i++) {
          const char = syl.text[i];
          if (!/[ \n\r\t་།]/.test(char)) {
            compressedText += char.toLowerCase();
            charIndexToUuid.push(syl.id);
          }
        }
      }
    });
    return { compressedText, charIndexToUuid };
  }, [manifest]);

  const scrollToMatch = useCallback((uuids) => {
    if (!uuids || uuids.length === 0) return;
    const el = document.getElementById(uuids[0]);
    if (el) {
      // 160px offset ensures it scrolls just below BOTH fixed navigation bars
      const y = el.getBoundingClientRect().top + window.scrollY - 160;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  }, []);

  // --- NEW: LOCAL SEARCH EFFECT ---
  useEffect(() => {
    if (!localQuery.trim()) {
      setMatches([]);
      setActiveMatchIdx(-1);
      return;
    }

    const cleanQuery = localQuery.replace(/[ \n\r\t་།]/g, '').toLowerCase();
    if (!cleanQuery) {
      setMatches([]);
      setActiveMatchIdx(-1);
      return;
    }

    const { compressedText, charIndexToUuid } = searchIndex;
    let newMatches = [];
    let startIndex = 0;
    let matchIdx = compressedText.indexOf(cleanQuery, startIndex);

    // Limit matches to prevent browser freeze on very common single letters
    const MAX_MATCHES = 500;

    while (matchIdx !== -1 && newMatches.length < MAX_MATCHES) {
      const matchedUuids = new Set();
      for (let i = matchIdx; i < matchIdx + cleanQuery.length; i++) {
        if (charIndexToUuid[i]) matchedUuids.add(charIndexToUuid[i]);
      }
      const uuidsArr = Array.from(matchedUuids);
      if (uuidsArr.length > 0) {
        newMatches.push(uuidsArr);
      }
      startIndex = matchIdx + cleanQuery.length; // Jump past this match
      matchIdx = compressedText.indexOf(cleanQuery, startIndex);
    }

    setMatches(newMatches);
    if (newMatches.length > 0) {
      setActiveMatchIdx(0);
      setTimeout(() => {
         scrollToMatch(newMatches[0]);
      }, 50);
    } else {
      setActiveMatchIdx(-1);
    }
  }, [localQuery, searchIndex, scrollToMatch]);

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (activeMatchIdx + 1) % matches.length;
    setActiveMatchIdx(nextIdx);
    scrollToMatch(matches[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (activeMatchIdx - 1 + matches.length) % matches.length;
    setActiveMatchIdx(prevIdx);
    scrollToMatch(matches[prevIdx]);
  };

  // Memoized Sets for hyper-fast UI rendering
  const activeMatchSet = useMemo(() => new Set(matches[activeMatchIdx] || []), [matches, activeMatchIdx]);
  const allMatchesSet = useMemo(() => new Set(matches.flat()), [matches]);


  // Global Deep Linking Highlight Effect (From Catalog URL)
  useEffect(() => {
    if (isLoading || manifest.length === 0 || !anchorSylId) return;

    let targetUuids = [anchorSylId];

    if (searchQuery) {
      const anchorIndex = manifest.findIndex(s => s.id === anchorSylId);
      if (anchorIndex !== -1) {
        const searchWindow = manifest.slice(anchorIndex, anchorIndex + 150);
        let compressedText = "";
        let charIndexToUuid = [];

        for (const syl of searchWindow) {
          if (syl && syl.text) {
            for (let i = 0; i < syl.text.length; i++) {
              const char = syl.text[i];
              if (!/[ \n\r\t་།]/.test(char)) {
                compressedText += char.toLowerCase();
                charIndexToUuid.push(syl.id);
              }
            }
          }
        }

        const cleanQuery = searchQuery.replace(/[ \n\r\t་།]/g, '').toLowerCase();
        const matchIndex = compressedText.indexOf(cleanQuery);

        if (matchIndex !== -1) {
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

    const timer = setTimeout(() => {
      if (targetUuids.length > 0) {
          const firstSyllable = document.getElementById(targetUuids[0]);
          if (firstSyllable) {
            // Offset scroll to account for new search header
            const y = firstSyllable.getBoundingClientRect().top + window.scrollY - 160;
            window.scrollTo({ top: y, behavior: 'smooth' });

            const options = syllableMediaMap[targetUuids[0]] || syllableMediaMap[anchorSylId];
            if (options && options.length > 0) {
              setActiveId(targetUuids[0]);
              setContextOptions(options);
            }
          }

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

            setTimeout(() => {
              targetSyllable.classList.remove('bg-[#f7f3e7]', 'text-[#D4AF37]', 'font-bold', 'rounded', 'px-1');
            }, 4000);
          }
        });
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [anchorSylId, searchQuery, isLoading, manifest.length, syllableMediaMap]);

  // Session storage scroll restoration
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
    <main className="min-h-[calc(100vh-81px)] bg-[#F7FAFC] flex flex-col overflow-x-hidden" style={getThemeCssVars()}>

      {/* FLOATING STICKY BAR 1: NAVIGATION */}
      <nav
        className="fixed top-0 z-[60] w-full bg-[#F7FAFC]/95 backdrop-blur-xl border-b border-gray-200 px-8 md:px-12 h-20"
      >
        <div className="max-w-5xl mx-auto h-full flex items-center">
          <button
            onClick={() => router.push('/archive')}
            className="group flex items-center gap-3 text-[var(--theme-gray)] hover:text-[var(--theme-hover-red)] transition-all"
            aria-label="Back to Catalog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-300 group-hover:-translate-x-1.5"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>

            <span className={`${inter.className} text-[10px] md:text-xs font-bold uppercase tracking-[0.2em]`}>
              Back to Catalog
            </span>
          </button>
        </div>
      </nav>

      {/* FLOATING STICKY BAR 2: LOCAL SEARCH */}
      <div className="fixed top-20 z-[55] w-full bg-[#F9F9F7]/95 backdrop-blur-md border-b border-gray-200 px-4 md:px-12 h-14 flex items-center shadow-sm">
        <div className="max-w-5xl mx-auto w-full flex items-center gap-4">
          <div className="relative flex-grow max-w-sm">
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Find in teaching..."
              className={`${inter.className} w-full pl-10 pr-10 py-1.5 bg-white border border-gray-300 rounded-md focus:outline-none focus:border-[var(--theme-hover-red)] focus:ring-1 focus:ring-[var(--theme-hover-red)] text-sm transition-all text-gray-800`}
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {localQuery && (
              <button
                onClick={() => setLocalQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[var(--theme-hover-red)] transition-colors"
                aria-label="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          {matches.length > 0 && (
            <div className={`${inter.className} flex items-center gap-3 text-sm`}>
              <span className="text-[var(--theme-gray)] font-bold tracking-widest uppercase text-[10px] whitespace-nowrap">
                {activeMatchIdx + 1} / {matches.length}
              </span>
              <div className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white shadow-sm">
                <button onClick={handlePrevMatch} className="p-1.5 hover:bg-gray-50 text-[var(--theme-hover-red)] transition-colors" aria-label="Previous Match">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                </button>
                <div className="w-px h-4 bg-gray-200"></div>
                <button onClick={handleNextMatch} className="p-1.5 hover:bg-gray-50 text-[var(--theme-hover-red)] transition-colors" aria-label="Next Match">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              </div>
            </div>
          )}

          {localQuery && matches.length === 0 && (
            <span className={`${inter.className} text-[var(--theme-gray)] text-xs tracking-wide`}>No matches</span>
          )}
        </div>
      </div>

      {/* Increased padding (pt-40) so text is not hidden under the two fixed bars */}
      <div className="max-w-5xl mx-auto p-4 pt-40 md:p-12 md:pt-48">
        <div className="bg-[#F9F9F7] rounded-xl shadow-2xl border border-gray-100">
          <div className="p-8 md:p-16 text-justify leading-relaxed">
            {manifest.map((syl) => {
              if (syl.text === '\n') return <div id={syl.id} key={syl.id} className="block h-8" />;

              const mediaOptions = syllableMediaMap[syl.id] || [];
              const hasMedia = mediaOptions.length > 0;
              const hasMultipleSegments = mediaOptions.length > 1;

              // Standard interactions
              const isSelected = activeId === syl.id;

              // Local Find in Page Search States
              const isLocalActiveMatch = activeMatchSet.has(syl.id);
              const isAnyLocalMatch = allMatchesSet.has(syl.id);

              const fontClass = (syl.nature === 'TEXT' || syl.nature === 'PUNCT' || syl.nature === 'SYM') ? uchen.className : 'font-sans';
              const sizeStyle = SIZES[syl.size?.toUpperCase()] || SIZES.DEFAULT;

              let textColorClass = "text-black";
              if (!hasMedia) textColorClass = "text-[var(--theme-no-media)]";
              else if (isSelected) textColorClass = "text-[var(--theme-gold)] font-bold";

              // Local Search UI Overrides (Wins over other colors to remain highly visible)
              if (isLocalActiveMatch) {
                textColorClass = "text-[var(--theme-hover-red)] font-bold bg-[#8B1D1D]/10 rounded-sm px-[1px] shadow-[0_0_0_2px_rgba(139,29,29,0.1)]";
              } else if (isAnyLocalMatch) {
                textColorClass = "text-[#8B1D1D]/80 bg-[#8B1D1D]/5 rounded-sm px-[1px]";
              }

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
      {/* FOOTER */}
      <Footer className="mt-8" />
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