#!/usr/bin/env node
// Pull archive content from the REMOTE (production) R2 bucket into local
// public/data/archive, so the local reader matches production. Needed because
// notes anchor by syllable UUID: prod notes only navigate/highlight locally if
// the local manifest is the SAME version as production's. Companion to
// `npm run db:pull`.
//
//   npm run archive:pull                       # all instances (from catalog.json)
//   npm run archive:pull -- drime_shalung_1    # a single instance
//
// Mirrors R2 keys archive/<x> -> public/data/archive/<x>. Reads from the
// deployed R2 (--remote); writes to local disk.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BUCKET = process.env.BUCKET || "rabsal-dawa-media";
const ROOT = path.resolve(process.cwd(), "public/data/archive");
const onlyInstance = process.argv.slice(2).find((a) => !a.startsWith("-"));

function getObject(key, destPath, { optional = false } = {}) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const args = [
    "wrangler", "r2", "object", "get", `${BUCKET}/${key}`,
    "--file", destPath, "--remote",
  ];
  const r = spawnSync("npx", args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    if (optional) {
      console.log(`(skip) ${key} — not present`);
      return false;
    }
    console.error(`Failed to get ${key}:\n${r.stderr}`);
    process.exit(r.status ?? 1);
  }
  console.log(`(get)  ${key}`);
  return true;
}

// 1. Catalog (always — it's the index of instances).
getObject("archive/catalog.json", path.join(ROOT, "catalog.json"));

// 2. Resolve which instances to pull.
let instances;
if (onlyInstance) {
  instances = [onlyInstance];
} else {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "catalog.json"), "utf-8"),
  );
  const ids = new Set();
  for (const teaching of catalog) {
    for (const inst of teaching.Instances || []) {
      if (inst.Instance_ID) ids.add(inst.Instance_ID);
    }
  }
  instances = [...ids];
}

// 3. Per-instance files: manifest + compiled sessions (required), sapche (optional).
for (const id of instances) {
  getObject(`archive/${id}/manifest.json`, path.join(ROOT, id, "manifest.json"));
  getObject(
    `archive/${id}/${id}_compiled_sessions.json`,
    path.join(ROOT, id, `${id}_compiled_sessions.json`),
  );
  getObject(`archive/${id}/sapche.json`, path.join(ROOT, id, "sapche.json"), {
    optional: true,
  });
}

console.log(
  `\nDone. Pulled ${instances.length} instance(s) from ${BUCKET} (remote) into ${ROOT}.`,
);
