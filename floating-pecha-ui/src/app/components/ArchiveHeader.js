"use client";

import Link from 'next/link';
import { useSession, signIn, signOut } from "next-auth/react";
import { inter, getThemeCssVars } from '@/lib/theme';

export default function ArchiveHeader() {
  const { data: session } = useSession();

  return (
    <header
      className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50"
      style={getThemeCssVars()}
    >
      <div className={`${inter.className} max-w-6xl mx-auto px-6 py-4 flex justify-between items-center text-sm`}>

        <div className="flex items-center gap-8">
          <Link href="/" className="text-[var(--theme-hover-red)] font-extrabold text-lg tracking-wide hover:text-[var(--theme-hover-red)] transition-colors">
            Khyentse Önang
          </Link>
        </div>

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