// Run: node tests/archiveZip.test.mjs
// Parses real ZIP bytes (built with fflate) — would have caught the single-
// instance "top folder stripped → no instance" bug.
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { parseZip, buildRows } from "../src/lib/archiveZip.js";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

function makeZip(files) {
  const obj = {};
  for (const [p, t] of Object.entries(files)) obj[p] = strToU8(t);
  return zipSync(obj);
}

const manifest = JSON.stringify([{ id: "a", text: "ཀ" }, { id: "b", text: "ཁ" }]);
const sessions = JSON.stringify([{ global_seg_id: "s1", syl_uuids: ["a", "b"], start: "0" }]);

test("single instance folder (no catalog) is detected, folder kept as instance", () => {
  const zip = makeZip({
    "drime_1/": "",
    "drime_1/manifest.json": manifest,
    "drime_1/drime_1_compiled_sessions.json": sessions,
    "drime_1/sapche.json": "[]",
  });
  const { catalogText, instances } = parseZip(zip);
  assert.equal(catalogText, null);
  assert.deepEqual([...instances.keys()], ["drime_1"]);
  assert.equal(typeof instances.get("drime_1").files["manifest.json"], "string");
  assert.equal(typeof instances.get("drime_1").files["sapche.json"], "string");
});

test("full output/ wrapper is stripped, catalog + instance found", () => {
  const zip = makeZip({
    "output/catalog.json": "[]",
    "output/drime_1/manifest.json": manifest,
    "output/drime_1/drime_1_compiled_sessions.json": sessions,
  });
  const { catalogText, instances } = parseZip(zip);
  assert.equal(catalogText, "[]");
  assert.deepEqual([...instances.keys()], ["drime_1"]);
});

test("already-stripped contents (catalog + instance dir at root)", () => {
  const zip = makeZip({
    "catalog.json": "[]",
    "drime_1/manifest.json": manifest,
    "drime_1/drime_1_compiled_sessions.json": sessions,
  });
  const { catalogText, instances } = parseZip(zip);
  assert.equal(catalogText, "[]");
  assert.deepEqual([...instances.keys()], ["drime_1"]);
});

test("nested dirs under an instance are ignored", () => {
  const zip = makeZip({
    "drime_1/manifest.json": manifest,
    "drime_1/drime_1_compiled_sessions.json": sessions,
    "drime_1/sessions/A1.json": "[]",
    "drime_1/session_logs/A1.log": "x",
  });
  const { instances } = parseZip(zip);
  const files = Object.keys(instances.get("drime_1").files).sort();
  assert.deepEqual(files, ["drime_1_compiled_sessions.json", "manifest.json"]);
});

test("buildRows instance mode: known instance gets level from publishedMeta, valid", () => {
  const zip = makeZip({
    "drime_1/manifest.json": manifest,
    "drime_1/drime_1_compiled_sessions.json": sessions,
  });
  const parsed = parseZip(zip);
  const publishedMeta = new Map([["drime_1", { accessLevel: 4, teachingTitle: "T" }]]);
  const { hasCatalog, rows } = buildRows(parsed, publishedMeta);
  assert.equal(hasCatalog, false);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].known, true);
  assert.equal(rows[0].accessLevel, 4);
  assert.equal(rows[0].verdict.ok, true);
});

test("buildRows instance mode: unknown instance is rejected (known=false)", () => {
  const zip = makeZip({
    "drime_1/manifest.json": manifest,
    "drime_1/drime_1_compiled_sessions.json": sessions,
  });
  const parsed = parseZip(zip);
  const { rows } = buildRows(parsed, new Map());
  assert.equal(rows[0].known, false);
});

console.log(`\n${passed} tests passed`);
