import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth } from "@/auth";

// v1 search backend: SQLite FTS5 inside the app's D1 database (no external
// search engine). Index built by scripts/build-search-index.mjs into the
// `segments_fts` table (migration 0002, trigram tokenizer).

const MARK_OPEN = '<mark class="rd-hit">';
const MARK_CLOSE = "</mark>";
const MAX_RESULTS = 50;
const COLS = "segment_id AS id, instance_id, teaching_title, session_id, start, first_syl_id";

/** Escape a LIKE pattern operand (used as the fallback path). */
function likePattern(q) {
  return `%${q.replace(/[%_\\]/g, "\\$&")}%`;
}

export async function GET(request) {
  // Access level comes from the authenticated session — never from the client.
  // The UI still sends ?level= but it is ignored for authorization.
  const session = await auth();
  const userLevel = session?.user?.accessLevel ?? 0;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const { env } = getCloudflareContext();
  const db = env.DB;

  const runLike = async () => {
    const { results } = await db
      .prepare(
        `SELECT ${COLS}, text AS highlight
         FROM segments_fts
         WHERE text LIKE ? ESCAPE '\\' AND access_level <= ?
         LIMIT ?`
      )
      .bind(likePattern(q), userLevel, MAX_RESULTS)
      .all();
    return results ?? [];
  };

  try {
    // trigram MATCH requires >= 3 codepoints; shorter queries use LIKE.
    if ([...q].length < 3) {
      return NextResponse.json({ results: await runLike() });
    }
    // Phrase-quote the query so trigram treats it as a literal substring,
    // doubling any embedded double-quotes.
    const matchExpr = `"${q.replace(/"/g, '""')}"`;
    const { results } = await db
      .prepare(
        `SELECT ${COLS}, highlight(segments_fts, 0, ?, ?) AS highlight
         FROM segments_fts
         WHERE segments_fts MATCH ? AND access_level <= ?
         ORDER BY rank
         LIMIT ?`
      )
      .bind(MARK_OPEN, MARK_CLOSE, matchExpr, userLevel, MAX_RESULTS)
      .all();
    return NextResponse.json({ results: results ?? [] });
  } catch (err) {
    // A malformed MATCH expression should degrade gracefully, not 500.
    try {
      return NextResponse.json({ results: await runLike() });
    } catch (err2) {
      console.error("Search failed:", err2);
      return NextResponse.json({ results: [], error: "search_failed" }, { status: 500 });
    }
  }
}
