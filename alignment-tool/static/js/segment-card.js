/**
 * Segment card component: combines alignment strip, audio player,
 * and adjustment controls into a single card.
 */

import { state, segStartIdx, segEndIdx, adjustStart, adjustEnd, shiftAll, isSegmentDirty } from "./state.js";
import { renderAlignmentStrip } from "./alignment-strip.js";
import { createAudioPlayer, formatTime, parseTimestamp } from "./audio-player.js";

/**
 * Render a segment card.
 * Returns { element, audioPlayer, refresh }.
 *
 * @param {number} segIdx
 * @param {function} onActivate - called when this card is clicked
 * @param {function} onAdjust - called after any boundary adjustment
 */
export function renderSegmentCard(segIdx, { onActivate, onAdjust }) {
  const seg = state.segments[segIdx];

  const card = document.createElement("div");
  card.className = "segment-card";
  card.dataset.segIdx = segIdx;

  // ── Header: label + syl count + audio ──
  const header = document.createElement("div");
  header.className = "card-header";
  header.addEventListener("click", () => onActivate(segIdx));

  const label = document.createElement("span");
  label.className = "seg-label";
  label.textContent = `Seg ${segIdx + 1}`;

  const sylCount = document.createElement("span");
  sylCount.className = "syl-count";
  sylCount.textContent = `${seg.syl_uuids?.length || 0} syls`;

  const audioPlayer = createAudioPlayer(seg);

  header.appendChild(label);
  header.appendChild(sylCount);
  header.appendChild(audioPlayer.container);
  card.appendChild(header);

  // ── Alignment strip ──
  let strip = renderAlignmentStrip(segIdx);
  card.appendChild(strip);

  // ── Controls ──
  const controls = document.createElement("div");
  controls.className = "card-controls";

  function addGroup(labelText, buttons) {
    const group = document.createElement("div");
    group.className = "btn-group";
    const lbl = document.createElement("span");
    lbl.className = "btn-group-label";
    lbl.textContent = labelText;
    group.appendChild(lbl);
    for (const { text, action } of buttons) {
      const btn = document.createElement("button");
      btn.className = "adjust-btn";
      btn.textContent = text;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        action();
      });
      group.appendChild(btn);
    }
    controls.appendChild(group);
  }

  addGroup("Start:", [
    { text: "◀ −1", action: () => { if (adjustStart(segIdx, -1)) onAdjust(segIdx); } },
    { text: "+1 ▶", action: () => { if (adjustStart(segIdx, 1)) onAdjust(segIdx); } },
  ]);

  addGroup("End:", [
    { text: "◀ −1", action: () => { if (adjustEnd(segIdx, -1)) onAdjust(segIdx); } },
    { text: "+1 ▶", action: () => { if (adjustEnd(segIdx, 1)) onAdjust(segIdx); } },
  ]);

  const spacer = document.createElement("div");
  spacer.className = "controls-spacer";
  controls.appendChild(spacer);

  addGroup("Shift:", [
    { text: "◀◀ All", action: () => { if (shiftAll(segIdx, -1)) onAdjust(segIdx); } },
    { text: "All ▶▶", action: () => { if (shiftAll(segIdx, 1)) onAdjust(segIdx); } },
  ]);

  card.appendChild(controls);

  // ── Refresh method (re-render strip + update dirty state) ──
  function refresh() {
    const newStrip = renderAlignmentStrip(segIdx);
    card.replaceChild(newStrip, strip);
    strip = newStrip;

    // Update syl count
    sylCount.textContent = `${state.segments[segIdx].syl_uuids?.length || 0} syls`;

    // Dirty indicator
    if (isSegmentDirty(segIdx)) {
      card.classList.add("dirty");
    } else {
      card.classList.remove("dirty");
    }
  }

  return { element: card, audioPlayer, refresh };
}
