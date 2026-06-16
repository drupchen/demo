"use client";

import { useSearchParams } from "next/navigation";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Footer from "@/app/components/Footer";
import { getSizes, getThemeCssVars, inter, uchen } from "@/lib/theme";
import { parseToMs, useAudioPlayer } from "@/lib/useAudioPlayer";
import { useReaderPreferences } from "@/lib/useReaderPreferences";
import { useTranscription } from "@/lib/useTranscription";
import FloatingPopover from "./FloatingPopover";
import InfoTab from "./InfoTab";
import MiniPlayer from "./MiniPlayer";
import PlayerTab from "./PlayerTab";
import ReaderLayout from "./ReaderLayout";
import ReaderNavbar from "./ReaderNavbar";
import SapcheSidebar from "./SapcheSidebar";
import SapcheStudyView from "./SapcheStudyView";
import SearchBar from "./SearchBar";
import SectionMarker from "./SectionMarker";
import "./reader.css";

// ==========================================
// HELPERS
// ==========================================
const TABS = [
  { key: "player", label: "Player" },
  { key: "info", label: "Info" },
];

const COMMENTARY_COLORS = [
  "#D4AF37",
  "#4A90D9",
  "#E85D75",
  "#50B897",
  "#9B6BCD",
];

// Stable empty set so memoized paragraphs don't re-render on identity churn.
const EMPTY_SET = new Set();

/**
 * Calculate visual weight of a Tibetan string by ignoring vowels and subjoined characters.
 * U+0F71 to U+0F87 are vowels/combining marks. U+0F8D to U+0FBC are subjoined consonants.
 */
function getTibetanWeight(text) {
  if (!text || text === "\n") return 1;
  const stripped = text.replace(/[\u0F71-\u0F87\u0F8D-\u0FBC]/g, "");
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
function scrollToSyllable(sylId, paragraphs, instant = false) {
  const behavior = instant ? "instant" : "smooth";
  const el = document.getElementById(sylId);
  if (el) {
    scrollElToReadAnchor(el, behavior);
    return;
  }
  const pIdx = paragraphs.findIndex((p) => p.some((syl) => syl.id === sylId));
  if (pIdx < 0) return;
  const paraEl = document.querySelector(`[data-pidx="${pIdx}"]`);
  if (!paraEl) return;
  // Bring the placeholder into view to trigger its IntersectionObserver render,
  // then anchor the exact syllable once it exists.
  paraEl.scrollIntoView({ behavior: "instant", block: "start" });
  let attempts = 0;
  const check = setInterval(() => {
    const sylEl = document.getElementById(sylId);
    if (sylEl || ++attempts > 40) {
      clearInterval(check);
      if (sylEl) scrollElToReadAnchor(sylEl, behavior);
    }
  }, 50);
}

// Vertical anchor for the "currently read" line during read-along: this many
// text lines below the top of the scroll container (was previously centered).
const READALONG_TOP_LINES = 3;

function scrollElToReadAnchor(el, behavior = "smooth") {
  const container = document.querySelector("[data-reader-scroll]");
  if (!container || !el) return false;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 36;
  const top =
    el.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop -
    READALONG_TOP_LINES * lh;
  container.scrollTo({ top: Math.max(0, top), behavior });
  return true;
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

  const lastRect =
    paragraphEls[paragraphEls.length - 1].getBoundingClientRect();
  if (y >= lastRect.bottom)
    return paragraphWeightBounds[paragraphWeightBounds.length - 1].wEnd;

  // Binary search for the paragraph whose bounding rect straddles y
  let lo = 0,
    hi = paragraphEls.length - 1;
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
  const pIdx = parseInt(paraEl.getAttribute("data-pidx"), 10);
  const bounds = paragraphWeightBounds[pIdx];
  if (!bounds) return 0;

  const paraRect = paraEl.getBoundingClientRect();
  // Transcription mode inserts transcript blocks inside the paragraph; their
  // height carries no text weight, so spread the paragraph's weight over its
  // main-text height only (discount any .r-trans-block heights).
  let blocksTotal = 0;
  let blocksAboveY = 0;
  for (const tb of paraEl.querySelectorAll(".r-trans-block")) {
    const r = tb.getBoundingClientRect();
    blocksTotal += r.height;
    if (r.bottom <= y) blocksAboveY += r.height;
    else if (r.top < y) blocksAboveY += y - r.top; // straddles y
  }
  const mainHeight = Math.max(1, paraRect.height - blocksTotal);
  const mainAbove = Math.max(0, y - paraRect.top - blocksAboveY);
  const paraFrac = Math.max(0, Math.min(1, mainAbove / mainHeight));
  return bounds.wStart + paraFrac * (bounds.wEnd - bounds.wStart);
}

// ==========================================
// LAZY PARAGRAPH COMPONENT
// ==========================================
const LazyParagraph = React.memo(function LazyParagraph({
  paraSyls,
  pIdx,
  syllableMediaMap,
  getCommentaryGroup,
  commentaryColorMap,
  sizes,
  teachingCoverageSet,
  activeSylId,
  playingSegSylIds,
  hoveredSegSylIds,
  activeMatchSet,
  allMatchesSet,
  transActiveMatchSet,
  transAllMatchSet,
  handleSyllableClick,
  uchen,
  sylIdToSections,
  transcriptionMode,
  transBlocksByAnchor,
  transSegSylsByGid,
  activePassageSylIds,
  onTransSegClick,
}) {
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
      { rootMargin: "300px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pIdx]);

  // Estimate height for placeholder: ~3rem per ~40 syllables
  const estimatedHeight = Math.max(60, Math.ceil(paraSyls.length / 40) * 60);

  if (!isVisible && !hasRendered.current) {
    return (
      <div
        ref={ref}
        data-pidx={pIdx}
        className="r-paragraph"
        style={{ minHeight: estimatedHeight }}
      />
    );
  }

  // Hide audio-session markers like "{051 ...}" from the reading view.
  const isSessionMarker = (syl) => {
    const t = (syl.text || "").trim();
    return t.startsWith("{") && t.endsWith("}");
  };

  // Render a single syllable span (section markers are handled separately).
  const renderSyl = (syl) => {
    if (syl.text === "\n") return <br key={syl.id} />;

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
      syl.nature === "TEXT" || syl.nature === "PUNCT" || syl.nature === "SYM"
        ? uchen.className
        : "font-sans";

    // In transcription mode the transcript is the body; the root text is shown
    // in a distinct vermilion (not dimmed by audio coverage).
    let colorClass;
    if (transcriptionMode) {
      colorClass = "r-text-root";
    } else {
      colorClass = isCoveredByFilter ? "r-text" : "r-text-disabled r-syl-dimmed";
      if (!hasMedia && isCoveredByFilter) colorClass = "r-text-muted";
    }
    let bgClass = "";
    let extraClass = "";

    if (isSelected && !transcriptionMode) {
      colorClass = "r-text-accent";
      extraClass = "font-bold";
    }
    if (isActiveMatch) {
      colorClass = "";
      bgClass = "r-match-active";
    } else if (isAnyMatch) {
      colorClass = "";
      bgClass = "r-match";
    } else if (isInPlayingSegment) {
      bgClass = "r-syl-playing";
    } else if (isHoveredSegment) {
      bgClass = "r-syl-hovered";
    }

    // Transcription mode: shade only the main-text passage of the currently
    // selected/playing transcript segment.
    const isInPassage = transcriptionMode && activePassageSylIds?.has(syl.id);

    return (
      <span
        key={syl.id}
        id={syl.id}
        onClick={
          hasMedia && !transcriptionMode
            ? () => handleSyllableClick(syl.id)
            : undefined
        }
        className={`${fontClass} r-syl inline relative ${colorClass} ${bgClass} ${extraClass} ${
          isInPassage ? "r-syl-passage" : ""
        } ${
          hasMedia && !isSelected && !transcriptionMode
            ? "cursor-pointer r-hover-red"
            : ""
        } ${isInPlayingSegment || isHoveredSegment ? "rounded-sm" : ""}`}
        style={sizeStyle}
      >
        {syl.text}
      </span>
    );
  };

  // Transcription block placed after a passage's last syllable.
  const renderTransBlock = (segs, anchorId) => (
    <div key={`tb-${anchorId}`} className="r-trans-block" contentEditable={false}>
      <div className={`${uchen.className} r-trans-text`} style={sizes.BIG}>
        {segs.map((s) => (
          <span
            key={s.gid}
            id={`tseg-${s.gid}`}
            className="r-tseg r-tseg-clickable"
            onClick={() => onTransSegClick(s.gid)}
          >
            {(transSegSylsByGid[s.gid] || []).map((syl) => {
              const cls = transActiveMatchSet?.has(syl.id)
                ? "r-match-active"
                : transAllMatchSet?.has(syl.id)
                  ? "r-match"
                  : "";
              return (
                <span key={syl.id} id={syl.id} className={cls}>
                  {syl.text}
                </span>
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );

  const renderSylWithBlock = (syl) => {
    const span = renderSyl(syl);
    if (transcriptionMode && transBlocksByAnchor?.[syl.id]) {
      return [span, renderTransBlock(transBlocksByAnchor[syl.id], syl.id)];
    }
    return span;
  };

  // Build a flat list of items, breaking on commentary-set change OR a section
  // start. Section markers become block-level items (siblings of the
  // commentary-bordered runs), so they are not indented inside the audio border.
  const items = [];
  let curSeg = null;
  let curKey = null;
  paraSyls.forEach((syl) => {
    if (isSessionMarker(syl)) return; // drop audio-session markers
    const opts = syllableMediaMap[syl.id] || [];
    const groups = [];
    const seen = new Set();
    opts.forEach((opt) => {
      const g = getCommentaryGroup(opt.source_session);
      if (!seen.has(g)) {
        seen.add(g);
        groups.push(g);
      }
    });
    groups.sort();
    const key = groups.join(",");

    const starts = sylIdToSections?.get(syl.id);
    if (starts && starts.length) {
      items.push({ type: "marker", nodes: starts });
      curSeg = null; // force a new segment after the marker
    }
    if (!curSeg || key !== curKey) {
      curSeg = { type: "seg", groups, syls: [] };
      items.push(curSeg);
      curKey = key;
    }
    curSeg.syls.push(syl);
  });

  return (
    <div ref={ref} data-pidx={pIdx} className="r-paragraph">
      {items.map((item, i) => {
        if (item.type === "marker") {
          return item.nodes.map((n) => (
            <SectionMarker key={`m-${n.id}`} node={n} />
          ));
        }
        const syls = item.syls.map(renderSylWithBlock);
        if (item.groups.length === 0) {
          return <React.Fragment key={`s${i}`}>{syls}</React.Fragment>;
        }
        return (
          <div key={`s${i}`} className="relative">
            <div
              className="absolute top-0 bottom-0 flex"
              style={{ right: "calc(100% + 8px)", gap: "2px" }}
            >
              {item.groups.map((g) => (
                <div
                  key={g}
                  className="rounded-full"
                  style={{ width: "3px", backgroundColor: commentaryColorMap[g] }}
                />
              ))}
            </div>
            {syls}
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
  const instanceId = searchParams.get("instance") || "rpn_ngondro_1";
  const urlSession = searchParams.get("session");
  const urlSylId = searchParams.get("sylId");
  const urlTime = searchParams.get("time");
  const urlQ = searchParams.get("q");

  // Hooks
  const { prefs, updatePref, loaded } = useReaderPreferences();
  const audio = useAudioPlayer();
  // Oral-transcription layer (absent for instances not yet transcribed).
  const { hasTranscription, transTextByGid, transSessions, transSegSylsByGid } =
    useTranscription(instanceId);

  // Data state
  const [manifest, setManifest] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [teachingTitle, setTeachingTitle] = useState("");
  const [sapche, setSapche] = useState(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [studyOpen, setStudyOpen] = useState(false);
  const [tocWidth, setTocWidth] = useState(280);
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [activeSectionId, setActiveSectionId] = useState(null);
  // While a sapche click is settling the scroll, ignore scroll-driven active
  // updates so the highlighted row doesn't flicker to intermediate sections.
  const suppressActiveUntilRef = useRef(0);
  // When on, the main reader interleaves the oral transcription beneath each
  // commented passage and read-along follows the transcription segments.
  const [transcriptionMode, setTranscriptionMode] = useState(false);
  // The transcript segment currently under the playhead / selected. Drives the
  // active transcript highlight and the shaded root-text passage.
  const [activeTransGid, setActiveTransGid] = useState(null);
  const [activeTab, setActiveTab] = useState("player");
  const [activeSylId, setActiveSylId] = useState(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeCommentary, setActiveCommentary] = useState(null);

  // Teaching filter: "A", "B", etc. or null = "All Teachings"
  const [activeTeachingFilter, setActiveTeachingFilter] = useState(null);

  // Audio version preference (defaults to original; restored = cleaned audio when available)
  const [preferRestored, setPreferRestored] = useState(false);

  // "No session on current location" message for teaching chip clicks
  const [noSessionMessage, setNoSessionMessage] = useState(null);

  // Search match highlighting (main text + transcript layers)
  const [activeMatchSet, setActiveMatchSet] = useState(new Set());
  const [allMatchesSet, setAllMatchesSet] = useState(new Set());
  const [transActiveMatchSet, setTransActiveMatchSet] = useState(new Set());
  const [transAllMatchSet, setTransAllMatchSet] = useState(new Set());

  // Dual-scroll: playing segment highlight + auto-scroll
  const [playingSegSylIds, setPlayingSegSylIds] = useState(new Set());
  const [hoveredSegSylIds, setHoveredSegSylIds] = useState(new Set());
  const [rootTextScrolledAt, setRootTextScrolledAt] = useState(0);
  const rootTextRef = useRef(null);

  // Scroll container ref (from ReaderLayout) for viewport tracking
  const scrollContainerRef = useRef(null);

  // Cached paragraph DOM elements for weight-based viewport tracking
  const paragraphElsRef = useRef([]);

  // First syllable of a segment reached via a timeline click. The follow effect
  // skips its smooth scroll for that segment since handleSegmentClick teleports.
  const jumpedToSylRef = useRef(null);

  // Viewport tracking for coverage bar — computed from scroll position
  const [viewportRange, setViewportRange] = useState({ start: 0, end: 0.1 });

  // ----------------------------------------
  // URL-driven initial state — set immediately so sidebar opens
  // Full deep-link with time-seek is handled in a later effect after data loads
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (urlSession) {
      setActiveCommentary(urlSession);
      setActiveTab("player");
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
          fetch(
            `/data/archive/${instanceId}/${instanceId}_compiled_sessions.json`,
          ),
          fetch("/data/archive/catalog.json"),
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
            const match = (teaching.Instances || []).find(
              (inst) => inst.Instance_ID === instanceId,
            );
            if (match) {
              setTeachingTitle(teaching.Title_bo || "");
              break;
            }
          }
        }
        fetch(`/data/archive/${instanceId}/sapche.json`)
          .then((r) => (r.ok ? r.json() : null))
          .then(setSapche)
          .catch(() => setSapche(null));
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
    sessions.forEach((segment) => {
      if (!segment.media_original && !segment.media_restored) return;

      segment.syl_uuids.forEach((uuid) => {
        if (!map[uuid]) map[uuid] = [];
        const segId = segment.global_seg_id || segment.seg_id;
        const exists = map[uuid].some((opt) => opt.global_seg_id === segId);
        if (!exists) {
          map[uuid].push({
            media_original: segment.media_original || "",
            media_restored: segment.media_restored || "",
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
    sessions.forEach((segment) => {
      if (!segment.syl_uuids || !segment.source_session) return;
      segment.syl_uuids.forEach((uuid) => {
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
    sessions.forEach((segment) => {
      if (segment.source_session) ids.add(segment.source_session);
    });
    return Array.from(ids).sort(naturalSortCompare);
  }, [sessions]);

  // ----------------------------------------
  // Derived data: allTeachingGroups (unique group prefixes: "A", "B", …)
  // ----------------------------------------
  const allTeachingGroups = useMemo(() => {
    const groups = new Set();
    allCommentaryIds.forEach((id) => groups.add(getCommentaryGroup(id)));
    return Array.from(groups).sort();
  }, [allCommentaryIds]);

  // ----------------------------------------
  // Derived data: activeCommentarySegments
  // ----------------------------------------
  const activeCommentarySegments = useMemo(() => {
    if (!activeCommentary) return [];
    return sessions
      .filter((seg) => seg.source_session === activeCommentary)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));
  }, [sessions, activeCommentary]);

  // ----------------------------------------
  // Transcription mode: interleave + read-along data
  // ----------------------------------------
  // gid -> transcription segment {gid, startMs, endMs, text}
  const transSegByGid = useMemo(() => {
    const m = {};
    transSessions.forEach((s) => {
      const gid = s.global_seg_id || s.seg_id;
      m[gid] = {
        gid,
        startMs: parseToMs(s.start),
        endMs: s.end ? parseToMs(s.end) : parseToMs(s.start) + 8000,
        text: transTextByGid[gid] || "",
      };
    });
    return m;
  }, [transSessions, transTextByGid]);

  // For the active session: each commented passage's last syllable → its
  // transcription segments (de-duped to a single home passage by start-time),
  // plus the set of passage syllables to mark, and a flat time-sorted list.
  const transcriptionView = useMemo(() => {
    if (!transcriptionMode || !hasTranscription || activeCommentarySegments.length === 0) {
      return { byAnchor: {}, passageSylIds: new Set(), flat: [] };
    }
    const ranges = activeCommentarySegments.map((p) => ({
      start: parseToMs(p.start),
      end: parseToMs(p.end),
    }));
    const passageSylIds = new Set();
    activeCommentarySegments.forEach((p) =>
      (p.syl_uuids || []).forEach((u) => passageSylIds.add(u)),
    );
    const assigned = new Set();
    const homeByIdx = activeCommentarySegments.map(() => []);
    activeCommentarySegments.forEach((p) => {
      (p.transcription_seg_ids || []).forEach((gid) => {
        if (assigned.has(gid)) return;
        const ts = transSegByGid[gid];
        if (!ts) return;
        let home = ranges.findIndex((r) => ts.startMs >= r.start && ts.startMs < r.end);
        if (home === -1) home = 0;
        homeByIdx[home].push(gid);
        assigned.add(gid);
      });
    });
    const byAnchor = {};
    const flat = [];
    activeCommentarySegments.forEach((p, idx) => {
      const anchor = (p.syl_uuids || []).slice(-1)[0];
      if (!anchor) return;
      const segs = homeByIdx[idx]
        .map((gid) => transSegByGid[gid])
        .filter(Boolean)
        .sort((a, b) => a.startMs - b.startMs);
      if (segs.length) {
        byAnchor[anchor] = segs;
        flat.push(...segs);
      }
    });
    flat.sort((a, b) => a.startMs - b.startMs);
    return { byAnchor, passageSylIds, flat };
  }, [transcriptionMode, hasTranscription, activeCommentarySegments, transSegByGid]);

  // Main-text syllables of the active transcript segment's passage — the only
  // passage shaded in transcription mode.
  const activePassageSylIds = useMemo(() => {
    if (!transcriptionMode || !activeTransGid) return EMPTY_SET;
    const set = new Set();
    for (const p of activeCommentarySegments) {
      if ((p.transcription_seg_ids || []).includes(activeTransGid)) {
        (p.syl_uuids || []).forEach((u) => set.add(u));
      }
    }
    return set;
  }, [transcriptionMode, activeTransGid, activeCommentarySegments]);

  // Read-along: follow the live audio playhead with requestAnimationFrame so the
  // highlight switches on the true segment boundary, not on the throttled (~4 Hz)
  // `timeupdate` event. Toggles the class directly on the DOM (no re-render).
  useEffect(() => {
    const flat = transcriptionView.flat;
    if (!transcriptionMode || flat.length === 0) return;
    const getTime = audio.getCurrentTimeMs;
    let raf = 0;
    let curGid = null;
    const setActive = (gid) => {
      if (gid === curGid) return;
      if (curGid)
        document.getElementById(`tseg-${curGid}`)?.classList.remove("r-tseg-active");
      if (gid)
        document.getElementById(`tseg-${gid}`)?.classList.add("r-tseg-active");
      curGid = gid;
      // Coarse state update (once per segment) to drive the shaded root passage.
      setActiveTransGid(gid);
    };
    const tick = () => {
      const t = getTime();
      const seg =
        flat.find((s) => t >= s.startMs && t < s.endMs) ||
        [...flat].reverse().find((s) => s.startMs <= t);
      setActive(seg ? seg.gid : null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (curGid)
        document.getElementById(`tseg-${curGid}`)?.classList.remove("r-tseg-active");
    };
  }, [transcriptionMode, transcriptionView, audio.getCurrentTimeMs]);

  // ----------------------------------------
  // Derived data: teachingCoverageSet
  // ----------------------------------------
  const teachingCoverageSet = useMemo(() => {
    const set = new Set();
    sessions.forEach((seg) => {
      if (!seg.syl_uuids) return;
      const group = getCommentaryGroup(seg.source_session);
      if (activeTeachingFilter === null || group === activeTeachingFilter) {
        seg.syl_uuids.forEach((uuid) => set.add(uuid));
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
    return getSizes(sizePresets[size] || 1.75, spacingPresets[spacing] || 1.6);
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
    manifest.forEach((syl) => {
      if (syl.text === "\n") {
        if (prevWasNewline) {
          // Double newline → paragraph break
          // Remove trailing single newline kept in current
          if (current.length > 0 && current[current.length - 1].text === "\n") {
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
    if (!paragraphs.length || !syllableWeights.length || !manifest.length)
      return [];
    const totalWeight = syllableWeights[manifest.length];
    if (totalWeight === 0) return [];

    const bounds = [];
    let manifestIdx = 0;
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      // Skip newline syllables in manifest
      while (
        manifestIdx < manifest.length &&
        manifest[manifestIdx].text === "\n"
      ) {
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
    if (!activeCommentarySegments.length || !audio.currentTimeMs) return "";
    const currentSeg = activeCommentarySegments.find((seg) => {
      const start = parseToMs(seg.start);
      const end = seg.end ? parseToMs(seg.end) : start + 10000;
      return audio.currentTimeMs >= start && audio.currentTimeMs < end;
    });
    if (!currentSeg) return "";
    return manifest
      .filter((syl) => currentSeg.syl_uuids.includes(syl.id))
      .map((s) => (s.text === "\n" ? " " : s.text))
      .join("")
      .slice(0, 80);
  }, [activeCommentarySegments, audio.currentTimeMs, manifest]);

  // ----------------------------------------
  // Derived data: sapche flat list + startSylId → section nodes map
  // ----------------------------------------
  const { sapcheNodes, sylIdToSections } = useMemo(() => {
    const nodes = [];
    const map = new Map(); // startSylId -> nodes[] (shallow..deep)
    const walk = (n) => {
      if (n.number !== "") nodes.push(n); // skip the document root
      if (n.startSylId && n.number !== "") { // skip root: it's the title, not a section
        const arr = map.get(n.startSylId) || [];
        arr.push(n);
        map.set(n.startSylId, arr);
      }
      (n.children || []).forEach(walk);
    };
    (sapche?.roots || []).forEach(walk);
    for (const arr of map.values()) arr.sort((a, b) => a.depth - b.depth);
    return { sapcheNodes: nodes, sylIdToSections: map };
  }, [sapche]);

  const idToNode = useMemo(() => {
    const m = new Map();
    sapcheNodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [sapcheNodes]);

  const numberToId = useMemo(() => {
    const m = new Map();
    sapcheNodes.forEach((n) => m.set(n.number, n.id));
    return m;
  }, [sapcheNodes]);

  // Short text excerpt per section, shown by the study view's preview popover.
  // Built from the manifest stream between each node's anchor syllables,
  // skipping the brace-shaped audio-session markers.
  const sectionPreviews = useMemo(() => {
    const m = new Map();
    if (!manifest?.length || !sapcheNodes.length) return m;
    const indexOf = new Map();
    manifest.forEach((s, i) => indexOf.set(s.id, i));
    for (const n of sapcheNodes) {
      if (!n.startSylId) continue;
      const start = indexOf.get(n.startSylId);
      if (start == null) continue;
      const end = n.endSylId != null && indexOf.has(n.endSylId)
        ? indexOf.get(n.endSylId)
        : manifest.length - 1;
      let text = "";
      for (let i = start; i <= end && text.length < 220; i++) {
        const t = manifest[i].text || "";
        if (t.startsWith("{")) continue; // audio-session markers
        text += t.replace(/\n/g, "");
      }
      if (text.length >= 220) text = `${text.slice(0, 220)}…`;
      if (text) m.set(n.id, text);
    }
    return m;
  }, [manifest, sapcheNodes]);

  // ----------------------------------------
  // Active-section tracking — scroll position → sapche highlight
  // ----------------------------------------
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !sapcheNodes.length) return;
    const update = () => {
      if (Date.now() < suppressActiveUntilRef.current) return; // settling a click
      // Use the same read anchor as the follow/teleport scroll: a section is
      // "active" once its marker reaches ~3 text lines below the reading top.
      const sample = container.querySelector(".r-syl");
      const lh = (sample && parseFloat(getComputedStyle(sample).lineHeight)) || 36;
      const top = container.getBoundingClientRect().top + READALONG_TOP_LINES * lh;
      let active = null;
      for (const n of sapcheNodes) {
        const el =
          document.getElementById(`sec-${n.id}`) ||
          (n.startSylId && document.getElementById(n.startSylId));
        if (!el) continue;
        if (el.getBoundingClientRect().top <= top) active = n; else break;
      }
      setActiveSectionId((prev) =>
        active && active.id !== prev ? active.id : prev
      );
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [sapcheNodes]);

  // Follow the active section with minimal hierarchy: keep only the active
  // node and its ancestors open, collapsing every other branch behind us.
  useEffect(() => {
    if (!activeSectionId) return;
    const node = idToNode.get(activeSectionId);
    if (!node) return;
    const openIds = new Set([activeSectionId]); // active node + its ancestors
    const parts = node.number.split(".");
    for (let i = 1; i < parts.length; i++) {
      const id = numberToId.get(parts.slice(0, i).join("."));
      if (id) openIds.add(id);
    }
    setCollapsedIds((prev) => {
      const next = new Set();
      for (const n of sapcheNodes) {
        if ((n.children?.length || 0) > 0 && !openIds.has(n.id)) next.add(n.id);
      }
      // Avoid a re-render if the collapse set is unchanged.
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      return next;
    });
  }, [activeSectionId, idToNode, numberToId, sapcheNodes]);

  // ----------------------------------------
  // Track currently-playing segment for root text highlighting
  // ----------------------------------------
  useEffect(() => {
    if (!activeCommentarySegments.length || !audio.currentTimeMs) {
      setPlayingSegSylIds(new Set());
      return;
    }
    const currentSeg = activeCommentarySegments.find((seg) => {
      const start = parseToMs(seg.start);
      const end = seg.end ? parseToMs(seg.end) : start + 10000;
      return audio.currentTimeMs >= start && audio.currentTimeMs < end;
    });
    if (currentSeg) {
      setPlayingSegSylIds(new Set(currentSeg.syl_uuids));
    }
  }, [audio.currentTimeMs, activeCommentarySegments]);

  // Auto-scroll root text to follow playing segment.
  // A timeline click teleports via handleSegmentClick, so skip the smooth follow
  // scroll while the jumped-to segment is the current one.
  useEffect(() => {
    if (transcriptionMode) return; // transcript mode follows the transcript (below)
    if (playingSegSylIds.size === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const firstId = [...playingSegSylIds][0];
    if (firstId === jumpedToSylRef.current) return;
    if (Date.now() - rootTextScrolledAt < 8000) return;
    const el = document.getElementById(firstId);
    if (el) {
      scrollElToReadAnchor(el, "smooth");
    }
  }, [playingSegSylIds, rootTextScrolledAt, transcriptionMode]);

  // Transcription mode: keep the active transcript segment at the read anchor
  // (the transcript is the star here, not the main text).
  useEffect(() => {
    if (!transcriptionMode || !activeTransGid) return;
    if (Date.now() - rootTextScrolledAt < 8000) return; // respect user scroll
    const el = document.getElementById(`tseg-${activeTransGid}`);
    if (el) scrollElToReadAnchor(el, "smooth");
  }, [transcriptionMode, activeTransGid, rootTextScrolledAt]);

  // Scroll-lock detection for root text panel
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleUserScroll = () => setRootTextScrolledAt(Date.now());
    container.addEventListener("wheel", handleUserScroll, { passive: true });
    container.addEventListener("touchmove", handleUserScroll, {
      passive: true,
    });
    return () => {
      container.removeEventListener("wheel", handleUserScroll);
      container.removeEventListener("touchmove", handleUserScroll);
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
      paragraphElsRef.current = Array.from(
        container.querySelectorAll("[data-pidx]"),
      );
    };

    const updateViewport = () => {
      refreshParagraphEls();
      const pEls = paragraphElsRef.current;

      if (!pEls.length || !paragraphWeightBounds.length) {
        setViewportRange({ start: 0, end: 1 });
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const wStart = findWeightAtY(
        containerRect.top,
        pEls,
        paragraphWeightBounds,
      );
      const wEnd = findWeightAtY(
        containerRect.bottom,
        pEls,
        paragraphWeightBounds,
      );

      setViewportRange({
        start: Math.max(0, Math.min(1, wStart)),
        end: Math.max(0, Math.min(1, wEnd)),
      });
    };

    // Initial update
    updateViewport();

    container.addEventListener("scroll", updateViewport, { passive: true });
    // Also observe resize to catch layout changes
    const ro = new ResizeObserver(updateViewport);
    ro.observe(container);
    ro.observe(textNode);

    return () => {
      container.removeEventListener("scroll", updateViewport);
      ro.disconnect();
    };
  }, [manifest, paragraphWeightBounds, transcriptionMode]); // re-attach + recompute when weights change or transcript blocks toggle

  // ----------------------------------------
  // Navigate to position in text (from coverage bar click)
  // Weight fraction → syllable index → scroll to DOM element
  // ----------------------------------------
  const handleNavigateToPosition = useCallback(
    (fraction) => {
      if (!manifest.length || !syllableWeights.length) return;

      const totalWeight = syllableWeights[manifest.length];
      const targetWeight = fraction * totalWeight;

      // Binary search syllableWeights for the syllable at this weight fraction
      let lo = 0,
        hi = manifest.length - 1;
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

      // Teleport to the target — instant, no animation. A smooth scroll stalls
      // here because lazy paragraphs reflow mid-animation; scrollToSyllable
      // jumps instantly and handles not-yet-rendered paragraphs.
      setRootTextScrolledAt(Date.now());
      scrollToSyllable(targetSyl.id, paragraphs, true);
    },
    [manifest, syllableWeights, paragraphs],
  );

  // ----------------------------------------
  // Rebuild playlist when preferRestored changes (audio toggle bug fix)
  // ----------------------------------------
  useEffect(() => {
    if (!activeCommentary) return;
    const segmentsForCommentary = sessions
      .filter((seg) => seg.source_session === activeCommentary)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    const playlist = segmentsForCommentary.map((seg) => {
      const mediaSource = preferRestored
        ? seg.media_restored || seg.media_original
        : seg.media_original || seg.media_restored;
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
      // Preserve the prior play/pause state when switching audio version —
      // resume playback if we were playing, stay paused if we weren't.
      audio.loadPlaylist(playlist, currentIdx, audio.isPlaying);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferRestored]);

  // ----------------------------------------
  // Handlers
  // ----------------------------------------
  const handleSyllableClick = useCallback(
    (sylId) => {
      setActiveSylId((prev) => {
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
    },
    [activeCommentary, audio],
  );

  // Transcription mode: click a transcription segment to play from its start.
  // The session media is one continuous file already loaded by the active
  // commentary, so a seek within it is enough; read-along + root-text highlight
  // follow audio.currentTimeMs.
  const handleTransSegClick = useCallback(
    (gid) => {
      const seg = transSegByGid[gid];
      if (!seg) return;
      // Seek only: a playing element keeps playing from here (plays this
      // segment); a paused one just moves the selection here, awaiting Play.
      audio.seekTo(seg.startMs);
    },
    [transSegByGid, audio],
  );

  const handleCommentarySelect = useCallback(
    (commentaryId, startSegment, autoPlay = true) => {
      setPopoverOpen(false);
      setActiveCommentary(commentaryId);
      setActiveTab("player");
      setSidebarOpen(true);
      setNoSessionMessage(null);

      const group = getCommentaryGroup(commentaryId);
      setActiveTeachingFilter(group);

      const segmentsForCommentary = sessions
        .filter((seg) => seg.source_session === commentaryId)
        .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

      let startIdx = 0;
      if (startSegment) {
        const idx = segmentsForCommentary.findIndex(
          (s) =>
            s.global_seg_id === startSegment.global_seg_id ||
            s.seg_id === startSegment.seg_id,
        );
        if (idx !== -1) startIdx = idx;
      }

      const playlist = segmentsForCommentary.map((seg) => {
        const mediaSource = preferRestored
          ? seg.media_restored || seg.media_original
          : seg.media_original || seg.media_restored;
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
    },
    [audio, sessions, preferRestored, paragraphs],
  );

  // ----------------------------------------
  // Deep-link: load session + seek to time once data is ready
  // ----------------------------------------
  useEffect(() => {
    if (!urlSession || sessions.length === 0 || deepLinkAppliedRef.current)
      return;
    deepLinkAppliedRef.current = true;

    const segsForSession = sessions
      .filter((s) => s.source_session === urlSession)
      .sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    let startSeg = null;
    if (urlTime && segsForSession.length > 0) {
      const timeMs = parseToMs(urlTime);
      startSeg =
        segsForSession.find((s) => parseToMs(s.start) === timeMs) ||
        [...segsForSession].reverse().find((s) => parseToMs(s.start) <= timeMs);
    }

    handleCommentarySelect(urlSession, startSeg || undefined, true);
    if (urlSylId) {
      setActiveSylId(urlSylId);
      setTimeout(() => scrollToSyllable(urlSylId, paragraphs), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const handleTeachingFilterChange = useCallback(
    (group) => {
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
          (opt) => getCommentaryGroup(opt.source_session) === group,
        );
        if (matchingOpt) {
          handleCommentarySelect(matchingOpt.source_session, undefined, false);
          return;
        }
      }

      // No session found for current syllable position — compute position-aware prev/next
      const groupSessions = allCommentaryIds.filter(
        (id) => getCommentaryGroup(id) === group,
      );

      const currentManifestIdx = activeSylId
        ? manifest.findIndex((s) => s.id === activeSylId)
        : 0;

      const sessionsWithPositions = groupSessions
        .map((sessionId) => {
          const segs = sessions.filter((s) => s.source_session === sessionId);
          const firstSylId = segs[0]?.syl_uuids?.[0];
          const idx = firstSylId
            ? manifest.findIndex((s) => s.id === firstSylId)
            : -1;
          return { sessionId, idx };
        })
        .filter((s) => s.idx >= 0)
        .sort((a, b) => a.idx - b.idx);

      const prevSession =
        sessionsWithPositions.filter((s) => s.idx < currentManifestIdx).pop()
          ?.sessionId || null;
      const nextSession =
        sessionsWithPositions.find((s) => s.idx >= currentManifestIdx)
          ?.sessionId || null;

      setActiveCommentary(null);
      setNoSessionMessage({ group, groupSessions, prevSession, nextSession });
    },
    [
      audio,
      activeSylId,
      syllableMediaMap,
      allCommentaryIds,
      handleCommentarySelect,
      manifest,
      sessions,
    ],
  );

  const handleSegmentClick = useCallback(
    (segment, instant = false) => {
      if (!segment?.sylUuids?.length) return;
      setRootTextScrolledAt(0);
      const firstSylId = segment.sylUuids[0];
      if (instant) {
        // Timeline click: teleport (lazy-paragraph aware) and let the follow
        // effect skip its smooth scroll for this segment.
        jumpedToSylRef.current = firstSylId;
        scrollToSyllable(firstSylId, paragraphs, true);
        return;
      }
      const el = document.getElementById(firstSylId);
      if (el) scrollElToReadAnchor(el, "smooth");
    },
    [paragraphs],
  );

  const handleMatchSetsChange = useCallback((activeSet, allSet) => {
    setActiveMatchSet(activeSet);
    setAllMatchesSet(allSet);
  }, []);

  const handleTransMatchSetsChange = useCallback((activeSet, allSet) => {
    setTransActiveMatchSet(activeSet);
    setTransAllMatchSet(allSet);
  }, []);

  // Displayed transcription syllables, flat + document-ordered, for the
  // in-reader transcript search. Each carries its segment gid and the passage
  // anchor syllable so SearchBar can highlight/order/scroll to it.
  const transcriptSyllables = useMemo(() => {
    const out = [];
    for (const [anchorId, segs] of Object.entries(transcriptionView.byAnchor)) {
      for (const s of segs) {
        for (const syl of transSegSylsByGid[s.gid] || []) {
          out.push({ id: syl.id, text: syl.text, gid: s.gid, anchorId });
        }
      }
    }
    return out;
  }, [transcriptionView, transSegSylsByGid]);

  const onToggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const onCollapseAll = useCallback(() => {
    const ids = new Set();
    const walk = (n) => { if ((n.children||[]).length) { ids.add(n.id); n.children.forEach(walk); } };
    (sapche?.roots?.[0]?.children || []).forEach(walk);
    setCollapsedIds(ids);
  }, [sapche]);
  const onExpandAll = useCallback(() => setCollapsedIds(new Set()), []);

  const handleSapcheSelect = useCallback((node) => {
    if (!node.startSylId) return;
    setRootTextScrolledAt(Date.now());
    // Show the clicked row immediately and pause scroll-driven highlight changes
    // while the scroll settles, so the sidebar doesn't flicker to other rows.
    setActiveSectionId(node.id);
    suppressActiveUntilRef.current = Date.now() + 900;

    const targetEl = () =>
      document.getElementById(`sec-${node.id}`) ||
      document.getElementById(node.startSylId);

    // If the section's paragraph isn't rendered yet, trigger its render.
    if (!targetEl()) scrollToSyllable(node.startSylId, paragraphs, true);

    // Re-pin the section to the top each frame until its position is stable.
    // Every scroll is instant, so the target stays put as lazy paragraphs render
    // and shift the layout — no visible jump to a wrong section.
    let last = null;
    let stable = 0;
    let frames = 0;
    const pin = () => {
      const el = targetEl();
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "auto" });
        const pos = Math.round(el.getBoundingClientRect().top);
        if (pos === last) stable += 1;
        else {
          stable = 0;
          last = pos;
        }
      }
      if (stable < 3 && ++frames < 50) {
        requestAnimationFrame(pin);
      } else {
        suppressActiveUntilRef.current = 0; // resume normal tracking
      }
    };
    requestAnimationFrame(pin);
  }, [paragraphs]);

  const startResize = useCallback((e) => {
    e.preventDefault();
    document.body.style.userSelect = "none";
    const move = (ev) => setTocWidth(Math.min(560, Math.max(200, ev.clientX)));
    const up = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  // ----------------------------------------
  // Loading state
  // ----------------------------------------
  if (isLoading || !loaded) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center r-bg r-text-accent ${inter.className}`}
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
      <div className="flex border-b r-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`${inter.className} flex-1 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors duration-200 border-b-2 ${isActive ? "r-tab-active" : "r-tab"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 p-5 overflow-y-auto">
        {activeTab === "player" && (
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
            onSegmentHover={(seg) =>
              setHoveredSegSylIds(new Set(seg ? seg.sylUuids : []))
            }
            activeSylId={activeSylId}
            sidebarSizes={sidebarSizes}
            preferRestored={preferRestored}
            onTogglePreferRestored={() => setPreferRestored((prev) => !prev)}
            hasTranscription={hasTranscription}
            transcriptionOn={transcriptionMode}
            onToggleTranscription={() => setTranscriptionMode((v) => !v)}
            getCommentaryGroup={getCommentaryGroup}
            noSessionMessage={noSessionMessage}
            instanceId={instanceId}
            teachingTitle={teachingTitle}
          />
        )}

        {activeTab === "info" && (
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
    <main
      className="min-h-screen flex flex-col r-bg r-text-1a overflow-x-hidden"
      style={getThemeCssVars(prefs)}
    >
      <audio {...audio.audioProps} />

      <ReaderNavbar
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
        prefs={prefs}
        onUpdatePref={updatePref}
        center={
          <SearchBar
            manifest={manifest}
            onMatchSetsChange={handleMatchSetsChange}
            onTransMatchSetsChange={handleTransMatchSetsChange}
            transcriptActive={transcriptionMode && hasTranscription}
            transcriptSyllables={transcriptSyllables}
            initialQuery={urlQ || ""}
          />
        }
      />

      <ReaderLayout
        ref={scrollContainerRef}
        sidebarOpen={sidebarOpen}
        sidebar={sidebarContent}
        leftSidebar={sapche ? (
          <SapcheSidebar roots={sapche.roots} activeId={activeSectionId}
            collapsedIds={collapsedIds} onToggleCollapse={onToggleCollapse}
            onSelect={handleSapcheSelect} onExpandAll={onExpandAll} onCollapseAll={onCollapseAll}
            onHide={() => setTocOpen(false)}
            onExpand={() => setStudyOpen(true)} />
        ) : null}
        leftOpen={tocOpen && !!sapche}
        leftWidth={tocWidth}
        onLeftResize={startResize}
        showLeftReveal={!!sapche && !tocOpen}
        onRevealLeft={() => setTocOpen(true)}
      >
        {/* Floating Context Popover */}
        <FloatingPopover
          activeSylId={activeSylId}
          popoverOpen={popoverOpen}
          syllableMediaMap={syllableMediaMap}
          manifest={manifest}
          onCommentarySelect={handleCommentarySelect}
          getCommentaryGroup={getCommentaryGroup}
          sidebarSizes={sidebarSizes}
          onClose={() => {
            setActiveSylId(null);
            setPopoverOpen(false);
          }}
        />

        <div
          ref={rootTextRef}
          className="max-w-4xl mx-auto"
          style={{ padding: "3rem" }}
        >
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
                playingSegSylIds={transcriptionMode ? EMPTY_SET : playingSegSylIds}
                hoveredSegSylIds={transcriptionMode ? EMPTY_SET : hoveredSegSylIds}
                activeMatchSet={activeMatchSet}
                allMatchesSet={allMatchesSet}
                transActiveMatchSet={transActiveMatchSet}
                transAllMatchSet={transAllMatchSet}
                handleSyllableClick={handleSyllableClick}
                uchen={uchen}
                sylIdToSections={sylIdToSections}
                transcriptionMode={transcriptionMode}
                transBlocksByAnchor={transcriptionView.byAnchor}
                transSegSylsByGid={transSegSylsByGid}
                activePassageSylIds={activePassageSylIds}
                onTransSegClick={handleTransSegClick}
              />
            ))}
          </div>
        </div>

        <Footer className="mt-8" style={{ paddingBottom: "3.5rem" }} />
      </ReaderLayout>

      {studyOpen && sapche && (
        <SapcheStudyView
          roots={sapche.roots}
          activeId={activeSectionId}
          onSelect={(node) => {
            if (!node.startSylId) return; // un-anchored node: keep the study view open
            setStudyOpen(false);
            handleSapcheSelect(node);
          }}
          onClose={() => setStudyOpen(false)}
          previewFor={(node) => sectionPreviews.get(node.id) || null}
        />
      )}

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
          <span
            className={`${inter.className} text-lg tracking-wide r-text-accent`}
          >
            Loading configuration...
          </span>
        </div>
      }
    >
      <ReaderContent />
    </Suspense>
  );
}
