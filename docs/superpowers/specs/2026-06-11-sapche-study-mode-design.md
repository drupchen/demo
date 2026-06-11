# Sapche Study Mode (plein écran) — Design

**Date:** 2026-06-11
**Status:** Approved (option B retenue par Jérémy; à présenter au collègue après implémentation)
**Builds on:** `2026-05-21-reader-sapche-toc-design.md` (sidebar + inline markers, implemented)

## Goal

Tibetan scholars study and memorize the sapche itself — it is an object of study, not
just a navigation aid (insight from the colleague's `sapche_discovery` prototype, whose
"Consult" mode is a dedicated study workbench). The reader's existing sidebar stays the
light navigation surface; this feature adds a **fullscreen study view** of the sapche:
the tree alone, generous Tibetan typography, free expand/collapse, keyboard navigation,
and click-to-jump back into the text.

Deliberately **not** ported from the prototype (rationale discussed and agreed):

- The side-by-side tree+text workspace — redundant with the reader itself, heavy port
  (Vite/TS/Zustand, server-backed tree).
- The Bézier link line between tree node and text — needs two independently scrolled
  panes to be useful; the reader covers this with auto-track + active highlight.
- Notes / tags / suggestions — that data lives only in the prototype's DB; `sapche.json`
  has no such fields.

## UX

### Entry / exit

- A **⛶ expand button** in the `SapcheSidebar` header (next to collapse-all/expand-all/
  hide) opens the study view. Tooltip: "Study view".
- Exit: **✕ button** in the study header, or **Esc**. Closing restores the reader exactly
  as it was (scroll position untouched unless the user jumped).

### Layout

- Fullscreen fixed overlay (`position:fixed; inset:0`) above the reader (above navbar),
  reader cream background (`r-bg` family), no transparency games — it reads as a calm,
  dedicated room.
- Header bar: left — "ས་བཅད་ · Study" label (same style vocabulary as the sidebar
  header); right — expand-all, collapse-all, close buttons.
- Body: a **centered column** (max-width ~880px), vertically scrollable, the tree
  rendered as an indented outline:
  - Row = outline `number` (Inter, small, `#9a8f76`) + chevron (only if children) +
    `title` (Uchen).
  - **Typography scales down with depth**: depth 1 ≈ 30px, then 26/23/21/19, floor 18px.
    Ink color uses the existing `sapcheInkFor(depth)` ramp. Indentation per depth.
  - Generous line-height and row spacing — this is for contemplative reading aloud,
    not dense scanning.
- The **active section** (where the reader currently is) is highlighted with the same
  active treatment as the sidebar (soft red wash + inset bar) and scrolled into view
  (centered) when the view opens.

### Interaction

- **Click chevron** → toggle that node's collapse.
- **Click row** (number or title) → jump: close the overlay and teleport the reader to
  that section (reuse `handleSapcheSelect`).
- **Expand-all / collapse-all** buttons. Collapse-all + progressive re-opening is the
  memorization gesture ("what comes under this heading?") — this v1 supports it with
  plain collapse; a guided recitation/quiz mode is explicitly future work.
- **Keyboard navigation** (the "sibling navigation" of the prototype, generalized):
  - `↑` / `↓` — move focus between *visible* rows.
  - `←` — collapse the focused node (if expanded with children), else move to parent.
  - `→` — expand the focused node (if collapsed), else move to first child.
  - `Enter` — jump to the focused section (close + teleport).
  - `Esc` — close.
  - Focused row gets a visible focus ring; focus starts on the active section.

### Collapse state

The study view keeps its **own collapse set**, independent of the sidebar's. The
sidebar's collapse state is auto-managed by active-section tracking (it prunes to the
active path on every scroll) — that behavior would fight free exploration. The study
set starts **all-expanded each time the view opens** (simple, predictable; revisit if
users want persistence).

## Architecture

New component `floating-pecha-ui/src/app/reader/SapcheStudyView.js`:

```
props: {
  roots,        // sapche.roots (same as SapcheSidebar)
  activeId,     // activeSectionId from the reader
  onSelect,     // (node) => void — caller closes the view and teleports
  onClose,      // () => void
}
internal state: collapsed (Set), focusedId (string)
```

- Pure client component, no data fetching — same data flow as `SapcheSidebar`.
- Renders `null`-guarded by the caller (`studyOpen && sapche`).
- Flattens the tree to a *visible rows* list (respecting `collapsed`) for keyboard
  navigation; renders recursively like `SapcheSidebar.Row`.
- `useEffect` on mount: keydown listener (Esc/arrows/Enter), scroll active row into
  view, move focus into the dialog; cleanup on unmount. `role="dialog"`,
  `aria-modal="true"`, focus restored to the expand button on close.

Reader page (`page.js`) changes — minimal:

- `const [studyOpen, setStudyOpen] = useState(false)`
- Pass `onExpand={() => setStudyOpen(true)}` to `SapcheSidebar` (new header button).
- Render `{studyOpen && sapche && <SapcheStudyView roots={sapche.roots}
  activeId={activeSectionId} onSelect={(node) => { setStudyOpen(false);
  handleSapcheSelect(node); }} onClose={() => setStudyOpen(false)} />}`.

`SapcheSidebar.js`: one new header icon button (`onExpand` prop), same `r-toc-iconbtn`
style.

Styles: new `r-study-*` classes in `reader.css`, reusing the existing warm-ink
vocabulary (`#9a8f76` metadata, `#8B1D1D` active/hover accents, hairline `#d9cfb0`).
Font sizes per depth via a small JS map in the component (mirrors `sapcheInkFor`
usage), not new theme tokens — sizes are study-view-specific presentation.

## Edge cases

- **No `sapche.json`** → no sidebar → no entry point. Nothing to do.
- **Very deep nodes (depth > 6)** → font floor 18px, ink ramp already capped.
- **Active section is null** (top of document) → open with focus on the first root
  section, no highlight.
- **Tiny screens** → the overlay is fullscreen anyway; the column padding shrinks
  (CSS only, no separate mobile layout).
- **Reader keyboard shortcuts** — the overlay's keydown handler stops propagation so
  arrows don't scroll the reader behind it.

## Testing

Project has no JS test harness for the reader (all manual so far) — keep that
convention:

- Manual end-to-end on `drime_shalung_1` under `npm run dev:cf`: open from sidebar,
  typography/indent/ink per depth, expand/collapse (row + all), keyboard nav including
  Enter-jump and Esc, click-jump lands on the right section with sidebar active row
  synced, reopen shows active section highlighted, no scroll bleed-through.

## Out of scope (future)

- Recitation / self-quiz mode (collapse-all + guided progressive reveal, hide titles
  show numbers). The study view is the platform for it.
- Persistence of study collapse state.
- Side-by-side tree+text mode (option C) — revisit after the colleague's feedback.
- Enriching `sapche.json` with notes/annotations from the prototype's DB.

---

## Iteration 2 — depth accents, previews, prominence (2026-06-11)

After comparing with the `sapche_discovery` prototype, Jérémy approved importing
these elements (and explicitly rejected text previews under titles in the tree,
semantic text tags, and per-section notes):

1. **Depth-accent colors** — the prototype's 10-hue Tailwind-300 palette
   (`sapcheAccent` in `theme.js`), drawn as a left accent bar per row.
   *Full strength in the study view* (no commentary bars there — the colour
   channel is free) and **desaturated (45 % opacity, 3 px) in the reader's ToC
   sidebar**. The original "no hue for sapche" rule still holds inside the text
   itself: inline section markers stay neutral, commentary colours keep
   exclusive use of the margin.
2. **Sibling-navigation pills** — ↑/↓ buttons revealed on row hover in the study
   view; previous/next sibling with fallback to the parent at boundaries
   (prototype gutter-pill semantics). Keyboard equivalents already existed.
3. **Section text preview popover** — hover a study row (450 ms delay) or press
   **Space** on the focused row to peek at the section's first ~220 characters
   without leaving the study view (this replaces the prototype's Bézier
   link-to-text). Sticky when opened with Space: follows arrow navigation;
   Esc dismisses the popover first, the view second. Excerpts are computed in
   `page.js` from the manifest between each node's anchor syllables, skipping
   `{…}` session markers.
4. **Prominent entry point** — a labelled **Study** button in the reader navbar
   next to Contents (shown when a sapche exists), in addition to the sidebar ⛶.

Later the same day (after review with Jérémy): outline **numbers are hidden
everywhere** for now (numbering style undecided; `node.number` still drives
internal logic) and the **ink depth-ramp was dropped** — one `sapcheInk` colour
for all titles, depth being carried by indentation, type size and accent bars.

### Iteration 3 — pills earn their place + breadcrumb

- A sibling pill is rendered only when its jump target is **≥ 5 visible rows
  away** (`SIBLING_JUMP_MIN_ROWS`) — adjacent siblings don't need a button, the
  pills' real job is leaping over big expanded subtrees. No more disabled state:
  a pill is either useful or absent.
- A **sticky breadcrumb** under the study header shows the ancestor chain of
  the topmost visible row (same "current section" convention as the reader's
  scroll tracking, offset > the rows' 80px scroll-margin). Each crumb has its
  depth-accent dot, truncates long titles, and clicking it jumps back up.
