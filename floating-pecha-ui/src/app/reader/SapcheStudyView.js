"use client";
// Fullscreen sapche study view — the sapche is an object of study in its own
// right (scholars memorize the outline), so this renders the tree alone with
// generous Tibetan type, free expand/collapse, and keyboard navigation.
// Depth-accent colors (borrowed from the sapche_discovery prototype) are full
// strength here because the study view shows no commentary color bars.
// Spec: docs/superpowers/specs/2026-06-11-sapche-study-mode-design.md
import { inter, sapcheAccentFor, sapcheInk, uchen } from "@/lib/theme";
import { collectCollapsibleIds, flattenVisibleRows } from "@/lib/sapcheStudy";
import { formatSapcheNumber } from "@/lib/sapcheNumber";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

const STUDY_SIZES = [30, 26, 23, 21, 19]; // uchen px for depth 1..5; deeper → 18
const studySizeFor = (depth) =>
  depth >= 6 ? 18 : STUDY_SIZES[Math.max(depth, 1) - 1];

const PREVIEW_HOVER_DELAY_MS = 450;
// A sibling pill only earns its place when it actually saves scrolling: the
// jump target must be at least this many visible rows away.
const SIBLING_JUMP_MIN_ROWS = 5;

function StudyRow({
  node,
  siblings,
  collapsed,
  activeId,
  focusedId,
  rowIndex,
  onToggle,
  onSelect,
  onFocusNode,
  onRowEnter,
  onRowLeave,
}) {
  const kids = node.children || [];
  const isCollapsed = collapsed.has(node.id);
  // Same-level navigation, mirroring the prototype's gutter pills: previous /
  // next sibling. No parent fallback at the boundaries — a ↓ pointing up to
  // the parent (or a ↑ at the first sibling) reads as a wrong direction, so
  // the first sibling has no ↑ and the last has no ↓. A pill is only shown
  // when its target is far enough (in visible rows) for the jump to beat plain
  // scrolling — adjacent siblings don't need a button.
  const num = formatSapcheNumber(node.number);
  const myIdx = siblings.findIndex((s) => s.id === node.id);
  const prevTarget = myIdx > 0 ? siblings[myIdx - 1] : null;
  const nextTarget =
    myIdx >= 0 && myIdx < siblings.length - 1 ? siblings[myIdx + 1] : null;
  const farEnough = (target) =>
    target &&
    rowIndex.has(target.id) &&
    rowIndex.has(node.id) &&
    Math.abs(rowIndex.get(target.id) - rowIndex.get(node.id)) >= SIBLING_JUMP_MIN_ROWS;
  const showPrev = farEnough(prevTarget);
  const showNext = farEnough(nextTarget);
  return (
    <>
      <div
        id={`study-${node.id}`}
        role="treeitem"
        aria-level={node.depth}
        aria-expanded={kids.length > 0 ? !isCollapsed : undefined}
        aria-selected={focusedId === node.id}
        className={`r-study-row ${activeId === node.id ? "r-study-row-active" : ""} ${
          focusedId === node.id ? "r-study-row-focused" : ""
        }`}
        style={{ paddingLeft: (node.depth - 1) * 28 }}
        onClick={() => onSelect(node)}
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
        {num && <span className={`${inter.className} r-study-num`}>{num}</span>}
        <span
          className={`${uchen.className} r-study-title`}
          style={{ color: sapcheInk, fontSize: studySizeFor(node.depth) }}
        >
          {node.title}
        </span>
        {(showPrev || showNext) && (
          <span className="r-study-nav" aria-hidden="true">
            {showPrev && (
              <button
                type="button"
                className="r-study-navbtn"
                tabIndex={-1}
                title={`↑ ${prevTarget.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusNode(prevTarget.id);
                }}
              >
                ↑
              </button>
            )}
            {showNext && (
              <button
                type="button"
                className="r-study-navbtn"
                tabIndex={-1}
                title={`↓ ${nextTarget.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusNode(nextTarget.id);
                }}
              >
                ↓
              </button>
            )}
          </span>
        )}
      </div>
      {!isCollapsed &&
        kids.map((c) => (
          <StudyRow
            key={c.id}
            node={c}
            siblings={kids}
            collapsed={collapsed}
            activeId={activeId}
            focusedId={focusedId}
            rowIndex={rowIndex}
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

export default function SapcheStudyView({ roots, activeId, onSelect, onClose, previewFor }) {
  const top = useMemo(() => roots[0]?.children || [], [roots]); // skip the document root
  const [collapsed, setCollapsed] = useState(() => new Set()); // all expanded on open
  const [focusedId, setFocusedId] = useState(() => activeId || top[0]?.id || null);
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
  const rowIndex = useMemo(() => {
    const m = new Map();
    rows.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [rows]);

  // Current section = the last row at or above the body's top edge (same
  // convention as the reader's active-section tracking).
  const updateCrumbs = () => {
    const body = bodyRef.current;
    if (!body) return;
    // Offset must exceed the rows' scroll-margin-block (80px), otherwise the
    // row a crumb/focus jump lands on never counts as "current".
    const topLine = body.getBoundingClientRect().top + 90;
    let current = null;
    for (const n of rows) {
      const el = document.getElementById(`study-${n.id}`);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= topLine) current = n;
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
  const onCollapseAll = () => {
    setPreview(null);
    setCollapsed(new Set(collectCollapsibleIds(top)));
  };
  const onExpandAll = () => {
    setPreview(null);
    setCollapsed(new Set());
  };

  const showPreviewFor = (nodeId, source) => {
    const el = document.getElementById(`study-${nodeId}`);
    if (!el || !previewFor) return;
    const node = rows.find((n) => n.id === nodeId);
    if (!node || !previewFor(node)) return;
    previewSourceRef.current = source;
    setPreview({ nodeId, ...previewPositionFor(el) });
  };

  const onRowEnter = (node, el) => {
    clearTimeout(hoverTimerRef.current);
    if (!previewFor || !previewFor(node)) return;
    hoverTimerRef.current = setTimeout(() => {
      previewSourceRef.current = "hover";
      setPreview({ nodeId: node.id, ...previewPositionFor(el) });
    }, PREVIEW_HOVER_DELAY_MS);
  };
  const onRowLeave = () => {
    clearTimeout(hoverTimerRef.current);
    if (previewSourceRef.current === "hover") setPreview(null);
  };

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

  // Keep the keyboard-focused row in view; a sticky (Space) preview follows it.
  useEffect(() => {
    if (!focusedId) return;
    document.getElementById(`study-${focusedId}`)?.scrollIntoView({ block: "nearest" });
    if (previewSourceRef.current === "key") showPreviewFor(focusedId, "key");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId]);

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

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (preview) {
        previewSourceRef.current = null;
        setPreview(null);
      } else {
        onClose();
      }
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
        if (node) onSelect(node);
        break;
      case " ": {
        // Peek at the section text without leaving the study view.
        if (preview && preview.nodeId === node?.id) {
          previewSourceRef.current = null;
          setPreview(null);
        } else if (node) {
          showPreviewFor(node.id, "key");
        }
        break;
      }
      default:
        return; // let unhandled keys through untouched
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const previewNode = preview ? rows.find((n) => n.id === preview.nodeId) : null;
  const previewText = previewNode && previewFor ? previewFor(previewNode) : null;

  return (
    <div
      ref={overlayRef}
      className="r-study-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sapche study view"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className={`${inter.className} r-study-header`}>
        <span className="uppercase tracking-[0.12em]" style={{ color: "#9a8f76" }}>
          <span className="text-[11px]">Study · </span>
          <span className={`${uchen.className} text-[15px] tracking-normal align-middle`}>
            ས་བཅད་
          </span>
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onCollapseAll}
            title="Collapse all"
            aria-label="Collapse all"
          >
            ⊟
          </button>
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onExpandAll}
            title="Expand all"
            aria-label="Expand all"
          >
            ⊞
          </button>
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close study view"
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
      <div ref={bodyRef} className="r-study-body" onScroll={onBodyScroll}>
        <div
          ref={treeRef}
          className="r-study-col"
          role="tree"
          aria-label="Sapche outline"
          aria-activedescendant={focusedId ? `study-${focusedId}` : undefined}
          tabIndex={-1}
          style={{ outline: "none" }}
        >
          {top.map((n) => (
            <StudyRow
              key={n.id}
              node={n}
              siblings={top}
              collapsed={collapsed}
              activeId={activeId}
              focusedId={focusedId}
              rowIndex={rowIndex}
              onToggle={onToggle}
              onSelect={onSelect}
              onFocusNode={setFocusedId}
              onRowEnter={onRowEnter}
              onRowLeave={onRowLeave}
            />
          ))}
        </div>
      </div>
      {previewNode && previewText && (
        <div
          className={`${uchen.className} r-study-preview`}
          style={{
            left: preview.left,
            top: preview.top,
            transform: preview.above ? "translateY(-100%)" : undefined,
          }}
          role="note"
          aria-label="Section text preview"
        >
          <div className={`${inter.className} r-study-preview-num`}>
            Space / Esc to dismiss
          </div>
          {previewText}
        </div>
      )}
    </div>
  );
}
