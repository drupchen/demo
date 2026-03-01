# Unified Reader Redesign

**Date**: 2026-03-01
**Status**: Approved
**Scope**: Complete redesign of the archive reading experience (reader + player pages)

---

## 1. Problem Statement

The current archive experience has three structural issues:

1. **Inline expansion breaks reading flow**: Clicking a syllable opens a panel that pushes all text below it downward. With 18+ commentary sessions, this panel becomes a long list that displaces the reading context entirely.

2. **Two-page architecture loses context**: Navigating from Reader to Player loses the root text. Users must mentally track where they were in the pecha when they return. The sessionStorage scroll restoration is a band-aid for this.

3. **No "commentary-first" mode**: There is no way to listen to a full commentary session linearly while seeing which parts of the root text are being discussed. The current flow is always text-first.

## 2. Design Goals

- Merge reader and player into a **single unified page**
- Support both **text-first** and **commentary-first** workflows equally
- Modern aesthetic at the level of Notion/Spotify/Apple (2026 standards)
- Responsive: desktop sidebar, tablet collapsible, mobile bottom sheet
- Configurable reading experience (font size, theme)
- Show commentary **density** on the root text visually
- Custom audio player with segment visualization

## 3. Architecture: The Unified Reader

### 3.1 Page Layout (Desktop, 1024px+)

```
+----------------------------------------------------------+
|  [<- Catalog]              [Search 🔍] [Aa] [Sessions v] |
+----------------------------------------------------------+
|                            |                              |
|   ROOT TEXT PANEL          |   CONTEXT SIDEBAR            |
|   (flex-grow, ~60-65%)     |   (w-[420px], collapsible)   |
|                            |                              |
|   Tibetan syllables        |   +-- Tab: Commentary ----+  |
|   with density indicators  |   |  Available sessions   |  |
|   and coverage highlights  |   |  for selected passage  |  |
|                            |   +-- Tab: Player --------+  |
|   Click syllable ->        |   |  Audio + synced        |  |
|   updates sidebar          |   |  transcript            |  |
|                            |   +-- Tab: Info ----------+  |
|                            |   |  Session metadata      |  |
|                            |   +------------------------+  |
|                            |                              |
+----------------------------------------------------------+
|  [Mini-Player] Session A3  ▶  ━━━●━━━━━  12:34 / 45:00  |
+----------------------------------------------------------+
```

- Root text panel: scrollable, full-height, the primary reading surface
- Context sidebar: 420px fixed width, independently scrollable, collapsible via a toggle button
- Mini-player bar: fixed to bottom, 56px height, visible only when audio is playing
- Navigation bar: fixed top, 64px height

### 3.2 Page Layout (Tablet, 768-1024px)

- Root text is full-width by default
- Sidebar slides in from the right (overlay, 380px) when a syllable is clicked or session selected
- Swipe right or tap outside to dismiss
- Mini-player bar remains at bottom

### 3.3 Page Layout (Mobile, <768px)

- Root text is full-width
- Clicking a syllable opens a **bottom sheet** (half-screen, draggable to full-screen)
- Bottom sheet contains the same tabbed content as the desktop sidebar
- Mini-player bar at bottom (tapping it opens the bottom sheet to the Player tab)
- Full-screen player mode available via "expand" button in the bottom sheet

### 3.4 URL Structure

The unified reader replaces both `/reader` and `/player`:

```
/reader?instance={id}                          — open reader for a teaching
/reader?instance={id}&sylId={uuid}             — deep link to a syllable
/reader?instance={id}&sylId={uuid}&q={query}   — deep link from search
/reader?instance={id}&session={id}             — open in commentary-first mode
/reader?instance={id}&session={id}&time={ts}   — deep link to audio moment
```

The current `/player` route should redirect to `/reader` with the appropriate `session` param for backwards compatibility.

## 4. Root Text Panel

### 4.1 Syllable Rendering

Each syllable renders as a `<span>` (same as current). Visual states:

| State | Style |
|-------|-------|
| Default (has commentary) | Normal text color (`#2D3436`), clickable, subtle cursor pointer |
| Default (no commentary) | Muted color (`#9DB9C9`), not clickable |
| Selected | Gold accent (`#D4AF37`), bold weight |
| Active commentary coverage | Light warm highlight background (`#FDF8EE`) |
| Not covered by active session | Reduced opacity (0.35) — "grayed out" |
| Search match (active) | Red accent with subtle background |
| Search match (other) | Soft red tint |

### 4.2 Commentary Density Indicators

Below each syllable that has commentary, render a tiny visual indicator showing how many distinct sessions reference it:

- **1 session**: single thin dot (gold, 2px)
- **2-3 sessions**: two dots
- **4+ sessions**: small bar or gradient

Implementation: A `<span>` with `position: relative` wrapping each syllable. A pseudo-element or absolutely-positioned child below the text baseline shows the indicator. Generated from the `syllableMediaMap` by counting unique `source_session` values per syllable UUID.

This is subtle enough not to distract from reading, but gives scholars an at-a-glance understanding of which passages are heavily commented.

### 4.3 Session Coverage Overlay

When a session is active (playing or selected), the root text shows which portions that session covers:

- Syllables covered by the active session: normal opacity, with a subtle warm background
- Syllables NOT covered: opacity reduced to 0.35
- Currently playing segment: stronger highlight (gold background band)

This directly answers the requirement of "showing in gray the parts not mentioned."

### 4.4 Font Size Controls

A popover triggered by an `Aa` button in the navbar:

```
+---------------------------+
|  Reading Settings         |
|                           |
|  Size:  [S] [M] [L] [XL] |
|                           |
|  Theme: [Light] [Sepia]   |
|         [Dark]            |
|                           |
|  Spacing: [—] [=] [≡]    |
+---------------------------+
```

- **Size presets**: Scale the base `BIG_SIZE_REM` value
  - S: 1.6rem (compact study)
  - M: 2.0rem (default)
  - L: 2.5rem (comfortable)
  - XL: 3.0rem (presentation / accessibility)
- **Theme**: Light (#F7FAFC bg), Sepia (#FAF0E4 bg / #5B4636 text), Dark (#1A1A2E bg / #E0E0E0 text)
- **Line spacing**: Compact (1.4), Normal (1.6), Relaxed (1.8)
- Persisted to `localStorage` under key `reader-preferences`
- All sizes scale proportionally (SMALL stays at 0.70 ratio of BIG, TITLE stays at fixed relationship)

## 5. Context Sidebar

### 5.1 Tab: Commentary (Sessions List)

Shown when a syllable is clicked. Lists all sessions that have segments covering the selected syllable.

Each session entry shows:
```
+------------------------------------------+
|  Session A3                         2:15  |
|  སེམས་བསྐྱེད་ཀྱི་སྔོན་འགྲོ་...          |
|  [Play from here ->]                      |
+------------------------------------------+
```

- Session identifier (A3, B1, etc.)
- Duration of the relevant segment
- Preview: first ~40 characters of the segment's syllable text (from the manifest, using `syl_uuids`)
- Click → switches to Player tab and starts playback at that segment

If no syllable is selected, this tab shows a general overview:
- Total number of sessions
- A visual "coverage map" — a miniature representation of the full text with colored bands showing which sessions cover which portions

### 5.2 Tab: Player

The integrated audio player and synchronized transcript.

**Player controls** (top of the tab):
- Play/Pause button (large, centered)
- Progress bar with segment markers (thin colored ticks at each segment boundary)
- Current time / total duration
- Playback speed selector: 0.75x, 1x, 1.25x, 1.5x, 2x
- Session switcher: horizontal pill bar showing all sessions, scrollable
  - Active session is highlighted
  - Clicking a different session switches audio source

**Segment timeline** (below progress bar):
- A thin bar (~8px) divided into colored blocks, each representing a segment
- Each block's width is proportional to the segment duration
- Active segment is brighter; played segments are slightly faded; upcoming segments are neutral
- Hovering a block shows a tooltip with the referenced text excerpt
- Clicking a block jumps playback to that segment

**Synchronized transcript** (scrollable area below controls):
- Shows all segments for the current session, rendered as clickable blocks
- Each block displays the syllable text from the manifest (via `syl_uuids`)
- Active segment: warm background, full opacity
- Past segments: normal text, 90% opacity
- Future segments: reduced opacity (60%)
- Clicking a segment jumps audio to its start time
- Auto-scroll follows the active segment (with scroll-lock detection: if user scrolls manually, pause auto-scroll for 8 seconds)
- Right-click a segment → context menu with shareable deep link (preserve existing feature)

**Scroll-lock detection**: Track user scroll events on the transcript container. When a user manually scrolls (via wheel/touch), set a flag `userScrolledAt = Date.now()`. In the auto-scroll effect, skip scrolling if `Date.now() - userScrolledAt < 8000`. A small "↓ Return to current" button appears when auto-scroll is paused.

### 5.3 Tab: Info

Metadata about the currently selected session or teaching:
- Teaching title (Tibetan + transliteration if available)
- Session ID, recording source
- Audio quality indicator (original / restored)
- Original/Restored audio toggle (preserve existing feature)
- Total segments count for this session
- Link to download/share the session

### 5.4 Sidebar Collapse/Expand

- A toggle button on the left edge of the sidebar (thin vertical bar with `<<` / `>>` icon)
- Collapsed: sidebar is hidden, root text takes full width (focus reading mode)
- Transition: 300ms ease-out slide
- Keyboard shortcut: `Ctrl/Cmd + \` to toggle

## 6. Mini-Player Bar

A persistent bar at the bottom of the page, visible only when audio is active. Inspired by Spotify's now-playing bar.

```
+------------------------------------------------------------------+
| ▶  Session A3 — སེམས་བསྐྱེད་...  ━━━━●━━━━━━━  12:34 / 45:00  ↗ |
+------------------------------------------------------------------+
```

- Left: Play/Pause button
- Center-left: Session name + current segment text excerpt (truncated)
- Center: Thin progress bar (clickable to seek)
- Right: Current time / duration
- Far right: Expand button (opens sidebar to Player tab, or on mobile opens full-screen player)
- Height: 56px
- Background: blur backdrop, slight shadow above
- Clicking the text/session name area opens the sidebar Player tab

When no audio is playing, this bar is hidden (not collapsed — fully removed from layout).

## 7. Session Switcher

A horizontal scrollable bar of pill buttons, positioned at the top of the sidebar Player tab:

```
[A1] [A2] [A3•] [A4] [A5] [A6] ... [A18]
```

- Active session has a filled/highlighted style
- The dot (•) indicates sessions that cover the currently selected syllable
- Scrollable horizontally if there are many sessions
- Clicking switches the audio source
- When switching: if the new session has a segment covering the same root text passage, auto-seek to that segment. Otherwise, start from the beginning.

## 8. Commentary-First Mode

Activated by:
- Selecting a session from the session switcher
- Navigating via URL with `&session={id}`
- Clicking "Play full session" from the Commentary tab

In this mode:
- The sidebar Player tab is active and prominent
- The root text panel shows coverage overlay (covered = normal, not covered = grayed out at 0.35 opacity)
- As audio plays, the root text auto-scrolls to keep the currently-referenced passage in view
- The currently-referenced syllables have a gold highlight band
- This creates a dual-scroll experience: sidebar transcript scrolls with audio, root text scrolls in sync to show the corresponding passage

**Auto-scroll behavior for root text in commentary-first mode**:
- When a new segment becomes active, smoothly scroll the root text to center the first syllable of that segment's `syl_uuids`
- Use the same scroll-lock detection as the transcript: if user manually scrolls the root text, pause auto-scroll for 8 seconds
- Show a floating "↓ Follow playback" pill button when auto-scroll is paused

## 9. Search

### 9.1 In-Page Search (Find in Teaching)

Keep the existing compressed-text search index approach — it's well-engineered. Move the search bar into the main navbar (collapsible, triggered by a search icon or `Ctrl/Cmd+F`).

When active, the search bar expands in the navbar with match count and prev/next navigation (same as current). Matches highlight in the root text panel.

### 9.2 Cross-Teaching Search

The existing OpenSearch-powered search on the `/archive` page remains separate. Search results link to `/reader?instance={id}&sylId={uuid}&q={query}`, which opens the unified reader with the deep-link highlight.

## 10. Design System Updates

### 10.1 Color Palette

```
Primary:
  --gold:           #D4AF37   (active states, selected syllable)
  --gold-subtle:    #FDF8EE   (coverage highlight background)
  --gold-border:    #D4AF3740 (borders, dividers)

Accent:
  --crimson:        #8B1D1D   (hover, search matches, active tab)
  --crimson-subtle: #8B1D1D1A (search match background)

Text:
  --text-primary:   #2D3436   (root text — warm dark, NOT pure black)
  --text-secondary: #6B7280   (metadata, labels)
  --text-muted:     #9DB9C9   (syllables without commentary)
  --text-disabled:  #2D343659 (grayed-out syllables in commentary-first mode)

Surface:
  --bg-primary:     #FAFAFA   (main background)
  --bg-surface:     #FFFFFF   (cards, sidebar)
  --bg-elevated:    #F5F5F5   (hover states, active segment)

Sepia theme overrides:
  --bg-primary:     #FAF0E4
  --text-primary:   #5B4636
  --bg-surface:     #FFF8F0

Dark theme overrides:
  --bg-primary:     #1A1A2E
  --text-primary:   #E0E0E0
  --bg-surface:     #232340
  --gold:           #E8C547   (brighter gold for dark bg)
```

### 10.2 Typography

Keep Uchen for Tibetan, Inter for UI chrome. Changes:

- Replace all `text-black` with `text-[var(--text-primary)]` (warm dark gray)
- Default body text: Inter 13px/1.5 for UI, Uchen at size presets for pecha
- All UI labels: Inter, uppercase, tracking-wide, 10-11px (keep existing pattern, it's good)
- Badge text: Inter 12px medium weight

### 10.3 Spacing & Layout

- Sidebar width: 420px (desktop), 380px (tablet overlay)
- Navbar height: 64px
- Mini-player height: 56px
- Root text padding: 48px horizontal, 32px vertical
- Segment gap in transcript: 8px
- Border radius: 12px for cards, 8px for buttons, 6px for badges
- Consistent 8px grid system

### 10.4 Animations

- Sidebar open/close: 300ms cubic-bezier(0.4, 0, 0.2, 1)
- Tab switch: 200ms fade cross-dissolve
- Syllable highlight: 400ms ease-out background-color transition
- Mini-player appear/dismiss: 300ms slide-up/slide-down
- Bottom sheet (mobile): 350ms spring-based (slight overshoot)
- Coverage overlay (session change): 500ms opacity transition on all syllables
- Active segment scroll: `behavior: 'smooth'` (native)

## 11. Component Hierarchy

```
UnifiedReaderPage (page.js)
├── ReaderNavbar
│   ├── BackToCatalog button
│   ├── SearchBar (collapsible)
│   ├── ReadingSettingsPopover (Aa button)
│   └── SidebarToggle button
├── ReaderLayout (flex container)
│   ├── RootTextPanel
│   │   ├── TextRenderer (syllable loop)
│   │   │   └── Syllable (per syllable)
│   │   │       └── DensityIndicator
│   │   └── CoverageOverlay (when session active)
│   └── ContextSidebar
│       ├── SidebarTabs (Commentary | Player | Info)
│       ├── CommentaryTab
│       │   ├── SessionCard (per matching session)
│       │   └── CoverageMap (when no syllable selected)
│       ├── PlayerTab
│       │   ├── SessionSwitcher (pill bar)
│       │   ├── AudioPlayer
│       │   │   ├── PlayPauseButton
│       │   │   ├── ProgressBar
│       │   │   ├── SegmentTimeline
│       │   │   └── SpeedSelector
│       │   └── SyncedTranscript
│       │       └── TranscriptSegment (per segment)
│       └── InfoTab
│           ├── SessionMetadata
│           └── AudioToggle (original/restored)
├── MiniPlayer (fixed bottom, conditional)
│   ├── PlayPause
│   ├── SessionInfo
│   ├── ProgressBar
│   └── ExpandButton
└── BottomSheet (mobile only, conditional)
    └── [Same content as ContextSidebar]
```

## 12. State Management

All state is local React state + URL params. No global store needed.

### URL-driven state
- `instance` — which teaching
- `session` — which session is active (triggers commentary-first mode)
- `time` — seek position
- `sylId` — selected syllable
- `q` — search query
- `tab` — active sidebar tab (commentary/player/info)

### Local state
- `manifest[]` — syllable data (fetched on mount)
- `sessions[]` — segment data (fetched on mount)
- `activeSession` — currently playing/selected session
- `activeSylId` — currently clicked syllable
- `currentTimeMs` — audio playback position
- `isPlaying` — audio play state
- `sidebarOpen` — sidebar visibility
- `activeTab` — which sidebar tab
- `preferences` — font size, theme, spacing (from localStorage)
- `searchState` — local search query, matches, active match index
- `userScrolledAt` — timestamp for scroll-lock detection

### Derived/computed (useMemo)
- `syllableMediaMap` — syllable UUID → segment[] mapping (exists already)
- `syllableDensityMap` — syllable UUID → count of distinct sessions
- `activeSessionSegments` — segments filtered to active session
- `coverageSet` — Set of syllable UUIDs covered by active session
- `searchIndex` — compressed text index for in-page search (exists already)

## 13. Data Flow

### Loading
1. Page mounts, reads `instance` from URL
2. Fetch `manifest.json` + `*_compiled_sessions.json` in parallel (same as current)
3. Build `syllableMediaMap` and `syllableDensityMap`
4. If URL has `session` param, activate commentary-first mode
5. If URL has `sylId` param, scroll to syllable and open sidebar Commentary tab
6. Load preferences from localStorage

### Syllable Click (text-first mode)
1. User clicks syllable
2. Set `activeSylId` in state
3. Look up `syllableMediaMap[sylId]` to get matching segments
4. Group segments by `source_session`
5. Sidebar opens to Commentary tab showing matching sessions
6. Update URL: `?sylId={uuid}`

### Session Select (commentary-first mode)
1. User clicks session (from Commentary tab or Session Switcher)
2. Set `activeSession` in state
3. Load audio source from first segment of that session
4. Build `coverageSet` from all `syl_uuids` across session's segments
5. Apply coverage overlay to root text
6. Sidebar switches to Player tab
7. Update URL: `?session={id}`

### Audio Playback
1. `onTimeUpdate` fires, updates `currentTimeMs`
2. Find active segment: first segment where `startTimeMs <= currentTimeMs < endTimeMs`
3. In sidebar transcript: highlight active segment, auto-scroll (with scroll-lock)
4. In root text: highlight syllables of active segment with gold band, auto-scroll (with scroll-lock)
5. When segment changes: smooth transition of highlights

## 14. What Gets Removed

- `/player/page.js` — replaced by sidebar Player tab (keep route as redirect)
- Inline expansion panel in reader — replaced by sidebar
- `sessionStorage` scroll position hack — no longer needed (single page)
- Separate `search/page.js` — already superseded by archive page

## 15. What Gets Preserved

- Search index algorithm (compressed text with UUID mapping) — works well
- Deep link URL scheme — extended, backwards-compatible
- Right-click share URL mechanism
- Theme system architecture (`getThemeCssVars()`) — extended with new tokens
- OpenSearch API route — unchanged
- Gallery API route — unchanged
- Auth system — unchanged
- Data format (manifest.json, compiled_sessions.json) — unchanged

## 16. Migration & Compatibility

- The `/reader` route keeps the same base URL, extended with new params
- The `/player` route becomes a redirect: `/player?session=X&time=Y` → `/reader?instance=Z&session=X&time=Y`
- All existing deep links continue to work
- The archive page links update from `/reader?instance=X` (no change needed) and from linking to `/player` (updated to `/reader?session=X`)
