// Run: node tests/users.test.mjs
// Unit tests for src/lib/users.js — getUserByUsername against a fake D1.

import assert from "node:assert/strict";
import { getUserByUsername } from "../src/lib/users.js";

let passed = 0;
function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ok - ${name}`);
  });
}

// Fake D1: records the last bound args and returns a fixed row.
function fakeDb(returnRow) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async first() {
              return returnRow ?? null;
            },
          };
        },
      };
    },
  };
}

await test("returns the row when D1 has the user", async () => {
  const db = fakeDb({
    id: "1", username: "public", name: "Public", password_hash: "h",
    access_level: 0,
  });
  const u = await getUserByUsername(db, "public");
  assert.equal(u.username, "public");
  assert.equal(u.access_level, 0);
});

await test("returns null when D1 has no matching user", async () => {
  const db = fakeDb(null);
  const u = await getUserByUsername(db, "nobody");
  assert.equal(u, null);
});

await test("binds username as the parameter", async () => {
  const db = fakeDb(null);
  await getUserByUsername(db, "ngondro");
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].args, ["ngondro"]);
  assert.match(db.calls[0].sql, /WHERE\s+username\s*=\s*\?/i);
});

console.log(`\n${passed} passed`);
