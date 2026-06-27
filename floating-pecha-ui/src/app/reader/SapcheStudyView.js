"use client";
// Fullscreen sapche study view — the sapche is an object of study in its own
// right (scholars memorize the outline), so this renders the tree alone with
// generous Tibetan type, free expand/collapse, and keyboard navigation.
// Depth-accent colors (borrowed from the sapche_discovery prototype) are full
// strength here because the study view shows no commentary color bars.
// Spec: docs/superpowers/specs/2026-06-11-sapche-study-mode-design.md
import { inter, sapcheAccentFor, sapcheInk, uchen } from "@/lib/theme";
import { collectCollapsibleIds, flattenVisibleRows } from "@/lib/sapcheStudy";
import SapcheNumber from "./SapcheNumber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// All rows share one uchen size (no longer depth-scaled); the reader controls it
// with the +/- buttons in the header, clamped to [MIN, MAX].
const STUDY_FONT_DEFAULT = 24;
const STUDY_FONT_MIN = 14;
const STUDY_FONT_MAX = 40;
const STUDY_FONT_STEP = 2;

// Single chevron glyph for the directional pad, rotated per direction.
function DpadChevron({ dir }) {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir] || 0;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rot}deg)` }}
      aria-hidden="true"
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function StudyRow({
  node,
  collapsed,
  activeId,
  focusedId,
  centered,
  fontSize,
  onToggle,
  onSelect,
  onFocusNode,
  onRowEnter,
  onRowLeave,
}) {
  const kids = node.children || [];
  const isCollapsed = collapsed.has(node.id);
  return (
    <>
      <div
        id={`study-${node.id}`}
        role="treeitem"
        aria-level={node.depth}
        aria-expanded={kids.length > 0 ? !isCollapsed : undefined}
        aria-selected={focusedId === node.id}
        className={`r-study-row ${!centered && activeId === node.id ? "r-study-row-active" : ""} ${
          !centered && focusedId === node.id ? "r-study-row-focused" : ""
        }`}
        style={{ paddingLeft: (node.depth - 1) * 28 }}
        onClick={() => onFocusNode(node.id)}
        onMouseEnter={(e) => onRowEnter(node, e.currentTarget)}
        onMouseLeave={onRowLeave}
      >
        <span
          className="r-study-accent"
          style={{ backgroundColor: sapcheAccentFor(node.depth) }}
          aria-hidden="true"
        />
        {kids.length > 0 ? (
          <button
            type="button"
            className="r-toc-chevron r-study-chevron"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            aria-label={isCollapsed ? "Expand section" : "Collapse section"}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="r-toc-chevron-spacer" />
        )}
        <SapcheNumber number={node.number} className={`${inter.className} r-study-num`} />
        <span
          className={`${uchen.className} r-study-title`}
          style={{ color: sapcheInk, fontSize }}
        >
          {node.title}
        </span>
        {focusedId === node.id && kids.length > 0 && (
          <span
            className="r-study-childcount"
            title={`${kids.length} subsection${kids.length === 1 ? "" : "s"}`}
            aria-label={`${kids.length} subsection${kids.length === 1 ? "" : "s"}`}
          >
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
              <path d="M12 5H2" />
              <path d="M6 12h12" />
              <path d="M9 19h6" />
              <path d="M16 5h6" />
              <path d="M19 8V2" />
            </svg>
            <span className="r-study-childcount-n">{kids.length}</span>
          </span>
        )}
        {focusedId === node.id && node.startSylId && (
          <button
            type="button"
            className="r-study-goto"
            title="Open in reader"
            aria-label="Open this section in the reader"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
              <path d="m21 3-9 9" />
              <path d="M15 3h6v6" />
            </svg>
          </button>
        )}
      </div>
      {!isCollapsed &&
        kids.map((c) => (
          <StudyRow
            key={c.id}
            node={c}
            collapsed={collapsed}
            activeId={activeId}
            focusedId={focusedId}
            centered={centered}
            fontSize={fontSize}
            onToggle={onToggle}
            onSelect={onSelect}
            onFocusNode={onFocusNode}
            onRowEnter={onRowEnter}
            onRowLeave={onRowLeave}
          />
        ))}
    </>
  );
}

/** Compute a fixed position for the preview popover next to a row's rect:
 *  below it by default, above when too close to the viewport bottom. */
function previewPositionFor(el) {
  const rect = el.getBoundingClientRect();
  const above = rect.bottom > window.innerHeight - 260;
  return {
    left: Math.min(rect.left + 40, Math.max(window.innerWidth - 580, 12)),
    top: above ? rect.top - 8 : rect.bottom + 8,
    above,
  };
}

export default function SapcheStudyView({
  roots,
  activeId,
  onSelect,
  onClose,
  previewFor,
}) {
  const top = useMemo(() => roots[0]?.children || [], [roots]); // skip the document root
  const [collapsed, setCollapsed] = useState(() => new Set()); // all expanded on open
  const [focusedId, setFocusedId] = useState(() => activeId || top[0]?.id || null);
  // The study view is centered-only: the focused level is pinned to a center
  // band, the tree folds around it, and it steps on scroll/swipe/arrows.
  const [studyMode] = useState("centered");
  // Centered mode translates the outline column so the selected row sits exactly
  // on the band (deterministic — no native scroll). px offset of `.r-study-col`.
  const [centerOffset, setCenterOffset] = useState(0);
  // Transient overscroll nudge for the centered column: a small tug in the
  // attempted direction that snaps back when there is no sibling (up/down) or no
  // deeper/shallower level (left/right) to move to. { x, y } px.
  const [bounce, setBounce] = useState({ x: 0, y: 0 });
  // Horizontal auto-centering of the focused node (so deep indentation stays on
  // screen), plus a manual pan offset added by a double-tap-drag.
  const [centerOffsetX, setCenterOffsetX] = useState(0);
  const [panX, setPanX] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  // Uniform uchen size for every row, adjusted by the header +/- buttons.
  const [fontSize, setFontSize] = useState(STUDY_FONT_DEFAULT);
  const adjustFontSize = useCallback((delta) => {
    setFontSize((s) =>
      Math.min(STUDY_FONT_MAX, Math.max(STUDY_FONT_MIN, s + delta))
    );
  }, []);
  // { nodeId, left, top, above } or null. `sourceRef` tracks whether the
  // popover came from hover (closes on mouseleave) or Space (sticky, follows
  // arrow navigation until toggled off).
  const [preview, setPreview] = useState(null);
  // Transient "activated" flash for the D-pad: holds the last-acted direction
  // ("up"/"down"/"left"/"right") for ~180ms, then reverts to the faded resting
  // state. Driven by every nav input (keys, click, drag, wheel).
  const [dpadFlash, setDpadFlash] = useState(null);
  const dpadTimerRef = useRef(null);
  const previewSourceRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const overlayRef = useRef(null);
  const treeRef = useRef(null);
  const bodyRef = useRef(null);
  // Latest nav fns, so the once-subscribed centered touch handler can drive them
  // without re-subscribing mid-gesture.
  const navLeftRef = useRef(null);
  const navRightRef = useRef(null);
  const centeredStepRef = useRef(null);
  const bounceTimerRef = useRef(null);

  const { rows, parentOf } = useMemo(
    () => flattenVisibleRows(top, collapsed),
    [top, collapsed]
  );


  // Full-tree maps (independent of the current collapse state) so Centered mode
  // can walk a node's ancestors to decide what stays open.
  const { nodeById, fullParentOf } = useMemo(() => {
    const byId = new Map();
    const parent = new Map();
    const walk = (nodes, p) => {
      for (const n of nodes) {
        byId.set(n.id, n);
        if (p) parent.set(n.id, p);
        walk(n.children || [], n);
      }
    };
    walk(top, null);
    return { nodeById: byId, fullParentOf: parent };
  }, [top]);

  // Centered fold: keep only the selected node's ANCESTORS open (the spine up to
  // the top), collapsing every other branch — including the selected node itself,
  // so its children never auto-expand below the band. Expanding a node's children
  // is explicit only (chevron / Right). Re-applied on every navigation, so moving
  // to another node minimizes whatever was expanded before.
  const computeCenteredCollapse = useCallback(
    (centerId) => {
      const open = new Set();
      for (
        let n = centerId ? fullParentOf.get(centerId) || null : null;
        n;
        n = fullParentOf.get(n.id) || null
      ) {
        open.add(n.id);
      }
      const next = new Set();
      for (const id of collectCollapsibleIds(top)) if (!open.has(id)) next.add(id);
      return next;
    },
    [top, fullParentOf],
  );

  const onToggle = (id) => {
    setFocusedId(id); // chevron clicks move the focus ring too, so mouse and keyboard stay in step
    setPreview(null);
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  // Centered mode: fold the tree around the selected (centered) level as it
  // changes — only its branch + ancestors stay open.
  useEffect(() => {
    if (studyMode !== "centered") return;
    setCollapsed(computeCenteredCollapse(focusedId));
  }, [studyMode, focusedId, computeCenteredCollapse]);

  const showPreviewFor = (nodeId, source) => {
    const el = document.getElementById(`study-${nodeId}`);
    if (!el || !previewFor) return;
    const node = rows.find((n) => n.id === nodeId);
    if (!node || !previewFor(node)) return;
    previewSourceRef.current = source;
    setPreview({ nodeId, ...previewPositionFor(el) });
  };

  // Section text preview popover removed — hover no longer surfaces a preview.
  const onRowEnter = () => {};
  const onRowLeave = () => {};

  // On open: take keyboard focus and show the current reading position.
  // On close: hand focus back to whatever had it (the opener button).
  useEffect(() => {
    const prevFocus = document.activeElement;
    // Focus the tree (not the dialog): aria-activedescendant is only valid on
    // composite widget roles, and key events still reach the dialog by bubbling.
    treeRef.current?.focus();
    // Non-centered modes use native scroll to reveal the opening row; centered
    // mode positions via the recenter loop (its body is overflow:hidden, so
    // scrollIntoView would be a no-op anyway).
    if (studyMode !== "centered") {
      const target = activeId || top[0]?.id;
      if (target)
        document.getElementById(`study-${target}`)?.scrollIntoView({ block: "center" });
    }
    return () => {
      clearTimeout(hoverTimerRef.current);
      clearTimeout(bounceTimerRef.current);
      clearTimeout(dpadTimerRef.current);
      prevFocus?.focus?.();
    };
    // Mount-only: the view re-mounts on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Non-centered modes: keep the focused row in view (native scroll); a sticky
  // (Space) preview follows it.
  useEffect(() => {
    if (!focusedId || studyMode === "centered") return;
    document.getElementById(`study-${focusedId}`)?.scrollIntoView({ block: "nearest" });
    if (previewSourceRef.current === "key") showPreviewFor(focusedId, "key");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, studyMode]);

  // Centered mode: deterministically translate the column so the selected row's
  // center lands on the band. Uses transform-independent layout (offsetTop /
  // clientHeight), so it's exact regardless of the column transform. Re-runs on
  // selection/fold change and on resize.
  useEffect(() => {
    if (studyMode !== "centered") return;
    let cancelled = false;
    let raf = 0;

    // The geometry: vertical offset to drop the focused row's middle on the
    // band, and the horizontal offset that pulls the focused node's box to a
    // fixed left margin (cancel its indentation) so its title gets the full
    // width no matter how deep it sits.
    const measure = () => {
      const body = bodyRef.current;
      const col = treeRef.current;
      const row = focusedId && document.getElementById(`study-${focusedId}`);
      if (!body || !col || !row) return null;
      const rowMid = col.offsetTop + row.offsetTop + row.offsetHeight / 2;
      const depth = nodeById.get(focusedId)?.depth || 1;
      const indent = 24 + (depth - 1) * 28; // body padding + per-level indent
      const LEFT_ANCHOR = 24; // keep the focused row near the left edge
      return { y: body.clientHeight / 2 - rowMid, x: LEFT_ANCHOR - indent };
    };
    const apply = (m) => {
      if (!m) return;
      setCenterOffset(m.y);
      setCenterOffsetX(m.x);
    };

    // Re-apply across frames until the measured geometry is stable, so async
    // layout shifts AFTER open — the centered-fold reflow and late Uchen webfont
    // metrics — can't leave the band parked on the wrong row. Mirrors the
    // reader's pin-until-stable scroll pattern (see page.js handleSapcheSelect).
    let last = null;
    let stable = 0;
    let frames = 0;
    const settle = () => {
      if (cancelled) return;
      const m = measure();
      if (m) {
        apply(m);
        if (last && Math.abs(m.y - last.y) < 0.5 && Math.abs(m.x - last.x) < 0.5)
          stable += 1;
        else stable = 0;
        last = m;
      }
      if (stable < 3 && ++frames < 50) raf = requestAnimationFrame(settle);
    };
    settle();
    setPanX(0); // navigation re-centers, dropping any manual double-tap pan

    // Webfont metrics can land after the settle loop ends; re-measure once more.
    if (document.fonts?.ready)
      document.fonts.ready.then(() => {
        if (!cancelled) apply(measure());
      });

    const onResize = () => apply(measure());
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [focusedId, rows, studyMode, fontSize, nodeById]);

  // Scrolling the tree invalidates the popover's fixed position — drop it.
  const onBodyScroll = () => {
    if (preview) setPreview(null);
  };

  // Centered mode steps one level at a time onto the band. Vertical wheel/drag
  // moves the selected level (up/down); horizontal drag maps to the left/right
  // nav actions (collapse/parent, expand/child) — same as the arrow keys.
  // Subscribes ONCE and drives the latest nav fns via refs, so a drag survives
  // the per-step fold without losing its gesture anchor. The fold + recenter
  // effects then park the new level on the band.
  useEffect(() => {
    if (studyMode !== "centered") return;
    const body = bodyRef.current;
    if (!body) return;
    const STEP_PX = 38; // vertical drag distance per sibling step
    const STEP_X = 56; // horizontal drag distance per collapse/expand (deliberate)

    let wheelLock = false;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // horizontal: native pan
      e.preventDefault();
      if (wheelLock || Math.abs(e.deltaY) < 4) return;
      wheelLock = true;
      centeredStepRef.current?.(e.deltaY > 0 ? 1 : -1);
      setTimeout(() => {
        wheelLock = false;
      }, 180);
    };

    // Continuous, distance-based stepping with axis lock.
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let acc = 0;
    let accX = 0;
    let axis = null; // null until decided, then "x" (left/right nav) or "y" (stepping)
    let xUsed = false; // horizontal: at most ONE level change per gesture
    let lastTapAt = 0; // for double-tap-drag = manual pan
    let lastTapX = 0;
    let lastTapY = 0;
    let panning = false; // this gesture pans the page instead of navigating
    let pinched = false; // a 2-finger gesture is in progress (pinch-to-resize)
    const onTouchStart = (e) => {
      if (e.touches.length >= 2) {
        // Second finger → a pinch; abandon any single-finger nav/pan this gesture.
        pinched = true;
        if (panning) {
          panning = false;
          setIsPanning(false);
        }
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      acc = 0;
      accX = 0;
      axis = null;
      xUsed = false;
      const now = Date.now();
      // Second tap landing quickly near the first → this drag pans the page.
      panning =
        now - lastTapAt < 320 &&
        Math.abs(t.clientX - lastTapX) < 40 &&
        Math.abs(t.clientY - lastTapY) < 40;
      lastTapAt = now;
      lastTapX = t.clientX;
      lastTapY = t.clientY;
      if (panning) setIsPanning(true);
    };
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) pinched = false; // all fingers up
      if (panning) {
        panning = false;
        setIsPanning(false);
      }
    };
    const onTouchMove = (e) => {
      if (pinched || e.touches.length >= 2) return; // pinch owns this gesture
      const t = e.touches[0];
      if (!t) return;
      if (panning) {
        // Free horizontal pan, tracking the finger 1:1 (no easing while panning).
        e.preventDefault();
        setPanX((px) => px + (t.clientX - lastX));
        lastX = t.clientX;
        return;
      }
      if (axis === null) {
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (dx < 6 && dy < 6) return; // wait for a real move
        axis = dx > dy ? "x" : "y";
      }
      e.preventDefault();
      if (axis === "y") {
        // Up/down moves among SIBLINGS only (snaps back at the first/last one).
        acc += lastY - t.clientY; // finger up => positive => next sibling
        lastY = t.clientY;
        if (Math.abs(acc) >= STEP_PX) {
          centeredStepRef.current?.(acc > 0 ? 1 : -1);
          acc = 0;
        }
      } else {
        // Horizontal: drag right => descend one level (open + first child),
        // drag left => ascend to parent. At most ONE level per gesture, so a
        // long drag never overshoots deeper than expected.
        accX += t.clientX - lastX;
        lastX = t.clientX;
        if (!xUsed && Math.abs(accX) >= STEP_X) {
          (accX > 0 ? navRightRef : navLeftRef).current?.();
          xUsed = true;
        }
      }
    };

    body.addEventListener("wheel", onWheel, { passive: false });
    body.addEventListener("touchstart", onTouchStart, { passive: true });
    body.addEventListener("touchmove", onTouchMove, { passive: false });
    body.addEventListener("touchend", onTouchEnd, { passive: true });
    body.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      body.removeEventListener("wheel", onWheel);
      body.removeEventListener("touchstart", onTouchStart);
      body.removeEventListener("touchmove", onTouchMove);
      body.removeEventListener("touchend", onTouchEnd);
      body.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [studyMode]);

  // Pinch to resize: a two-finger spread/squeeze drives the same font adjustment
  // as the header +/- buttons. Works in every mode (subscribes once to the body,
  // which persists across mode changes).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const PINCH_STEP = 26; // change in finger spread (px) per one font step
    const spread = (e) =>
      Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    let base = null;
    const onStart = (e) => {
      if (e.touches.length === 2) base = spread(e);
    };
    const onMove = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const d = spread(e);
      if (base == null) {
        base = d;
        return;
      }
      while (d - base >= PINCH_STEP) {
        adjustFontSize(STUDY_FONT_STEP); // spread out → larger
        base += PINCH_STEP;
      }
      while (base - d >= PINCH_STEP) {
        adjustFontSize(-STUDY_FONT_STEP); // squeeze → smaller
        base -= PINCH_STEP;
      }
    };
    const onEnd = (e) => {
      if (e.touches.length < 2) base = null;
    };
    body.addEventListener("touchstart", onStart, { passive: true });
    body.addEventListener("touchmove", onMove, { passive: false });
    body.addEventListener("touchend", onEnd, { passive: true });
    body.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      body.removeEventListener("touchstart", onStart);
      body.removeEventListener("touchmove", onMove);
      body.removeEventListener("touchend", onEnd);
      body.removeEventListener("touchcancel", onEnd);
    };
  }, [adjustFontSize]);

  // Briefly light the D-pad (and the acted direction) as if it had been pressed,
  // then revert to faded. Any nav input calls this, so keys/click/drag/wheel all
  // get the same momentary feedback.
  const pulseDpad = useCallback((dir) => {
    setDpadFlash(dir);
    clearTimeout(dpadTimerRef.current);
    dpadTimerRef.current = setTimeout(() => setDpadFlash(null), 180);
  }, []);

  // Directional navigation, shared by the arrow keys and the on-screen D-pad so
  // both stay in lock-step. Mode-agnostic: the focus/recenter effects keep the
  // focused row in view in every mode.
  const focusRowAt = (i) => {
    const t = rows[Math.min(Math.max(i, 0), rows.length - 1)];
    if (t) setFocusedId(t.id);
  };
  // Transient overscroll tug that snaps back (centered mode only): the column
  // nudges in the attempted direction, then the CSS transition eases it home.
  const BOUNCE_PX = 16;
  const triggerBounce = (axis, sign) => {
    if (studyMode !== "centered") return;
    setBounce(axis === "y" ? { x: 0, y: sign * BOUNCE_PX } : { x: sign * BOUNCE_PX, y: 0 });
    clearTimeout(bounceTimerRef.current);
    bounceTimerRef.current = setTimeout(() => setBounce({ x: 0, y: 0 }), 160);
  };

  // Centered mode: up/down moves among the focused node's SIBLINGS only; at the
  // first/last sibling it bounces instead of crossing into another branch (use
  // left/right to change level).
  const centeredStep = (delta) => {
    pulseDpad(delta > 0 ? "down" : "up");
    const parent = fullParentOf.get(focusedId);
    const sibs = parent ? parent.children || [] : top;
    const i = sibs.findIndex((n) => n.id === focusedId);
    if (i < 0) return;
    const ni = i + delta;
    if (ni < 0 || ni >= sibs.length) {
      triggerBounce("y", delta < 0 ? 1 : -1);
      return;
    }
    setFocusedId(sibs[ni].id);
  };

  const navUp = () => {
    pulseDpad("up");
    if (studyMode === "centered") return centeredStep(-1);
    const idx = rows.findIndex((n) => n.id === focusedId);
    focusRowAt(idx < 0 ? 0 : idx - 1);
  };
  const navDown = () => {
    pulseDpad("down");
    if (studyMode === "centered") return centeredStep(1);
    const idx = rows.findIndex((n) => n.id === focusedId);
    focusRowAt(idx < 0 ? 0 : idx + 1);
  };
  const navLeft = () => {
    pulseDpad("left");
    const node = rows.find((n) => n.id === focusedId);
    if (studyMode === "centered") {
      // Ascend exactly one level to the parent; snap back at the top level.
      const parent = node && fullParentOf.get(node.id);
      if (parent) setFocusedId(parent.id);
      else triggerBounce("x", 1);
      return;
    }
    const kids = node?.children || [];
    if (node && kids.length && !collapsed.has(node.id)) onToggle(node.id);
    else if (node && parentOf.get(node.id)) setFocusedId(parentOf.get(node.id).id);
  };
  const navRight = () => {
    pulseDpad("right");
    const node = rows.find((n) => n.id === focusedId);
    const kids = node?.children || [];
    if (studyMode === "centered") {
      // Descend exactly one level: open the node if needed AND move onto its
      // first child in a single step; snap back on a leaf (right-most).
      if (kids.length) {
        if (collapsed.has(node.id)) onToggle(node.id);
        setFocusedId(kids[0].id);
      } else {
        triggerBounce("x", -1);
      }
      return;
    }
    if (node && kids.length) {
      if (collapsed.has(node.id)) onToggle(node.id);
      else setFocusedId(kids[0].id);
    }
  };
  // Keep the refs the centered touch handler reads pointed at the latest fns.
  navLeftRef.current = navLeft;
  navRightRef.current = navRight;
  centeredStepRef.current = centeredStep;

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      // aria-modal does not trap focus by itself; without this, Tab walks out
      // of the overlay into the (hidden) reader and Esc stops working.
      const focusables = overlayRef.current?.querySelectorAll("button") ?? [];
      if (focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && (document.activeElement === first || !overlayRef.current?.contains(document.activeElement) || document.activeElement === treeRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else {
        e.preventDefault();
      }
      e.stopPropagation();
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        navDown();
        break;
      case "ArrowUp":
        navUp();
        break;
      case "ArrowLeft":
        navLeft();
        break;
      case "ArrowRight":
        navRight();
        break;
      case "Enter": {
        // Open the selected section in the reader (same as its arrow button).
        const node = rows.find((n) => n.id === focusedId);
        if (node) onSelect(node);
        break;
      }
      case " ":
        // Preview removed; swallow Space so it doesn't scroll the overlay.
        break;
      default:
        return; // let unhandled keys through untouched
    }
    e.preventDefault();
    e.stopPropagation();
  };

  // Keep tree focus when tapping the D-pad so arrow keys keep working after.
  const keepFocus = (e) => e.preventDefault();

  return (
    <div
      ref={overlayRef}
      className="r-study-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sapche view"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className={`${inter.className} r-study-header`}>
        <span className="uppercase tracking-[0.12em] text-[11px]" style={{ color: "#9a8f76" }}>
          Sapche view
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="r-toc-iconbtn r-study-fontbtn"
            onClick={() => adjustFontSize(-STUDY_FONT_STEP)}
            disabled={fontSize <= STUDY_FONT_MIN}
            title="Decrease text size"
            aria-label="Decrease text size"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            className="r-toc-iconbtn r-study-fontbtn"
            onClick={() => adjustFontSize(STUDY_FONT_STEP)}
            disabled={fontSize >= STUDY_FONT_MAX}
            title="Increase text size"
            aria-label="Increase text size"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close Sapche view"
          >
            ✕
          </button>
        </span>
      </div>
      <div className="r-study-body-wrap">
        {studyMode === "centered" && (
          <div className="r-study-centerband" aria-hidden="true" />
        )}
        <div
          ref={bodyRef}
          className={`r-study-body ${studyMode === "centered" ? "r-study-body-centered" : ""}`}
          onScroll={onBodyScroll}
        >
          <div
            ref={treeRef}
            className={`r-study-col ${isPanning ? "r-study-col-panning" : ""}`}
            role="tree"
            aria-label="Sapche outline"
            aria-activedescendant={focusedId ? `study-${focusedId}` : undefined}
            tabIndex={-1}
            style={{
              outline: "none",
              transform:
                studyMode === "centered"
                  ? `translate(${centerOffsetX + panX + bounce.x}px, ${centerOffset + bounce.y}px)`
                  : undefined,
            }}
          >
            {top.map((n) => (
              <StudyRow
                key={n.id}
                node={n}
                collapsed={collapsed}
                activeId={activeId}
                focusedId={focusedId}
                centered={studyMode === "centered"}
                fontSize={fontSize}
                onToggle={onToggle}
                onSelect={onSelect}
                onFocusNode={setFocusedId}
                onRowEnter={onRowEnter}
                onRowLeave={onRowLeave}
              />
            ))}
          </div>
        </div>

        {/* Ghost directional pad — mirrors the arrow keys, works in all modes.
            Faint at rest; each nav input briefly flashes it (see reader.css). */}
        <div
          className={`r-study-dpad ${dpadFlash ? "r-study-dpad-pulse" : ""}`}
          role="group"
          aria-label="Navigate outline"
        >
          <button
            type="button"
            className={`r-study-dpad-btn r-study-dpad-up ${dpadFlash === "up" ? "r-study-dpad-btn-active" : ""}`}
            onMouseDown={keepFocus}
            onClick={navUp}
            tabIndex={-1}
            aria-label="Previous line"
          >
            <DpadChevron dir="up" />
          </button>
          <button
            type="button"
            className={`r-study-dpad-btn r-study-dpad-left ${dpadFlash === "left" ? "r-study-dpad-btn-active" : ""}`}
            onMouseDown={keepFocus}
            onClick={navLeft}
            tabIndex={-1}
            aria-label="Collapse or go to parent"
          >
            <DpadChevron dir="left" />
          </button>
          <button
            type="button"
            className={`r-study-dpad-btn r-study-dpad-right ${dpadFlash === "right" ? "r-study-dpad-btn-active" : ""}`}
            onMouseDown={keepFocus}
            onClick={navRight}
            tabIndex={-1}
            aria-label="Expand or go to first child"
          >
            <DpadChevron dir="right" />
          </button>
          <button
            type="button"
            className={`r-study-dpad-btn r-study-dpad-down ${dpadFlash === "down" ? "r-study-dpad-btn-active" : ""}`}
            onMouseDown={keepFocus}
            onClick={navDown}
            tabIndex={-1}
            aria-label="Next line"
          >
            <DpadChevron dir="down" />
          </button>
        </div>
      </div>
    </div>
  );
}
