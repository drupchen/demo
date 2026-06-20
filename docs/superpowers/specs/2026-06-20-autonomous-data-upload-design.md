# Autonomous Data Upload — Publish Archive Data Without Redeploy

**Date:** 2026-06-20
**Status:** Approved (design) — pending written-spec review
**Scope:** Let a non-developer admin publish/update teaching archive data (and refresh
search) entirely from the web, with no local CLI and no redeploy — by uploading the ZIP
produced by the existing Python pipeline. Closes a content access-control gap as part of
the same change. Plus three pipeline-infra cleanups.

## Goal

Today every archive update requires the maintainer's machine: run the Python pipeline →
copy JSON into `public/data/archive/` → `npm run search:index:remote` → `npm run deploy`
(full OpenNext build + `wrangler deploy`). The collaborator who authors the data cannot
do any of this.

After this work, an `admin` can drag the ZIP of the pipeline's `output/` directory into a
new **Contenu** section of `/admin`, see validation feedback, and publish. The reader
sees the new data and search reflects it **immediately, with no redeploy**.

## Why this shape (the binding constraints)

- **`botok` (Tibetan tokenizer) is Python-native** — DOCX→syllables and SRT→alignment
  cannot run on Cloudflare. So "upload a DOCX, it appears" is not feasible server-side.
  The collaborator already runs the pipeline (he built it), so **uploading its prepared
  output** is the right autonomy boundary.
- **The pipeline always regenerates the whole archive.** `generate_catalog.py`,
  `base_layer_ingest.py`, `srt_sessions_1_parse.py`, `srt_sessions_3_combine_sessions.py`
  all loop over the entire catalog. So `output/` is a **complete snapshot** (catalog +
  every instance folder) on every run — the natural upload unit.
- **Almost all reader data is currently frozen into the deploy.** `catalog.json`,
  `manifest.json`, `*_compiled_sessions.json`, `sapche.json`, `transcription_*.json` are
  static assets fetched from `/data/archive/…`. Changing any of them needs a full
  redeploy. **Moving them to R2 is what unlocks no-redeploy publishing.**

## Key Decisions

- **Data home moves to R2** under `archive/{instance}/…` (existing `MEDIA` binding).
  Reader/search read from R2, not static assets.
- **Content is served through an access-checked API** (`/api/content/...`), not a public
  URL — this is the security fix (see below).
- **Upload = upsert, never destructive.** Instances present in the ZIP are written /
  overwritten in R2; instances **absent** from the ZIP are **never deleted** (guards
  against accidental data loss if a snapshot is partial). `catalog.json` is replaced
  wholesale (it is always complete and is the authority for access levels).
- **ZIP is unpacked in the browser**, individual instance bundles are POSTed to the API.
  Avoids Worker unzip memory pressure and gives instant per-file validation feedback.
  **Server always re-validates** — the client is never trusted.
- **Search index rebuilds server-side during upload**, per affected instance, using the
  manifest + sessions already in hand. No separate script run, no redeploy.
- **Catalog stays a JSON file** (now in R2), not moved into D1 — less complexity.

## Security fix — access-controlled content (in scope)

Current gap: the reader fetches `/data/archive/{id}/manifest.json` (and sessions, sapche,
transcription) as **static assets with no auth**. The access onion only filters the
*search results* and the *catalog listing* (client-side). So the **full text of a gated
teaching is retrievable by anyone who knows the instance URL.**

Fix, enabled by the R2 move:

- `GET /api/content/{instance}/{file}` — resolves the instance's required access level
  from the catalog, compares to `session.user.accessLevel` (server-side, authoritative),
  serves the object from R2 (`env.MEDIA.get`) on success, else `403`.
- Catalog listing is served **filtered by access level** server-side, so the existence of
  gated teachings is not exposed either.
- **Caching:** public (level 0) content gets aggressive edge caching; gated content uses
  private/no-store. Repeat reads of public content are largely served from cache, not R2.

## Data home & runtime read path

R2 layout (bucket `rabsal-dawa-media`, binding `MEDIA`):

```
archive/catalog.json
archive/{instance}/manifest.json
archive/{instance}/{instance}_compiled_sessions.json
archive/{instance}/sapche.json                          (optional)
archive/{instance}/transcription_manifest.json          (optional)
archive/{instance}/{instance}_transcription_sessions.json (optional)
```

Reader/runtime changes:
- A single helper `contentUrl(instance, file)` returns `/api/content/{instance}/{file}`.
- `src/app/reader/page.js` (the `fetch('/data/archive/...')` block) and
  `src/lib/useTranscription.js` switch to that helper.
- The archive listing page consumes the **filtered catalog** endpoint instead of fetching
  the raw `catalog.json` asset.

## Admin upload flow — `/admin/contenu`

New admin-only section beside **Membres** (same `role === 'admin'` gate, `requireAdmin()`
on every route).

1. Admin selects/drops the ZIP of `output/`.
2. **Browser** unzips (JS zip lib), discovers `catalog.json` + instance folders.
3. **Client-side pre-validation** (instant feedback) then **per-instance POST** to the
   API. The server **re-validates** before writing.
4. UI shows per-instance status (valid / errors / published) and a final summary.

### Validation rules (enforced server-side; mirrored client-side for UX)

- `catalog.json` present, parses, and has the expected shape (array of teachings with
  `Instances[]` carrying `Instance_ID` and an access level).
- For each instance folder: `manifest.json` and `{instance}_compiled_sessions.json`
  present and parse as the expected arrays.
- **Referential integrity:** every `syl_uuid` referenced by a session segment exists in
  that instance's manifest. This is the check that prevents a silently broken teaching.
- Optional files (`sapche.json`, `transcription_*.json`), if present, parse correctly;
  absent is fine.
- Any failure for an instance → that instance is **rejected and not written**; other
  instances and the upload as a whole continue. Errors are reported clearly.

### Publish (server side, per instance)

- Write each instance's JSON files to R2 under `archive/{instance}/…`.
- Rebuild that instance's FTS rows in D1: delete existing rows for the instance, then
  reconstruct segments (reuse `reconstructSegments` logic from
  `scripts/build-search-index.mjs`, extracted into a shared module) and insert, stamping
  `access_level` from the catalog. Honor the existing ~60 KB statement batching.
- After all instances: write `catalog.json` to R2 (wholesale).
- Upsert semantics: never delete instances absent from the ZIP.

### Upload API

| Route | Method | Purpose |
|---|---|---|
| `api/admin/content/route.js` | `GET` | List published instances + status (files present, last updated) |
| `api/admin/content/route.js` | `POST` | Validate + publish one instance bundle (JSON files + its catalog context) |
| `api/admin/content/catalog/route.js` | `PUT` | Replace `catalog.json` wholesale (final step of an upload) |

(Exact route split may be refined during planning; the contract is: per-instance
validate+publish, then catalog replace.)

## Search index module

Extract the reusable parts of `scripts/build-search-index.mjs`
(`reconstructSegments`, `rowsToSql`/equivalent, batching) into a shared module importable
by both the CLI script (unchanged behavior) and the upload route (runs against the `DB`
binding directly). `access_level` comes from the catalog, as today.

## Migration / cutover (one-time)

1. Script: upload current `public/data/archive/` to R2 under `archive/…`.
2. Switch reader + listing to `/api/content` / filtered-catalog endpoint.
3. Keep the static path working until verified, then remove `public/data/archive` from
   the deploy and drop the now-dead static fetches.

## Pipeline-infra cleanups (in scope)

1. **`prepare_data/requirements.txt`** pinning `botok`, `python-docx`, `pysrt`,
   `thefuzz` (drop `opensearch-py`). Makes the pipeline reproducible on any machine.
2. **Configurable source paths** — replace the hardcoded
   `/media/drupchen/Khyentse Önang/...` base (in `generate_catalog.py`,
   `base_layer_ingest.py`, `srt_sessions_1_parse.py`) with an env var / CLI arg
   (e.g. `KHYENTSE_DATA_DIR`), with the current path as default.
3. **Remove OpenSearch** (dead — search is D1 FTS now): delete `opensearch_ingest.py`,
   `docker-compose.yml`, and the one-off `patch_corrected_audio_urls.py`; update the
   CLAUDE.md references. Keep `inspect_docx_xml.py` / `tok_check.py` (debug utilities).

## Out of Scope

- Automating the Python pipeline itself (e.g. GitHub Actions from raw DOCX/SRT). The
  collaborator runs the pipeline locally and uploads its output. Deferred unless he
  frequently adds brand-new texts.
- PostHog analytics — separate, follow-up task (done after this).
- Versioned snapshots / one-click rollback in R2 — nice-to-have, not v1. (Upsert +
  wholesale catalog is the safety model for v1.)
- Any change to how the Python pipeline tokenizes or aligns.

## Cost / free tier

At ~20 users this stays comfortably within Cloudflare's free tier. The change converts
free static-asset serving into metered Worker+R2 ops, but usage (a few thousand requests/
day, cache-absorbed content reads, tiny D1 search load) is orders of magnitude under the
limits. The real R2 storage watch-item is gallery video, unrelated to this change.

## Verification (manual + light automated)

Automated (repo's `tests/*.test.mjs` runner, `npm test`):
- ZIP/bundle validation rules: missing required file, unparseable JSON, orphan
  `syl_uuid` → rejected with a clear error.
- Search reconstruction: segments↔manifest consistency (logic already exported/testable).

Manual via `npm run dev:cf` (auth + D1 + R2 need the Workers runtime):
1. Run migration state + seed; upload a ZIP of `output/` as `admin`.
2. New/updated instance appears in the reader without redeploy; sapche/transcription show
   when present.
3. Search returns the freshly uploaded segments without redeploy.
4. Access control: a level-0 user gets `403` on `/api/content` for a gated instance and
   does not see it in the listing; a sufficiently-leveled user gets `200` and sees it.
5. Upsert safety: uploading a ZIP missing an instance does **not** remove the previously
   published instance.
6. Bad ZIP (orphan UUID in one instance) → that instance rejected, others still publish.
