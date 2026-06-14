"use client";

import { useCallback, useEffect, useState } from "react";
import { ADMIN_CHROME, COLORS } from "@/lib/theme";
import MembersTable from "../components/MembersTable";
import MemberDrawer from "../components/MemberDrawer";
import CreateMemberModal from "../components/CreateMemberModal";

export default function MembersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // user being edited in drawer
  const [creating, setCreating] = useState(false); // modal open

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Called after any successful mutation
  const handleChanged = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Membres
          </h1>
          {!loading && !error && (
            <p
              style={{
                fontSize: 12.5,
                color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                margin: "3px 0 0",
                fontWeight: 400,
              }}
            >
              {users.length} compte{users.length !== 1 ? "s" : ""} au total
            </p>
          )}
        </div>

        <button
          onClick={() => setCreating(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 500,
            color: "#FFFFFF",
            background: ADMIN_CHROME.BAR_BG,
            border: `1px solid ${ADMIN_CHROME.BAR_BORDER}`,
            borderRadius: 8,
            padding: "8px 16px",
            cursor: "pointer",
            letterSpacing: "0.01em",
            transition: "background 0.15s",
            boxShadow: `0 1px 3px rgba(0,0,0,0.12)`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#2D3140";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = ADMIN_CHROME.BAR_BG;
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>＋</span>
          Nouveau
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            background: ADMIN_CHROME.SURFACE,
            border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
            borderRadius: 10,
            padding: "48px 24px",
            textAlign: "center",
            color: ADMIN_CHROME.NAV_ITEM_DISABLED,
            fontSize: 13.5,
          }}
        >
          Chargement…
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            background: ADMIN_CHROME.DANGER_SUBTLE,
            border: `1px solid ${ADMIN_CHROME.DANGER_BORDER}`,
            borderRadius: 10,
            padding: "18px 20px",
            color: ADMIN_CHROME.DANGER,
            fontSize: 13.5,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontWeight: 600 }}>Erreur :</span> {error}
          <button
            onClick={fetchUsers}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 500,
              color: ADMIN_CHROME.DANGER,
              background: "transparent",
              border: `1px solid ${ADMIN_CHROME.DANGER_BORDER}`,
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <MembersTable users={users} onSelect={setSelected} />
      )}

      {/* Drawer */}
      {selected && (
        <MemberDrawer
          user={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            handleChanged();
            setSelected(null);
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <CreateMemberModal
          onClose={() => setCreating(false)}
          onChanged={() => {
            handleChanged();
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
