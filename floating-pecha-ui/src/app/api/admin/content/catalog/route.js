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
