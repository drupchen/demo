/**
 * DOM-agnostic helpers for turning a text selection into note anchors.
 * Kept free of direct DOM API calls so they can be unit-tested in Node:
 * callers pass node-like objects ({ id, parentElement }).
 */

/**
 * Walk a node and its ancestors, returning the id of the nearest element whose
 * id is a syllable id (per the `isSylId` predicate), or null.
 */
export function closestSylId(node, isSylId) {
  let cur = node;
  while (cur) {
    if (cur.id && isSylId(cur.id)) return cur.id;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Normalize two anchor ids into document order using a sylId -> manifest index
 * map. Returns { startSylId, endSylId } with start <= end.
 */
export function orderAnchors(aId, bId, indexOf) {
  const ai = indexOf.get(aId) ?? 0;
  const bi = indexOf.get(bId) ?? 0;
  return ai <= bi
    ? { startSylId: aId, endSylId: bId }
    : { startSylId: bId, endSylId: aId };
}
