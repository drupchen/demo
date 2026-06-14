// Run: node tests/adminUsers.test.mjs
// Unit tests for the admin CRUD functions in src/lib/users.js against a fake D1.

import assert from "node:assert/strict";
import {
  getUserByUsername,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  setPassword,
  countAdmins,
} from "../src/lib/users.js";

let passed = 0;
function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ok - ${name}`);
  });
}

// Fake D1 capturing bound calls; returns configured rows for first/all and a
// run result.
function fakeDb({ first = null, all = [], runResult = { success: true } } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async first() { return first; },
            async all() { return { results: all }; },
            async run() { return runResult; },
          };
        },
        // Allow prepare(sql).all() without bind (no params)
        async all() { calls.push({ sql, args: [] }); return { results: all }; },
        async first() { calls.push({ sql, args: [] }); return first; },
      };
    },
  };
}

await test("getUserByUsername selects role", async () => {
  const db = fakeDb({ first: { id: "1", username: "a", name: "A", password_hash: "h", access_level: 0, role: "admin" } });
  const u = await getUserByUsername(db, "a");
  assert.equal(u.role, "admin");
  assert.match(db.calls[0].sql, /role/i);
});

await test("listUsers returns rows without password_hash and ordered", async () => {
  const db = fakeDb({ all: [
    { id: "1", username: "a", name: "A", access_level: 0, role: "member", created_at: 1, updated_at: 1 },
  ] });
  const rows = await listUsers(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, "a");
  assert.ok(!("password_hash" in rows[0]));
  assert.doesNotMatch(db.calls[0].sql, /password_hash/i);
});

await test("createUser inserts id, hashed password, level and role", async () => {
  const db = fakeDb({});
  const row = await createUser(db, { username: "  bob ", name: "Bob", passwordHash: "HASH", accessLevel: 2, role: "member" });
  const call = db.calls[0];
  assert.match(call.sql, /INSERT INTO users/i);
  // username trimmed
  assert.ok(call.args.includes("bob"));
  assert.ok(call.args.includes("HASH"));
  assert.ok(call.args.includes(2));
  assert.ok(call.args.includes("member"));
  assert.equal(row.username, "bob");
  assert.ok(row.id);
});

await test("updateUser sets name, access_level, role and bumps updated_at", async () => {
  const db = fakeDb({});
  await updateUser(db, "id1", { name: "New", accessLevel: 3, role: "admin" });
  const call = db.calls[0];
  assert.match(call.sql, /UPDATE users SET/i);
  assert.match(call.sql, /updated_at\s*=\s*unixepoch\(\)/i);
  assert.deepEqual(call.args, ["New", 3, "admin", "id1"]);
});

await test("setPassword updates the hash by id", async () => {
  const db = fakeDb({});
  await setPassword(db, "id1", "NEWHASH");
  const call = db.calls[0];
  assert.match(call.sql, /UPDATE users SET password_hash/i);
  assert.deepEqual(call.args, ["NEWHASH", "id1"]);
});

await test("deleteUser deletes by id", async () => {
  const db = fakeDb({});
  await deleteUser(db, "id1");
  assert.match(db.calls[0].sql, /DELETE FROM users WHERE id\s*=\s*\?/i);
  assert.deepEqual(db.calls[0].args, ["id1"]);
});

await test("countAdmins counts role='admin'", async () => {
  const db = fakeDb({ first: { n: 2 } });
  const n = await countAdmins(db);
  assert.equal(n, 2);
  assert.match(db.calls[0].sql, /COUNT\(\*\).*role\s*=\s*'admin'/is);
});

console.log(`\n${passed} passed`);
