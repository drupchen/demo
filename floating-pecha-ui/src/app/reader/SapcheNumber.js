import React from "react";
import { sapcheNumberSegments } from "@/lib/sapcheNumber";

// Renders a sapche outline number with its letters and digits colored
// distinctly (see `.r-sapche-letter` / `.r-sapche-digit` in reader.css). The
// outer `className` keeps each call site's sizing/positioning class.
export default function SapcheNumber({ number, className }) {
  const segs = sapcheNumberSegments(number);
  if (!segs.length) return null;
  return (
    <span className={className}>
      {segs.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && "."}
          <span className={s.isLetter ? "r-sapche-letter" : "r-sapche-digit"}>
            {s.text}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}
