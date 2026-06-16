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
