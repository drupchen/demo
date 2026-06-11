"use client";
import { inter, sapcheAccentFor, sapcheInkFor, uchen } from "@/lib/theme";
import { useEffect, useRef } from "react";

function Row({ node, activeId, collapsed, onToggleCollapse, onSelect }) {
  const kids = node.children || [];
  const isCollapsed = collapsed.has(node.id);
  const isActive = activeId === node.id;
  const ref = useRef(null);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);
  return (
    <>
      <div
        ref={ref}
        className={`r-toc-row ${isActive ? "r-toc-row-active" : ""}`}
        style={{ paddingLeft: 6 + node.depth * 12 }}
        onClick={() => onSelect(node)}
      >
        <span
          className="r-toc-accent"
          style={{ backgroundColor: sapcheAccentFor(node.depth) }}
          aria-hidden="true"
        />
        {kids.length > 0 ? (
          <button
            type="button"
            className="r-toc-chevron"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(node.id);
            }}
            aria-label={isCollapsed ? "Expand section" : "Collapse section"}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="r-toc-chevron-spacer" />
        )}
        <span
          className={`${uchen.className} r-toc-title`}
          style={{ color: sapcheInkFor(node.depth) }}
        >
          {node.title}
        </span>
      </div>
      {!isCollapsed &&
        kids.map((c) => (
          <Row
            key={c.id}
            node={c}
            activeId={activeId}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export default function SapcheSidebar({
  roots,
  activeId,
  collapsedIds,
  onToggleCollapse,
  onSelect,
  onExpandAll,
  onCollapseAll,
  onHide,
  onExpand,
}) {
  const top = roots[0]?.children || []; // skip the document root node
  return (
    <div className="flex flex-col h-full">
      <div
        className={`${inter.className} flex justify-between items-center px-3 py-2.5 border-b r-border`}
      >
        <span
          className="uppercase tracking-[0.12em]"
          style={{ color: "#9a8f76" }}
        >
          <span className="text-[11px]">Contents · </span>
          <span
            className={`${uchen.className} text-[13px] tracking-normal align-middle`}
          >
            ས་བཅད་
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onExpand}
            title="Study view"
            aria-label="Open study view"
          >
            ⛶
          </button>
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
            onClick={onHide}
            title="Hide contents"
            aria-label="Hide contents"
          >
            «
          </button>
        </span>
      </div>
      <div className="flex-1 overflow-auto pb-6">
        {top.map((n) => (
          <Row
            key={n.id}
            node={n}
            activeId={activeId}
            collapsed={collapsedIds}
            onToggleCollapse={onToggleCollapse}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
