// Sapche outline numbering shown in an alternating digit / uppercase-letter
// scheme: level 1 is a number (1, 2, 3…), level 2 a letter (A, B, C…), level 3
// a number again, and so on. Only the last two levels are displayed, so a deep
// section like 1.B.1 shows as "B.1" — enough to place it under its parent
// without repeating the whole chain.

// 1 → A, 2 → B, … 26 → Z, 27 → AA (spreadsheet-style, for the rare wide outline).
const toLetters = (n) => {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// `number` is the dot-separated, all-digit outline string from sapche.json
// (e.g. "1.2.1"). Segment index i is rendered as a digit when i is even and a
// letter when i is odd; only the final two segments are returned, each tagged
// with its kind so callers can color letters and numbers distinctly.
export function sapcheNumberSegments(number) {
  if (!number) return [];
  return String(number)
    .split(".")
    .map((p, i) => ({
      text: i % 2 === 0 ? p : toLetters(parseInt(p, 10)),
      isLetter: i % 2 === 1,
    }))
    .slice(-2);
}

export function formatSapcheNumber(number) {
  return sapcheNumberSegments(number)
    .map((s) => s.text)
    .join(".");
}
