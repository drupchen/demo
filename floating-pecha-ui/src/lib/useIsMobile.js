"use client";

import { useState, useEffect } from 'react';

/**
 * SSR-safe breakpoint hook. Returns true when the viewport is narrower than
 * `maxWidth` (default 767px — i.e. below Tailwind's `md:` breakpoint).
 *
 * Renders `false` on the server and on the first client paint, then corrects
 * after mount, so it never causes a hydration mismatch.
 */
export default function useIsMobile(maxWidth = 767) {
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
