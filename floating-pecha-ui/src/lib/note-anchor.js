// Durable text-quote anchoring (W3C TextQuoteSelector style). Pure + layer-
// agnostic: callers pass a syllable list ([{ id, text }, ...]). Whitespace-
// insensitive matching; audio-session markers ("{NNN ...}") are skipped.

const WS = /\s+/g;
const norm = (s) => (s || "").replace(WS, "");
const isMarker = (t) => {
  const x = (t || "").trim();
  return x.startsWith("{") && x.endsWith("}");
};

/** Normalized char stream of a syllable list + parallel char->sylId map. */
export function buildAnchorIndex(list) {
  let text = "";
  const sylIdAt = [];
  for (const syl of list || []) {
    if (isMarker(syl.text)) continue;
    const c = norm(syl.text);
    for (let i = 0; i < c.length; i++) sylIdAt.push(syl.id);
    text += c;
  }
  return { text, sylIdAt };
}

/**
 * Capture a quote selector for syllables [startIdx..endIdx] of `list`, with up
 * to `ctx` raw chars of context on each side (markers skipped). Returns raw
 * (un-normalized) strings — resolveAnchor normalizes at match time.
 */
export function captureAnchor(list, startIdx, endIdx, ctx = 80) {
  const real = (syl) => (syl && !isMarker(syl.text) ? syl.text || "" : "");
  let exact = "";
  for (let i = startIdx; i <= endIdx; i++) exact += real(list[i]);
  let prefix = "";
  for (let i = startIdx - 1; i >= 0 && prefix.length < ctx; i--) prefix = real(list[i]) + prefix;
  prefix = prefix.slice(-ctx);
  let suffix = "";
  for (let i = endIdx + 1; i < list.length && suffix.length < ctx; i++) suffix += real(list[i]);
  suffix = suffix.slice(0, ctx);
  return { prefix, exact, suffix };
}

/**
 * Resolve a quote selector against a prebuilt index (from buildAnchorIndex).
 * Returns { startSylId, endSylId } or null. When the exact quote occurs more
 * than once, the surrounding prefix/suffix context disambiguates.
 */
export function resolveAnchor({ prefix, exact, suffix }, index) {
  const nExact = norm(exact);
  if (!nExact || !index) return null;
  const { text, sylIdAt } = index;
  const nPrefix = norm(prefix);
  const nSuffix = norm(suffix);
  let best = -1;
  let bestScore = -1;
  let from = 0;
  for (;;) {
    const pos = text.indexOf(nExact, from);
    if (pos < 0) break;
    const before = text.slice(Math.max(0, pos - nPrefix.length), pos);
    const after = text.slice(pos + nExact.length, pos + nExact.length + nSuffix.length);
    let score = 0;
    for (let i = 1; i <= Math.min(before.length, nPrefix.length); i++) {
      if (before[before.length - i] === nPrefix[nPrefix.length - i]) score++;
      else break;
    }
    for (let i = 0; i < Math.min(after.length, nSuffix.length); i++) {
      if (after[i] === nSuffix[i]) score++;
      else break;
    }
    if (score > bestScore) { bestScore = score; best = pos; }
    from = pos + 1;
  }
  if (best < 0) return null;
  const startSylId = sylIdAt[best];
  const endSylId = sylIdAt[best + nExact.length - 1];
  if (!startSylId || !endSylId) return null;
  return { startSylId, endSylId };
}
