"use client";
// Navigation help card for the Sapche study view, opened from the d-pad's center
// info button. Each action is shown with a large illustration (from public/icons)
// so the gesture/motion is unambiguous. Desktop and mobile variants are both
// rendered; CSS shows the right one per breakpoint (see reader.css).
import { inter } from "@/lib/theme";

// Desktop uses the dedicated illustrations from public/icons.
const ROWS_DESKTOP = [
  { src: "/icons/arrow-keys.svg", label: "navigate in the TOC" },
  { src: "/icons/mouse-click.svg", label: "center any header" },
];
// Mobile uses the dedicated illustrations from public/icons (sized to depict the
// touch gestures).
const ROWS_MOBILE = [
  { src: "/icons/navigate.svg", label: "navigate in the TOC" },
  { src: "/icons/horizontal-scroll-2x.svg", label: "read hidden text" },
  { src: "/icons/tap.svg", label: "center any header" },
  { src: "/icons/change-size.svg", label: "bigger/smaller size" },
];

function Section({ className, rows }) {
  return (
    <div className={className}>
      {rows.map(({ src, label }) => (
        <div key={label} className="r-study-help-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="r-study-help-img" src={src} alt="" />
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
