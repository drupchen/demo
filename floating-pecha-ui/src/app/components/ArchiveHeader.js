"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signIn, signOut } from "next-auth/react";
import { inter, getThemeCssVars } from '@/lib/theme';

export default function ArchiveHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);

  // Check if the current page has its own custom navigation bar
  const isCustomNavRoute = pathname.startsWith('/reader') || pathname.startsWith('/player');

  // Determine current section for the breadcrumbs
  const inWorld = pathname.startsWith('/world');
  const inArchive = pathname.startsWith('/archive');

  useEffect(() => {
    if (isCustomNavRoute) return;

    if (pathname !== '/') {
      setIsVisible(true);
      return;
    }

    const handleScroll = () => {
      if (window.scrollY > 150) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname, isCustomNavRoute]);

  if (isCustomNavRoute) {
    return null;
  }

  // Smooth scroll back to top if on landing page
  const handleLogoClick = (e) => {
    if (pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`
        border-b border-gray-200 sticky top-0 z-50 transition-all duration-700 ease-in-out
        ${isVisible
          ? 'bg-white/80 backdrop-blur-md opacity-100 translate-y-0'
          : 'bg-transparent opacity-0 -translate-y-2 pointer-events-none'
        }
      `}
      style={getThemeCssVars()}
    >
      <div className={`${inter.className} max-w-6xl mx-auto px-6 h-20 flex justify-between items-center text-sm`}>

        {/* BREADCRUMB NAVIGATION */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            onClick={handleLogoClick}
            className="text-[var(--theme-hover-red)] font-extrabold text-lg tracking-wide hover:text-black transition-colors"
          >
            Khyentse Önang
          </Link>

          {/* DYNAMIC BREADCRUMB */}
          {pathname !== '/' && (inWorld || inArchive) && (
            <>
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="var(--theme-gold)" strokeWidth="3"
                strokeLinecap="round" strokeLinejoin="round"
                className="opacity-80"
              >
                <path d="M9 5 L19 12 L9 19" />
              </svg>

              <Link
                href={inWorld ? "/world" : "/archive"}
                className="text-[var(--theme-gold)] font-extrabold text-lg tracking-wide hover:text-[var(--theme-hover-red)] transition-colors"
              >
                {inWorld ? "World" : "Archives"}
              </Link>
            </>
          )}
        </div>

        {/* USER SESSION / LOGIN */}
        <div className="flex items-center gap-6">
          <div className="text-[var(--theme-gray)] hidden md:block">
            {session ? (
              <span>Welcome, <strong className="text-[var(--theme-hover-red)]">{session.user.name}</strong> (Access Level: {session.user.accessLevel})</span>
            ) : (
              <span>Welcome, <strong>Public Visitor</strong> (Access Level: 0)</span>
            )}
          </div>
          <div>
            {session ? (
              <button
                onClick={() => signOut()}
                className="bg-red-50 text-[var(--theme-hover-red)] px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition-colors"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => signIn()}
                className="bg-[var(--theme-gold)] text-white px-4 py-2 rounded-lg font-bold hover:bg-[var(--theme-hover-red)] transition-colors"
              >
                Archive Login
              </button>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}