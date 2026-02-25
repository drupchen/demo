"use client";

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
// 1. IMPORT NEXT-AUTH HOOKS
import { useSession, signIn, signOut } from "next-auth/react";

// Import the design system variables and fonts
import { uchen, inter, getThemeCssVars } from '@/lib/theme';

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 2. GET THE ACTIVE USER SESSION
  const { data: session } = useSession();

  // Initialize our search input from the URL (if it exists)
  const urlQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Automatically run the search if the URL has a query parameter
  useEffect(() => {
    if (urlQuery) {
      performSearch(urlQuery);
    } else {
      setResults([]);
      setHasSearched(false);
    }
    // We also add session to the dependency array so if a user logs in/out,
    // it can re-run the search with their new access level!
  }, [urlQuery, session]);

  const performSearch = async (searchString) => {
    if (!searchString.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      // 3. GET USER LEVEL (Default to 0 if not logged in)
      const userLevel = session?.user?.accessLevel || 0;

      // 4. INJECT LEVEL INTO API CALL
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchString)}&level=${userLevel}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7FAFC] px-6 pb-20" style={getThemeCssVars()}>

      <div className="max-w-4xl mx-auto pt-10">

        {/* Title */}
        <h1 className={`${inter.className} text-4xl font-extrabold text-[#2d3748] mb-8 tracking-tight`}>
          Deep Search <span className="text-[var(--theme-gold)]">Archive</span>
        </h1>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="relative mb-12">
          <input
            type="text"
            className={`${uchen.className} w-full p-5 pl-6 pr-16 text-2xl border-2 border-gray-200 rounded-xl shadow-sm focus:outline-none focus:border-[var(--theme-gold)] focus:ring-1 focus:ring-[var(--theme-gold)] transition-all text-[#23272f]`}
            placeholder="Search Tibetan text..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="absolute right-4 top-4 p-2 bg-[var(--theme-gold)] hover:bg-[var(--theme-hover-red)] text-white rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </form>

        {/* Search Results Area */}
        <div className="space-y-6">
          {isSearching ? (
             <div className={`${inter.className} text-center py-20 text-[var(--theme-gold)] text-xl animate-pulse`}>
               Searching the archive...
             </div>
          ) : results.length > 0 ? (
            results.map((hit) => (
              <Link
                href={`/player?session=${hit.session_id}&time=${hit.start}`}
                key={hit.id}
                className="block p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[var(--theme-gold)] transition-all cursor-pointer group"
              >
                {/* Metadata Header */}
                <div className={`${inter.className} flex items-center gap-3 mb-4 text-xs font-medium text-[var(--theme-gray)] uppercase tracking-wider`}>
                  <span className="text-[var(--theme-hover-red)] font-bold">{hit.teaching_title || hit.instance_id}</span>
                  <span>•</span>
                  <span>Session: {hit.session_id}</span>
                  <span>•</span>
                  <span className="text-[var(--theme-gold)]">{hit.start}</span>
                </div>

                {/* Highlighted Syllable Segment */}
                <p
                  className={`${uchen.className} text-3xl leading-relaxed text-[#23272f]`}
                  dangerouslySetInnerHTML={{ __html: hit.highlight }}
                />
              </Link>
            ))
          ) : (
             hasSearched && !isSearching && (
                <div className={`${inter.className} text-center py-20 text-[var(--theme-gray)] text-lg`}>
                  No segments found for "{urlQuery}". Try a different Tibetan term.
                </div>
             )
          )}
        </div>

      </div>
    </main>
  );
}

// Next.js requirement: When using useSearchParams, wrap the component in Suspense
export default function SearchPage() {
  return (
    <Suspense fallback={<div className={`${inter.className} min-h-screen flex items-center justify-center bg-[#F7FAFC] text-[var(--theme-gold)] text-xl`}>Loading Search...</div>}>
      <SearchContent />
    </Suspense>
  );
}