"use client";
import { uchen, inter, sapcheInkFor } from "@/lib/theme";

export default function SectionMarker({ node }) {
  return (
    <div className="r-sapche-marker" id={`sec-${node.id}`} data-depth={node.depth}>
      <span className={`r-sapche-num ${inter.className}`}>{node.number}</span>
      <span className={uchen.className} style={{ fontWeight: 600, color: sapcheInkFor(node.depth) }}>
        {node.title}
      </span>
      <span className="r-sapche-rule" />
    </div>
  );
}
