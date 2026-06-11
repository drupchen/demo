"use client";
// Fullscreen sapche study view — the sapche is an object of study in its own
// right (scholars memorize the outline), so this renders the tree alone with
// generous Tibetan type, free expand/collapse, and keyboard navigation.
// Spec: docs/superpowers/specs/2026-06-11-sapche-study-mode-design.md
import { inter, sapcheInkFor, uchen } from "@/lib/theme";
import { collectCollapsibleIds, flattenVisibleRows } from "@/lib/sapcheStudy";
import { useEffect, useMemo, useRef, useState } from "react";

const STUDY_SIZES = [30, 26, 23, 21, 19]; // uchen px for depth 1..5; deeper → 18
const studySizeFor = (depth) =>
  depth >= 6 ? 18 : STUDY_SIZES[Math.max(depth, 1) - 1];

function StudyRow({ node, collapsed, activeId, focusedId, onToggle, onSelect }) {
  const kids = node.children || [];
  const isCollapsed = collapsed.has(node.id);
  return (
    <>
      <div
        id={`study-${node.id}`}
        className={`r-study-row ${activeId === node.id ? "r-study-row-active" : ""} ${
          focusedId === node.id ? "r-study-row-focused" : ""
        }`}
        style={{ paddingLeft: (node.depth - 1) * 28 }}
        onClick={() => onSelect(node)}
      >
        <span className={`${inter.className} r-study-num`}>{node.number}</span>
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
        <span
          className={`${uchen.className} r-study-title`}
          style={{ color: sapcheInkFor(node.depth), fontSize: studySizeFor(node.depth) }}
        >
          {node.title}
        </span>
      </div>
      {!isCollapsed &&
        kids.map((c) => (
          <StudyRow
            key={c.id}
            node={c}
            collapsed={collapsed}
            activeId={activeId}
            focusedId={focusedId}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export default function SapcheStudyView({ roots, activeId, onSelect, onClose }) {
  const top = useMemo(() => roots[0]?.children || [], [roots]); // skip the document root
  const [collapsed, setCollapsed] = useState(() => new Set()); // all expanded on open
  const [focusedId, setFocusedId] = useState(() => activeId || top[0]?.id || null);
  const overlayRef = useRef(null);

  const { rows, parentOf } = useMemo(
    () => flattenVisibleRows(top, collapsed),
    [top, collapsed]
  );

  const onToggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const onCollapseAll = () => setCollapsed(new Set(collectCollapsibleIds(top)));
  const onExpandAll = () => setCollapsed(new Set());

  // On open: take keyboard focus and show the current reading position.
  // On close: hand focus back to whatever had it (the sidebar's ⛶ button).
  useEffect(() => {
    const prevFocus = document.activeElement;
    overlayRef.current?.focus();
    const target = activeId || top[0]?.id;
    if (target)
      document.getElementById(`study-${target}`)?.scrollIntoView({ block: "center" });
    return () => prevFocus?.focus?.();
    // Mount-only: the view re-mounts on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the keyboard-focused row in view.
  useEffect(() => {
    if (!focusedId) return;
    document.getElementById(`study-${focusedId}`)?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
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
        if (!node) return;
        const kids = node.children || [];
        if (kids.length && !collapsed.has(node.id)) onToggle(node.id);
        else if (parentOf.get(node.id)) setFocusedId(parentOf.get(node.id).id);
        break;
      }
      case "ArrowRight": {
        if (!node) return;
        const kids = node.children || [];
        if (!kids.length) return;
        if (collapsed.has(node.id)) onToggle(node.id);
        else setFocusedId(kids[0].id);
        break;
      }
      case "Enter":
        if (node) onSelect(node);
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
      <div className="r-study-body">
        <div className="r-study-col">
          {top.map((n) => (
            <StudyRow
              key={n.id}
              node={n}
              collapsed={collapsed}
              activeId={activeId}
              focusedId={focusedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
