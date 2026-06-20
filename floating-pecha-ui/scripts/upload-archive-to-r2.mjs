#!/usr/bin/env node
// One-time/repeatable migration: push public/data/archive → R2 under archive/.
//
//   node scripts/upload-archive-to-r2.mjs            # local R2 (miniflare)
//   node scripts/upload-archive-to-r2.mjs --remote   # deployed R2
//
// Mirrors the directory tree as R2 keys: public/data/archive/<x> -> archive/<x>.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BUCKET = process.env.BUCKET || "rabsal-dawa-media";
const remote = process.argv.includes("--remote");
const ROOT = path.resolve(process.cwd(), "public/data/archive");

if (!fs.existsSync(ROOT)) {
  console.error(`No archive dir at ${ROOT}`);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let count = 0;
for (const localPath of walk(ROOT)) {
  const rel = path.relative(ROOT, localPath).split(path.sep).join("/");
  const key = `archive/${rel}`;
  const args = ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", localPath];
  if (remote) args.push("--remote");
  console.log(`(put) ${key}${remote ? " [remote]" : " [local]"}`);
  const r = spawnSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" });
  if (r.status !== 0) {
    console.error(`Failed for ${key}:\n${r.stderr}`);
    process.exit(r.status ?? 1);
  }
  count++;
}
console.log(`\nDone. ${count} objects uploaded to ${BUCKET} (${remote ? "remote" : "local"}).`);
