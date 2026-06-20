// Pure browser-side parsing of an uploaded archive ZIP, plus per-instance
// validation row building. Extracted from the upload UI so it can be unit-tested
// against real ZIP bytes (no React / no "@/" alias).
import { unzipSync, strFromU8 } from "fflate";
import { validateInstanceBundle, validateCatalog, requiredInstanceFiles } from "./archiveValidate.js";

function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }

/**
 * Parse a ZIP into { catalogText, instances: Map<id, {files:{name:text}}> }.
 *
 * Handles three shapes:
 *  - a full `output/` snapshot:      output/catalog.json, output/<id>/manifest.json …
 *  - a single instance folder:       <id>/manifest.json, <id>/sapche.json …
 *  - already-stripped contents:      catalog.json, <id>/manifest.json …
 *
 * A single common top-level folder is a wrapper (and is removed) ONLY if it does
 * not itself contain a manifest.json directly — i.e. it is not an instance folder.
 * This keeps a single-instance folder intact (even when it has sessions/ or
 * session_logs/ subdirs) while still unwrapping a real `output/` directory.
 */
export function parseZip(uint8) {
  const entries = unzipSync(uint8);
  const paths = Object.keys(entries).filter((p) => !p.endsWith("/"));

  let strip = "";
  const tops = new Set(paths.map((p) => p.split("/")[0]));
  if (tops.size === 1 && paths.every((p) => p.includes("/"))) {
    const top = `${[...tops][0]}/`;
    const topIsInstance = paths.includes(`${top}manifest.json`);
    if (!topIsInstance) strip = top;
  }

  let catalogText = null;
  const instances = new Map();
  for (const p of paths) {
    const rel = strip && p.startsWith(strip) ? p.slice(strip.length) : p;
    const text = strFromU8(entries[p]);
    if (rel === "catalog.json") { catalogText = text; continue; }
    const slash = rel.indexOf("/");
    if (slash === -1) continue; // a flat file with no instance folder — skip
    const instanceId = rel.slice(0, slash);
    const name = rel.slice(slash + 1);
    if (name.includes("/")) continue; // ignore nested dirs (sessions/, session_logs/)
    if (!instances.has(instanceId)) instances.set(instanceId, { files: {} });
    instances.get(instanceId).files[name] = text;
  }
  return { catalogText, instances };
}

/**
 * Build per-instance validation rows. Two modes:
 *  - snapshot: ZIP has catalog.json → levels/titles come from it; catalog is
 *    replaced on publish.
 *  - instance: no catalog.json → update of already-published teachings; levels/
 *    titles come from `publishedMeta` (Map id -> {accessLevel, teachingTitle});
 *    the catalog is untouched and instances unknown to it are rejected.
 */
export function buildRows(parsed, publishedMeta) {
  const hasCatalog = !!parsed.catalogText;
  let catalogValid, catalogErrors, metaById;
  if (hasCatalog) {
    const cat = safeParse(parsed.catalogText);
    const catV = cat
      ? validateCatalog(cat)
      : { ok: false, errors: ["catalog.json illisible (JSON invalide)"], instances: [] };
    catalogValid = catV.ok;
    catalogErrors = catV.errors;
    metaById = new Map(catV.instances.map((i) => [i.instanceId, i]));
  } else {
    catalogValid = true;
    catalogErrors = [];
    metaById = publishedMeta;
  }

  const rows = [];
  for (const [instanceId, { files }] of parsed.instances) {
    const missing = requiredInstanceFiles(instanceId).filter((n) => typeof files[n] !== "string");
    let verdict;
    if (missing.length) {
      verdict = { ok: false, errors: [`Fichiers manquants: ${missing.join(", ")}`] };
    } else {
      const manifest = safeParse(files["manifest.json"]);
      const sessions = safeParse(files[`${instanceId}_compiled_sessions.json`]);
      verdict = (manifest && sessions)
        ? validateInstanceBundle({ instanceId, manifest, sessions })
        : { ok: false, errors: ["JSON invalide dans manifest/sessions"] };
    }
    const meta = metaById.get(instanceId);
    rows.push({
      instanceId, files,
      accessLevel: meta ? meta.accessLevel : null,
      teachingTitle: meta ? meta.teachingTitle : "",
      known: !!meta,
      verdict,
      status: "pending",
    });
  }
  return { hasCatalog, catalogText: parsed.catalogText, catalogValid, catalogErrors, rows };
}
