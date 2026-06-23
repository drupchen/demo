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
import TocModeIcon, { TOC_MODE_LABEL } from "./TocModeIcon";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

// All rows share one uchen size (no longer depth-scaled); the reader controls it
// with the +/- buttons in the header, clamped to [MIN, MAX].
const STUDY_FONT_DEFAULT = 24;
const STUDY_FONT_MIN = 14;
const STUDY_FONT_MAX = 40;
const STUDY_FONT_STEP = 2;

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
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 5v14" />
              <path d="M21 12H7" />
              <path d="m15 18 6-6-6-6" />
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
  // Outline mode for the tri-state button. "centered" (default) pins the focused
  // level to a center band, folds the tree around it, and steps on scroll/swipe.
  const [studyMode, setStudyMode] = useState("centered");
  // Centered mode translates the outline column so the selected row sits exactly
  // on the band (deterministic — no native scroll). px offset of `.r-study-col`.
  const [centerOffset, setCenterOffset] = useState(0);
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
  // Ancestor chain (root → current) of the topmost visible row — the sticky
  // breadcrumb that answers "where am I?" deep inside an expanded subtree.
  const [crumbs, setCrumbs] = useState([]);
  const previewSourceRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const overlayRef = useRef(null);
  const treeRef = useRef(null);
  const bodyRef = useRef(null);
  const breadcrumbRef = useRef(null);

  const { rows, parentOf } = useMemo(
    () => flattenVisibleRows(top, collapsed),
    [top, collapsed]
  );
  // Latest rows for the Centered stepper, so its listeners can stay subscribed
  // across folds (re-subscribing mid-drag would reset the gesture).
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);


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

  // Centered fold: keep only the selected node and its ancestors (up to the top)
  // open, collapsing every other branch — mirrors the reader's centered follow.
  const computeCenteredCollapse = useCallback(
    (centerId) => {
      const open = new Set();
      for (let n = centerId ? nodeById.get(centerId) : null; n; n = fullParentOf.get(n.id) || null) {
        open.add(n.id);
      }
      const next = new Set();
      for (const id of collectCollapsibleIds(top)) if (!open.has(id)) next.add(id);
      return next;
    },
    [top, nodeById, fullParentOf],
  );

  // Current section = the last row at or above the body's top edge (same
  // convention as the reader's active-section tracking).
  const updateCrumbs = () => {
    const body = bodyRef.current;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    // In Centered mode the "current" node is the one on the center band; in the
    // other modes it's the topmost row (offset must exceed the rows'
    // scroll-margin-block, 80px, so a jump target counts as "current").
    const anchorLine =
      studyMode === "centered" ? rect.top + rect.height / 2 : rect.top + 90;
    let current = null;
    for (const n of rows) {
      const el = document.getElementById(`study-${n.id}`);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= anchorLine) current = n;
      else break;
    }
    const chain = [];
    for (let walk = current; walk; walk = parentOf.get(walk.id) || null) {
      chain.unshift(walk);
    }
    setCrumbs((prev) =>
      prev.length === chain.length && prev.every((n, i) => n.id === chain[i].id)
        ? prev
        : chain
    );
  };

  // Recompute after every layout change (collapse/expand re-flows the rows);
  // rAF waits for the DOM to reflect the new row set first.
  useEffect(() => {
    const raf = requestAnimationFrame(updateCrumbs);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // A deep path (root → current) can't always fit on one line. The rightmost
  // crumb is the current section — the one that matters most — so pin the
  // horizontal scroll to the right edge; ancestors stay reachable by scrolling
  // left. No-op when the path already fits.
  useEffect(() => {
    const el = breadcrumbRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [crumbs]);

  const onToggle = (id) => {
    setFocusedId(id); // chevron clicks move the focus ring too, so mouse and keyboard stay in step
    setPreview(null);
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  // Three-way mode control (in the header): pick a mode directly. Expand/collapse
  // set the collapse set; centered slides in from a known position (the fold is
  // applied by the focusedId effect).
  const onSetMode = (mode) => {
    if (mode === studyMode) return;
    setPreview(null);
    if (mode === "expand") setCollapsed(new Set());
    else if (mode === "collapse") setCollapsed(new Set(collectCollapsibleIds(top)));
    else setCenterOffset(0);
    setStudyMode(mode);
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
    const target = activeId || top[0]?.id;
    if (target)
      document.getElementById(`study-${target}`)?.scrollIntoView({ block: "center" });
    return () => {
      clearTimeout(hoverTimerRef.current);
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
  // clientHeight), so it's exact regardless of fold reflow or timing. Re-runs on
  // selection/fold change and on resize.
  useEffect(() => {
    if (studyMode !== "centered") return;
    const recenter = () => {
      const body = bodyRef.current;
      const col = treeRef.current;
      const row = focusedId && document.getElementById(`study-${focusedId}`);
      if (!body || !col || !row) return;
      const rowMid = col.offsetTop + row.offsetTop + row.offsetHeight / 2;
      setCenterOffset(body.clientHeight / 2 - rowMid);
    };
    recenter();
    window.addEventListener("resize", recenter);
    return () => window.removeEventListener("resize", recenter);
  }, [focusedId, rows, studyMode, fontSize]);

  // Centered mode has no scroll, so derive the breadcrumb from the selected
  // node's ancestor chain.
  useEffect(() => {
    if (studyMode !== "centered") return;
    const chain = [];
    for (let n = focusedId ? nodeById.get(focusedId) : null; n; n = fullParentOf.get(n.id) || null) {
      chain.unshift(n);
    }
    setCrumbs((prev) =>
      prev.length === chain.length && prev.every((n, i) => n.id === chain[i].id)
        ? prev
        : chain
    );
  }, [studyMode, focusedId, nodeById, fullParentOf]);

  // Scrolling the tree invalidates the popover's fixed position — drop it —
  // and moves the breadcrumb's "current" row.
  const onBodyScroll = () => {
    if (preview) setPreview(null);
    updateCrumbs();
  };

  const gotoCrumb = (node) => {
    setFocusedId(node.id);
    document.getElementById(`study-${node.id}`)?.scrollIntoView({ block: "start" });
  };

  // Centered mode steps one level at a time onto the band. Vertical wheel/drag
  // moves the selected level; horizontal drag pans natively (touch-action:pan-x).
  // Subscribes ONCE (reads the live spine via rowsRef) so a drag survives the
  // per-step fold without losing its gesture anchor. The fold + recenter effects
  // then park the new level on the band.
  useEffect(() => {
    if (studyMode !== "centered") return;
    const body = bodyRef.current;
    if (!body) return;
    const STEP_PX = 38; // vertical drag distance per level
    const moveFocus = (delta) => {
      setFocusedId((cur) => {
        const r = rowsRef.current;
        const i = r.findIndex((n) => n.id === cur);
        const ni = Math.min(Math.max((i < 0 ? 0 : i) + delta, 0), r.length - 1);
        return r[ni]?.id ?? cur;
      });
    };

    let wheelLock = false;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // horizontal: native pan
      e.preventDefault();
      if (wheelLock || Math.abs(e.deltaY) < 4) return;
      wheelLock = true;
      moveFocus(e.deltaY > 0 ? 1 : -1);
      setTimeout(() => {
        wheelLock = false;
      }, 180);
    };

    // Continuous, distance-based stepping with axis lock.
    let startX = 0;
    let lastY = 0;
    let acc = 0;
    let axis = null; // null until decided, then "x" (native pan) or "y" (stepping)
    const onTouchStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      lastY = t.clientY;
      acc = 0;
      axis = null;
    };
    const onTouchMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      if (axis === null) {
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - lastY);
        if (dx < 6 && dy < 6) return; // wait for a real move
        axis = dx > dy ? "x" : "y";
      }
      if (axis === "x") return; // horizontal: let the browser pan
      e.preventDefault();
      acc += lastY - t.clientY; // finger up => positive => next levels
      lastY = t.clientY;
      while (Math.abs(acc) >= STEP_PX) {
        moveFocus(acc > 0 ? 1 : -1);
        acc -= Math.sign(acc) * STEP_PX;
      }
    };

    body.addEventListener("wheel", onWheel, { passive: false });
    body.addEventListener("touchstart", onTouchStart, { passive: true });
    body.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      body.removeEventListener("wheel", onWheel);
      body.removeEventListener("touchstart", onTouchStart);
      body.removeEventListener("touchmove", onTouchMove);
    };
  }, [studyMode]);

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
    const idx = rows.findIndex((n) => n.id === focusedId);
    const node = idx >= 0 ? rows[idx] : null;
    const focusRow = (i) => {
      const t = rows[Math.min(Math.max(i, 0), rows.length - 1)];
      if (t) setFocusedId(t.id);
    };
    switch (e.key) {
      case "ArrowDown":
        focusRow(idx < 0 ? 0 : idx + 1);
        break;
      case "ArrowUp":
        focusRow(idx < 0 ? 0 : idx - 1);
        break;
      case "ArrowLeft": {
        const kids = node?.children || [];
        if (node && kids.length && !collapsed.has(node.id)) onToggle(node.id);
        else if (node && parentOf.get(node.id)) setFocusedId(parentOf.get(node.id).id);
        break;
      }
      case "ArrowRight": {
        const kids = node?.children || [];
        if (node && kids.length) {
          if (collapsed.has(node.id)) onToggle(node.id);
          else setFocusedId(kids[0].id);
        }
        break;
      }
      case "Enter":
        // Open the selected section in the reader (same as its arrow button).
        if (node) onSelect(node);
        break;
      case " ":
        // Preview removed; swallow Space so it doesn't scroll the overlay.
        break;
      default:
        return; // let unhandled keys through untouched
    }
    e.preventDefault();
    e.stopPropagation();
  };

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
        {/* Three-way mode switch, centered in the bar; the active mode is sunken. */}
        <span className="r-study-modes" role="group" aria-label="Outline mode">
          {["expand", "collapse", "centered"].map((mode) => (
            <button
              key={mode}
              type="button"
              className={`r-toc-iconbtn ${studyMode === mode ? "r-text-accent r-icon-pressed" : ""}`}
              onClick={() => onSetMode(mode)}
              title={TOC_MODE_LABEL[mode]}
              aria-label={TOC_MODE_LABEL[mode]}
              aria-pressed={studyMode === mode}
            >
              <TocModeIcon mode={mode} />
            </button>
          ))}
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
      <nav
        ref={breadcrumbRef}
        className="r-study-breadcrumb"
        aria-label="Current section path"
      >
        {crumbs.map((n, i) => (
          <Fragment key={n.id}>
            {i > 0 && <span className="r-study-crumb-sep">›</span>}
            <button
              type="button"
              className={`${uchen.className} r-study-crumb`}
              onClick={() => gotoCrumb(n)}
              title={n.title}
            >
              <span
                className="r-study-crumb-dot"
                style={{ backgroundColor: sapcheAccentFor(n.depth) }}
                aria-hidden="true"
              />
              <span className="r-study-crumb-txt">{n.title}</span>
            </button>
          </Fragment>
        ))}
      </nav>
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
            className="r-study-col"
            role="tree"
            aria-label="Sapche outline"
            aria-activedescendant={focusedId ? `study-${focusedId}` : undefined}
            tabIndex={-1}
            style={{
              outline: "none",
              transform:
                studyMode === "centered" ? `translateY(${centerOffset}px)` : undefined,
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
      </div>
    </div>
  );
}
