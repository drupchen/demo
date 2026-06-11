// Run: node tests/audioSeek.test.mjs
// Regression test for the "jump to first segment then back" reader bug.
//
// When a commentary is selected, the audio element loads a long file and seeks
// to the clicked segment's offset. During load+seek it briefly reports
// currentTime ~= 0, which maps to the commentary's FIRST segment (start 0) and
// makes the reader auto-scroll there and back. resolveTimeUpdate decides which
// timeupdate readings to honour so those transients are ignored.

import assert from "node:assert/strict";
import { resolveTimeUpdate } from "../src/lib/audioSeek.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// No seek pending: every reading is honoured (normal playback).
test("accepts updates when no seek is pending", () => {
  const r = resolveTimeUpdate(null, 5);
  assert.equal(r.accept, true);
  assert.equal(r.clearPending, false);
});

// The bug: seeking to 2157s, element still reporting ~0 during load.
test("ignores transient near-zero reading while seeking far into the file", () => {
  const r = resolveTimeUpdate(2157, 0);
  assert.equal(r.accept, false, "near-zero reading must be ignored");
});

// Any reading still far from the target is ignored until the seek lands.
test("ignores readings still far from the seek target", () => {
  assert.equal(resolveTimeUpdate(2157, 12.3).accept, false);
  assert.equal(resolveTimeUpdate(2157, 2150).accept, false);
});

// Seek has landed (within tolerance): honour it and stop suppressing.
test("accepts and clears pending once the reading reaches the target", () => {
  const r = resolveTimeUpdate(2157, 2157.1);
  assert.equal(r.accept, true);
  assert.equal(r.clearPending, true);
});

// Small under/overshoot inside tolerance still counts as landed.
test("treats a reading within tolerance as landed", () => {
  assert.equal(resolveTimeUpdate(100, 99.7).accept, true);
  assert.equal(resolveTimeUpdate(100, 99.7).clearPending, true);
});

// Custom tolerance is respected.
test("respects a custom tolerance", () => {
  assert.equal(resolveTimeUpdate(100, 98.5, 2).accept, true);
  assert.equal(resolveTimeUpdate(100, 98.5, 1).accept, false);
});

console.log(`\n${passed} passed`);
