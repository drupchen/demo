import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/note-auth";
import { getNote, updateNote, deleteNote } from "@/lib/notes";

export async function PATCH(request, { params }) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const bodyText = (body.body_text ?? "").toString();
  const { env } = getCloudflareContext();

  const existing = await getNote(env.DB, id, session.user.id);
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  // A text note must keep non-empty body; a voice caption may be cleared.
  if (existing.kind === "text" && !bodyText.trim()) {
    return NextResponse.json({ error: "Note texte vide" }, { status: 400 });
  }

  await updateNote(env.DB, id, session.user.id, { bodyText });
  const note = await getNote(env.DB, id, session.user.id);
  return NextResponse.json({ note });
}

export async function DELETE(request, { params }) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const { env } = getCloudflareContext();

  const existing = await getNote(env.DB, id, session.user.id);
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  // Remove the R2 object first; if it fails we still proceed to delete the row
  // (an orphaned object is harmless and can be swept later).
  if (existing.audio_key) {
    try {
      await env.MEDIA.delete(existing.audio_key);
    } catch (err) {
      console.error("Note audio delete failed:", err);
    }
  }

  await deleteNote(env.DB, id, session.user.id);
  return NextResponse.json({ ok: true });
}
