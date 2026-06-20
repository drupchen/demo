// Run: node tests/catalog.test.mjs
import assert from "node:assert/strict";
import { accessLevelForInstance, filterCatalogByLevel } from "../src/lib/catalog.js";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

const catalog = [
  { Title_bo: "Public", Access_Level: 0, Instances: [{ Instance_ID: "pub1" }] },
  { Title_bo: "Gated", Access_Level: 2, Instances: [{ Instance_ID: "g1" }, { Instance_ID: "g2" }] },
];

test("returns access level for a known instance", () => {
  assert.equal(accessLevelForInstance(catalog, "pub1"), 0);
  assert.equal(accessLevelForInstance(catalog, "g2"), 2);
});

test("returns null for unknown instance", () => {
  assert.equal(accessLevelForInstance(catalog, "nope"), null);
});

test("filters teachings above the user level", () => {
  const r = filterCatalogByLevel(catalog, 0);
  assert.equal(r.length, 1);
  assert.equal(r[0].Title_bo, "Public");
});

test("includes everything for a high-level user", () => {
  assert.equal(filterCatalogByLevel(catalog, 4).length, 2);
});

test("missing Access_Level is treated as max-restricted (4)", () => {
  const c = [{ Title_bo: "X", Instances: [{ Instance_ID: "x" }] }];
  assert.equal(accessLevelForInstance(c, "x"), 4);
  assert.equal(filterCatalogByLevel(c, 3).length, 0);
});

console.log(`\n${passed} tests passed`);
