"use client";

// Shared tri-state outline icon for the TOC sidebar and the study view, so both
// render the identical control. Modes: "expand" (list-chevrons-up-down),
// "collapse" (list-chevrons-down-up), "centered" (fold-vertical). Lucide paths.

const PATHS = {
  expand: ["M3 5h8", "M3 12h8", "M3 19h8", "m15 8 3-3 3 3", "m15 16 3 3 3-3"],
  collapse: ["M3 5h8", "M3 12h8", "M3 19h8", "m15 5 3 3 3-3", "m15 19 3-3 3 3"],
  centered: [
    "M12 22v-6", "M12 8V2", "M4 12H2", "M10 12H8", "M16 12h-2", "M22 12h-2",
    "m15 19-3-3-3 3", "m15 5-3 3-3-3",
  ],
};

export const TOC_MODE_LABEL = {
  expand: "Expand all",
  collapse: "Collapse all",
  centered: "Centered",
};

// Cycle order: expand -> collapse -> centered -> expand ...
export const TOC_MODE_NEXT = {
  centered: "expand",
  expand: "collapse",
  collapse: "centered",
};

export default function TocModeIcon({ mode, size = 18 }) {
  const paths = PATHS[mode] || PATHS.centered;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
