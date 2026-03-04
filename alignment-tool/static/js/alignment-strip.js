/**
 * Renders the alignment strip: a horizontal row of syllable cells
 * with color-coded regions and boundary markers.
 */

import { state, segStartIdx, segEndIdx } from "./state.js";

const CONTEXT_SIZE = 20; // syllables of context before/after segment

/**
 * Render the alignment strip for a segment.
 * Returns a DOM element.
 *
 * @param {number} segIdx - Index into state.segments
 * @param {Set<number>} [neighborIndices] - Manifest indices belonging to neighboring segments
 */
export function renderAlignmentStrip(segIdx) {
  const seg = state.segments[segIdx];
  const startIdx = segStartIdx(segIdx);
  const endIdx = segEndIdx(segIdx);

  if (startIdx < 0 || endIdx < 0) {
    const el = document.createElement("div");
    el.className = "alignment-strip";
    el.textContent = "(no syllables)";
    return el;
  }

  // Compute context bounds (clamped to manifest and neighbors)
  let contextStart = startIdx - CONTEXT_SIZE;
  let contextEnd = endIdx + CONTEXT_SIZE;

  // Clamp to manifest
  contextStart = Math.max(0, contextStart);
  contextEnd = Math.min(state.manifest.length - 1, contextEnd);

  // Build neighbor ranges for color coding
  const prevStart = segIdx > 0 ? segStartIdx(segIdx - 1) : -1;
  const prevEnd = segIdx > 0 ? segEndIdx(segIdx - 1) : -1;
  const nextStart = segIdx < state.segments.length - 1 ? segStartIdx(segIdx + 1) : -1;
  const nextEnd = segIdx < state.segments.length - 1 ? segEndIdx(segIdx + 1) : -1;

  const strip = document.createElement("div");
  strip.className = "alignment-strip";

  for (let i = contextStart; i <= contextEnd; i++) {
    const syl = state.manifest[i];
    if (!syl) continue;

    // Insert boundary marker before segment start
    if (i === startIdx) {
      const marker = document.createElement("span");
      marker.className = "boundary-marker";
      strip.appendChild(marker);
    }

    const cell = document.createElement("span");
    cell.className = "syl-cell";
    cell.dataset.manifestIndex = i;
    cell.title = `idx:${syl.index} id:${syl.id?.slice(0, 8)}… ${syl.nature}`;

    // Determine region
    if (i >= startIdx && i <= endIdx) {
      cell.classList.add("region-current");
    } else if ((i >= prevStart && i <= prevEnd) || (i >= nextStart && i <= nextEnd)) {
      cell.classList.add("region-neighbor");
    } else {
      cell.classList.add("region-context");
    }

    // Nature-based styling
    if (syl.nature === "PUNCT" || syl.nature === "SYM") {
      cell.classList.add("nature-punct");
    }

    cell.textContent = syl.text;
    strip.appendChild(cell);

    // Insert boundary marker after segment end
    if (i === endIdx) {
      const marker = document.createElement("span");
      marker.className = "boundary-marker";
      strip.appendChild(marker);
    }
  }

  // Auto-scroll so the segment start is visible
  requestAnimationFrame(() => {
    const firstCurrent = strip.querySelector(".region-current");
    if (firstCurrent) {
      firstCurrent.scrollIntoView({ inline: "center", block: "nearest" });
    }
  });

  return strip;
}
