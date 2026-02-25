"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { uchen, inter, getThemeCssVars } from '@/lib/theme';

// We'll reuse the search logic here
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. State for View Mode and Search
  const viewMode = searchParams.get('view') || 'browse'; // 'browse' or 'search'
  const urlQuery = searchParams.get('q') || '';

  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // 2. Load Catalog Data
  useEffect(() => {
    fetch('/data/catalog.json')
      .then(res => res.json())
      .then(data => setCatalog(data))
      .catch(err => console.error("Catalog load error:", err));
  }, []);

  // 3. Handle Search if in search mode
  useEffect(() => {
    if (viewMode === 'search' && urlQuery) {
      performSearch(urlQuery);
    }
  }, [viewMode, urlQuery]);

  const performSearch = async (q) => {
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleView = (mode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', mode);
    if (mode === 'browse') params.delete('q');
    router.push(`/?${params.toString()}`, { scroll: false });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    router.push(`/?view=search&q=${encodeURIComponent(searchQuery)}`, { scroll: false });
  };

  return (
    <main className="min-h-screen bg-[#F7FAFC]" style={getThemeCssVars()}>
      <div className="max-w-5xl mx-auto px-6 py-12 md:py-24">

        {/* Hero / Header */}
        <header className="mb-16 text-center">
          <h1 className={`${inter.className} text-4xl md:text-5xl font-bold tracking-[0.3em] uppercase text-[var(--theme-gold)] mb-4`}>
            Teaching Archives
          </h1>
          <p className={`${inter.className} text-xs font-medium tracking-[0.2em] uppercase text-[var(--theme-gray)]`}>
            The Digital Archives of Dilgo Khyentse Rinpoche
          </p>
        </header>

        {/* ELEGANT TOGGLE TABS */}
        <div className="flex justify-center gap-12 mb-16 border-b border-gray-100">
          <button
            onClick={() => toggleView('browse')}
            className={`${inter.className} pb-4 text-xs font-bold uppercase tracking-[0.2em] transition-all border-b-2 ${
              viewMode === 'browse'
              ? "text-[var(--theme-hover-red)] border-[var(--theme-hover-red)]"
              : "text-[var(--theme-gray)] border-transparent hover:text-black"
            }`}
          >
            Browse Catalog
          </button>
          <button
            onClick={() => toggleView('search')}
            className={`${inter.className} pb-4 text-xs font-bold uppercase tracking-[0.2em] transition-all border-b-2 ${
              viewMode === 'search'
              ? "text-[var(--theme-hover-red)] border-[var(--theme-hover-red)]"
              : "text-[var(--theme-gray)] border-transparent hover:text-black"
            }`}
          >
            Search Text
          </button>
        </div>

        {/* VIEW: BROWSE CATALOG */}
        {viewMode === 'browse' && (
          <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {catalog.map((teaching) => (
              <Link
                key={teaching.Teaching_ID}
                href={`/reader?instance=${teaching.Instances[0].Instance_ID}`}
                className="group bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-[var(--theme-gold-border)] transition-all flex justify-between items-center"
              >
                <div>
                  <h3 className={`${uchen.className} text-2xl mb-2 group-hover:text-[var(--theme-hover-red)] transition-colors`}>
                    {teaching.Title_bo}
                  </h3>
                  <p className={`${inter.className} text-[10px] uppercase tracking-widest text-[var(--theme-gray)]`}>
                    {teaching.Instances.length} Version(s) Available
                  </p>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-300 group-hover:text-[var(--theme-gold)] transition-all duration-300 group-hover:translate-x-1"
                >
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </Link>
            ))}
          </div>
        )}

        {/* VIEW: SEARCH TEXT */}
        {viewMode === 'search' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <form onSubmit={handleSearchSubmit} className="mb-12">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter a Tibetan word (e.g. མི་རྟག་)..."
                  className={`${uchen.className} w-full px-6 pt-8 pb-5 text-2xl rounded-xl shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[var(--theme-gold-border)] bg-white text-gray-800`}
                />
                <button
                  type="submit"
                  aria-label="Submit search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-3 text-gray-400 hover:text-[var(--theme-gold)] hover:bg-[var(--theme-gold)]/10 rounded-full transition-all duration-300 group"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform duration-300 group-hover:scale-110"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>
              </div>
            </form>

            <div className="space-y-6">
              {searchResults.map((hit) => (
                <Link
                  key={hit.id}
                  href={`/reader?instance=${hit.instance_id}&session=${hit.session_id}&time=${hit.start}&media=${encodeURIComponent(hit.media_url)}&sylId=${hit.first_syl_id}&q=${encodeURIComponent(urlQuery)}`}
                  className="block bg-white p-6 rounded-xl border border-gray-100 hover:border-[var(--theme-gold-border)] transition-all"
                >
                   <div className={`${inter.className} text-[10px] uppercase tracking-tighter text-[var(--theme-gray)] mb-2`}>
                    {hit.teaching_title} • {hit.start}
                  </div>
                  <p className={`${uchen.className} text-2xl leading-relaxed text-black`} dangerouslySetInnerHTML={{ __html: hit.highlight }} />
                </Link>
              ))}
              {urlQuery && !isSearching && searchResults.length === 0 && (
                <p className="text-center text-gray-400 py-12">No matching segments found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}