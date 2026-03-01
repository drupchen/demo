"use client";

import { inter } from '@/lib/theme';

export default function InfoTab({ instanceId, activeCommentary, activeCommentarySegments, sessions }) {
  const firstSeg = activeCommentarySegments[0];
  const hasRestored = Boolean(firstSeg?.media_restored);
  const totalSegments = activeCommentarySegments.length;
  const uniqueCommentaries = new Set(
    sessions.map(s => s.source_session.match(/^([A-Za-z]+)/)?.[1]).filter(Boolean)
  ).size;

  return (
    <div className={`${inter.className} space-y-6`}>
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2 r-text-secondary">Teaching</h3>
        <p className="text-sm font-medium r-text">{instanceId}</p>
      </div>

      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2 r-text-secondary">Commentaries</h3>
        <p className="text-sm r-text">{uniqueCommentaries} available</p>
      </div>

      {activeCommentary && (
        <>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2 r-text-secondary">Active Commentary</h3>
            <p className="text-sm font-medium r-text">Commentary {activeCommentary}</p>
            <p className="text-xs mt-1 r-text-secondary">{totalSegments} segments</p>
          </div>

          {hasRestored && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2 r-text-secondary">Audio Quality</h3>
              <p className="text-xs r-text-secondary">Restored audio available for this commentary</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
