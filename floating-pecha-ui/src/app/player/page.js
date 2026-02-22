"use client";

import { useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Uchen } from 'next/font/google';

import manifest from '@/data/teachings/rpn_ngondro_recitation_manual/manifest.json';
import sessions from '@/data/teachings/rpn_ngondro_recitation_manual/sessions_compiled.json';
import Script from 'next/script';

const uchen = Uchen({ weight: '400', subsets: ['tibetan'], display: 'swap' });

function PlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const audioRef = useRef(null);

  const sessionId = searchParams.get('session');
  const startTimeStr = searchParams.get('time');
  const mediaParam = searchParams.get('media'); // <-- Grab the exact media string

  const parseToSeconds = (ts) => {
    if (!ts || !ts.includes(':')) return 0;
    const [hms, ms] = ts.split(',');
    const parts = hms.split(':').map(Number);
    let seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    return seconds + (ms ? parseInt(ms) / 1000 : 0);
  };

  const parseToMs = (ts) => {
    return Math.floor(parseToSeconds(ts) * 1000);
  };

  const dynamicTranscript = useMemo(() => {
    if (!sessionId) return [];

    const sessionSegments = sessions.filter(
      seg => seg.source_session === sessionId
    );

    sessionSegments.sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    return sessionSegments.map((segment) => {
      const segmentSyllables = manifest.filter(syl =>
        segment.syl_uuids.includes(syl.id)
      );

      const text = segmentSyllables.map(s => s.text === '\n' ? ' ' : s.text).join('') + ' ';

      const startTimeMs = parseToMs(segment.start);
      const endTimeMs = segment.end ? parseToMs(segment.end) : startTimeMs + 10000;

      const durationMs = Math.max(0, endTimeMs - startTimeMs);

      return {
        id: segment.global_seg_id || segment.seg_id,
        startTimeMs: startTimeMs,
        durationMs: durationMs, // <--- This calculates the duration
        text: text
      };
    });
  }, [sessionId]);

  useEffect(() => {
  if (dynamicTranscript.length === 0 || !sessionId) return;

  const initializeHyperaudio = async () => {
    // 1. Helper to load script only if it doesn't exist
    const loadScript = (src, id) => {
      return new Promise((resolve) => {
        if (document.getElementById(id)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.id = id;
        script.async = false;
        script.onload = () => {
          console.log(`✅ Script ready: ${src}`);
          resolve();
        };
        document.body.appendChild(script);
      });
    };

    try {
      // 2. Load the core files
      await loadScript('/js/hyperaudio-lite.js', 'hyper-core');
      await loadScript('/js/hyperaudio-lite-extension.js', 'hyper-ext');

      // 3. Wait for the browser to register the 'class HyperaudioLite'
      // We use a small delay and check the global scope
      setTimeout(() => {
        const player = document.getElementById("hyperplayer");
        const transcript = document.getElementById("hypertranscript");

        // Since it's a global class, it should be on 'window'
        const HyperEngine = window.HyperaudioLite;

        if (player && transcript && HyperEngine) {
          console.log("🚀 Found HyperaudioLite class. Initializing...");

          // Clear any existing instance to avoid double-highlighting
          if (window.currentHyperaudioInstance) {
            window.currentHyperaudioInstance = null;
          }

          window.currentHyperaudioInstance = new HyperEngine(
            "hypertranscript",
            "hyperplayer",
            false, true, false, false
          );

          console.log("✨ Sync Active!");
        } else {
          console.warn("⚠️ Requirements missing:", {
            player: !!player,
            transcript: !!transcript,
            engine: !!HyperEngine
          });
        }
      }, 300); // 300ms delay to allow class registration
    } catch (e) {
      console.error("❌ Hyperaudio Setup Failed:", e);
    }
  };

  initializeHyperaudio();
}, [dynamicTranscript, sessionId]);

  if (!sessionId) return <div className="p-20 text-center">No session provided.</div>;

  // Use the mediaUrl from the JSON. Fallback to guessing if it's missing.
  const audioSrc = mediaParam
    ? mediaParam
    : `https://f003.backblazeb2.com/file/rpn-ngondro/${encodeURIComponent(sessionId)}.m4a`;

  return (
    <div className="min-h-screen bg-[#F7FAFC] p-4 md:p-12">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-8 text-2xl font-light text-gray-400 hover:text-[#8B1D1D] transition-colors"
        >
          ✕ Close Media
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
          <div className="p-6 bg-gray-50 border-b border-gray-200">
            {sessionId ? (
              <audio
                key={sessionId}
                id="hyperplayer"
                ref={audioRef}
                controls
                preload="auto"
                // Adding crossOrigin="anonymous" is sometimes required by browsers to process external media
                crossOrigin="anonymous"
                className="w-full"
                src={audioSrc}
                onError={(e) => console.error("Audio failed to load from:", audioSrc)}
              />
            ) : (
              <div className="animate-pulse h-14 bg-gray-200 rounded w-full"></div>
            )}
          </div>

          <div
            id="hypertranscript"
            className={`${uchen.className} p-10 text-3xl leading-[1.8] text-justify hyperaudio-transcript max-h-[60vh] overflow-y-auto`}
          >
            <article>
              <section>
                <p>
                  {dynamicTranscript.length > 0 ? (
                    dynamicTranscript.map((seg) => (
                      <a
                        key={seg.id}
                        data-m={seg.startTimeMs}
                        data-d={seg.durationMs}
                        className="transition-colors duration-200 hover:bg-gray-100 rounded px-1 cursor-pointer"
                      >
                        {seg.text}
                      </a>
                    ))
                  ) : (
                    <span className="font-sans text-gray-400 text-lg">
                      No transcript data found.
                    </span>
                  )}
                </p>
              </section>
            </article>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400 uppercase tracking-widest font-sans">
          Session: {sessionId}
        </div>
      </div>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center font-sans text-gray-400">Loading Session...</div>}>
      <PlayerContent />
    </Suspense>
  );
}