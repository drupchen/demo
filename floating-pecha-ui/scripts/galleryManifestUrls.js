// URL resolution for the gallery manifest: mp4 entries served from R2,
// jpg (and any other type) served from the deployed origin.
// Extracted from build-gallery-manifest.mjs to keep it unit-testable.

export function resolveSrc(type, subfolder, filename, r2Base) {
  const localPath = `/data/world/gallery/${subfolder}/${filename}`;
  if (type === "video" && r2Base) {
    return `${r2Base}/data/world/gallery/${subfolder}/${filename}`;
  }
  return localPath;
}
