"use client";

import { useEffect, useRef, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Uchen } from 'next/font/google';
import Script from 'next/script'; // Utilizing Next.js native script loader

import manifest from '@/data/teachings/rpn_ngondro_recitation_manual/manifest.json';
import sessions from '@/data/teachings/rpn_ngondro_recitation_manual/sessions_compiled.json';

const uchen = Uchen({ weight: '400', subsets: ['tibetan'], display: 'swap' });

function PlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const audioRef = useRef(null);

  // Track when the external Hyperaudio scripts are fully loaded
  const [hyperReady, setHyperReady] = useState(false);

  const sessionId = searchParams.get('session');
  const mediaParam = searchParams.get('media');

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
        startTimeMs,
        durationMs,
        text
      };
    });
  }, [sessionId]);

  // Transform the transcript into a raw HTML string to act as a React "Black Box"
  const transcriptHtml = useMemo(() => {
    if (dynamicTranscript.length === 0) return '';
    return dynamicTranscript.map(seg =>
      `<a data-m="${seg.startTimeMs}" data-d="${seg.durationMs}" class="transition-colors duration-200 hover:bg-gray-100 rounded px-1 cursor-pointer">${seg.text}</a>`
    ).join('');
  }, [dynamicTranscript]);

  useEffect(() => {
    // Only initialize once the scripts are ready, data is parsed, and HTML is generated
    if (hyperReady && transcriptHtml && sessionId) {
      // Clear any existing instance to avoid double-binding the timeupdate listener
      if (window.currentHyperaudioInstance) {
        window.currentHyperaudioInstance = null;
      }

      // A tiny 100ms timeout ensures React has finished flushing the dangerouslySetInnerHTML to the real DOM
      const timer = setTimeout(() => {
        if (window.HyperaudioLite) {
          window.currentHyperaudioInstance = new window.HyperaudioLite(
            "hypertranscript",
            "hyperplayer",
            false, true, false, false
          );
          console.log("✨ Hyperaudio Sync Active!");
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [hyperReady, transcriptHtml, sessionId]);

  if (!sessionId) return <div className="p-20 text-center">No session provided.</div>;

  const audioSrc = mediaParam
    ? mediaParam
    : `https://f003.backblazeb2.com/file/rpn-ngondro/${encodeURIComponent(sessionId)}.m4a`;

  return (
    <div className="min-h-screen bg-[#F7FAFC] p-4 md:p-12">
      {/* Let Next.js handle script loading securely and performantly.
        We trigger our hyperReady state only when the extension (the final script) is ready.
      */}
      <Script src="/js/hyperaudio-lite.js" strategy="afterInteractive" />
      <Script
        src="/js/hyperaudio-lite-extension.js"
        strategy="afterInteractive"
        onReady={() => setHyperReady(true)}
      />

      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-8 text-2xl font-light text-gray-400 hover:text-[#8B1D1D] transition-colors"
        >
          ✕ Close Media
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
          <div className="p-6 bg-gray-50 border-b border-gray-200">
            <audio
              key={sessionId}
              id="hyperplayer"
              ref={audioRef}
              controls
              preload="auto"
              crossOrigin="anonymous"
              className="w-full"
              src={audioSrc}
              onError={(e) => console.error("Audio failed to load from:", audioSrc)}
            />
          </div>

          <div
            id="hypertranscript"
            className={`${uchen.className} p-10 text-3xl leading-[1.8] text-justify hyperaudio-transcript max-h-[60vh] overflow-y-auto`}
          >
            <article>
              <section>
                {/* By injecting HTML directly, React relinquishes control of the children.
                  Hyperaudio can now mutate classes and add event listeners safely.
                */}
                {transcriptHtml ? (
                  <p dangerouslySetInnerHTML={{ __html: transcriptHtml }} />
                ) : (
                  <span className="font-sans text-gray-400 text-lg">
                    No transcript data found.
                  </span>
                )}
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