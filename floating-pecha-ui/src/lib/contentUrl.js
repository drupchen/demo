// Build a URL for the access-checked archive content API. Used by the reader and
// the transcription hook in place of the old static /data/archive/... paths.
export function contentUrl(instanceId, file) {
  return `/api/content/${encodeURIComponent(instanceId)}/${encodeURIComponent(file)}`;
}
