import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteInstance, readCatalog, putCatalogText } from "@/lib/archiveStore";
import { removeInstanceFromCatalog } from "@/lib/catalog";

// Delete a published instance: remove its R2 objects, its FTS rows, and its
// catalog entry (dropping the parent teaching if it becomes empty), so it
// disappears from every listing. Idempotent — deleting an absent instance is a
// no-op that still returns ok.
export async function DELETE(_request, { params }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { instance } = await params;
  const { env } = getCloudflareContext();

  const objectsDeleted = await deleteInstance(env, instance);
  await env.DB.prepare("DELETE FROM segments_fts WHERE instance_id = ?").bind(instance).run();

  const catalog = (await readCatalog(env)) ?? [];
  const next = removeInstanceFromCatalog(catalog, instance);
  await putCatalogText(env, JSON.stringify(next));

  return NextResponse.json({ ok: true, instanceId: instance, objectsDeleted });
}
