import { randomUUID } from "node:crypto";

const PUBLIC_COLS =
  "id, username, name, access_level, role, created_at, updated_at";

export async function getUserByUsername(db, username) {
  const row = await db
    .prepare(
      "SELECT id, username, name, password_hash, access_level, role FROM users WHERE username = ?"
    )
    .bind(username)
    .first();
  return row ?? null;
}

export async function getUserById(db, id) {
  const row = await db
    .prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ?`)
    .bind(id)
    .first();
  return row ?? null;
}

export async function listUsers(db) {
  const { results } = await db
    .prepare(`SELECT ${PUBLIC_COLS} FROM users ORDER BY created_at DESC`)
    .all();
  return results ?? [];
}

export async function createUser(db, { username, name, passwordHash, accessLevel, role }) {
  const id = randomUUID();
  const u = username.trim();
  await db
    .prepare(
      "INSERT INTO users (id, username, name, password_hash, access_level, role) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, u, name, passwordHash, accessLevel, role)
    .run();
  return { id, username: u, name, access_level: accessLevel, role };
}

export async function updateUser(db, id, { name, accessLevel, role }) {
  await db
    .prepare(
      "UPDATE users SET name = ?, access_level = ?, role = ?, updated_at = unixepoch() WHERE id = ?"
    )
    .bind(name, accessLevel, role, id)
    .run();
}

export async function setPassword(db, id, passwordHash) {
  await db
    .prepare(
      "UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?"
    )
    .bind(passwordHash, id)
    .run();
}

export async function deleteUser(db, id) {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
}

export async function countAdmins(db) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
    .first();
  return row?.n ?? 0;
}
