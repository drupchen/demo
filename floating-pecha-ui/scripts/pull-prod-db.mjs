#!/usr/bin/env node
// Pull real data from the remote (production) D1 into the LOCAL dev D1, so
// `npm run dev` mirrors production accounts and notes.
//
//   npm run db:pull
//
// What it does: exports the `users` and `notes` rows from the remote DB, clears
// those tables locally, and imports the production rows. The local schema must
// already exist (run `npm run db:apply` once first).
//
// NOT pulled:
//   - segments_fts (FTS5 virtual table — wrangler cannot export it; rebuild the
//     local search index with `npm run search:index` if you need search).
//   - voice-note audio — it lives in R2, not D1.
//
// ⚠️  This REPLACES local `users` and `notes` with production data. After it
//     runs, sign in locally with PRODUCTION credentials.

import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";

// Real data tables that change in production. Order matters for the local
// wipe (delete children before parents); import order is INSERT-only so it is
// not constrained.
const TABLES = ["users", "notes"];
const WIPE_ORDER = ["notes", "users"]; // child first

const dump = join(tmpdir(), `rabsal-d1-pull-${Date.now()}.sql`);

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

console.log("Pulling production D1 (users + notes) → local dev D1");
console.log("⚠️  This REPLACES local users and notes with production data.\n");

try {
  // 1. Export remote rows only (no schema — the local schema already exists).
  const tableFlags = TABLES.map((t) => `--table ${t}`).join(" ");
  run(
    `npx wrangler d1 export DB --remote ${tableFlags} --no-schema --output="${dump}"`,
  );

  if (!existsSync(dump)) {
    throw new Error(`Export did not produce ${dump}`);
  }

  // 2. Clear the local rows so the production INSERTs don't collide on ids.
  for (const table of WIPE_ORDER) {
    run(
      `npx wrangler d1 execute DB --local --command "DELETE FROM ${table};"`,
    );
  }

  // 3. Import the production rows.
  run(`npx wrangler d1 execute DB --local --file="${dump}"`);

  // 4. Show the resulting local counts.
  run(
    `npx wrangler d1 execute DB --local --command "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM notes) AS notes;"`,
  );

  console.log(
    "\n✅ Done. Local D1 now mirrors production users + notes.\n" +
      "   Run `npm run dev` and sign in with production credentials.\n" +
      "   (Search index not pulled — run `npm run search:index` if needed.)",
  );
} finally {
  if (existsSync(dump)) rmSync(dump);
}
