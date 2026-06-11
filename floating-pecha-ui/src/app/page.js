"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { uchen, inter, getThemeCssVars } from '@/lib/theme';
import Footer from '@/app/components/Footer';

export default function LandingPage() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const isAnimatingRef = useRef(false);
  const hasTriggeredScrollRef = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      const position = window.scrollY;
      const height = window.innerHeight;
      const progress = Math.min(position / height, 1);
      setScrollProgress(progress);

      // Reset the first-scroll flag when back at the top
      if (position < 5) {
        hasTriggeredScrollRef.current = false;
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cinematic scroll down
  const scrollToBottom = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const targetPosition = window.innerHeight * 1.5;
    const startPosition = window.scrollY;
    const distance = targetPosition - startPosition;
    const duration = 4000;
    let start = null;

    const animation = (currentTime) => {
      if (start === null) start = currentTime;
      const timeElapsed = currentTime - start;
      const progress = Math.min(timeElapsed / duration, 1);

      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      window.scrollTo(0, startPosition + distance * ease);

      if (timeElapsed < duration) {
        window.requestAnimationFrame(animation);
      } else {
        isAnimatingRef.current = false;
      }
    };

    window.requestAnimationFrame(animation);
  }, []);

  // Cinematic scroll back to top (reverse)
  const scrollToTop = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const startPosition = window.scrollY;
    const distance = startPosition;
    const duration = 4000;
    let start = null;

    const animation = (currentTime) => {
      if (start === null) start = currentTime;
      const timeElapsed = currentTime - start;
      const progress = Math.min(timeElapsed / duration, 1);

      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      window.scrollTo(0, startPosition - distance * ease);

      if (timeElapsed < duration) {
        window.requestAnimationFrame(animation);
      } else {
        isAnimatingRef.current = false;
        hasTriggeredScrollRef.current = false;
      }
    };

    window.requestAnimationFrame(animation);
  }, []);

  // Listen for header logo click (custom event from ArchiveHeader)
  useEffect(() => {
    const handleToggle = () => {
      if (window.scrollY < window.innerHeight * 0.5) {
        scrollToBottom();
      } else {
        scrollToTop();
      }
    };
    window.addEventListener('landingScrollToggle', handleToggle);
    return () => window.removeEventListener('landingScrollToggle', handleToggle);
  }, [scrollToBottom, scrollToTop]);

  // First scroll/touch at top triggers cinematic animation instead of native scroll
  useEffect(() => {
    const handleWheel = (e) => {
      if (hasTriggeredScrollRef.current || isAnimatingRef.current) return;
      if (window.scrollY < 5 && e.deltaY > 0) {
        e.preventDefault();
        hasTriggeredScrollRef.current = true;
        scrollToBottom();
      }
    };

    let touchStartY = 0;
    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e) => {
      if (hasTriggeredScrollRef.current || isAnimatingRef.current) return;
      const deltaY = touchStartY - e.touches[0].clientY;
      if (window.scrollY < 5 && deltaY > 10) {
        e.preventDefault();
        hasTriggeredScrollRef.current = true;
        scrollToBottom();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [scrollToBottom]);

  const uiOpacity = Math.max(0, (scrollProgress - 0.2) / 0.8);
  const videoOpacity = 1 - (scrollProgress * 0.7);
  const arrowOpacity = Math.max(0, 1 - scrollProgress * 5);

  return (
    <main className="relative min-h-[200vh] bg-transparent" style={getThemeCssVars()}>

      {/* 1. FIXED BACKGROUND LAYER */}
      <div className="fixed inset-0 z-0 bg-[#F9F9F7]">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{
            opacity: videoOpacity,
            filter: `
              blur(${scrollProgress * 25}px)
              grayscale(${scrollProgress * 80}%)
              brightness(${1 + scrollProgress * 0.2})
            `,
          }}
        >
          <source src="/data/world/videos/landing-slowmo.mp4" type="video/mp4" />
        </video>

        <div
          className="absolute inset-0 bg-[#F9F9F7]"
          style={{ opacity: scrollProgress * 0.85 }}
        />
      </div>

      {/* 2. CLICKABLE GLOWING ARROW (Triggers the slow descent) */}
      <button
        onClick={scrollToBottom}
        className="fixed bottom-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-all duration-300 hover:scale-110 cursor-pointer"
        style={{
          opacity: arrowOpacity,
          pointerEvents: arrowOpacity > 0.1 ? 'auto' : 'none'
        }}
        aria-label="Descend into the Archives"
      >
        <svg
          width="80"
          height="40"
          viewBox="0 0 120 60"
          fill="none"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-bounce opacity-90"
          style={{ filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.8))' }}
        >
          <path d="M10 15 L60 45 L110 15" />
        </svg>
      </button>

      {/* 3. THE MANDALA GATEWAY */}
      <section className="relative z-10 h-[200vh] flex flex-col items-center pointer-events-none">
        <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center px-6">

          <div
            className="text-center flex flex-col items-center mb-[10vh]"
            style={{ opacity: uiOpacity }}
          >
            <h1
              lang="bo"
              className="text-[var(--theme-gold)] text-7xl md:text-[8rem] -mb-2 drop-shadow-sm whitespace-nowrap"
              style={{ fontFamily: '"Sadri Yigchen", serif' }}
            >
              མཁྱེན་བརྩེའི་འོད་སྣང་།
            </h1>

            <h2 className={`${inter.className} text-[var(--theme-gray)] text-lg md:text-xl tracking-[0.7em] uppercase font-bold opacity-90`}>
              Khyentse&apos;s Radiance
            </h2>
          </div>

          {/* THE DUAL GATEWAY BUTTONS */}
          <div
            className="absolute bottom-[20%] flex flex-col md:flex-row gap-6 items-center"
            style={{
              opacity: uiOpacity,
              pointerEvents: uiOpacity > 0.8 ? 'auto' : 'none'
            }}
          >
            <Link href="/world">
              <button className={`
                ${inter.className} px-10 py-5 border border-[var(--theme-gold)] text-[var(--theme-gold)]
                bg-white/10 backdrop-blur-md rounded-full uppercase tracking-[0.3em] font-bold text-[10px] md:text-[11px]
                hover:bg-[var(--theme-gold)] hover:text-white transition-all duration-500
                shadow-sm active:scale-95 whitespace-nowrap
              `}>
                Dilgo Khyentse&apos;s World
              </button>
            </Link>

            <Link href="/archive">
              <button className={`
                ${inter.className} px-10 py-5 border border-[var(--theme-gold)] text-[var(--theme-gold)]
                bg-white/10 backdrop-blur-md rounded-full uppercase tracking-[0.3em] font-bold text-[10px] md:text-[11px]
                hover:bg-[var(--theme-gold)] hover:text-white transition-all duration-500
                shadow-sm active:scale-95 whitespace-nowrap
              `}>
                The Teaching Archives
              </button>
            </Link>
          </div>
        </div>
      </section>
      {/* 4. FOOTER — fixed at bottom, fades in with content */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 bg-[#F9F9F7]"
        style={{ opacity: uiOpacity, pointerEvents: uiOpacity > 0.8 ? 'auto' : 'none' }}
      >
        <Footer />
      </div>
    </main>
  );
}
