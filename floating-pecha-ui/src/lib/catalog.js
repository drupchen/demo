// Pure helpers over the teaching catalog (array of teachings, each with
// Access_Level and Instances[].Instance_ID). Access_Level governs CONTENT access.
// Access is a TEACHING-level property: all Instances inherit it from their parent
// teaching, so filterCatalogByLevel returns whole teachings (all Instances included)
// and accessLevelForInstance returns the parent teaching's level.

function levelOf(teaching) {
  return Number.isInteger(teaching?.Access_Level) ? teaching.Access_Level : 4;
}

/** Access level required for an instance, or null if it is not in the catalog. */
export function accessLevelForInstance(catalog, instanceId) {
  if (!Array.isArray(catalog)) return null;
  for (const teaching of catalog) {
    for (const inst of teaching?.Instances ?? []) {
      if (inst?.Instance_ID === instanceId) return levelOf(teaching);
    }
  }
  return null;
}

/** Teachings the user may see (Access_Level <= userLevel). */
export function filterCatalogByLevel(catalog, userLevel) {
  if (!Array.isArray(catalog)) return [];
  const level = Number.isInteger(userLevel) ? userLevel : 0;
  return catalog.filter((t) => levelOf(t) <= level);
}

/**
 * Return a copy of the catalog with `instanceId` removed from whichever teaching
 * contains it; teachings left with no instances are dropped entirely. Used when
 * an admin deletes a published instance so it no longer appears in any listing.
 */
export function removeInstanceFromCatalog(catalog, instanceId) {
  if (!Array.isArray(catalog)) return [];
  return catalog
    .map((t) => ({
      ...t,
      Instances: (t.Instances ?? []).filter((i) => i?.Instance_ID !== instanceId),
    }))
    .filter((t) => (t.Instances ?? []).length > 0);
}
