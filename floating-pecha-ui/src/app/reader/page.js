"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Footer from "@/app/components/Footer";
import { contentUrl } from "@/lib/contentUrl";
import { getSizes, getThemeCssVars, inter, uchen } from "@/lib/theme";
import { parseToMs, useAudioPlayer } from "@/lib/useAudioPlayer";
import useIsMobile from "@/lib/useIsMobile";
import { useReaderPreferences } from "@/lib/useReaderPreferences";
import { useTranscription } from "@/lib/useTranscription";
import InfoTab from "./InfoTab";
import MiniPlayer from "./MiniPlayer";
import MobileAudioBar from "./MobileAudioBar";
import PlayerTab from "./PlayerTab";
import ReaderLayout from "./ReaderLayout";
import ReaderNavbar from "./ReaderNavbar";
import SapcheSidebar from "./SapcheSidebar";
import SapcheStudyView from "./SapcheStudyView";
import SearchBar from "./SearchBar";
import SectionMarker from "./SectionMarker";
import { useSession } from "next-auth/react";
import { useNotes } from "./useNotes";
import { closestSylId } from "@/lib/note-selection";
import NotePopover from "./NotePopover";
import NotesTab from "./NotesTab";
import "./reader.css";

// ==========================================
// HELPERS
// ==========================================
const TABS = [
  { key: "player", label: "Player" },
  { key: "notes", label: "Notes" },
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
 * Group one session's transcription segments under their home root-text passage.
 * `segments` are a single session's root segments (sorted by start); each carries
 * `transcription_seg_ids` linking it to transcription segments in `transSegByGid`.
 * Each transcription gid is assigned to exactly one passage (the one whose time
 * range contains its start), and anchored to that passage's last syllable.
 * Returns { byAnchor, passageSylIds, flat, passageAnchorBySyl }.
 */
function buildTransView(segments, transSegByGid) {
  const ranges = segments.map((p) => ({
    start: parseToMs(p.start),
    end: parseToMs(p.end),
  }));
  const passageSylIds = new Set();
  segments.forEach((p) => (p.syl_uuids || []).forEach((u) => passageSylIds.add(u)));
  const assigned = new Set();
  const homeByIdx = segments.map(() => []);
  segments.forEach((p) => {
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
  // sylId -> passage anchor, for every passage that has a transcript block, so
  // the reader can group each passage's syllables into a background band.
  const passageAnchorBySyl = new Map();
  segments.forEach((p, idx) => {
    const anchor = (p.syl_uuids || []).slice(-1)[0];
    if (!anchor) return;
    const segs = homeByIdx[idx]
      .map((gid) => transSegByGid[gid])
      .filter(Boolean)
      .sort((a, b) => a.startMs - b.startMs);
    if (segs.length) {
      byAnchor[anchor] = segs;
      flat.push(...segs);
      (p.syl_uuids || []).forEach((u) => passageAnchorBySyl.set(u, anchor));
    }
  });
  flat.sort((a, b) => a.startMs - b.startMs);
  return { byAnchor, passageSylIds, flat, passageAnchorBySyl };
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
  noteHighlightSet,
  noteHighlightRanges,
  onNoteSylClick,
  onNoteSylHover,
  hoveredNoteSylIds,
  annotateMode,
  transcriptionMode,
  transBlocksByAnchor,
  transSegSylsByGid,
  activePassageSylIds,
  passageAnchorBySyl,
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
    const baseSize = sizes[syl.size?.toUpperCase()] || sizes.DEFAULT;

    // In transcription mode only the syllables of passages that actually carry a
    // transcript get the secondary-layer treatment (smaller, recolored,
    // un-clickable). Passages before/after with no transcript stay full main text
    // so the reader can still click to navigate the player there.
    const passageAnchor = transcriptionMode
      ? (passageAnchorBySyl?.get(syl.id) ?? null)
      : null;
    const sylTransMode =
      transcriptionMode && passageAnchor != null && !!transBlocksByAnchor?.[passageAnchor];

    // In transcription mode the root text is the secondary layer — render it
    // slightly smaller than the prominent transcript below it.
    const sizeStyle = sylTransMode
      ? { ...baseSize, fontSize: `calc(${baseSize.fontSize} * 0.78)` }
      : baseSize;

    const isCoveredByFilter = teachingCoverageSet.has(syl.id);
    const isSelected = activeSylId === syl.id;
    const isInPlayingSegment = playingSegSylIds.has(syl.id);
    const isHoveredSegment = hoveredSegSylIds.has(syl.id);
    const isActiveMatch = activeMatchSet.has(syl.id);
    const isAnyMatch = allMatchesSet.has(syl.id);
    const isNoted = noteHighlightSet?.has(syl.id);
    const isNoteHovered = annotateMode && isNoted && hoveredNoteSylIds?.has(syl.id);

    const fontClass =
      syl.nature === "TEXT" || syl.nature === "PUNCT" || syl.nature === "SYM"
        ? uchen.className
        : "font-sans";

    // In transcription mode the transcript is the body; the root text is shown
    // in a distinct vermilion (not dimmed by audio coverage).
    let colorClass;
    if (sylTransMode) {
      colorClass = "r-text-root";
    } else {
      colorClass = isCoveredByFilter ? "r-text" : "r-text-disabled r-syl-dimmed";
      if (!hasMedia && isCoveredByFilter) colorClass = "r-text-muted";
    }
    let bgClass = "";
    let extraClass = "";

    if (isSelected && !sylTransMode) {
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

    // Personal-note highlight (annotation mode only): render the EXACT selected
    // character range. A whole-syllable highlight colours the span; a partial
    // one (the selection started or ended mid-syllable) wraps just the selected
    // slice so the highlight matches the selection character-for-character.
    let noteChildren = syl.text;
    let noteWholeClass = "";
    if (isNoted && annotateMode && !bgClass) {
      const hl = noteHighlightRanges?.get(syl.id);
      const len = syl.text.length;
      const from = hl ? Math.max(0, Math.min(hl.from, len)) : 0;
      const to = hl ? Math.max(from, Math.min(hl.to, len)) : len;
      const hoverCls = isNoteHovered ? " r-note-hover" : "";
      if (!hl || (from <= 0 && to >= len)) {
        noteWholeClass = `r-note-highlight${hoverCls}`;
      } else if (to > from) {
        noteChildren = (
          <>
            {syl.text.slice(0, from)}
            <span className={`r-note-highlight${hoverCls}`}>{syl.text.slice(from, to)}</span>
            {syl.text.slice(to)}
          </>
        );
      }
      // to === from → empty range (a boundary syllable): render nothing special.
    }

    return (
      <span
        key={syl.id}
        id={syl.id}
        onClick={
          annotateMode
            ? (isNoted ? () => onNoteSylClick?.(syl.id) : undefined)
            : (hasMedia && !sylTransMode ? () => handleSyllableClick(syl.id) : undefined)
        }
        onMouseEnter={
          annotateMode && isNoted ? () => onNoteSylHover?.(syl.id) : undefined
        }
        onMouseLeave={
          annotateMode && isNoted ? () => onNoteSylHover?.(null) : undefined
        }
        className={`${fontClass} r-syl r-snap inline relative ${colorClass} ${bgClass} ${extraClass} ${noteWholeClass} ${
          isInPassage ? "r-syl-passage" : ""
        } ${
          !annotateMode && !sylTransMode && hasMedia && !isSelected
            ? "cursor-pointer r-hover-red"
            : ""
        } ${annotateMode && isNoted ? "cursor-pointer" : ""} ${isInPlayingSegment || isHoveredSegment ? "rounded-sm" : ""}`}
        style={sizeStyle}
      >
        {noteChildren}
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
                  : (syl.mainText ? "r-main-text" : "");

              // Personal-note highlight (annotation mode only) — mirrors the root
              // pecha render: paint the exact selected character range so comments
              // display on transcription text too.
              const isNoted = noteHighlightSet?.has(syl.id);
              const isNoteHovered =
                annotateMode && isNoted && hoveredNoteSylIds?.has(syl.id);
              let noteChildren = syl.text;
              let noteWholeClass = "";
              if (isNoted && annotateMode) {
                const hl = noteHighlightRanges?.get(syl.id);
                const len = syl.text.length;
                const from = hl ? Math.max(0, Math.min(hl.from, len)) : 0;
                const to = hl ? Math.max(from, Math.min(hl.to, len)) : len;
                const hoverCls = isNoteHovered ? " r-note-hover" : "";
                if (!hl || (from <= 0 && to >= len)) {
                  noteWholeClass = `r-note-highlight${hoverCls}`;
                } else if (to > from) {
                  noteChildren = (
                    <>
                      {syl.text.slice(0, from)}
                      <span className={`r-note-highlight${hoverCls}`}>
                        {syl.text.slice(from, to)}
                      </span>
                      {syl.text.slice(to)}
                    </>
                  );
                }
              }

              return (
                <span
                  key={syl.id}
                  id={syl.id}
                  className={`r-snap ${cls} ${noteWholeClass}`}
                  onClick={
                    annotateMode && isNoted
                      ? (e) => {
                          e.stopPropagation(); // don't trigger segment play
                          onNoteSylClick?.(syl.id);
                        }
                      : undefined
                  }
                  onMouseEnter={
                    annotateMode && isNoted
                      ? () => onNoteSylHover?.(syl.id)
                      : undefined
                  }
                  onMouseLeave={
                    annotateMode && isNoted
                      ? () => onNoteSylHover?.(null)
                      : undefined
                  }
                >
                  {noteChildren}
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

  // Render an item's syllables. In transcription mode, group consecutive
  // syllables that belong to the same transcript passage into a block-level band
  // (so a continuous light-gray rectangle sits behind the passage), followed by
  // that passage's transcript block. Syllables outside any passage stay inline.
  const renderItemSyls = (syls) => {
    if (!transcriptionMode) return syls.map(renderSylWithBlock);
    const out = [];
    let run = [];
    let runAnchor = null;
    const flush = () => {
      if (!run.length) return;
      if (runAnchor && transBlocksByAnchor?.[runAnchor]) {
        out.push(
          <div key={`pb-${run[0].id}`} className="r-passage-band">
            {run.map(renderSyl)}
          </div>,
        );
        out.push(renderTransBlock(transBlocksByAnchor[runAnchor], runAnchor));
      } else {
        run.forEach((s) => out.push(renderSyl(s)));
      }
      run = [];
    };
    syls.forEach((syl) => {
      const anchor = passageAnchorBySyl?.get(syl.id) ?? null;
      if (anchor !== runAnchor) {
        flush();
        runAnchor = anchor;
      }
      run.push(syl);
    });
    flush();
    return out;
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
        const syls = renderItemSyls(item.syls);
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
  const router = useRouter();

  // URL parameters
  const instanceId = searchParams.get("instance") || "rpn_ngondro_1";
  const urlSession = searchParams.get("session");
  const urlSylId = searchParams.get("sylId");
  const urlTime = searchParams.get("time");
  const urlQ = searchParams.get("q");

  // Hooks
  const { prefs, updatePref, loaded } = useReaderPreferences();
  const audio = useAudioPlayer();
  // Below Tailwind's md breakpoint we switch to a stacked, off-canvas layout.
  const isMobile = useIsMobile();
  // Oral-transcription layer (absent for instances not yet transcribed).
  const { hasTranscription, transManifest, transTextByGid, transSessions, transSegSylsByGid } =
    useTranscription(instanceId);

  const { data: session } = useSession();
  const loggedIn = !!session?.user?.id;
  const isAdmin = session?.user?.role === "admin";
  const selfId = session?.user?.id;
  // null = viewing own notes; an id = admin viewing that member's notes (read-only).
  const [viewUserId, setViewUserId] = useState(null);
  const readOnly = isAdmin && viewUserId != null && viewUserId !== selfId;

  const [annotateMode, setAnnotateMode] = useState(false);
  // Pending selection awaiting the "+ Note" button: { startSylId, endSylId, anchorText, x, y }
  const [pendingSelection, setPendingSelection] = useState(null);
  // Unified note panel (create + view), positioned beside the passage/selection.
  // { x, y, sylId? , createAnchor? }  — exactly one of sylId / createAnchor is set.
  const [notePanel, setNotePanel] = useState(null);
  // Syllables to highlight while hovering an annotated passage (annotation mode).
  const [hoveredNoteSylIds, setHoveredNoteSylIds] = useState(new Set());

  const {
    notes,
    createNote: createNoteApi,
    updateNote: updateNoteApi,
    deleteNote: deleteNoteApi,
  } = useNotes(instanceId, loggedIn, viewUserId);

  // Member list for the admin "viewing notes of" picker.
  const [members, setMembers] = useState([]);
  useEffect(() => {
    if (!isAdmin) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => {
        if (!cancelled) setMembers(d.users || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Data state
  const [manifest, setManifest] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Set when the content API denies this instance (403) or it doesn't exist
  // (404). We bounce back to the catalog instead of rendering an empty reader.
  const [forbidden, setForbidden] = useState(false);
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
  // Sticky "user turned transcription off" preference: suppresses the
  // auto-on-play default until the user re-enables it or changes the main text.
  const [transcriptOptOut, setTranscriptOptOut] = useState(false);
  // The transcript segment currently under the playhead / selected. Drives the
  // active transcript highlight and the shaded root-text passage.
  const [activeTransGid, setActiveTransGid] = useState(null);
  const [activeTab, setActiveTab] = useState("player");
  const [activeSylId, setActiveSylId] = useState(null);
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

  // Selection-snapping (rounds any text selection in the pecha to whole syllables).
  const pointerDownRef = useRef(false);

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

  // On mobile the TOC and player are off-canvas overlays, so they must start
  // closed (the desktop default of an open inline TOC would cover the screen).
  useEffect(() => {
    if (isMobile) {
      setTocOpen(false);
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // ----------------------------------------
  // Data loading
  // ----------------------------------------
  useEffect(() => {
    const loadData = async () => {
      try {
        const [manifestRes, sessionsRes, catalogRes] = await Promise.all([
          fetch(contentUrl(instanceId, "manifest.json")),
          fetch(contentUrl(instanceId, `${instanceId}_compiled_sessions.json`)),
          fetch("/api/catalog"),
        ]);
        // The content API gates by the server-side session: 403 = this user
        // lacks the access level, 404 = the instance doesn't exist. Either way
        // there is nothing to read, so redirect to the catalog rather than
        // leaving an empty reader on screen.
        if (manifestRes.status === 403 || manifestRes.status === 404) {
          setForbidden(true);
          router.replace("/archive");
          return;
        }
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
        fetch(contentUrl(instanceId, "sapche.json"))
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
  }, [instanceId, router]);

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

  // Sorted segment start times for the currently-loaded audio — drives the
  // mobile mini-bar's prev/next-segment arrows.
  const audioSegStartsMs = useMemo(
    () => activeCommentarySegments.map((s) => parseToMs(s.start)).sort((a, b) => a - b),
    [activeCommentarySegments],
  );

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

  // True only while a session is active AND that session has a real transcript.
  // Gates the navbar transcription pencil (independent of transcriptionMode).
  const activeSessionHasTranscript = useMemo(() => {
    if (!hasTranscription || !activeCommentary) return false;
    return activeCommentarySegments.some((p) =>
      (p.transcription_seg_ids || []).some((gid) => transSegByGid[gid]),
    );
  }, [hasTranscription, activeCommentary, activeCommentarySegments, transSegByGid]);

  // Leaving a transcript session (or one without a transcript) turns the display
  // off, so the next transcript session starts hidden (pencil-line, not -off).
  // Does NOT touch transcriptOptOut: this is automatic, not a manual opt-out.
  useEffect(() => {
    if (!activeSessionHasTranscript && transcriptionMode) setTranscriptionMode(false);
  }, [activeSessionHasTranscript, transcriptionMode]);

  // Changing the main text (instance) clears the sticky manual-off preference,
  // so transcription defaults back on when the next session is played.
  useEffect(() => {
    setTranscriptOptOut(false);
  }, [instanceId]);

  // Manual transcription toggle: records the user's intent so the auto-on-play
  // default respects a deliberate "off" (sticky) until they re-enable it.
  const handleToggleTranscription = useCallback(() => {
    const next = !transcriptionMode;
    setTranscriptionMode(next);
    setTranscriptOptOut(!next); // off => opted out (sticky); on => opted back in
  }, [transcriptionMode]);

  // For the active session: each commented passage's last syllable → its
  // transcription segments (de-duped to a single home passage by start-time),
  // plus the set of passage syllables to mark, and a flat time-sorted list.
  const transcriptionView = useMemo(() => {
    if (!transcriptionMode || !hasTranscription || activeCommentarySegments.length === 0) {
      return { byAnchor: {}, passageSylIds: new Set(), flat: [], passageAnchorBySyl: new Map() };
    }
    return buildTransView(activeCommentarySegments, transSegByGid);
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

  // sylId -> manifest index, for ordering anchors and sorting notes by position.
  const manifestIndexOf = useMemo(() => {
    const m = new Map();
    manifest.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [manifest]);

  // Same, for the transcription layer (its syllables carry their own UUIDs).
  const transIndexOf = useMemo(() => {
    const m = new Map();
    transManifest.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [transManifest]);

  // Resolve any syllable id to its layer's ordered list + index, so the notes
  // pipeline can anchor/highlight/order against root pecha OR transcription text
  // without enumerating ids per layer. layer 0 = root pecha, 1 = transcription.
  const locateSyl = useCallback(
    (id) => {
      const ri = manifestIndexOf.get(id);
      if (ri != null) return { layer: 0, index: ri, list: manifest };
      const ti = transIndexOf.get(id);
      if (ti != null) return { layer: 1, index: ti, list: transManifest };
      return null;
    },
    [manifestIndexOf, transIndexOf, manifest, transManifest]
  );

  // Resolve a note to CURRENT syllable ids: the stored ids must still exist in a
  // single layer. If they don't (e.g. the manifest was re-ingested), the note is
  // shown in the Notes tab only.
  const resolveNoteIds = useCallback(
    (note) => {
      const s = locateSyl(note.start_syl_id);
      const e = locateSyl(note.end_syl_id);
      if (s && e && s.layer === e.layer) {
        return { startSylId: note.start_syl_id, endSylId: note.end_syl_id };
      }
      return null;
    },
    [locateSyl]
  );

  // Note coverage: `noteHighlightSet` is every syllable id any note touches (for
  // click/hover detection). `noteHighlightRanges` maps each syllable id to the
  // exact character slice { from, to } to paint — full for interior syllables,
  // partial for the start/end syllables of a note (offset-aware). Notes created
  // before the offset columns existed (start_offset/end_offset null) fall back
  // to whole-syllable highlighting. Overlapping notes union to the widest slice.
  const { noteHighlightSet, noteHighlightRanges } = useMemo(() => {
    const set = new Set();
    const ranges = new Map(); // sylId -> { from, to }
    const widen = (sylId, from, to) => {
      const cur = ranges.get(sylId);
      ranges.set(
        sylId,
        cur ? { from: Math.min(cur.from, from), to: Math.max(cur.to, to) } : { from, to }
      );
    };
    for (const note of notes) {
      // Resolve to current ids: fast path (stored ids live) or quote fallback.
      const resolved = resolveNoteIds(note);
      if (!resolved) continue; // unresolvable — shown in tab only.
      const start = locateSyl(resolved.startSylId);
      const end = locateSyl(resolved.endSylId);
      // anchor broken or split across layers — shown in tab only.
      if (!start || !end || start.layer !== end.layer) continue;
      const list = start.list;
      const a = start.index;
      const b = end.index;
      if (a > b) continue;
      // Offsets are character indices into the syllable's text.
      const hasOffsets =
        note.start_offset != null &&
        note.end_offset != null;
      for (let i = a; i <= b; i++) {
        const syl = list[i];
        set.add(syl.id);
        const len = (syl.text || "").length;
        let from = 0;
        let to = len;
        if (hasOffsets) {
          if (i === a) from = Math.max(0, Math.min(note.start_offset, len));
          if (i === b) to = Math.max(0, Math.min(note.end_offset, len));
        }
        widen(syl.id, from, to);
      }
    }
    return { noteHighlightSet: set, noteHighlightRanges: ranges };
  }, [notes, locateSyl, resolveNoteIds]);

  const panelNotes = useMemo(() => {
    if (!notePanel) return [];
    const sylId = notePanel.sylId ?? notePanel.createAnchor?.startSylId;
    const loc = locateSyl(sylId);
    if (!loc) return [];
    return notes.filter((n) => {
      const resolved = resolveNoteIds(n);
      if (!resolved) return false;
      const a = locateSyl(resolved.startSylId);
      const b = locateSyl(resolved.endSylId);
      return (
        a && b &&
        a.layer === loc.layer && b.layer === loc.layer &&
        loc.index >= a.index && loc.index <= b.index
      );
    });
  }, [notePanel, notes, locateSyl, resolveNoteIds]);

  const panelAnchor = useMemo(() => {
    if (!notePanel) return null;
    if (notePanel.createAnchor) return notePanel.createAnchor;
    const head = panelNotes[0];
    return head
      ? {
          startSylId: head.start_syl_id,
          endSylId: head.end_syl_id,
          startOffset: head.start_offset,
          endOffset: head.end_offset,
          anchorText: head.anchor_text || "",
        }
      : null;
  }, [notePanel, panelNotes]);

  // A view-panel (opened on an annotated syllable, no createAnchor) whose notes
  // were all deleted must fully close — otherwise notePanel stays set and the
  // "+ Note" pill (gated on !notePanel) never reappears, blocking new notes.
  useEffect(() => {
    if (notePanel && !notePanel.createAnchor && panelNotes.length === 0) {
      setNotePanel(null);
    }
  }, [notePanel, panelNotes]);

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

  // "Centered" fold: the collapse set that keeps only the given active node and
  // its ancestors open, collapsing every other branch. Shared by the scroll-
  // driven follow effect and the tri-state button's "centered" mode.
  const computeCenteredCollapse = useCallback(
    (activeId) => {
      const openIds = new Set();
      const node = activeId ? idToNode.get(activeId) : null;
      if (node) {
        openIds.add(node.id);
        const parts = node.number.split(".");
        for (let i = 1; i < parts.length; i++) {
          const id = numberToId.get(parts.slice(0, i).join("."));
          if (id) openIds.add(id);
        }
      }
      const next = new Set();
      for (const n of sapcheNodes) {
        if ((n.children?.length || 0) > 0 && !openIds.has(n.id)) next.add(n.id);
      }
      return next;
    },
    [idToNode, numberToId, sapcheNodes],
  );

  // Follow the active section with minimal hierarchy: keep only the active node
  // and its ancestors open, collapsing every other branch behind us. The sidebar
  // is always in this centered mode (the tri-state control was removed).
  useEffect(() => {
    if (!activeSectionId || !idToNode.get(activeSectionId)) return;
    setCollapsedIds((prev) => {
      const next = computeCenteredCollapse(activeSectionId);
      // Avoid a re-render if the collapse set is unchanged.
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
        return prev;
      }
      return next;
    });
  }, [activeSectionId, idToNode, computeCenteredCollapse]);

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
  // System-wide selection snapping: round any text selection in the pecha text
  // out to whole-syllable boundaries, so a drag can never leave a partial
  // syllable highlighted. Always on (independent of annotate mode), and works on
  // both desktop (mouse drag) and mobile (native selection handles). Kept cheap
  // on low-power devices: the high-frequency `selectionchange` path bails in O(1)
  // for collapsed/foreign selections and while a pointer is down; the actual
  // rewrite is debounced, idempotent, and guarded against needless reflow.
  useEffect(() => {
    // Resolve a selection endpoint node to its enclosing syllable span (or null).
    // Layer-agnostic: every snappable syllable unit — the root pecha AND every
    // transcription, now and future — renders a leaf span marked `.r-snap`, so
    // this works without enumerating ids per layer.
    const endpointSpan = (node) => {
      const el = node?.nodeType === 3 ? node.parentElement : node;
      return el?.closest?.(".r-snap") || null;
    };

    // Round the live selection out to whole-syllable boundaries (idempotent).
    const snapSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const root = rootTextRef.current;
      if (
        !root ||
        !root.contains(range.startContainer) ||
        !root.contains(range.endContainer)
      ) {
        return;
      }
      // A DOM Range is always in document order, so start <= end already.
      const startSpan = endpointSpan(range.startContainer);
      const endSpan = endpointSpan(range.endContainer);
      if (!startSpan || !endSpan) return;

      const newRange = document.createRange();
      newRange.setStart(startSpan, 0);
      newRange.setEnd(endSpan, endSpan.childNodes.length);

      // Already snapped? Skip the selection rewrite to avoid a needless reflow.
      // This also makes re-firing harmless: the post-snap `selectionchange`
      // produces an identical range and stops here, so there is no loop.
      const unchanged =
        range.compareBoundaryPoints(Range.START_TO_START, newRange) === 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, newRange) === 0;
      if (unchanged) return;
      sel.removeAllRanges();
      sel.addRange(newRange);
    };

    // On mobile, any programmatic selection rewrite tears down the OS selection
    // handles + context menu, so we must NOT snap while the user is still working
    // the native selection. Instead we wait for the selection to go idle (the
    // user has stopped dragging the handles) before snapping once. Desktop has no
    // native selection UI to disturb, so it snaps the instant the mouse is up.
    const SNAP_IDLE_MS = isMobile ? 700 : 150;

    let timer = null;
    const scheduleSnap = (delay) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        snapSelection();
      }, delay);
    };

    const onPointerDown = () => {
      pointerDownRef.current = true;
    };
    const onPointerUp = () => {
      pointerDownRef.current = false;
      // Desktop: a mouse release means the selection is finished — snap right
      // away (next tick, so the rewrite happens after the event has unwound).
      // Mobile: do NOT snap on release; that would clobber the native handles/
      // menu the OS just put up. Wait for the selection to go idle instead, so
      // the menu stays reachable and the handles remain draggable.
      scheduleSnap(isMobile ? SNAP_IDLE_MS : 0);
    };
    const onSelectionChange = () => {
      // O(1) bails for the overwhelmingly common fires (clicks, caret moves,
      // typing) and while a pointer drag is in progress (handled on release).
      // Each change resets the idle timer: on mobile, dragging a native handle
      // fires a stream of selectionchange events (but no document pointer
      // events), so this debounce is what catches the "done adjusting" moment.
      if (pointerDownRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      scheduleSnap(SNAP_IDLE_MS);
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    // A phone's native selection gesture commonly ends with `pointercancel` or
    // `touchend` rather than a document-level `pointerup`, so listen for all three.
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.addEventListener("touchend", onPointerUp, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange, {
      passive: true,
    });
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("touchend", onPointerUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [isMobile]);

  // While annotation mode is on, watch for a finished text selection and show
  // the "+ Note" button near it.
  useEffect(() => {
    if (!annotateMode) {
      setPendingSelection(null);
      return;
    }
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPendingSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Layer-agnostic: a selectable syllable is any root pecha OR transcription
      // syllable, so comments work in both layers.
      const isSyl = (id) => manifestIndexOf.has(id) || transIndexOf.has(id);

      // Capture each endpoint as a syllable id PLUS the character offset within
      // that syllable, so a note can highlight exactly what was selected — even
      // a partial syllable when the drag starts or ends mid-syllable. In the
      // common case an endpoint sits in a syllable's text node and the range
      // offset is already the character index. Browsers snap selection endpoints
      // to grapheme boundaries, so slicing the syllable text at these offsets
      // reproduces the visible selection character-for-character.
      const resolveEndpoint = (container, offset) => {
        if (container.nodeType === 3) {
          const id = closestSylId(container, isSyl);
          return id ? { id, offset } : null;
        }
        // Element endpoint: the syllable span itself, or a paragraph (triple-
        // click / line selection). Map to a syllable boundary (start or end).
        if (container.id && isSyl(container.id)) {
          const len = (container.textContent || "").length;
          return { id: container.id, offset: offset <= 0 ? 0 : len };
        }
        const child = container.childNodes?.[offset] || container.childNodes?.[offset - 1];
        const el = child?.nodeType === 1 ? child : child?.parentElement;
        const id = el ? closestSylId(el, isSyl) : null;
        if (id) {
          const span = document.getElementById(id);
          return { id, offset: offset <= 0 ? 0 : (span?.textContent.length ?? 0) };
        }
        return null;
      };

      let startPt = resolveEndpoint(range.startContainer, range.startOffset);
      let endPt = resolveEndpoint(range.endContainer, range.endOffset);
      if (!startPt || !endPt) {
        setPendingSelection(null);
        return;
      }
      // Both endpoints must live in the same layer — don't create a note that
      // straddles the root pecha and the transcription (their syllables aren't
      // ordered against each other).
      const sLoc = locateSyl(startPt.id);
      const eLoc = locateSyl(endPt.id);
      if (!sLoc || !eLoc || sLoc.layer !== eLoc.layer) {
        setPendingSelection(null);
        return;
      }
      // Normalise to document order (a selection can run backwards).
      if (
        sLoc.index > eLoc.index ||
        (sLoc.index === eLoc.index && startPt.offset > endPt.offset)
      ) {
        const tmp = startPt;
        startPt = endPt;
        endPt = tmp;
      }
      const startSylId = startPt.id;
      const endSylId = endPt.id;
      const startOffset = startPt.offset;
      const endOffset = endPt.offset;
      const anchorText = (sel.toString() || "").slice(0, 280);
      const rect = range.getBoundingClientRect();
      // Anchor the button entirely to the RIGHT of the selection, vertically
      // centered on it. The CSS places its left edge at x and centers it
      // (translate(0, -50%)), so it sits beside the passage — clear of the
      // cursor. Clamp x so it never runs off the right edge of the viewport.
      setPendingSelection({
        startSylId,
        endSylId,
        startOffset,
        endOffset,
        anchorText,
        x: Math.min(rect.right, window.innerWidth - 44),
        y: rect.top + rect.height / 2,
      });
    };
    const onMouseDown = (e) => {
      if (e.target?.closest?.(".r-note-add-btn")) return; // keep button alive
      setPendingSelection(null);
    };
    // Touch devices (iOS Safari + Android Chrome) don't reliably fire mouseup/
    // touchend for an OS-driven text selection — the robust cross-platform signal
    // is `selectionchange`. Debounce it so it runs once the selection settles,
    // reusing the same resolver.
    let selTimer = null;
    const onSelectionChange = () => {
      if (selTimer) clearTimeout(selTimer);
      selTimer = setTimeout(onMouseUp, 250);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (selTimer) clearTimeout(selTimer);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [annotateMode, manifestIndexOf, transIndexOf, locateSyl]);

  const handleCreateInPanel = useCallback(
    async (payload) => {
      if (readOnly) return; // defensive: admins viewing another member never create
      if (!panelAnchor) return;
      await createNoteApi({
        startSylId: panelAnchor.startSylId,
        endSylId: panelAnchor.endSylId,
        startOffset: panelAnchor.startOffset,
        endOffset: panelAnchor.endOffset,
        anchorText: panelAnchor.anchorText,
        ...payload,
      });
      setPendingSelection(null);
      window.getSelection()?.removeAllRanges();
    },
    [panelAnchor, createNoteApi, readOnly]
  );

  const handleGoToNote = useCallback(
    (note) => {
      setActiveTab("notes");
      // Teleport (instant) rather than smooth: a smooth scroll to a not-yet-
      // rendered passage stalls as lazy paragraphs reflow above it — which is
      // why far-away notes (e.g. another member's) appeared to do nothing.
      setRootTextScrolledAt(Date.now());
      // Navigate to the stored start id (falling back to it if it no longer
      // resolves to a current syllable).
      const resolved = resolveNoteIds(note);
      scrollToSyllable(resolved?.startSylId ?? note.start_syl_id, paragraphs, true);
    },
    [paragraphs, resolveNoteIds]
  );

  const handleNoteSylClick = useCallback((sylId) => {
    const el = document.getElementById(sylId);
    const rect = el?.getBoundingClientRect();
    setNotePanel({
      sylId,
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.bottom + 6 : 120,
    });
  }, []);

  // Hovering any syllable of an annotated passage highlights the whole passage
  // (union of every note span covering the hovered syllable).
  const handleNoteSylHover = useCallback(
    (sylId) => {
      if (sylId == null) return setHoveredNoteSylIds(new Set());
      const loc = locateSyl(sylId);
      if (!loc) return setHoveredNoteSylIds(new Set());
      const ids = new Set();
      for (const n of notes) {
        const resolved = resolveNoteIds(n);
        if (!resolved) continue;
        const a = locateSyl(resolved.startSylId);
        const b = locateSyl(resolved.endSylId);
        if (
          a && b &&
          a.layer === loc.layer && b.layer === loc.layer &&
          loc.index >= a.index && loc.index <= b.index
        ) {
          for (let j = a.index; j <= b.index; j++) ids.add(loc.list[j].id);
        }
      }
      setHoveredNoteSylIds(ids);
    },
    [notes, locateSyl, resolveNoteIds]
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
    (commentaryId, startSegment, autoPlay = true, opts = {}) => {
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

        // A transcript-search jump owns the scroll itself (to the matched
        // transcript syllable), so skip the default scroll-to-first-syllable.
        if (!opts.noScroll) {
          const firstSylId = segmentsForCommentary[startIdx]?.syl_uuids?.[0];
          if (firstSylId) {
            setTimeout(() => scrollToSyllable(firstSylId, paragraphs), 100);
          }
        }
      }
    },
    [audio, sessions, preferRestored, paragraphs],
  );

  // Navigate to a transcript search match. Sessions are hidden from the user, so
  // a match can live in a session that isn't loaded and whose transcript isn't on
  // screen. Make sure transcription display is on, switch to the match's session
  // (paused) if needed, then scroll to the matched transcript syllable — its lazy
  // paragraph + transcript block may not exist until the switch/render settle, so
  // mount the root anchor first and poll for the transcript node.
  const handleTranscriptSearchNav = useCallback(
    ({ sessionId, sylId, anchorId }) => {
      if (!sessionId) return;
      setTranscriptionMode(true);
      setTranscriptOptOut(false);

      if (sessionId !== activeCommentary) {
        const startSegment = sessions.find(
          (s) =>
            s.source_session === sessionId && (s.syl_uuids || []).includes(anchorId),
        );
        handleCommentarySelect(sessionId, startSegment, false, { noScroll: true });
      }

      // Mount + scroll to the root anchor (triggers its paragraph + transcript
      // block to render), then poll for the exact transcript syllable.
      if (anchorId) scrollToSyllable(anchorId, paragraphs, true);
      let attempts = 0;
      const check = setInterval(() => {
        const el = document.getElementById(sylId);
        if (el || ++attempts > 60) {
          clearInterval(check);
          if (el) scrollElToReadAnchor(el, "smooth");
        }
      }, 50);
    },
    [activeCommentary, sessions, handleCommentarySelect, paragraphs],
  );

  // Collapsing the player sidebar (desktop toggle) returns the reader to its
  // pristine pre-selection state — like first opening the text from the archive:
  // playback stops and every media-covered syllable goes back to black (no
  // teaching filter), with no selection/segment highlight left over.
  const collapseSidebarToPristine = useCallback(() => {
    setSidebarOpen(false);
    audio.pause();
    setActiveCommentary(null);
    setActiveTeachingFilter(null);
    setActiveSylId(null);
    setActiveTransGid(null);
    setTranscriptionMode(false);
    setPlayingSegSylIds(new Set());
    setNoSessionMessage(null);
  }, [audio]);

  // Clicking an audio-linked syllable selects it and readies the sidebar player
  // on the first available teaching instance's matching section — loaded but
  // paused (awaiting Play). No popup. Defined after handleCommentarySelect
  // because it depends on it.
  const handleSyllableClick = useCallback(
    (sylId) => {
      if (annotateMode) return; // selection drives annotation; ignore audio click
      if (activeSylId === sylId) return; // already selected + readied
      setActiveSylId(sylId);

      const opts = syllableMediaMap[sylId] || [];
      if (opts.length === 0) return; // click only bound when hasMedia
      // First available teaching instance: mirror the popover's prior ordering
      // (session ids sorted), then the option covering the clicked syllable.
      const firstSession = [...new Set(opts.map((o) => o.source_session))].sort(
        (a, b) => a.localeCompare(b),
      )[0];
      const startSegment = opts.find((o) => o.source_session === firstSession);
      handleCommentarySelect(firstSession, startSegment, false);
    },
    [annotateMode, activeSylId, syllableMediaMap, handleCommentarySelect],
  );

  // Fires once when playback actually starts (rising edge of isPlaying):
  //  - Mobile: minimize the player sheet to the MobileAudioBar so the reader
  //    text is visible to follow along (re-opening the sheet mid-playback won't
  //    re-close it, since isPlaying didn't transition).
  //  - Both: if the session has a transcript and the user hasn't opted out,
  //    turn the transcription display on by default.
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    const playing = audio.isPlaying;
    const justStarted = playing && !wasPlayingRef.current;
    wasPlayingRef.current = playing;
    if (!justStarted) return;
    if (isMobile) setSidebarOpen(false);
    if (activeSessionHasTranscript && !transcriptOptOut) setTranscriptionMode(true);
  }, [audio.isPlaying, isMobile, activeSessionHasTranscript, transcriptOptOut]);

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

  // Mobile mini-bar prev/next: step the playhead between segment starts.
  // The active-segment highlight and read-along follow cascade from the
  // resulting currentTimeMs change via the existing effects.
  const handleStepSegment = useCallback(
    (dir) => {
      // In transcription mode the audio follows the transcript segments, so step
      // over those (already time-sorted); otherwise the commentary segments.
      const transFlat = transcriptionView.flat;
      const starts =
        transcriptionMode && transFlat.length
          ? transFlat.map((s) => s.startMs)
          : audioSegStartsMs;
      if (!starts.length) return;
      const now = audio.getCurrentTimeMs();
      let target;
      if (dir > 0) {
        target = starts.find((t) => t > now + 50);
        if (target == null) return; // already at/after the last segment
      } else {
        let c = -1;
        for (let i = 0; i < starts.length; i++) {
          if (starts[i] <= now + 50) c = i;
          else break;
        }
        if (c < 0) return;
        // Restart the current segment if we're well into it, else step back.
        target = now - starts[c] > 2000 ? starts[c] : starts[Math.max(0, c - 1)];
      }
      audio.seekTo(target);
      audio.play();
    },
    [transcriptionMode, transcriptionView, audioSegStartsMs, audio],
  );

  const handleMatchSetsChange = useCallback((activeSet, allSet) => {
    setActiveMatchSet(activeSet);
    setAllMatchesSet(allSet);
  }, []);

  const handleTransMatchSetsChange = useCallback((activeSet, allSet) => {
    setTransActiveMatchSet(activeSet);
    setTransAllMatchSet(allSet);
  }, []);

  // Whole-instance transcription syllables for the in-reader transcript search.
  // Sessions are hidden from the user, so search must span every session's
  // transcript (not just the active one). We group all root segments by session,
  // build each session's passage→transcript layout the same way the on-screen
  // view does, and emit a flat list tagged with each syllable's segment gid,
  // home passage anchor, and source session so SearchBar can order, highlight,
  // and (across sessions) navigate to it. SearchBar re-sorts by the anchor's
  // text position, giving top-to-bottom order across sessions.
  const allTranscriptSyllables = useMemo(() => {
    if (!hasTranscription) return [];
    const bySession = new Map();
    sessions.forEach((seg) => {
      if (!seg.source_session) return;
      if (!bySession.has(seg.source_session)) bySession.set(seg.source_session, []);
      bySession.get(seg.source_session).push(seg);
    });
    const out = [];
    for (const sessionId of allCommentaryIds) {
      const segs = (bySession.get(sessionId) || []).sort(
        (a, b) => parseToMs(a.start) - parseToMs(b.start),
      );
      const { byAnchor } = buildTransView(segs, transSegByGid);
      for (const [anchorId, tsegs] of Object.entries(byAnchor)) {
        for (const s of tsegs) {
          for (const syl of transSegSylsByGid[s.gid] || []) {
            out.push({ id: syl.id, text: syl.text, gid: s.gid, anchorId, sessionId });
          }
        }
      }
    }
    return out;
  }, [hasTranscription, sessions, allCommentaryIds, transSegByGid, transSegSylsByGid]);

  const onToggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const handleSapcheSelect = useCallback((node) => {
    if (!node.startSylId) return;
    // On mobile the TOC is an overlay drawer — close it so the navigated text is
    // visible (and the reveal strip returns).
    if (isMobile) setTocOpen(false);
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
  }, [paragraphs, isMobile]);

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
  // Access denied / missing instance: a redirect to the catalog is already in
  // flight, so render nothing rather than flashing an empty reader.
  if (forbidden) return null;

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
      {isMobile && (
        <button
          type="button"
          data-sheet-drag-handle
          onClick={() => setSidebarOpen(false)}
          aria-label="Minimize player (keeps playing)"
          title="Minimize — keeps playing"
          className="flex w-full flex-col items-center gap-1 pt-2.5 pb-2 r-text-muted active:bg-black/[0.03] transition-colors touch-none"
        >
          <span className="h-1 w-10 rounded-full bg-black/15" />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
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

        {activeTab === "notes" && (
          <NotesTab
            notes={notes}
            loggedIn={loggedIn}
            manifestIndexOf={manifestIndexOf}
            onGoToNote={handleGoToNote}
            onUpdateNote={updateNoteApi}
            onDeleteNote={deleteNoteApi}
            isAdmin={isAdmin}
            members={members}
            viewUserId={viewUserId}
            selfId={selfId}
            onChangeViewUser={setViewUserId}
            readOnly={readOnly}
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
      className={`flex flex-col r-bg r-text-1a ${
        isMobile ? "h-[100dvh] overflow-hidden" : "min-h-screen overflow-x-hidden"
      }${annotateMode ? " r-annotate-mode" : ""}`}
      style={getThemeCssVars(prefs)}
    >
      <audio {...audio.audioProps} />

      <ReaderNavbar
        isMobile={isMobile}
        onToggleSidebar={() => (sidebarOpen ? collapseSidebarToPristine() : setSidebarOpen(true))}
        sidebarOpen={sidebarOpen}
        prefs={prefs}
        onUpdatePref={updatePref}
        canAnnotate={loggedIn}
        annotateMode={annotateMode}
        onToggleAnnotate={() => setAnnotateMode((v) => !v)}
        transcriptReady={activeSessionHasTranscript}
        transcriptionOn={transcriptionMode}
        onToggleTranscription={handleToggleTranscription}
        center={
          <SearchBar
            manifest={manifest}
            onMatchSetsChange={handleMatchSetsChange}
            onTransMatchSetsChange={handleTransMatchSetsChange}
            transcriptAvailable={hasTranscription}
            transcriptSyllables={allTranscriptSyllables}
            onTranscriptNavigate={handleTranscriptSearchNav}
            initialQuery={urlQ || ""}
          />
        }
      />

      {annotateMode && (
        <div className="r-annotate-banner">
          Annotation mode — select a passage to add a note
        </div>
      )}

      <ReaderLayout
        ref={scrollContainerRef}
        isMobile={isMobile}
        onCloseLeft={() => setTocOpen(false)}
        onCloseSidebar={() => setSidebarOpen(false)}
        sidebarOpen={sidebarOpen}
        sidebar={sidebarContent}
        leftSidebar={sapche ? (
          <SapcheSidebar roots={sapche.roots} activeId={activeSectionId}
            collapsedIds={collapsedIds} onToggleCollapse={onToggleCollapse}
            onSelect={handleSapcheSelect}
            onHide={() => setTocOpen(false)}
            onExpand={() => setStudyOpen(true)} />
        ) : null}
        leftOpen={tocOpen && !!sapche}
        leftWidth={tocWidth}
        onLeftResize={startResize}
        showLeftReveal={!!sapche && !tocOpen}
        onRevealLeft={() => setTocOpen(true)}
      >
        {pendingSelection && !notePanel && !readOnly && (
          <button
            type="button"
            className="r-note-add-btn"
            style={{ left: pendingSelection.x, top: pendingSelection.y }}
            aria-label="Add note"
            title="Add note"
            onMouseDown={(e) => e.preventDefault()} // keep the selection alive
            onClick={() => {
              setNotePanel({
                x: pendingSelection.x,
                y: pendingSelection.y,
                createAnchor: {
                  startSylId: pendingSelection.startSylId,
                  endSylId: pendingSelection.endSylId,
                  startOffset: pendingSelection.startOffset,
                  endOffset: pendingSelection.endOffset,
                  anchorText: pendingSelection.anchorText,
                },
              });
              setPendingSelection(null);
            }}
          >
            {/* Comment bubble (tail at bottom-left) with text lines inside */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="13.5" x2="13.5" y2="13.5" />
            </svg>
          </button>
        )}

        <div
          ref={rootTextRef}
          className="max-w-4xl mx-auto"
          style={{ padding: isMobile ? "1.25rem 1rem 5rem" : "3rem" }}
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
                noteHighlightSet={noteHighlightSet}
                noteHighlightRanges={noteHighlightRanges}
                onNoteSylClick={handleNoteSylClick}
                onNoteSylHover={handleNoteSylHover}
                hoveredNoteSylIds={hoveredNoteSylIds}
                annotateMode={annotateMode}
                transcriptionMode={transcriptionMode}
                transBlocksByAnchor={transcriptionView.byAnchor}
                transSegSylsByGid={transSegSylsByGid}
                activePassageSylIds={activePassageSylIds}
                passageAnchorBySyl={transcriptionView.passageAnchorBySyl}
                onTransSegClick={handleTransSegClick}
              />
            ))}
          </div>
        </div>

        <Footer className="mt-8" style={{ paddingBottom: "3.5rem" }} />
      </ReaderLayout>

      {notePanel && (panelNotes.length > 0 || notePanel.createAnchor) && (
        <NotePopover
          notes={panelNotes}
          anchor={panelAnchor}
          x={notePanel.x}
          y={notePanel.y}
          onClose={() => setNotePanel(null)}
          onCreate={handleCreateInPanel}
          onUpdateNote={updateNoteApi}
          onDeleteNote={deleteNoteApi}
          readOnly={readOnly}
        />
      )}

      {studyOpen && sapche && (
        <SapcheStudyView
          roots={sapche.roots}
          activeId={activeSectionId}
          onSelect={(node) => {
            if (!node.startSylId) return; // un-anchored node: keep the study view open
            setStudyOpen(false);
            handleSapcheSelect(node);
          }}
          onClose={() => {
            setStudyOpen(false);
            // On mobile, dismissing study returns to the text (not the overlay
            // drawer) so the reveal strip is reachable again.
            if (isMobile) setTocOpen(false);
          }}
          previewFor={(node) => sectionPreviews.get(node.id) || null}
        />
      )}

      {/* Desktop: hover-driven text-coverage navigation strip. */}
      {!isMobile && (
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
      )}

      {/* Mobile: floating tornado opens the fullscreen Sapche study view (replaces
          the sapche sidebar/drawer). Sits below the fixed h-16 (64px) navbar with
          a 12px gap, matching its 12px gap from the left edge (left-3). */}
      {isMobile && sapche && !studyOpen && !sidebarOpen && (
        <button
          type="button"
          onClick={() => setStudyOpen(true)}
          title="Sapche view"
          aria-label="Open Sapche view"
          className="fixed top-[76px] left-3 z-[75] p-2 rounded-full r-sidebar border r-border r-text-accent shadow-md active:bg-black/5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <path d="M21 4H3" />
            <path d="M18 8H6" />
            <path d="M19 12H9" />
            <path d="M16 16h-6" />
            <path d="M11 20H9" />
          </svg>
        </button>
      )}

      {/* Mobile: thumb-zone audio bar (only when audio is loaded). */}
      {isMobile && !sidebarOpen && (
        <MobileAudioBar
          audio={audio}
          title={teachingTitle || activeCommentary}
          onPrevSegment={() => handleStepSegment(-1)}
          onNextSegment={() => handleStepSegment(1)}
          onExpand={() => {
            setActiveTab("player");
            setSidebarOpen(true);
          }}
        />
      )}
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
