"use client";
import { inter, uchen, sapcheInk } from "@/lib/theme";
import { formatSapcheNumber } from "@/lib/sapcheNumber";

export default function SectionMarker({ node }) {
  const num = formatSapcheNumber(node.number);
  return (
    <div className="r-sapche-marker" id={`sec-${node.id}`} data-depth={node.depth}>
      {num && <span className={`${inter.className} r-sapche-num`}>{num}</span>}
      <span className={uchen.className} style={{ fontWeight: 600, color: sapcheInk }}>
        {node.title}
      </span>
      <span className="r-sapche-rule" />
    </div>
  );
}
