"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { inter, ADMIN_CHROME, COLORS } from "@/lib/theme";

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Membres", href: "/admin/members", disabled: false },
  { label: "Réglages", href: "/admin/settings", disabled: true },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconUsers() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

const ICONS = {
  "/admin/members": <IconUsers />,
  "/admin/settings": <IconSettings />,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminShell({ user, children }) {
  const pathname = usePathname();

  return (
    <div
      className={inter.className}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: ADMIN_CHROME.CANVAS_BG,
        fontFamily: "var(--font-inter, Inter, sans-serif)",
      }}
    >
      {/* ── Top bar ── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: ADMIN_CHROME.BAR_BG,
          borderBottom: `1px solid ${ADMIN_CHROME.BAR_BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 52,
          flexShrink: 0,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Gold accent dot */}
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: COLORS.GOLD,
              flexShrink: 0,
              boxShadow: `0 0 8px ${COLORS.GOLD}80`,
            }}
          />
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              letterSpacing: "0.01em",
              color: ADMIN_CHROME.BAR_TEXT,
            }}
          >
            Rabsal Dawa
          </span>
          <span
            style={{
              fontSize: 13.5,
              color: ADMIN_CHROME.BAR_MUTED,
              fontWeight: 400,
              userSelect: "none",
            }}
          >
            ·
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: COLORS.GOLD,
            }}
          >
            Admin
          </span>
        </div>

        {/* Right side: username + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontSize: 12,
              color: ADMIN_CHROME.BAR_MUTED,
              fontWeight: 400,
            }}
          >
            {user?.name || user?.username}
          </span>

          <div
            style={{
              width: 1,
              height: 18,
              background: ADMIN_CHROME.BAR_BORDER,
            }}
          />

          <button
            onClick={() => signOut({ callbackUrl: "/signin" })}
            title="Se déconnecter"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              fontWeight: 500,
              letterSpacing: "0.06em",
              color: ADMIN_CHROME.BAR_MUTED,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 0",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = ADMIN_CHROME.BAR_TEXT;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = ADMIN_CHROME.BAR_MUTED;
            }}
          >
            <IconLogout />
            <span className="admin-logout-label">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* ── Body: nav + content ── */}
      <div className="admin-body" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Side nav — desktop vertical strip / mobile horizontal top strip */}
        <nav className="admin-sidenav"
          style={{
            width: 210,
            flexShrink: 0,
            background: ADMIN_CHROME.NAV_BG,
            borderRight: `1px solid ${ADMIN_CHROME.NAV_BORDER}`,
            padding: "20px 0",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {/* Nav section label — hidden on mobile strip */}
          <div
            className="admin-nav-section-label"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: ADMIN_CHROME.NAV_ITEM_DISABLED,
              padding: "0 16px 10px",
            }}
          >
            Gestion
          </div>

          {NAV_ITEMS.map((item) => {
            const isActive = !item.disabled && pathname.startsWith(item.href);
            return (
              <div key={item.href} className="admin-nav-item-wrap">
                {item.disabled ? (
                  <div
                    className="admin-nav-item admin-nav-item--disabled"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 16px 8px 20px",
                      fontSize: 13.5,
                      color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                      cursor: "not-allowed",
                      userSelect: "none",
                      borderLeft: "2px solid transparent",
                    }}
                  >
                    <span style={{ opacity: 0.5 }}>
                      {ICONS[item.href]}
                    </span>
                    <span className="admin-nav-label">{item.label}</span>
                    <span
                      className="admin-nav-soon"
                      style={{
                        marginLeft: "auto",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        background: ADMIN_CHROME.CANVAS_BG,
                        border: `1px solid ${ADMIN_CHROME.NAV_BORDER}`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                      }}
                    >
                      bientôt
                    </span>
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className="admin-nav-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 16px 8px 18px",
                      fontSize: 13.5,
                      fontWeight: isActive ? 500 : 400,
                      color: isActive
                        ? ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT
                        : ADMIN_CHROME.NAV_ITEM_TEXT,
                      textDecoration: "none",
                      background: isActive ? ADMIN_CHROME.NAV_ITEM_ACTIVE_BG : "transparent",
                      borderLeft: `2px solid ${isActive ? ADMIN_CHROME.NAV_ITEM_ACTIVE_BORDER : "transparent"}`,
                      transition: "all 0.15s ease",
                      borderRadius: "0 6px 6px 0",
                      marginRight: 8,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = ADMIN_CHROME.NAV_ITEM_ACTIVE_BG;
                        e.currentTarget.style.color = ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = ADMIN_CHROME.NAV_ITEM_TEXT;
                      }
                    }}
                  >
                    <span
                      style={{
                        color: isActive ? COLORS.GOLD : "currentColor",
                        transition: "color 0.15s",
                        flexShrink: 0,
                      }}
                    >
                      {ICONS[item.href]}
                    </span>
                    <span className="admin-nav-label">{item.label}</span>
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        {/* Content canvas */}
        <main
          className="admin-content"
          style={{
            flex: 1,
            overflow: "auto",
            padding: "28px 32px",
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>

      <style>{`
        /* ── Mobile: collapse side-nav into a compact horizontal strip ── */
        @media (max-width: 768px) {
          .admin-logout-label { display: none; }

          /* Stack body vertically so the strip sits between topbar + content */
          .admin-body {
            flex-direction: column;
            overflow: visible;
          }

          /* The nav becomes a horizontal pill-row strip */
          .admin-sidenav {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid ${ADMIN_CHROME.NAV_BORDER};
            flex-direction: row !important;
            align-items: center;
            padding: 0 12px !important;
            gap: 4px !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            /* Don't stretch to fill height on column axis */
            flex-shrink: 0;
          }

          /* Hide the "Gestion" section label on mobile — not needed in strip mode */
          .admin-nav-section-label { display: none; }

          /* Each item wrapper becomes inline */
          .admin-nav-item-wrap { flex-shrink: 0; }

          /* Nav items: pill shape, no left border accent, horizontal padding */
          .admin-nav-item {
            border-left: none !important;
            border-radius: 6px !important;
            margin-right: 0 !important;
            padding: 7px 12px !important;
            white-space: nowrap;
          }

          /* Hide the "bientôt" badge — too noisy in the compact strip */
          .admin-nav-soon { display: none; }

          /* Content area fills remaining space and scrolls normally */
          .admin-content {
            flex: 1;
            overflow: auto;
            padding: 20px 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
