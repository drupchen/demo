import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/note-auth";
import { getNote } from "@/lib/notes";

export async function GET(request, { params }) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const { env } = getCloudflareContext();

  const note = await getNote(env.DB, id, session.user.id);
  if (!note || !note.audio_key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const object = await env.MEDIA.get(note.audio_key);
  if (!object) {
    return NextResponse.json({ error: "Audio missing" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream"
  );
  headers.set("Cache-Control", "private, max-age=3600");
  if (typeof object.size === "number") {
    headers.set("Content-Length", String(object.size));
  }
  return new Response(object.body, { headers });
}
