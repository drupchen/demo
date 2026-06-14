"use client";

import { useState } from "react";
import { ADMIN_CHROME, COLORS } from "@/lib/theme";

function LevelChip({ level }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: ADMIN_CHROME.LEVEL_BG,
        color: ADMIN_CHROME.LEVEL_TEXT,
        border: `1px solid ${ADMIN_CHROME.LEVEL_BORDER}`,
        letterSpacing: 0,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {level}
    </span>
  );
}

function RoleBadge({ role }) {
  const isAdmin = role === "admin";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 500,
        letterSpacing: "0.05em",
        borderRadius: 6,
        padding: "3px 9px",
        background: isAdmin ? ADMIN_CHROME.BADGE_ADMIN_BG : ADMIN_CHROME.BADGE_MEMBER_BG,
        color: isAdmin ? ADMIN_CHROME.BADGE_ADMIN_TEXT : ADMIN_CHROME.BADGE_MEMBER_TEXT,
        border: `1px solid ${isAdmin ? ADMIN_CHROME.BADGE_ADMIN_BORDER : ADMIN_CHROME.BADGE_MEMBER_BORDER}`,
      }}
    >
      {isAdmin && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
        </svg>
      )}
      {isAdmin ? "Admin" : "Membre"}
    </span>
  );
}

const COL_WIDTHS = {
  nom: "25%",
  username: "22%",
  inscrit: "18%",
  niveau: "12%",
  role: "18%",
};

export default function MembersTable({ users, onSelect }) {
  const [filter, setFilter] = useState("");

  const filtered = users.filter((u) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (u.name || "").toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q)
    );
  });

  return (
    <div
      style={{
        background: ADMIN_CHROME.SURFACE,
        border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}
    >
      {/* Filter bar */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
        }}
      >
        <div style={{ position: "relative", maxWidth: 320 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={ADMIN_CHROME.NAV_ITEM_DISABLED}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Filtrer par nom ou username…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px 7px 32px",
              fontSize: 13,
              border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
              borderRadius: 7,
              background: ADMIN_CHROME.CANVAS_BG,
              color: ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT,
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = COLORS.GOLD;
              e.target.style.boxShadow = `0 0 0 2px ${COLORS.GOLD}28`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = ADMIN_CHROME.SURFACE_BORDER;
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
      </div>

      {/* Table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13.5,
        }}
      >
        <thead>
          <tr
            style={{
              background: ADMIN_CHROME.CANVAS_BG,
              borderBottom: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
            }}
          >
            {["Nom", "Username", "Inscrit", "Niveau", "Rôle"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: "40px 16px",
                  textAlign: "center",
                  color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                  fontSize: 13,
                }}
              >
                Aucun membre
              </td>
            </tr>
          ) : (
            filtered.map((user, i) => (
              <tr
                key={user.id}
                onClick={() => onSelect(user)}
                style={{
                  cursor: "pointer",
                  borderBottom:
                    i < filtered.length - 1
                      ? `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`
                      : "none",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = ADMIN_CHROME.NAV_ITEM_ACTIVE_BG;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Nom */}
                <td style={{ padding: "12px 16px", fontWeight: 500, color: ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT }}>
                  {user.name || "—"}
                </td>

                {/* Username */}
                <td style={{ padding: "12px 16px" }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12.5,
                      color: ADMIN_CHROME.NAV_ITEM_TEXT,
                      background: ADMIN_CHROME.CANVAS_BG,
                      border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
                      borderRadius: 4,
                      padding: "2px 7px",
                    }}
                  >
                    {user.username}
                  </span>
                </td>

                {/* Inscrit */}
                <td
                  style={{
                    padding: "12px 16px",
                    color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                    fontSize: 12.5,
                  }}
                >
                  {user.created_at
                    ? new Date(user.created_at * 1000).toLocaleDateString("fr-FR")
                    : "—"}
                </td>

                {/* Niveau */}
                <td style={{ padding: "12px 16px" }}>
                  <LevelChip level={user.access_level ?? 0} />
                </td>

                {/* Rôle */}
                <td style={{ padding: "12px 16px" }}>
                  <RoleBadge role={user.role} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
