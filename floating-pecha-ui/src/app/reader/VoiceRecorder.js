"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inter } from "@/lib/theme";

// Pick a MIME type the browser can actually record. Safari cannot do webm.
function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export default function VoiceRecorder({ onRecorded, onClear }) {
  const [state, setState] = useState("idle"); // idle | recording | recorded | denied
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopTracks();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, stopTracks]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        const durationMs = Date.now() - startedAtRef.current;
        onRecorded?.(blob, durationMs);
        setState("recorded");
        stopTracks();
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("Mic access failed:", err);
      setState("denied");
    }
  }, [onRecorded, stopTracks]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSeconds(0);
    setState("idle");
    onClear?.();
  }, [previewUrl, onClear]);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className={`${inter.className} flex items-center gap-3`}>
      {state === "idle" && (
        <button type="button" onClick={start}
          className="px-3 py-1.5 rounded-md text-xs font-semibold r-text-accent border r-border r-hover-accent">
          ● Enregistrer
        </button>
      )}
      {state === "recording" && (
        <button type="button" onClick={stop}
          className="px-3 py-1.5 rounded-md text-xs font-semibold text-white"
          style={{ backgroundColor: "#8B1D1D" }}>
          ■ Stop · {mmss}
        </button>
      )}
      {state === "recorded" && previewUrl && (
        <>
          <audio src={previewUrl} controls className="h-8" />
          <button type="button" onClick={reset}
            className="text-xs r-text-muted r-hover-accent underline">
            Refaire
          </button>
        </>
      )}
      {state === "denied" && (
        <span className="text-xs" style={{ color: "#8B1D1D" }}>
          Micro indisponible — utilisez une note texte.
        </span>
      )}
    </div>
  );
}
