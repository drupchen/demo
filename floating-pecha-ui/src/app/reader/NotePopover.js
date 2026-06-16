"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { inter, uchen } from "@/lib/theme";
import { formatNoteDate } from "@/lib/noteFormat";
import NoteComposer from "./NoteComposer";

/**
 * Floating popover anchored beside a passage/selection. Handles three states:
 *  - empty notes  -> pure create (composer shown directly)
 *  - has notes    -> list of notes + "Add note" (reveals an inline composer)
 *  - editing a note -> inline editor for that note
 * Props: notes[], anchor {startSylId,endSylId,anchorText}, x, y, onClose,
 * onCreate(payload), onUpdateNote(id, bodyText), onDeleteNote(id).
 */
export default function NotePopover({ notes, anchor, x, y, onClose, onCreate, onUpdateNote, onDeleteNote }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: y, left: x, ready: false });
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(notes.length === 0);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measure-then-position popover (matches FloatingPopover)
    setPos({ top, left, ready: true });
  }, [x, y, notes.length, editingId, adding]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const composer = (
    <NoteComposer
      anchorText={notes.length === 0 ? anchor?.anchorText : ""}
      onSubmit={async (payload) => { await onCreate(payload); setAdding(false); }}
      onCancel={() => { if (notes.length === 0) onClose?.(); else setAdding(false); }}
    />
  );

  return (
    <div
      ref={ref}
      className={`${inter.className} fixed z-80 w-80 max-w-[90vw] max-h-[70vh] overflow-y-auto p-4 rounded-lg border r-border r-bg shadow-xl`}
      style={{ top: pos.top, left: pos.left, visibility: pos.ready ? "visible" : "hidden" }}
    >
      {notes.length === 0 ? (
        composer
      ) : (
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
                  {note.created_at ? (
                    <div className="text-[10px] r-text-muted">{formatNoteDate(note.created_at)}</div>
                  ) : null}
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
          {adding ? composer : (
            <button type="button" onClick={() => setAdding(true)}
              className="self-start px-3 py-1.5 rounded-md text-xs font-semibold r-text-accent border r-border r-hover-accent">
              + Add note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
