"use client";

import { useState } from "react";
import { inter, uchen } from "@/lib/theme";
import VoiceRecorder from "./VoiceRecorder";

/**
 * Create/edit a note. Props:
 * - anchorText: string excerpt of the selected span (shown as context)
 * - initialText: string (editing an existing note)
 * - editing: boolean (true → no voice option, just edit the text)
 * - onSubmit({ kind, bodyText, audioBlob, audioDurationMs }): Promise
 * - onCancel()
 */
export default function NoteComposer({
  anchorText,
  initialText = "",
  editing = false,
  onSubmit,
  onCancel,
}) {
  const [text, setText] = useState(initialText);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = editing
    ? text.trim().length > 0
    : text.trim().length > 0 || !!audioBlob;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const kind = !editing && audioBlob ? "voice" : "text";
      await onSubmit({ kind, bodyText: text, audioBlob, audioDurationMs });
    } catch (err) {
      setError(err.message || "Failed to save");
      setBusy(false);
    }
  };

  return (
    <div className={`${inter.className} flex flex-col gap-3`}>
      {anchorText && (
        <div className={`${uchen.className} r-text-muted border-l-2 r-border pl-2 line-clamp-2`}
          style={{ fontSize: "1.25rem", lineHeight: 1.7 }}>
          {anchorText}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={editing ? "Edit note…" : "Write a note… (or record a voice memo)"}
        rows={4}
        className="w-full p-2 rounded-md border r-border bg-transparent text-sm r-text-1a resize-y"
      />
      {!editing && (
        <VoiceRecorder
          onRecorded={(blob, durationMs) => {
            setAudioBlob(blob);
            setAudioDurationMs(durationMs);
          }}
          onClear={() => {
            setAudioBlob(null);
            setAudioDurationMs(0);
          }}
        />
      )}
      {error && <div className="text-xs" style={{ color: "#8B1D1D" }}>{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-xs r-text-muted r-hover-accent">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={!canSubmit || busy}
          className="px-3 py-1.5 rounded-md text-xs font-semibold r-text-accent border r-border disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
