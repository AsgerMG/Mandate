// The scheme's own words, cut to a budget.
//
// ── Why a module, for what looks like one call to .slice() ─────────────────
// The selector renders roughly 400 characters per candidate across 58 rows.
// The median `description` is 737 characters and the p95 is 2,317, so pasting
// the column in would more than double the prompt and would spend most of that
// on the paragraph that DESCRIBES rather than the sentence that SEPARATES.
//
// The cut is therefore measured, not chosen. `scripts/_wsdi_menu.ts` renders
// every fixture menu through production's own `renderMenu`, counts the sibling
// pairs whose rendered rows say substantively the same thing, and asks how many
// of those each cut separates:
//
//     description, whole column      260 of 304 blind pairs (86%)   737 chars
//     whole sentences up to 120      241 (79%)                      190 chars
//     whole sentences up to 240      241 (79%)                      243 chars
//     first 180 characters, hard     253 (83%)                      178 chars
//
// The hard cut wins on both axes and that is not an accident: a scheme page
// opens with what it funds and then turns to procedure, so the first clause is
// the discriminating one and a sentence-boundary rule that stops before a
// second short clause simply carries less of it.
//
// It is still not what ships. A hard cut ends mid-clause, and a clause that
// ends mid-way reads to a model as a DEMAND THE FUND DOES NOT MAKE — "eligible
// applicants must be established in" is a different statement from the one the
// page carries. Twelve pairs out of 304 is not worth a class of fabricated
// requirement, so the shipped rule takes whole sentences and then, only if
// there is budget left over, the head of the next one marked as elided.
//
// LEAF MODULE. It imports nothing, so `check_client_boundary` and the hermetic
// checks can read it without acquiring a database.

/** How much of a scheme's own page one candidate row may spend.
 *
 *  180, from the sweep above: it is where the curve flattens (240 buys three
 *  more pairs of the 304) and it holds the row inside 600 characters, which is
 *  the budget the selector was built at. */
export const FUNDS_SENTENCE_CHARS = 180;

/** Sentence enders, including the ones a European scheme page actually uses:
 *  a semicolon between enumerated purposes, and a bullet turned into a period
 *  by the fetcher. */
const ENDER = /(?<=[.;:])\s+/;

/**
 * What the scheme says it funds, in its own words, inside `cap` characters.
 *
 * Whole sentences up to the cap. When the FIRST sentence alone is longer than
 * the cap it is cut and marked with an ellipsis, because the alternative — an
 * empty line for exactly the schemes whose pages are written as one long
 * clause — silently removes the field from the funds it was added for.
 *
 * Returns "" for absent or trivially short text rather than a placeholder: a
 * row that says nothing is honest, and a row that says "no description on
 * record" spends 24 characters saying so on every one of 58 candidates.
 */
export function fundsSentence(
  text: string | null | undefined, cap = FUNDS_SENTENCE_CHARS,
): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 12) return "";
  if (t.length <= cap) return t;

  let out = "";
  for (const part of t.split(ENDER)) {
    if (out && (`${out} ${part}`).length > cap) break;
    out = out ? `${out} ${part}` : part;
    if (out.length > cap) break;
  }
  // One long opening clause: cut on a word boundary and SAY that it is cut.
  if (!out || out.length > cap) {
    const head = t.slice(0, cap);
    const sp = head.lastIndexOf(" ");
    return `${(sp > cap * 0.6 ? head.slice(0, sp) : head).trim()}…`;
  }
  return out;
}
