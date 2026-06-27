import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { archiveKey } from "@/lib/archiveStore";
import { UNUSED_ARCHIVE_FILES } from "@/lib/archiveValidate";

// Stream a single archive file straight into R2 as opaque bytes — no JSON.parse,
// no whole-bundle buffering. The publish flow uploads large, non-validated files
// (transcription layers, sapche) one at a time through here, so the Worker never
// holds a multi-MB bundle in memory (the cause of the 503 on big teachings).
// The validated files (manifest + compiled_sessions) go through POST /api/admin/content.
export async function PUT(request, { params }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { instance } = await params;
  const instanceId = (instance ?? "").toString().trim();
  const name = (new URL(request.url).searchParams.get("name") ?? "").toString().trim();

  if (!instanceId) return NextResponse.json({ error: "instanceId requis" }, { status: 400 });
  if (!name || name.includes("/") || !name.endsWith(".json"))
    return NextResponse.json({ error: "Nom de fichier invalide" }, { status: 400 });
  if (UNUSED_ARCHIVE_FILES.has(name))
    return NextResponse.json({ error: `Fichier non stocké: ${name}` }, { status: 400 });

  // Read the body as bytes (the largest single file is well under the Worker
  // memory limit) and hand the exact bytes to R2 — no UTF-16 string copy.
  const bytes = await request.arrayBuffer();
  const { env } = getCloudflareContext();
  await env.MEDIA.put(archiveKey(instanceId, name), bytes, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return NextResponse.json({ ok: true, instanceId, name });
}
