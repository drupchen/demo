# Autonomous Data Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin publish/update teaching archive data and refresh search entirely from the web (ZIP upload → R2 → live), with no redeploy, and serve archive content through an access-checked API.

**Architecture:** Archive JSON moves from static assets to R2 (binding `MEDIA`, under `archive/…`). A new access-checked content API serves it; the reader/listing read from that API instead of `/data/archive/…`. A new admin "Contenu" section unzips the pipeline's `output/` in the browser, POSTs each instance to an admin API that validates, writes to R2, and rebuilds that instance's D1 FTS rows. Three Python-pipeline cleanups follow.

**Tech Stack:** Next.js 16 App Router (all client pages), Auth.js v5, Cloudflare Workers via OpenNext, D1 (`DB`), R2 (`MEDIA`), `fflate` (browser unzip), node test runner (`tests/*.test.mjs`).

## Global Constraints

- All app/chrome strings shown to users are **French**; code identifiers/comments English.
- No inline colors in UI — use tokens from `src/lib/theme.js` (`COLORS`, `ADMIN_CHROME`, `inter`).
- Cloudflare bindings are accessed in route handlers via `getCloudflareContext().env` (`.DB`, `.MEDIA`); never import a global.
- Authorization is **server-side and authoritative**: content/catalog access from `session.user.accessLevel`; admin from `requireAdmin()`. The client is never trusted.
- R2 bucket binding is `MEDIA`; archive object keys are `archive/<instanceId>/<file>` and `archive/catalog.json`.
- D1 FTS table is `segments_fts` (migration 0002) with columns `(text, segment_id, instance_id, teaching_title, session_id, start, first_syl_id, access_level)`, trigram tokenizer.
- Tests are self-running `.mjs` files using `node:assert/strict` and the repo's tiny `test(name, fn)` harness ending with `console.log(\`\n${passed} tests passed\`)`. Run by `npm test`.
- Frequent commits: one per task. Conventional Commits, lowercase imperative. End each commit message body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Branch: `feature/autonomous-data-upload` (already checked out).

---

## File Structure

**New (app/lib):**
- `src/lib/searchIndex.js` — pure FTS reconstruction (moved out of the build script).
- `src/lib/archiveValidate.js` — pure validation of catalog + instance bundles.
- `src/lib/catalog.js` — pure access-level lookup + catalog filtering.
- `src/lib/contentUrl.js` — pure URL helper for the content API.
- `src/lib/archiveStore.js` — R2 read/write/list wrappers for archive data.
- `src/app/api/content/[instance]/[file]/route.js` — access-checked content GET.
- `src/app/api/catalog/route.js` — access-filtered catalog GET.
- `src/app/api/admin/content/route.js` — admin GET (status) + POST (validate+publish instance).
- `src/app/api/admin/content/catalog/route.js` — admin PUT (replace catalog wholesale).
- `src/app/admin/contenu/page.js` — admin upload UI.
- `src/app/admin/components/ContentUpload.js` — upload/unzip/validate/publish client component.
- `scripts/upload-archive-to-r2.mjs` — one-time migration of `public/data/archive` → R2.
- `tests/archiveValidate.test.mjs`, `tests/catalog.test.mjs`, `tests/contentUrl.test.mjs` — new unit tests.

**Modified:**
- `scripts/build-search-index.mjs` — import pure helpers from `src/lib/searchIndex.js`.
- `tests/searchIndex.test.mjs` — repoint imports to `src/lib/searchIndex.js`.
- `src/app/reader/page.js` — read via content/catalog API.
- `src/lib/useTranscription.js` — read via content API.
- `src/app/archive/page.js` — read catalog via `/api/catalog`.
- `src/app/admin/components/AdminShell.js` — add "Contenu" nav item.
- `package.json` — add `fflate`, drop `@opensearch-project/opensearch`; add archive-upload scripts; add `data/archive/` to the three assetsignore lines.
- `prepare_data/` — `requirements.txt` (new), configurable source paths, remove OpenSearch files.
- `CLAUDE.md` — update pipeline + search sections.

---

## Phase 1 — Pure modules (TDD)

### Task 1: Extract search-index pure helpers into `src/lib/searchIndex.js`

**Files:**
- Create: `src/lib/searchIndex.js`
- Modify: `scripts/build-search-index.mjs` (lines 27–97 move out; import them back)
- Test: `tests/searchIndex.test.mjs` (repoint import)

**Interfaces:**
- Produces: `sqlString(value) -> string`, `reconstructSegments({manifest, sessions, instanceId, teachingTitle, accessLevel}) -> Array<{segment_id,instance_id,teaching_title,session_id,start,first_syl_id,access_level,text}>`, `rowsToSql(rows, {maxStatementBytes?}) -> string`.

- [ ] **Step 1: Create the module** `src/lib/searchIndex.js` with the three pure functions (copied verbatim from the current script body):

```js
// Pure helpers for building the D1 segments_fts search index. No filesystem or
// Cloudflare deps so they run in Node (build script) and in the Worker (upload route).

/** Escape a value for a single-quoted SQL string literal. */
export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Reconstruct segment rows for one instance.
 * @param {{manifest:Array<{id:string,text:string}>, sessions:Array<object>,
 *   instanceId:string, teachingTitle:string, accessLevel:number}} args
 * @returns {Array<object>} rows ready for insertion
 */
export function reconstructSegments({ manifest, sessions, instanceId, teachingTitle, accessLevel }) {
  const sylMap = new Map(manifest.map((s) => [s.id, s.text]));
  const rows = [];
  for (const seg of sessions) {
    const sylIds = seg.syl_uuids ?? [];
    const text = sylIds.map((id) => sylMap.get(id) ?? "").join("").trim();
    if (!text) continue; // skip segments with no resolvable text
    rows.push({
      segment_id: seg.global_seg_id,
      instance_id: instanceId,
      teaching_title: teachingTitle ?? "",
      session_id: seg.source_session ?? "",
      start: seg.start ?? "",
      first_syl_id: sylIds[0] ?? "",
      access_level: Number.isInteger(accessLevel) ? accessLevel : 4,
      text,
    });
  }
  return rows;
}

/**
 * Render rows into a SQL script that rebuilds the WHOLE index (DELETE then
 * INSERT). Used by the CLI script only. INSERTs are grouped by an approximate
 * byte budget per statement (D1 rejects oversized statements).
 */
export function rowsToSql(rows, { maxStatementBytes = 60000 } = {}) {
  const parts = ["DELETE FROM segments_fts;"];
  const cols =
    "(text, segment_id, instance_id, teaching_title, session_id, start, first_syl_id, access_level)";
  const prefix = `INSERT INTO segments_fts ${cols} VALUES\n`;

  let buf = [];
  let bufBytes = 0;
  const flush = () => {
    if (buf.length === 0) return;
    parts.push(prefix + buf.join(",\n") + ";");
    buf = [];
    bufBytes = 0;
  };

  for (const r of rows) {
    const tuple =
      `(${sqlString(r.text)}, ${sqlString(r.segment_id)}, ${sqlString(r.instance_id)}, ` +
      `${sqlString(r.teaching_title)}, ${sqlString(r.session_id)}, ${sqlString(r.start)}, ` +
      `${sqlString(r.first_syl_id)}, ${Number(r.access_level)})`;
    const tupleBytes = Buffer.byteLength(tuple, "utf-8");
    if (buf.length > 0 && bufBytes + tupleBytes > maxStatementBytes) flush();
    buf.push(tuple);
    bufBytes += tupleBytes;
  }
  flush();
  return parts.join("\n");
}
```

- [ ] **Step 2: Update the build script to import them.** In `scripts/build-search-index.mjs`, delete the three function definitions (current lines 29–97) and add this import after the existing imports (after line 22):

```js
import { sqlString, reconstructSegments, rowsToSql } from "../src/lib/searchIndex.js";
```

Keep `buildAllRows` (uses `reconstructSegments`) and `main` in the script unchanged. Re-export for any external importer by adding at the end of the import section:

```js
export { sqlString, reconstructSegments, rowsToSql };
```

- [ ] **Step 3: Repoint the test.** In `tests/searchIndex.test.mjs` line 7, change the import source:

```js
import { reconstructSegments, sqlString, rowsToSql } from "../src/lib/searchIndex.js";
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `cd floating-pecha-ui && node tests/searchIndex.test.mjs`
Expected: ends with `N tests passed`, exit 0.

- [ ] **Step 5: Verify the build script still loads**

Run: `cd floating-pecha-ui && node -e "import('./scripts/build-search-index.mjs').then(()=>console.log('loads ok'))"`
Expected: prints `loads ok` (no run of `main` because not invoked as entry).

- [ ] **Step 6: Commit**

```bash
git add floating-pecha-ui/src/lib/searchIndex.js floating-pecha-ui/scripts/build-search-index.mjs floating-pecha-ui/tests/searchIndex.test.mjs
git commit -m "refactor(search): extract pure FTS helpers into src/lib/searchIndex.js"
```

---

### Task 2: `src/lib/archiveValidate.js` — bundle/catalog validation

**Files:**
- Create: `src/lib/archiveValidate.js`
- Test: `tests/archiveValidate.test.mjs`

**Interfaces:**
- Produces:
  - `validateInstanceBundle({instanceId, manifest, sessions}) -> {ok:boolean, errors:string[], segmentCount:number, orphanCount:number}`
  - `validateCatalog(catalog) -> {ok:boolean, errors:string[], instances:Array<{instanceId:string, accessLevel:number, teachingTitle:string}>}`

- [ ] **Step 1: Write the failing test** `tests/archiveValidate.test.mjs`:

```js
// Run: node tests/archiveValidate.test.mjs
import assert from "node:assert/strict";
import { validateInstanceBundle, validateCatalog } from "../src/lib/archiveValidate.js";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

const manifest = [
  { id: "a", text: "ཀ" },
  { id: "b", text: "ཁ" },
];
const sessions = [
  { global_seg_id: "s1", source_session: "A1", start: "00:00:00,000", syl_uuids: ["a", "b"] },
];

test("valid bundle passes", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest, sessions });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.segmentCount, 1);
  assert.equal(r.orphanCount, 0);
});

test("missing manifest array fails", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest: null, sessions });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /manifest/.test(e)));
});

test("empty manifest fails", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest: [], sessions });
  assert.equal(r.ok, false);
});

test("orphan syl_uuid fails and is counted", () => {
  const bad = [{ global_seg_id: "s1", syl_uuids: ["a", "zzz"] }];
  const r = validateInstanceBundle({ instanceId: "x", manifest, sessions: bad });
  assert.equal(r.ok, false);
  assert.equal(r.orphanCount, 1);
  assert.ok(r.errors.some((e) => /zzz/.test(e)));
});

test("sessions not an array fails", () => {
  const r = validateInstanceBundle({ instanceId: "x", manifest, sessions: {} });
  assert.equal(r.ok, false);
});

test("valid catalog yields instances with access levels", () => {
  const catalog = [
    { Teaching_ID: "t1", Title_bo: "ABC", Access_Level: 1, Instances: [{ Instance_ID: "x" }] },
  ];
  const r = validateCatalog(catalog);
  assert.equal(r.ok, true);
  assert.deepEqual(r.instances, [{ instanceId: "x", accessLevel: 1, teachingTitle: "ABC" }]);
});

test("catalog not an array fails", () => {
  const r = validateCatalog({});
  assert.equal(r.ok, false);
});

test("catalog instance without Instance_ID fails", () => {
  const r = validateCatalog([{ Title_bo: "x", Instances: [{}] }]);
  assert.equal(r.ok, false);
});

console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `cd floating-pecha-ui && node tests/archiveValidate.test.mjs`
Expected: FAIL — `Cannot find module .../src/lib/archiveValidate.js`.

- [ ] **Step 3: Implement** `src/lib/archiveValidate.js`:

```js
// Pure validation for uploaded archive data. No I/O — callers pass parsed JSON.

const SESSIONS_SUFFIX = "_compiled_sessions.json";
export const requiredInstanceFiles = (instanceId) => [
  "manifest.json",
  `${instanceId}${SESSIONS_SUFFIX}`,
];

/**
 * Validate one instance's manifest + compiled sessions.
 * Core rule: every syl_uuid referenced by a session must exist in the manifest.
 */
export function validateInstanceBundle({ instanceId, manifest, sessions }) {
  const errors = [];
  if (!Array.isArray(manifest)) errors.push("manifest.json must be a JSON array");
  else if (manifest.length === 0) errors.push("manifest.json is empty");
  if (!Array.isArray(sessions)) errors.push(`${instanceId}${SESSIONS_SUFFIX} must be a JSON array`);

  if (errors.length) return { ok: false, errors, segmentCount: 0, orphanCount: 0 };

  const ids = new Set(manifest.map((s) => s && s.id).filter(Boolean));
  let orphanCount = 0;
  const orphanSamples = [];
  for (const seg of sessions) {
    for (const u of seg.syl_uuids ?? []) {
      if (!ids.has(u)) {
        orphanCount++;
        if (orphanSamples.length < 5) orphanSamples.push(u);
      }
    }
  }
  if (orphanCount > 0) {
    errors.push(
      `${orphanCount} syl_uuid(s) reference syllables absent from manifest (e.g. ${orphanSamples.join(", ")})`
    );
  }
  return { ok: errors.length === 0, errors, segmentCount: sessions.length, orphanCount };
}

/** Validate catalog shape and extract per-instance access levels. */
export function validateCatalog(catalog) {
  const errors = [];
  if (!Array.isArray(catalog)) {
    return { ok: false, errors: ["catalog.json must be a JSON array"], instances: [] };
  }
  const instances = [];
  catalog.forEach((teaching, ti) => {
    const accessLevel = Number.isInteger(teaching?.Access_Level) ? teaching.Access_Level : 4;
    const teachingTitle = teaching?.Title_bo ?? "";
    const insts = teaching?.Instances ?? [];
    if (!Array.isArray(insts)) {
      errors.push(`teaching[${ti}].Instances must be an array`);
      return;
    }
    insts.forEach((inst, ii) => {
      const id = inst?.Instance_ID;
      if (!id) errors.push(`teaching[${ti}].Instances[${ii}] is missing Instance_ID`);
      else instances.push({ instanceId: id, accessLevel, teachingTitle });
    });
  });
  return { ok: errors.length === 0, errors, instances };
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `cd floating-pecha-ui && node tests/archiveValidate.test.mjs`
Expected: `8 tests passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add floating-pecha-ui/src/lib/archiveValidate.js floating-pecha-ui/tests/archiveValidate.test.mjs
git commit -m "feat(archive): pure validation for uploaded bundles and catalog"
```

---

### Task 3: `src/lib/catalog.js` — access lookup + filtering

**Files:**
- Create: `src/lib/catalog.js`
- Test: `tests/catalog.test.mjs`

**Interfaces:**
- Produces:
  - `accessLevelForInstance(catalog, instanceId) -> number | null` (null when the instance is not in the catalog)
  - `filterCatalogByLevel(catalog, userLevel) -> Array` (teachings with `Access_Level <= userLevel`)

- [ ] **Step 1: Write the failing test** `tests/catalog.test.mjs`:

```js
// Run: node tests/catalog.test.mjs
import assert from "node:assert/strict";
import { accessLevelForInstance, filterCatalogByLevel } from "../src/lib/catalog.js";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

const catalog = [
  { Title_bo: "Public", Access_Level: 0, Instances: [{ Instance_ID: "pub1" }] },
  { Title_bo: "Gated", Access_Level: 2, Instances: [{ Instance_ID: "g1" }, { Instance_ID: "g2" }] },
];

test("returns access level for a known instance", () => {
  assert.equal(accessLevelForInstance(catalog, "pub1"), 0);
  assert.equal(accessLevelForInstance(catalog, "g2"), 2);
});

test("returns null for unknown instance", () => {
  assert.equal(accessLevelForInstance(catalog, "nope"), null);
});

test("filters teachings above the user level", () => {
  const r = filterCatalogByLevel(catalog, 0);
  assert.equal(r.length, 1);
  assert.equal(r[0].Title_bo, "Public");
});

test("includes everything for a high-level user", () => {
  assert.equal(filterCatalogByLevel(catalog, 4).length, 2);
});

test("missing Access_Level is treated as max-restricted (4)", () => {
  const c = [{ Title_bo: "X", Instances: [{ Instance_ID: "x" }] }];
  assert.equal(accessLevelForInstance(c, "x"), 4);
  assert.equal(filterCatalogByLevel(c, 3).length, 0);
});

console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run it, expect FAIL** (`Cannot find module … catalog.js`).

Run: `cd floating-pecha-ui && node tests/catalog.test.mjs`

- [ ] **Step 3: Implement** `src/lib/catalog.js`:

```js
// Pure helpers over the teaching catalog (array of teachings, each with
// Access_Level and Instances[].Instance_ID). Access_Level governs CONTENT access.

function levelOf(teaching) {
  return Number.isInteger(teaching?.Access_Level) ? teaching.Access_Level : 4;
}

/** Access level required for an instance, or null if it is not in the catalog. */
export function accessLevelForInstance(catalog, instanceId) {
  if (!Array.isArray(catalog)) return null;
  for (const teaching of catalog) {
    for (const inst of teaching?.Instances ?? []) {
      if (inst?.Instance_ID === instanceId) return levelOf(teaching);
    }
  }
  return null;
}

/** Teachings the user may see (Access_Level <= userLevel). */
export function filterCatalogByLevel(catalog, userLevel) {
  if (!Array.isArray(catalog)) return [];
  const level = Number.isInteger(userLevel) ? userLevel : 0;
  return catalog.filter((t) => levelOf(t) <= level);
}
```

- [ ] **Step 4: Run it, expect PASS** (`5 tests passed`).

Run: `cd floating-pecha-ui && node tests/catalog.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add floating-pecha-ui/src/lib/catalog.js floating-pecha-ui/tests/catalog.test.mjs
git commit -m "feat(catalog): access-level lookup and catalog filtering"
```

---

### Task 4: `src/lib/contentUrl.js` — content API URL helper

**Files:**
- Create: `src/lib/contentUrl.js`
- Test: `tests/contentUrl.test.mjs`

**Interfaces:**
- Produces: `contentUrl(instanceId, file) -> string` → `/api/content/<enc instance>/<enc file>`

- [ ] **Step 1: Write the failing test** `tests/contentUrl.test.mjs`:

```js
// Run: node tests/contentUrl.test.mjs
import assert from "node:assert/strict";
import { contentUrl } from "../src/lib/contentUrl.js";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok - ${name}`); }

test("builds the API path", () => {
  assert.equal(contentUrl("drime_shalung_1", "manifest.json"),
    "/api/content/drime_shalung_1/manifest.json");
});

test("encodes path segments", () => {
  assert.equal(contentUrl("a b", "x y.json"), "/api/content/a%20b/x%20y.json");
});

console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run it, expect FAIL.**

Run: `cd floating-pecha-ui && node tests/contentUrl.test.mjs`

- [ ] **Step 3: Implement** `src/lib/contentUrl.js`:

```js
// Build a URL for the access-checked archive content API. Used by the reader and
// the transcription hook in place of the old static /data/archive/... paths.
export function contentUrl(instanceId, file) {
  return `/api/content/${encodeURIComponent(instanceId)}/${encodeURIComponent(file)}`;
}
```

- [ ] **Step 4: Run it, expect PASS** (`2 tests passed`).

- [ ] **Step 5: Commit**

```bash
git add floating-pecha-ui/src/lib/contentUrl.js floating-pecha-ui/tests/contentUrl.test.mjs
git commit -m "feat(content): URL helper for the access-checked content API"
```

---

## Phase 2 — R2 store + APIs (Workers runtime; manual verification)

### Task 5: `src/lib/archiveStore.js` — R2 wrappers

**Files:**
- Create: `src/lib/archiveStore.js`

**Interfaces:**
- Consumes: `env.MEDIA` (R2 bucket binding).
- Produces:
  - `archiveKey(instanceId, file) -> string`, `CATALOG_KEY` (`"archive/catalog.json"`)
  - `readCatalog(env) -> Promise<Array|null>`
  - `getArchiveObject(env, instanceId, file) -> Promise<R2ObjectBody|null>`
  - `putArchiveText(env, instanceId, file, text) -> Promise<void>`
  - `putCatalogText(env, text) -> Promise<void>`
  - `listPublishedInstances(env) -> Promise<Array<{instanceId:string, files:string[]}>>`

- [ ] **Step 1: Implement** `src/lib/archiveStore.js`:

```js
// R2 access for archive data (bucket bound as MEDIA). Keys:
//   archive/catalog.json
//   archive/<instanceId>/<file>
const PREFIX = "archive/";
export const CATALOG_KEY = `${PREFIX}catalog.json`;

export function archiveKey(instanceId, file) {
  return `${PREFIX}${instanceId}/${file}`;
}

export async function readCatalog(env) {
  const obj = await env.MEDIA.get(CATALOG_KEY);
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

export async function getArchiveObject(env, instanceId, file) {
  return env.MEDIA.get(archiveKey(instanceId, file));
}

export async function putArchiveText(env, instanceId, file, text) {
  await env.MEDIA.put(archiveKey(instanceId, file), text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function putCatalogText(env, text) {
  await env.MEDIA.put(CATALOG_KEY, text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

/** List published instances and the files present for each (from R2 listing). */
export async function listPublishedInstances(env) {
  const byInstance = new Map();
  let cursor;
  do {
    const res = await env.MEDIA.list({ prefix: PREFIX, cursor });
    for (const o of res.objects) {
      const rest = o.key.slice(PREFIX.length); // "<instanceId>/<file>" or "catalog.json"
      const slash = rest.indexOf("/");
      if (slash === -1) continue; // catalog.json — not an instance
      const instanceId = rest.slice(0, slash);
      const file = rest.slice(slash + 1);
      if (!byInstance.has(instanceId)) byInstance.set(instanceId, []);
      byInstance.get(instanceId).push(file);
    }
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor);
  return [...byInstance.entries()].map(([instanceId, files]) => ({ instanceId, files }));
}
```

- [ ] **Step 2: Verify it parses (syntax/import check)**

Run: `cd floating-pecha-ui && node --check src/lib/archiveStore.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/lib/archiveStore.js
git commit -m "feat(archive): R2 store wrappers for archive data"
```

---

### Task 6: Content API — `GET /api/content/[instance]/[file]`

**Files:**
- Create: `src/app/api/content/[instance]/[file]/route.js`

**Interfaces:**
- Consumes: `auth()`, `getCloudflareContext().env`, `readCatalog`, `getArchiveObject` (Task 5), `accessLevelForInstance` (Task 3).

- [ ] **Step 1: Implement** the route:

```js
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/auth";
import { readCatalog, getArchiveObject } from "@/lib/archiveStore";
import { accessLevelForInstance } from "@/lib/catalog";

// Access-checked archive content. Replaces the old public /data/archive/... assets
// so gated teachings are no longer readable by URL. Access level comes from the
// session, never the client.
export async function GET(_request, { params }) {
  const { instance, file } = await params;
  const { env } = getCloudflareContext();

  const catalog = await readCatalog(env);
  const required = accessLevelForInstance(catalog, instance);
  if (required === null) {
    return new Response("Not found", { status: 404 });
  }

  const session = await auth();
  const userLevel = session?.user?.accessLevel ?? 0;
  if (userLevel < required) {
    return new Response("Forbidden", { status: 403 });
  }

  const obj = await getArchiveObject(env, instance, file);
  if (!obj) return new Response("Not found", { status: 404 });

  // Public (level 0) content is identical for everyone → edge-cacheable.
  // Gated content must not be shared across users.
  const cacheControl =
    required === 0 ? "public, max-age=3600" : "private, no-store";

  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}
```

- [ ] **Step 2: Verify it parses**

Run: `cd floating-pecha-ui && node --check "src/app/api/content/[instance]/[file]/route.js"`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "floating-pecha-ui/src/app/api/content"
git commit -m "feat(content): access-checked archive content API from R2"
```

---

### Task 7: Catalog API — `GET /api/catalog`

**Files:**
- Create: `src/app/api/catalog/route.js`

**Interfaces:**
- Consumes: `auth()`, `getCloudflareContext().env`, `readCatalog` (Task 5), `filterCatalogByLevel` (Task 3).

- [ ] **Step 1: Implement** the route:

```js
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/auth";
import { readCatalog } from "@/lib/archiveStore";
import { filterCatalogByLevel } from "@/lib/catalog";

// Catalog filtered to what the session may see. Replaces the old public
// /data/archive/catalog.json fetch so gated teachings are not even listed.
export async function GET() {
  const { env } = getCloudflareContext();
  const catalog = (await readCatalog(env)) ?? [];
  const session = await auth();
  const userLevel = session?.user?.accessLevel ?? 0;
  return NextResponse.json(filterCatalogByLevel(catalog, userLevel), {
    headers: { "cache-control": "private, no-store" },
  });
}
```

- [ ] **Step 2: Verify it parses**

Run: `cd floating-pecha-ui && node --check src/app/api/catalog/route.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add floating-pecha-ui/src/app/api/catalog/route.js
git commit -m "feat(catalog): access-filtered catalog API"
```

---

### Task 8: Admin content API — status, publish-instance, replace-catalog

**Files:**
- Create: `src/app/api/admin/content/route.js`
- Create: `src/app/api/admin/content/catalog/route.js`

**Interfaces:**
- Consumes: `requireAdmin()`, `getCloudflareContext().env`, `validateInstanceBundle`/`validateCatalog` (Task 2), `reconstructSegments` (Task 1), `putArchiveText`/`putCatalogText`/`listPublishedInstances` (Task 5).
- POST body (publish one instance): `{ instanceId:string, teachingTitle:string, accessLevel:number, files: { [name:string]: string } }` — `files` values are raw JSON text. Must include `manifest.json` and `<instanceId>_compiled_sessions.json`; optional `sapche.json`, `transcription_manifest.json`, `<instanceId>_transcription_sessions.json`.
- PUT body (replace catalog): `{ catalog: string }` — raw catalog.json text.

- [ ] **Step 1: Implement** `src/app/api/admin/content/route.js`:

```js
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { validateInstanceBundle, requiredInstanceFiles } from "@/lib/archiveValidate";
import { reconstructSegments } from "@/lib/searchIndex";
import { putArchiveText, listPublishedInstances } from "@/lib/archiveStore";

const FTS_BATCH = 50; // statements per D1 batch

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const { env } = getCloudflareContext();
  const instances = await listPublishedInstances(env);
  return NextResponse.json({ instances });
}

export async function POST(request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const instanceId = (body.instanceId ?? "").toString().trim();
  const teachingTitle = (body.teachingTitle ?? "").toString();
  const accessLevel = Number(body.accessLevel);
  const files = body.files;
  if (!instanceId) return NextResponse.json({ error: "instanceId requis" }, { status: 400 });
  if (!files || typeof files !== "object")
    return NextResponse.json({ error: "files requis" }, { status: 400 });

  // Required files must be present.
  for (const name of requiredInstanceFiles(instanceId)) {
    if (typeof files[name] !== "string")
      return NextResponse.json({ error: `Fichier manquant: ${name}` }, { status: 400 });
  }

  // Parse + validate.
  let manifest, sessions;
  try {
    manifest = JSON.parse(files["manifest.json"]);
    sessions = JSON.parse(files[`${instanceId}_compiled_sessions.json`]);
  } catch {
    return NextResponse.json({ error: "JSON invalide dans manifest/sessions" }, { status: 400 });
  }
  // Optional files just need to parse if present.
  for (const [name, text] of Object.entries(files)) {
    try { JSON.parse(text); }
    catch { return NextResponse.json({ error: `JSON invalide: ${name}` }, { status: 400 }); }
  }
  const v = validateInstanceBundle({ instanceId, manifest, sessions });
  if (!v.ok) return NextResponse.json({ error: "Validation échouée", details: v.errors }, { status: 400 });

  const { env } = getCloudflareContext();

  // Write every provided file to R2 (preserve exact text).
  for (const [name, text] of Object.entries(files)) {
    await putArchiveText(env, instanceId, name, text);
  }

  // Rebuild this instance's FTS rows (delete-then-insert by instance_id).
  const rows = reconstructSegments({
    manifest, sessions, instanceId, teachingTitle,
    accessLevel: Number.isInteger(accessLevel) ? accessLevel : 4,
  });
  const db = env.DB;
  await db.prepare("DELETE FROM segments_fts WHERE instance_id = ?").bind(instanceId).run();
  const insert = db.prepare(
    `INSERT INTO segments_fts
       (text, segment_id, instance_id, teaching_title, session_id, start, first_syl_id, access_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < rows.length; i += FTS_BATCH) {
    const chunk = rows.slice(i, i + FTS_BATCH).map((r) =>
      insert.bind(r.text, r.segment_id, r.instance_id, r.teaching_title, r.session_id, r.start, r.first_syl_id, r.access_level)
    );
    if (chunk.length) await db.batch(chunk);
  }

  return NextResponse.json({ ok: true, instanceId, segments: rows.length });
}
```

- [ ] **Step 2: Implement** `src/app/api/admin/content/catalog/route.js`:

```js
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { validateCatalog } from "@/lib/archiveValidate";
import { putCatalogText } from "@/lib/archiveStore";

export async function PUT(request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const text = body?.catalog;
  if (typeof text !== "string")
    return NextResponse.json({ error: "catalog (texte) requis" }, { status: 400 });

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return NextResponse.json({ error: "catalog.json: JSON invalide" }, { status: 400 }); }

  const v = validateCatalog(parsed);
  if (!v.ok) return NextResponse.json({ error: "Validation catalog échouée", details: v.errors }, { status: 400 });

  const { env } = getCloudflareContext();
  await putCatalogText(env, text);
  return NextResponse.json({ ok: true, teachings: parsed.length, instances: v.instances.length });
}
```

- [ ] **Step 3: Verify both parse**

Run: `cd floating-pecha-ui && node --check src/app/api/admin/content/route.js && node --check src/app/api/admin/content/catalog/route.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/api/admin/content
git commit -m "feat(admin): content publish API (validate, write R2, rebuild FTS per instance)"
```

---

## Phase 3 — Admin upload UI

### Task 9: Add `fflate` and build the upload component

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/app/admin/components/ContentUpload.js`
- Create: `src/app/admin/contenu/page.js`

**Interfaces:**
- Consumes: the admin APIs (Task 8), `validateInstanceBundle`/`validateCatalog` (Task 2) for client-side pre-check, `fflate` `unzipSync`.

- [ ] **Step 1: Add the dependency**

Run: `cd floating-pecha-ui && npm install fflate`
Expected: `fflate` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Implement** `src/app/admin/components/ContentUpload.js`:

```js
"use client";

import { useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { validateInstanceBundle, validateCatalog, requiredInstanceFiles } from "@/lib/archiveValidate";
import { COLORS } from "@/lib/theme";

// Parse the ZIP (browser-side) into { catalogText, instances: Map<id, {files:{name:text}}> }.
// Tolerates an optional single top-level folder (e.g. "output/").
function parseZip(uint8) {
  const entries = unzipSync(uint8);
  const paths = Object.keys(entries).filter((p) => !p.endsWith("/"));
  // Strip a common leading folder if every path shares one.
  const firstSeg = (p) => p.split("/")[0];
  const tops = new Set(paths.map(firstSeg));
  const strip = tops.size === 1 && paths.every((p) => p.includes("/")) ? `${[...tops][0]}/` : "";
  let catalogText = null;
  const instances = new Map();
  for (const p of paths) {
    const rel = strip && p.startsWith(strip) ? p.slice(strip.length) : p;
    const text = strFromU8(entries[p]);
    if (rel === "catalog.json") { catalogText = text; continue; }
    const slash = rel.indexOf("/");
    if (slash === -1) continue;
    const instanceId = rel.slice(0, slash);
    const name = rel.slice(slash + 1);
    if (name.includes("/")) continue; // ignore nested dirs (e.g. sessions/, session_logs/)
    if (!instances.has(instanceId)) instances.set(instanceId, { files: {} });
    instances.get(instanceId).files[name] = text;
  }
  return { catalogText, instances };
}

// Build per-instance rows with a client-side validation verdict.
function buildRows(parsed) {
  const cat = parsed.catalogText ? safeParse(parsed.catalogText) : null;
  const catV = cat ? validateCatalog(cat) : { ok: false, errors: ["catalog.json absent du ZIP"], instances: [] };
  const levelById = new Map(catV.instances.map((i) => [i.instanceId, i]));
  const rows = [];
  for (const [instanceId, { files }] of parsed.instances) {
    const required = requiredInstanceFiles(instanceId);
    const missing = required.filter((n) => typeof files[n] !== "string");
    let verdict;
    if (missing.length) {
      verdict = { ok: false, errors: [`Fichiers manquants: ${missing.join(", ")}`] };
    } else {
      const manifest = safeParse(files["manifest.json"]);
      const sessions = safeParse(files[`${instanceId}_compiled_sessions.json`]);
      verdict = (manifest && sessions)
        ? validateInstanceBundle({ instanceId, manifest, sessions })
        : { ok: false, errors: ["JSON invalide dans manifest/sessions"] };
    }
    const meta = levelById.get(instanceId);
    rows.push({
      instanceId, files,
      accessLevel: meta?.accessLevel ?? 4,
      teachingTitle: meta?.teachingTitle ?? "",
      inCatalog: !!meta,
      verdict,
      status: "pending",
    });
  }
  return { catalogText: parsed.catalogText, catalogValid: catV.ok, catalogErrors: catV.errors, rows };
}

function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }

export default function ContentUpload() {
  const [state, setState] = useState(null); // { catalogText, catalogValid, catalogErrors, rows }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(e) {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      setState(buildRows(parseZip(buf)));
    } catch (err) {
      setError(`Lecture du ZIP impossible: ${err.message}`);
      setState(null);
    }
  }

  async function publish() {
    if (!state) return;
    setBusy(true);
    const rows = [...state.rows];
    for (const row of rows) {
      if (!row.verdict.ok || !row.inCatalog) { row.status = "skipped"; continue; }
      row.status = "publishing";
      setState((s) => ({ ...s, rows: [...rows] }));
      try {
        const res = await fetch("/api/admin/content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            instanceId: row.instanceId,
            teachingTitle: row.teachingTitle,
            accessLevel: row.accessLevel,
            files: row.files,
          }),
        });
        const data = await res.json().catch(() => ({}));
        row.status = res.ok ? `publié (${data.segments} segments)` : `erreur: ${data.error || res.status}`;
        row.failed = !res.ok;
      } catch (err) {
        row.status = `erreur: ${err.message}`;
        row.failed = true;
      }
      setState((s) => ({ ...s, rows: [...rows] }));
    }
    // Replace catalog wholesale once instances are written.
    if (state.catalogValid) {
      try {
        await fetch("/api/admin/content/catalog", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ catalog: state.catalogText }),
        });
      } catch (err) {
        setError(`Catalog non publié: ${err.message}`);
      }
    }
    setBusy(false);
  }

  const canPublish = state && state.catalogValid && state.rows.some((r) => r.verdict.ok && r.inCatalog);

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Contenu</h1>
      <p style={{ fontSize: 13.5, color: COLORS.GRAY, marginBottom: 20 }}>
        Déposez le ZIP du dossier <code>output/</code> du pipeline. Les données sont
        validées dans le navigateur, puis publiées sans redéploiement.
      </p>

      <input type="file" accept=".zip" onChange={onFile} disabled={busy} />

      {error && <p style={{ color: COLORS.HOVER_RED, marginTop: 12 }}>{error}</p>}

      {state && (
        <>
          {!state.catalogValid && (
            <p style={{ color: COLORS.HOVER_RED, marginTop: 16 }}>
              catalog.json invalide — publication bloquée. {state.catalogErrors.join(" · ")}
            </p>
          )}
          <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: COLORS.GRAY }}>
                <th style={{ padding: "6px 8px" }}>Instance</th>
                <th style={{ padding: "6px 8px" }}>Niveau</th>
                <th style={{ padding: "6px 8px" }}>Validation</th>
                <th style={{ padding: "6px 8px" }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.instanceId} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{r.instanceId}</td>
                  <td style={{ padding: "6px 8px" }}>{r.accessLevel}</td>
                  <td style={{ padding: "6px 8px", color: r.verdict.ok && r.inCatalog ? COLORS.GOLD : COLORS.HOVER_RED }}>
                    {!r.inCatalog ? "absente du catalog" : r.verdict.ok ? "OK" : r.verdict.errors.join(" · ")}
                  </td>
                  <td style={{ padding: "6px 8px", color: r.failed ? COLORS.HOVER_RED : COLORS.GRAY }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={publish}
            disabled={!canPublish || busy}
            style={{
              marginTop: 20, padding: "9px 18px", fontSize: 13.5, fontWeight: 600,
              color: "#fff", background: canPublish && !busy ? COLORS.GOLD : "#ccc",
              border: "none", borderRadius: 8, cursor: canPublish && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Publication…" : "Publier"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement** `src/app/admin/contenu/page.js`:

```js
import ContentUpload from "@/app/admin/components/ContentUpload";

export default function ContenuPage() {
  return <ContentUpload />;
}
```

- [ ] **Step 4: Verify component + page lint-parse (JSX — `node --check` can't parse JSX, use eslint)**

Run: `cd floating-pecha-ui && npx eslint src/app/admin/components/ContentUpload.js src/app/admin/contenu/page.js`
Expected: exit 0 (no errors). Fix any eslint errors before committing; eslint-config-next parses JSX so this validates syntax too.

- [ ] **Step 5: Commit**

```bash
git add floating-pecha-ui/package.json floating-pecha-ui/package-lock.json floating-pecha-ui/src/app/admin/components/ContentUpload.js floating-pecha-ui/src/app/admin/contenu/page.js
git commit -m "feat(admin): ZIP upload UI for archive content (browser unzip + validate + publish)"
```

---

### Task 10: Add "Contenu" to the admin nav

**Files:**
- Modify: `src/app/admin/components/AdminShell.js` (lines 10–13 `NAV_ITEMS`, lines 47–50 `ICONS`)

- [ ] **Step 1: Add the nav item.** Replace `NAV_ITEMS` (lines 10–13) with:

```js
const NAV_ITEMS = [
  { label: "Membres", href: "/admin/members", disabled: false },
  { label: "Contenu", href: "/admin/contenu", disabled: false },
  { label: "Réglages", href: "/admin/settings", disabled: true },
];
```

- [ ] **Step 2: Add an icon.** Add an `IconContent` function above the `ICONS` map (after `IconSettings`, before `IconLogout` is fine):

```js
function IconContent() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <line x1="8" y1="9" x2="16" y2="9"/>
      <line x1="8" y1="13" x2="14" y2="13"/>
    </svg>
  );
}
```

And add it to the `ICONS` map (lines 47–50):

```js
const ICONS = {
  "/admin/members": <IconUsers />,
  "/admin/contenu": <IconContent />,
  "/admin/settings": <IconSettings />,
};
```

- [ ] **Step 3: Verify it lint-parses (JSX — use eslint, not `node --check`)**

Run: `cd floating-pecha-ui && npx eslint src/app/admin/components/AdminShell.js`
Expected: exit 0 (no errors).

- [ ] **Step 4: Commit**

```bash
git add floating-pecha-ui/src/app/admin/components/AdminShell.js
git commit -m "feat(admin): add Contenu nav item"
```

---

## Phase 4 — Migration + reader cutover

### Task 11: Migration script `scripts/upload-archive-to-r2.mjs`

**Files:**
- Create: `scripts/upload-archive-to-r2.mjs`
- Modify: `package.json` scripts

**Interfaces:**
- Uploads every file under `public/data/archive/` to R2 key `archive/<relative path>` via `wrangler r2 object put`. Default target is local R2; `--remote` targets deployed R2.

- [ ] **Step 1: Implement** `scripts/upload-archive-to-r2.mjs`:

```js
#!/usr/bin/env node
// One-time/repeatable migration: push public/data/archive → R2 under archive/.
//
//   node scripts/upload-archive-to-r2.mjs            # local R2 (miniflare)
//   node scripts/upload-archive-to-r2.mjs --remote   # deployed R2
//
// Mirrors the directory tree as R2 keys: public/data/archive/<x> -> archive/<x>.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BUCKET = process.env.BUCKET || "rabsal-dawa-media";
const remote = process.argv.includes("--remote");
const ROOT = path.resolve(process.cwd(), "public/data/archive");

if (!fs.existsSync(ROOT)) {
  console.error(`No archive dir at ${ROOT}`);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let count = 0;
for (const localPath of walk(ROOT)) {
  const rel = path.relative(ROOT, localPath).split(path.sep).join("/");
  const key = `archive/${rel}`;
  const args = ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", localPath];
  if (remote) args.push("--remote");
  console.log(`(put) ${key}${remote ? " [remote]" : " [local]"}`);
  const r = spawnSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" });
  if (r.status !== 0) {
    console.error(`Failed for ${key}:\n${r.stderr}`);
    process.exit(r.status ?? 1);
  }
  count++;
}
console.log(`\nDone. ${count} objects uploaded to ${BUCKET} (${remote ? "remote" : "local"}).`);
```

- [ ] **Step 2: Add npm scripts.** In `package.json` `scripts`, after the `media:upload` line add:

```json
    "archive:upload": "node scripts/upload-archive-to-r2.mjs",
    "archive:upload:remote": "node scripts/upload-archive-to-r2.mjs --remote"
```

- [ ] **Step 3: Verify the script parses**

Run: `cd floating-pecha-ui && node --check scripts/upload-archive-to-r2.mjs`
Expected: exit 0.

- [ ] **Step 4: Populate local R2 and smoke-test the content API.**

```bash
cd floating-pecha-ui
npm run db:apply            # ensure local D1 has segments_fts
npm run archive:upload      # local R2
npm run dev                 # http://localhost:3000
```

Then in another shell (or browser), as an unauthenticated user (level 0):
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/catalog"`
Expected: `200` and the body is a JSON array of only level-0 teachings.

- [ ] **Step 5: Commit**

```bash
git add floating-pecha-ui/scripts/upload-archive-to-r2.mjs floating-pecha-ui/package.json
git commit -m "feat(archive): migration script to upload archive data to R2"
```

---

### Task 12: Cut the reader, transcription hook, and archive page over to the APIs

**Files:**
- Modify: `src/app/reader/page.js` (lines 606–634)
- Modify: `src/lib/useTranscription.js` (line 28)
- Modify: `src/app/archive/page.js` (line 24)
- Modify: `package.json` (the three `.assetsignore` printf lines: `dev:cf`, `preview`, `deploy`)

- [ ] **Step 1: Reader — import the helper.** In `src/app/reader/page.js`, add near the top imports:

```js
import { contentUrl } from "@/lib/contentUrl";
```

- [ ] **Step 2: Reader — swap the fetches.** Replace the `Promise.all` block (lines 606–612) with:

```js
        const [manifestRes, sessionsRes, catalogRes] = await Promise.all([
          fetch(contentUrl(instanceId, "manifest.json")),
          fetch(contentUrl(instanceId, `${instanceId}_compiled_sessions.json`)),
          fetch("/api/catalog"),
        ]);
```

And replace the sapche fetch (line 631) with:

```js
        fetch(contentUrl(instanceId, "sapche.json"))
```

- [ ] **Step 3: Transcription hook — use the helper.** In `src/lib/useTranscription.js`, add the import at the top:

```js
import { contentUrl } from "@/lib/contentUrl";
```

Replace the fetch on line 28:

```js
        const res = await fetch(contentUrl(instanceId, file));
```

- [ ] **Step 4: Archive page — use the catalog API.** In `src/app/archive/page.js`, replace the fetch on line 24:

```js
    fetch('/api/catalog')
```

- [ ] **Step 5: Stop bundling archive JSON in the deploy.** In `package.json`, the `dev:cf`, `preview`, and `deploy` scripts each contain `printf 'data/world/gallery/mp4/\n' > .open-next/assets/.assetsignore`. Change each to also exclude the archive dir:

```
printf 'data/world/gallery/mp4/\ndata/archive/\n' > .open-next/assets/.assetsignore
```

(Apply to all three script lines identically.)

- [ ] **Step 6: Manual verification (local).**

```bash
cd floating-pecha-ui
npm run archive:upload    # if not already done in Task 11
npm run dev
```

In the browser at `http://localhost:3000`:
1. Open `/archive` → catalog lists teachings (level-0 only when signed out).
2. Open a reader link for a level-0 instance → text + audio segments load (now via `/api/content/...`; check the Network tab shows `200` from `/api/content/...`).
3. Sign in (via `/signin`) as a higher-level user → previously hidden teachings appear and load.
4. Confirm a gated instance returns `403` when signed out:
   `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/content/<gatedInstanceId>/manifest.json"` → `403`.

- [ ] **Step 7: Commit**

```bash
git add floating-pecha-ui/src/app/reader/page.js floating-pecha-ui/src/lib/useTranscription.js floating-pecha-ui/src/app/archive/page.js floating-pecha-ui/package.json
git commit -m "feat(reader): read archive data via access-checked content/catalog APIs"
```

---

## Phase 5 — Pipeline-infra cleanups

### Task 13: `prepare_data/requirements.txt`

**Files:**
- Create: `prepare_data/requirements.txt`

- [ ] **Step 1: Create the file** (pins the runtime deps; OpenSearch dropped):

```
botok
python-docx
pysrt
thefuzz
```

- [ ] **Step 2: Commit**

```bash
git add prepare_data/requirements.txt
git commit -m "chore(pipeline): pin Python dependencies (drop opensearch-py)"
```

---

### Task 14: Configurable source paths in the pipeline

**Files:**
- Modify: `prepare_data/generate_catalog.py`, `prepare_data/base_layer_ingest.py`, `prepare_data/srt_sessions_1_parse.py` (the hardcoded `/media/drupchen/Khyentse Önang/...` base dir)

**Interfaces:**
- The source base directory is read from env var `KHYENTSE_DATA_DIR`, defaulting to the current hardcoded path so existing runs are unaffected.

- [ ] **Step 1: Locate the hardcoded base** in each script.

Run: `cd prepare_data && grep -rn "/media/drupchen" generate_catalog.py base_layer_ingest.py srt_sessions_1_parse.py`
Expected: one base-path assignment per file.

- [ ] **Step 2: Make it configurable.** In each of the three files, ensure `import os` is present, then replace the hardcoded base-path string assignment with an env-var lookup that keeps the old value as the default. For example, a line like:

```python
base_dir = Path("/media/drupchen/Khyentse Önang/Website/website_data")
```

becomes:

```python
base_dir = Path(os.environ.get("KHYENTSE_DATA_DIR", "/media/drupchen/Khyentse Önang/Website/website_data"))
```

Apply the equivalent change wherever each script defines that base path (preserve each file's existing variable name and surrounding code).

- [ ] **Step 3: Verify the scripts still import.**

Run: `cd prepare_data && python -c "import ast; [ast.parse(open(f).read()) for f in ['generate_catalog.py','base_layer_ingest.py','srt_sessions_1_parse.py']]; print('parse ok')"`
Expected: `parse ok`.

- [ ] **Step 4: Commit**

```bash
git add prepare_data/generate_catalog.py prepare_data/base_layer_ingest.py prepare_data/srt_sessions_1_parse.py
git commit -m "chore(pipeline): read source dir from KHYENTSE_DATA_DIR env var"
```

---

### Task 15: Remove dead OpenSearch + one-off scripts; drop the npm dep; update docs

**Files:**
- Delete: `prepare_data/opensearch_ingest.py`, `docker-compose.yml`, `prepare_data/patch_corrected_audio_urls.py`
- Modify: `floating-pecha-ui/package.json` (remove `@opensearch-project/opensearch`)
- Modify: `CLAUDE.md` (remove OpenSearch references in pipeline + tech-stack + notes)

- [ ] **Step 1: Delete the dead files.**

```bash
cd /Users/jeremy/Documents/Programming/khyentse-onang
git rm prepare_data/opensearch_ingest.py docker-compose.yml prepare_data/patch_corrected_audio_urls.py
```

- [ ] **Step 2: Remove the npm dependency.**

Run: `cd floating-pecha-ui && npm uninstall @opensearch-project/opensearch`
Expected: it disappears from `package.json` dependencies.

- [ ] **Step 3: Update `CLAUDE.md`.** Remove the OpenSearch pipeline step (the `opensearch_ingest.py` line in the Data Pipeline section), the `docker-compose.yml` mention in the Project Structure tree, the "OpenSearch single-node" note, and the "OpenSearch (docker-compose) is no longer required" line. Add the new flow note in the Development section:

```
### Publishing archive data (no redeploy)
Archive JSON lives in R2 (key prefix `archive/`). Migrate/seed it with
`npm run archive:upload` (local) or `npm run archive:upload:remote` (deployed).
After that, an admin publishes updates from /admin → Contenu by uploading the
ZIP of the pipeline's `output/`; the content/search update live, no redeploy.
```

- [ ] **Step 4: Verify the app still builds its test suite cleanly.**

Run: `cd floating-pecha-ui && npm test`
Expected: every `tests/*.test.mjs` passes (the new ones included), exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead OpenSearch ingest, docker-compose, one-off patch; update docs"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** R2 data home + content API (Tasks 5–6), filtered catalog (Task 7), admin ZIP upload + validation + server-side FTS rebuild (Tasks 8–9), nav (Task 10), migration + cutover incl. assetsignore (Tasks 11–12), three cleanups (Tasks 13–15), security gating (Tasks 6–7, verified Task 12 step 6). Search-reconstruction reuse (Task 1).
- **Placeholder scan:** none — every code step shows real code; verification steps give exact commands + expected output.
- **Type consistency:** `reconstructSegments`/`rowsToSql`/`sqlString` signatures identical across Task 1 and Task 8; `validateInstanceBundle`/`validateCatalog`/`requiredInstanceFiles` shapes identical across Tasks 2, 8, 9; `contentUrl(instanceId, file)` identical across Tasks 4, 12; archiveStore exports consistent across Tasks 5, 6, 7, 8.

## Out of scope (per spec)

PostHog analytics; GitHub-Actions automation of the Python pipeline; versioned R2 snapshots / rollback.
```
