# Transcription integration — re-implementation plan (unified reader)

## Context

The producer side (`sapche_discovery`) already publishes two new per-instance files into
`public/data/archive/{instance}/`, using the **same contract** the reader already consumes:

- `transcription_manifest.json` — the oral transcription as an ordered, clickable syllable
  stream (same shape as `manifest.json`, plus a `session` field).
- `{instance}_transcription_sessions.json` — transcription↔audio segments (same shape as
  `{instance}_compiled_sessions.json`); `syl_uuids` point at transcription tokens.

These join the existing root data by a shared **`global_seg_id`**: each root
`compiled_sessions` entry and the transcription segment that was aligned to it carry the same
id. That id is the bridge for "show the transcription for this segment."

Only `drime_shalung_1` currently has transcription data (it's the migrated instance); the UI
must degrade gracefully when the files are absent.

This plan re-implements the transcription UI against the **unified reader** (the earlier
attempt targeted a since-replaced monolithic reader and was discarded).

## Branch & merge strategy

- Work on `feature/transcription`, branched from `main` (the deployed integration point).
- **Merge-safety:** keep the footprint in files the parallel `feature/unified-reader` branch is
  *not* changing. Verified: `PlayerTab.js`, `MiniPlayer.js`, `useAudioPlayer.js`,
  `ReaderLayout.js` are byte-identical between `main` and `feature/unified-reader`. The only
  shared file with real divergence is `reader/page.js` (~52 lines apart).
- Therefore: put **all transcription logic in a NEW file** (`src/lib/useTranscription.js`),
  make `PlayerTab.js` changes purely additive (one new prop + one render block), and keep
  `reader/page.js` edits to a few additive lines (call the hook, pass props). Conflicts on a
  later merge are then limited to small, localized hunks.

## Data layer (new file — zero conflict surface)

`src/lib/useTranscription.js` — `useTranscription(instanceId)` returns:
- `hasTranscription` — false when the files 404.
- `transManifest`, `transSessions` — raw arrays.
- `transTextByGid` — `{ global_seg_id: "concatenated transcription text" }`, built from
  `transSessions[*].syl_uuids` → `transManifest` token text. **Drives the read-along.**
- `transSegSylsByGid` — `{ global_seg_id: [{id, text}] }` for per-syllable click handling.
- `transMediaMap` — `{ transcription_syl_uuid: [media options] }`, identical builder to the
  reader's `syllableMediaMap` but over `transSessions`. Powers click→play in the standalone view.
- `transBySession` — `{ session: [segments in order] }` for the standalone per-session view.

Mirrors the reader's existing `syllableMediaMap`/`parseToMs` conventions so it reads as native.

## Phase 1 — read-along transcription in the player (core, lowest risk)

Goal: while listening to a session, read the oral transcription synced to the audio, beneath
each root-text segment.

- `reader/page.js`: call `useTranscription(instanceId)`; pass `transTextByGid` +
  `hasTranscription` to `<PlayerTab>`. (~3 lines.)
- `PlayerTab.js` (additive): each segment in the synced-transcript list already has
  `seg.id === global_seg_id`. Under each segment's root syllables, render
  `transTextByGid[seg.id]` in a styled "Oral transcription" sub-block, shown when present.
  Optional small toggle in the player header: "Show transcription" (default on).

Deliverable: the listener sees root segment + its oral transcription together, auto-scrolling
with playback. No audio/seek changes (same files + timecodes).

## Phase 2 — standalone transcription reader (layer toggle)

Goal: read the transcription on its own; click any syllable to open the player on its segment.

- `ReaderNavbar` (or a small control in `page.js`): a Root ⇄ Transcription toggle, shown only
  when `hasTranscription`. New state `layer` in `page.js`.
- Reading pane: when `layer === 'transcription'`, render the transcription as **per-session,
  per-segment blocks** (using `transBySession`) instead of root paragraphs — each segment a
  clickable run of syllables. (Per-segment blocks avoid the fact that the transcription stream
  has no paragraph/newline structure, and give a natural click target.)
- Click a transcription syllable → reuse the existing popover/commentary-select path, but keyed
  to the transcription layer, so the player opens on that segment (its `global_seg_id`/time).
- Search/deep-link: point the existing search index at the active layer's manifest (the reader
  already has this indirection; extend it to the transcription manifest when `layer` is active).

## Phase 3 — interleaved transcription in the root reader (optional, last)

Goal: in root mode, render each commented portion's transcription beneath it.

- Compute `portionByAnchor` from root `sessions` (group entries sharing a portion; anchor on the
  portion's last syllable; collect the portion's `global_seg_id`s → `transTextByGid`).
- In `LazyParagraph`, after the anchor syllable, render the portion's transcription block.
- Most invasive to the lazy-paragraph renderer; do only after Phases 1–2 are validated and the
  visual direction is settled.

## Verification

- Producer integrity already verified (0 dangling refs; root↔transcript `global_seg_id` exact).
- Per phase: lint clean; `next dev` route compiles; on `drime_shalung_1` the read-along text
  matches `srt_segments.text`; on a non-transcribed instance the UI is unchanged (graceful).
- Manual: listen to a session and confirm the transcription tracks the audio; toggle to the
  standalone transcription and confirm click→play lands on the right segment/time.

## Notes for the parallel `feature/unified-reader` work

- New file `src/lib/useTranscription.js` — no conflict.
- `PlayerTab.js` — additive prop + render block; if you refactor PlayerTab, the transcription
  block is self-contained and easy to relocate.
- `reader/page.js` — a few additive lines (hook call, props, `layer` state + toggle).
- Data files under `public/data/archive/` are git-ignored build artifacts (produced by
  `sapche_discovery`), so they never enter the merge.
