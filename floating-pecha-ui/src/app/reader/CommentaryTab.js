"use client";

import { useMemo } from 'react';
import { uchen, inter } from '@/lib/theme';
import { formatDurationBadge, parseToMs } from '@/lib/useAudioPlayer';

export default function CommentaryTab({
  activeSylId,
  syllableMediaMap,
  manifest,
  allCommentaryIds,
  onCommentarySelect,
  sidebarSizes,
  getCommentaryGroup,
}) {
  // Group segments by commentary for the selected syllable
  const commentaryGroups = useMemo(() => {
    if (!activeSylId) return [];
    const segments = syllableMediaMap[activeSylId] || [];
    const groups = {};
    segments.forEach(seg => {
      const group = getCommentaryGroup(seg.source_session);
      if (!groups[group]) groups[group] = [];
      groups[group].push(seg);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([commentaryId, segs]) => ({
      commentaryId,
      segments: segs,
      previewSyllables: segs[0]?.syl_uuids
        ? manifest.filter(s => segs[0].syl_uuids.includes(s.id))
        : [],
      totalDurationMs: segs.reduce((acc, seg) => {
        const start = parseToMs(seg.start);
        const end = seg.end ? parseToMs(seg.end) : start + 10000;
        return acc + (end - start);
      }, 0),
    }));
  }, [activeSylId, syllableMediaMap, manifest, getCommentaryGroup]);

  // No syllable selected — simple invitation
  if (!activeSylId) {
    return (
      <div className={`${inter.className} text-center py-16`}>
        <p className="text-sm leading-relaxed r-text-secondary">
          Click on a syllable in the text to see which commentaries cover that passage.
        </p>
      </div>
    );
  }

  // Syllable selected but no commentary found
  if (commentaryGroups.length === 0) {
    return (
      <p className={`${inter.className} text-sm r-text-secondary`}>
        No commentary found for this syllable.
      </p>
    );
  }

  // Syllable selected — show matching commentaries
  return (
    <div className="space-y-3">
      <p className={`${inter.className} text-[10px] uppercase tracking-widest font-bold r-text-secondary`}>
        {commentaryGroups.length} {commentaryGroups.length === 1 ? 'Commentary' : 'Commentaries'} for this passage
      </p>

      {commentaryGroups.map(({ commentaryId, segments, previewSyllables, totalDurationMs }) => (
        <button
          key={commentaryId}
          onClick={() => onCommentarySelect(commentaryId, segments[0])}
          className="w-full text-left p-4 rounded-xl border border-black/5 transition-all group r-card-hover"
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`${inter.className} text-xs font-bold uppercase tracking-wider r-text-1a`}>
              Commentary {commentaryId}
            </span>
            <span className={`${inter.className} text-[10px] font-medium px-2 py-0.5 rounded-full r-badge`}>
              {formatDurationBadge(totalDurationMs)}
            </span>
          </div>
          <p className={`${uchen.className} leading-relaxed line-clamp-2 r-text-secondary`}>
            {previewSyllables.map(syl => {
              if (syl.text === '\n') return ' ';
              const style = sidebarSizes?.[syl.size?.toUpperCase()] || sidebarSizes?.DEFAULT || {};
              return (
                <span key={syl.id} style={style}>{syl.text}</span>
              );
            })}
          </p>
          <div className={`${inter.className} mt-2 text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity r-text-accent`}>
            Play from here →
          </div>
        </button>
      ))}
    </div>
  );
}
