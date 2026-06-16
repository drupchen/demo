# Personal Notes in the Reader — Design

**Date:** 2026-06-12
**Status:** Approved (pending written-spec review)

## Goal

Let an authenticated user attach personal notes — text and/or voice — to a
selected span of text in the reader. Notes are private to the user and synced
server-side. Designed so a future "sharing + replies" phase is not blocked, but
sharing is explicitly **out of scope** for this work.

## Decisions (from brainstorming)

- **Visibility:** Personal, per logged-in account, server-synced. Login
  required to create/view notes. (Future: sharing + replies — not built now.)
- **Anchor:** A selected **range** of text (start syllable → end syllable),
  not a single point and not a sapche section.
- **Creation gesture:** An activatable **annotation mode** toggled from the
  navbar; while active, syllable audio-click is disabled and native text
  selection drives annotation.
- **Display:** Light **highlight** on annotated spans **+ a "Notes" tab** in the
  existing right sidebar (list of the teaching's notes).
- **Storage:** Approach A — D1 for note metadata + text, R2 for voice audio.

## Architecture Overview

```
Reader (client)
  ├─ annotateMode toggle (navbar)         → disables audio-click, enables selection
  ├─ selection → start/end syl_id         → "+ Note" floating button
  ├─ NoteComposer (text + VoiceRecorder)  → POST /api/notes (multipart for voice)
  ├─ highlight map (sylId → notes)        → r-note-highlight spans
  └─ NotesTab (right sidebar)             → list / go-to / edit / delete

API (Next.js routes on Workers, auth() guarded, user-scoped)
  ├─ GET    /api/notes?instance={id}
  ├─ POST   /api/notes
  ├─ PATCH  /api/notes/{id}
  ├─ DELETE /api/notes/{id}
  └─ GET    /api/notes/{id}/audio          → streams blob from R2

Storage
  ├─ D1 table `notes`                      (migration 0002)
  └─ R2 bucket MEDIA, key notes/{user_id}/{note_id}.{ext}
```

## Data Model

Migration `migrations/0002_notes.sql`:

```sql
CREATE TABLE notes (
  id            TEXT PRIMARY KEY,           -- server-generated uuid
  user_id       TEXT NOT NULL,              -- FK -> users.id
  instance_id   TEXT NOT NULL,              -- e.g. "drime_shalung_1"
  start_syl_id  TEXT NOT NULL,              -- anchor: first syllable UUID
  end_syl_id    TEXT NOT NULL,              -- anchor: last syllable UUID (inclusive)
  anchor_text   TEXT,                       -- selected-text excerpt (display fallback if anchor breaks)
  kind          TEXT NOT NULL,              -- 'text' | 'voice'
  body_text     TEXT,                       -- text content, or caption for a voice note
  audio_key     TEXT,                       -- R2 key for kind='voice', else NULL
  audio_duration_ms INTEGER,                -- voice clip duration (display)
  visibility    TEXT NOT NULL DEFAULT 'private',  -- reserved for future sharing
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_notes_user_instance ON notes(user_id, instance_id);
```

- **Robust anchoring:** `start_syl_id`/`end_syl_id` are stable manifest UUIDs,
  so they survive lazy-loading and reflows. `anchor_text` is a display safety
  net if an anchor ever disappears.
- **R2:** voice audio is stored in the existing `MEDIA` bucket under
  `notes/{user_id}/{note_id}.{ext}` (ext follows the recorded MIME type). It is
  **never public** — served only through the protected audio route.
- **Future sharing:** `visibility` already exists (`private` today); a future
  `note_replies` table will not require changing this schema. None of that is
  built now.

## API

All routes resolve the session with `auth()`; not logged in → `401`. Every read
and write is filtered by `user_id = session.user.id`, so a user never touches
another user's notes.

| Route | Method | Role |
|---|---|---|
| `/api/notes?instance={id}` | `GET` | List the user's notes for this teaching (returns `audio_key`, not the blob). |
| `/api/notes` | `POST` | Create a note. JSON for text; `multipart/form-data` for voice. Returns the created note. |
| `/api/notes/{id}` | `PATCH` | Edit `body_text` / caption. Does not change the anchor. |
| `/api/notes/{id}` | `DELETE` | Delete the note **and** its R2 object if voice. |
| `/api/notes/{id}/audio` | `GET` | Stream the audio blob from R2 (`env.MEDIA.get`), after confirming the note belongs to the user. |

**Voice upload flow** (avoids base64, keeps the text POST simple):
1. User records → an audio `Blob` in memory.
2. `POST /api/notes` as `multipart/form-data`: note fields + audio file. The
   route generates `note_id`, writes the blob to R2 (`env.MEDIA.put(key, file.stream())`),
   inserts the D1 row, returns the note.
   - *Rejected alternative:* presigned two-step upload — unnecessary for short
     clips, adds complexity.
3. Playback goes through `/api/notes/{id}/audio` — never a public R2 URL
   (unlike the gallery media).

**Data-access helper:** `src/lib/notes.js` (mirrors `users.js`) holds the
prepared D1 statements (`listNotes`, `createNote`, `getNote`, `updateNote`,
`deleteNote`). Routes stay thin.

**Server-side validation:** `body_text` ≤ ~10,000 chars; audio ≤ ~5 MB;
`kind` ∈ {text, voice}; non-empty `instance_id` and anchors.

## UI & Interaction

**Annotation mode**
- New button in `ReaderNavbar` (pencil/highlighter icon), shown **only when
  logged in**. Toggles `annotateMode` state in `ReaderContent`.
- While active: syllable audio `onClick` is disabled (pass `annotateMode` down
  to `LazyParagraph`/`renderSyl`), a subtle top banner signals the mode, cursor
  becomes `text`.

**Creation**
- User selects text (native selection). On `mouseup`/`selectionchange`, resolve
  the selection to `start_syl_id`/`end_syl_id` by walking each endpoint node to
  its nearest `<span id>` ancestor (`Range.startContainer`/`endContainer` →
  `closest('[id]')`).
- A small floating **"+ Note"** button appears near the selection → opens
  `NoteComposer`: a textarea **and** a mic button. Both can be used together (a
  voice note with a text caption).

**Display**
- Annotated spans get a discreet highlight class reusing the existing `r-*`
  system (e.g. `r-note-highlight` — very light amber). The `sylId → note(s)` map
  is derived the way `syllableMediaMap` already is.
- Clicking a highlighted span (outside annotation mode) opens that note in the
  right sidebar.

**Sidebar: new "Notes" tab**
- Add a third tab to the existing sidebar (`player` / `info` / **`notes`**). New
  `NotesTab` component: list of the teaching's notes (anchor excerpt + text
  preview / audio player + dates), sorted by position in the text. Each entry:
  go-to-passage (scroll + highlight via the existing `scrollToSyllable`), edit,
  delete.

**Component breakdown** (focused files, consistent with the current reader):
- `useNotes.js` — hook: fetch/cache the instance's notes + optimistic CRUD.
- `NoteComposer.js` — create/edit editor (text + voice recording).
- `NotesTab.js` — sidebar tab (list + actions).
- `VoiceRecorder.js` — encapsulates recording (see below).
- Highlight styles in `reader.css` (or a small `notes.css`).

## Voice Recording (`VoiceRecorder.js`)

- **Capture:** browser `MediaRecorder` API. `getUserMedia({ audio: true })` on
  mic tap. Format chosen by detection: `audio/webm;codecs=opus`
  (Chrome/Firefox/Edge) with `audio/mp4` fallback (Safari, which cannot produce
  webm). The R2 key extension follows the actual MIME type.
- **UI:** mic button → recording state (timer + simple waveform/pulse), stop
  button, preview (`<audio>` on the local blob URL) before saving, re-record
  option. Soft ~5 min client limit, hard-capped at the server limit (5 MB).
- **Mic permission:** if the user denies access, show a clear message and fall
  back to text-only notes (no blocking).
- **Submission:** the `Blob` goes into the `FormData` of `POST /api/notes`. No
  transcription (out of scope, YAGNI).

## Error Handling

- Not logged in tries to annotate → button is absent; API returns a defensive `401`.
- Network failure on create → optimistic note is removed, error toast, typed
  text is preserved for retry.
- Audio upload failure → no D1 row is inserted (or it is rolled back) to avoid a
  voice note with no audio.
- Anchor not found at render (syllable absent) → show the note in the tab via
  `anchor_text`, without a highlight, rather than crashing.
- Mic unavailable/denied → text fallback.

## Testing

Existing `node` suite (`tests/*.test.mjs`):
- `notes.js` data-access: create/list/get/update/delete with mocked D1 →
  isolation by `user_id` (a user cannot see another user's notes).
- Route validation: 401 without a session; rejects invalid `kind`, oversized
  body, oversized audio.
- Selection → `start/end syl_id` resolution: a pure, testable function (DOM
  range → ids) tested with a fake span tree.
- Deletion: confirms the associated R2 object is removed.

## Out of Scope (future phase)

Sharing between users, replies/threads, audio transcription, notes for
logged-out visitors.
