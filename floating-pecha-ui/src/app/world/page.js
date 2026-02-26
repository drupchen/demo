"use client";

import React, { useState, useEffect } from 'react';
import { inter, getThemeCssVars } from '@/lib/theme';
import Footer from '@/app/components/Footer';

export default function WorldPage() {
  const [mediaData, setMediaData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the randomized media list from our new API
  useEffect(() => {
    fetch('/api/gallery')
      .then(res => res.json())
      .then(data => {
        setMediaData(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load gallery:", err);
        setIsLoading(false);
      });
  }, []);

  const navigate = (direction) => {
    if (isFading || mediaData.length === 0) return;
    setIsFading(true);

    setTimeout(() => {
      if (direction === 'next') {
        setCurrentIndex((prev) => (prev === mediaData.length - 1 ? 0 : prev + 1));
      } else {
        setCurrentIndex((prev) => (prev === 0 ? mediaData.length - 1 : prev - 1));
      }
      setIsFading(false);
    }, 400);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#F9F9F7] flex items-center justify-center pt-20" style={getThemeCssVars()}>
        <p className={`${inter.className} text-[var(--theme-gray)] uppercase tracking-widest text-sm`}>Loading Gallery...</p>
      </main>
    );
  }

  if (mediaData.length === 0) {
    return (
      <main className="min-h-screen bg-[#F9F9F7] flex items-center justify-center pt-20" style={getThemeCssVars()}>
        <p className={`${inter.className} text-[var(--theme-gray)] uppercase tracking-widest text-sm`}>No media found in folders.</p>
      </main>
    );
  }

  const currentMedia = mediaData[currentIndex];

  return (
    <main className="min-h-[calc(100vh-81px)] bg-[#F7FAFC] flex flex-col overflow-x-hidden" style={getThemeCssVars()}>
      <div className="flex-grow flex flex-col items-center justify-center relative px-6 md:px-24 py-12">

        {/* LEFT ARROW */}
        <button
          onClick={() => navigate('prev')}
          className="absolute left-4 md:left-12 z-20 p-4 text-[var(--theme-gray)] hover:text-[var(--theme-gold)] hover:scale-110 transition-all duration-300 outline-none"
          aria-label="Previous Media"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        {/* MEDIA CONTAINER */}
        <div className="w-full max-w-5xl aspect-video relative flex items-center justify-center">
          <div className={`w-full h-full relative transition-opacity duration-400 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'}`}>
            {currentMedia.type === 'video' ? (
              <video
                  key={currentMedia.src}
                  autoPlay controls loop playsInline
                  className="w-full h-full object-contain rounded-sm shadow-sm"
                >
                  <source src={currentMedia.src} type="video/mp4" />
                </video>
            ) : (
              <img
                key={currentMedia.src}
                src={currentMedia.src}
                alt={currentMedia.caption}
                className="w-full h-full object-contain rounded-sm shadow-sm"
              />
            )}
          </div>
        </div>

        {/* RIGHT ARROW */}
        <button
          onClick={() => navigate('next')}
          className="absolute right-4 md:right-12 z-20 p-4 text-[var(--theme-gray)] hover:text-[var(--theme-gold)] hover:scale-110 transition-all duration-300 outline-none"
          aria-label="Next Media"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        {/* CAPTION & DOTS */}
        <div className={`mt-12 text-center transition-opacity duration-400 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
          <p className={`${inter.className} text-[var(--theme-gray)] text-xs md:text-sm uppercase tracking-[0.3em] font-medium`}>
            {currentMedia.caption}
          </p>
          <div className="flex justify-center flex-wrap gap-2 mt-6 max-w-md mx-auto">
             {mediaData.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (idx !== currentIndex) {
                      setIsFading(true);
                      setTimeout(() => {
                        setCurrentIndex(idx);
                        setIsFading(false);
                      }, 400);
                    }
                  }}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${idx === currentIndex ? 'bg-[var(--theme-gold)] scale-150' : 'bg-gray-300 hover:bg-gray-400'}`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
             ))}
          </div>
        </div>

      </div>
      {/* FOOTER */}
      <Footer className="mt-8" />
    </main>
  );
}