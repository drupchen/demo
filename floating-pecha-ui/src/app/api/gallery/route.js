import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// The manifest lives under public/ and is built into the Workers assets bundle.
// We fetch it via the ASSETS binding directly — a loopback fetch back to the
// Worker's own origin does not work reliably on Cloudflare Workers.
export async function GET(request) {
  const { env } = getCloudflareContext();
  const url = new URL("/data/world/gallery-manifest.json", request.url);
  const res = await env.ASSETS.fetch(url);
  if (!res.ok) {
    return NextResponse.json({ error: "Gallery manifest missing" }, { status: 500 });
  }
  const media = await res.json();
  const shuffled = [...media].sort(() => Math.random() - 0.5);
  return NextResponse.json(shuffled);
}
