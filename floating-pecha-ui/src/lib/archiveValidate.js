// Pure validation for uploaded archive data. No I/O — callers pass parsed JSON.

const SESSIONS_SUFFIX = "_compiled_sessions.json";
export const requiredInstanceFiles = (instanceId) => [
  "manifest.json",
  `${instanceId}${SESSIONS_SUFFIX}`,
];

/**
 * Validate one instance's manifest + compiled sessions.
 * Core rule: every syl_uuid referenced by a session must exist in the manifest.
 */
export function validateInstanceBundle({ instanceId, manifest, sessions }) {
  const errors = [];
  if (!Array.isArray(manifest)) errors.push("manifest.json must be a JSON array");
  else if (manifest.length === 0) errors.push("manifest.json is empty");
  if (!Array.isArray(sessions)) errors.push(`${instanceId}${SESSIONS_SUFFIX} must be a JSON array`);

  if (errors.length) return { ok: false, errors, segmentCount: 0, orphanCount: 0 };

  const ids = new Set(manifest.map((s) => s && s.id).filter(Boolean));
  let orphanCount = 0;
  const orphanSamples = [];
  for (const seg of sessions) {
    for (const u of seg.syl_uuids ?? []) {
      if (!ids.has(u)) {
        orphanCount++;
        if (orphanSamples.length < 5) orphanSamples.push(u);
      }
    }
  }
  if (orphanCount > 0) {
    errors.push(
      `${orphanCount} syl_uuid(s) reference syllables absent from manifest (e.g. ${orphanSamples.join(", ")})`
    );
  }
  return { ok: errors.length === 0, errors, segmentCount: sessions.length, orphanCount };
}

/** Validate catalog shape and extract per-instance access levels. */
export function validateCatalog(catalog) {
  const errors = [];
  if (!Array.isArray(catalog)) {
    return { ok: false, errors: ["catalog.json must be a JSON array"], instances: [] };
  }
  const instances = [];
  catalog.forEach((teaching, ti) => {
    const accessLevel = Number.isInteger(teaching?.Access_Level) ? teaching.Access_Level : 4;
    const teachingTitle = teaching?.Title_bo ?? "";
    const insts = teaching?.Instances ?? [];
    if (!Array.isArray(insts)) {
      errors.push(`teaching[${ti}].Instances must be an array`);
      return;
    }
    insts.forEach((inst, ii) => {
      const id = inst?.Instance_ID;
      if (!id) errors.push(`teaching[${ti}].Instances[${ii}] is missing Instance_ID`);
      else instances.push({ instanceId: id, accessLevel, teachingTitle });
    });
  });
  return { ok: errors.length === 0, errors, instances };
}
