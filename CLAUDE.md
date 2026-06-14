# Rabsal Dawa (རབ་གསལ་ཟླ་བ། — The Brilliant Moon)

Digital archive of the recorded teachings of Dilgo Khyentse Rinpoche — preserved, aligned to their texts, and opened to all who wish to listen. Built by Shechen Archives.

> The local repo directory is still `khyentse-onang/` and the Next.js app subdirectory is still `floating-pecha-ui/` — both retained from the project's earlier names to avoid forced clones / path rewrites. All deployed Cloudflare resources use `rabsal-dawa*`.

## Project Structure

```
khyentse-onang/
├── floating-pecha-ui/     # Next.js 16 frontend (React 19, Tailwind 4)
│   ├── src/app/
│   │   ├── page.js                    # Landing page — cinematic scroll with video background
│   │   ├── layout.js                  # Root layout with NextAuth Providers + ArchiveHeader
│   │   ├── Providers.js               # NextAuth SessionProvider wrapper
│   │   ├── globals.css                # Tailwind + hyperaudio transcript styles
│   │   ├── archive/page.js            # Teaching catalog (browse + full-text search)
│   │   ├── reader/page.js             # "Floating Pecha" reader — syllable-level interactive text
│   │   ├── player/page.js             # Audio player with synced transcript + deep linking
│   │   ├── search/page.js             # Standalone search page (legacy, superseded by archive)
│   │   ├── world/page.js              # Photo/video gallery of Dilgo Khyentse Rinpoche
│   │   ├── components/
│   │   │   ├── ArchiveHeader.js       # Global nav with breadcrumbs + auth login/logout
│   │   │   └── Footer.js              # Simple copyright footer (Shechen Archives)
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.js  # Auth.js v5 handlers (D1-backed Credentials provider)
│   │   │   ├── search/route.js              # Search API — D1 SQLite FTS5 (trigram), access-filtered by session
│   │   │   └── gallery/route.js             # Gallery route (reads pre-built static manifest)
│   │   └── lib/
│   │       └── theme.js               # Design system: fonts (Uchen/Inter), colors, sizes
│   ├── public/data/                   # Static data files (gitignored, not in repo)
│   │   ├── archive/{instance_id}/     # Per-teaching JSON data (manifest + sessions)
│   │   │   ├── manifest.json          # Syllable-level text data (id, text, size, nature)
│   │   │   └── *_compiled_sessions.json  # Audio segments with timestamps + syllable mappings
│   │   ├── archive/catalog.json       # Teaching catalog metadata
│   │   └── world/gallery/{jpg,mp4}/   # Gallery media files
│   └── next.config.mjs               # Standalone output mode
├── prepare_data/                      # Python data pipeline
│   ├── base_layer_ingest.py           # DOCX → syllable-level JSON (uses botok tokenizer)
│   ├── srt_sessions_1_parse.py        # SRT subtitle parsing
│   ├── srt_sessions_2_manual_overrides.py  # Manual alignment corrections
│   ├── srt_sessions_3_combine_sessions.py  # Session compilation
│   ├── generate_catalog.py            # Catalog JSON generation
│   ├── opensearch_ingest.py           # Index segments into OpenSearch
│   └── inspect_docx_xml.py            # DOCX debugging utility
└── docker-compose.yml                 # OpenSearch single-node (port 9200)
```

## Key Concepts

### The "Floating Pecha"
The reader renders Tibetan text at the syllable level. Each syllable has a UUID and is individually clickable. Syllables linked to audio segments are interactive — clicking one opens an inline panel showing available audio recordings with timestamps. From there, the user navigates to the player page.

### Data Model
- **Manifest** (`manifest.json`): Array of syllable objects `{ id, text, size, nature }`. Sizes map to traditional pecha formatting (TITLE, BIG, SMALL). Nature indicates TEXT, PUNCT, SYM, etc.
- **Sessions** (`*_compiled_sessions.json`): Array of audio segments `{ seg_id, global_seg_id, source_session, start, end, media, media_original, media_restored, syl_uuids, text }`. Each segment maps to a slice of syllables via `syl_uuids`.
- **Catalog** (`catalog.json`): Teaching metadata with `Teaching_ID`, `Title_bo`, `Instances`, `Access_Level`.

### Access Onion (Permission System)
Content is gated by numeric access levels (0–4). Level 0 = public. Higher levels require authentication. The API filters search results by `access_level <= userLevel`. The catalog view also filters teachings client-side.

### Deep Linking
- Reader: `/reader?instance={id}&sylId={uuid}&q={search_term}` — scrolls to and highlights a specific syllable
- Player: `/player?instance={id}&session={id}&time={timestamp}&sylId={uuid}` — plays audio from a specific time with syllable highlighted
- Right-click on player segments generates shareable URLs

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Auth**: Auth.js v5 (`next-auth@5`) — Credentials provider, users in Cloudflare D1, bcryptjs password hashes
- **Database**: Cloudflare D1 (SQLite at the edge), migrations under `floating-pecha-ui/migrations/`
- **Search**: SQLite FTS5 inside D1 — no external engine for v1. `segments_fts` virtual table (trigram tokenizer), built by `scripts/build-search-index.mjs`, queried by `/api/search`. A dedicated engine (Meilisearch) is deferred to the faceted multi-entity phase — see `DECISIONS.md` (2026-06-14)
- **Fonts**: Uchen (Tibetan), Inter (Latin) — loaded via `next/font/google`
- **Data Pipeline**: Python with `python-docx`, `botok` (Tibetan tokenizer); the OpenSearch ingest script is unused for now
- **Infrastructure**: Cloudflare Workers via the OpenNext adapter (`@opennextjs/cloudflare`), local dev via `wrangler dev`

## Design System (`src/lib/theme.js`)

All colors and sizes are centralized. Pages use CSS custom properties via `getThemeCssVars()`.

- **Gold** `#D4AF37` — primary accent, interactive elements
- **Hover Red** `#8B1D1D` — hover/active states, active breadcrumb
- **Gray** `#9CA3AF` — secondary text, metadata
- **No-Media** `#9DB9C9` — syllables without linked audio
- **Background** `#F7FAFC` / `#F9F9F7` — page backgrounds

## Development

```bash
# Start the app on the Workers runtime (auth + D1 work here)
cd floating-pecha-ui
npm install
cp .dev.vars.example .dev.vars   # then set AUTH_SECRET to a real random string
npm run dev:cf                   # http://localhost:8787 — first build takes 1–2 min
```

`npm run dev` still runs a plain `next dev`, but **auth and D1 require `npm run dev:cf`** because the D1 binding is only injected under wrangler. Without a real `AUTH_SECRET` in `.dev.vars`, sign-in silently fails on `/api/auth/csrf`.

### Seeding accounts (first time)

```bash
cd floating-pecha-ui
npm run db:apply        # apply D1 migrations locally
SEED_PASSWORD_PUBLIC=...  \
SEED_PASSWORD_NGONDRO=... \
SEED_PASSWORD_DZOGRIM=... \
SEED_PASSWORD_ADMIN=...   \
npm run seed
```

OpenSearch (docker-compose) is no longer required for the app to run.

### Building the search index (D1 FTS5)

Search is served from a SQLite FTS5 table inside D1 — no external engine. After
the archive data is in place (`public/data/archive/`) and migrations are applied:

```bash
cd floating-pecha-ui
npm run db:apply            # creates segments_fts (migration 0002) locally
npm run search:index        # reconstruct segment text + load the local index
npm run search:index:remote # same, against the deployed D1 (after db:apply:remote)
```

`scripts/build-search-index.mjs` rebuilds the index wholesale (DELETE + INSERT)
from `catalog.json` + each instance's `manifest.json`/`*_compiled_sessions.json`,
so it is safe to re-run whenever the data changes. Re-run it after every data
update; it is **not** part of the deploy script. `/api/search` derives the user's
access level from the authenticated session (the UI's `?level=` param is ignored
for authorization). The trigram tokenizer needs queries of ≥3 codepoints; shorter
queries fall back to a `LIKE` scan.

### Data Pipeline (one-time setup)
```bash
cd prepare_data
# 1. Generate teaching catalog from relational DB TSVs
python generate_catalog.py
# 2. Parse DOCX → syllable-level manifest (one per teaching instance)
python base_layer_ingest.py
# 3. Parse SRT subtitles → align to manifest → individual session JSONs
python srt_sessions_1_parse.py
# 4. (Optional) Apply manual alignment corrections
python srt_sessions_2_manual_overrides.py
# 5. Combine all sessions → compiled_sessions.json per instance
python srt_sessions_3_combine_sessions.py
# 6. Index segments into OpenSearch
python opensearch_ingest.py
```

Output goes to `prepare_data/output/`, then must be copied to `floating-pecha-ui/public/data/archive/`.

### Sapche (Table of Contents) alignment
A teaching's *sapche* (ས་བཅད་, the outline) arrives from the annotation tool as a JSON export
whose sections are anchored by **character offsets** into the text (e.g. `docs/export-4.json`,
fields `original_text` + `roots[]` with `original_start`/`original_end`/`children`). The reader
navigates by **syllable UUID**, so an alignment step converts offsets → UUIDs:

```bash
cd prepare_data
python sapche_align.py <export.json> <instance_id>
# example:
python sapche_align.py ../docs/export-4.json drime_shalung_1
# → writes floating-pecha-ui/public/data/archive/drime_shalung_1/sapche.json
```

What it does: walks the export's `original_text` and the instance's `manifest.json` together,
skipping audio-session markers (`{NNN ...}`) and whitespace differences, and maps each
section's start/end offsets to the syllable UUID at that position; it also precomputes the
outline number, depth, and part (intro/main/conclusion) per section.

Notes:
- The instance's `manifest.json` must already exist (pipeline steps 1–2) — alignment is
  against those syllables.
- Pass `<instance_id>` explicitly: the export's `document_id` is **not** a reliable key to
  the archive instance IDs.
- The reader shows the sapche automatically when `sapche.json` is present; instances without
  it are unaffected.
- `sapche_align.py` is versioned in the repo alongside the other `prepare_data/`
  pipeline scripts. Only the virtualenv, caches and generated `output/` are gitignored
  (see `.gitignore`), so collaborators get the script with a normal checkout. Full
  rationale (and the future option of the tool exporting UUIDs directly to skip this
  step): `docs/superpowers/specs/2026-05-21-reader-sapche-toc-design.md`.

## Deployment

The app is deployed to Cloudflare Workers at:

- **URL:** `https://rabsal-dawa.frere-jeremy.workers.dev`
- **D1 database:** `rabsal-dawa-dev` (binding `DB`, UUID `84fc220e-189a-42d6-8a5c-ba3e73102568`)
- **R2 bucket:** `rabsal-dawa-media` (binding `MEDIA`, public via `https://pub-89e39b431c564ba1a6f3d7bd0f53e81b.r2.dev`)
- **Worker secrets** (set via `wrangler secret put`): `AUTH_SECRET`, `AUTH_URL`. Stored in the user's password manager.

### Deploying a new version

```bash
cd floating-pecha-ui
R2_PUBLIC_BASE="https://pub-89e39b431c564ba1a6f3d7bd0f53e81b.r2.dev" npm run deploy
```

The script regenerates the gallery manifest (with R2 URLs for mp4 entries), builds with OpenNext, writes a `.assetsignore` to exclude the videos from Workers assets, and runs `wrangler deploy`.

### Uploading new media to R2

Add files locally to `floating-pecha-ui/public/data/world/{gallery/mp4,videos}/`, then:

```bash
cd floating-pecha-ui
npm run media:upload          # idempotent — skips files already present
```

After uploading, **redeploy** so the manifest reflects the new entries:

```bash
R2_PUBLIC_BASE="https://pub-89e39b431c564ba1a6f3d7bd0f53e81b.r2.dev" npm run deploy
```

### Changing remote user passwords

```bash
cd floating-pecha-ui
SEED_PASSWORD_PUBLIC=...  \
SEED_PASSWORD_NGONDRO=... \
SEED_PASSWORD_DZOGRIM=... \
SEED_PASSWORD_ADMIN=...   \
npm run seed -- --remote
```

(The seed is idempotent — re-running just overwrites the existing password hashes for those usernames.)

### Resetting Worker secrets

```bash
cd floating-pecha-ui
NEW=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo -n "$NEW" | npx wrangler secret put AUTH_SECRET
# Then save $NEW in the password manager.
```

## Environment Variables

Local secrets live in `floating-pecha-ui/.dev.vars` (gitignored, template at `.dev.vars.example`). Remote secrets are set via `wrangler secret put` on the deployed Worker.

- `AUTH_SECRET` — Auth.js v5 JWT signing secret. **Required** — without it `/api/auth/csrf` returns 500.
- `AUTH_URL` — canonical origin of the running app (e.g. `http://localhost:8787` locally). `NEXTAUTH_SECRET` / `NEXTAUTH_URL` are also accepted as fallbacks.

## Notes

- The `public/data/` directory contains large JSON and media files — it is gitignored and must be populated separately via the data pipeline or a data transfer.
- The `search/page.js` route is a standalone legacy search page. The primary search experience is now integrated into `archive/page.js` under the "Search Text" tab.
- The `next.config.mjs` uses `output: 'standalone'` for Docker deployment.
- All pages are client components (`"use client"`) since they rely heavily on browser APIs (scroll, audio, sessionStorage).
- `/admin` is an admin-role-gated back office for member management (list, create, edit access level/role, reset password, delete). The `admin` seed account (role `admin`, level 4) is the initial administrator; its password is set via `SEED_PASSWORD_ADMIN`. Users with `role = 'member'` are redirected away from `/admin` and receive 403 on all `/api/admin/*` routes.
