-- 0002_segments_fts.sql
-- Full-text search over teaching segments, served entirely from D1 (SQLite FTS5).
-- This is the v1 search backend; it replaces the retired OpenSearch path. A
-- dedicated engine (Meilisearch) is only revisited if/when the faceted
-- multi-entity search becomes product scope — see DECISIONS.md (2026-06-14).
--
-- Tokenizer: trigram. Chosen over unicode61 because it is script-agnostic and
-- does NOT strip or merge Tibetan combining marks (vowel signs, subjoined
-- consonants). It matches any substring of 3+ codepoints, which fits Tibetan
-- phrase lookup well. Tibetan word-level normalisation (BDRC lucene-bo affix
-- stripping) is deferred to the Python data pipeline and is engine-agnostic, so
-- moving to a real word tokenizer or to Meilisearch later requires no schema
-- rethink here.
--
-- Single FTS5 table with UNINDEXED metadata columns: the corpus is tiny
-- (~1.5k segments now, ~55k at full scale), so there are no joins and no
-- content-sync triggers. The index is rebuilt wholesale by
-- scripts/build-search-index.mjs whenever the archive data changes.

DROP TABLE IF EXISTS segments_fts;

CREATE VIRTUAL TABLE segments_fts USING fts5(
  text,
  segment_id     UNINDEXED,
  instance_id    UNINDEXED,
  teaching_title UNINDEXED,
  session_id     UNINDEXED,
  start          UNINDEXED,
  first_syl_id   UNINDEXED,
  access_level   UNINDEXED,
  tokenize = 'trigram'
);
