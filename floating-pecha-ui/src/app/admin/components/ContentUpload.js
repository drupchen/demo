"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseZip, buildRows } from "@/lib/archiveZip";
import { COLORS, ADMIN_CHROME } from "@/lib/theme";

// Table styling shared with MembersTable: white surface card, subtle shadow,
// uppercase muted headers on the canvas-gray header row.
const surfaceCard = {
  background: ADMIN_CHROME.SURFACE,
  border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}`,
  borderRadius: 10,
  overflow: "hidden",
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
};
const th = {
  padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase",
  color: ADMIN_CHROME.NAV_ITEM_DISABLED, whiteSpace: "nowrap",
};
const cell = { padding: "12px 16px", fontSize: 13.5, color: ADMIN_CHROME.NAV_ITEM_TEXT };

export default function ContentUpload() {
  // Published content (existing in R2)
  const [published, setPublished] = useState(null); // null = loading
  const [pubError, setPubError] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Upload staging
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const loadPublished = useCallback(async () => {
    setPubError("");
    try {
      const res = await fetch("/api/admin/content");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const list = (data.instances || []).slice().sort((a, b) => a.instanceId.localeCompare(b.instanceId));
      setPublished(list);
      return list;
    } catch (err) {
      setPublished([]);
      setPubError(`Liste des contenus indisponible : ${err.message}`);
      return [];
    }
  }, []);

  useEffect(() => { loadPublished(); }, [loadPublished]);

  async function handleZipFile(file) {
    setError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Veuillez déposer un fichier .zip.");
      return;
    }
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const parsed = parseZip(buf);
      // Instance mode (no catalog.json) needs the live catalog to resolve levels.
      const pub = parsed.catalogText ? (published ?? []) : (published ?? (await loadPublished()));
      const publishedMeta = new Map((pub || []).map((p) => [p.instanceId, p]));
      setState(buildRows(parsed, publishedMeta));
    } catch (err) {
      setError(`Lecture du ZIP impossible : ${err.message}`);
      setState(null);
    }
  }

  async function publish() {
    if (!state) return;
    setBusy(true);
    const rows = [...state.rows];
    for (const row of rows) {
      if (!row.verdict.ok || !row.known) {
        row.status = "ignorée";
        setState((s) => ({ ...s, rows: [...rows] }));
        continue;
      }
      row.status = "publication…";
      setState((s) => ({ ...s, rows: [...rows] }));
      try {
        const res = await fetch("/api/admin/content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            instanceId: row.instanceId,
            teachingTitle: row.teachingTitle,
            accessLevel: row.accessLevel,
            files: row.files,
          }),
        });
        const data = await res.json().catch(() => ({}));
        row.status = res.ok ? `publié (${data.segments} segments)` : `erreur : ${data.error || res.status}`;
        row.failed = !res.ok;
      } catch (err) {
        row.status = `erreur : ${err.message}`;
        row.failed = true;
      }
      setState((s) => ({ ...s, rows: [...rows] }));
    }
    // Replace the catalog only when the ZIP carried one (snapshot mode).
    if (state.hasCatalog && state.catalogValid) {
      try {
        await fetch("/api/admin/content/catalog", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ catalog: state.catalogText }),
        });
      } catch (err) {
        setError(`Catalog non publié : ${err.message}`);
      }
    }
    setBusy(false);
    loadPublished();
  }

  async function handleDelete(instanceId) {
    setDeletingId(instanceId);
    setPubError("");
    try {
      const res = await fetch(`/api/admin/content/${encodeURIComponent(instanceId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadPublished();
    } catch (err) {
      setPubError(`Suppression impossible : ${err.message}`);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  const canPublish =
    state &&
    (state.hasCatalog ? state.catalogValid : true) &&
    state.rows.some((r) => r.verdict.ok && r.known);

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: COLORS.TEXT_PRIMARY, marginBottom: 6 }}>Contenu</h1>
      <p style={{ fontSize: 14, color: COLORS.TEXT_SECONDARY, marginBottom: 28, lineHeight: 1.5 }}>
        Gérez les enseignements en ligne et publiez des mises à jour. Les données sont
        validées dans le navigateur, puis publiées sans redéploiement.
      </p>

      {/* ── Published content ── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: COLORS.TEXT_PRIMARY, marginBottom: 12 }}>
          Contenus publiés
        </h2>
        {pubError && <p style={{ color: COLORS.HOVER_RED, fontSize: 13, marginBottom: 10 }}>{pubError}</p>}
        {published === null ? (
          <p style={{ fontSize: 13, color: COLORS.TEXT_SECONDARY }}>Chargement…</p>
        ) : published.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.TEXT_SECONDARY }}>Aucun contenu publié pour l’instant.</p>
        ) : (
          <div style={surfaceCard}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: ADMIN_CHROME.CANVAS_BG, borderBottom: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}` }}>
                  <th style={th}>Instance</th>
                  <th style={th}>Niveau</th>
                  <th style={th}>Fichiers</th>
                  <th style={{ ...th, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {published.map((p, i) => (
                  <tr key={p.instanceId} style={{ borderTop: i === 0 ? "none" : `1px solid ${ADMIN_CHROME.SURFACE_BORDER}` }}>
                    <td style={{ ...cell, fontFamily: "monospace", color: ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT }}>{p.instanceId}</td>
                    <td style={cell}>{p.accessLevel ?? "—"}</td>
                    <td style={cell}>{p.files.length} fichier{p.files.length > 1 ? "s" : ""}</td>
                    <td style={{ ...cell, textAlign: "right" }}>
                      {confirmId === p.instanceId ? (
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: COLORS.HOVER_RED, fontSize: 12.5 }}>Confirmer ?</span>
                          <button
                            onClick={() => handleDelete(p.instanceId)}
                            disabled={deletingId === p.instanceId}
                            style={dangerBtn}
                          >
                            {deletingId === p.instanceId ? "Suppression…" : "Supprimer"}
                          </button>
                          <button onClick={() => setConfirmId(null)} disabled={deletingId === p.instanceId} style={ghostBtn}>
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(p.instanceId)} style={ghostDangerBtn}>
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Publish an update ── */}
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: COLORS.TEXT_PRIMARY, marginBottom: 6 }}>
          Publier une mise à jour
        </h2>
        <p style={{ fontSize: 12.5, color: COLORS.TEXT_SECONDARY, marginBottom: 14, lineHeight: 1.5 }}>
          ZIP du dossier <code>output/</code> complet (avec <code>catalog.json</code>) pour
          ajouter/remplacer du contenu, ou ZIP d’une seule instance déjà publiée pour la
          mettre à jour.
        </p>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleZipFile(e.dataTransfer.files?.[0]);
          }}
          style={{
            border: `2px dashed ${dragging ? COLORS.GOLD : ADMIN_CHROME.SURFACE_BORDER}`,
            background: dragging ? COLORS.GOLD_SUBTLE : ADMIN_CHROME.SURFACE,
            borderRadius: 12,
            padding: "32px 24px",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color .15s, background .15s",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.TEXT_PRIMARY, marginBottom: 4 }}>
            Glissez le ZIP ici
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.TEXT_SECONDARY }}>
            ou cliquez pour parcourir vos fichiers (.zip)
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            disabled={busy}
            onChange={(e) => handleZipFile(e.target.files?.[0])}
            style={{ display: "none" }}
          />
        </div>

        {error && <p style={{ color: COLORS.HOVER_RED, fontSize: 13, marginTop: 12 }}>{error}</p>}

        {state && (
          <>
            {state.hasCatalog && !state.catalogValid && (
              <p style={{ color: COLORS.HOVER_RED, fontSize: 13, marginTop: 16 }}>
                catalog.json invalide — publication bloquée. {state.catalogErrors.join(" · ")}
              </p>
            )}
            <p style={{ fontSize: 12.5, color: COLORS.TEXT_SECONDARY, marginTop: 16 }}>
              {state.hasCatalog
                ? "ZIP complet détecté (catalog.json présent) — le catalog sera remplacé."
                : "Mise à jour d’instance(s) déjà publiée(s) — le catalog n’est pas modifié."}
            </p>
            <div style={{ ...surfaceCard, marginTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: ADMIN_CHROME.CANVAS_BG, borderBottom: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}` }}>
                    <th style={th}>Instance</th>
                    <th style={th}>Niveau</th>
                    <th style={th}>Validation</th>
                    <th style={th}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((r, i) => (
                    <tr key={r.instanceId} style={{ borderTop: i === 0 ? "none" : `1px solid ${ADMIN_CHROME.SURFACE_BORDER}` }}>
                      <td style={{ ...cell, fontFamily: "monospace", color: ADMIN_CHROME.NAV_ITEM_ACTIVE_TEXT }}>{r.instanceId}</td>
                      <td style={cell}>{r.accessLevel ?? "—"}</td>
                      <td style={{ ...cell, color: r.verdict.ok && r.known ? ADMIN_CHROME.SUCCESS_TEXT : COLORS.HOVER_RED }}>
                        {!r.known
                          ? (state.hasCatalog ? "absente du catalog" : "inconnue — incluez catalog.json")
                          : r.verdict.ok ? "OK" : r.verdict.errors.join(" · ")}
                      </td>
                      <td style={{ ...cell, color: r.failed ? COLORS.HOVER_RED : COLORS.TEXT_SECONDARY }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={publish}
              disabled={!canPublish || busy}
              style={{
                marginTop: 18, padding: "10px 20px", fontSize: 13.5, fontWeight: 600,
                color: COLORS.BADGE_TEXT, background: canPublish && !busy ? COLORS.GOLD : COLORS.TEXT_DISABLED,
                border: "none", borderRadius: 8, cursor: canPublish && !busy ? "pointer" : "not-allowed",
              }}
            >
              {busy ? "Publication…" : "Publier"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

const baseBtn = {
  fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
};
const ghostBtn = { ...baseBtn, color: COLORS.TEXT_SECONDARY, background: "transparent", border: `1px solid ${ADMIN_CHROME.SURFACE_BORDER}` };
const ghostDangerBtn = { ...baseBtn, color: COLORS.HOVER_RED, background: "transparent", border: `1px solid ${ADMIN_CHROME.DANGER_BORDER}` };
const dangerBtn = { ...baseBtn, color: COLORS.BADGE_TEXT, background: COLORS.HOVER_RED, border: "none" };
