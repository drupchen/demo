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
