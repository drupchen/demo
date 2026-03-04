"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

import { uchen, inter, getSizes, getThemeCssVars } from '@/lib/theme';
import { useReaderPreferences } from '@/lib/useReaderPreferences';
import { useAudioPlayer, parseToMs } from '@/lib/useAudioPlayer';
import Footer from '@/app/components/Footer';
import ReaderNavbar from './ReaderNavbar';
import ReaderLayout from './ReaderLayout';
import FloatingPopover from './FloatingPopover';
import PlayerTab from './PlayerTab';
import InfoTab from './InfoTab';
import MiniPlayer from './MiniPlayer';
import SearchBar from './SearchBar';
import './reader.css';

// ==========================================
// HELPERS
// ==========================================
const TABS = [
  { key: 'player', label: 'Player' },
  { key: 'info', label: 'Info' },
];

const COMMENTARY_COLORS = ['#D4AF37', '#4A90D9', '#E85D75', '#50B897', '#9B6BCD'];

/** 
 * Calculate visual weight of a Tibetan string by ignoring vowels and subjoined characters.
 * U+0F71 to U+0F87 are vowels/combining marks. U+0F8D to U+0FBC are subjoined consonants.
 */
function getTibetanWeight(text) {
  if (!text || text === '\n') return 1;
  const stripped = text.replace(/[\u0F71-\u0F87\u0F8D-\u0FBC]/g, '');
  return Math.max(1, stripped.length);
}

/** Natural sort comparator: handles embedded numbers (A1, A2, A10). */
function naturalSortCompare(a, b) {
  const re = /(\d+)/g;
  const aParts = a.split(re);
  const bParts = b.split(re);
  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    if (aParts[i] !== bParts[i]) {
      const aNum = Number(aParts[i]);
      const bNum = Number(bParts[i]);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return aParts[i].localeCompare(bParts[i]);
    }
  }
  return a.length - b.length;
}

/**
 * Scroll to a syllable element, handling lazy-loaded paragraphs.
 * If the syllable's paragraph hasn't been rendered yet, scrolls the placeholder
 * into view first (triggering IntersectionObserver), then scrolls to the exact element.
 */
function scrollToSyllable(sylId, paragraphs) {
  const el = document.getElementById(sylId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const pIdx = paragraphs.findIndex(p => p.some(syl => syl.id === sylId));
  if (pIdx < 0) return;
  const paraEl = document.querySelector(`[data-pidx="${pIdx}"]`);
  if (!paraEl) return;
  paraEl.scrollIntoView({ behavior: 'instant', block: 'center' });
  let attempts = 0;
  const check = setInterval(() => {
    const sylEl = document.getElementById(sylId);
    if (sylEl || ++attempts > 40) {
      clearInterval(check);
      if (sylEl) sylEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 50);
}

/** Extract commentary group prefix from session ID (e.g. "A1_xxx" → "A") */
function getCommentaryGroup(sessionId) {
  const match = sessionId.match(/^([A-Za-z]+)/);
  return match ? match[1] : sessionId;
}

/**
 * Given a Y screen coordinate, find the corresponding weight fraction
 * by locating which paragraph straddles that Y and interpolating.
 * Uses binary search on paragraph elements — O(log P) getBoundingClientRect calls.
 */
function findWeightAtY(y, paragraphEls, paragraphWeightBounds) {
  if (!paragraphEls.length || !paragraphWeightBounds.length) return 0;

  const firstRect = paragraphEls[0].getBoundingClientRect();
  if (y <= firstRect.top) return paragraphWeightBounds[0].wStart;

  const lastRect = paragraphEls[paragraphEls.length - 1].getBoundingClientRect();
  if (y >= lastRect.bottom) return paragraphWeightBounds[paragraphWeightBounds.length - 1].wEnd;

  // Binary search for the paragraph whose bounding rect straddles y
  let lo = 0, hi = paragraphEls.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const rect = paragraphEls[mid].getBoundingClientRect();
    if (rect.bottom <= y) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const paraEl = paragraphEls[lo];
  const pIdx = parseInt(paraEl.getAttribute('data-pidx'), 10);
  const bounds = paragraphWeightBounds[pIdx];
  if (!bounds) return 0;

  const paraRect = paraEl.getBoundingClientRect();
  const paraFrac = Math.max(0, Math.min(1, (y - paraRect.top) / Math.max(1, paraRect.height)));
  return bounds.wStart + paraFrac * (bounds.wEnd - bounds.wStart);
}

// ==========================================
// LAZY PARAGRAPH COMPONENT
// ==========================================
const LazyParagraph = React.memo(function LazyParagraph({ paraSyls, pIdx, syllableMediaMap, getCommentaryGroup, commentaryColorMap, sizes, teachingCoverageSet, activeSylId, playingSegSylIds, hoveredSegSylIds, activeMatchSet, allMatchesSet, handleSyllableClick, uchen }) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasRendered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          hasRendered.current = true;
        }
      },
      { rootMargin: '300px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pIdx]);

  // Estimate height for placeholder: ~3rem per ~40 syllables
  const estimatedHeight = Math.max(60, Math.ceil(paraSyls.length / 40) * 60);

  if (!isVisible && !hasRendered.current) {
    return <div ref={ref} data-pidx={pIdx} className="r-paragraph" style={{ minHeight: estimatedHeight }} />;
  }

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
    <div ref={ref} data-pidx={pIdx} className="r-paragraph">
      {runs.map((run, rIdx) => {
        const renderedSyls = run.syls.map(syl => {
          if (syl.text === '\n') return <br key={syl.id} />;
          const mediaOptions = syllableMediaMap[syl.id] || [];
          const hasMedia = mediaOptions.length > 0;
          const sizeStyle = sizes[syl.size?.toUpperCase()] || sizes.DEFAULT;

          const isCoveredByFilter = teachingCoverageSet.has(syl.id);
          const isSelected = activeSylId === syl.id;
          const isInPlayingSegment = playingSegSylIds.has(syl.id);
          const isHoveredSegment = hoveredSegSylIds.has(syl.id);
          const isActiveMatch = activeMatchSet.has(syl.id);
          const isAnyMatch = allMatchesSet.has(syl.id);

          const fontClass =
            syl.nature === 'TEXT' || syl.nature === 'PUNCT' || syl.nature === 'SYM'
              ? uchen.className
              : 'font-sans';

          let colorClass = isCoveredByFilter ? 'r-text' : 'r-text-disabled r-syl-dimmed';
          if (!hasMedia && isCoveredByFilter) colorClass = 'r-text-muted';
          let bgClass = '';
          let extraClass = '';

          if (isSelected) {
            colorClass = 'r-text-accent';
            extraClass = 'font-bold';
          }
          if (isActiveMatch) {
            colorClass = '';
            bgClass = 'r-match-active';
          } else if (isAnyMatch) {
            colorClass = '';
            bgClass = 'r-match';
          } else if (isInPlayingSegment) {
            bgClass = 'r-syl-playing';
          } else if (isHoveredSegment) {
            bgClass = 'r-syl-hovered';
          }

          return (
            <span
              key={syl.id}
              id={syl.id}
              onClick={hasMedia ? () => handleSyllableClick(syl.id) : undefined}
              className={`${fontClass} r-syl inline relative ${colorClass} ${bgClass} ${extraClass} ${hasMedia && !isSelected ? 'cursor-pointer r-hover-red' : ''
                } ${isInPlayingSegment || isHoveredSegment ? 'rounded-sm' : ''}`}
              style={sizeStyle}
            >
              {syl.text}
            </span>
          );
        });

        if (run.groups.length === 0) {
          return <React.Fragment key={`r${rIdx}`}>{renderedSyls}</React.Fragment>;
        }

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
});

// ==========================================
// MAIN READER COMPONENT
// ==========================================
function ReaderContent() {
  const searchParams = useSearchParams();

  // URL parameters
  const instanceId = searchParams.get('instance') || 'rpn_ngondro_1';
  const urlSession = searchParams.get('session');
  const urlSylId = searchParams.get('sylId');
  const urlTime = searchParams.get('time');
  const urlQ = searchParams.get('q');

  // Hooks
  const { prefs, updatePref, loaded } = useReaderPreferences();
  const audio = useAudioPlayer();

  // Data state
  const [manifest, setManifest] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [teachingTitle, setTeachingTitle] = useState('');

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(!!urlQ);
  const [activeTab, setActiveTab] = useState('player');
  const [activeSylId, setActiveSylId] = useState(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeCommentary, setActiveCommentary] = useState(null);

  // Teaching filter: "A", "B", etc. or null = "All Teachings"
  const [activeTeachingFilter, setActiveTeachingFilter] = useState(null);

  // Audio version preference (restored = cleaned audio when available)
  const [preferRestored, setPreferRestored] = useState(true);

  // "No session on current location" message for teaching chip clicks
  const [noSessionMessage, setNoSessionMessage] = useState(null);

  // Search match highlighting
  const [activeMatchSet, setActiveMatchSet] = useState(new Set());
  const [allMatchesSet, setAllMatchesSet] = useState(new Set());

  // Dual-scroll: playing segment highlight + auto-scroll
  const [playingSegSylIds, setPlayingSegSylIds] = useState(new Set());
  const [hoveredSegSylIds, setHoveredSegSylIds] = useState(new Set());
  const [rootTextScrolledAt, setRootTextScrolledAt] = useState(0);
  const rootTextRef = useRef(null);

  // Scroll container ref (from ReaderLayout) for viewport tracking
  const scrollContainerRef = useRef(null);

  // Cached paragraph DOM elements for weight-based viewport tracking
  const paragraphElsRef = useRef([]);

  // Viewport tracking for coverage bar — computed from scroll position
  const [viewportRange, setViewportRange] = useState({ start: 0, end: 0.1 });

  // ----------------------------------------
  // URL-driven initial state — set immediately so sidebar opens
  // Full deep-link with time-seek is handled in a later effect after data loads
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (urlSession) {
      setActiveCommentary(urlSession);
      setActiveTab('player');
      setSidebarOpen(true);
    }
    if (urlSylId) {
      setActiveSylId(urlSylId);
    }
  }, [urlSession, urlSylId]);

  // ----------------------------------------
  // Data loading
  // ----------------------------------------
  useEffect(() => {
    const loadData = async () => {
      try {
        const [manifestRes, sessionsRes, catalogRes] = await Promise.all([
          fetch(`/data/archive/${instanceId}/manifest.json`),
          fetch(`/data/archive/${instanceId}/${instanceId}_compiled_sessions.json`),
          fetch('/data/archive/catalog.json')
        ]);
        if (manifestRes.ok && sessionsRes.ok) {
          const manifestData = await manifestRes.json();
          const sessionsData = await sessionsRes.json();
          setManifest(manifestData);
          setSessions(sessionsData);
        }
        if (catalogRes.ok) {
          const catalog = await catalogRes.json();
          for (const teaching of catalog) {
            const match = (teaching.Instances || []).find(inst => inst.Instance_ID === instanceId);
            if (match) {
              setTeachingTitle(teaching.Title_bo || '');
              break;
            }
          }
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
  // Derived data: allCommentaryIds (raw session IDs)
  // ----------------------------------------
  const allCommentaryIds = useMemo(() => {
    const ids = new Set();
    sessions.forEach(segment => {
      if (segment.source_session) ids.add(segment.source_session);
    });
    return Array.from(ids).sort(naturalSortCompare);
  }, [sessions]);

  // ----------------------------------------
  // Derived data: allTeachingGroups (unique group prefixes: "A", "B", …)
  // ----------------------------------------
  const allTeachingGroups = useMemo(() => {
    const groups = new Set();
    allCommentaryIds.forEach(id => groups.add(getCommentaryGroup(id)));
    return Array.from(groups).sort();
  }, [allCommentaryIds]);

  // ----------------------------------------
  // Derived data: activeCommentarySegments
  // ----------------------------------------
  const activeCommentarySegments = useMemo(() => {
    if (!activeCommentary) return [];
    return sessions
      .filter(seg => seg.source_session === activeCommentary)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));
  }, [sessions, activeCommentary]);

  // ----------------------------------------
  // Derived data: teachingCoverageSet
  // ----------------------------------------
  const teachingCoverageSet = useMemo(() => {
    const set = new Set();
    sessions.forEach(seg => {
      if (!seg.syl_uuids) return;
      const group = getCommentaryGroup(seg.source_session);
      if (activeTeachingFilter === null || group === activeTeachingFilter) {
        seg.syl_uuids.forEach(uuid => set.add(uuid));
      }
    });
    return set;
  }, [sessions, activeTeachingFilter]);

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
    let prevWasNewline = false;
    manifest.forEach(syl => {
      if (syl.text === '\n') {
        if (prevWasNewline) {
          // Double newline → paragraph break
          // Remove trailing single newline kept in current
          if (current.length > 0 && current[current.length - 1].text === '\n') {
            current.pop();
          }
          if (current.length > 0) result.push(current);
          current = [];
        } else {
          prevWasNewline = true;
          current.push(syl); // Keep single newline in paragraph for <br>
        }
      } else {
        prevWasNewline = false;
        current.push(syl);
      }
    });
    if (current.length > 0) result.push(current);
    return result;
  }, [manifest]);

  // ----------------------------------------
  // Derived data: cumulative syllable visual weights
  // ----------------------------------------
  const syllableWeights = useMemo(() => {
    if (!manifest.length) return [];
    const weights = new Float64Array(manifest.length + 1);
    let cumulative = 0;
    for (let i = 0; i < manifest.length; i++) {
      weights[i] = cumulative;
      cumulative += getTibetanWeight(manifest[i].text);
    }
    weights[manifest.length] = cumulative; // Total weight
    return weights;
  }, [manifest]);

  // ----------------------------------------
  // Derived data: paragraph weight bounds (for weight-based viewport tracking)
  // ----------------------------------------
  const paragraphWeightBounds = useMemo(() => {
    if (!paragraphs.length || !syllableWeights.length || !manifest.length) return [];
    const totalWeight = syllableWeights[manifest.length];
    if (totalWeight === 0) return [];

    const bounds = [];
    let manifestIdx = 0;
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      // Skip newline syllables in manifest
      while (manifestIdx < manifest.length && manifest[manifestIdx].text === '\n') {
        manifestIdx++;
      }
      const startIdx = manifestIdx;
      manifestIdx += paragraphs[pIdx].length;
      const endIdx = manifestIdx; // exclusive

      bounds.push({
        startIdx,
        endIdx,
        wStart: syllableWeights[startIdx] / totalWeight,
        wEnd: syllableWeights[endIdx] / totalWeight,
      });
    }
    return bounds;
  }, [paragraphs, manifest, syllableWeights]);

  // ----------------------------------------
  // Derived data: commentary color map (keyed by group prefix)
  // ----------------------------------------
  const commentaryColorMap = useMemo(() => {
    const map = {};
    allTeachingGroups.forEach((group, i) => {
      map[group] = COMMENTARY_COLORS[i % COMMENTARY_COLORS.length];
    });
    return map;
  }, [allTeachingGroups]);

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
    if (playingSegSylIds.size === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    if (Date.now() - rootTextScrolledAt < 8000) return;
    const firstId = [...playingSegSylIds][0];
    const el = document.getElementById(firstId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [playingSegSylIds, rootTextScrolledAt]);

  // Scroll-lock detection for root text panel
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleUserScroll = () => setRootTextScrolledAt(Date.now());
    container.addEventListener('wheel', handleUserScroll, { passive: true });
    container.addEventListener('touchmove', handleUserScroll, { passive: true });
    return () => {
      container.removeEventListener('wheel', handleUserScroll);
      container.removeEventListener('touchmove', handleUserScroll);
    };
  }, []);

  // ----------------------------------------
  // Viewport tracking — uses weight fractions to match the MiniPlayer gold bar
  // ----------------------------------------
  useEffect(() => {
    const container = scrollContainerRef.current;
    const textNode = rootTextRef.current;
    if (!container || !textNode) return;

    // Refresh cached paragraph elements (needed after lazy paragraphs render)
    const refreshParagraphEls = () => {
      paragraphElsRef.current = Array.from(container.querySelectorAll('[data-pidx]'));
    };

    const updateViewport = () => {
      refreshParagraphEls();
      const pEls = paragraphElsRef.current;

      if (!pEls.length || !paragraphWeightBounds.length) {
        setViewportRange({ start: 0, end: 1 });
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const wStart = findWeightAtY(containerRect.top, pEls, paragraphWeightBounds);
      const wEnd = findWeightAtY(containerRect.bottom, pEls, paragraphWeightBounds);

      setViewportRange({
        start: Math.max(0, Math.min(1, wStart)),
        end: Math.max(0, Math.min(1, wEnd)),
      });
    };

    // Initial update
    updateViewport();

    container.addEventListener('scroll', updateViewport, { passive: true });
    // Also observe resize to catch layout changes
    const ro = new ResizeObserver(updateViewport);
    ro.observe(container);
    ro.observe(textNode);

    return () => {
      container.removeEventListener('scroll', updateViewport);
      ro.disconnect();
    };
  }, [manifest, paragraphWeightBounds]); // re-attach when manifest loads or weight bounds change

  // ----------------------------------------
  // Navigate to position in text (from coverage bar click)
  // Weight fraction → syllable index → scroll to DOM element
  // ----------------------------------------
  const handleNavigateToPosition = useCallback((fraction) => {
    const container = scrollContainerRef.current;
    if (!container || !manifest.length || !syllableWeights.length) return;

    const totalWeight = syllableWeights[manifest.length];
    const targetWeight = fraction * totalWeight;

    // Binary search syllableWeights for the syllable at this weight fraction
    let lo = 0, hi = manifest.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (syllableWeights[mid + 1] <= targetWeight) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const targetSyl = manifest[lo];
    if (!targetSyl || !targetSyl.id) return;

    // Helper to scroll a DOM element to the center of the container
    const scrollToEl = (el) => {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const scrollTarget = elRect.top - containerRect.top + container.scrollTop - containerRect.height / 2;
      container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    };

    // Try to find the syllable's DOM element directly
    const el = document.getElementById(targetSyl.id);
    if (el) {
      scrollToEl(el);
      setRootTextScrolledAt(Date.now());
      return;
    }

    // Syllable not rendered yet (lazy paragraph placeholder).
    // Find the paragraph and scroll to it, then retry after render.
    if (paragraphWeightBounds.length > 0) {
      let pLo = 0, pHi = paragraphWeightBounds.length - 1;
      while (pLo < pHi) {
        const pMid = (pLo + pHi) >>> 1;
        if (paragraphWeightBounds[pMid].endIdx <= lo) {
          pLo = pMid + 1;
        } else {
          pHi = pMid;
        }
      }
      const paraEl = container.querySelector(`[data-pidx="${pLo}"]`);
      if (paraEl) {
        scrollToEl(paraEl);
        setRootTextScrolledAt(Date.now());
        // After scroll + lazy render, retry finding the exact syllable
        setTimeout(() => {
          const retryEl = document.getElementById(targetSyl.id);
          if (retryEl) {
            scrollToEl(retryEl);
          }
        }, 500);
      }
    }
  }, [manifest, syllableWeights, paragraphWeightBounds]);

  // ----------------------------------------
  // Rebuild playlist when preferRestored changes (audio toggle bug fix)
  // ----------------------------------------
  useEffect(() => {
    if (!activeCommentary) return;
    const segmentsForCommentary = sessions
      .filter(seg => seg.source_session === activeCommentary)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    const playlist = segmentsForCommentary.map(seg => {
      const mediaSource = preferRestored
        ? (seg.media_restored || seg.media_original)
        : (seg.media_original || seg.media_restored);
      return {
        src: mediaSource,
        startMs: parseToMs(seg.start),
        segment: seg,
      };
    });

    if (playlist.length > 0) {
      const currentMs = audio.currentTimeMs;
      // Find segment containing currentMs and restart at its beginning
      let currentIdx = 0;
      for (let i = 0; i < playlist.length; i++) {
        if (currentMs >= playlist[i].startMs) currentIdx = i;
      }
      audio.loadPlaylist(playlist, currentIdx, true);
      // Always auto-play when toggling audio version
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferRestored]);

  // ----------------------------------------
  // Handlers
  // ----------------------------------------
  const handleSyllableClick = useCallback((sylId) => {
    setActiveSylId(prev => {
      if (prev === sylId) {
        setPopoverOpen(false);
        return null;
      }
      setPopoverOpen(true);
      return sylId;
    });
    if (activeCommentary) {
      audio.pause();
      setActiveCommentary(null);
    }
  }, [activeCommentary, audio]);

  const handleCommentarySelect = useCallback((commentaryId, startSegment, autoPlay = true) => {
    setPopoverOpen(false);
    setActiveCommentary(commentaryId);
    setActiveTab('player');
    setSidebarOpen(true);
    setNoSessionMessage(null);

    const group = getCommentaryGroup(commentaryId);
    setActiveTeachingFilter(group);

    const segmentsForCommentary = sessions
      .filter(seg => seg.source_session === commentaryId)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    let startIdx = 0;
    if (startSegment) {
      const idx = segmentsForCommentary.findIndex(s => s.global_seg_id === startSegment.global_seg_id || s.seg_id === startSegment.seg_id);
      if (idx !== -1) startIdx = idx;
    }

    const playlist = segmentsForCommentary.map(seg => {
      const mediaSource = preferRestored
        ? (seg.media_restored || seg.media_original)
        : (seg.media_original || seg.media_restored);
      return {
        src: mediaSource,
        startMs: parseToMs(seg.start),
        segment: seg,
      };
    });

    if (playlist.length > 0) {
      audio.loadPlaylist(playlist, startIdx, autoPlay);

      const firstSylId = segmentsForCommentary[startIdx]?.syl_uuids?.[0];
      if (firstSylId) {
        setTimeout(() => scrollToSyllable(firstSylId, paragraphs), 100);
      }
    }
  }, [audio, sessions, preferRestored, paragraphs]);

  // ----------------------------------------
  // Deep-link: load session + seek to time once data is ready
  // ----------------------------------------
  useEffect(() => {
    if (!urlSession || sessions.length === 0 || deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;

    const segsForSession = sessions
      .filter(s => s.source_session === urlSession)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    let startSeg = null;
    if (urlTime && segsForSession.length > 0) {
      const timeMs = parseToMs(urlTime);
      startSeg = segsForSession.find(s => parseToMs(s.start) === timeMs)
        || [...segsForSession].reverse().find(s => parseToMs(s.start) <= timeMs);
    }

    handleCommentarySelect(urlSession, startSeg || undefined, true);
    if (urlSylId) {
      setActiveSylId(urlSylId);
      setTimeout(() => scrollToSyllable(urlSylId, paragraphs), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const handleTeachingFilterChange = useCallback((group) => {
    if (!group) return;

    // Stop playback when switching teachings
    if (audio.isPlaying) {
      audio.pause();
    }

    setActiveTeachingFilter(group);
    setNoSessionMessage(null);

    // Find a session in this group that contains activeSylId
    if (activeSylId && syllableMediaMap[activeSylId]) {
      const matchingOpt = syllableMediaMap[activeSylId].find(
        opt => getCommentaryGroup(opt.source_session) === group
      );
      if (matchingOpt) {
        handleCommentarySelect(matchingOpt.source_session, undefined, false);
        return;
      }
    }

    // No session found for current syllable position — compute position-aware prev/next
    const groupSessions = allCommentaryIds.filter(id => getCommentaryGroup(id) === group);

    const currentManifestIdx = activeSylId
      ? manifest.findIndex(s => s.id === activeSylId)
      : 0;

    const sessionsWithPositions = groupSessions.map(sessionId => {
      const segs = sessions.filter(s => s.source_session === sessionId);
      const firstSylId = segs[0]?.syl_uuids?.[0];
      const idx = firstSylId ? manifest.findIndex(s => s.id === firstSylId) : -1;
      return { sessionId, idx };
    }).filter(s => s.idx >= 0).sort((a, b) => a.idx - b.idx);

    const prevSession = sessionsWithPositions.filter(s => s.idx < currentManifestIdx).pop()?.sessionId || null;
    const nextSession = sessionsWithPositions.find(s => s.idx >= currentManifestIdx)?.sessionId || null;

    setActiveCommentary(null);
    setNoSessionMessage({ group, groupSessions, prevSession, nextSession });
  }, [audio, activeSylId, syllableMediaMap, allCommentaryIds, handleCommentarySelect, manifest, sessions]);

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
        {activeTab === 'player' && (
          <PlayerTab
            audio={audio}
            activeCommentary={activeCommentary}
            allCommentaryIds={allCommentaryIds}
            allTeachingGroups={allTeachingGroups}
            activeTeachingFilter={activeTeachingFilter}
            onTeachingFilterChange={handleTeachingFilterChange}
            activeCommentarySegments={activeCommentarySegments}
            manifest={manifest}
            onCommentarySelect={handleCommentarySelect}
            onSegmentClick={handleSegmentClick}
            onSegmentHover={(seg) => setHoveredSegSylIds(new Set(seg ? seg.sylUuids : []))}
            activeSylId={activeSylId}
            sidebarSizes={sidebarSizes}
            preferRestored={preferRestored}
            onTogglePreferRestored={() => setPreferRestored(prev => !prev)}
            getCommentaryGroup={getCommentaryGroup}
            noSessionMessage={noSessionMessage}
            instanceId={instanceId}
            teachingTitle={teachingTitle}
          />
        )}

        {activeTab === 'info' && (
          <InfoTab
            instanceId={instanceId}
            activeCommentary={activeCommentary}
            activeCommentarySegments={activeCommentarySegments}
            sessions={sessions}
            manifest={manifest}
            getCommentaryGroup={getCommentaryGroup}
          />
        )}
      </div>
    </div>
  );

  // ----------------------------------------
  // Render
  // ----------------------------------------
  return (
    <main className="min-h-screen flex flex-col r-bg r-text-1a overflow-x-hidden" style={getThemeCssVars(prefs)}>
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
        initialQuery={urlQ || ''}
      />

      <ReaderLayout ref={scrollContainerRef} sidebarOpen={sidebarOpen} sidebar={sidebarContent}>
        {/* Floating Context Popover */}
        <FloatingPopover
          activeSylId={activeSylId}
          popoverOpen={popoverOpen}
          syllableMediaMap={syllableMediaMap}
          manifest={manifest}
          onCommentarySelect={handleCommentarySelect}
          getCommentaryGroup={getCommentaryGroup}
          sidebarSizes={sidebarSizes}
          onClose={() => { setActiveSylId(null); setPopoverOpen(false); }}
        />

        <div ref={rootTextRef} className="max-w-4xl mx-auto" style={{ padding: searchOpen ? '5rem 3rem 3rem 3rem' : '3rem' }}>
          <div className={`${uchen.className} text-justify`}>
            {paragraphs.map((paraSyls, pIdx) => (
              <LazyParagraph
                key={pIdx}
                pIdx={pIdx}
                paraSyls={paraSyls}
                syllableMediaMap={syllableMediaMap}
                getCommentaryGroup={getCommentaryGroup}
                commentaryColorMap={commentaryColorMap}
                sizes={sizes}
                teachingCoverageSet={teachingCoverageSet}
                activeSylId={activeSylId}
                playingSegSylIds={playingSegSylIds}
                hoveredSegSylIds={hoveredSegSylIds}
                activeMatchSet={activeMatchSet}
                allMatchesSet={allMatchesSet}
                handleSyllableClick={handleSyllableClick}
                uchen={uchen}
              />
            ))}
          </div>
        </div>

        <Footer className="mt-8" style={{ paddingBottom: '3.5rem' }} />
      </ReaderLayout>

      <MiniPlayer
        manifest={manifest}
        sessions={sessions}
        allTeachingGroups={allTeachingGroups}
        activeTeachingFilter={activeTeachingFilter}
        getCommentaryGroup={getCommentaryGroup}
        commentaryColorMap={commentaryColorMap}
        viewportRange={viewportRange}
        onNavigateToPosition={handleNavigateToPosition}
        syllableWeights={syllableWeights}
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
