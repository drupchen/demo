"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Uchen } from 'next/font/google';
import manifest from '@/data/teachings/rpn_ngondro_recitation_manual/manifest.json';
import sessions from '@/data/teachings/rpn_ngondro_recitation_manual/sessions_compiled.json';

const uchen = Uchen({
  weight: '400',
  subsets: ['tibetan'],
  display: 'swap',
});

// ==========================================
// 1. TYPOGRAPHY & LAYOUT CONFIGURATION
// ==========================================
const BIG_SIZE_REM = 2.25;
const SMALL_RATIO = 0.70;

const SIZES = {
  TITLE: { fontSize: "3rem", lineHeight: "1.3", fontWeight: "" },
  BIG: { fontSize: `${BIG_SIZE_REM}rem`, lineHeight: "1.6" },
  SMALL: { fontSize: `${BIG_SIZE_REM * SMALL_RATIO}rem`, lineHeight: "1.6", verticalAlign: "0.33em" },
  DEFAULT: { fontSize: "1.5rem", lineHeight: "1.6" }
};

export default function Home() {
  const router = useRouter();
  const [activeId, setActiveId] = useState(null);
  const [contextOptions, setContextOptions] = useState([]);

  // Calculate the media map first so it's ready when restoring state
  const syllableMediaMap = useMemo(() => {
    const map = {};
    sessions.forEach(segment => {
      if (segment.media) {
        segment.syl_uuids.forEach(uuid => {
          if (!map[uuid]) map[uuid] = [];
          const exists = map[uuid].some(opt => opt.segId === (segment.global_seg_id || segment.seg_id));
          if (!exists) {
            map[uuid].push({
              mediaUrl: segment.media,
              startTime: segment.start,
              segId: segment.global_seg_id || segment.seg_id,
              source: segment.source_session,
              sylUuids: segment.syl_uuids
            });
          }
        });
      }
    });
    return map;
  }, []);

  // Restore scroll position AND the open Gap when returning from player
  useEffect(() => {
    const savedPos = sessionStorage.getItem('ebook-scroll-pos');
    const savedActiveId = sessionStorage.getItem('ebook-active-id');

    // 1. Restore the open gap if we saved one
    if (savedActiveId && syllableMediaMap[savedActiveId]) {
      setActiveId(savedActiveId);
      setContextOptions(syllableMediaMap[savedActiveId]);
      sessionStorage.removeItem('ebook-active-id'); // Clean up
    }

    // 2. Restore the scroll position
    if (savedPos) {
      setTimeout(() => {
        window.scrollTo({ top: parseInt(savedPos), behavior: 'instant' });
        sessionStorage.removeItem('ebook-scroll-pos'); // Clean up
      }, 150);
    }
  }, [syllableMediaMap]);

  const handleSyllableClick = (syllable, options) => {
    if (activeId === syllable.id) {
      setActiveId(null);
      setContextOptions([]);
    } else {
      setActiveId(syllable.id);
      setContextOptions(options);
    }
  };

  const navigateToPlayer = (opt) => {
    // Save current scroll position AND the currently open syllable ID
    sessionStorage.setItem('ebook-scroll-pos', window.scrollY.toString());
    if (activeId) sessionStorage.setItem('ebook-active-id', activeId);

    // NEW: Pass the exact mediaUrl from the JSON to the player
    router.push(`/player?session=${opt.source}&time=${opt.startTime}&media=${encodeURIComponent(opt.mediaUrl)}`);
  };

  const renderSegmentText = (opt, currentActiveId) => {
    const segmentSyllables = manifest.filter(s => opt.sylUuids.includes(s.id));
    return segmentSyllables.map(s => {
      if (s.text === '\n') return " ";
      const isTarget = currentActiveId === s.id;
      const baseStyle = SIZES[s.size?.toUpperCase()] || SIZES.DEFAULT;
      return (
        <span
          key={`ctx-${s.id}`}
          className={isTarget ? "text-[#D4AF37] font-bold" : "text-black"}
          style={{
            ...baseStyle,
            fontSize: `${parseFloat(baseStyle.fontSize) * 0.55}rem`,
            lineHeight: "1.55"
          }}
        >
          {s.text}
        </span>
      );
    });
  };

  return (
    <main className="min-h-screen bg-[#2F2F2F] p-4 md:p-12">
      <div className="max-w-5xl mx-auto bg-[#F9F9F7] rounded shadow-2xl">
        <div className="p-8 md:p-16 text-justify leading-relaxed">
          {manifest.map((syl) => {
            if (syl.text === '\n') return <div key={syl.id} className="block h-8" />;

            const mediaOptions = syllableMediaMap[syl.id] || [];
            const hasMedia = mediaOptions.length > 0;
            const isSelected = activeId === syl.id;
            const fontClass = (syl.nature === 'TEXT' || syl.nature === 'PUNCT' || syl.nature === 'SYM') ? uchen.className : 'font-sans';
            const sizeStyle = SIZES[syl.size?.toUpperCase()] || SIZES.DEFAULT;

            return (
              <React.Fragment key={syl.id}>
                <span
                  onClick={hasMedia ? () => handleSyllableClick(syl, mediaOptions) : undefined}
                  className={`${fontClass} inline transition-all duration-300 ${
                    hasMedia ? "cursor-pointer hover:text-[#8B1D1D] border-b border-transparent hover:border-[#D4AF37]" : "text-gray-400"
                  } ${isSelected ? "text-[#D4AF37] font-bold" : "text-black"}`}
                  style={{ ...sizeStyle, whiteSpace: 'pre-wrap' }}
                >
                  {syl.text}
                </span>

                {isSelected && (
                  <div className="block w-full my-8 clear-both cursor-default">
                    <div className="bg-[#EBEBEB] border-y-2 border-[#D4AF37]/50 py-12 px-8 md:px-16 -mx-8 md:-mx-16 relative shadow-[inner_0_2px_10px_rgba(0,0,0,0.05)] animate-in fade-in zoom-in-95 duration-300">

                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveId(null); }}
                        className="absolute top-4 right-8 md:right-16 text-2xl md:text-4xl font-light text-gray-400 hover:text-[#8B1D1D] transition-colors leading-none"
                        aria-label="Close"
                      >
                        ✕
                      </button>

                      <div className="max-w-4xl mx-auto" style={{ textAlign: 'left' }}>
                        <ul className="divide-y divide-[#D4AF37]/30">
                          {contextOptions.map((opt, idx) => (
                            <li key={idx} className="py-6 first:pt-0 last:pb-0">
                              <button
                                onClick={() => navigateToPlayer(opt)}
                                className="w-full text-left hover:bg-white/60 p-4 rounded-xl transition-all"
                              >
                                <div className={`${uchen.className}`}>
                                  {renderSegmentText(opt, activeId)}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </main>
  );
}