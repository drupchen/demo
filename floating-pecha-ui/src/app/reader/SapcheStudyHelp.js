"use client";
// Navigation help card for the Sapche study view, opened from the d-pad's center
// info button. Each action is shown with a large hand-drawn illustration (not a
// terse icon) so the gesture/motion is unambiguous. Desktop and mobile variants
// are both rendered; CSS shows the right one per breakpoint (see reader.css).
import { inter } from "@/lib/theme";

const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

// Desktop — navigate: four arrow keycaps in an inverted-T.
function DrawArrowKeys() {
  return (
    <svg {...svgProps} className="r-study-help-draw">
      <rect x="18" y="3" width="12" height="12" rx="2.5" />
      <rect x="4" y="18" width="12" height="12" rx="2.5" />
      <rect x="18" y="18" width="12" height="12" rx="2.5" />
      <rect x="32" y="18" width="12" height="12" rx="2.5" />
      <path d="m21 10.5 3-3 3 3" />
      <path d="m11.5 21 -3 3 3 3" />
      <path d="m21 23 3 3 3-3" />
      <path d="m36.5 21 3 3-3 3" />
    </svg>
  );
}

// Desktop — select: a mouse cursor clicking a header row.
function DrawClickRow() {
  return (
    <svg {...svgProps} className="r-study-help-draw">
      <rect x="3" y="11" width="28" height="11" rx="2.5" />
      <path d="M8 16.5h13" />
      {/* click sparks at the cursor tip */}
      <path d="M27 9.5v-3" />
      <path d="m22.6 11 -1.8-2.4" />
      <path d="m31.4 11 1.8-2.4" />
      {/* mouse pointer cursor */}
      <path
        d="M27 16 L27 33 L31 29.2 L34 36 L37 34.6 L34 28 L39.5 27.6 Z"
        fill="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

const ROWS_DESKTOP = [
  { Draw: DrawArrowKeys, label: "navigate in the TOC" },
  { Draw: DrawClickRow, label: "center any header" },
];
// Mobile uses the dedicated illustrations from public/icons (richer than the
// desktop line drawings, sized to depict the touch gestures).
const ROWS_MOBILE = [
  { src: "/icons/navigate.svg", label: "navigate in the TOC" },
  { src: "/icons/horizontal-scroll-2x.svg", label: "read hidden text" },
  { src: "/icons/tap.svg", label: "center any header" },
  { src: "/icons/change-size.svg", label: "bigger/smaller size" },
];

function Section({ className, rows }) {
  return (
    <div className={className}>
      {rows.map(({ Draw, src, label }) => (
        <div key={label} className="r-study-help-row">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="r-study-help-img" src={src} alt="" />
          ) : (
            <Draw />
          )}
          <span className="r-study-help-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function SapcheStudyHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="r-study-help-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`${inter.className} r-study-help`}
        role="dialog"
        aria-label="Navigation help"
        onClick={(e) => e.stopPropagation()}
      >
        <Section className="r-study-help-desktop" rows={ROWS_DESKTOP} />
        <Section className="r-study-help-mobile" rows={ROWS_MOBILE} />
      </div>
    </div>
  );
}
