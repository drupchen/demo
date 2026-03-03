"use client";

import { useMemo } from 'react';
import { inter, uchen } from '@/lib/theme';
import { parseToMs, formatDurationMs } from '@/lib/useAudioPlayer';

export default function InfoTab({ instanceId, activeCommentary, activeCommentarySegments, sessions, manifest, getCommentaryGroup }) {

  // Calculate total duration using all segments
  const totalDurationMs = useMemo(() => {
    return sessions.reduce((acc, seg) => {
      const start = parseToMs(seg.start);
      const end = seg.end ? parseToMs(seg.end) : start + 10000;
      return acc + Math.max(0, end - start);
    }, 0);
  }, [sessions]);

  // Calculate Text Coverage Percentage
  // How many TEXT/manifest syllables are covered by any segment vs total
  const coverageStats = useMemo(() => {
    if (!manifest || manifest.length === 0) return { percent: 0, coveredCount: 0, totalCount: 0 };

    // Only count actual readable text syllables (ignore spaces and punctuation if desired, but here we count all non-newline)
    const validSyls = manifest.filter(s => s.text !== '\n');
    const totalCount = validSyls.length;

    const coveredUuids = new Set();
    sessions.forEach(seg => {
      if (seg.syl_uuids) {
        seg.syl_uuids.forEach(uuid => coveredUuids.add(uuid));
      }
    });

    // Count how many valid syllables are in the covered set
    const coveredCount = validSyls.filter(s => coveredUuids.has(s.id)).length;

    return {
      percent: totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0,
      coveredCount,
      totalCount
    };
  }, [manifest, sessions]);

  // Generate an array of 50 chunks for the timeline visualization
  const timelineBlocks = useMemo(() => {
    if (!manifest || manifest.length === 0) return [];

    const numBlocks = 50;
    const blocks = [];
    const chunkSize = Math.ceil(manifest.length / numBlocks);

    const coveredUuids = new Set();
    if (activeCommentary) {
      // If a commentary is active, only show coverage for THAT commentary
      activeCommentarySegments.forEach(seg => {
        if (seg.syl_uuids) seg.syl_uuids.forEach(u => coveredUuids.add(u));
      });
    } else {
      // Otherwise show global coverage
      sessions.forEach(seg => {
        if (seg.syl_uuids) seg.syl_uuids.forEach(u => coveredUuids.add(u));
      });
    }

    for (let i = 0; i < numBlocks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, manifest.length);
      const chunkSyls = manifest.slice(start, end);

      // Calculate coverage ratio for this chunk
      let coveredCount = 0;
      chunkSyls.forEach(s => {
        if (coveredUuids.has(s.id)) coveredCount++;
      });

      const ratio = chunkSyls.length > 0 ? coveredCount / chunkSyls.length : 0;
      blocks.push(ratio);
    }

    return blocks;
  }, [manifest, sessions, activeCommentarySegments, activeCommentary]);

  // Current Commentary stats
  const activeDurationMs = useMemo(() => {
    return activeCommentarySegments.reduce((acc, seg) => {
      const start = parseToMs(seg.start);
      const end = seg.end ? parseToMs(seg.end) : start + 10000;
      return acc + Math.max(0, end - start);
    }, 0);
  }, [activeCommentarySegments]);

  return (
    <div className={`${inter.className} space-y-8`}>

      {/* Global Instance Stats */}
      <div className="bg-white p-5 rounded-2xl border r-border shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-widest mb-4 r-text-secondary">Teaching Overview</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase r-text-muted mb-1">Total Audio</p>
            <p className="text-lg font-bold r-text-1a">{formatDurationMs(totalDurationMs)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase r-text-muted mb-1">Text Coverage</p>
            <p className="text-lg font-bold r-text-1a">{coverageStats.percent}%</p>
          </div>
        </div>

        {/* Global Timeline Visualization */}
        <div>
          <p className="text-[10px] font-semibold uppercase r-text-muted mb-2">Coverage Map</p>
          <div className="flex h-6 items-end gap-[1px] rounded-sm overflow-hidden bg-gray-50 p-1 border r-border">
            {timelineBlocks.map((ratio, idx) => (
              <div
                key={idx}
                className="flex-1 rounded-sm transition-all"
                style={{
                  height: `${Math.max(10, ratio * 100)}%`,
                  backgroundColor: ratio > 0 ? (activeCommentary ? '#D4AF37' : '#9CA3AF') : '#E5E7EB',
                  opacity: ratio > 0 ? 0.7 + (ratio * 0.3) : 0.4
                }}
                title={`Section ${idx + 1}: ${Math.round(ratio * 100)}% covered`}
              />
            ))}
          </div>
          <p className="text-[9px] mt-1.5 text-center r-text-muted">
            {activeCommentary ? `Showing coverage map for Commentary ${getCommentaryGroup(activeCommentary)}` : 'Showing aggregate coverage map across all commentaries'}
          </p>
        </div>
      </div>

      {/* Active Commentary Details */}
      {activeCommentary && (
        <div className="bg-white p-5 rounded-2xl border r-border shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-4 r-text-secondary">Selected Commentary</h2>

          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase r-text-muted mb-1">Commentator / Session Group</p>
            <p className="text-sm font-medium r-text-1a">Commentary {getCommentaryGroup ? getCommentaryGroup(activeCommentary) : activeCommentary}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase r-text-muted mb-1">Duration</p>
              <p className="text-sm font-medium r-text-1a">{formatDurationMs(activeDurationMs)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase r-text-muted mb-1">Segments</p>
              <p className="text-sm font-medium r-text-1a">{activeCommentarySegments.length}</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
