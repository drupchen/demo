"use client";
import { inter, uchen, sapcheInk } from "@/lib/theme";
import SapcheNumber from "./SapcheNumber";

export default function SectionMarker({ node }) {
  return (
    <div className="r-sapche-marker" id={`sec-${node.id}`} data-depth={node.depth}>
      <SapcheNumber number={node.number} className={`${inter.className} r-sapche-num`} />
      <span className={uchen.className} style={{ fontWeight: 600, color: sapcheInk }}>
        {node.title}
      </span>
      <span className="r-sapche-rule" />
    </div>
  );
}
