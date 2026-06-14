#!/usr/bin/env node
// Build the D1 full-text search index from the local archive data.
//
// Reconstructs each audio segment's Tibetan text from its instance manifest
// (syllable id -> text) and the compiled sessions, then loads everything into
// the `segments_fts` FTS5 table (created by migration 0002). This mirrors the
// document shape the old OpenSearch ingest produced, so the search API and the
// archive UI consume the same fields.
//
// The index is rebuilt wholesale (DELETE then INSERT) — it is small and fully
// derived from the JSON in public/data/archive, so it is safe to re-run anytime.
//
// Usage:
//   npm run search:index            # local D1 (miniflare)
//   npm run search:index:remote     # deployed D1
//
// Requires migration 0002 to have been applied first (npm run db:apply).

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = join(__dirname, "..", "public", "data", "archive");

// ---- pure helpers (exported for tests) -------------------------------------

/** Escape a value for a single-quoted SQL string literal. */
export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Reconstruct segment rows for one instance.
 * @param {object} args
 * @param {Array<{id:string,text:string}>} args.manifest - syllable objects
 * @param {Array<object>} args.sessions - compiled session segments
 * @param {string} args.instanceId
 * @param {string} args.teachingTitle
 * @param {number} args.accessLevel
 * @returns {Array<object>} rows ready for insertion
 */
export function reconstructSegments({ manifest, sessions, instanceId, teachingTitle, accessLevel }) {
  const sylMap = new Map(manifest.map((s) => [s.id, s.text]));
  const rows = [];
  for (const seg of sessions) {
    const sylIds = seg.syl_uuids ?? [];
    const text = sylIds.map((id) => sylMap.get(id) ?? "").join("").trim();
    if (!text) continue; // skip segments with no resolvable text
    rows.push({
      segment_id: seg.global_seg_id,
      instance_id: instanceId,
      teaching_title: teachingTitle ?? "",
      session_id: seg.source_session ?? "",
      start: seg.start ?? "",
      first_syl_id: sylIds[0] ?? "",
      access_level: Number.isInteger(accessLevel) ? accessLevel : 4,
      text,
    });
  }
  return rows;
}

/**
 * Render rows into a SQL script that rebuilds the index. INSERTs are grouped by
 * an approximate byte budget per statement — D1 rejects oversized statements
 * (SQLITE_TOOBIG), so a fixed row count is unsafe with variable-length Tibetan.
 */
export function rowsToSql(rows, { maxStatementBytes = 60000 } = {}) {
  const parts = ["DELETE FROM segments_fts;"];
  const cols =
    "(text, segment_id, instance_id, teaching_title, session_id, start, first_syl_id, access_level)";
  const prefix = `INSERT INTO segments_fts ${cols} VALUES\n`;

  let buf = [];
  let bufBytes = 0;
  const flush = () => {
    if (buf.length === 0) return;
    parts.push(prefix + buf.join(",\n") + ";");
    buf = [];
    bufBytes = 0;
  };

  for (const r of rows) {
    const tuple =
      `(${sqlString(r.text)}, ${sqlString(r.segment_id)}, ${sqlString(r.instance_id)}, ` +
      `${sqlString(r.teaching_title)}, ${sqlString(r.session_id)}, ${sqlString(r.start)}, ` +
      `${sqlString(r.first_syl_id)}, ${Number(r.access_level)})`;
    const tupleBytes = Buffer.byteLength(tuple, "utf-8");
    if (buf.length > 0 && bufBytes + tupleBytes > maxStatementBytes) flush();
    buf.push(tuple);
    bufBytes += tupleBytes;
  }
  flush();
  return parts.join("\n");
}

/** Read the catalog + per-instance files and build all segment rows. */
export function buildAllRows(archiveDir = ARCHIVE_DIR) {
  const catalogPath = join(archiveDir, "catalog.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
  const rows = [];
  for (const teaching of catalog) {
    const accessLevel = teaching.Access_Level ?? 4;
    const teachingTitle = teaching.Title_bo ?? "";
    for (const instance of teaching.Instances ?? []) {
      const instanceId = instance.Instance_ID;
      const dir = join(archiveDir, instanceId);
      const manifestPath = join(dir, "manifest.json");
      const sessionsPath = join(dir, `${instanceId}_compiled_sessions.json`);
      if (!existsSync(manifestPath) || !existsSync(sessionsPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const sessions = JSON.parse(readFileSync(sessionsPath, "utf-8"));
      rows.push(
        ...reconstructSegments({ manifest, sessions, instanceId, teachingTitle, accessLevel })
      );
    }
  }
  return rows;
}

// ---- main ------------------------------------------------------------------

function main() {
  const remote = process.argv.includes("--remote");
  const targetFlag = remote ? "--remote" : "--local";

  console.log(`Reading archive data from ${ARCHIVE_DIR} …`);
  const rows = buildAllRows();
  console.log(`Reconstructed ${rows.length} segments.`);
  if (rows.length === 0) {
    console.error("No segments found — is public/data/archive populated?");
    process.exit(1);
  }

  const sql = rowsToSql(rows);
  const tmpPath = join(__dirname, ".search-index.tmp.sql");
  writeFileSync(tmpPath, sql, "utf-8");

  try {
    console.log(`Loading index into D1 (${targetFlag}) …`);
    const r = spawnSync(
      "npx",
      ["wrangler", "d1", "execute", "DB", targetFlag, "--file", tmpPath],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    if (r.status !== 0) {
      console.error(`wrangler d1 execute failed (exit ${r.status}).`);
      process.exit(r.status ?? 1);
    }
    console.log(`Indexed ${rows.length} segments into segments_fts.`);
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
