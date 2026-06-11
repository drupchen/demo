# Sapche Study Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fullscreen "study view" of the sapche (table of contents) in the reader — tree only, large Tibetan typography, free expand/collapse, keyboard navigation, click-to-jump.

**Architecture:** A new client component `SapcheStudyView` rendered as a fixed fullscreen overlay by the reader page, fed the same `sapche.roots` / `activeSectionId` / teleport callback as the existing `SapcheSidebar`. Pure tree-flattening helpers live in `src/lib/sapcheStudy.js` (node-testable, per project convention). Entry point is a new ⛶ button in the sidebar header.

**Tech Stack:** Next.js 16 (App Router, client components, plain JS — no TS), Tailwind 4 + handwritten `reader.css` classes, node test scripts (`npm test`).

**Spec:** `docs/superpowers/specs/2026-06-11-sapche-study-mode-design.md`

**Working directory for all commands:** `floating-pecha-ui/`

**Branch:** `feature/sapche-study-mode` (already created; spec committed on it)

Context for an engineer new to this codebase:

- The reader page is `src/app/reader/page.js`. It fetches `public/data/archive/{instance}/sapche.json` into `sapche` state, derives `activeSectionId` from scroll, and owns `handleSapcheSelect(node)` which teleports the text to a section (robust against lazy-rendered paragraphs). The light ToC sidebar is `src/app/reader/SapcheSidebar.js`.
- `sapche.json` shape: `{ roots: [ { id, title, number, depth, part, startSylId, children: [...] } ] }`. `roots[0]` is the document root (its `number` is `""`); real sections are its descendants. `depth` starts at 1 for top-level sections.
- Visual vocabulary (reuse, do not invent): warm metadata brown `#9a8f76`, active/hover red `#8B1D1D`, hairline `#e0dccf`/`#d9cfb0`, header cream `#F2EFE8`, ink-by-depth ramp `sapcheInkFor(depth)` from `src/lib/theme.js`, fonts `uchen` (Tibetan) / `inter` (Latin) from the same module. Existing CSS classes `r-toc-iconbtn`, `r-toc-chevron`, `r-toc-chevron-spacer` in `src/app/reader/reader.css` are reused.
- Test convention: pure logic extracted to `src/lib/*.js`, tested by standalone node scripts `tests/*.test.mjs` (see `tests/audioSeek.test.mjs` for the pattern). No React component test harness — components are verified manually. `npm test` runs every `tests/*.test.mjs`.

---

### Task 1: Pure tree helpers (`flattenVisibleRows`, `collectCollapsibleIds`)

**Files:**
- Create: `floating-pecha-ui/src/lib/sapcheStudy.js`
- Test: `floating-pecha-ui/tests/sapcheStudy.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `floating-pecha-ui/tests/sapcheStudy.test.mjs`:

```js
// Run: node tests/sapcheStudy.test.mjs
// Unit tests for src/lib/sapcheStudy.js — visible-row flattening and
// collapse-all collection for the study view's keyboard navigation.

import assert from "node:assert/strict";
import { collectCollapsibleIds, flattenVisibleRows } from "../src/lib/sapcheStudy.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const tree = [
  {
    id: "1",
    children: [
      { id: "1.1", children: [] },
      { id: "1.2", children: [{ id: "1.2.1", children: [] }] },
    ],
  },
  { id: "2", children: [] },
];

test("expanded tree flattens depth-first in render order", () => {
  const { rows } = flattenVisibleRows(tree, new Set());
  assert.deepEqual(rows.map((r) => r.id), ["1", "1.1", "1.2", "1.2.1", "2"]);
});

test("children of a collapsed node are hidden, the node itself stays", () => {
  const { rows } = flattenVisibleRows(tree, new Set(["1.2"]));
  assert.deepEqual(rows.map((r) => r.id), ["1", "1.1", "1.2", "2"]);
});

test("collapsing an ancestor hides the whole subtree", () => {
  const { rows } = flattenVisibleRows(tree, new Set(["1"]));
  assert.deepEqual(rows.map((r) => r.id), ["1", "2"]);
});

test("parentOf maps children to their parent node; top-level nodes have no entry", () => {
  const { parentOf } = flattenVisibleRows(tree, new Set());
  assert.equal(parentOf.get("1.2.1").id, "1.2");
  assert.equal(parentOf.get("1.1").id, "1");
  assert.equal(parentOf.get("1"), undefined);
});

test("missing children property is treated as a leaf", () => {
  const { rows } = flattenVisibleRows([{ id: "a" }], new Set());
  assert.deepEqual(rows.map((r) => r.id), ["a"]);
});

test("collectCollapsibleIds returns exactly the nodes with children", () => {
  assert.deepEqual(collectCollapsibleIds(tree).sort(), ["1", "1.2"]);
});

console.log(`sapcheStudy: ${passed} tests passed`);
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `floating-pecha-ui/`): `node tests/sapcheStudy.test.mjs`
Expected: FAIL with `Cannot find module ... src/lib/sapcheStudy.js`

- [ ] **Step 3: Write the implementation**

Create `floating-pecha-ui/src/lib/sapcheStudy.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/sapcheStudy.test.mjs`
Expected: 6 `ok - …` lines then `sapcheStudy: 6 tests passed`

Also run the whole suite to check nothing else broke: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add tests/sapcheStudy.test.mjs src/lib/sapcheStudy.js
git commit -m "feat(reader): pure tree helpers for sapche study view"
```

---

### Task 2: Study view styles

**Files:**
- Modify: `floating-pecha-ui/src/app/reader/reader.css` (append after the `.r-toc-iconbtn:hover` rule, i.e. after the "Sidebar tree" block around line 271)

- [ ] **Step 1: Add the CSS**

Append this block right after the `.r-toc-iconbtn:hover { … }` line:

```css
/* --- Sapche study view (fullscreen) --- */
/* z-index above everything in the reader: MiniPlayer is z-[70], SearchBar z-[55]. */
.r-study-overlay { position:fixed; inset:0; z-index:100; display:flex; flex-direction:column;
  background:var(--reader-bg, #F9F9F7); outline:none; }
.r-study-header { display:flex; align-items:center; justify-content:space-between;
  padding:14px 24px; background:#F2EFE8; border-bottom:1px solid #e0dccf; }
.r-study-body { flex:1; overflow-y:auto; overscroll-behavior:contain; padding:40px 24px 30vh; }
.r-study-col { max-width:880px; margin:0 auto; }
.r-study-row { display:flex; align-items:center; gap:12px; padding:8px 12px; cursor:pointer;
  border-radius:6px; scroll-margin-block:80px; }
.r-study-row:hover { background:rgba(0,0,0,0.04); }
.r-study-row-active { background:rgba(139,29,29,0.07); box-shadow:inset 3px 0 0 #8B1D1D; }
.r-study-row-focused { outline:2px solid rgba(139,29,29,0.45); outline-offset:-2px; }
.r-study-num { font-size:13px; color:#9a8f76; min-width:52px; text-align:right; }
.r-study-title { line-height:1.7; }
.r-study-chevron { font-size:15px; }
@media (max-width: 640px) {
  .r-study-body { padding:24px 10px 30vh; }
  .r-study-num { min-width:36px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/reader/reader.css
git commit -m "feat(reader): styles for fullscreen sapche study view"
```

---

### Task 3: `SapcheStudyView` component

**Files:**
- Create: `floating-pecha-ui/src/app/reader/SapcheStudyView.js`

- [ ] **Step 1: Write the component**

Create `floating-pecha-ui/src/app/reader/SapcheStudyView.js`:

```js
"use client";
// Fullscreen sapche study view — the sapche is an object of study in its own
// right (scholars memorize the outline), so this renders the tree alone with
// generous Tibetan type, free expand/collapse, and keyboard navigation.
// Spec: docs/superpowers/specs/2026-06-11-sapche-study-mode-design.md
import { inter, sapcheInkFor, uchen } from "@/lib/theme";
import { collectCollapsibleIds, flattenVisibleRows } from "@/lib/sapcheStudy";
import { useEffect, useMemo, useRef, useState } from "react";

const STUDY_SIZES = [30, 26, 23, 21, 19]; // uchen px for depth 1..5; deeper → 18
const studySizeFor = (depth) =>
  depth >= 6 ? 18 : STUDY_SIZES[Math.max(depth, 1) - 1];

function StudyRow({ node, collapsed, activeId, focusedId, onToggle, onSelect }) {
  const kids = node.children || [];
  const isCollapsed = collapsed.has(node.id);
  return (
    <>
      <div
        id={`study-${node.id}`}
        className={`r-study-row ${activeId === node.id ? "r-study-row-active" : ""} ${
          focusedId === node.id ? "r-study-row-focused" : ""
        }`}
        style={{ paddingLeft: (node.depth - 1) * 28 }}
        onClick={() => onSelect(node)}
      >
        <span className={`${inter.className} r-study-num`}>{node.number}</span>
        {kids.length > 0 ? (
          <button
            type="button"
            className="r-toc-chevron r-study-chevron"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            aria-label={isCollapsed ? "Expand section" : "Collapse section"}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="r-toc-chevron-spacer" />
        )}
        <span
          className={`${uchen.className} r-study-title`}
          style={{ color: sapcheInkFor(node.depth), fontSize: studySizeFor(node.depth) }}
        >
          {node.title}
        </span>
      </div>
      {!isCollapsed &&
        kids.map((c) => (
          <StudyRow
            key={c.id}
            node={c}
            collapsed={collapsed}
            activeId={activeId}
            focusedId={focusedId}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export default function SapcheStudyView({ roots, activeId, onSelect, onClose }) {
  const top = useMemo(() => roots[0]?.children || [], [roots]); // skip the document root
  const [collapsed, setCollapsed] = useState(() => new Set()); // all expanded on open
  const [focusedId, setFocusedId] = useState(() => activeId || top[0]?.id || null);
  const overlayRef = useRef(null);

  const { rows, parentOf } = useMemo(
    () => flattenVisibleRows(top, collapsed),
    [top, collapsed]
  );

  const onToggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const onCollapseAll = () => setCollapsed(new Set(collectCollapsibleIds(top)));
  const onExpandAll = () => setCollapsed(new Set());

  // On open: take keyboard focus and show the current reading position.
  // On close: hand focus back to whatever had it (the sidebar's ⛶ button).
  useEffect(() => {
    const prevFocus = document.activeElement;
    overlayRef.current?.focus();
    const target = activeId || top[0]?.id;
    if (target)
      document.getElementById(`study-${target}`)?.scrollIntoView({ block: "center" });
    return () => prevFocus?.focus?.();
    // Mount-only: the view re-mounts on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the keyboard-focused row in view.
  useEffect(() => {
    if (!focusedId) return;
    document.getElementById(`study-${focusedId}`)?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const idx = rows.findIndex((n) => n.id === focusedId);
    const node = idx >= 0 ? rows[idx] : null;
    const focusRow = (i) => {
      const t = rows[Math.min(Math.max(i, 0), rows.length - 1)];
      if (t) setFocusedId(t.id);
    };
    switch (e.key) {
      case "ArrowDown":
        focusRow(idx < 0 ? 0 : idx + 1);
        break;
      case "ArrowUp":
        focusRow(idx < 0 ? 0 : idx - 1);
        break;
      case "ArrowLeft": {
        if (!node) return;
        const kids = node.children || [];
        if (kids.length && !collapsed.has(node.id)) onToggle(node.id);
        else if (parentOf.get(node.id)) setFocusedId(parentOf.get(node.id).id);
        break;
      }
      case "ArrowRight": {
        if (!node) return;
        const kids = node.children || [];
        if (!kids.length) return;
        if (collapsed.has(node.id)) onToggle(node.id);
        else setFocusedId(kids[0].id);
        break;
      }
      case "Enter":
        if (node) onSelect(node);
        break;
      default:
        return; // let unhandled keys through untouched
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={overlayRef}
      className="r-study-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sapche study view"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className={`${inter.className} r-study-header`}>
        <span className="uppercase tracking-[0.12em]" style={{ color: "#9a8f76" }}>
          <span className="text-[11px]">Study · </span>
          <span className={`${uchen.className} text-[15px] tracking-normal align-middle`}>
            ས་བཅད་
          </span>
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onCollapseAll}
            title="Collapse all"
            aria-label="Collapse all"
          >
            ⊟
          </button>
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onExpandAll}
            title="Expand all"
            aria-label="Expand all"
          >
            ⊞
          </button>
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close study view"
          >
            ✕
          </button>
        </span>
      </div>
      <div className="r-study-body">
        <div className="r-study-col">
          {top.map((n) => (
            <StudyRow
              key={n.id}
              node={n}
              collapsed={collapsed}
              activeId={activeId}
              focusedId={focusedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run (from `floating-pecha-ui/`): `npx eslint src/app/reader/SapcheStudyView.js`
Expected: no errors (warnings about the intentional `eslint-disable` line are fine).

- [ ] **Step 3: Commit**

```bash
git add src/app/reader/SapcheStudyView.js
git commit -m "feat(reader): fullscreen sapche study view component"
```

---

### Task 4: Entry button + reader page wiring

**Files:**
- Modify: `floating-pecha-ui/src/app/reader/SapcheSidebar.js` (header buttons, ~line 86; props, ~line 59)
- Modify: `floating-pecha-ui/src/app/reader/page.js` (import ~line 23; state near other UI state; `SapcheSidebar` props ~line 1300; overlay render right after `</ReaderLayout>`)

- [ ] **Step 1: Add the ⛶ button to `SapcheSidebar`**

In `SapcheSidebar.js`, add `onExpand` to the destructured props:

```js
export default function SapcheSidebar({
  roots,
  activeId,
  collapsedIds,
  onToggleCollapse,
  onSelect,
  onExpandAll,
  onCollapseAll,
  onHide,
  onExpand,
}) {
```

Then inside `<span className="flex items-center gap-0.5">`, add this button **before** the collapse-all button:

```jsx
          <button
            type="button"
            className="r-toc-iconbtn"
            onClick={onExpand}
            title="Study view"
            aria-label="Open study view"
          >
            ⛶
          </button>
```

- [ ] **Step 2: Wire the reader page**

In `page.js`:

1. Add the import next to the existing `import SapcheSidebar from "./SapcheSidebar";`:

```js
import SapcheStudyView from "./SapcheStudyView";
```

2. Add state next to the existing `tocOpen` state declaration (search for `setTocOpen`):

```js
  const [studyOpen, setStudyOpen] = useState(false);
```

3. Add the prop to the `<SapcheSidebar … />` element (inside `leftSidebar={sapche ? (…)}`):

```jsx
            onExpand={() => setStudyOpen(true)}
```

4. Render the overlay **immediately after the closing `</ReaderLayout>` tag** (still inside `<main>`, so the theme CSS variables apply):

```jsx
      {studyOpen && sapche && (
        <SapcheStudyView
          roots={sapche.roots}
          activeId={activeSectionId}
          onSelect={(node) => {
            setStudyOpen(false);
            handleSapcheSelect(node);
          }}
          onClose={() => setStudyOpen(false)}
        />
      )}
```

- [ ] **Step 3: Lint**

Run: `npx eslint src/app/reader/SapcheSidebar.js src/app/reader/page.js`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/reader/SapcheSidebar.js src/app/reader/page.js
git commit -m "feat(reader): open sapche study view from the ToC sidebar"
```

---

### Task 5: Manual end-to-end verification (browser)

**Files:** none (verification only; fix-and-commit if issues found)

- [ ] **Step 1: Start the dev server**

From `floating-pecha-ui/`: `npm run dev` (background). The reader only reads static
JSON from `public/data/`, so plain `next dev` on port 3000 suffices — no auth/D1
needed. Requires `public/data/archive/drime_shalung_1/` to exist locally (it does on
this machine; it is gitignored data).

- [ ] **Step 2: Verify in a real browser (Playwright MCP or manual)**

Open `http://localhost:3000/reader?instance=drime_shalung_1` and check:

1. The ToC sidebar header shows a ⛶ button; clicking it opens a fullscreen overlay
   covering navbar, text, and mini-player.
2. Typography: top-level sections largest (~30px), deeper sections smaller and
   darker ink; rows indent per depth; numbers right-aligned in a narrow column.
3. The section where the reader currently is carries the red active wash and the
   view opens scrolled to it (centered).
4. Chevron click collapses/expands one node; header ⊟/⊞ collapse/expand everything.
5. Keyboard: ↓/↑ move a visible focus ring through rows; ← collapses or goes to
   parent; → expands or enters first child; Enter closes the overlay and the text
   lands on that section (sidebar active row syncs); Esc closes with the reader
   scroll untouched.
6. Clicking a row title does the same as Enter.
7. Wheel-scrolling at the overlay's end does not scroll the reader behind it.
8. Reopening after a jump highlights the new active section.

- [ ] **Step 3: Fix anything found, re-verify, commit fixes**

Each fix is its own small commit (`fix(reader): …`).

- [ ] **Step 4: Full test suite + final lint**

```bash
npm test
npx eslint src/app/reader/ src/lib/sapcheStudy.js
```

Expected: all tests pass, no lint errors.
