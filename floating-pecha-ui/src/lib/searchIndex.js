// Pure helpers for building the D1 segments_fts search index. No filesystem or
// Cloudflare deps so they run in Node (build script) and in the Worker (upload route).

/** Escape a value for a single-quoted SQL string literal. */
export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Reconstruct segment rows for one instance.
 * @param {{manifest:Array<{id:string,text:string}>, sessions:Array<object>,
 *   instanceId:string, teachingTitle:string, accessLevel:number}} args
 * @returns {Array<object>} rows ready for insertion
 */
export function reconstructSegments({ manifest, sessions, instanceId, teachingTitle, accessLevel }) {
  const sylMap = new Map(manifest.map((s) => [s.id, s.text]));
  const rows = [];
  for (const seg of sessions) {
    const sylIds = seg.syl_uuids ?? [];
    const text = sylIds.map((id) => sylMap.get(id) ?? "").join("").trim();
    if (!text) continue; // skip segments with no resolvable text
    rows.push({
      segment_id: seg.global_seg_id,
      instance_id: instanceId,
      teaching_title: teachingTitle ?? "",
      session_id: seg.source_session ?? "",
      start: seg.start ?? "",
      first_syl_id: sylIds[0] ?? "",
      access_level: Number.isInteger(accessLevel) ? accessLevel : 4,
      text,
    });
  }
  return rows;
}

/**
 * Render rows into a SQL script that rebuilds the WHOLE index (DELETE then
 * INSERT). Used by the CLI script only. INSERTs are grouped by an approximate
 * byte budget per statement (D1 rejects oversized statements).
 */
export function rowsToSql(rows, { maxStatementBytes = 60000 } = {}) {
  const parts = ["DELETE FROM segments_fts;"];
  const cols =
    "(text, segment_id, instance_id, teaching_title, session_id, start, first_syl_id, access_level)";
  const prefix = `INSERT INTO segments_fts ${cols} VALUES\n`;

  let buf = [];
  let bufBytes = 0;
  const flush = () => {
    if (buf.length === 0) return;
    parts.push(prefix + buf.join(",\n") + ";");
    buf = [];
    bufBytes = 0;
  };

  for (const r of rows) {
    const tuple =
      `(${sqlString(r.text)}, ${sqlString(r.segment_id)}, ${sqlString(r.instance_id)}, ` +
      `${sqlString(r.teaching_title)}, ${sqlString(r.session_id)}, ${sqlString(r.start)}, ` +
      `${sqlString(r.first_syl_id)}, ${Number(r.access_level)})`;
    const tupleBytes = Buffer.byteLength(tuple, "utf-8");
    if (buf.length > 0 && bufBytes + tupleBytes > maxStatementBytes) flush();
    buf.push(tuple);
    bufBytes += tupleBytes;
  }
  flush();
  return parts.join("\n");
}
