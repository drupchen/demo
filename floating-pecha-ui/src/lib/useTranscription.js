"use client";

import { useEffect, useMemo, useState } from "react";
import { parseToMs } from "./useAudioPlayer";

/**
 * Loads the oral-transcription layer for an instance and derives the maps the
 * reader needs to display it. Both transcription files share the exact shape of
 * the root `manifest.json` / `{instance}_compiled_sessions.json`, so everything
 * here mirrors the reader's own `syllableMediaMap` conventions.
 *
 * The bridge to the root text is `global_seg_id`: every root compiled-session
 * entry and the transcription segment aligned to it carry the same id.
 *
 * Degrades gracefully: when the files are absent (instance not yet transcribed),
 * `hasTranscription` is false and all maps are empty.
 *
 * @param {string} instanceId
 */
export function useTranscription(instanceId) {
  const [transManifest, setTransManifest] = useState([]);
  const [transSessions, setTransSessions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const loadJson = async (file) => {
      try {
        const res = await fetch(`/data/archive/${instanceId}/${file}`);
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    };
    const load = async () => {
      const [m, s] = await Promise.all([
        loadJson("transcription_manifest.json"),
        loadJson(`${instanceId}_transcription_sessions.json`),
      ]);
      if (cancelled) return;
      setTransManifest(m || []);
      setTransSessions(s || []);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  const hasTranscription = transManifest.length > 0 && transSessions.length > 0;

  // global_seg_id -> ordered [{ id, text }] of that segment's transcription tokens.
  const transSegSylsByGid = useMemo(() => {
    if (!hasTranscription) return {};
    const byId = {};
    transManifest.forEach((t) => {
      byId[t.id] = t.text === "\n" ? " " : t.text;
    });
    const out = {};
    transSessions.forEach((seg) => {
      const gid = seg.global_seg_id || seg.seg_id;
      out[gid] = seg.syl_uuids.map((id) => ({ id, text: byId[id] ?? "" }));
    });
    return out;
  }, [hasTranscription, transManifest, transSessions]);

  // global_seg_id -> concatenated transcription text (read-along string).
  const transTextByGid = useMemo(() => {
    const out = {};
    for (const gid in transSegSylsByGid) {
      out[gid] = transSegSylsByGid[gid].map((s) => s.text).join("");
    }
    return out;
  }, [transSegSylsByGid]);

  // transcription syllable uuid -> [media options] (same builder as the reader's
  // syllableMediaMap, but over the transcription sessions). Powers click→play in
  // the standalone transcription view.
  const transMediaMap = useMemo(() => {
    const map = {};
    transSessions.forEach((segment) => {
      if (!segment.media_original && !segment.media_restored) return;
      const segId = segment.global_seg_id || segment.seg_id;
      segment.syl_uuids.forEach((uuid) => {
        if (!map[uuid]) map[uuid] = [];
        if (!map[uuid].some((opt) => opt.global_seg_id === segId)) {
          map[uuid].push({
            media_original: segment.media_original || "",
            media_restored: segment.media_restored || "",
            start: segment.start,
            end: segment.end,
            global_seg_id: segId,
            source_session: segment.source_session,
            syl_uuids: segment.syl_uuids,
          });
        }
      });
    });
    return map;
  }, [transSessions]);

  // session id -> that session's transcription segments, in audio order.
  const transBySession = useMemo(() => {
    const out = {};
    transSessions.forEach((seg) => {
      const key = seg.source_session;
      if (!out[key]) out[key] = [];
      out[key].push(seg);
    });
    for (const key in out) {
      out[key].sort((a, b) => parseToMs(a.start) - parseToMs(b.start));
    }
    return out;
  }, [transSessions]);

  return {
    hasTranscription,
    transManifest,
    transSessions,
    transSegSylsByGid,
    transTextByGid,
    transMediaMap,
    transBySession,
  };
}
