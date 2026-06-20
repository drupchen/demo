import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { validateInstanceBundle, validateCatalog, requiredInstanceFiles } from "@/lib/archiveValidate";
import { reconstructSegments } from "@/lib/searchIndex";
import { putArchiveText, listPublishedInstances, readCatalog } from "@/lib/archiveStore";

const FTS_BATCH = 50; // statements per D1 batch

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const { env } = getCloudflareContext();
  const [instances, catalog] = await Promise.all([
    listPublishedInstances(env),
    readCatalog(env),
  ]);
  // Annotate each published instance with its catalog access level / title so
  // the UI can display it and single-instance updates can resolve the level.
  const meta = new Map(validateCatalog(catalog ?? []).instances.map((i) => [i.instanceId, i]));
  const enriched = instances.map((it) => {
    const m = meta.get(it.instanceId);
    return {
      ...it,
      accessLevel: m ? m.accessLevel : null,
      teachingTitle: m ? m.teachingTitle : "",
      inCatalog: !!m,
    };
  });
  return NextResponse.json({ instances: enriched });
}

export async function POST(request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête JSON invalide" }, { status: 400 });

  const instanceId = (body.instanceId ?? "").toString().trim();
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

  // Resolve access level + title. Prefer the values the client sent (a full-
  // snapshot upload carries fresh catalog values that aren't in R2 yet). For a
  // single-instance update (no catalog.json in the ZIP) the client may omit
  // them, so fall back to the already-published catalog. Unknown → max-restricted.
  let accessLevel = Number(body.accessLevel);
  let teachingTitle = (body.teachingTitle ?? "").toString();
  if (!Number.isInteger(accessLevel) || !teachingTitle) {
    const m = validateCatalog((await readCatalog(env)) ?? []).instances.find(
      (i) => i.instanceId === instanceId
    );
    if (!Number.isInteger(accessLevel)) accessLevel = m ? m.accessLevel : 4;
    if (!teachingTitle) teachingTitle = m ? m.teachingTitle : "";
  }

  // Write every provided file to R2 (preserve exact text).
  for (const [name, text] of Object.entries(files)) {
    await putArchiveText(env, instanceId, name, text);
  }

  // Rebuild this instance's FTS rows (delete-then-insert by instance_id).
  const rows = reconstructSegments({ manifest, sessions, instanceId, teachingTitle, accessLevel });
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
