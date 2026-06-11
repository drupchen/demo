// Pure helper for the audio hook — no React, so it can be unit tested directly.

/**
 * Decide whether a `timeupdate` reading should update the UI clock.
 *
 * After loading a new source and seeking to an offset, an <audio> element
 * briefly reports `currentTime` near 0 (and other off-target values) before the
 * seek lands. Honouring those transients makes time-driven UI (segment
 * highlight, auto-scroll) jump to the start of the recording and back. While a
 * seek is pending we ignore readings that are still far from the target, and
 * resume once one lands within `toleranceSec`.
 *
 * @param {number|null} pendingTargetSec - Seek target in seconds, or null when no seek is in flight.
 * @param {number} currentTimeSec - The element's current time in seconds.
 * @param {number} [toleranceSec=0.5] - How close counts as "landed".
 * @returns {{ accept: boolean, clearPending: boolean }}
 */
export function resolveTimeUpdate(pendingTargetSec, currentTimeSec, toleranceSec = 0.5) {
  if (pendingTargetSec == null) {
    return { accept: true, clearPending: false };
  }
  if (Math.abs(currentTimeSec - pendingTargetSec) > toleranceSec) {
    return { accept: false, clearPending: false };
  }
  return { accept: true, clearPending: true };
}
