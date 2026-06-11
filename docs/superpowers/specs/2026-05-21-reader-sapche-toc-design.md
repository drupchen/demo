# Reader Sapche (Table of Contents) — Design

**Date:** 2026-05-21
**Status:** Approved design, pending implementation plan
**First text:** `drime_shalung_1` (sapche source: `docs/export-4.json`)

## Goal

Add a *sapche* (ས་བཅད་, the traditional outline / table of contents) to the reader so a
scholar can see a text's structure and jump to any section. Two surfaces, driven by the
same data:

1. A **left sidebar** showing the section tree — collapsible, resizable, and auto-tracking
   the reading position. Clicking a section **teleports** (instant jump) to it.
2. **Inline section markers** in the main text: a quiet horizontal divider that introduces
   each section with its number and title.

## Background

- The reader ("Floating Pecha") renders a text as syllables; every syllable has a UUID
  (`manifest.json`). Navigation is by syllable UUID (`scrollToSyllable`).
- A colleague's tool produces a sapche export (`export-N.json`) whose section nodes anchor
  to **character offsets** into a plain text string (`original_text`), not syllable UUIDs.
- The export's text and the manifest are the **same text** but not byte-identical: the
  manifest carries 89 audio-session markers (`{051 …}`, 2,759 chars) and some extra
  newlines/whitespace. So a section's "character 118" is a different position in the
  manifest. A mapping step is required. (Validated: a tolerant two-pointer alignment that
  skips markers + whitespace lands exactly — char 118→syllable #38, 628→#212, 22176→#6352.)
- Existing reader pieces this builds on:
  - `ReaderLayout` — main scroll area + one right `aside` (Player/Info), toggle.
  - `LazyParagraph` — paragraphs render lazily via IntersectionObserver; each syllable is a
    `<span id={uuid}>`.
  - `scrollToSyllable(sylId, paragraphs, instant)` — already supports instant teleport and
    not-yet-rendered (lazy) paragraphs.
  - **Commentary colors** — `COMMENTARY_COLORS` (gold/blue/red/green/purple) mark which
    commentary covers each run, drawn as thin **vertical bars in the left margin** of the
    text and in the bottom coverage bar (`MiniPlayer`). This color channel is load-bearing
    and is reserved for commentaries.

## Key decisions

- **Anchoring happens in the data pipeline.** A Python script aligns offsets → syllable
  UUIDs once and writes a per-instance `sapche.json`. The frontend consumes UUID anchors
  only. (Revisit later whether the colleague's tool can emit UUIDs directly.)
- **Color is reserved for commentaries.** The sapche is *structural*, drawn in neutral warm
  ink — no hue. This avoids a direct clash (sapche markers and commentary bars would
  otherwise share the left margin and the gold/red hues).
- **Depth is shown three ways, none of them hue:** the section **number** (exact level),
  **ink darkness** (deeper = darker, capped ~L7), and **indentation** (sidebar only).
- **All sections render inline** (full sapche fidelity); markers are quiet enough to allow it.
- **The sidebar carries the hierarchy**; inline markers are "you are here" waypoints.

## Data model

### Input — `export-N.json` (colleague's tool)
`roots`: a tree of nodes. Relevant fields per node: `id`, `title`, `original_start`,
`original_end` (char offsets; may be `null` for structural-only nodes), `children`.

### Output — `public/data/archive/{instance}/sapche.json`
A tree anchored to syllables, plus precomputed presentation fields:

```json
{
  "instance_id": "drime_shalung_1",
  "roots": [
    {
      "id": "…",
      "title": "གཞུང་གི་དོན།",
      "number": "2",          // outline number from tree position
      "depth": 1,             // 0 = document root
      "part": 2,              // 1=intro, 2=main, 3=conclusion (top-level index)
      "startSylId": "973b477b-…",   // first syllable of the section
      "endSylId": "…",              // last syllable (optional; for highlight range)
      "children": [ … ]
    }
  ]
}
```

- `number` is the dotted outline path (Arabic: `2.2.1`). `part` is the first path segment.
- Structural-only nodes (`original_start == null`) inherit `startSylId` from their first
  descendant that has a span.

## Components

### 1. Pipeline — alignment script (`prepare_data/sapche_align.py`)
Inputs: an `export-N.json` and the target instance id (manual pairing for now; the
`document_id` is not yet a reliable join key — flagged as an assumption).

Steps:
1. Load the instance `manifest.json`. Build the cleaned syllable stream: concatenate
   `text` of every syllable **except** brace-markers (`{…}`), recording, per character,
   the owning syllable UUID.
2. Two-pointer alignment of cleaned-manifest-text against the export `original_text`,
   tolerant of whitespace differences (advance past whitespace on either side).
3. For each node: map `original_start` → `startSylId` (skip leading whitespace to land on a
   real syllable), `original_end` → `endSylId`.
4. Compute `number`, `depth`, `part` from tree position. Resolve null-span nodes from
   descendants.
5. Write `sapche.json`. Validate: every mapped offset lands on an existing syllable; emit a
   warning (don't crash) for any node that fails to map, and omit its anchor.

Document the script in `CLAUDE.md`'s data-pipeline section.

### 2. Frontend — data loading
On the reader page, fetch `sapche.json` for the instance alongside manifest/sessions. If it
is absent, the feature is simply not shown (no sidebar toggle, no inline markers).

### 3. Frontend — `ReaderLayout` update
Add a **left** `aside` mirroring the existing right one: independently toggled, **resizable**
via a drag handle on its right edge (default width ~280px, persisted in component state),
**open by default** on desktop. Both panels may be open at once on wide screens.

### 4. Frontend — ToC sidebar component
- Renders the `sapche.json` tree as a collapsible indented list. Row = `number` + `title`,
  title ink darkening with depth; chevron to expand/collapse; **expand-all / collapse-all**
  in the header.
- **Click a row → teleport**: `scrollToSyllable(node.startSylId, paragraphs, true)`.
- **Auto-track**: subscribe to the existing root-text scroll; the active section is the
  deepest node whose `startSylId` is at or above the viewport top. Highlight it (gold
  accent — a UI selection state, not a data color), auto-expand its ancestors, and scroll
  the tree so it's visible.

### 5. Frontend — inline section markers
- Build a lookup `startSylId → [nodes]` from the tree.
- In `LazyParagraph`, when about to render a syllable that is a section start, emit a
  **block marker** before it. Markers are horizontal dividers: `number` + `title` (warm
  ink, darker with depth) + a hairline rule extending to the right. **No left color bar**
  (reserved for commentary), **no preview text**.
- A syllable that starts several nested sections (parent + first child + …) renders one
  marker per section, **shallowest first**, so the nesting visibly opens.
- The marker is block-level and intentionally breaks the inline Tibetan flow at the section
  boundary (this is the "new line that acts as a section title" the design calls for).

### 6. Theme
Add a warm-neutral **ink depth ramp** to `theme.js` (e.g. L1 `#9a9082` → L7+ `#2a2620`) and
a hairline-rule token. No new hues.

## Data flow

```
export-N.json + manifest.json  ──(pipeline align)──▶  sapche.json   [committed with instance data]
sapche.json ──(reader load)──▶ tree + startSylId→nodes map
   ├─▶ ToC sidebar (render tree, click→scrollToSyllable, scroll→active section)
   └─▶ inline markers (rendered inside LazyParagraph at section starts)
```

## Edge cases & error handling

- **No `sapche.json`** for an instance → no sidebar, no markers. Other instances unaffected.
- **Null-span / structural nodes** → anchor to first descendant with a span.
- **One syllable starts multiple sections** → stack markers shallowest-first.
- **Node offset fails to align** (pipeline) → warn, omit that anchor; the node still shows
  in the tree pointing at its nearest resolvable ancestor's syllable.
- **Long outline numbers** at deep levels → render the full dotted path (accepted); ink
  conveys depth at a glance.
- **Commentary independence** → sapche is text-structural and unrelated to commentary
  coverage; the two never share a visual channel.

## Testing

- **Pipeline (pytest):** marker stripping; whitespace-tolerant alignment; offset→syllable
  correctness on known fixtures (char 118→#38, 628→#212, 22176→#6352 for drime_shalung_1);
  null-span resolution; outline numbering/part assignment.
- **Frontend:** sidebar renders from `sapche.json`; clicking a row teleports (scrollTop
  jumps, no animation); active-section updates on scroll; absence of `sapche.json` hides the
  feature; inline marker count equals node count; nested starts stack correctly.
- **Manual:** `drime_shalung_1` end-to-end in the browser (sidebar open default, resize,
  teleport, auto-track, deep titles).

## Out of scope (YAGNI)

- Colleague's tool exporting UUIDs directly (future; would replace the pipeline aligner).
- Catalog registration of `drime_shalung` (separate data task; required to browse to it but
  not part of this feature's code).
- Reader-adjustable max inline depth (all sections render).
- Any hue-based depth/part/sub-branch coloring (deliberately rejected to protect the
  commentary color channel).

## Assumptions

- `export-N.json` ↔ instance pairing is supplied manually to the pipeline script;
  `document_id` is treated as opaque for now.
- Outline numbers use Arabic dotted notation (`2.2.1`); Tibetan numerals can be swapped in
  later if desired.
