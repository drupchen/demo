// Run: node tests/passwords.test.mjs
// Unit tests for src/lib/passwords.js — bcryptjs hash + verify.

import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/passwords.js";

let passed = 0;
function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ok - ${name}`);
  });
}

await test("hashPassword returns a non-empty string distinct from the input", async () => {
  const hash = await hashPassword("hunter2");
  assert.equal(typeof hash, "string");
  assert.notEqual(hash, "hunter2");
  assert.ok(hash.length > 30, "bcrypt hash should be ~60 chars");
});

await test("verifyPassword returns true for the matching password", async () => {
  const hash = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter2", hash), true);
});

await test("verifyPassword returns false for a wrong password", async () => {
  const hash = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter3", hash), false);
});

await test("hashPassword produces a different hash each call (salted)", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b, "salts must differ → hashes must differ");
});

console.log(`\n${passed} passed`);
