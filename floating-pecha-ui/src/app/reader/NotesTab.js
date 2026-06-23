"use client";

import { useState } from "react";
import { inter, uchen } from "@/lib/theme";
import { formatNoteDate } from "@/lib/noteFormat";
import NoteComposer from "./NoteComposer";
import DeleteButton from "./DeleteButton";

/**
 * Right-sidebar tab listing the user's notes for the current teaching, grouped
 * by passage (a passage can hold several notes).
 * Props: notes[], loggedIn, manifestIndexOf (Map sylId->index),
 * onGoToNote(note), onUpdateNote(id, bodyText), onDeleteNote(id).
 *
 * Admin-only: isAdmin, members[], viewUserId, selfId, onChangeViewUser(id|null)
 * drive the "viewing notes of" picker; readOnly hides all edit/delete affordances
 * when an admin is viewing another member's notes.
 */
export default function NotesTab({
  notes,
  loggedIn,
  manifestIndexOf,
  onGoToNote,
  onUpdateNote,
  onDeleteNote,
  isAdmin,
  members,
  viewUserId,
  selfId,
  onChangeViewUser,
  readOnly,
}) {
  const [editingId, setEditingId] = useState(null);

  if (!loggedIn) {
    return (
      <p className={`${inter.className} text-xs r-text-muted`}>
        Sign in to create and view your personal notes.
      </p>
    );
  }

  const picker = isAdmin ? (
    <div className={`${inter.className} mb-3`}>
      <label className="block text-[10px] uppercase tracking-wide r-text-muted mb-1">
        Viewing notes of
      </label>
      <select
        value={viewUserId ?? ""}
        onChange={(e) => onChangeViewUser(e.target.value || null)}
        className="w-full text-xs p-1.5 rounded-md border r-border bg-transparent r-text-1a"
      >
        <option value="">Me</option>
        {(members || [])
          .filter((m) => m.id !== selfId)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ? `${m.name} (${m.username})` : m.username}
            </option>
          ))}
      </select>
      {readOnly && (
        <p className="mt-1 text-[10px] r-text-muted">Read-only — another member&apos;s notes.</p>
      )}
    </div>
  ) : null;

  if (!notes.length) {
    return (
      <div className={`${inter.className}`}>
        {picker}
        <p className="text-xs r-text-muted">
          {readOnly
            ? "This member has no notes for this teaching."
            : "No notes yet. Turn on annotation mode (the pencil button), select a passage, then add a note."}
        </p>
      </div>
    );
  }

  // Group by passage key, preserving each group's notes.
  const groupsMap = new Map();
  for (const note of notes) {
    const key = `${note.start_syl_id}_${note.end_syl_id}`;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(note);
  }
  const groups = [...groupsMap.values()].map((groupNotes) => {
    const sorted = [...groupNotes].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    return { head: sorted[0], notes: sorted };
  });
  groups.sort(
    (a, b) =>
      (manifestIndexOf.get(a.head.start_syl_id) ?? 0) -
      (manifestIndexOf.get(b.head.start_syl_id) ?? 0)
  );

  return (
    <div className={`${inter.className} flex flex-col gap-4`}>
      {picker}
      {groups.map((group) => (
        <div key={`${group.head.start_syl_id}_${group.head.end_syl_id}`}
          className="rounded-md border r-border p-3 flex flex-col gap-3">
          <button type="button" onClick={() => onGoToNote(group.head)}
            className={`${uchen.className} text-left r-text-muted r-hover-accent line-clamp-2`}
            style={{ fontSize: "1.25rem", lineHeight: 1.7 }}>
            {group.head.anchor_text || "(passage)"}
          </button>

          {group.notes.map((note) => (
            <div key={note.id} className="flex flex-col gap-2 border-t r-border pt-2 first:border-t-0 first:pt-0">
              {!readOnly && editingId === note.id ? (
                <NoteComposer
                  editing
                  initialText={note.body_text || ""}
                  onSubmit={async ({ bodyText }) => {
                    await onUpdateNote(note.id, bodyText);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  {note.kind === "voice" && (
                    <audio src={`/api/notes/${note.id}/audio`} controls className="h-8 w-full" />
                  )}
                  {note.body_text && (
                    <p className="text-sm r-text-1a whitespace-pre-wrap">{note.body_text}</p>
                  )}
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-[10px] r-text-muted">
                      {note.created_at ? formatNoteDate(note.created_at) : ""}
                    </span>
                    {!readOnly && (
                      <span className="flex items-center gap-3">
                      {note.kind === "text" && (
                        <button type="button" onClick={() => setEditingId(note.id)}
                          className="r-text-muted r-hover-accent underline">Edit</button>
                      )}
                      <DeleteButton onDelete={() => onDeleteNote(note.id)} />
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
