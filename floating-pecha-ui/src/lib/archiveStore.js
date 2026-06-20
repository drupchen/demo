// R2 access for archive data (bucket bound as MEDIA). Keys:
//   archive/catalog.json
//   archive/<instanceId>/<file>
const PREFIX = "archive/";
export const CATALOG_KEY = `${PREFIX}catalog.json`;

export function archiveKey(instanceId, file) {
  return `${PREFIX}${instanceId}/${file}`;
}

export async function readCatalog(env) {
  const obj = await env.MEDIA.get(CATALOG_KEY);
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

export async function getArchiveObject(env, instanceId, file) {
  return env.MEDIA.get(archiveKey(instanceId, file));
}

export async function putArchiveText(env, instanceId, file, text) {
  await env.MEDIA.put(archiveKey(instanceId, file), text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function putCatalogText(env, text) {
  await env.MEDIA.put(CATALOG_KEY, text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

/** List published instances and the files present for each (from R2 listing). */
export async function listPublishedInstances(env) {
  const byInstance = new Map();
  let cursor;
  do {
    const res = await env.MEDIA.list({ prefix: PREFIX, cursor });
    for (const o of res.objects) {
      const rest = o.key.slice(PREFIX.length); // "<instanceId>/<file>" or "catalog.json"
      const slash = rest.indexOf("/");
      if (slash === -1) continue; // catalog.json — not an instance
      const instanceId = rest.slice(0, slash);
      const file = rest.slice(slash + 1);
      if (!byInstance.has(instanceId)) byInstance.set(instanceId, []);
      byInstance.get(instanceId).push(file);
    }
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor);
  return [...byInstance.entries()].map(([instanceId, files]) => ({ instanceId, files }));
}
