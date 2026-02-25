"use client";

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

// Import the design system variables and fonts
import { uchen, inter, getThemeCssVars } from '@/lib/theme';

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Initialize our search input from the URL (if it exists)
  const urlQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // 2. Automatically run the search if the URL has a query parameter
  useEffect(() => {
    if (urlQuery) {
      performSearch(urlQuery);
    } else {
      setResults([]);
      setHasSearched(false);
    }
  }, [urlQuery]);

  const performSearch = async (searchString) => {
    if (!searchString.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchString)}`);
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
    if (!query.trim()) return;

    // Update the URL to trigger the search effect
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <main className="min-h-screen bg-[#F7FAFC] p-6 md:p-12" style={getThemeCssVars()}>
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-12 flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2 text-[var(--theme-gray)] hover:text-[var(--theme-hover-red)] transition-all">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-300 group-hover:-translate-x-1"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span className={`${inter.className} text-xs font-bold uppercase tracking-[0.2em]`}>
              Back to Catalog
            </span>
          </Link>
          <h1 className={`${inter.className} text-2xl font-bold text-[var(--theme-gold)] tracking-widest uppercase`}>
            Archive Search
          </h1>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="mb-12">
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter a Tibetan word (e.g. མི་རྟག་)..."
              // 1. Remove uchen.className from the class list
              className="w-full px-8 pt-10 pb-6 text-2xl md:text-3xl leading-relaxed rounded-xl shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[var(--theme-gold-border)] bg-white text-[var(--theme-gray)] transition-all"
              // 2. Add the fallback stack as an inline style!
              style={{
                // We take Inter, remove 'sans-serif', and chain it directly to Uchen!
                fontFamily: `${inter.style.fontFamily.replace(/,?\s*(sans-serif|serif)/g, '')}, ${uchen.style.fontFamily}`
              }}
            />
            <button
              type="submit"
              className={`${inter.className} absolute right-4 px-6 py-3 bg-[#2F2F2F] text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-[var(--theme-hover-red)] transition-colors`}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Results List */}
        <div className="space-y-6">
          {results.length > 0 ? (
            results.map((hit) => (
              <Link
                key={hit.id}
                href={`/reader?instance=${hit.instance_id}&session=${hit.session_id}&time=${hit.start}&media=${encodeURIComponent(hit.media_url)}&sylId=${hit.first_syl_id}&q=${encodeURIComponent(urlQuery)}`}
                className="block bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[var(--theme-gold-border)] transition-all"
              >
                {/* Teaching Metadata */}
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