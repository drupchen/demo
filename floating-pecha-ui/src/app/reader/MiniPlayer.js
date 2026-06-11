"use client";

import { useMemo, useCallback, useRef, useState } from 'react';
import { inter } from '@/lib/theme';

/**
 * Coverage navigation bar — fixed at the bottom of the screen.
 *
 * Design:
 * - Full-width darker gray background representing the entire text length.
 * - One horizontal band per teaching instance, drawn on top.
 * - Expanded on hover to show teaching letters and titles.
 * - A semi-transparent overlay with edge hairlines tracks the visible viewport.
 * - Clicking anywhere scrolls to that position in the text.
 */
export default function MiniPlayer({
  manifest,
  sessions,
  allTeachingGroups,
  activeTeachingFilter,
  getCommentaryGroup,
  commentaryColorMap,
  viewportRange,        // { start: 0..1, end: 0..1 }
  onNavigateToPosition, // (fraction: 0..1) => void
  syllableWeights       // Float64Array of cumulative Tibetan text weights
}) {
  const barRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  // Build per-teaching coverage bands
  const bands = useMemo(() => {
    if (!manifest || manifest.length === 0 || !allTeachingGroups || allTeachingGroups.length === 0 || !syllableWeights) return [];

    const uuidToIdx = {};
    manifest.forEach((syl, idx) => { if (syl.id) uuidToIdx[syl.id] = idx; });
    const totalWeight = syllableWeights[manifest.length];

    return allTeachingGroups.map(group => {
      const coveredIndices = new Set();
      sessions.forEach(seg => {
        if (!seg.syl_uuids || !seg.source_session) return;
        if (getCommentaryGroup(seg.source_session) !== group) return;
        seg.syl_uuids.forEach(uuid => {
          const idx = uuidToIdx[uuid];
          if (idx !== undefined) coveredIndices.add(idx);
        });
      });

      const sorted = Array.from(coveredIndices).sort((a, b) => a - b);
      const runs = [];
      let rStart = -1, rEnd = -1;

      sorted.forEach(idx => {
        if (rStart === -1) { rStart = idx; rEnd = idx; }
        else if (idx <= rEnd + 3) { rEnd = idx; }
        else {
          runs.push({
            s: syllableWeights[rStart] / totalWeight,
            e: syllableWeights[rEnd + 1] / totalWeight
          });
          rStart = idx; rEnd = idx;
        }
      });
      if (rStart !== -1) {
        runs.push({
          s: syllableWeights[rStart] / totalWeight,
          e: syllableWeights[rEnd + 1] / totalWeight
        });
      }

      return { group, color: commentaryColorMap[group] || '#999', runs };
    });
  }, [manifest, sessions, allTeachingGroups, getCommentaryGroup, commentaryColorMap, syllableWeights]);

  // Click → navigate
  const handleClick = useCallback((e) => {
    const bar = barRef.current;
    if (!bar || !onNavigateToPosition) return;
    const rect = bar.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onNavigateToPosition(frac);
  }, [onNavigateToPosition]);

  // Layout calculations
  const scale = isHovered ? 2 : 1;
  const bandH = (bands.length === 1 ? 5 : 3) * scale;
  const bandGap = 2 * scale;
  // Diminish gray area above/below when expanded
  const bandPaddingY = isHovered ? 3 * scale : 6 * scale;

  const innerBarsHeight = bands.length * (bandH + bandGap) - bandGap;
  const grayBarHeight = innerBarsHeight + bandPaddingY * 2;

  const titleSpace = isHovered ? 32 : 8; // Extra top space for the "Text Navigation" title
  const bottomSpace = isHovered ? 16 : 8;
  const totalH = titleSpace + grayBarHeight + bottomSpace;

  // Viewport indicator position
  const vpStart = viewportRange?.start ?? 0;
  const vpEnd = viewportRange?.end ?? 0.1;

  // Space allocation: textBarsLeft shifts the gray bar when hovered to make room for teaching letters
  const textBarsLeft = isHovered ? 24 : 8;
  const textBarsRight = 8;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[70] border-t border-black/[0.08] transition-all duration-300 ease-out"
      style={{
        height: totalH,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(250,248,244,0.97) 100%)',
        backdropFilter: 'blur(12px)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="w-full h-full relative select-none">

        {/* Title above gray bar */}
        <div
          className={`absolute font-bold text-[#A39E97] uppercase tracking-[0.2em] transition-all duration-300 ${inter.className} ${isHovered ? 'opacity-100 text-[10px]' : 'opacity-0 text-[8px]'}`}
          style={{ top: isHovered ? 12 : 0, left: textBarsLeft, pointerEvents: 'none' }}
        >
          Text Navigation
        </div>

        {/* Gray background — perfectly wraps the text bands with zero internal side padding */}
        <div
          ref={barRef}
          className="absolute transition-all duration-300 ease-out flex items-center cursor-pointer"
          onClick={handleClick}
          role="navigation"
          aria-label="Text coverage map — click to navigate"
          style={{
            top: titleSpace,
            height: grayBarHeight,
            left: textBarsLeft,
            right: textBarsRight,
            backgroundColor: '#D4CFC9'
          }}
        >
          {/* The physical bands */}
          <div
            className="absolute left-0 right-0 transition-all duration-300 ease-out"
            style={{ top: bandPaddingY, bottom: bandPaddingY }}
          >
            {bands.map((band, bIdx) => {
              return (
                <div
                  key={band.group}
                  className="absolute left-0 right-0 transition-all duration-300 ease-out"
                  style={{ top: bIdx * (bandH + bandGap), height: bandH }}
                >
                  {/* Teaching letter positioned strictly outside the left edge of the gray bar */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-bold transition-opacity duration-300 pointer-events-none ${inter.className} ${isHovered ? 'opacity-100' : 'opacity-0'}`}
                    style={{ color: band.color, left: -textBarsLeft, width: textBarsLeft, textAlign: 'center' }}
                  >
                    {band.group}
                  </div>

                  {/* Band segments */}
                  {band.runs.map((run, rIdx) => (
                    <div
                      key={rIdx}
                      className="absolute top-0 h-full rounded-[1px] transition-all duration-300 pointer-events-none"
                      style={{
                        left: `${run.s * 100}%`,
                        width: `${Math.max(0.4, (run.e - run.s) * 100)}%`,
                        backgroundColor: band.color,
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Viewport indicator — tracks visible text */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none transition-all duration-100 linear"
            style={{
              left: `${vpStart * 100}%`,
              width: `${Math.max(0.3, (vpEnd - vpStart) * 100)}%`,
              zIndex: 20
            }}
          >
            {/* Left hairline */}
            <div
              className="absolute top-0 bottom-0 transition-colors duration-300"
              style={{ left: 0, width: 1.5, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 1 }}
            />
            {/* Viewport fill */}
            <div
              className="absolute inset-0 transition-colors duration-300"
              style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
            />
            {/* Right hairline */}
            <div
              className="absolute top-0 bottom-0 transition-colors duration-300"
              style={{ right: 0, width: 1.5, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 1 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
