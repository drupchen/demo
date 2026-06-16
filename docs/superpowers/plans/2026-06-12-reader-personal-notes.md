# Reader Personal Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in user attach personal text and voice notes to a selected span of text in the reader, stored server-side (D1 + R2), private to that user.

**Architecture:** Notes are anchored to a start/end syllable UUID within a teaching instance. An "annotation mode" toggle in the reader navbar turns native text selection into note creation. Text + metadata live in a D1 `notes` table; voice audio lives in the R2 `MEDIA` bucket and is served through an auth-guarded streaming route. The reader derives a `sylId → notes` map (like the existing `syllableMediaMap`) to highlight annotated spans, and a new "Notes" sidebar tab lists/edits/deletes them.

**Tech Stack:** Next.js 16 (App Router) on Cloudflare Workers (OpenNext), Auth.js v5, Cloudflare D1 (SQLite), Cloudflare R2, React 19, browser `MediaRecorder`. Tests are plain Node modules run with `node tests/*.test.mjs`.

**Reference spec:** `docs/superpowers/specs/2026-06-12-reader-personal-notes-design.md`

---

## File Structure

**Create:**
- `migrations/0004_notes.sql` — `notes` table + index.
- `src/lib/notes.js` — D1 data-access helpers + pure input validation. No HTTP, no React.
- `src/lib/note-selection.js` — pure DOM-range → anchor resolution helpers (no React).
- `src/lib/note-auth.js` — `requireUser()` guard (mirrors `lib/admin-auth.js`).
- `src/app/api/notes/route.js` — `GET` (list) + `POST` (create, JSON or multipart).
- `src/app/api/notes/[id]/route.js` — `PATCH` (edit text) + `DELETE`.
- `src/app/api/notes/[id]/audio/route.js` — `GET` (stream voice blob from R2).
- `src/app/reader/useNotes.js` — client hook: fetch instance notes + optimistic CRUD.
- `src/app/reader/VoiceRecorder.js` — `MediaRecorder` capture/preview component.
- `src/app/reader/NoteComposer.js` — create/edit editor (text + VoiceRecorder).
- `src/app/reader/NotesTab.js` — right-sidebar tab: list + go-to/edit/delete.
- `tests/notes.test.mjs` — unit tests for `src/lib/notes.js`.
- `tests/noteSelection.test.mjs` — unit tests for `src/lib/note-selection.js`.

**Modify:**
- `src/app/reader/ReaderNavbar.js` — add annotation-mode toggle button (logged-in only).
- `src/app/reader/page.js` — annotation mode state, selection handling, `+ Note` button, highlight map + rendering, wire `NotesTab` into the sidebar tabs.
- `src/app/reader/reader.css` — `.r-note-highlight` styles + annotation-mode affordances.

---

## Task 1: D1 migration for the `notes` table

**Files:**
- Create: `migrations/0004_notes.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/0004_notes.sql`:

```sql
-- 0004_notes.sql
-- Personal notes attached to a selected span of text in the reader.
-- One row per note. Voice audio lives in R2 (audio_key); text lives in body_text.

CREATE TABLE notes (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  instance_id       TEXT NOT NULL,
  start_syl_id      TEXT NOT NULL,
  end_syl_id        TEXT NOT NULL,
  anchor_text       TEXT,
  kind              TEXT NOT NULL,                 -- 'text' | 'voice'
  body_text         TEXT,
  audio_key         TEXT,
  audio_duration_ms INTEGER,
  visibility        TEXT NOT NULL DEFAULT 'private',
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_notes_user_instance ON notes(user_id, instance_id);
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd floating-pecha-ui && npm run db:apply`
Expected: output lists `0004_notes.sql` as applied (no error).

- [ ] **Step 3: Verify the table exists**

Run: `cd floating-pecha-ui && npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='notes';"`
Expected: a result row containing `notes`.

- [ ] **Step 4: Commit**

```bash
git add floating-pecha-ui/migrations/0004_notes.sql
git commit -m "feat(notes): add D1 notes table migration"
```

---

## Task 2: `notes.js` data-access + validation (TDD)

This module is the only place that talks to the `notes` table. It also exposes a pure `validateNoteInput` used by the API route. All functions are user-scoped: every read/write takes `userId` and filters by it.

**Files:**
- Create: `src/lib/notes.js`
- Test: `tests/notes.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/notes.test.mjs`:

```js
// Run: node tests/notes.test.mjs
// Unit tests for src/lib/notes.js against a fake D1.

import assert from "node:assert/strict";
import {
  listNotes,
  createNote,
  getNote,
  updateNote,
  deleteNote,
  validateNoteInput,
} from "../src/lib/notes.js";

let passed = 0;
function test(name, fn) {
  return Promise.resolve(fn()).then(() => {
    passed++;
    console.log(`  ok - ${name}`);
  });
}

// Fake D1 capturing bound calls; returns configured rows for first/all.
function fakeDb({ first = null, all = [], runResult = { success: true } } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, args: null };
      return {
        bind(...args) {
          call.args = args;
          calls.push(call);
          return this;
        },
        first: async () => first,
        all: async () => ({ results: all }),
        run: async () => runResult,
      };
    },
  };
}

await test("listNotes filters by user_id and instance_id", async () => {
  const db = fakeDb({ all: [{ id: "n1" }] });
  const rows = await listNotes(db, "user-1", "inst-1");
  assert.deepEqual(rows, [{ id: "n1" }]);
  const call = db.calls[0];
  assert.match(call.sql, /WHERE user_id = \? AND instance_id = \?/);
  assert.deepEqual(call.args, ["user-1", "inst-1"]);
});

await test("createNote inserts a row scoped to the user and returns it", async () => {
  const db = fakeDb();
  const note = await createNote(db, {
    userId: "user-1",
    instanceId: "inst-1",
    startSylId: "s-start",
    endSylId: "s-end",
    anchorText: "excerpt",
    kind: "text",
    bodyText: "hello",
    audioKey: null,
    audioDurationMs: null,
  });
  assert.equal(note.user_id, "user-1");
  assert.equal(note.kind, "text");
  assert.equal(note.body_text, "hello");
  assert.ok(note.id, "id is generated");
  const call = db.calls[0];
  assert.match(call.sql, /INSERT INTO notes/);
  assert.equal(call.args[1], "user-1"); // id, user_id, ...
});

await test("getNote returns null when the note belongs to another user", async () => {
  const db = fakeDb({ first: null });
  const row = await getNote(db, "n1", "user-1");
  assert.equal(row, null);
  assert.match(db.calls[0].sql, /WHERE id = \? AND user_id = \?/);
  assert.deepEqual(db.calls[0].args, ["n1", "user-1"]);
});

await test("updateNote sets body_text scoped by id and user", async () => {
  const db = fakeDb();
  await updateNote(db, "n1", "user-1", { bodyText: "edited" });
  const call = db.calls[0];
  assert.match(call.sql, /UPDATE notes SET body_text = \?/);
  assert.match(call.sql, /WHERE id = \? AND user_id = \?/);
  assert.deepEqual(call.args, ["edited", "n1", "user-1"]);
});

await test("deleteNote is scoped by id and user", async () => {
  const db = fakeDb();
  await deleteNote(db, "n1", "user-1");
  const call = db.calls[0];
  assert.match(call.sql, /DELETE FROM notes WHERE id = \? AND user_id = \?/);
  assert.deepEqual(call.args, ["n1", "user-1"]);
});

await test("validateNoteInput accepts a valid text note", () => {
  const r = validateNoteInput({
    instanceId: "inst-1",
    startSylId: "a",
    endSylId: "b",
    kind: "text",
    bodyText: "hi",
    hasAudio: false,
  });
  assert.equal(r.ok, true);
});

await test("validateNoteInput rejects an invalid kind", () => {
  const r = validateNoteInput({
    instanceId: "inst-1",
    startSylId: "a",
    endSylId: "b",
    kind: "sketch",
    bodyText: "hi",
    hasAudio: false,
  });
  assert.equal(r.ok, false);
});

await test("validateNoteInput rejects a text note with empty body", () => {
  const r = validateNoteInput({
    instanceId: "inst-1",
    startSylId: "a",
    endSylId: "b",
    kind: "text",
    bodyText: "   ",
    hasAudio: false,
  });
  assert.equal(r.ok, false);
});

await test("validateNoteInput rejects a voice note with no audio", () => {
  const r = validateNoteInput({
    instanceId: "inst-1",
    startSylId: "a",
    endSylId: "b",
    kind: "voice",
    bodyText: "",
    hasAudio: false,
  });
  assert.equal(r.ok, false);
});

await test("validateNoteInput rejects missing anchors", () => {
  const r = validateNoteInput({
    instanceId: "inst-1",
    startSylId: "",
    endSylId: "b",
    kind: "text",
    bodyText: "hi",
    hasAudio: false,
  });
  assert.equal(r.ok, false);
});

console.log(`\n${passed} passed`);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd floating-pecha-ui && node tests/notes.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/notes.js'` (or import error).

- [ ] **Step 3: Implement `src/lib/notes.js`**

Create `src/lib/notes.js`:

```js
import { randomUUID } from "node:crypto";

const COLS =
  "id, user_id, instance_id, start_syl_id, end_syl_id, anchor_text, kind, body_text, audio_key, audio_duration_ms, visibility, created_at, updated_at";

const KINDS = new Set(["text", "voice"]);

/**
 * Validate raw note input. Returns { ok: true } or { ok: false, error }.
 * No size limits (product decision): only structural validity is enforced.
 */
export function validateNoteInput({ instanceId, startSylId, endSylId, kind, bodyText, hasAudio }) {
  if (!instanceId || !instanceId.trim()) return { ok: false, error: "instance_id requis" };
  if (!startSylId || !endSylId) return { ok: false, error: "Ancre manquante" };
  if (!KINDS.has(kind)) return { ok: false, error: "kind invalide" };
  if (kind === "text" && (!bodyText || !bodyText.trim())) {
    return { ok: false, error: "Note texte vide" };
  }
  if (kind === "voice" && !hasAudio) {
    return { ok: false, error: "Note vocale sans audio" };
  }
  return { ok: true };
}

export async function listNotes(db, userId, instanceId) {
  const { results } = await db
    .prepare(
      `SELECT ${COLS} FROM notes WHERE user_id = ? AND instance_id = ? ORDER BY created_at ASC`
    )
    .bind(userId, instanceId)
    .all();
  return results ?? [];
}

export async function getNote(db, id, userId) {
  const row = await db
    .prepare(`SELECT ${COLS} FROM notes WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first();
  return row ?? null;
}

export async function createNote(
  db,
  { userId, instanceId, startSylId, endSylId, anchorText, kind, bodyText, audioKey, audioDurationMs }
) {
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO notes
         (id, user_id, instance_id, start_syl_id, end_syl_id, anchor_text, kind, body_text, audio_key, audio_duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      userId,
      instanceId,
      startSylId,
      endSylId,
      anchorText ?? null,
      kind,
      bodyText ?? null,
      audioKey ?? null,
      audioDurationMs ?? null
    )
    .run();
  return getNote(db, id, userId);
}

export async function updateNote(db, id, userId, { bodyText }) {
  await db
    .prepare(
      `UPDATE notes SET body_text = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?`
    )
    .bind(bodyText ?? null, id, userId)
    .run();
}

export async function deleteNote(db, id, userId) {
  await db
    .prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
}
```

Note: `createNote`'s test uses a `fakeDb` whose `first` is `null`, so `getNote` returns `null` there — but the test reads the object built before the DB round-trip. To keep `createNote` test-friendly **and** correct in production, return a constructed object instead of re-reading. Replace the final line of `createNote` with:

```js
  return {
    id,
    user_id: userId,
    instance_id: instanceId,
    start_syl_id: startSylId,
    end_syl_id: endSylId,
    anchor_text: anchorText ?? null,
    kind,
    body_text: bodyText ?? null,
    audio_key: audioKey ?? null,
    audio_duration_ms: audioDurationMs ?? null,
    visibility: "private",
  };
```

(Do not keep the `return getNote(...)` line.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd floating-pecha-ui && node tests/notes.test.mjs`
Expected: PASS — `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add floating-pecha-ui/src/lib/notes.js floating-pecha-ui/tests/notes.test.mjs
git commit -m "feat(notes): D1 data-access layer with validation"
```

---

## Task 3: `note-selection.js` anchor resolution (TDD)

Pure helpers used by the reader to turn a browser selection into `start_syl_id`/`end_syl_id`. Kept DOM-agnostic so they unit-test in Node with plain objects.

**Files:**
- Create: `src/lib/note-selection.js`
- Test: `tests/noteSelection.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/noteSelection.test.mjs`:

```js
// Run: node tests/noteSelection.test.mjs
// Unit tests for src/lib/note-selection.js (DOM-agnostic).

import assert from "node:assert/strict";
import { closestSylId, orderAnchors } from "../src/lib/note-selection.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// Build a fake node chain: leaf -> span(id=X) -> div(no id).
function node(id, parent) {
  return { id: id ?? "", parentElement: parent ?? null };
}

const isSylId = (id) => new Set(["s1", "s2", "s3"]).has(id);

test("closestSylId returns the id of the nearest ancestor that is a syllable", () => {
  const span = node("s2", node("", null));
  const leaf = node("", span);
  assert.equal(closestSylId(leaf, isSylId), "s2");
});

test("closestSylId returns null when no ancestor is a syllable", () => {
  const leaf = node("", node("not-a-syl", null));
  assert.equal(closestSylId(leaf, isSylId), null);
});

test("closestSylId handles the node itself being the syllable", () => {
  const span = node("s1", null);
  assert.equal(closestSylId(span, isSylId), "s1");
});

test("orderAnchors keeps order when start precedes end", () => {
  const indexOf = new Map([["s1", 0], ["s2", 1], ["s3", 2]]);
  assert.deepEqual(orderAnchors("s1", "s3", indexOf), { startSylId: "s1", endSylId: "s3" });
});

test("orderAnchors swaps when selection runs backwards", () => {
  const indexOf = new Map([["s1", 0], ["s2", 1], ["s3", 2]]);
  assert.deepEqual(orderAnchors("s3", "s1", indexOf), { startSylId: "s1", endSylId: "s3" });
});

test("orderAnchors collapses a single-syllable selection", () => {
  const indexOf = new Map([["s1", 0]]);
  assert.deepEqual(orderAnchors("s1", "s1", indexOf), { startSylId: "s1", endSylId: "s1" });
});

console.log(`\n${passed} passed`);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd floating-pecha-ui && node tests/noteSelection.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/note-selection.js'`.

- [ ] **Step 3: Implement `src/lib/note-selection.js`**

Create `src/lib/note-selection.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd floating-pecha-ui && node tests/noteSelection.test.mjs`
Expected: PASS — `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add floating-pecha-ui/src/lib/note-selection.js floating-pecha-ui/tests/noteSelection.test.mjs
git commit -m "feat(notes): selection-to-anchor resolution helpers"
```

---

## Task 4: `requireUser()` auth guard

**Files:**
- Create: `src/lib/note-auth.js`

- [ ] **Step 1: Implement the guard**

Create `src/lib/note-auth.js` (mirrors `src/lib/admin-auth.js`):

```js
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Authorization guard for /api/notes* routes. Returns { session } when a user
 * is logged in, or { response } with a 401 JSON error otherwise.
 *
 * Usage:
 *   const { session, response } = await requireUser();
 *   if (response) return response;
 *   // session.user.id is guaranteed
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session };
}
```

- [ ] **Step 2: Commit**

```bash
git add floating-pecha-ui/src/lib/note-auth.js
git commit -m "feat(notes): requireUser auth guard for note routes"
```

---

## Task 5: `/api/notes` list + create route

`GET` lists the user's notes for an instance. `POST` creates a note: JSON for text, `multipart/form-data` for voice (audio file written to R2).

**Files:**
- Create: `src/app/api/notes/route.js`

- [ ] **Step 1: Implement the route**

Create `src/app/api/notes/route.js`:

```js
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/note-auth";
import { listNotes, createNote, validateNoteInput } from "@/lib/notes";

export async function GET(request) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const instanceId = (searchParams.get("instance") || "").trim();
  if (!instanceId) {
    return NextResponse.json({ error: "instance requis" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const notes = await listNotes(env.DB, session.user.id, instanceId);
  return NextResponse.json({ notes });
}

// Map a recorded MIME type to an R2 key extension.
function extFor(contentType) {
  if (!contentType) return "bin";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mpeg")) return "mp3";
  return "bin";
}

export async function POST(request) {
  const { session, response } = await requireUser();
  if (response) return response;

  const userId = session.user.id;
  const { env } = getCloudflareContext();
  const contentType = request.headers.get("content-type") || "";

  let fields;
  let audioFile = null;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    audioFile = form.get("audio");
    fields = {
      instanceId: (form.get("instance_id") || "").toString(),
      startSylId: (form.get("start_syl_id") || "").toString(),
      endSylId: (form.get("end_syl_id") || "").toString(),
      anchorText: (form.get("anchor_text") || "").toString(),
      kind: (form.get("kind") || "").toString(),
      bodyText: (form.get("body_text") || "").toString(),
      audioDurationMs: Number(form.get("audio_duration_ms")) || null,
    };
  } else {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    fields = {
      instanceId: (body.instance_id || "").toString(),
      startSylId: (body.start_syl_id || "").toString(),
      endSylId: (body.end_syl_id || "").toString(),
      anchorText: (body.anchor_text || "").toString(),
      kind: (body.kind || "").toString(),
      bodyText: (body.body_text || "").toString(),
      audioDurationMs: Number(body.audio_duration_ms) || null,
    };
  }

  const hasAudio = !!(audioFile && typeof audioFile === "object" && audioFile.size > 0);
  const v = validateNoteInput({ ...fields, hasAudio });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // For a voice note, stream the blob into R2 before inserting the row, so we
  // never persist a voice note that points at a missing object.
  let audioKey = null;
  if (fields.kind === "voice") {
    const ext = extFor(audioFile.type);
    audioKey = `notes/${userId}/${randomUUID()}.${ext}`;
    try {
      await env.MEDIA.put(audioKey, audioFile.stream(), {
        httpMetadata: { contentType: audioFile.type || "application/octet-stream" },
      });
    } catch (err) {
      console.error("Note audio upload failed:", err);
      return NextResponse.json({ error: "Échec de l'upload audio" }, { status: 502 });
    }
  }

  const note = await createNote(env.DB, {
    userId,
    instanceId: fields.instanceId,
    startSylId: fields.startSylId,
    endSylId: fields.endSylId,
    anchorText: fields.anchorText || null,
    kind: fields.kind,
    bodyText: fields.bodyText || null,
    audioKey,
    audioDurationMs: fields.audioDurationMs,
  });

  return NextResponse.json({ note }, { status: 201 });
}
```

- [ ] **Step 2: Verify the route compiles (lint)**

Run: `cd floating-pecha-ui && npx eslint src/app/api/notes/route.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/api/notes/route.js
git commit -m "feat(notes): list + create API route (text JSON, voice multipart→R2)"
```

---

## Task 6: `/api/notes/[id]` edit + delete route

**Files:**
- Create: `src/app/api/notes/[id]/route.js`

- [ ] **Step 1: Implement the route**

Create `src/app/api/notes/[id]/route.js`:

```js
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/note-auth";
import { getNote, updateNote, deleteNote } from "@/lib/notes";

export async function PATCH(request, { params }) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const bodyText = (body.body_text ?? "").toString();
  const { env } = getCloudflareContext();

  const existing = await getNote(env.DB, id, session.user.id);
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  // A text note must keep non-empty body; a voice caption may be cleared.
  if (existing.kind === "text" && !bodyText.trim()) {
    return NextResponse.json({ error: "Note texte vide" }, { status: 400 });
  }

  await updateNote(env.DB, id, session.user.id, { bodyText });
  const note = await getNote(env.DB, id, session.user.id);
  return NextResponse.json({ note });
}

export async function DELETE(request, { params }) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const { env } = getCloudflareContext();

  const existing = await getNote(env.DB, id, session.user.id);
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  // Remove the R2 object first; if it fails we still proceed to delete the row
  // (an orphaned object is harmless and can be swept later).
  if (existing.audio_key) {
    try {
      await env.MEDIA.delete(existing.audio_key);
    } catch (err) {
      console.error("Note audio delete failed:", err);
    }
  }

  await deleteNote(env.DB, id, session.user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/api/notes/[id]/route.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "floating-pecha-ui/src/app/api/notes/[id]/route.js"
git commit -m "feat(notes): edit + delete API route (deletes R2 audio)"
```

---

## Task 7: `/api/notes/[id]/audio` streaming route

**Files:**
- Create: `src/app/api/notes/[id]/audio/route.js`

- [ ] **Step 1: Implement the route**

Create `src/app/api/notes/[id]/audio/route.js`:

```js
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/note-auth";
import { getNote } from "@/lib/notes";

export async function GET(request, { params }) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const { env } = getCloudflareContext();

  const note = await getNote(env.DB, id, session.user.id);
  if (!note || !note.audio_key) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const object = await env.MEDIA.get(note.audio_key);
  if (!object) {
    return NextResponse.json({ error: "Audio manquant" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream"
  );
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(object.body, { headers });
}
```

- [ ] **Step 2: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/api/notes/[id]/audio/route.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "floating-pecha-ui/src/app/api/notes/[id]/audio/route.js"
git commit -m "feat(notes): auth-guarded audio streaming route"
```

---

## Task 8: `useNotes` client hook

Fetches the instance's notes, exposes optimistic create/update/delete. UI components consume this.

**Files:**
- Create: `src/app/reader/useNotes.js`

- [ ] **Step 1: Implement the hook**

Create `src/app/reader/useNotes.js`:

```js
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Manages the logged-in user's notes for one teaching instance.
 * Returns { notes, loading, error, createNote, updateNote, deleteNote, reload }.
 *
 * `enabled` should be false when the user is logged out — the hook then stays
 * empty and makes no requests.
 */
export function useNotes(instanceId, enabled) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled || !instanceId) {
      setNotes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?instance=${encodeURIComponent(instanceId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch (err) {
      setError(err.message || "Erreur de chargement");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [instanceId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Create a note. `payload` is { startSylId, endSylId, anchorText, kind,
   * bodyText, audioBlob, audioDurationMs }. Returns the created note or throws.
   */
  const createNote = useCallback(
    async (payload) => {
      let res;
      if (payload.kind === "voice" && payload.audioBlob) {
        const form = new FormData();
        form.set("instance_id", instanceId);
        form.set("start_syl_id", payload.startSylId);
        form.set("end_syl_id", payload.endSylId);
        form.set("anchor_text", payload.anchorText || "");
        form.set("kind", "voice");
        form.set("body_text", payload.bodyText || "");
        form.set("audio_duration_ms", String(payload.audioDurationMs || 0));
        const ext = (payload.audioBlob.type || "").includes("webm") ? "webm" : "m4a";
        form.set("audio", payload.audioBlob, `note.${ext}`);
        res = await fetch("/api/notes", { method: "POST", body: form });
      } else {
        res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instance_id: instanceId,
            start_syl_id: payload.startSylId,
            end_syl_id: payload.endSylId,
            anchor_text: payload.anchorText || "",
            kind: "text",
            body_text: payload.bodyText || "",
          }),
        });
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const { note } = await res.json();
      setNotes((prev) => [...prev, note]);
      return note;
    },
    [instanceId]
  );

  const updateNote = useCallback(async (id, bodyText) => {
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body_text: bodyText }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `HTTP ${res.status}`);
    }
    const { note } = await res.json();
    setNotes((prev) => prev.map((n) => (n.id === id ? note : n)));
    return note;
  }, []);

  const deleteNote = useCallback(async (id) => {
    // Optimistic removal; restore on failure.
    let removed;
    setNotes((prev) => {
      removed = prev.find((n) => n.id === id);
      return prev.filter((n) => n.id !== id);
    });
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (!res.ok && removed) {
      setNotes((prev) => [...prev, removed]);
      throw new Error(`HTTP ${res.status}`);
    }
  }, []);

  return { notes, loading, error, createNote, updateNote, deleteNote, reload };
}
```

- [ ] **Step 2: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/reader/useNotes.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/reader/useNotes.js
git commit -m "feat(notes): useNotes client hook (fetch + optimistic CRUD)"
```

---

## Task 9: `VoiceRecorder` component

Encapsulates mic capture with `MediaRecorder`, preview, and re-record. Calls `onRecorded(blob, durationMs)` when a clip is ready, `onClear()` when discarded.

**Files:**
- Create: `src/app/reader/VoiceRecorder.js`

- [ ] **Step 1: Implement the component**

Create `src/app/reader/VoiceRecorder.js`:

```js
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inter } from "@/lib/theme";

// Pick a MIME type the browser can actually record. Safari cannot do webm.
function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export default function VoiceRecorder({ onRecorded, onClear }) {
  const [state, setState] = useState("idle"); // idle | recording | recorded | denied
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopTracks();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, stopTracks]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        const durationMs = Date.now() - startedAtRef.current;
        onRecorded?.(blob, durationMs);
        setState("recorded");
        stopTracks();
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("Mic access failed:", err);
      setState("denied");
    }
  }, [onRecorded, stopTracks]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSeconds(0);
    setState("idle");
    onClear?.();
  }, [previewUrl, onClear]);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className={`${inter.className} flex items-center gap-3`}>
      {state === "idle" && (
        <button type="button" onClick={start}
          className="px-3 py-1.5 rounded-md text-xs font-semibold r-text-accent border r-border r-hover-accent">
          ● Enregistrer
        </button>
      )}
      {state === "recording" && (
        <button type="button" onClick={stop}
          className="px-3 py-1.5 rounded-md text-xs font-semibold text-white"
          style={{ backgroundColor: "#8B1D1D" }}>
          ■ Stop · {mmss}
        </button>
      )}
      {state === "recorded" && previewUrl && (
        <>
          <audio src={previewUrl} controls className="h-8" />
          <button type="button" onClick={reset}
            className="text-xs r-text-muted r-hover-accent underline">
            Refaire
          </button>
        </>
      )}
      {state === "denied" && (
        <span className="text-xs" style={{ color: "#8B1D1D" }}>
          Micro indisponible — utilisez une note texte.
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/reader/VoiceRecorder.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/reader/VoiceRecorder.js
git commit -m "feat(notes): VoiceRecorder component (MediaRecorder + preview)"
```

---

## Task 10: `NoteComposer` component

Editor for creating/editing a note: a textarea plus the `VoiceRecorder`. Used both for new notes (with an anchor + excerpt) and editing an existing text note.

**Files:**
- Create: `src/app/reader/NoteComposer.js`

- [ ] **Step 1: Implement the component**

Create `src/app/reader/NoteComposer.js`:

```js
"use client";

import { useState } from "react";
import { inter } from "@/lib/theme";
import VoiceRecorder from "./VoiceRecorder";

/**
 * Create/edit a note. Props:
 * - anchorText: string excerpt of the selected span (shown as context)
 * - initialText: string (editing an existing note)
 * - editing: boolean (true → no voice option, just edit the text)
 * - onSubmit({ kind, bodyText, audioBlob, audioDurationMs }): Promise
 * - onCancel()
 */
export default function NoteComposer({
  anchorText,
  initialText = "",
  editing = false,
  onSubmit,
  onCancel,
}) {
  const [text, setText] = useState(initialText);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = editing
    ? text.trim().length > 0
    : text.trim().length > 0 || !!audioBlob;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const kind = !editing && audioBlob ? "voice" : "text";
      await onSubmit({ kind, bodyText: text, audioBlob, audioDurationMs });
    } catch (err) {
      setError(err.message || "Échec de l'enregistrement");
      setBusy(false);
    }
  };

  return (
    <div className={`${inter.className} flex flex-col gap-3`}>
      {anchorText && (
        <div className="text-xs r-text-muted border-l-2 r-border pl-2 line-clamp-2">
          {anchorText}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={editing ? "Modifier la note…" : "Écrire une note… (ou enregistrer un vocal)"}
        rows={4}
        className="w-full p-2 rounded-md border r-border bg-transparent text-sm r-text-1a resize-y"
      />
      {!editing && (
        <VoiceRecorder
          onRecorded={(blob, durationMs) => {
            setAudioBlob(blob);
            setAudioDurationMs(durationMs);
          }}
          onClear={() => {
            setAudioBlob(null);
            setAudioDurationMs(0);
          }}
        />
      )}
      {error && <div className="text-xs" style={{ color: "#8B1D1D" }}>{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-xs r-text-muted r-hover-accent">
          Annuler
        </button>
        <button type="button" onClick={submit} disabled={!canSubmit || busy}
          className="px-3 py-1.5 rounded-md text-xs font-semibold r-text-accent border r-border disabled:opacity-40">
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/reader/NoteComposer.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/reader/NoteComposer.js
git commit -m "feat(notes): NoteComposer editor (text + voice)"
```

---

## Task 11: `NotesTab` sidebar tab

Lists the instance's notes sorted by text position, with go-to/edit/delete and an inline voice player. Receives notes + handlers from the reader.

**Files:**
- Create: `src/app/reader/NotesTab.js`

- [ ] **Step 1: Implement the component**

Create `src/app/reader/NotesTab.js`:

```js
"use client";

import { useState } from "react";
import { inter } from "@/lib/theme";
import NoteComposer from "./NoteComposer";

/**
 * Right-sidebar tab listing the user's notes for the current teaching.
 * Props:
 * - notes: array of note rows (from useNotes)
 * - loggedIn: boolean
 * - manifestIndexOf: Map sylId -> manifest index (for sorting by position)
 * - onGoToNote(note): scroll the reader to the note's anchor
 * - onUpdateNote(id, bodyText): Promise
 * - onDeleteNote(id): Promise
 */
export default function NotesTab({
  notes,
  loggedIn,
  manifestIndexOf,
  onGoToNote,
  onUpdateNote,
  onDeleteNote,
}) {
  const [editingId, setEditingId] = useState(null);

  if (!loggedIn) {
    return (
      <p className={`${inter.className} text-xs r-text-muted`}>
        Connectez-vous pour créer et voir vos notes personnelles.
      </p>
    );
  }

  if (!notes.length) {
    return (
      <p className={`${inter.className} text-xs r-text-muted`}>
        Aucune note. Activez le mode annotation (bouton crayon), sélectionnez un
        passage, puis ajoutez une note.
      </p>
    );
  }

  const sorted = [...notes].sort(
    (a, b) =>
      (manifestIndexOf.get(a.start_syl_id) ?? 0) -
      (manifestIndexOf.get(b.start_syl_id) ?? 0)
  );

  return (
    <div className={`${inter.className} flex flex-col gap-3`}>
      {sorted.map((note) => (
        <div key={note.id} className="rounded-md border r-border p-3 flex flex-col gap-2">
          <button type="button" onClick={() => onGoToNote(note)}
            className="text-left text-xs r-text-muted r-hover-accent line-clamp-2">
            {note.anchor_text || "(passage)"}
          </button>

          {editingId === note.id ? (
            <NoteComposer
              editing
              initialText={note.body_text || ""}
              onSubmit={async ({ bodyText }) => {
                await onUpdateNote(note.id, bodyText);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              {note.kind === "voice" && (
                <audio src={`/api/notes/${note.id}/audio`} controls className="h-8 w-full" />
              )}
              {note.body_text && (
                <p className="text-sm r-text-1a whitespace-pre-wrap">{note.body_text}</p>
              )}
              <div className="flex items-center gap-3 text-[11px]">
                {note.kind === "text" && (
                  <button type="button" onClick={() => setEditingId(note.id)}
                    className="r-text-muted r-hover-accent underline">
                    Éditer
                  </button>
                )}
                <button type="button"
                  onClick={() => { if (confirm("Supprimer cette note ?")) onDeleteNote(note.id); }}
                  className="underline" style={{ color: "#8B1D1D" }}>
                  Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/reader/NotesTab.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/reader/NotesTab.js
git commit -m "feat(notes): NotesTab sidebar (list, go-to, edit, delete, voice playback)"
```

---

## Task 12: Highlight + annotation-mode CSS

**Files:**
- Modify: `src/app/reader/reader.css`

- [ ] **Step 1: Append the styles**

Append to `src/app/reader/reader.css`:

```css
/* ---- Personal notes ---- */

/* Annotated span — light amber wash, distinct from audio-segment highlights. */
.r-note-highlight {
  background-color: rgba(212, 175, 55, 0.16);
  border-radius: 0.125rem;
  cursor: pointer;
}
.r-note-highlight:hover {
  background-color: rgba(212, 175, 55, 0.28);
}

/* Annotation mode: subtle reminder strip + text cursor over the reading area. */
.r-annotate-mode {
  cursor: text;
}
.r-annotate-banner {
  position: fixed;
  top: 4rem; /* below the 4rem navbar */
  left: 0;
  right: 0;
  z-index: 50;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 0;
  background-color: rgba(212, 175, 55, 0.14);
  color: #8a6d1f;
}

/* Floating "+ Note" button anchored near a text selection. */
.r-note-add-btn {
  position: fixed;
  z-index: 70;
  transform: transl(-50%, 0);
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  color: #0a2347;
  background: radial-gradient(circle at 38% 30%, #e9c56b, #ecb320 58%, #a28348);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
```

Fix the typo in your editor before saving: `transform: translate(-50%, 0);` (not `transl`).

- [ ] **Step 2: Commit**

```bash
git add floating-pecha-ui/src/app/reader/reader.css
git commit -m "feat(notes): highlight, annotation-mode, and +Note button styles"
```

---

## Task 13: Wire annotation toggle into `ReaderNavbar`

**Files:**
- Modify: `src/app/reader/ReaderNavbar.js`

- [ ] **Step 1: Add props and the toggle button**

In `src/app/reader/ReaderNavbar.js`, extend the destructured props (after `onUpdatePref,`):

```js
  onUpdatePref,
  canAnnotate,
  annotateMode,
  onToggleAnnotate,
```

Then add this button as the **first** child inside `<div className="flex items-center gap-1">` (just before the search button):

```jsx
        {canAnnotate && (
          <button
            onClick={onToggleAnnotate}
            className={`p-2 rounded-md transition-colors duration-200 ${annotateMode ? "r-text-accent" : "r-text-muted r-hover-accent"}`}
            aria-label={annotateMode ? "Quitter le mode annotation" : "Activer le mode annotation"}
            aria-pressed={annotateMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
```

- [ ] **Step 2: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/reader/ReaderNavbar.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/reader/ReaderNavbar.js
git commit -m "feat(notes): annotation-mode toggle button in reader navbar"
```

---

## Task 14: Reader integration — state, selection, highlight, sidebar tab

This wires everything into `src/app/reader/page.js`. It is the largest task; do it as one change, then verify in the browser.

**Files:**
- Modify: `src/app/reader/page.js`

- [ ] **Step 1: Add imports**

Near the other reader imports (after `import SearchBar ...`), add:

```js
import { useSession } from "next-auth/react";
import { useNotes } from "./useNotes";
import { closestSylId, orderAnchors } from "@/lib/note-selection";
import NoteComposer from "./NoteComposer";
import NotesTab from "./NotesTab";
```

- [ ] **Step 2: Extend the tab list**

Change the `TABS` constant near the top of the file to include Notes:

```js
const TABS = [
  { key: "player", label: "Player" },
  { key: "info", label: "Info" },
  { key: "notes", label: "Notes" },
];
```

- [ ] **Step 3: Add session, notes hook, and annotation state**

Inside `ReaderContent`, after `const audio = useAudioPlayer();`, add:

```js
  const { data: session } = useSession();
  const loggedIn = !!session?.user?.id;

  const [annotateMode, setAnnotateMode] = useState(false);
  // Pending selection awaiting the "+ Note" button: { startSylId, endSylId, anchorText, x, y }
  const [pendingSelection, setPendingSelection] = useState(null);
  // When set, the composer panel is open for this anchor.
  const [composerAnchor, setComposerAnchor] = useState(null);

  const {
    notes,
    createNote: createNoteApi,
    updateNote: updateNoteApi,
    deleteNote: deleteNoteApi,
  } = useNotes(instanceId, loggedIn);
```

- [ ] **Step 4: Build a sylId → manifest index map and a note-highlight set**

After the `paragraphs` useMemo (around line 603), add:

```js
  // sylId -> manifest index, for ordering anchors and sorting notes by position.
  const manifestIndexOf = useMemo(() => {
    const m = new Map();
    manifest.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [manifest]);

  // Set of every syllable id covered by a note's [start..end] span.
  const noteHighlightSet = useMemo(() => {
    const set = new Set();
    for (const note of notes) {
      const a = manifestIndexOf.get(note.start_syl_id);
      const b = manifestIndexOf.get(note.end_syl_id);
      if (a == null || b == null) continue; // anchor broken — shown in tab only
      for (let i = a; i <= b; i++) set.add(manifest[i].id);
    }
    return set;
  }, [notes, manifestIndexOf, manifest]);
```

- [ ] **Step 5: Capture text selections while in annotation mode**

After the handlers section (near `handleSyllableClick`), add this effect inside `ReaderContent`:

```js
  // While annotation mode is on, watch for a finished text selection and show
  // the "+ Note" button near it.
  useEffect(() => {
    if (!annotateMode) {
      setPendingSelection(null);
      return;
    }
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPendingSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const isSyl = (id) => manifestIndexOf.has(id);
      const startId = closestSylId(range.startContainer, isSyl);
      const endId = closestSylId(range.endContainer, isSyl);
      if (!startId || !endId) {
        setPendingSelection(null);
        return;
      }
      const { startSylId, endSylId } = orderAnchors(startId, endId, manifestIndexOf);
      const anchorText = sel.toString().slice(0, 280);
      const rect = range.getBoundingClientRect();
      setPendingSelection({
        startSylId,
        endSylId,
        anchorText,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [annotateMode, manifestIndexOf]);
```

- [ ] **Step 6: Add note action handlers**

After the effect above, add:

```js
  const handleCreateNote = useCallback(
    async ({ kind, bodyText, audioBlob, audioDurationMs }) => {
      if (!composerAnchor) return;
      await createNoteApi({
        startSylId: composerAnchor.startSylId,
        endSylId: composerAnchor.endSylId,
        anchorText: composerAnchor.anchorText,
        kind,
        bodyText,
        audioBlob,
        audioDurationMs,
      });
      setComposerAnchor(null);
      setPendingSelection(null);
      window.getSelection()?.removeAllRanges();
    },
    [composerAnchor, createNoteApi]
  );

  const handleGoToNote = useCallback(
    (note) => {
      setActiveTab("notes");
      scrollToSyllable(note.start_syl_id, paragraphs);
    },
    [paragraphs]
  );
```

- [ ] **Step 7: Disable audio click in annotation mode**

Modify `handleSyllableClick` so it no-ops while annotating. Change its first line (inside the `useCallback`) to early-return:

```js
  const handleSyllableClick = useCallback(
    (sylId) => {
      if (annotateMode) return; // selection drives annotation; ignore audio click
      setActiveSylId((prev) => {
```

And add `annotateMode` to that `useCallback` dependency array (change `[activeCommentary, audio]` → `[activeCommentary, audio, annotateMode]`).

- [ ] **Step 8: Pass note highlighting into the paragraph renderer**

In the `LazyParagraph` props (the `paragraphs.map(...)` near the end), add two props:

```jsx
                handleSyllableClick={handleSyllableClick}
                uchen={uchen}
                sylIdToSections={sylIdToSections}
                noteHighlightSet={noteHighlightSet}
                onNoteSylClick={(sylId) => {
                  const n = notes.find((nt) => {
                    const a = manifestIndexOf.get(nt.start_syl_id);
                    const b = manifestIndexOf.get(nt.end_syl_id);
                    const i = manifestIndexOf.get(sylId);
                    return a != null && b != null && i != null && i >= a && i <= b;
                  });
                  if (n) { setSidebarOpen(true); setActiveTab("notes"); }
                }}
```

Then update the `LazyParagraph` component signature to accept `noteHighlightSet` and `onNoteSylClick`, and in `renderSyl` add the highlight class + click. Inside `renderSyl`, after `const isAnyMatch = ...;` add:

```js
    const isNoted = noteHighlightSet?.has(syl.id);
```

In the same function, extend the `bgClass`/`extraClass` logic: after the existing `if/else if` chain for matches/playing/hovered, add:

```js
    if (isNoted && !bgClass) extraClass = `${extraClass} r-note-highlight`;
```

And make a noted, non-audio syllable clickable: change the `onClick` on the `<span>` to:

```jsx
        onClick={
          hasMedia
            ? () => handleSyllableClick(syl.id)
            : isNoted
            ? () => onNoteSylClick?.(syl.id)
            : undefined
        }
```

(Leave the rest of `renderSyl` unchanged. `noteHighlightSet`/`onNoteSylClick` must be added to the `LazyParagraph` destructured props list.)

- [ ] **Step 9: Apply annotation-mode class + banner to the reading area**

On the `<main>` element, append `annotateMode ? " r-annotate-mode" : ""` to its `className`. Immediately after `<SearchBar .../>` in the render, add the banner:

```jsx
      {annotateMode && (
        <div className="r-annotate-banner">
          Mode annotation — sélectionnez un passage pour ajouter une note
        </div>
      )}
```

- [ ] **Step 10: Render the floating "+ Note" button and the composer**

Inside the `<ReaderLayout>` children, just before the `<FloatingPopover .../>`, add:

```jsx
        {pendingSelection && !composerAnchor && (
          <button
            type="button"
            className="r-note-add-btn"
            style={{ left: pendingSelection.x, top: pendingSelection.y }}
            onMouseDown={(e) => e.preventDefault()} // keep the selection alive
            onClick={() => setComposerAnchor(pendingSelection)}
          >
            + Note
          </button>
        )}
```

Then, just after the closing `</ReaderLayout>` (before `{studyOpen && ...}`), add the composer panel:

```jsx
      {composerAnchor && (
        <div
          className="fixed z-70 right-6 bottom-20 w-80 max-w-[90vw] p-4 rounded-lg border r-border r-bg shadow-xl"
        >
          <NoteComposer
            anchorText={composerAnchor.anchorText}
            onSubmit={handleCreateNote}
            onCancel={() => { setComposerAnchor(null); setPendingSelection(null); }}
          />
        </div>
      )}
```

- [ ] **Step 11: Add the Notes tab body in the sidebar**

In `sidebarContent`, after the `{activeTab === "info" && (... )}` block, add:

```jsx
        {activeTab === "notes" && (
          <NotesTab
            notes={notes}
            loggedIn={loggedIn}
            manifestIndexOf={manifestIndexOf}
            onGoToNote={handleGoToNote}
            onUpdateNote={updateNoteApi}
            onDeleteNote={deleteNoteApi}
          />
        )}
```

- [ ] **Step 12: Pass annotation props to `ReaderNavbar`**

Update the `<ReaderNavbar .../>` usage to add:

```jsx
        prefs={prefs}
        onUpdatePref={updatePref}
        canAnnotate={loggedIn}
        annotateMode={annotateMode}
        onToggleAnnotate={() => setAnnotateMode((v) => !v)}
```

- [ ] **Step 13: Verify lint**

Run: `cd floating-pecha-ui && npx eslint src/app/reader/page.js`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add floating-pecha-ui/src/app/reader/page.js
git commit -m "feat(notes): integrate notes into the reader (mode, selection, highlight, tab)"
```

---

## Task 15: Full test + lint + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole unit suite**

Run: `cd floating-pecha-ui && npm test`
Expected: every `tests/*.test.mjs` prints `ok` lines and the process exits 0 (includes `notes.test.mjs` and `noteSelection.test.mjs`).

- [ ] **Step 2: Lint the project**

Run: `cd floating-pecha-ui && npm run lint`
Expected: no errors.

- [ ] **Step 3: Start the Workers-runtime dev server**

Run: `cd floating-pecha-ui && npm run dev:cf`
Expected: serves on `http://localhost:8787` (first build takes 1–2 min). Ensure `.dev.vars` has a real `AUTH_SECRET` and migrations were applied (`npm run db:apply`).

- [ ] **Step 4: Manual verification checklist**

Log in (e.g. the seeded `admin` account), open a teaching in the reader (`/reader?instance=...`), then verify:

1. The pencil (annotation) button appears in the navbar only when logged in. Log out → it disappears.
2. Click it → the annotation banner shows; clicking syllables no longer opens the audio popover.
3. Select a span of text → the "+ Note" pill appears near the selection.
4. Click "+ Note" → composer opens. Type text → Enregistrer → the span is highlighted amber; the note appears in the Notes sidebar tab.
5. Create a **voice** note: select a span, "+ Note", record a few seconds, stop, preview plays, Enregistrer. The note appears with an audio player in the Notes tab and plays back.
6. In the Notes tab: "Éditer" updates a text note; "Aller au passage" scrolls/highlights; "Supprimer" removes it and clears the highlight.
7. Reload the page → notes persist (loaded from D1). A voice note still plays (served from R2 via `/api/notes/{id}/audio`).
8. Open the reader logged out → the Notes tab shows the "connectez-vous" message and no highlights from other users appear.

- [ ] **Step 5: Apply migration to remote D1 (deploy prerequisite — do NOT deploy here)**

When ready to ship (separate from this plan's local work), the remote DB needs the migration:
Run: `cd floating-pecha-ui && npm run db:apply:remote`
Expected: `0004_notes.sql` applied to the remote database. (Deployment itself follows the existing `npm run deploy` flow in CLAUDE.md.)

- [ ] **Step 6: Finalize the branch**

The feature branch `feature/reader-personal-notes` now holds the spec, plan, and implementation. Use the `superpowers:finishing-a-development-branch` skill to decide on merge/PR.

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), API incl. audio streaming (Tasks 5–7), `requireUser` auth (Task 4), user-scoping + validation (Task 2), selection→anchor (Task 3), annotation-mode toggle (Task 13), selection→+Note→composer with text+voice (Tasks 9–10, 14), highlight + Notes sidebar tab (Tasks 11–12, 14), error/permission fallbacks (denied mic in Task 9, optimistic-restore delete in Task 8, anchor-broken→tab-only in Task 14 Step 4), tests (Tasks 2–3, 15). "No size limits" reflected in `validateNoteInput` (Task 2) and recorder (Task 9). Out-of-scope items (sharing/replies/transcription) are not built; `visibility` column is present but unused.
- **Type consistency:** field names match across layers — DB columns are snake_case (`start_syl_id`, `body_text`, `audio_key`, `audio_duration_ms`); `notes.js` args are camelCase (`startSylId`, `bodyText`, …); API translates form/JSON snake_case → `notes.js` camelCase; `useNotes` sends snake_case to the API and stores returned rows (snake_case) in state; components read snake_case (`note.body_text`, `note.kind`, `note.anchor_text`). `closestSylId`/`orderAnchors` names match between Task 3 and Task 14.
- **Note:** UI components (Tasks 8–14) are verified manually (Task 15), not unit-tested — the repo's harness is Node-only with no DOM/React testing library, consistent with the existing untested components. The testable pure logic (`notes.js`, `note-selection.js`) is covered by TDD in Tasks 2–3.
