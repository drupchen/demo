#!/usr/bin/env node
// Scan public/data/world/gallery/{jpg,mp4} → public/data/world/gallery-manifest.json
// Runs at build time (npm prebuild) so the runtime route can fetch it without fs.
// mp4 entries use an absolute R2 URL when R2_PUBLIC_BASE is set (videos are excluded
// from the Worker bundle via .assetsignore); jpg entries stay origin-relative.

import fs from "node:fs";
import path from "node:path";
import { resolveSrc } from "./galleryManifestUrls.js";

const ROOT = path.resolve(process.cwd(), "public/data/world/gallery");
const OUT = path.resolve(process.cwd(), "public/data/world/gallery-manifest.json");
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE ?? "";

function formatCaption(filename) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function readSafe(dir, type, subfolder) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .map((file) => ({
      type,
      src: resolveSrc(type, subfolder, file, R2_PUBLIC_BASE),
      caption: formatCaption(file),
    }));
}

const media = [
  ...readSafe(path.join(ROOT, "jpg"), "image", "jpg"),
  ...readSafe(path.join(ROOT, "mp4"), "video", "mp4"),
].map((m, i) => ({ id: i + 1, ...m }));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(media, null, 2));
console.log(`Wrote ${media.length} gallery items → ${path.relative(process.cwd(), OUT)} (R2 base: ${R2_PUBLIC_BASE || "(none, local paths)"})`);
