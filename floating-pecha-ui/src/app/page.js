'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { uchen, inter, getThemeCssVars } from '@/lib/theme';

export default function CatalogLandingPage() {
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/data/catalog.json')
      .then((res) => res.json())
      .then((data) => {
        setCatalog(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load catalog:", err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return null;

  // Grouping logic based on Instance_Type
  const grouped = catalog.reduce((acc, teaching) => {
    teaching.Instances.forEach(instance => {
      // Format the label: 'oral_commentary' -> 'Oral Commentary'
      const typeLabel = instance.Instance_Type === 'oral_commentary'
        ? 'Oral Commentary'
        : (instance.Instance_Type || 'Other');

      if (!acc[typeLabel]) acc[typeLabel] = [];
      acc[typeLabel].push({
        id: instance.Instance_ID,
        title: teaching.Title_bo
      });
    });
    return acc;
  }, {});

  return (
    <main className="min-h-screen p-12 md:p-24 bg-[#F7FAFC]" style={getThemeCssVars()}>
      <div className="max-w-3xl mx-auto">

        {/* RESTORED PAGE TITLE */}
        <header className="mb-20">
          <h1 className="text-4xl md:text-5xl font-bold text-[#C19A5B]">
            Khyentse Önang Digital Archive
          </h1>
        </header>

        <div className="space-y-20">
          {Object.entries(grouped).map(([type, items]) => (
            <section key={type}>
              <h2 className={`${inter.className} text-xs uppercase tracking-[0.4em] text-gray-400 mb-10 font-bold border-b border-gray-100 pb-4`}>
                {type}
              </h2>
              <div className="space-y-8">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/reader?instance=${item.id}`}
                    className={`${uchen.className} block text-4xl md:text-5xl text-gray-800 hover:text-[var(--theme-hover-red)] transition-all duration-300 leading-relaxed`}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}