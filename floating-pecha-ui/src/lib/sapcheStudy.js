// Pure helpers for the sapche study view (fullscreen ToC).
// Extracted so keyboard navigation can be unit-tested with node
// (see tests/sapcheStudy.test.mjs).

/**
 * Depth-first walk of the visible tree — children of collapsed nodes are
 * skipped. Returns the rows in render order plus a child-id → parent-node
 * map used by ArrowLeft navigation.
 */
export function flattenVisibleRows(topNodes, collapsedIds) {
  const rows = [];
  const parentOf = new Map();
  const walk = (nodes, parent) => {
    for (const n of nodes) {
      if (parent) parentOf.set(n.id, parent);
      rows.push(n);
      if (!collapsedIds.has(n.id)) walk(n.children || [], n);
    }
  };
  walk(topNodes, null);
  return { rows, parentOf };
}

/** Every node id that has at least one child — the "collapse all" target set. */
export function collectCollapsibleIds(topNodes) {
  const ids = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      const kids = n.children || [];
      if (kids.length) ids.push(n.id);
      walk(kids);
    }
  };
  walk(topNodes);
  return ids;
}
