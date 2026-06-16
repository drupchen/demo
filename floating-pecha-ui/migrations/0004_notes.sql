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
