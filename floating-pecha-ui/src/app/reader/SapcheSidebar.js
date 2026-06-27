"use client";
import { inter, sapcheAccentFor, sapcheInk, uchen } from "@/lib/theme";
import SapcheNumber from "./SapcheNumber";
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
        <SapcheNumber number={node.number} className={`${inter.className} r-toc-num`} />
        <span
          className={`${uchen.className} r-toc-title`}
          style={{ color: sapcheInk }}
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
          className="uppercase tracking-[0.12em] text-[11px]"
          style={{ color: "#9a8f76" }}
        >
          TOC
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            className="r-toc-iconbtn r-toc-iconbtn-plain"
            onClick={onExpand}
            title="Sapche view"
            aria-label="Open Sapche view"
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
              <path d="M21 4H3" />
              <path d="M18 8H6" />
              <path d="M19 12H9" />
              <path d="M16 16h-6" />
              <path d="M11 20H9" />
            </svg>
          </button>
          <button
            type="button"
            className="r-toc-iconbtn r-toc-iconbtn-plain"
            onClick={onHide}
            aria-label="Hide contents"
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
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="m16 15-3-3 3-3" />
            </svg>
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
