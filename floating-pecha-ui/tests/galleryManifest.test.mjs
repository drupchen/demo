// Run: node tests/galleryManifest.test.mjs
// Unit tests for the URL resolution in build-gallery-manifest.mjs.
// (Pure function extracted so it can be tested without scanning the filesystem.)

import assert from "node:assert/strict";
import { resolveSrc } from "../scripts/galleryManifestUrls.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

test("jpg entries stay as local origin-relative paths", () => {
  assert.equal(
    resolveSrc("image", "jpg", "lh-bhutan.jpg", "https://pub-x.r2.dev"),
    "/data/world/gallery/jpg/lh-bhutan.jpg"
  );
});

test("mp4 entries get absolute R2 URLs when R2 base is set", () => {
  assert.equal(
    resolveSrc("video", "mp4", "puja.mp4", "https://pub-x.r2.dev"),
    "https://pub-x.r2.dev/data/world/gallery/mp4/puja.mp4"
  );
});

test("mp4 entries fall back to local path when R2 base is empty", () => {
  // Local dev without R2 configured: fall through to the old behaviour
  // so wrangler dev still works against bundled assets if anyone re-includes them.
  assert.equal(
    resolveSrc("video", "mp4", "puja.mp4", ""),
    "/data/world/gallery/mp4/puja.mp4"
  );
});

console.log(`\n${passed} passed`);
