"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { uchen, inter, getThemeCssVars } from '@/lib/theme';
import Footer from '@/app/components/Footer';

export default function LandingPage() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const position = window.scrollY;
      const height = window.innerHeight;
      const progress = Math.min(position / height, 1);
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Custom Cinematic Scroll Function
  const scrollToBottom = () => {
    const targetPosition = window.innerHeight * 1.5; // Target scroll depth
    const startPosition = window.scrollY;
    const distance = targetPosition - startPosition;
    const duration = 2500; // 2.5 seconds (2500ms) - Adjust this for slower/faster
    let start = null;

    const animation = (currentTime) => {
      if (start === null) start = currentTime;
      const timeElapsed = currentTime - start;
      const progress = Math.min(timeElapsed / duration, 1);

      // Easing Function (Ease In Out Cubic) - Starts slow, accelerates, ends slow
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      window.scrollTo(0, startPosition + distance * ease);

      if (timeElapsed < duration) {
        window.requestAnimationFrame(animation);
      }
    };

    window.requestAnimationFrame(animation);
  };

  const uiOpacity = scrollProgress;
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
            className="text-center flex flex-col items-center transition-all duration-1000 mb-[10vh]"
            style={{
              opacity: uiOpacity,
              transform: `scale(${0.98 + (uiOpacity * 0.02)})`,
            }}
          >
            <h1 className={`${uchen.className} text-[var(--theme-gold)] text-6xl md:text-8xl mb-4 drop-shadow-sm`}>
              མཁྱེན་བརྩེའི་འོད་སྣང་།
            </h1>

            <h2 className={`${inter.className} text-[var(--theme-gray)] text-lg md:text-xl tracking-[0.7em] uppercase font-bold opacity-90`}>
              Khyentse&apos;s Radiance
            </h2>
          </div>

          {/* THE DUAL GATEWAY BUTTONS */}
          <div
            className="absolute bottom-[20%] flex flex-col md:flex-row gap-6 items-center transition-all duration-1000"
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
      {/* 4. FOOTER (Solid background ensures it doesn't float over the video) */}
      <div className="relative z-20 w-full bg-[#F9F9F7]">
        <Footer />
      </div>
    </main>
  );
}