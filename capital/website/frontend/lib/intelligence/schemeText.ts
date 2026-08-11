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
// ── WHAT WAS WRONG WITH THAT, MEASURED (wsDV, wsDW) ───────────────────────
// "Whole sentences" was implemented as "split on any period", and European
// administrative prose is full of periods that do not end a sentence. Over the
// 490 described instruments in the committed snapshot, 82 rendered a line under
// 60% of its own budget while hundreds of characters of the page went unread.
// The worst reached the ranker as thirty-six characters of seven hundred and
// twenty-five:
//
//     funds: Manifestazione di interesse (D.D. n.
//
// What that cut away included the clause reserving the programme to Basilicata,
// Calabria, Campania, Molise, Puglia, Sardegna and Sicilia. The founder wsDR
// was grading on is the University of Salerno, in Campania. Across the nine
// founders whose won fund sat on the menu and was not chosen, ZERO of the nine
// won rows carried a usable scope line and 39 of the 54 rows the model chose
// instead did. The model picked the rows it could read.
//
// Two properties fix it and both are stated as properties, not as a list of the
// abbreviations we happened to find — see `isSentenceEnd` and MIN_FILL below.
//
// LEAF MODULE. It imports nothing, so `check_client_boundary` and the hermetic
// checks can read it without acquiring a database.

/** How much of a scheme's own page one candidate row may spend.
 *
 *  180, from the sweep above: it is where the curve flattens (240 buys three
 *  more pairs of the 304) and it holds the row inside 600 characters, which is
 *  the budget the selector was built at. */
export const FUNDS_SENTENCE_CHARS = 180;

/** How much of the title one candidate row shows.
 *
 *  Here rather than in the renderer because TWO things read it and they must
 *  read one number: `renderRow` cuts the title to this, and `beyondTitle` asks
 *  whether a description adds anything the title has ALREADY SAID — a question
 *  about the title the model sees, not about the column in the database.
 *  Against the full title, a French aid regime for R&D on "la décarbonation, la
 *  compétitivité et la sécurité du transport aérien" had its description
 *  suppressed for repeating a title whose last four words were never rendered.
 *  The row said decarbonisation; the fact that it was an AVIATION scheme
 *  existed in our corpus and was deleted twice on the way to the page. */
export const ROW_TITLE_CHARS = 120;

/** The least of its budget a scope line may spend before it is a stub rather
 *  than a statement.
 *
 *  ── The property ─────────────────────────────────────────────────────────
 *  A line that stops at a third of its budget while the page it came from
 *  continues is not a sentence boundary we found, it is a boundary we guessed
 *  wrong. Structural boundary tests (`isSentenceEnd`) catch the shapes that can
 *  be recognised without a dictionary — an initial, an ordinal, a period inside
 *  an open bracket. They cannot catch every abbreviation in every language the
 *  corpus holds, and a list of the ones we have seen would be an enumeration
 *  this repo fails builds over.
 *
 *  This is the test that does not need to know the word. Whatever the reason
 *  the sentence rule came up short, if it came up short the budget is spent on
 *  the head of the page instead, marked as elided. Of the 399 described
 *  instruments in the committed snapshot longer than the budget, 349 now elide
 *  — no sentence boundary inside the budget, or one that left the line under
 *  this floor — and 50 end on a whole sentence that spends most of it. Under
 *  the old rule 82 shipped as stubs; `check_funds_line.ts` fails the build on
 *  any of them.
 *
 *  0.6 rather than 1.0 because a complete sentence that spends most of its
 *  budget is better than a cut one: the elision is the fallback, not the rule. */
export const MIN_FILL = 0.6;

/** The floor in characters, for the renderer and for the check that guards it. */
export const fundsFloor = (cap = FUNDS_SENTENCE_CHARS): number => Math.round(cap * MIN_FILL);

const UPPER = /\p{Lu}/u;
const ALNUM = /[\p{L}\p{N}]/u;
const DIGITS = /^\p{N}+$/u;
/** A new sentence may open with a capital, a bracket, a quotation mark, or a
 *  list marker — a fetched page turns its bullets into exactly these. */
const OPENS_SENTENCE = "([«“\"'-–—•*§";

/**
 * Does the punctuation mark at `i` end a sentence?
 *
 * ── The property, and why it is not a list of abbreviations ───────────────
 * A period ends a sentence when the text on both sides of it is shaped like the
 * end of one and the start of another. Three structural facts decide it, none
 * of which names a word, so an abbreviation nobody has seen yet is handled by
 * the same code as the ones that caused this:
 *
 *   1. A sentence cannot end inside an open bracket. `Manifestazione di
 *      interesse (D.D. n. 307 del 18/03/2025) per il sostegno...` is one
 *      sentence; the two periods inside the parenthesis are a citation.
 *   2. A sentence ends on a WORD. A single letter before the period is an
 *      initial (`D.`, `n.`, `u.a.`) and a bare number is an ordinal or a list
 *      marker (`im Rahmen des 8. Energieforschungsprogramms`).
 *   3. A sentence is followed by the start of another: a capital, a bracket, a
 *      quote or a bullet. A lowercase word continues the sentence, and a DIGIT
 *      is the other half of the abbreviation before it — `Reglamento (UE) núm.
 *      651/2014`, `Art. 17`, `Nr. 3` — which is how a two-letter abbreviation
 *      is caught without knowing that it is one.
 *
 * `?` and `!` need none of this: they are unambiguous. `:` and `;` are
 * deliberately NOT terminators. Both promise more of the same sentence — a
 * colon promises what follows, a semicolon promises the next item of an
 * enumeration — so a line ending on either stops mid-phrase by construction,
 * which is a thing `check_funds_line.ts` fails the build on. Treating `;` as a
 * full stop, as this module did until wsDW, ended thirteen snapshot rows on a
 * dangling semicolon: "Förderung von Schlüsseltechnologien wie Quanten-
 * Computing, Künstlicher Intelligenz (KI) ... und Robotik;" is one item of a
 * list, presented as the whole of what the scheme funds.
 */
function isSentenceEnd(t: string, i: number, depth: number): boolean {
  if (depth > 0) return false;
  const c = t[i];
  if (c === "?" || c === "!") return true;
  let j = i - 1;
  while (j >= 0 && ALNUM.test(t[j])) j--;
  const prev = t.slice(j + 1, i);
  if (prev.length < 2 || DIGITS.test(prev)) return false;
  let k = i + 1;
  while (k < t.length && /\s/.test(t[k])) k++;
  const nx = t[k];
  return Boolean(nx) && (UPPER.test(nx) || OPENS_SENTENCE.includes(nx));
}

/** The text as sentences, by the rule above. Whitespace is already collapsed by
 *  the caller, so a segment is returned verbatim and rejoining is a single
 *  space. */
function sentences(t: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (".?!".includes(c) && /\s/.test(t[i + 1] ?? "") && isSentenceEnd(t, i, depth)) {
      out.push(t.slice(start, i + 1));
      start = i + 2;
      while (start < t.length && /\s/.test(t[start])) start++;
      i = start - 1;
    }
  }
  if (start < t.length) out.push(t.slice(start));
  return out;
}

/**
 * What the scheme says it funds, in its own words, inside `cap` characters.
 *
 * Whole sentences up to the cap. When they do not reach `MIN_FILL` of it — one
 * long opening clause, or a boundary rule that came up short on prose it cannot
 * read — the budget is spent on the head of the page instead and marked with an
 * ellipsis, because the alternative is a line that says nothing while the page
 * it came from says plenty.
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
  for (const part of sentences(t)) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > cap) break;
    out = next;
  }
  // Under the floor: cut on a word boundary and SAY that it is cut.
  if (out.length < fundsFloor(cap)) {
    const head = t.slice(0, cap);
    const sp = head.lastIndexOf(" ");
    return `${(sp > cap * MIN_FILL ? head.slice(0, sp) : head).trim()}…`;
  }
  return out;
}

/** A title on one line and short enough to read. Some German and French legal
 *  titles run past 250 characters with embedded newlines.
 *
 *  Lives here, beside `ROW_TITLE_CHARS`, because the renderer and `beyondTitle`
 *  must agree on what the row actually shows and a second copy of this would be
 *  the "keep in sync" comment this repo treats as the defect itself. */
export function oneLine(s: string | null | undefined, max = ROW_TITLE_CHARS): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
}

/** Content words, case- and punctuation-blind. Four characters is the floor
 *  because below it the token is a function word in every language the corpus
 *  holds, and a shared "and" is not a shared fact. */
const words = (s: string): string[] =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w.length > 3);

/**
 * The sentence, unless it only says back the title THE ROW ACTUALLY SHOWS.
 *
 * ── The property ──────────────────────────────────────────────────────────
 * A row already renders the scheme's title, cut to `ROW_TITLE_CHARS`. A
 * description that contributes NO content word that rendered title does not
 * already carry adds nothing to that row: it cannot separate the row from any
 * other, because anything it says the reader has already read.
 *
 * The clause "the title THE ROW ACTUALLY SHOWS" is the whole of wsDW's fix and
 * it is worth 83 of the 490 described instruments in the snapshot. Comparing
 * against the database column suppressed descriptions for repeating words that
 * were cut off the row before it was sent — including the only three words that
 * said a French aid regime was about air transport.
 *
 * ── Why the test is "any novel word" and not a similarity threshold ────────
 * Measured over 338 described rows across the 12 archetypes' pools:
 *
 *   novel content words   0     1    2    3    4+
 *   rows                 95    11   19    9   204
 *
 * so the population is bimodal and almost any cutoff separates it. A RATIO
 * would not be safe, though, and one measured case says why: two children of
 * one national programme render the same title, and their descriptions are
 * that title plus one word each. On an 80%-overlap rule both are dropped and
 * the pair goes blind; on this rule both survive, because that one word is
 * exactly what tells them apart. A test that can delete the only separating
 * word is the wrong test however good its average looks.
 *
 * The zero-novelty rows are a quarter of all the description characters on a
 * prompt, spent restating a title the model is reading on the line above.
 */
export function beyondTitle(
  title: string | null | undefined, sentence: string,
): string {
  if (!sentence) return "";
  const known = new Set(words(oneLine(title, ROW_TITLE_CHARS)));
  return words(sentence).some((w) => !known.has(w)) ? sentence : "";
}

/**
 * Why this rendered `funds:` line is not a statement of scope, or "".
 *
 * ── The property, and its test for the unseen case ────────────────────────
 * A `funds:` line stands in for a scheme's own page. It must therefore be a
 * STATEMENT: long enough to state a scope, and finished at its end — or, if it
 * is cut, it must say so with the elision marker, which is a different claim
 * and an honest one.
 *
 * Two tests, neither of which names a word:
 *
 *   FILL      Unless the line is the whole description, it must spend at least
 *             `MIN_FILL` of its budget. This is the general test: whatever
 *             abbreviation in whatever language fooled the sentence rule, the
 *             line it produces is short, and short is what this measures. It is
 *             what would have caught `funds: Manifestazione di interesse (D.D.
 *             n.` at thirty-six characters of seven hundred and twenty-five.
 *   COMPLETE  A line that does NOT declare itself cut must not end mid-phrase:
 *             no bracket left open, no trailing connector, no closing word that
 *             is a lone initial. A line that DOES end in the marker is exempt
 *             from this one — it has already told the reader it stops early.
 *
 * Not tested: whether the last word is an abbreviation. There is no test for
 * that which is not a dictionary, and FILL makes one unnecessary — an
 * abbreviation that truncates a page produces a stub, and a line that spends
 * its budget and happens to end on `Abs.` has still said what the fund funds.
 */
export function fundsLineDefect(
  line: string, description: string | null | undefined, cap = FUNDS_SENTENCE_CHARS,
): string {
  if (!line) return "";
  const whole = (description ?? "").replace(/\s+/g, " ").trim();
  if (line !== whole && line.length < fundsFloor(cap)) {
    return `stub: ${line.length} of a ${cap}-character budget, from a ${whole.length}-character description`;
  }
  if (line.endsWith("…")) return "";
  const opened = (line.match(/[([]/g) ?? []).length - (line.match(/[)\]]/g) ?? []).length;
  if (opened > 0) return `ends inside ${opened} unclosed bracket(s)`;
  if (/[,;:/\-–—([]$/.test(line)) return `ends on the connector "${line.slice(-1)}"`;
  // A single LETTER before the final period is an initial (`... (D.D. n.`). A
  // single DIGIT is not: `OBJETIVO ESPECÍFICO 1.3.` and `Reglamento (UE) núm.
  // 651/2014.` end on a number because the thing they name IS a number, and a
  // rule that cannot tell those apart deletes two correct lines to catch none.
  const last = /\.$/.test(line) ? (line.slice(0, -1).match(/[\p{L}\p{N}]+$/u)?.[0] ?? "") : "";
  if (last.length === 1 && /\p{L}/u.test(last)) return `ends on the initial "${last}."`;
  return "";
}
