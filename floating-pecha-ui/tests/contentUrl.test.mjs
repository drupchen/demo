// Run: node tests/contentUrl.test.mjs
import assert from "node:assert/strict";
import { contentUrl } from "../src/lib/contentUrl.js";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

test("builds the API path", () => {
  assert.equal(contentUrl("drime_shalung_1", "manifest.json"),
    "/api/content/drime_shalung_1/manifest.json");
});

test("encodes path segments", () => {
  assert.equal(contentUrl("a b", "x y.json"), "/api/content/a%20b/x%20y.json");
});

console.log(`\n${passed} tests passed`);
