-- 0005_note_offsets.sql
-- Character offsets within the start/end syllable, for character-exact note
-- highlighting. Nullable: notes created before this default to whole-syllable
-- highlighting.
ALTER TABLE notes ADD COLUMN start_offset INTEGER;
ALTER TABLE notes ADD COLUMN end_offset INTEGER;
