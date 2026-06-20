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
