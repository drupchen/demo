// Run: node tests/noteSelection.test.mjs
// Unit tests for src/lib/note-selection.js (DOM-agnostic).

import assert from "node:assert/strict";
import { closestSylId, orderAnchors } from "../src/lib/note-selection.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// Build a fake node chain: leaf -> span(id=X) -> div(no id).
function node(id, parent) {
  return { id: id ?? "", parentElement: parent ?? null };
}

const isSylId = (id) => new Set(["s1", "s2", "s3"]).has(id);

test("closestSylId returns the id of the nearest ancestor that is a syllable", () => {
  const span = node("s2", node("", null));
  const leaf = node("", span);
  assert.equal(closestSylId(leaf, isSylId), "s2");
});

test("closestSylId returns null when no ancestor is a syllable", () => {
  const leaf = node("", node("not-a-syl", null));
  assert.equal(closestSylId(leaf, isSylId), null);
});

test("closestSylId handles the node itself being the syllable", () => {
  const span = node("s1", null);
  assert.equal(closestSylId(span, isSylId), "s1");
});

test("orderAnchors keeps order when start precedes end", () => {
  const indexOf = new Map([["s1", 0], ["s2", 1], ["s3", 2]]);
  assert.deepEqual(orderAnchors("s1", "s3", indexOf), { startSylId: "s1", endSylId: "s3" });
});

test("orderAnchors swaps when selection runs backwards", () => {
  const indexOf = new Map([["s1", 0], ["s2", 1], ["s3", 2]]);
  assert.deepEqual(orderAnchors("s3", "s1", indexOf), { startSylId: "s1", endSylId: "s3" });
});

test("orderAnchors collapses a single-syllable selection", () => {
  const indexOf = new Map([["s1", 0]]);
  assert.deepEqual(orderAnchors("s1", "s1", indexOf), { startSylId: "s1", endSylId: "s1" });
});

console.log(`\n${passed} passed`);
