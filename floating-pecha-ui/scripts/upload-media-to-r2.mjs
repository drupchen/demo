#!/usr/bin/env node
// Upload local gallery videos to the R2 bucket bound as MEDIA.
//
// Scans:
//   public/data/world/gallery/mp4/ → R2 key: data/world/gallery/mp4/<file>
//   public/data/world/videos/      → R2 key: data/world/videos/<file>
//
// Idempotent: skips files whose R2 size already matches the local size.
// Size check uses a HEAD request to the public r2.dev URL (wrangler r2 object
// info does not exist in wrangler v4).
//
// Usage: BUCKET=khyentse-onang-media node scripts/upload-media-to-r2.mjs

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BUCKET = process.env.BUCKET || "khyentse-onang-media";
// Public r2.dev base URL for this bucket — used only for idempotency HEAD checks.
const R2_PUBLIC_BASE =
  process.env.R2_PUBLIC_BASE ||
  "https://pub-c6bede423d834991ba6ffbcbbf2a5d36.r2.dev";
const ROOT = path.resolve(process.cwd(), "public/data/world");

const DIRS = [
  { local: path.join(ROOT, "gallery/mp4"), prefix: "data/world/gallery/mp4" },
  { local: path.join(ROOT, "videos"),       prefix: "data/world/videos" },
];

function remoteSize(key) {
  // HEAD request to the public r2.dev URL — fast, no download, returns
  // Content-Length. wrangler r2 object info does not exist in wrangler v4.
  // Encode each path segment so filenames with spaces become valid URLs.
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const url = `${R2_PUBLIC_BASE}/${encodedKey}`;
  const r = spawnSync("curl", ["-sI", "--max-time", "10", url], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (r.status !== 0) return null;
  const m = r.stdout.match(/content-length:\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function upload(localPath, key) {
  // --remote required — without it wrangler writes to the local R2 simulator
  // and the public r2.dev URL returns 404.
  const r = spawnSync("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", localPath, "--remote"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    console.error(`Upload failed for ${key}:\n${r.stderr}`);
    process.exit(r.status ?? 1);
  }
}

let uploaded = 0, skipped = 0;
for (const { local, prefix } of DIRS) {
  if (!fs.existsSync(local)) {
    console.log(`(skip) ${local} not present locally`);
    continue;
  }
  for (const file of fs.readdirSync(local)) {
    if (file.startsWith(".")) continue;
    const localPath = path.join(local, file);
    const localSize = fs.statSync(localPath).size;
    const key = `${prefix}/${file}`;
    const r2Size = remoteSize(key);
    if (r2Size === localSize) {
      console.log(`(skip) ${key} (${localSize} bytes already in R2)`);
      skipped++;
      continue;
    }
    const sizeMb = (localSize / (1024 * 1024)).toFixed(1);
    console.log(`(upload) ${key} — ${sizeMb} MiB`);
    upload(localPath, key);
    uploaded++;
  }
}
console.log(`\nDone. ${uploaded} uploaded, ${skipped} skipped.`);
