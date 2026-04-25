# Khyentse Önang — Setup Guide

Digital archive and scholar's teaching portal for the teachings of Dilgo Khyentse Rinpoche.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- [Node.js 20+](https://nodejs.org/)
- Python 3.10+

---

## 1. Install Python dependencies

```bash
cd prepare_data
pip install botok python-docx pysrt thefuzz opensearch-py
```

---

## 2. Run the data pipeline

This is a one-time step that processes source documents into JSON files.

```bash
cd prepare_data

# Generate the teaching catalog from relational DB TSVs
python generate_catalog.py

# Parse DOCX source texts → syllable-level manifest JSON (one per teaching instance)
python base_layer_ingest.py

# Parse SRT subtitles and align them to the manifest
python srt_sessions_1_parse.py

# (Optional) Apply manual alignment corrections
python srt_sessions_2_manual_overrides.py

# Combine individual session JSONs into compiled_sessions.json per instance
python srt_sessions_3_combine_sessions.py
```

Output goes to `prepare_data/output/`.

---

## 3. Copy output to the UI's public data directory

```bash
cp prepare_data/output/catalog.json floating-pecha-ui/public/data/archive/
cp -r prepare_data/output/<instance_id>/ floating-pecha-ui/public/data/archive/
```

Replace `<instance_id>` with the actual folder names (e.g. `rpn_ngondro_1`, `yeshe_lama_1`).

---

## 4. Start OpenSearch

```bash
docker compose up -d opensearch
```

Wait ~20 seconds for it to be ready, then verify:

```bash
curl http://localhost:9200
```

---

## 5. Populate the OpenSearch database

```bash
cd prepare_data
python opensearch_ingest.py
```

This indexes all compiled session segments into OpenSearch for full-text search.

---

## 6. Run the app

**Option A — Development server:**

```bash
cd floating-pecha-ui
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Option B — Docker (production build):**

```bash
docker compose up -d
```

This builds the Next.js app and starts both OpenSearch and the UI at [http://localhost:3000](http://localhost:3000).

---

## Demo login credentials

| Username | Password | Access Level |
|----------|----------|--------------|
| public   | demo     | 0 (public)   |
| ngondro  | demo     | 1            |
| dzogrim  | demo     | 4 (full)     |

---

## Environment variables

| Variable           | Default                        | Description                  |
|--------------------|--------------------------------|------------------------------|
| `OPENSEARCH_URL`   | `http://localhost:9200`        | OpenSearch endpoint          |
| `NEXTAUTH_SECRET`  | `development-secret-key-123`   | NextAuth signing secret      |

Set these in a `.env.local` file inside `floating-pecha-ui/` for local development.
