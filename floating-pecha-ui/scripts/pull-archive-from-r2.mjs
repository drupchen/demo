#!/usr/bin/env node
// Pull archive content from the REMOTE (production) R2 bucket into the LOCAL
// (miniflare) R2 bucket, so the local reader matches production. The reader
// serves archive via /api/content + /api/catalog, which read from the `MEDIA`
// R2 binding — in `npm run dev` that's the local miniflare R2, NOT public/data.
// So mirroring prod = copying R2(remote) → R2(local). Companion to `npm run db:pull`.
//
//   npm run archive:pull                       # all instances (from catalog.json)
//   npm run archive:pull -- drime_shalung_1    # a single instance
//
// Why this matters for notes: notes anchor by syllable UUID (position-derived),
// so prod notes only navigate/highlight locally if the local manifest is the
// SAME version production serves.

import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync, rmSync } from "node:fs";

const BUCKET = process.env.BUCKET || "rabsal-dawa-media";
const onlyInstance = process.argv.slice(2).find((a) => !a.startsWith("-"));

function r2(action, key, file, scope) {
  const r = spawnSync(
    "npx",
    ["wrangler", "r2", "object", action, `${BUCKET}/${key}`, "--file", file, scope],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
  );
  return r;
}

// Copy one object from remote R2 to local R2 via a temp file.
function copyKey(key, { optional = false } = {}) {
  const tmp = join(tmpdir(), `r2pull-${key.replace(/[^a-z0-9]/gi, "_")}`);
  const got = r2("get", key, tmp, "--remote");
  if (got.status !== 0) {
    if (optional) {
      console.log(`(skip) ${key} — not present remotely`);
      return false;
    }
    console.error(`Failed to GET ${key} from remote R2:\n${got.stderr}`);
    process.exit(got.status ?? 1);
  }
  const put = r2("put", key, tmp, "--local");
  if (existsSync(tmp)) rmSync(tmp);
  if (put.status !== 0) {
    console.error(`Failed to PUT ${key} into local R2:\n${put.stderr}`);
    process.exit(put.status ?? 1);
  }
  console.log(`(copy) ${key}`);
  return true;
}

console.log("Mirroring production archive (R2 remote → R2 local)…\n");

// 1. Catalog (index of instances).
const catalogTmp = join(tmpdir(), "r2pull-catalog.json");
{
  const got = r2("get", "archive/catalog.json", catalogTmp, "--remote");
  if (got.status !== 0) {
    console.error(`Failed to GET archive/catalog.json:\n${got.stderr}`);
    process.exit(got.status ?? 1);
  }
  const put = r2("put", "archive/catalog.json", catalogTmp, "--local");
  if (put.status !== 0) {
    console.error(`Failed to PUT archive/catalog.json into local R2:\n${put.stderr}`);
    process.exit(put.status ?? 1);
  }
  console.log("(copy) archive/catalog.json");
}

// 2. Resolve instances.
let instances;
if (onlyInstance) {
  instances = [onlyInstance];
} else {
  const catalog = JSON.parse(readFileSync(catalogTmp, "utf-8"));
  const ids = new Set();
  for (const teaching of catalog) {
    for (const inst of teaching.Instances || []) {
      if (inst.Instance_ID) ids.add(inst.Instance_ID);
    }
  }
  instances = [...ids];
}
if (existsSync(catalogTmp)) rmSync(catalogTmp);

// 3. Per-instance files: manifest + compiled sessions (required), sapche (optional).
for (const id of instances) {
  copyKey(`archive/${id}/manifest.json`);
  copyKey(`archive/${id}/${id}_compiled_sessions.json`);
  copyKey(`archive/${id}/sapche.json`, { optional: true });
}

console.log(
  `\nDone. Mirrored ${instances.length} instance(s) from ${BUCKET} (remote → local R2).\n` +
    "Run `npm run dev` and the local reader will serve production's archive.",
);
