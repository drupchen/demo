"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Manages the logged-in user's notes for one teaching instance.
 * Returns { notes, loading, error, createNote, updateNote, deleteNote, reload }.
 *
 * `enabled` should be false when the user is logged out — the hook then stays
 * empty and makes no requests.
 */
export function useNotes(instanceId, enabled) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled || !instanceId) {
      setNotes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?instance=${encodeURIComponent(instanceId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch (err) {
      setError(err.message || "Failed to load");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [instanceId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Create a note. `payload` is { startSylId, endSylId, anchorText, kind,
   * bodyText, audioBlob, audioDurationMs, startOffset, endOffset }.
   * startOffset/endOffset are optional character offsets within the start/end
   * syllable for character-exact highlighting. Returns the created note or throws.
   */
  const createNote = useCallback(
    async (payload) => {
      let res;
      if (payload.kind === "voice" && payload.audioBlob) {
        const form = new FormData();
        form.set("instance_id", instanceId);
        form.set("start_syl_id", payload.startSylId);
        form.set("end_syl_id", payload.endSylId);
        form.set("anchor_text", payload.anchorText || "");
        form.set("kind", "voice");
        form.set("body_text", payload.bodyText || "");
        form.set("audio_duration_ms", String(payload.audioDurationMs || 0));
        if (payload.startOffset != null) form.set("start_offset", String(payload.startOffset));
        if (payload.endOffset != null) form.set("end_offset", String(payload.endOffset));
        const ext = (payload.audioBlob.type || "").includes("webm") ? "webm" : "m4a";
        form.set("audio", payload.audioBlob, `note.${ext}`);
        res = await fetch("/api/notes", { method: "POST", body: form });
      } else {
        res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instance_id: instanceId,
            start_syl_id: payload.startSylId,
            end_syl_id: payload.endSylId,
            anchor_text: payload.anchorText || "",
            kind: "text",
            body_text: payload.bodyText || "",
            start_offset: payload.startOffset ?? null,
            end_offset: payload.endOffset ?? null,
          }),
        });
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const { note } = await res.json();
      setNotes((prev) => [...prev, note]);
      return note;
    },
    [instanceId]
  );

  const updateNote = useCallback(async (id, bodyText) => {
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body_text: bodyText }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `HTTP ${res.status}`);
    }
    const { note } = await res.json();
    setNotes((prev) => prev.map((n) => (n.id === id ? note : n)));
    return note;
  }, []);

  const deleteNote = useCallback(async (id) => {
    // Optimistic removal; restore on failure.
    let removed;
    setNotes((prev) => {
      removed = prev.find((n) => n.id === id);
      return prev.filter((n) => n.id !== id);
    });
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (!res.ok && removed) {
      setNotes((prev) => [...prev, removed]);
      throw new Error(`HTTP ${res.status}`);
    }
  }, []);

  return { notes, loading, error, createNote, updateNote, deleteNote, reload };
}
