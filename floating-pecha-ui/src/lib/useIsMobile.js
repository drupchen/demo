"use client";

import { useState, useEffect } from 'react';

/**
 * SSR-safe breakpoint hook. Returns true when the viewport is `maxWidth` or
 * narrower (default 1024px) — i.e. phones AND tablets (through iPad landscape)
 * get the single-column + drawer layout; the desktop multi-column layout is
 * reserved for ≥ 1025px. Width-only: a short desktop window is NOT mobile, and a
 * landscape phone (≤ ~932px wide) is already covered by the width.
 *
 * Renders `false` on the server and on the first client paint, then corrects
 * after mount, so it never causes a hydration mismatch.
 */
export default function useIsMobile(maxWidth = 1024) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [maxWidth]);

  return isMobile;
}
