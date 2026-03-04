# Khyentse Onang (མཁྱེན་བརྩེའི་འོད་སྣང་ — Khyentse's Radiance)

Digital archive, virtual museum, and scholar's teaching portal for the teachings of Dilgo Khyentse Rinpoche. Built by Shechen Archives.

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
│   │   │   ├── auth/[...nextauth]/route.js  # NextAuth credentials provider (demo users)
│   │   │   ├── search/route.js              # OpenSearch full-text search API
│   │   │   └── gallery/route.js             # Filesystem-based gallery media API
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
- **Auth**: next-auth with credentials provider (demo hardcoded users)
- **Search**: OpenSearch (via `@opensearch-project/opensearch`)
- **Fonts**: Uchen (Tibetan), Inter (Latin) — loaded via `next/font/google`
- **Data Pipeline**: Python with `python-docx`, `botok` (Tibetan tokenizer), `opensearchpy`
- **Infrastructure**: Docker Compose for OpenSearch

## Design System (`src/lib/theme.js`)

All colors and sizes are centralized. Pages use CSS custom properties via `getThemeCssVars()`.

- **Gold** `#D4AF37` — primary accent, interactive elements
- **Hover Red** `#8B1D1D` — hover/active states, active breadcrumb
- **Gray** `#9CA3AF` — secondary text, metadata
- **No-Media** `#9DB9C9` — syllables without linked audio
- **Background** `#F7FAFC` / `#F9F9F7` — page backgrounds

## Development

```bash
# Start OpenSearch
docker compose up -d

# Run the UI
cd floating-pecha-ui
npm install
npm run dev        # http://localhost:3000

# Demo login credentials
# public / demo    → Access Level 0
# ngondro / demo   → Access Level 1
# dzogrim / demo   → Access Level 4
```

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

## Environment Variables

- `OPENSEARCH_URL` — OpenSearch endpoint (default: `http://localhost:9200`)
- `NEXTAUTH_SECRET` — NextAuth secret (defaults to dev key)

## Notes

- The `public/data/` directory contains large JSON and media files — it is gitignored and must be populated separately via the data pipeline or a data transfer.
- The `search/page.js` route is a standalone legacy search page. The primary search experience is now integrated into `archive/page.js` under the "Search Text" tab.
- The `next.config.mjs` uses `output: 'standalone'` for Docker deployment.
- All pages are client components (`"use client"`) since they rely heavily on browser APIs (scroll, audio, sessionStorage).
