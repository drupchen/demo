"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { inter, uchen } from "@/lib/theme";
import NoteComposer from "./NoteComposer";

/**
 * Floating popover anchored near a clicked annotated syllable, listing every
 * note covering that syllable. Each note can be played/read, edited (text), or
 * deleted; "+ Add note" attaches another note to the same passage.
 * Props: notes[], x, y (viewport coords), onClose, onUpdateNote(id, bodyText),
 * onDeleteNote(id), onAddNote().
 */
export default function NotePopover({ notes, x, y, onClose, onUpdateNote, onDeleteNote, onAddNote }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: y, left: x, ready: false });
  const [editingId, setEditingId] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    let left = x - rect.width / 2;
    let top = y;
    if (left < margin) left = margin;
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - margin - rect.width;
    if (top + rect.height > window.innerHeight - margin) top = Math.max(margin, y - rect.height - 24);
    // Measure-then-clamp: layout must be read before paint to keep the popover
    // on-screen, so the setState here is intentional and pre-paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos({ top, left, ready: true });
  }, [x, y, notes.length, editingId]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`${inter.className} fixed z-80 w-80 max-w-[90vw] max-h-[70vh] overflow-y-auto p-4 rounded-lg border r-border r-bg shadow-xl`}
      style={{ top: pos.top, left: pos.left, visibility: pos.ready ? "visible" : "hidden" }}
    >
      <div className="flex flex-col gap-3">
        {notes.map((note) => (
          <div key={note.id} className="flex flex-col gap-2 border-b r-border pb-3 last:border-b-0 last:pb-0">
            <div className={`${uchen.className} r-text-muted`} style={{ fontSize: "1.3rem", lineHeight: 1.7 }}>
              {note.anchor_text || ""}
            </div>
            {editingId === note.id ? (
              <NoteComposer
                editing
                initialText={note.body_text || ""}
                onSubmit={async ({ bodyText }) => { await onUpdateNote(note.id, bodyText); setEditingId(null); }}
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
                      className="r-text-muted r-hover-accent underline">Edit</button>
                  )}
                  <button type="button"
                    onClick={() => { if (confirm("Delete this note?")) onDeleteNote(note.id); }}
                    className="underline" style={{ color: "#8B1D1D" }}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
        <button type="button" onClick={onAddNote}
          className="self-start px-3 py-1.5 rounded-md text-xs font-semibold r-text-accent border r-border r-hover-accent">
          + Add note
        </button>
      </div>
    </div>
  );
}
