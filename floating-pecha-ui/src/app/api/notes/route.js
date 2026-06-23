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
    return NextResponse.json({ error: "instance required" }, { status: 400 });
  }

  const targetUser = (searchParams.get("user") || "").trim();
  let userId = session.user.id;
  if (targetUser && targetUser !== session.user.id) {
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = targetUser;
  }

  const { env } = getCloudflareContext();
  const notes = await listNotes(env.DB, userId, instanceId);
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
      quotePrefix: (form.get("quote_prefix") || "").toString(),
      quoteSuffix: (form.get("quote_suffix") || "").toString(),
      kind: (form.get("kind") || "").toString(),
      bodyText: (form.get("body_text") || "").toString(),
      audioDurationMs: Number(form.get("audio_duration_ms")) || null,
      startOffset: form.get("start_offset") != null && form.get("start_offset") !== "" ? Number(form.get("start_offset")) : null,
      endOffset: form.get("end_offset") != null && form.get("end_offset") !== "" ? Number(form.get("end_offset")) : null,
    };
  } else {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    fields = {
      instanceId: (body.instance_id || "").toString(),
      startSylId: (body.start_syl_id || "").toString(),
      endSylId: (body.end_syl_id || "").toString(),
      anchorText: (body.anchor_text || "").toString(),
      quotePrefix: (body.quote_prefix || "").toString(),
      quoteSuffix: (body.quote_suffix || "").toString(),
      kind: (body.kind || "").toString(),
      bodyText: (body.body_text || "").toString(),
      audioDurationMs: Number(body.audio_duration_ms) || null,
      startOffset: body.start_offset != null ? Number(body.start_offset) : null,
      endOffset: body.end_offset != null ? Number(body.end_offset) : null,
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
      return NextResponse.json({ error: "Invalid audio type" }, { status: 400 });
    }
    const ext = extFor(audioFile.type);
    audioKey = `notes/${userId}/${randomUUID()}.${ext}`;
    try {
      await env.MEDIA.put(audioKey, audioFile.stream(), {
        httpMetadata: { contentType: audioFile.type || "application/octet-stream" },
      });
    } catch (err) {
      console.error("Note audio upload failed:", err);
      return NextResponse.json({ error: "Audio upload failed" }, { status: 502 });
    }
  }

  const note = await createNote(env.DB, {
    userId,
    instanceId: fields.instanceId,
    startSylId: fields.startSylId,
    endSylId: fields.endSylId,
    anchorText: fields.anchorText || null,
    quotePrefix: fields.quotePrefix || null,
    quoteSuffix: fields.quoteSuffix || null,
    kind: fields.kind,
    bodyText: fields.bodyText || null,
    audioKey,
    audioDurationMs: fields.audioDurationMs,
    startOffset: fields.startOffset,
    endOffset: fields.endOffset,
  });

  return NextResponse.json({ note }, { status: 201 });
}
