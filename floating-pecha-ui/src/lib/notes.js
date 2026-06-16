import { randomUUID } from "node:crypto";

const COLS =
  "id, user_id, instance_id, start_syl_id, end_syl_id, anchor_text, kind, body_text, audio_key, audio_duration_ms, visibility, created_at, updated_at";

const KINDS = new Set(["text", "voice"]);

/**
 * Validate raw note input. Returns { ok: true } or { ok: false, error }.
 * No size limits (product decision): only structural validity is enforced.
 */
export function validateNoteInput({ instanceId, startSylId, endSylId, kind, bodyText, hasAudio }) {
  if (!instanceId || !instanceId.trim()) return { ok: false, error: "instance_id required" };
  if (!startSylId || !endSylId) return { ok: false, error: "Missing anchor" };
  if (!KINDS.has(kind)) return { ok: false, error: "Invalid kind" };
  if (kind === "text" && (!bodyText || !bodyText.trim())) {
    return { ok: false, error: "Empty text note" };
  }
  if (kind === "voice" && !hasAudio) {
    return { ok: false, error: "Voice note without audio" };
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
