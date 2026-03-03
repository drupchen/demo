"use client";

import { useMemo, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { uchen, inter } from '@/lib/theme';
import { formatDurationBadge, parseToMs } from '@/lib/useAudioPlayer';

/**
 * A fixed-positioned popover that appears near a clicked syllable
 * to show available commentaries and their preview text.
 * Automatically repositions to stay fully visible on screen.
 */
export default function FloatingPopover({
    activeSylId,
    activeCommentary,
    syllableMediaMap,
    manifest,
    onCommentarySelect,
    getCommentaryGroup,
    sidebarSizes,
    onClose
}) {
    const popoverRef = useRef(null);
    const [sylRect, setSylRect] = useState(null); // viewport-relative rect of clicked syllable
    const [adjusted, setAdjusted] = useState({ top: 0, left: 0, ready: false });

    // Group segments by commentary for the selected syllable
    const commentaryGroups = useMemo(() => {
        if (!activeSylId) return [];
        const segments = syllableMediaMap[activeSylId] || [];
        const groups = {};
        segments.forEach(seg => {
            const group = seg.source_session;
            if (!groups[group]) groups[group] = [];
            groups[group].push(seg);
        });
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([sessionId, segs]) => {
            const previewSyls = segs[0]?.syl_uuids ? manifest.filter(s => segs[0].syl_uuids.includes(s.id)) : [];

            const totalDurationMs = segs.reduce((acc, seg) => {
                const start = parseToMs(seg.start);
                const end = seg.end ? parseToMs(seg.end) : start + 10000;
                return acc + (end - start);
            }, 0);

            return {
                commentaryId: sessionId,
                segments: segs,
                previewSyllables: previewSyls,
                totalDurationMs
            };
        });
    }, [activeSylId, syllableMediaMap, manifest]);

    // Capture the clicked syllable's viewport rect
    useEffect(() => {
        if (activeSylId && commentaryGroups.length > 0) {
            const el = document.getElementById(activeSylId);
            if (el) {
                const rect = el.getBoundingClientRect();
                setSylRect({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height });
                setAdjusted({ top: 0, left: 0, ready: false }); // reset for re-measurement
            }
        } else {
            setSylRect(null);
            setAdjusted({ top: 0, left: 0, ready: false });
        }
    }, [activeSylId, commentaryGroups.length]);

    // After rendering, measure the popover and adjust position to stay on screen
    useLayoutEffect(() => {
        if (!sylRect || !popoverRef.current) return;
        const pop = popoverRef.current.getBoundingClientRect();
        const pad = 8; // margin from viewport edges
        const gap = 8; // gap between syllable and popover

        // Start: below syllable, centered horizontally
        let top = sylRect.bottom + gap;
        let left = sylRect.left + sylRect.width / 2 - pop.width / 2;

        // Flip above if it overflows the bottom
        if (top + pop.height > window.innerHeight - pad) {
            top = sylRect.top - gap - pop.height;
        }
        // If still overflows top, just pin to top
        if (top < pad) {
            top = pad;
        }

        // Clamp horizontally
        if (left + pop.width > window.innerWidth - pad) {
            left = window.innerWidth - pad - pop.width;
        }
        if (left < pad) {
            left = pad;
        }

        setAdjusted({ top, left, ready: true });
    }, [sylRect]);

    // Click outside listener
    useEffect(() => {
        if (!sylRect) return;
        function handleClickOutside(event) {
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                if (!event.target.closest('.r-syl')) {
                    onClose();
                }
            }
        }
        const timeoutId = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 10);
        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [sylRect, onClose]);

    if (!sylRect || commentaryGroups.length === 0 || activeCommentary) return null;

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 w-80 r-bg-surface border r-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
            style={{
                top: adjusted.top,
                left: adjusted.left,
                maxWidth: '90vw',
                // Render invisibly for measurement on first pass, then show
                visibility: adjusted.ready ? 'visible' : 'hidden',
            }}
        >
            <div className="bg-white/50 backdrop-blur-md p-4">
                {commentaryGroups.length > 1 && (
                    <p className={`${inter.className} text-[10px] uppercase tracking-widest font-bold r-text-secondary mb-3`}>
                        {commentaryGroups.length} Commentaries Available
                    </p>
                )}

                <div className="space-y-3">
                    {commentaryGroups.map(({ commentaryId, segments, previewSyllables, totalDurationMs }) => (
                        <button
                            key={commentaryId}
                            onClick={() => {
                                onCommentarySelect(commentaryId, segments[0]);
                            }}
                            className="w-full text-left p-3 rounded-xl border border-black/5 bg-white transition-all group hover:border-[#D4AF37] hover:shadow-md"
                        >
                            {/* Context Text Preview */}
                            <div className={`${uchen.className} text-sm leading-relaxed mb-3 r-text-secondary line-clamp-3`}>
                                {previewSyllables.map(syl => {
                                    if (syl.text === '\n') return ' ';
                                    return (
                                        <span
                                            key={syl.id}
                                            className={syl.id === activeSylId ? 'r-text-accent font-bold' : ''}
                                        >
                                            {syl.text}
                                        </span>
                                    );
                                })}
                            </div>

                            {/* Controls Header */}
                            <div className="flex items-center justify-between">
                                <span className={`${inter.className} flex items-center gap-2 text-xs font-bold tracking-wider r-text-1a`}>
                                    <div className="w-6 h-6 rounded-full r-bg-accent flex items-center justify-center text-white">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
                                    </div>
                                    Commentary {getCommentaryGroup(commentaryId)}
                                </span>
                                <span className={`${inter.className} text-[10px] font-medium px-2 py-0.5 rounded-full r-badge`}>
                                    {formatDurationBadge(totalDurationMs)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
