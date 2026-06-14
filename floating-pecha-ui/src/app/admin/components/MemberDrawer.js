"use client";

import { useEffect, useRef, useState } from "react";
import { ADMIN_CHROME, COLORS } from "@/lib/theme";

// ─── Shared input style helper ────────────────────────────────────────────────

function inputStyle(focused = false) {
  return {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13.5,
    border: `1px solid ${focused ? COLORS.GOLD : ADMIN_CHROME.SURFACE_BORDER}`,
    borderRadius: 7,
    background: ADMIN_CHROME.CANVAS_BG,
    color: ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT,
    outline: "none",
    boxSizing: "border-box",
    boxShadow: focused ? `0 0 0 2px ${COLORS.GOLD}28` : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: ADMIN_CHROME.NAV_ITEM_DISABLED,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Divider({ label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "24px 0 20px",
      }}
    >
      <div style={{ flex: 1, height: 1, background: ADMIN_CHROME.SURFACE_BORDER }} />
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: ADMIN_CHROME.NAV_ITEM_DISABLED,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: ADMIN_CHROME.SURFACE_BORDER }} />
    </div>
  );
}

// ─── Segmented role toggle ────────────────────────────────────────────────────

function RoleToggle({ value, onChange }) {
  const roles = [
    { key: "member", label: "Membre" },
    { key: "admin", label: "Admin" },
  ];
  return (
    <div
      style={{
        display: "flex",
        background: ADMIN_CHROME.CANVAS_BG,
        border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
        borderRadius: 8,
        padding: 3,
        gap: 2,
      }}
    >
      {roles.map((r) => {
        const active = value === r.key;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            style={{
              flex: 1,
              padding: "6px 0",
              fontSize: 12.5,
              fontWeight: active ? 600 : 400,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s",
              background: active
                ? r.key === "admin"
                  ? ADMIN_CHROME.BADGE_ADMIN_BG
                  : ADMIN_CHROME.SURFACE
                : "transparent",
              color: active
                ? r.key === "admin"
                  ? ADMIN_CHROME.BADGE_ADMIN_TEXT
                  : ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT
                : ADMIN_CHROME.NAV_ITEM_DISABLED,
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Inline error ────────────────────────────────────────────────────────────

function InlineError({ message }) {
  if (!message) return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: "8px 12px",
        background: ADMIN_CHROME.DANGER_SUBTLE,
        border: `1px solid ${ADMIN_CHROME.DANGER_BORDER}`,
        borderRadius: 7,
        fontSize: 12.5,
        color: ADMIN_CHROME.DANGER,
        lineHeight: 1.5,
      }}
    >
      {message}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MemberDrawer({ user, onClose, onChanged }) {
  // Edit form state
  const [name, setName] = useState(user.name || "");
  const [accessLevel, setAccessLevel] = useState(user.access_level ?? 0);
  const [role, setRole] = useState(user.role || "member");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Password reset state
  const [password, setPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  // Delete state
  const [deletePhase, setDeletePhase] = useState("idle"); // idle | confirm
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Focus trap / close on Escape
  const drawerRef = useRef(null);
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // ── Save edit ──
  const handleSave = async () => {
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, access_level: Number(accessLevel), role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.error || `Erreur ${res.status}`);
        return;
      }
      onChanged();
    } catch {
      setEditError("Erreur réseau inattendue");
    } finally {
      setSaving(false);
    }
  };

  // ── Reset password ──
  const handlePassword = async () => {
    if (!password.trim()) {
      setPwError("Veuillez saisir un mot de passe");
      return;
    }
    setPwSaving(true);
    setPwError("");
    setPwSuccess(false);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data.error || `Erreur ${res.status}`);
        return;
      }
      setPassword("");
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError("Erreur réseau inattendue");
    } finally {
      setPwSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || `Erreur ${res.status}`);
        setDeletePhase("idle");
        return;
      }
      onChanged();
    } catch {
      setDeleteError("Erreur réseau inattendue");
      setDeletePhase("idle");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(28, 31, 38, 0.35)",
          zIndex: 200,
          backdropFilter: "blur(1px)",
        }}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          maxWidth: "100vw",
          background: ADMIN_CHROME.SURFACE,
          borderLeft: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.1)",
          overflowY: "auto",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
            position: "sticky",
            top: 0,
            background: ADMIN_CHROME.SURFACE,
            zIndex: 1,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT,
              }}
            >
              {user.name || user.username}
            </div>
            <div
              style={{
                fontSize: 12,
                color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                marginTop: 1,
                fontFamily: "monospace",
              }}
            >
              @{user.username}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
              background: ADMIN_CHROME.CANVAS_BG,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: ADMIN_CHROME.NAV_ITEM_DISABLED,
              fontSize: 16,
              transition: "all 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = ADMIN_CHROME.SURFACE_BORDER;
              e.currentTarget.style.color = ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ADMIN_CHROME.CANVAS_BG;
              e.currentTarget.style.color = ADMIN_CHROME.NAV_ITEM_DISABLED;
            }}
          >
            ×
          </button>
        </div>

        {/* Drawer body */}
        <div style={{ padding: "20px 20px 32px", flex: 1 }}>

          {/* ── Edit section ── */}
          <FormField label="Nom">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle()}
              onFocus={(e) => Object.assign(e.target.style, inputStyle(true))}
              onBlur={(e) => Object.assign(e.target.style, inputStyle(false))}
            />
          </FormField>

          <FormField label="Niveau d'accès">
            <select
              value={accessLevel}
              onChange={(e) => setAccessLevel(Number(e.target.value))}
              style={{
                ...inputStyle(),
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237A8099' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
                paddingRight: 30,
                cursor: "pointer",
              }}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} — {["Public", "Ngöndro", "Niveau 2", "Niveau 3", "Dzogrim"][n]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Rôle">
            <RoleToggle value={role} onChange={setRole} />
          </FormField>

          <InlineError message={editError} />

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%",
              padding: "9px 0",
              marginTop: 4,
              fontSize: 13.5,
              fontWeight: 500,
              color: "#FFFFFF",
              background: saving ? ADMIN_CHROME.NAV_ITEM_DISABLED : ADMIN_CHROME.BAR_BG,
              border: "none",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = "#2D3140";
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.background = ADMIN_CHROME.BAR_BG;
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>

          {/* ── Password reset section ── */}
          <Divider label="Mot de passe" />

          <FormField label="Nouveau mot de passe">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle()}
              onFocus={(e) => Object.assign(e.target.style, inputStyle(true))}
              onBlur={(e) => Object.assign(e.target.style, inputStyle(false))}
            />
          </FormField>

          <InlineError message={pwError} />

          {pwSuccess && (
            <div
              style={{
                marginTop: 8,
                marginBottom: 4,
                padding: "8px 12px",
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 7,
                fontSize: 12.5,
                color: "#166534",
              }}
            >
              Mot de passe mis à jour.
            </div>
          )}

          <button
            onClick={handlePassword}
            disabled={pwSaving}
            style={{
              width: "100%",
              padding: "8px 0",
              marginTop: 6,
              fontSize: 13,
              fontWeight: 500,
              color: ADMIN_CHROME.NAV_ITEM_TEXT,
              background: ADMIN_CHROME.CANVAS_BG,
              border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
              borderRadius: 8,
              cursor: pwSaving ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!pwSaving) e.currentTarget.style.background = ADMIN_CHROME.NAV_ITEM_ACTIVE_BG;
            }}
            onMouseLeave={(e) => {
              if (!pwSaving) e.currentTarget.style.background = ADMIN_CHROME.CANVAS_BG;
            }}
          >
            {pwSaving ? "Mise à jour…" : "Définir le mot de passe"}
          </button>

          {/* ── Delete section ── */}
          <Divider label="Zone dangereuse" />

          <InlineError message={deleteError} />

          {deletePhase === "idle" ? (
            <button
              onClick={() => setDeletePhase("confirm")}
              style={{
                width: "100%",
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 500,
                color: ADMIN_CHROME.DANGER,
                background: ADMIN_CHROME.DANGER_SUBTLE,
                border: `1px solid ${ADMIN_CHROME.DANGER_BORDER}`,
                borderRadius: 8,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#F9D5D3";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = ADMIN_CHROME.DANGER_SUBTLE;
              }}
            >
              Supprimer ce membre
            </button>
          ) : (
            <div
              style={{
                border: `1px solid ${ADMIN_CHROME.DANGER_BORDER}`,
                borderRadius: 9,
                padding: "14px 16px",
                background: ADMIN_CHROME.DANGER_SUBTLE,
              }}
            >
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 13,
                  color: ADMIN_CHROME.DANGER,
                  fontWeight: 500,
                }}
              >
                Supprimer <strong>{user.name || user.username}</strong> définitivement ?
                Cette action est irréversible.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setDeletePhase("idle")}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    fontSize: 13,
                    fontWeight: 500,
                    color: ADMIN_CHROME.NAV_ITEM_TEXT,
                    background: ADMIN_CHROME.SURFACE,
                    border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
                    borderRadius: 7,
                    cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#FFFFFF",
                    background: deleting ? "#E57373" : ADMIN_CHROME.DANGER,
                    border: "none",
                    borderRadius: 7,
                    cursor: deleting ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {deleting ? "Suppression…" : "Confirmer"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
