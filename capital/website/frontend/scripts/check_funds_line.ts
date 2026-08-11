/**
 * A `funds:` line must be a statement of scope, not the start of one.
 *
 * FREE — no model calls, no network, no credentials. Reads the committed
 * corpus snapshot, which is the same file the site falls back to, and renders
 * every described instrument through the SHIPPED functions
 * (`fundsSentence` then `beyondTitle`, exactly as `shortlist.ts` composes
 * them). Nothing is reimplemented here: a check that re-derives the thing it
 * guards passes when the product is broken and the copy is not.
 *
 * ── The defect this exists to prevent a second of ─────────────────────────
 * `fundsSentence` split on any period. European administrative prose is full of
 * periods that do not end a sentence, so a 725-character description of an
 * Italian ministry programme reached the ranker as thirty-six characters:
 *
 *     funds: Manifestazione di interesse (D.D. n.
 *
 * What that threw away named the seven southern regions the programme is
 * reserved to, one of which is where the founder we were grading on sits. Over
 * the nine founders wsDR handed the answer to and got zero from, NOT ONE won
 * row carried a usable scope line, and 39 of the 54 rows the model chose
 * instead did. This is the class of defect that costs an answer without ever
 * failing anything.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     A rendered `funds:` line stands in for a scheme's own page. It must be a
 *     STATEMENT: long enough to state a scope, and finished at its end — or, if
 *     it is cut, it must say so.
 *
 * The test lives with the property, in `schemeText.fundsLineDefect`, so the
 * renderer and its guard read one definition. It is deliberately NOT a list of
 * the abbreviations we happened to find: `D.D.`, `u.a.` and `des 8.` are
 * today's three, `check_contracts` fails the build over exactly that kind of
 * enumeration, and the corpus spans 40 countries' prose. The general test is
 * FILL — whatever fooled the sentence rule, the line it leaves is short, and
 * short is measurable without knowing the word. See `schemeText.ts` for the
 * full statement of both tests and of what is deliberately not tested.
 *
 * ── What makes reading the snapshot trustworthy ───────────────────────────
 * `check_corpus_currency.ts` runs earlier in `npm run check` and fails when the
 * committed snapshot has drifted from Postgres, so this reading is a statement
 * about the corpus the site serves and not about a stale file. Same dependency,
 * stated not duplicated, as `check_leaf_cap.ts`.
 *
 *   npx tsx scripts/check_funds_line.ts
 */
import { readFileSync } from "fs";
import path from "path";

import {
  beyondTitle, FUNDS_SENTENCE_CHARS, fundsFloor, fundsLineDefect, fundsSentence,
} from "../lib/intelligence/schemeText";

interface Record_ { id: string; name?: string | null; description?: string | null }

const corpusPath = path.join(process.cwd(), "public", "data", "instrument_terms.json");
const records = (JSON.parse(readFileSync(corpusPath, "utf8")).records ?? []) as Record_[];

const described = records.filter((r) => (r.description ?? "").trim());
const bad: string[] = [];
let rendered = 0, suppressed = 0, elided = 0;

for (const r of described) {
  // The composition `shortlist.ts` ships, in its order. `|| undefined` there is
  // "no funds line on this row", which is the same thing as "" here.
  const line = beyondTitle(r.name, fundsSentence(r.description));
  if (!line) { suppressed++; continue; }
  rendered++;
  if (line.endsWith("…")) elided++;
  const why = fundsLineDefect(line, r.description);
  if (why) bad.push(`  ${r.id}\n      ${why}\n      funds: ${line}`);
}

console.log(`check_funds_line: ${described.length} described instrument(s) in the ` +
  `committed snapshot\n  ${rendered} render a funds: line (${elided} of them marked ` +
  `as elided), ${suppressed} say nothing the row's title does not already say\n` +
  `  budget ${FUNDS_SENTENCE_CHARS} chars, floor ${fundsFloor()}`);

if (!described.length) {
  console.error("\nFAIL — no descriptions were read, so this check proved nothing. " +
    "Run it from website/frontend, where public/data/instrument_terms.json is.");
  process.exitCode = 1;
} else if (bad.length) {
  console.error(`\nFAIL — ${bad.length} funds: line(s) are not a statement of scope:\n`);
  for (const line of bad) console.error(line);
  console.error(
    "\nA line that stops early or stops mid-phrase reads to the ranker as a fund " +
    "that does not say what it pays for, and the ranker picks the rows it can read.\n" +
    "The fix is in lib/intelligence/schemeText.ts — the sentence rule or the fill " +
    "floor. It is NOT an exception for the scheme named above, and it is NOT a list " +
    "of abbreviations: state the shape that makes this line incomplete, and test that.");
  process.exitCode = 1;
} else {
  console.log("  PASS — every rendered funds: line spends its budget and ends on a " +
    "finished phrase, or says that it is cut.");
}
