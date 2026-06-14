"use client";

import { useEffect, useRef, useState } from "react";
import { ADMIN_CHROME, COLORS } from "@/lib/theme";

function inputStyle(focused = false) {
  return {
    width: "100%",
    padding: "9px 12px",
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
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: ADMIN_CHROME.NAV_ITEM_DISABLED,
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

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
              padding: "7px 0",
              fontSize: 13,
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

export default function CreateMemberModal({ onClose, onChanged }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [accessLevel, setAccessLevel] = useState(0);
  const [role, setRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          name,
          password,
          access_level: Number(accessLevel),
          role,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }
      onChanged();
      onClose();
    } catch {
      setError("Erreur réseau inattendue");
    } finally {
      setSaving(false);
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
          background: "rgba(28, 31, 38, 0.45)",
          zIndex: 300,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          background: ADMIN_CHROME.SURFACE,
          border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
          zIndex: 301,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
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
              Nouveau membre
            </div>
            <div
              style={{
                fontSize: 12,
                color: ADMIN_CHROME.NAV_ITEM_DISABLED,
                marginTop: 2,
              }}
            >
              Créer un compte d&apos;accès à l&apos;archive
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

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 20px 24px" }}>
          <FormField label="Username">
            <input
              ref={firstInputRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex: tenzin"
              required
              autoComplete="off"
              style={inputStyle()}
              onFocus={(e) => Object.assign(e.target.style, inputStyle(true))}
              onBlur={(e) => Object.assign(e.target.style, inputStyle(false))}
            />
          </FormField>

          <FormField label="Nom">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              required
              style={inputStyle()}
              onFocus={(e) => Object.assign(e.target.style, inputStyle(true))}
              onBlur={(e) => Object.assign(e.target.style, inputStyle(false))}
            />
          </FormField>

          <FormField label="Mot de passe">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
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

          {/* Inline error */}
          {error && (
            <div
              style={{
                marginBottom: 14,
                padding: "9px 12px",
                background: ADMIN_CHROME.DANGER_SUBTLE,
                border: `1px solid ${ADMIN_CHROME.DANGER_BORDER}`,
                borderRadius: 7,
                fontSize: 13,
                color: ADMIN_CHROME.DANGER,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "9px 0",
                fontSize: 13.5,
                fontWeight: 500,
                color: ADMIN_CHROME.NAV_ITEM_TEXT,
                background: ADMIN_CHROME.CANVAS_BG,
                border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
                borderRadius: 8,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = ADMIN_CHROME.NAV_ITEM_ACTIVE_BG;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = ADMIN_CHROME.CANVAS_BG;
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 2,
                padding: "9px 0",
                fontSize: 13.5,
                fontWeight: 600,
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
              {saving ? "Création…" : "Créer le compte"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
