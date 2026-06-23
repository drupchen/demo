-- 0005_note_quote_anchors.sql
-- Durable text-quote anchoring (W3C TextQuoteSelector style): a note resolves to
-- the current text by matching its quoted text + surrounding context, so it
-- survives manifest re-ingestion (syllable UUIDs are position-derived and change
-- when the source text is edited). start_syl_id/end_syl_id remain as a fast-path
-- hint; anchor_text now holds the full exact quote.
--
-- Existing notes are wiped to start clean on the new scheme (approved).

DELETE FROM notes;

ALTER TABLE notes ADD COLUMN quote_prefix TEXT;
ALTER TABLE notes ADD COLUMN quote_suffix TEXT;
