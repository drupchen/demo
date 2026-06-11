#!/usr/bin/env node
// Seed three initial users into the local D1 via wrangler.
// Reads passwords from env vars; falls back to prompting via stdin.
//
// Usage:
//   SEED_PASSWORD_PUBLIC=... \
//   SEED_PASSWORD_NGONDRO=... \
//   SEED_PASSWORD_DZOGRIM=... \
//   npm run seed
//
// For remote D1, pass --remote.

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/lib/passwords.js";

const REMOTE = process.argv.includes("--remote");
const TARGET_FLAG = REMOTE ? "--remote" : "--local";

const USERS = [
  { username: "public",  name: "Public Visitor",   level: 0, env: "SEED_PASSWORD_PUBLIC"  },
  { username: "ngondro", name: "Ngondro Student",  level: 1, env: "SEED_PASSWORD_NGONDRO" },
  { username: "dzogrim", name: "Dzogrim Student",  level: 4, env: "SEED_PASSWORD_DZOGRIM" },
];

function exec(sql) {
  const r = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", TARGET_FLAG, "--command", sql],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  if (r.status !== 0) {
    console.error(`wrangler d1 execute failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

for (const u of USERS) {
  const password = process.env[u.env];
  if (!password) {
    console.error(`Missing env var ${u.env} — set it before running seed.`);
    process.exit(2);
  }
  const id = randomUUID();
  const hash = await hashPassword(password);
  const sql =
    `INSERT INTO users (id, username, name, password_hash, access_level) ` +
    `VALUES ('${id}', '${sqlEscape(u.username)}', '${sqlEscape(u.name)}', '${sqlEscape(hash)}', ${u.level}) ` +
    `ON CONFLICT(username) DO UPDATE SET name=excluded.name, password_hash=excluded.password_hash, access_level=excluded.access_level, updated_at=unixepoch();`;
  console.log(`Seeding ${u.username} (level ${u.level})…`);
  exec(sql);
}

console.log("Seed complete.");
