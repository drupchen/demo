# Decisions

## 2026-06-14 — v1 search runs on D1 SQLite FTS5, not a dedicated engine
**Chosen:** Serve v1 full-text search from a SQLite FTS5 virtual table (`segments_fts`, trigram tokenizer) inside the existing Cloudflare D1 database. No external search engine. `/api/search` queries D1 directly; `scripts/build-search-index.mjs` builds the index from the archive JSON.
**Alternatives:** Meilisearch Cloud (~$30/mo, no permanent free tier); self-hosted Meilisearch/Typesense on a Singapore VPS (~$12–24/mo + ops); external Postgres + `tsvector`/`pg_trgm` via Hyperdrive; client-side index (Pagefind/Orama).
**Why:**
- The corpus is tiny — 0.83 MB of Tibetan text / ~1 460 segments now, ~30 MB / ~55k segments at full scale (~150 teachings). FTS5 handles this with room to spare; volume is never the constraint here.
- Tibetan tokenization quality (the actual hard part) lives upstream in the Python pipeline and is engine-agnostic, so FTS5 gives the same match quality a dedicated engine would for pre-normalized tokens — the engine's own tokenizer barely matters.
- D1 now supports FTS5 virtual tables natively (verified 2026-06; historically it did not), so search runs $0 on the edge, behind Cloudflare, with no separate host exposed to the GFW and no ops.
- Client-side search is disqualified by the Access Onion: shipping a browser index would leak access-gated (level 1–4) text. FTS5 filters `access_level <= session level` server-side.
- Trigram tokenizer chosen over unicode61: script-agnostic, does not strip/merge Tibetan combining marks (vowel signs, subjoined consonants), matches any ≥3-codepoint substring. Verified live: `ན་མོ་ལོ་<<ཀེ་ཤྭ་རཱ་ཡ>>།`.
**Trade-offs:** No typo-tolerance / fuzzy / synonyms; relevance is BM25 only (no tuning); faceting, when it comes, must be hand-built in SQL (`GROUP BY COUNT`). Queries < 3 codepoints degrade to a `LIKE` scan. The build script duplicates the old OpenSearch text-reconstruction logic in JS.
**Revisit if:** The faceted multi-entity search mockup (Texts/Works/Persons/Topics/Places with counts, sort, multi-filter) enters scope, OR typo-tolerance/synonyms/rich multilingual ranking becomes a core product requirement → move to Meilisearch (Tibetan tokenization carries over unchanged; only the FTS5 schema/query glue is thrown away).
**Supersedes:** The May 2026 "DECIDED: Meilisearch" note in the production-deployment memory, which was explicitly conditioned on the faceted mockup being in launch scope. It is not in v1 scope.

---
