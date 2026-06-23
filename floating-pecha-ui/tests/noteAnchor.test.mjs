// Run: node tests/noteAnchor.test.mjs
// Unit tests for src/lib/note-anchor.js (pure, layer-agnostic).

import assert from "node:assert/strict";
import {
  buildAnchorIndex,
  captureAnchor,
  resolveAnchor,
} from "../src/lib/note-anchor.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// A small hand-built list. Markers ("{NNN ...}") and whitespace-only syllables
// are skipped by the normalized index.
const list = [
  { id: "a", text: "རྒྱུ་" },
  { id: "b", text: "རྐྱེན་" },
  { id: "c", text: "གྱིས་" },
  { id: "d", text: "\n" },
  { id: "e", text: "{051 x}" },
  { id: "f", text: "གྱིས་" },
  { id: "g", text: "འབྲས་" },
];

test("buildAnchorIndex maps each char to its syllable id and skips markers/whitespace", () => {
  const { text, sylIdAt } = buildAnchorIndex(list);
  // Concatenation of the real (non-marker, non-whitespace) syllable texts.
  const expected = "རྒྱུ་" + "རྐྱེན་" + "གྱིས་" + "གྱིས་" + "འབྲས་";
  assert.equal(text, expected);
  assert.equal(sylIdAt.length, text.length);
  // First char belongs to "a", last char to "g".
  assert.equal(sylIdAt[0], "a");
  assert.equal(sylIdAt[text.length - 1], "g");
  // The marker "e" and whitespace "d" must never appear in the map.
  assert.ok(!sylIdAt.includes("d"));
  assert.ok(!sylIdAt.includes("e"));
});

test("captureAnchor returns the exact span text plus prefix/suffix context", () => {
  // Capture syllables b..c (indices 1..2): "རྐྱེན་གྱིས་".
  const { prefix, exact, suffix } = captureAnchor(list, 1, 2);
  assert.equal(exact, "རྐྱེན་" + "གྱིས་");
  // Prefix is the preceding real syllable text (markers skipped). Raw strings
  // keep whitespace — resolveAnchor normalizes it away at match time.
  assert.equal(prefix, "རྒྱུ་");
  // Suffix is following raw text: whitespace "\n" kept, marker "{051 x}" skipped.
  assert.equal(suffix, "\n" + "གྱིས་" + "འབྲས་");
});

test("captureAnchor caps context to ctx chars on each side", () => {
  const { prefix, suffix } = captureAnchor(list, 1, 2, 2);
  assert.ok(prefix.length <= 2);
  assert.ok(suffix.length <= 2);
});

test("resolveAnchor finds a unique quote", () => {
  const index = buildAnchorIndex(list);
  const sel = captureAnchor(list, 1, 2); // "རྐྱེན་གྱིས་"
  const r = resolveAnchor(sel, index);
  assert.deepEqual(r, { startSylId: "b", endSylId: "c" });
});

test("resolveAnchor disambiguates a duplicated quote using prefix/suffix", () => {
  // "གྱིས་" appears twice (syllable "c" and syllable "f"). Capturing the second
  // one (index 5) must resolve to "f", not "c", via surrounding context.
  const index = buildAnchorIndex(list);
  const sel = captureAnchor(list, 5, 5); // second "གྱིས་"
  const r = resolveAnchor(sel, index);
  assert.deepEqual(r, { startSylId: "f", endSylId: "f" });

  // And capturing the first one (index 2) resolves to "c".
  const sel2 = captureAnchor(list, 2, 2);
  const r2 = resolveAnchor(sel2, index);
  assert.deepEqual(r2, { startSylId: "c", endSylId: "c" });
});

test("resolveAnchor returns null when the quote is absent", () => {
  const index = buildAnchorIndex(list);
  const r = resolveAnchor(
    { prefix: "", exact: "ཨེ་ཛ་ཙ་", suffix: "" },
    index
  );
  assert.equal(r, null);
});

test("resolveAnchor returns null on empty/missing input", () => {
  const index = buildAnchorIndex(list);
  assert.equal(resolveAnchor({ prefix: "", exact: "", suffix: "" }, index), null);
  assert.equal(resolveAnchor({ exact: "རྒྱུ་" }, null), null);
});

console.log(`\n${passed} passed`);
