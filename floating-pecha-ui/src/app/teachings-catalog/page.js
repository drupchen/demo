"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Footer from "@/app/components/Footer";
import { cormorant, outfit, uchen, getThemeCssVars } from "@/lib/theme";

const REQUIRED_LEVEL = 4;

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Small "original" / "restored" link prepended inside the title cell.
function SourceLink({ href, label }) {
  if (!href) return null;
  return (
    <a className="rd-srclink" href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

export default function TeachingsCatalogPage() {
  const { data: session, status } = useSession();
  const level = session?.user?.accessLevel ?? 0;
  const allowed = status === "authenticated" && level >= REQUIRED_LEVEL;

  const [sections, setSections] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  // Fetch the catalog only when authorized; the data is served by a level-4
  // gated API so it never reaches unauthorized clients.
  useEffect(() => {
    if (!allowed) {
      setSections([]);
      return;
    }
    let cancelled = false;
    setLoadingData(true);
    fetch("/api/teachings-catalog")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        if (!cancelled) setSections(data.sections || []);
      })
      .catch((err) => {
        if (!cancelled) setSections([]);
        console.error("Catalog load error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const filtered = useMemo(() => {
    if (!query) return sections;
    return sections.map((s) => ({
      ...s,
      rows: s.rows.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.extra.some((v) => (v || "").toLowerCase().includes(query))
      ),
    })).filter((s) => s.rows.length > 0);
  }, [query, sections]);

  const totalHits = filtered.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div
      className={`${outfit.className} ${cormorant.variable} ${outfit.variable} ${uchen.variable}`}
      style={{
        ...getThemeCssVars(),
        minHeight: "100vh",
        background: "#F8F5EE",
        color: "#33414F",
      }}
    >
      <main
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "56px 24px 24px",
        }}
      >
        {/* Heading */}
        <header style={{ marginBottom: 36 }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "#A8231B",
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            Rabsal Dawa · Archive
          </p>
          <h1
            className={cormorant.className}
            style={{ fontSize: 46, fontWeight: 600, color: "#0A2347", lineHeight: 1.05 }}
          >
            Teachings’ Catalog
          </h1>
          <p style={{ marginTop: 8, fontSize: 15, fontWeight: 300, color: "#5E6B78" }}>
            April ’26 — a snapshot of identified teaching sessions and their audio.
          </p>
        </header>

        {!allowed ? (
          <div className="rd-gate">
            {status === "loading" ? (
              <p>Checking access…</p>
            ) : (
              <>
                <p>
                  This catalog is restricted to <strong>Level 4</strong> members.
                  {status === "authenticated" && (
                    <> Your account does not have access.</>
                  )}
                </p>
                {status !== "authenticated" && (
                  <button type="button" className="rd-signin" onClick={() => signIn()}>
                    Sign in
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
        <>
        {/* Search */}
        <div className="rd-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a7a4e" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles…"
            aria-label="Search the catalog"
          />
          {q && (
            <button type="button" className="rd-clear" onClick={() => setQ("")} aria-label="Clear search">
              ×
            </button>
          )}
          {query && (
            <span className="rd-hits">
              {totalHits} {totalHits === 1 ? "result" : "results"}
            </span>
          )}
        </div>

        {/* Section index */}
        <nav className="rd-index">
          {filtered.map((s) => (
            <a key={s.name} href={`#${slugify(s.name)}`}>
              {s.name}
              <span className="rd-count">{s.rows.length}</span>
            </a>
          ))}
        </nav>

        {query && filtered.length === 0 && (
          <p style={{ marginTop: 40, color: "#5E6B78", fontSize: 15 }}>
            No teachings match “{q.trim()}”.
          </p>
        )}

        {/* Sections */}
        {filtered.map((section) => (
          <section key={section.name} id={slugify(section.name)} style={{ marginTop: 52 }}>
            <h2
              className={cormorant.className}
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: "#0A2347",
                borderBottom: "2px solid rgba(212, 175, 55, 0.5)",
                paddingBottom: 8,
                marginBottom: 4,
              }}
            >
              {section.name}
            </h2>

            <div className="rd-tablewrap">
              <table className="rd-table">
                <thead>
                  <tr>
                    <th>Title of the text</th>
                    {section.cols.map((label) => (
                      <th
                        key={label}
                        className={label.toLowerCase() === "duration" ? "rd-dur" : "rd-meta"}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, i) => (
                    <tr key={i}>
                      <td className="rd-title">
                        {(row.original || row.restored) && (
                          <span className="rd-links">
                            <SourceLink href={row.original} label="original" />
                            <SourceLink href={row.restored} label="restored" />
                          </span>
                        )}
                        <span className="rd-titletext">{row.title}</span>
                      </td>
                      {row.extra.map((val, j) => (
                        <td
                          key={j}
                          className={
                            section.cols[j]?.toLowerCase() === "duration" ? "rd-dur" : "rd-meta"
                          }
                        >
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        </>
        )}
      </main>

      <Footer />

      <style jsx>{`
        .rd-gate {
          margin-top: 24px;
          padding: 40px 28px;
          background: #fbf8f1;
          border: 1px solid rgba(162, 131, 72, 0.22);
          border-radius: 8px;
          text-align: center;
          color: #5e6b78;
          font-size: 16px;
        }
        .rd-gate strong {
          color: #0a2347;
        }
        .rd-signin {
          margin-top: 18px;
          font-size: 12px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #f8f5ee;
          background: #a8231b;
          border: 1px solid #a8231b;
          border-radius: 2px;
          padding: 10px 22px;
          cursor: pointer;
          box-shadow: inset 0 0 0 1px rgba(236, 179, 32, 0.55);
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .rd-signin:hover {
          transform: translateY(-1px);
          box-shadow: inset 0 0 0 1px rgba(236, 179, 32, 0.85),
            0 8px 18px -8px rgba(122, 24, 18, 0.6);
        }

        .rd-search {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
          padding: 11px 14px;
          background: #fff;
          border: 1px solid rgba(162, 131, 72, 0.3);
          border-radius: 6px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .rd-search:focus-within {
          border-color: #d4af37;
          box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.15);
        }
        .rd-search input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-size: 15px;
          font-family: var(--font-outfit), system-ui, sans-serif;
          color: #2c3742;
        }
        .rd-search input::placeholder {
          color: #9aa3ad;
        }
        .rd-clear {
          border: none;
          background: transparent;
          color: #8a7a4e;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
        }
        .rd-clear:hover {
          color: #8b1d1d;
        }
        .rd-hits {
          font-size: 11.5px;
          letter-spacing: 0.04em;
          color: #8a7a4e;
          white-space: nowrap;
        }

        .rd-index {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 10px;
          padding: 16px 18px;
          background: #fbf8f1;
          border: 1px solid rgba(162, 131, 72, 0.22);
          border-radius: 6px;
        }
        .rd-index a {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12.5px;
          color: #5e6b78;
          text-decoration: none;
          padding: 5px 10px;
          border-radius: 4px;
          transition: background 0.2s, color 0.2s;
        }
        .rd-index a:hover {
          background: rgba(212, 175, 55, 0.14);
          color: #0a2347;
        }
        .rd-count {
          font-size: 10.5px;
          font-weight: 500;
          color: #8a7a4e;
          background: rgba(212, 175, 55, 0.18);
          border-radius: 999px;
          padding: 1px 7px;
        }

        .rd-tablewrap {
          overflow-x: auto;
          margin-top: 14px;
        }
        .rd-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .rd-table th {
          text-align: left;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 500;
          color: #8a7a4e;
          padding: 8px 14px;
          border-bottom: 1px solid rgba(162, 131, 72, 0.35);
          white-space: nowrap;
        }
        .rd-table td {
          padding: 11px 14px;
          border-bottom: 1px solid rgba(162, 131, 72, 0.16);
          vertical-align: top;
          color: #2c3742;
        }
        .rd-table tbody tr:hover td {
          background: rgba(212, 175, 55, 0.07);
        }
        .rd-title {
          /* Tibetan-capable stack; Latin falls through to Outfit */
          font-family: var(--font-uchen), "Monlam Uni Dutsa", var(--font-outfit),
            system-ui, serif;
          line-height: 1.6;
        }
        .rd-titletext {
          /* keep title on its own visual run after the links */
        }
        .rd-dur {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          color: #5e6b78;
        }
        .rd-meta {
          color: #5e6b78;
        }

        .rd-links {
          margin-right: 4px;
        }
        :global(.rd-srclink) {
          display: inline-block;
          font-family: var(--font-outfit), system-ui, sans-serif;
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #a8231b;
          text-decoration: none;
          border: 1px solid rgba(168, 35, 27, 0.35);
          border-radius: 3px;
          padding: 1px 6px;
          margin-right: 6px;
          vertical-align: 1px;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
        }
        :global(.rd-srclink:hover) {
          background: rgba(212, 175, 55, 0.18);
          border-color: #d4af37;
          color: #8b1d1d;
        }

        @media (max-width: 600px) {
          .rd-table {
            font-size: 13px;
          }
          .rd-table th,
          .rd-table td {
            padding: 9px 10px;
          }
        }
      `}</style>
    </div>
  );
}
