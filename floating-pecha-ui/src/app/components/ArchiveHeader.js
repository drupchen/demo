"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { cormorant, outfit } from "@/lib/theme";

export default function ArchiveHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  // The landing ('/') and full-screen reader/player provide their own chrome.
  const isCustomNavRoute =
    pathname === "/" || pathname.startsWith("/reader") || pathname.startsWith("/player");

  useEffect(() => {
    if (isCustomNavRoute) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isCustomNavRoute]);

  if (isCustomNavRoute) return null;

  const inWorld = pathname.startsWith("/world");
  const inArchive = pathname.startsWith("/archive");

  return (
    <header
      className={`${outfit.className} ${cormorant.variable} ${outfit.variable}`}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#F8F5EE",
        borderBottom: "1px solid rgba(162, 131, 72, 0.22)",
        boxShadow: scrolled ? "0 4px 18px -10px rgba(7, 27, 56, 0.18)" : "none",
        transition: "box-shadow 0.4s",
      }}
    >
      <div
        className="rd-header-inner"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 40px",
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        {/* Brand + breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              textDecoration: "none",
            }}
          >
            <img
              src="/images/moon-badge.png"
              alt=""
              style={{
                width: 32,
                height: 32,
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
            <span
              className={cormorant.className}
              style={{
                fontSize: 19,
                fontWeight: 500,
                letterSpacing: "0.01em",
                color: "#0A2347",
              }}
            >
              Rabsal Dawa
            </span>
          </Link>

          {(inArchive || inWorld) && (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ECB320"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 5 L19 12 L9 19" />
              </svg>
              <span
                style={{
                  fontSize: 12,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  color: "#A8231B",
                }}
              >
                {inWorld ? "World" : "Archive"}
              </span>
            </>
          )}
        </div>

        {/* Auth */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {session ? (
            <>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 300,
                  color: "#5E6B78",
                  display: "none",
                }}
                className="rd-meta"
              >
                {session.user?.name} · Level {session.user?.accessLevel ?? 0}
              </span>
              {session.user?.role === "admin" && (
                <Link
                  href="/admin"
                  style={{
                    fontSize: 11.5,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "#A8231B",
                    textDecoration: "none",
                    fontWeight: 500,
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#D4AF37";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#A8231B";
                  }}
                >
                  Admin
                </Link>
              )}
              <button
                onClick={() => signOut()}
                style={{
                  fontSize: 11.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#A8231B",
                  background: "transparent",
                  border: "1px solid rgba(168, 35, 27, 0.4)",
                  borderRadius: 2,
                  padding: "9px 18px",
                  cursor: "pointer",
                  transition: "all 0.3s cubic-bezier(0.22, 0.61, 0.30, 1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(168, 35, 27, 0.08)";
                  e.currentTarget.style.borderColor = "#A8231B";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "rgba(168, 35, 27, 0.4)";
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => signIn()}
              style={{
                fontSize: 11.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#F8F5EE",
                background: "#A8231B",
                border: "1px solid #A8231B",
                borderRadius: 2,
                padding: "9px 20px",
                cursor: "pointer",
                boxShadow: "inset 0 0 0 1px rgba(236, 179, 32, 0.55)",
                transition: "all 0.3s cubic-bezier(0.22, 0.61, 0.30, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "inset 0 0 0 1px rgba(236, 179, 32, 0.85), 0 8px 18px -8px rgba(122, 24, 18, 0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(236, 179, 32, 0.55)";
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 767px) {
          .rd-header-inner {
            padding: 12px 18px !important;
          }
        }
        @media (min-width: 768px) {
          .rd-meta {
            display: inline !important;
          }
        }
      `}</style>
    </header>
  );
}
