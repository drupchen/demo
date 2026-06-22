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
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { sqlString, reconstructSegments, rowsToSql } from "../src/lib/searchIndex.js";
export { sqlString, reconstructSegments, rowsToSql };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = join(__dirname, "..", "public", "data", "archive");

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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
