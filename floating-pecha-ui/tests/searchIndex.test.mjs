// Run: node tests/searchIndex.test.mjs
// Unit tests for the pure helpers in scripts/build-search-index.mjs:
// segment text reconstruction, SQL string escaping, and byte-budgeted INSERT
// chunking (the SQLITE_TOOBIG guard).

import assert from "node:assert/strict";
import { reconstructSegments, sqlString, rowsToSql } from "../scripts/build-search-index.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const manifest = [
  { id: "a", text: "བཀྲ་" },
  { id: "b", text: "ཤིས་" },
  { id: "c", text: "བདེ་" },
  { id: "d", text: "ལེགས།" },
];

test("reconstructs segment text from syllable uuids in order", () => {
  const rows = reconstructSegments({
    manifest,
    sessions: [{ global_seg_id: "g1", source_session: "s1", start: "00:00:01,000", syl_uuids: ["a", "b"] }],
    instanceId: "inst1",
    teachingTitle: "Title",
    accessLevel: 0,
  });
  assert.equal(rows.length, 1);
  // The tsheg (་, U+0F0B) is not whitespace, so trim() keeps the trailing one —
  // matching the original OpenSearch ingest, which only stripped whitespace.
  assert.equal(rows[0].text, "བཀྲ་ཤིས་");
  assert.equal(rows[0].segment_id, "g1");
  assert.equal(rows[0].first_syl_id, "a");
  assert.equal(rows[0].access_level, 0);
});

test("skips segments whose syllables resolve to empty text", () => {
  const rows = reconstructSegments({
    manifest,
    sessions: [{ global_seg_id: "g2", syl_uuids: ["zzz", "yyy"] }],
    instanceId: "inst1",
    teachingTitle: "Title",
    accessLevel: 0,
  });
  assert.equal(rows.length, 0);
});

test("defaults missing access level to 4 (most restricted)", () => {
  const rows = reconstructSegments({
    manifest,
    sessions: [{ global_seg_id: "g3", syl_uuids: ["c"] }],
    instanceId: "inst1",
    teachingTitle: "Title",
    accessLevel: undefined,
  });
  assert.equal(rows[0].access_level, 4);
});

test("sqlString doubles single quotes", () => {
  assert.equal(sqlString("it's"), "'it''s'");
  assert.equal(sqlString("plain"), "'plain'");
});

test("rowsToSql starts with a full DELETE so rebuilds are idempotent", () => {
  const sql = rowsToSql([{ text: "x", segment_id: "1", instance_id: "i", teaching_title: "t", session_id: "s", start: "0", first_syl_id: "f", access_level: 0 }]);
  assert.match(sql, /^DELETE FROM segments_fts;/);
  assert.match(sql, /INSERT INTO segments_fts/);
});

test("rowsToSql splits into multiple statements under a small byte budget", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    text: "བཀྲ་ཤིས་བདེ་ལེགས",
    segment_id: `g${i}`,
    instance_id: "inst1",
    teaching_title: "Title",
    session_id: "s",
    start: "0",
    first_syl_id: "a",
    access_level: 0,
  }));
  const sql = rowsToSql(rows, { maxStatementBytes: 200 });
  const inserts = (sql.match(/INSERT INTO segments_fts/g) || []).length;
  assert.ok(inserts > 1, `expected chunking into >1 INSERT, got ${inserts}`);
  // every row still present
  const tuples = (sql.match(/\(/g) || []).length;
  assert.ok(tuples >= 10);
});

console.log(`\n${passed} tests passed`);
