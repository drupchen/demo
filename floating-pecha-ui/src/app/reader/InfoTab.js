"use client";

import { inter } from '@/lib/theme';

export default function InfoTab({ instanceId, activeSession, activeSessionSegments, sessions }) {
  const firstSeg = activeSessionSegments[0];
  const hasRestored = Boolean(firstSeg?.media_restored);
  const totalSegments = activeSessionSegments.length;
  const uniqueSessions = new Set(sessions.map(s => s.source_session)).size;

  return (
    <div className={`${inter.className} space-y-6`}>
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          Teaching
        </h3>
        <p className="text-sm font-medium"
           style={{ color: 'var(--reader-text-primary, #2D3436)' }}>
          {instanceId}
        </p>
      </div>

      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
          Sessions
        </h3>
        <p className="text-sm"
           style={{ color: 'var(--reader-text-primary, #2D3436)' }}>
          {uniqueSessions} recordings available
        </p>
      </div>

      {activeSession && (
        <>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
              Active Session
            </h3>
            <p className="text-sm font-medium"
               style={{ color: 'var(--reader-text-primary, #2D3436)' }}>
              {activeSession}
            </p>
            <p className="text-xs mt-1"
               style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
              {totalSegments} segments
            </p>
          </div>

          {hasRestored && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
                Audio Quality
              </h3>
              <p className="text-xs"
                 style={{ color: 'var(--reader-text-secondary, #6B7280)' }}>
                Restored audio available for this session
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
