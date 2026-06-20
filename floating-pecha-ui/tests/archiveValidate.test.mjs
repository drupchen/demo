// Run: node tests/archiveValidate.test.mjs
import assert from "node:assert/strict";
import { validateInstanceBundle, validateCatalog } from "../src/lib/archiveValidate.js";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

const manifest = [
  { id: "a", text: "ཀ" },
  { id: "b", text: "ཁ" },
];
const sessions = [
  { global_seg_id: "s1", source_session: "A1", start: "00:00:00,000", syl_uuids: ["a", "b"] },
];

test("valid bundle passes", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest, sessions });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.segmentCount, 1);
  assert.equal(r.orphanCount, 0);
});

test("missing manifest array fails", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest: null, sessions });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /manifest/.test(e)));
});

test("empty manifest fails", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest: [], sessions });
  assert.equal(r.ok, false);
});

test("orphan syl_uuid fails and is counted", () => {
  const bad = [{ global_seg_id: "s1", syl_uuids: ["a", "zzz"] }];
  const r = validateInstanceBundle({ instanceId: "x", manifest, sessions: bad });
  assert.equal(r.ok, false);
  assert.equal(r.orphanCount, 1);
  assert.ok(r.errors.some((e) => /zzz/.test(e)));
});

test("sessions not an array fails", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest, sessions: {} });
  assert.equal(r.ok, false);
});

test("valid catalog yields instances with access levels", () => {
  const catalog = [
    { Teaching_ID: "t1", Title_bo: "ABC", Access_Level: 1, Instances: [{ Instance_ID: "x" }] },
  ];
  const r = validateCatalog(catalog);
  assert.equal(r.ok, true);
  assert.deepEqual(r.instances, [{ instanceId: "x", accessLevel: 1, teachingTitle: "ABC" }]);
});

test("catalog not an array fails", () => {
  const r = validateCatalog({});
  assert.equal(r.ok, false);
});

test("catalog instance without Instance_ID fails", () => {
  const r = validateCatalog([{ Title_bo: "x", Instances: [{}] }]);
  assert.equal(r.ok, false);
});

console.log(`\n${passed} tests passed`);
