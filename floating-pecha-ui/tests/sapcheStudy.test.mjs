// Run: node tests/sapcheStudy.test.mjs
// Unit tests for src/lib/sapcheStudy.js — visible-row flattening and
// collapse-all collection for the study view's keyboard navigation.

import assert from "node:assert/strict";
import { collectCollapsibleIds, flattenVisibleRows } from "../src/lib/sapcheStudy.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const tree = [
  {
    id: "1",
    children: [
      { id: "1.1", children: [] },
      { id: "1.2", children: [{ id: "1.2.1", children: [] }] },
    ],
  },
  { id: "2", children: [] },
];

test("expanded tree flattens depth-first in render order", () => {
  const { rows } = flattenVisibleRows(tree, new Set());
  assert.deepEqual(rows.map((r) => r.id), ["1", "1.1", "1.2", "1.2.1", "2"]);
});

test("children of a collapsed node are hidden, the node itself stays", () => {
  const { rows } = flattenVisibleRows(tree, new Set(["1.2"]));
  assert.deepEqual(rows.map((r) => r.id), ["1", "1.1", "1.2", "2"]);
});

test("collapsing an ancestor hides the whole subtree", () => {
  const { rows } = flattenVisibleRows(tree, new Set(["1"]));
  assert.deepEqual(rows.map((r) => r.id), ["1", "2"]);
});

test("parentOf maps children to their parent node; top-level nodes have no entry", () => {
  const { parentOf } = flattenVisibleRows(tree, new Set());
  assert.equal(parentOf.get("1.2.1").id, "1.2");
  assert.equal(parentOf.get("1.1").id, "1");
  assert.equal(parentOf.get("1"), undefined);
});

test("missing children property is treated as a leaf", () => {
  const { rows } = flattenVisibleRows([{ id: "a" }], new Set());
  assert.deepEqual(rows.map((r) => r.id), ["a"]);
});

test("collectCollapsibleIds returns exactly the nodes with children", () => {
  assert.deepEqual(collectCollapsibleIds(tree).sort(), ["1", "1.2"]);
});

console.log(`sapcheStudy: ${passed} tests passed`);
