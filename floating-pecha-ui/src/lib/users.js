export async function getUserByUsername(db, username) {
  const row = await db
    .prepare("SELECT id, username, name, password_hash, access_level FROM users WHERE username = ?")
    .bind(username)
    .first();
  return row ?? null;
}
