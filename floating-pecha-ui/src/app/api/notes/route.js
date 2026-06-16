import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/note-auth";
import { listNotes, createNote, validateNoteInput } from "@/lib/notes";

export async function GET(request) {
  const { session, response } = await requireUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const instanceId = (searchParams.get("instance") || "").trim();
  if (!instanceId) {
    return NextResponse.json({ error: "instance requis" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const notes = await listNotes(env.DB, session.user.id, instanceId);
  return NextResponse.json({ notes });
}

// Map a recorded MIME type to an R2 key extension.
function extFor(contentType) {
  if (!contentType) return "bin";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mpeg")) return "mp3";
  return "bin";
}

export async function POST(request) {
  const { session, response } = await requireUser();
  if (response) return response;

  const userId = session.user.id;
  const { env } = getCloudflareContext();
  const contentType = request.headers.get("content-type") || "";

  let fields;
  let audioFile = null;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    audioFile = form.get("audio");
    fields = {
      instanceId: (form.get("instance_id") || "").toString(),
      startSylId: (form.get("start_syl_id") || "").toString(),
      endSylId: (form.get("end_syl_id") || "").toString(),
      anchorText: (form.get("anchor_text") || "").toString(),
      kind: (form.get("kind") || "").toString(),
      bodyText: (form.get("body_text") || "").toString(),
      audioDurationMs: Number(form.get("audio_duration_ms")) || null,
    };
  } else {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    fields = {
      instanceId: (body.instance_id || "").toString(),
      startSylId: (body.start_syl_id || "").toString(),
      endSylId: (body.end_syl_id || "").toString(),
      anchorText: (body.anchor_text || "").toString(),
      kind: (body.kind || "").toString(),
      bodyText: (body.body_text || "").toString(),
      audioDurationMs: Number(body.audio_duration_ms) || null,
    };
  }

  const hasAudio = !!(audioFile && typeof audioFile === "object" && audioFile.size > 0);
  const v = validateNoteInput({ ...fields, hasAudio });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // For a voice note, stream the blob into R2 before inserting the row, so we
  // never persist a voice note that points at a missing object.
  let audioKey = null;
  if (fields.kind === "voice") {
    const mime = audioFile.type || "";
    if (!mime.startsWith("audio/")) {
      return NextResponse.json({ error: "Type audio invalide" }, { status: 400 });
    }
    const ext = extFor(audioFile.type);
    audioKey = `notes/${userId}/${randomUUID()}.${ext}`;
    try {
      await env.MEDIA.put(audioKey, audioFile.stream(), {
        httpMetadata: { contentType: audioFile.type || "application/octet-stream" },
      });
    } catch (err) {
      console.error("Note audio upload failed:", err);
      return NextResponse.json({ error: "Échec de l'upload audio" }, { status: 502 });
    }
  }

  const note = await createNote(env.DB, {
    userId,
    instanceId: fields.instanceId,
    startSylId: fields.startSylId,
    endSylId: fields.endSylId,
    anchorText: fields.anchorText || null,
    kind: fields.kind,
    bodyText: fields.bodyText || null,
    audioKey,
    audioDurationMs: fields.audioDurationMs,
  });

  return NextResponse.json({ note }, { status: 201 });
}
