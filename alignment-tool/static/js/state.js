/**
 * Application state management + adjustment algorithms.
 *
 * The core invariant: segments within a session are contiguous.
 * Each segment's syl_uuids maps to a slice of the manifest.
 * Adjusting one segment's boundary also adjusts its neighbor.
 */

export const state = {
  instances: [],
  currentInstance: null,
  sessionNames: [],
  currentSession: null,

  manifest: [],           // full manifest array
  uuidToIndex: {},        // Map: uuid -> 0-based manifest array index
  segments: [],           // working copy of segments (mutable)
  originalSegments: [],   // deep copy at load time (for dirty detection + undo)
  isDirty: false,
  activeSegmentIdx: -1,   // which segment card is focused
};

/**
 * Build the uuid-to-index lookup map from the manifest.
 */
export function buildManifestIndex() {
  state.uuidToIndex = {};
  state.manifest.forEach((syl, idx) => {
    if (syl.id) state.uuidToIndex[syl.id] = idx;
  });
}

/**
 * Load segments into state, creating a deep copy as the original.
 */
export function loadSegments(segments) {
  state.segments = segments;
  state.originalSegments = JSON.parse(JSON.stringify(segments));
  state.isDirty = false;
  state.activeSegmentIdx = segments.length > 0 ? 0 : -1;
}

/**
 * Get the manifest array index of a segment's first syllable.
 * Returns -1 if the segment has no syllables.
 */
export function segStartIdx(segIdx) {
  const seg = state.segments[segIdx];
  if (!seg || !seg.syl_uuids || seg.syl_uuids.length === 0) return -1;
  return state.uuidToIndex[seg.syl_uuids[0]] ?? -1;
}

/**
 * Get the manifest array index of a segment's last syllable.
 */
export function segEndIdx(segIdx) {
  const seg = state.segments[segIdx];
  if (!seg || !seg.syl_uuids || seg.syl_uuids.length === 0) return -1;
  return state.uuidToIndex[seg.syl_uuids[seg.syl_uuids.length - 1]] ?? -1;
}

/**
 * Rebuild a segment's syl_uuids from manifest[startIdx..endIdx] (inclusive).
 */
function rebuildUuids(segIdx, startIdx, endIdx) {
  const uuids = [];
  for (let i = startIdx; i <= endIdx && i < state.manifest.length; i++) {
    if (state.manifest[i].id) uuids.push(state.manifest[i].id);
  }
  state.segments[segIdx].syl_uuids = uuids;
}

/**
 * Adjust the start boundary of a segment by `delta` syllables.
 * delta > 0: move start rightward (shrink segment, expand previous)
 * delta < 0: move start leftward (expand segment, shrink previous)
 */
export function adjustStart(segIdx, delta) {
  if (segIdx < 0 || segIdx >= state.segments.length) return false;

  const currentStart = segStartIdx(segIdx);
  const currentEnd = segEndIdx(segIdx);
  if (currentStart < 0 || currentEnd < 0) return false;

  let newStart = currentStart + delta;

  // Clamp: segment must keep at least 1 syllable
  newStart = Math.min(newStart, currentEnd);

  // Clamp: can't go before previous segment's start + 1 (prev keeps at least 1)
  if (segIdx > 0) {
    const prevStart = segStartIdx(segIdx - 1);
    if (prevStart >= 0) newStart = Math.max(newStart, prevStart + 1);
  } else {
    newStart = Math.max(newStart, 0);
  }

  if (newStart === currentStart) return false; // no change

  // Rebuild current segment
  rebuildUuids(segIdx, newStart, currentEnd);

  // Adjust previous segment's end to maintain contiguity
  if (segIdx > 0) {
    const prevStart = segStartIdx(segIdx - 1);
    if (prevStart >= 0) {
      rebuildUuids(segIdx - 1, prevStart, newStart - 1);
    }
  }

  state.isDirty = true;
  return true;
}

/**
 * Adjust the end boundary of a segment by `delta` syllables.
 * delta > 0: move end rightward (expand segment, shrink next)
 * delta < 0: move end leftward (shrink segment, expand next)
 */
export function adjustEnd(segIdx, delta) {
  if (segIdx < 0 || segIdx >= state.segments.length) return false;

  const currentStart = segStartIdx(segIdx);
  const currentEnd = segEndIdx(segIdx);
  if (currentStart < 0 || currentEnd < 0) return false;

  let newEnd = currentEnd + delta;

  // Clamp: segment must keep at least 1 syllable
  newEnd = Math.max(newEnd, currentStart);

  // Clamp: can't go past next segment's end - 1 (next keeps at least 1)
  if (segIdx < state.segments.length - 1) {
    const nextEnd = segEndIdx(segIdx + 1);
    if (nextEnd >= 0) newEnd = Math.min(newEnd, nextEnd - 1);
  } else {
    newEnd = Math.min(newEnd, state.manifest.length - 1);
  }

  if (newEnd === currentEnd) return false;

  // Rebuild current segment
  rebuildUuids(segIdx, currentStart, newEnd);

  // Adjust next segment's start to maintain contiguity
  if (segIdx < state.segments.length - 1) {
    const nextEnd = segEndIdx(segIdx + 1);
    if (nextEnd >= 0) {
      rebuildUuids(segIdx + 1, newEnd + 1, nextEnd);
    }
  }

  state.isDirty = true;
  return true;
}

/**
 * Shift the entire segment by `delta` syllables.
 * Adjusts both neighbors to maintain contiguity.
 */
export function shiftAll(segIdx, delta) {
  if (segIdx < 0 || segIdx >= state.segments.length) return false;

  // Shift start and end by the same delta
  const startOk = adjustStart(segIdx, delta);
  const endOk = adjustEnd(segIdx, delta);
  return startOk || endOk;
}

/**
 * Check if a specific segment has been modified from its original.
 */
export function isSegmentDirty(segIdx) {
  const original = state.originalSegments[segIdx];
  const current = state.segments[segIdx];
  if (!original || !current) return false;
  if (original.syl_uuids.length !== current.syl_uuids.length) return true;
  return original.syl_uuids.some((uuid, i) => uuid !== current.syl_uuids[i]);
}

/**
 * Undo all changes — restore segments to their original state.
 */
export function undoAll() {
  state.segments = JSON.parse(JSON.stringify(state.originalSegments));
  state.isDirty = false;
}
