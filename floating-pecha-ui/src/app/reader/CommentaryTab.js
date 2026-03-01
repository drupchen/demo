"use client";

import { useMemo } from 'react';
import { uchen, inter } from '@/lib/theme';
import { formatDurationBadge, parseToMs } from '@/lib/useAudioPlayer';

export default function CommentaryTab({ activeSylId, syllableMediaMap, manifest, allSessionIds, onSessionSelect }) {
  // Group segments by session for the selected syllable
  const sessionGroups = useMemo(() => {
    if (!activeSylId) return [];
    const segments = syllableMediaMap[activeSylId] || [];
    const groups = {};
    segments.forEach(seg => {
      if (!groups[seg.source]) {
        groups[seg.source] = [];
      }
      groups[seg.source].push(seg);
    });
    return Object.entries(groups).map(([sessionId, segs]) => ({
      sessionId,
      segments: segs,
      // Preview text from manifest
      previewText: segs[0]?.sylUuids
        ? manifest
            .filter(s => segs[0].sylUuids.includes(s.id))
            .map(s => s.text === '\n' ? ' ' : s.text)
            .join('')
            .slice(0, 60)
        : '',
      totalDurationMs: segs.reduce((acc, seg) => {
        const start = parseToMs(seg.startTime);
        const end = seg.endTime ? parseToMs(seg.endTime) : start + 10000;
        return acc + (end - start);
      }, 0),
    }));
  }, [activeSylId, syllableMediaMap, manifest]);

  // No syllable selected — show overview
  if (!activeSylId) {
    return (
      <div className="space-y-4">
        <p className={`${inter.className} text-xs uppercase tracking-widest font-bold`}
           style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          {allSessionIds.length} Commentary Sessions
        </p>
        <p className={`${inter.className} text-sm leading-relaxed`}
           style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          Click a syllable in the text to see which commentary sessions cover that passage.
        </p>
        <div className="space-y-2 mt-6">
          {allSessionIds.map(id => (
            <button
              key={id}
              onClick={() => onSessionSelect(id)}
              className={`${inter.className} w-full text-left px-4 py-3 rounded-lg border border-black/5 text-sm transition-all`}
              style={{ color: 'var(--reader-text-primary, #2D3436)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--reader-accent, #D4AF37)';
                e.currentTarget.style.backgroundColor = 'var(--reader-accent-subtle, #FDF8EE)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '';
                e.currentTarget.style.backgroundColor = '';
              }}
            >
              <span className="font-semibold">{id.split('_').slice(0, 2).join(' ')}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Syllable selected but no commentary found
  if (sessionGroups.length === 0) {
    return (
      <p className={`${inter.className} text-sm`}
         style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
        No commentary found for this syllable.
      </p>
    );
  }

  // Syllable selected — show matching sessions
  return (
    <div className="space-y-3">
      <p className={`${inter.className} text-[10px] uppercase tracking-widest font-bold`}
         style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
        {sessionGroups.length} {sessionGroups.length === 1 ? 'Session' : 'Sessions'} for this passage
      </p>

      {sessionGroups.map(({ sessionId, segments, previewText, totalDurationMs }) => (
        <button
          key={sessionId}
          onClick={() => onSessionSelect(sessionId, segments[0])}
          className="w-full text-left p-4 rounded-xl border border-black/5 transition-all group"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--reader-accent, #D4AF37)';
            e.currentTarget.style.backgroundColor = 'var(--reader-accent-subtle, #FDF8EE)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '';
            e.currentTarget.style.backgroundColor = '';
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`${inter.className} text-xs font-bold uppercase tracking-wider`}
                  style={{ color: 'var(--reader-text-primary, #2D3436)' }}>
              {sessionId.split('_').slice(0, 2).join(' ')}
            </span>
            <span className={`${inter.className} text-[10px] font-medium px-2 py-0.5 rounded-full`}
                  style={{
                    color: 'var(--reader-text-secondary, #6B7280)',
                    backgroundColor: 'var(--reader-bg-elevated, #F5F5F5)',
                  }}>
              {formatDurationBadge(totalDurationMs)}
            </span>
          </div>
          <p className={`${uchen.className} text-sm leading-relaxed line-clamp-2`}
             style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
            {previewText}
          </p>
          <div className={`${inter.className} mt-2 text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity`}
               style={{ color: 'var(--reader-accent, #D4AF37)' }}>
            Play from here →
          </div>
        </button>
      ))}
    </div>
  );
}
