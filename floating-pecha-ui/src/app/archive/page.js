"use client";

import Footer from '@/app/components/Footer';
import { cormorant, outfit, uchen } from '@/lib/theme';
import { useSession } from "next-auth/react";
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function ArchiveContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const viewMode = searchParams.get('view') || 'browse';
  const urlQuery = searchParams.get('q') || '';

  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState(urlQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetch('/data/archive/catalog.json')
      .then(res => res.json())
      .then(data => setCatalog(data))
      .catch(err => console.error("Catalog load error:", err));
  }, []);

  useEffect(() => {
    if (viewMode === 'search' && urlQuery) {
      performSearch(urlQuery);
    }
  }, [viewMode, urlQuery]);

  const performSearch = async (searchString) => {
    if (!searchString.trim()) return;
    setIsSearching(true);
    try {
      const userLevel = session?.user?.accessLevel ?? 0;
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchString)}&level=${userLevel}`);
      if (!res.ok) throw new Error("Network response was not OK");
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleView = (mode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', mode);
    if (mode === 'browse') params.delete('q');
    router.push(`/archive?${params.toString()}`, { scroll: false });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      const params = new URLSearchParams(searchParams);
      params.set('view', 'search');
      params.set('q', query);
      router.push(`/archive?${params.toString()}`, { scroll: false });
    }
  };

  const groupedResults = searchResults.reduce((acc, hit) => {
    const title = hit.teaching_title || hit.instance_id;
    if (!acc[title]) acc[title] = [];
    acc[title].push(hit);
    return acc;
  }, {});

  const userLevel = session?.user?.accessLevel ?? 0;
  const filteredCatalog = catalog.filter(teaching => {
    const rawLevel = teaching.Access_Level ?? teaching.Practice_Level ?? teaching.access_level ?? 4;
    return parseInt(rawLevel, 10) <= parseInt(userLevel, 10);
  });

  // Palette aligned with the landing
  const colors = {
    cream: '#F8F5EE',
    creamSoft: '#F0EBDE',
    sky900: '#0A2347',
    sky800: '#123B73',
    inkSoft: '#5E6B78',
    ink: '#33414F',
    cinnabar: '#A8231B',
    vermilion: '#C22920',
    gold: '#ECB320',
    goldSoft: '#E9C56B',
    bronze: '#A28348',
    cline: 'rgba(162, 131, 72, 0.26)',
    gline: 'rgba(236, 179, 32, 0.42)',
    glineSoft: 'rgba(236, 179, 32, 0.20)',
  };

  return (
    <main
      className={`${outfit.className} ${cormorant.variable} ${outfit.variable}`}
      style={{
        minHeight: 'calc(100vh - 81px)',
        background: `linear-gradient(180deg, ${colors.cream} 0%, ${colors.creamSoft} 100%)`,
        color: colors.ink,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '64px 24px 80px', flexGrow: 1 }}>

        {/* HERO */}
        <header style={{ marginBottom: 56, textAlign: 'center' }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.42em',
              textTransform: 'uppercase',
              color: colors.bronze,
              marginBottom: 18,
              fontWeight: 400,
            }}
          >
            <span style={{ position: 'relative', padding: '0 18px' }}>
              <span style={{
                position: 'absolute', top: '50%', right: '100%', width: 36, height: 1,
                background: `linear-gradient(90deg, transparent, ${colors.gline})`,
                transform: 'scaleX(-1)',
              }} />
              Oral Teachings Archive
              <span style={{
                position: 'absolute', top: '50%', left: '100%', width: 36, height: 1,
                background: `linear-gradient(90deg, transparent, ${colors.gline})`,
              }} />
            </span>
          </div>
          <h1
            className={cormorant.className}
            style={{
              fontSize: 'clamp(40px, 6vw, 62px)',
              fontWeight: 500,
              lineHeight: 1.04,
              color: colors.sky900,
              margin: 0,
              letterSpacing: '-0.005em',
            }}
          >
            Teaching <span style={{ color: colors.cinnabar, fontStyle: 'italic', fontWeight: 600 }}>Archives</span>
          </h1>
          <p
            style={{
              marginTop: 18,
              fontSize: 14.5,
              fontWeight: 300,
              color: colors.inkSoft,
              maxWidth: 480,
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.7,
            }}
          >
            The recorded voice of Dilgo Khyentse Rinpoche,<br />
            preserved and aligned to its texts.
          </p>
        </header>

        {/* TABS */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 56, marginBottom: 56, borderBottom: `1px solid ${colors.cline}` }}>
          {[
            { key: 'browse', label: 'Browse catalog' },
            { key: 'search', label: 'Search text' },
          ].map(tab => {
            const active = viewMode === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => toggleView(tab.key)}
                style={{
                  background: 'none',
                  border: 'none',
                  paddingBottom: 18,
                  fontSize: 11.5,
                  fontWeight: 500,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: active ? colors.cinnabar : colors.inkSoft,
                  borderBottom: `2px solid ${active ? colors.cinnabar : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'all 0.35s cubic-bezier(0.22, 0.61, 0.30, 1)',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = colors.sky900; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = colors.inkSoft; }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* BROWSE */}
        {viewMode === 'browse' && (
          <div style={{ display: 'grid', gap: 18 }}>
            {filteredCatalog.map((teaching) => (
              <Link
                key={teaching.Teaching_ID}
                href={`/reader?instance=${teaching.Instances[0]?.Instance_ID}`}
                className="rd-card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#fff',
                  padding: '28px 32px',
                  borderRadius: 8,
                  border: `1px solid ${colors.cline}`,
                  boxShadow: '0 14px 32px -22px rgba(7, 27, 56, 0.4)',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'transform 0.4s cubic-bezier(0.22, 0.61, 0.30, 1), box-shadow 0.4s, border-color 0.4s',
                }}
              >
                <div>
                  <h3
                    className={uchen.className}
                    style={{ fontSize: 26, lineHeight: 1.2, margin: 0, color: colors.sky900, transition: 'color 0.3s' }}
                  >
                    {teaching.Title_bo}
                  </h3>
                  <p style={{
                    margin: '6px 0 0',
                    fontSize: 10.5,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: colors.bronze,
                    fontWeight: 500,
                  }}>
                    {teaching.Instances?.length || 0} version{(teaching.Instances?.length || 0) === 1 ? '' : 's'} available
                  </p>
                </div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.bronze} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="rd-arrow">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            ))}

            {filteredCatalog.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '72px 24px',
                border: `1px dashed ${colors.cline}`, borderRadius: 8,
                background: 'rgba(248, 245, 238, 0.6)',
              }}>
                <p style={{ color: colors.inkSoft, fontSize: 15, margin: 0 }}>No teachings available for this access level.</p>
              </div>
            )}
          </div>
        )}

        {/* SEARCH */}
        {viewMode === 'search' && (
          <div>
            <form onSubmit={handleSearchSubmit} style={{ position: 'relative', marginBottom: 48 }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '28px 60px 28px 32px',
                  fontSize: 26,
                  lineHeight: 1.2,
                  borderRadius: 10,
                  border: `1px solid ${colors.cline}`,
                  background: '#fff',
                  color: colors.sky900,
                  outline: 'none',
                  transition: 'border-color 0.3s, box-shadow 0.3s',
                  fontFamily: `var(--font-outfit), ${uchen.style.fontFamily}, sans-serif`,
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = colors.gold;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.glineSoft}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = colors.cline;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {/* Custom placeholder: shows when input is empty. Lets us style
                  the embedded Tibetan span so its top-line sits at the Latin
                  x-height (the placeholder attribute can't be partially styled). */}
              {!query && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    padding: '28px 60px 28px 32px',
                    fontSize: 26,
                    lineHeight: 1.2,
                    color: colors.inkSoft,
                    fontFamily: `var(--font-outfit), sans-serif`,
                    pointerEvents: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  Enter a Tibetan word (e.g.{' '}
                  <span
                    lang="bo"
                    className={uchen.className}
                    style={{
                      verticalAlign: '-0.18em',
                      fontSize: '0.92em',
                    }}
                  >
                    མི་རྟག་
                  </span>
                  )…
                </div>
              )}
              <button
                type="submit"
                aria-label="Submit search"
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: colors.bronze,
                  borderRadius: '50%',
                  transition: 'all 0.3s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = colors.cinnabar;
                  e.currentTarget.style.background = 'rgba(168, 35, 27, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = colors.bronze;
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </form>

            <div style={{ display: 'grid', gap: 48 }}>
              {Object.entries(groupedResults).map(([title, hits]) => (
                <div key={title}>
                  <div style={{
                    paddingBottom: 14,
                    marginBottom: 18,
                    borderBottom: `1px solid ${colors.glineSoft}`,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                  }}>
                    <h2
                      className={uchen.className}
                      style={{ fontSize: 22, color: colors.cinnabar, margin: 0 }}
                    >
                      {title}
                    </h2>
                    <span style={{
                      fontSize: 10.5,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: colors.bronze,
                      fontWeight: 500,
                    }}>
                      {hits.length} {hits.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {hits.map((hit) => (
                      <Link
                        key={hit.id}
                        href={`/reader?instance=${hit.instance_id}&session=${encodeURIComponent(hit.session_id)}&time=${encodeURIComponent(hit.start)}&sylId=${hit.first_syl_id}&q=${encodeURIComponent(query)}`}
                        className="rd-card"
                        style={{
                          display: 'block',
                          background: '#fff',
                          padding: '24px 28px',
                          borderRadius: 8,
                          border: `1px solid ${colors.cline}`,
                          textDecoration: 'none',
                          color: 'inherit',
                          transition: 'border-color 0.3s, box-shadow 0.3s',
                        }}
                      >
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                          fontWeight: 500, color: colors.inkSoft, marginBottom: 12,
                        }}>
                          <span>Session: {hit.session_id}</span>
                          <span>·</span>
                          <span style={{ color: colors.cinnabar }}>{hit.start}</span>
                        </div>
                        <p
                          className={uchen.className}
                          style={{ fontSize: 24, lineHeight: 1.55, color: colors.sky900, margin: 0 }}
                          dangerouslySetInnerHTML={{ __html: hit.highlight }}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {urlQuery && !isSearching && searchResults.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '72px 24px',
                  border: `1px dashed ${colors.cline}`, borderRadius: 8,
                  background: 'rgba(248, 245, 238, 0.6)',
                }}>
                  <p style={{ color: colors.inkSoft, fontSize: 15, margin: 0 }}>No matching segments found.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />

      <style jsx>{`
        .rd-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 22px 40px -22px rgba(7, 27, 56, 0.5) !important;
          border-color: rgba(236, 179, 32, 0.42) !important;
        }
        .rd-card:hover .rd-arrow {
          stroke: #A8231B;
          transform: translateX(4px);
        }
        .rd-arrow {
          transition: stroke 0.35s, transform 0.35s cubic-bezier(0.22, 0.61, 0.30, 1);
        }
      `}</style>
    </main>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={null}>
      <ArchiveContent />
    </Suspense>
  );
}
