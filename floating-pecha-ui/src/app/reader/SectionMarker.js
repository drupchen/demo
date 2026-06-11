"use client";
import { uchen, sapcheInkFor } from "@/lib/theme";

// Outline numbers are deliberately not displayed for now (pending a decision
// on numbering style — Arabic vs Tibetan); node.number still drives internal
// logic like ancestor lookup in the reader page.
export default function SectionMarker({ node }) {
  return (
    <div className="r-sapche-marker" id={`sec-${node.id}`} data-depth={node.depth}>
      <span className={uchen.className} style={{ fontWeight: 600, color: sapcheInkFor(node.depth) }}>
        {node.title}
      </span>
      <span className="r-sapche-rule" />
    </div>
  );
}
