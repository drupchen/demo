"use client";

import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Footer from '@/app/components/Footer';

// Import from our single source of truth
import { uchen, inter, getThemeCssVars } from '@/lib/theme';

function PlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const audioRef = useRef(null);
  const transcriptRef = useRef(null);

  // --- 1. URL PARAMS ---
  const instanceId = searchParams.get('instance') || 'rpn_ngondro_1';
  const urlSessionId = searchParams.get('session');
  const mediaParam = searchParams.get('media');
  const timeParam = searchParams.get('time');
  const sylIdParam = searchParams.get('sylId');

  // --- 2. STATE DECLARATIONS ---
  const [manifest, setManifest] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [audioType, setAudioType] = useState('original');
  const [activeSegId, setActiveSegId] = useState(null);
  const [isCurrentlyPlaying, setIsCurrentlyPlaying] = useState(false);

  // Determine sessionId dynamically
  const sessionId = urlSessionId || (sessions.length > 0 ? sessions[0].source_session : null);

  // --- 3. TIME PARSERS ---
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

  const [currentTimeMs, setCurrentTimeMs] = useState(() => {
    return timeParam ? parseToMs(timeParam) : 0;
  });

  // --- 4. DATA FETCHING ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const [manifestRes, sessionsRes] = await Promise.all([
          fetch(`/data/archive/${instanceId}/manifest.json`),
          fetch(`/data/archive/${instanceId}/${instanceId}_compiled_sessions.json`)
        ]);

        if (manifestRes.ok && sessionsRes.ok) {
          const manifestData = await manifestRes.json();
          const sessionsData = await sessionsRes.json();
          setManifest(manifestData);
          setSessions(sessionsData);
        }
      } catch (error) {
        console.error("Error loading reader data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [instanceId]);

  // --- 5. TRANSCRIPT GENERATION ---
  const dynamicTranscript = useMemo(() => {
    if (!sessionId || manifest.length === 0 || sessions.length === 0) return [];
    const sessionSegments = sessions.filter(seg => seg.source_session === sessionId);
    sessionSegments.sort((a, b) => parseToMs(a.start) - parseToMs(b.start));

    return sessionSegments.map((segment) => {
      const syllables = manifest
        .filter(syl => segment.syl_uuids.includes(syl.id))
        .map(s => ({ id: s.id, text: s.text === '\n' ? ' ' : s.text }));

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
  }, [sessionId, manifest, sessions]);

  // --- 6. SMART AUDIO SOURCE RESOLUTION ---
  const currentSessionSegments = sessions.filter(seg => seg.source_session === sessionId);
  const firstSeg = currentSessionSegments[0];
  const hasRestored = Boolean(firstSeg?.media_restored);
  const effectiveAudioType = (audioType === 'restored' && hasRestored) ? 'restored' : 'original';

  const audioSrc = useMemo(() => {
    const raw = effectiveAudioType === 'restored'
      ? firstSeg?.media_restored
      : (firstSeg?.media_original || firstSeg?.media);
    return raw || mediaParam || null;
  }, [effectiveAudioType, firstSeg, mediaParam]);

  // --- 7. AUTO-SEEK & SYNC LOGIC (The Fix) ---
  useEffect(() => {
    if (!audioRef.current || !audioSrc) return;

    const handleLoadedMetadata = () => {
      let targetSec = 0;

      // If we are switching tracks and already have a segment highlighted
      if (activeSegId) {
        const currentSeg = dynamicTranscript.find(seg => seg.id === activeSegId);
        if (currentSeg) {
          targetSec = currentSeg.startTimeMs / 1000;
        }
      } else if (timeParam) {
        // Fallback for initial page load from URL
        targetSec = parseToSeconds(timeParam);
      }

      audioRef.current.currentTime = targetSec;

      // Resume playback if we were already playing during the toggle
      if (isCurrentlyPlaying) {
        audioRef.current.play().catch(e => console.log("Playback blocked:", e));
      }
    };

    const el = audioRef.current;
    el.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => el.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [audioSrc, dynamicTranscript, activeSegId, timeParam]); // Re-runs whenever audioSrc changes

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTimeMs(Math.floor(audioRef.current.currentTime * 1000));
      setIsCurrentlyPlaying(!audioRef.current.paused);
    }
  };

  const handleSyllableClick = (startTimeMs, segId) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTimeMs / 1000;
      setCurrentTimeMs(startTimeMs);
      setActiveSegId(segId);
      audioRef.current.play().catch(e => console.log(e));
    }
  };

  useEffect(() => {
    // 1. Force the main browser window to stay at the top so the 'X' is always visible
    window.scrollTo(0, 0);

    let currentSeg = dynamicTranscript.find(
      (seg) => currentTimeMs >= seg.startTimeMs && currentTimeMs < seg.endTimeMs
    );

    if (!currentSeg) {
      const pastSegments = dynamicTranscript.filter(seg => seg.startTimeMs <= currentTimeMs);
      if (pastSegments.length > 0) {
        currentSeg = pastSegments[pastSegments.length - 1];
      }
    }

    if (currentSeg && currentSeg.id !== activeSegId) {
      setActiveSegId(currentSeg.id);
      const activeElement = document.getElementById(`segment-${currentSeg.id}`);

      if (activeElement && transcriptRef.current) {
        // 2. Scroll ONLY the inner transcript box, leaving the outer page alone
        const container = transcriptRef.current;

        // Calculate the exact pixel location to center the text inside the box
        const targetScrollTop = activeElement.offsetTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2);

        container.scrollTo({
          top: Math.max(0, targetScrollTop), // Prevent negative scroll values
          behavior: 'smooth'
        });
      }
    }
  }, [currentTimeMs, dynamicTranscript, activeSegId]);

  const switchAudio = (type) => {
    if (type === 'restored' && !hasRestored) return;
    if (audioRef.current) {
      // Capture the playing state before the component re-renders and key changes
      setIsCurrentlyPlaying(!audioRef.current.paused);
      setAudioType(type);
    }
  };

  if (isLoading) return <div className="p-20 text-center font-sans text-gray-500">Loading...</div>;

  const activeIndex = dynamicTranscript.findIndex(seg => seg.id === activeSegId);

  return (
    <main className="min-h-[calc(100vh-81px)] bg-[#F7FAFC] flex flex-col overflow-x-hidden" style={getThemeCssVars()}>

      {/* FLOATING STICKY BAR */}
      <nav
        className="fixed top-0 z-[60] w-full bg-[#F7FAFC]/95 backdrop-blur-xl border-b border-gray-200 px-8 md:px-12 h-20"
      >
        <div className="max-w-5xl mx-auto h-full flex items-center">
          <button
            onClick={() => router.push('/archive')}
            className="group flex items-center gap-3 text-[var(--theme-gray)] hover:text-[var(--theme-hover-red)] transition-all"
            aria-label="Back to Catalog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-300 group-hover:-translate-x-1.5"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>

            <span className={`${inter.className} text-[10px] md:text-xs font-bold uppercase tracking-[0.2em]`}>
              Back to Catalog
            </span>
          </button>
        </div>
      </nav>

      {/* ORIGINAL PLAYER CONTENT */}
      <div className="pt-28 pb-4 px-4 md:pt-32 md:pb-12 md:px-12">
        <div className="max-w-5xl mx-auto">

          <div className="flex justify-between items-center mb-8">
            <button onClick={() => router.back()} className="text-2xl font-light text-[var(--theme-gray)] hover:text-[var(--theme-hover-red)]">✕</button>

            <div className="flex bg-gray-200/80 p-1 rounded-lg border border-gray-300 shadow-inner">
              <button
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${effectiveAudioType === 'original' ? 'bg-[#C19A5B] text-black shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                onClick={() => switchAudio('original')}
              > Original </button>
              <button
                disabled={!hasRestored}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${!hasRestored ? 'text-gray-400 cursor-not-allowed' : effectiveAudioType === 'restored' ? 'bg-[#C19A5B] text-black shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                onClick={() => switchAudio('restored')}
              > Restored </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
            <div className="p-6 bg-gray-50 border-b border-gray-200">
              <audio
                key={`${sessionId}-${effectiveAudioType}`} // Track swap force-mount
                ref={audioRef}
                controls
                className="w-full"
                src={audioSrc}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsCurrentlyPlaying(true)}
                onPause={() => setIsCurrentlyPlaying(false)}
              />
            </div>

            <div ref={transcriptRef} className={`relative ${uchen.className} p-10 text-3xl leading-[1.8] text-justify max-h-[60vh] overflow-y-auto`}>
              <p>
                {dynamicTranscript.map((seg, index) => {
                  const isActive = activeSegId === seg.id;
                  const isFuture = activeIndex !== -1 && index > activeIndex;
                  return (
                    <a
                      key={seg.id}
                      id={`segment-${seg.id}`}
                      onClick={() => handleSyllableClick(seg.startTimeMs, seg.id)}
                      className={`cursor-pointer rounded px-1 transition-colors ${isActive ? 'bg-[#f7f3e7]' : 'hover:bg-gray-100'} ${isFuture && !isActive ? 'text-[var(--theme-future-text)]' : 'text-[#23272f]'}`}
                    >
                      {seg.syllables.map((syl, i) => (
                        <span key={syl.id || i} className={sylIdParam === syl.id ? 'text-[var(--theme-gold)] font-bold' : ''}>{syl.text}</span>
                      ))}
                      <span className={`${inter.className} inline-flex items-center justify-center px-1.5 py-0.5 mx-2 text-sm font-medium text-[var(--theme-badge-text)] bg-[var(--theme-badge-color)] rounded-full align-middle transition-opacity ${isFuture && !isActive ? 'opacity-40' : 'opacity-80'}`}>
                        {formatMsToDuration(seg.durationMs)}
                      </span>
                    </a>
                  );
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* FOOTER */}
      <Footer className="mt-8" />
    </main>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center text-gray-400">Loading...</div>}>
      <PlayerContent />
    </Suspense>
  );
}