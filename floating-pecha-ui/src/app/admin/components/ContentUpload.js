"use client";

import { useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { validateInstanceBundle, validateCatalog, requiredInstanceFiles } from "@/lib/archiveValidate";
import { COLORS } from "@/lib/theme";

// Parse the ZIP (browser-side) into { catalogText, instances: Map<id, {files:{name:text}}> }.
// Tolerates an optional single top-level folder (e.g. "output/").
function parseZip(uint8) {
  const entries = unzipSync(uint8);
  const paths = Object.keys(entries).filter((p) => !p.endsWith("/"));
  // Strip a common leading folder if every path shares one.
  const firstSeg = (p) => p.split("/")[0];
  const tops = new Set(paths.map(firstSeg));
  const strip = tops.size === 1 && paths.every((p) => p.includes("/")) ? `${[...tops][0]}/` : "";
  let catalogText = null;
  const instances = new Map();
  for (const p of paths) {
    const rel = strip && p.startsWith(strip) ? p.slice(strip.length) : p;
    const text = strFromU8(entries[p]);
    if (rel === "catalog.json") { catalogText = text; continue; }
    const slash = rel.indexOf("/");
    if (slash === -1) continue;
    const instanceId = rel.slice(0, slash);
    const name = rel.slice(slash + 1);
    if (name.includes("/")) continue; // ignore nested dirs (e.g. sessions/, session_logs/)
    if (!instances.has(instanceId)) instances.set(instanceId, { files: {} });
    instances.get(instanceId).files[name] = text;
  }
  return { catalogText, instances };
}

// Build per-instance rows with a client-side validation verdict.
function buildRows(parsed) {
  const cat = parsed.catalogText ? safeParse(parsed.catalogText) : null;
  const catV = cat ? validateCatalog(cat) : { ok: false, errors: ["catalog.json absent du ZIP"], instances: [] };
  const levelById = new Map(catV.instances.map((i) => [i.instanceId, i]));
  const rows = [];
  for (const [instanceId, { files }] of parsed.instances) {
    const required = requiredInstanceFiles(instanceId);
    const missing = required.filter((n) => typeof files[n] !== "string");
    let verdict;
    if (missing.length) {
      verdict = { ok: false, errors: [`Fichiers manquants: ${missing.join(", ")}`] };
    } else {
      const manifest = safeParse(files["manifest.json"]);
      const sessions = safeParse(files[`${instanceId}_compiled_sessions.json`]);
      verdict = (manifest && sessions)
        ? validateInstanceBundle({ instanceId, manifest, sessions })
        : { ok: false, errors: ["JSON invalide dans manifest/sessions"] };
    }
    const meta = levelById.get(instanceId);
    rows.push({
      instanceId, files,
      accessLevel: meta?.accessLevel ?? 4,
      teachingTitle: meta?.teachingTitle ?? "",
      inCatalog: !!meta,
      verdict,
      status: "pending",
    });
  }
  return { catalogText: parsed.catalogText, catalogValid: catV.ok, catalogErrors: catV.errors, rows };
}

function safeParse(t) { try { return JSON.parse(t); } catch { return null; } }

export default function ContentUpload() {
  const [state, setState] = useState(null); // { catalogText, catalogValid, catalogErrors, rows }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(e) {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      setState(buildRows(parseZip(buf)));
    } catch (err) {
      setError(`Lecture du ZIP impossible: ${err.message}`);
      setState(null);
    }
  }

  async function publish() {
    if (!state) return;
    setBusy(true);
    const rows = [...state.rows];
    for (const row of rows) {
      if (!row.verdict.ok || !row.inCatalog) { row.status = "skipped"; continue; }
      row.status = "publishing";
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
        row.status = res.ok ? `publié (${data.segments} segments)` : `erreur: ${data.error || res.status}`;
        row.failed = !res.ok;
      } catch (err) {
        row.status = `erreur: ${err.message}`;
        row.failed = true;
      }
      setState((s) => ({ ...s, rows: [...rows] }));
    }
    // Replace catalog wholesale once instances are written.
    if (state.catalogValid) {
      try {
        await fetch("/api/admin/content/catalog", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ catalog: state.catalogText }),
        });
      } catch (err) {
        setError(`Catalog non publié: ${err.message}`);
      }
    }
    setBusy(false);
  }

  const canPublish = state && state.catalogValid && state.rows.some((r) => r.verdict.ok && r.inCatalog);

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Contenu</h1>
      <p style={{ fontSize: 13.5, color: COLORS.GRAY, marginBottom: 20 }}>
        Déposez le ZIP du dossier <code>output/</code> du pipeline. Les données sont
        validées dans le navigateur, puis publiées sans redéploiement.
      </p>

      <input type="file" accept=".zip" onChange={onFile} disabled={busy} />

      {error && <p style={{ color: COLORS.HOVER_RED, marginTop: 12 }}>{error}</p>}

      {state && (
        <>
          {!state.catalogValid && (
            <p style={{ color: COLORS.HOVER_RED, marginTop: 16 }}>
              catalog.json invalide — publication bloquée. {state.catalogErrors.join(" · ")}
            </p>
          )}
          <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: COLORS.GRAY }}>
                <th style={{ padding: "6px 8px" }}>Instance</th>
                <th style={{ padding: "6px 8px" }}>Niveau</th>
                <th style={{ padding: "6px 8px" }}>Validation</th>
                <th style={{ padding: "6px 8px" }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.instanceId} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{r.instanceId}</td>
                  <td style={{ padding: "6px 8px" }}>{r.accessLevel}</td>
                  <td style={{ padding: "6px 8px", color: r.verdict.ok && r.inCatalog ? COLORS.GOLD : COLORS.HOVER_RED }}>
                    {!r.inCatalog ? "absente du catalog" : r.verdict.ok ? "OK" : r.verdict.errors.join(" · ")}
                  </td>
                  <td style={{ padding: "6px 8px", color: r.failed ? COLORS.HOVER_RED : COLORS.GRAY }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={publish}
            disabled={!canPublish || busy}
            style={{
              marginTop: 20, padding: "9px 18px", fontSize: 13.5, fontWeight: 600,
              color: "#fff", background: canPublish && !busy ? COLORS.GOLD : "#ccc",
              border: "none", borderRadius: 8, cursor: canPublish && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Publication…" : "Publier"}
          </button>
        </>
      )}
    </div>
  );
}
