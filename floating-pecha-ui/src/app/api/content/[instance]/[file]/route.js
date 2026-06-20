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
