"use client";

import { useState } from "react";
import { inter } from "@/lib/theme";
import NoteComposer from "./NoteComposer";

/**
 * Right-sidebar tab listing the user's notes for the current teaching.
 * Props:
 * - notes: array of note rows (from useNotes)
 * - loggedIn: boolean
 * - manifestIndexOf: Map sylId -> manifest index (for sorting by position)
 * - onGoToNote(note): scroll the reader to the note's anchor
 * - onUpdateNote(id, bodyText): Promise
 * - onDeleteNote(id): Promise
 */
export default function NotesTab({
  notes,
  loggedIn,
  manifestIndexOf,
  onGoToNote,
  onUpdateNote,
  onDeleteNote,
}) {
  const [editingId, setEditingId] = useState(null);

  if (!loggedIn) {
    return (
      <p className={`${inter.className} text-xs r-text-muted`}>
        Connectez-vous pour créer et voir vos notes personnelles.
      </p>
    );
  }

  if (!notes.length) {
    return (
      <p className={`${inter.className} text-xs r-text-muted`}>
        Aucune note. Activez le mode annotation (bouton crayon), sélectionnez un
        passage, puis ajoutez une note.
      </p>
    );
  }

  const sorted = [...notes].sort(
    (a, b) =>
      (manifestIndexOf.get(a.start_syl_id) ?? 0) -
      (manifestIndexOf.get(b.start_syl_id) ?? 0)
  );

  return (
    <div className={`${inter.className} flex flex-col gap-3`}>
      {sorted.map((note) => (
        <div key={note.id} className="rounded-md border r-border p-3 flex flex-col gap-2">
          <button type="button" onClick={() => onGoToNote(note)}
            className="text-left text-xs r-text-muted r-hover-accent line-clamp-2">
            {note.anchor_text || "(passage)"}
          </button>

          {editingId === note.id ? (
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
              <div className="flex items-center gap-3 text-[11px]">
                {note.kind === "text" && (
                  <button type="button" onClick={() => setEditingId(note.id)}
                    className="r-text-muted r-hover-accent underline">
                    Éditer
                  </button>
                )}
                <button type="button"
                  onClick={() => { if (confirm("Supprimer cette note ?")) onDeleteNote(note.id); }}
                  className="underline" style={{ color: "#8B1D1D" }}>
                  Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
