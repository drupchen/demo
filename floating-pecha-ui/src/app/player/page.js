"use client";

import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import manifest from '@/data/teachings/rpn_ngondro_recitation_manual/manifest.json';
import sessions from '@/data/teachings/rpn_ngondro_recitation_manual/sessions_compiled.json';

// Import from our single source of truth
import { uchen, inter, getThemeCssVars } from '@/lib/theme';

function PlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const audioRef = useRef(null);
  const transcriptRef = useRef(null);

  const sessionId = searchParams.get('session');
  const mediaParam = searchParams.get('media');
  const timeParam = searchParams.get('time');
  const sylIdParam = searchParams.get('sylId');

  // --- 1. TIME PARSERS & FORMATTERS ---
  const parseToSeconds = (ts) => {
    if (!ts) return 0;
    if (!ts.includes(':')) return parseFloat(ts) || 0;

    const [hms, ms] = ts.split(',');
    const parts = hms.split(':').map(Number);
    let seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    return seconds + (ms ? parseInt(ms) / 1000 : 0);
  };

  const parseToMs = (ts) => Math.floor(parseToSeconds(ts) * 1000);

  const formatMsToDuration = (ms) => {
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds <= 0) return '1s';
    if (totalSeconds < 60) return `${totalSeconds}s`;

    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    if (secs === 0) return `${mins}mn`;
    return `${mins}mn${secs}s`;
  };

  // --- 2. STATE ---
  const [currentTimeMs, setCurrentTimeMs] = useState(() => {
    return timeParam ? parseToMs(timeParam) : 0;
  });

  const [activeSegId, setActiveSegId] = useState(null);
  const [hasInitialSeeked, setHasInitialSeeked] = useState(false);

  // --- 3. DATA GENERATION ---
  const dynamicTranscript = useMemo(() => {
    if (!sessionId) return [];
    const sessionSegments = sessions.filter(seg => seg.source_session === sessionId);
    sessionSegments.sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    return sessionSegments.map((segment) => {
      const syllables = manifest
        .filter(syl => segment.syl_uuids.includes(syl.id))
        .map(s => ({
            id: s.id,
            text: s.text === '\n' ? ' ' : s.text
        }));

      const startTimeMs = parseToMs(segment.start);
      const endTimeMs = segment.end ? parseToMs(segment.end) : startTimeMs + 10000;

      return {
        id: segment.global_seg_id || segment.seg_id,
        startTimeMs,
        endTimeMs,
        durationMs: Math.max(0, endTimeMs - startTimeMs),
        syllables
      };
    });
  }, [sessionId]);

  // --- 4. INITIAL LOAD JUMP ---
  useEffect(() => {
    if (!timeParam) {
      setHasInitialSeeked(true);
      return;
    }

    const targetTimeSeconds = parseToSeconds(timeParam);
    const targetTimeMs = parseToMs(timeParam);

    setCurrentTimeMs(targetTimeMs);

    const audioEl = audioRef.current;
    if (!audioEl) return;

    const performSeek = () => {
      audioEl.currentTime = targetTimeSeconds;
      setHasInitialSeeked(true);
    };

    if (audioEl.readyState >= 1) {
      performSeek();
    } else {
      audioEl.addEventListener('loadedmetadata', performSeek, { once: true });
      return () => audioEl.removeEventListener('loadedmetadata', performSeek);
    }
  }, [timeParam]);

  // --- 5. NATIVE HYPERAUDIO LOGIC ---
  const handleTimeUpdate = () => {
    if (audioRef.current && hasInitialSeeked) {
      setCurrentTimeMs(Math.floor(audioRef.current.currentTime * 1000));
    }
  };

  const handleSyllableClick = (startTimeMs) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTimeMs / 1000;
      audioRef.current.play();
    }
  };

  // --- 6. AUTO-SCROLL LOGIC ---
  useEffect(() => {
    const currentSeg = dynamicTranscript.find(
      (seg) => currentTimeMs >= seg.startTimeMs && currentTimeMs < seg.endTimeMs
    );

    if (currentSeg && currentSeg.id !== activeSegId) {
      setActiveSegId(currentSeg.id);

      const activeElement = document.getElementById(`segment-${currentSeg.id}`);
      if (activeElement && transcriptRef.current) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentTimeMs, dynamicTranscript, activeSegId]);

  if (!sessionId) return <div className="p-20 text-center font-sans">No session provided.</div>;

  const audioSrc = mediaParam || `https://f003.backblazeb2.com/file/rpn-ngondro/${encodeURIComponent(sessionId)}.m4a`;
  const activeIndex = dynamicTranscript.findIndex(seg => seg.id === activeSegId);

  return (
    <div className="min-h-screen bg-[#F7FAFC] p-4 md:p-12" style={getThemeCssVars()}>
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-8 text-2xl font-light text-[var(--theme-gray)] hover:text-[var(--theme-hover-red)] transition-colors"
          aria-label="Close Media"
        >
          ✕
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
          <div className="p-6 bg-gray-50 border-b border-gray-200">
            <audio
              key={sessionId}
              ref={audioRef}
              controls
              preload="auto"
              crossOrigin="anonymous"
              className="w-full"
              src={audioSrc}
              onTimeUpdate={handleTimeUpdate}
            />
          </div>

          <div
            ref={transcriptRef}
            className={`${uchen.className} p-10 text-3xl leading-[1.8] text-justify max-h-[60vh] overflow-y-auto`}
          >
            <article>
              <section>
                <p>
                  {dynamicTranscript.length > 0 ? (
                    dynamicTranscript.map((seg, index) => {
                      const isActive = activeSegId === seg.id;
                      const isFuture = activeIndex !== -1 && index > activeIndex;

                      return (
                        <a
                          key={seg.id}
                          id={`segment-${seg.id}`}
                          onClick={() => handleSyllableClick(seg.startTimeMs)}
                          className={`
                            cursor-pointer rounded px-1 transition-colors duration-200
                            ${isActive ? 'bg-[#f7f3e7]' : 'hover:bg-gray-100'}
                            ${isFuture && !isActive ? 'text-[var(--theme-future-text)]' : 'text-[#23272f]'}
                          `}
                        >
                          {seg.syllables.map((syl, i) => {
                            const isTargetSyl = sylIdParam === syl.id;
                            return (
                              <span
                                key={syl.id || i}
                                className={isTargetSyl ? 'text-[var(--theme-gold)] font-bold' : ''}
                              >
                                {syl.text}
                              </span>
                            );
                          })}

                          <span
                            className={`
                              ${inter.className}
                              inline-flex items-center justify-center px-1.5 py-0.5 mx-2
                              text-sm font-medium text-[var(--theme-badge-text)]
                              bg-[var(--theme-badge-color)] rounded-full align-middle
                              transition-opacity duration-200 tracking-wide
                              ${isFuture && !isActive ? 'opacity-40' : 'opacity-80'}
                            `}
                          >
                            {formatMsToDuration(seg.durationMs)}
                          </span>
                        </a>
                      );
                    })
                  ) : (
                    <span className={`text-gray-400 text-lg ${inter.className}`}>No transcript data found.</span>
                  )}
                </p>
              </section>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center text-gray-400">Loading Session...</div>}>
      <PlayerContent />
    </Suspense>
  );
}