// A frequency the code computes may not also be typed into the prompt.
//
// ── The defect, in one request ────────────────────────────────────────────
// `contracts/selection/fund-selection.md` is assembled verbatim into the
// selector's SYSTEM prompt. It stated, as measured fact, that the fund a
// company won is in the candidate list "about 97% of the time" and in the
// published rows "about a quarter of the time". In the same call,
// `baseRateSentence` computed the same two quantities from the committed
// `poolRecallCurve` and put them in the USER prompt — at forty rows, 75% and
// 35%. The model was handed both.
//
// Neither contract number was curve-derived and nothing checked them.
// `check_pool_recall_curve` guards the ARTIFACT — that it loads, is monotone,
// covers the product's depths and was measured on this corpus — and is blind
// to prose that duplicates what the artifact says. Its own header calls the
// artifact "the one artifact in this repo whose whole job is to make a SENTENCE
// TO A MODEL true", and the false sentence was in a different file.
//
// The 97% is the sharper half: it is not merely stale. It is a real figure from
// a DIFFERENT population — `check_recall_floor`'s pool figure, measured on
// pairs whose answer is already offerable, at the founder-screen stage — quoted
// as a property of the forty-row list the selector is looking at. A number can
// be right somewhere and false here.
//
// ── THE PROPERTY ──────────────────────────────────────────────────────────
//
//   NO TEXT ASSEMBLED INTO A MODEL PROMPT MAY STATE A RATE.
//
// A RATE is a quantity that answers "how often" — a percentage, or a fraction
// or proportion, standing in a sentence that makes it a frequency. A COUNT is
// not a rate and is untouched: sample sizes, numbers of rules, index numbers,
// "ten of the twelve bench companies", "2.1 rows of 18" all stay.
//
// The reason is structural rather than a matter of the numbers being stale.
// These files are memoised once per process and are byte-identical on every
// request, at every menu length, on every corpus. Every rate this product knows
// is a function of at least one of those — so a rate typed here is wrong at
// some depth by construction, and would be wrong again the next time the corpus
// moves, silently, because nobody edits a sentence when they reload a country.
// Rates reach the model from ONE place: computed at request time, from a
// committed artifact, at the depth actually shown.
//
// It is a property, not a register. There is no list of known-bad figures here,
// no allowlist, and no mention of 97 or 75 or 35 in the detector. A rate added
// to any contract tomorrow fails, whatever its value and whichever stage's file
// it lands in.
//
// ── The positive half, which is why deleting is not enough ────────────────
// Removing the sentence would also satisfy a guard that only forbids. So this
// also asserts that the rate IS still delivered: `baseRateSentence` must
// produce all three figures at every depth the product can show a menu at. A
// prompt that makes no claim about how often the answer is present is a
// different defect — a model told nothing will assume the list usually contains
// the answer, which is what four workstreams shipped.
//
// ── Hermetic, and it cannot pass by having nothing to read ────────────────
// The committed `contracts/` tree and two leaf modules. No database, no
// credentials, no network. Non-vacuity assertions fail it if the tree went
// missing, shrank, or lost its prose.
//
// ── It proves itself on every run ─────────────────────────────────────────
// `selfTest()` runs the detector over synthetic contract text — including the
// exact two sentences that were live, and the counts that must NOT fire — and
// fails the check before it judges the real tree if any come out wrong.
//
//   npx tsx scripts/check_prompt_rates.ts
//   PROVE=1 npx tsx scripts/check_prompt_rates.ts
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

// The detector itself lives in `promptRates.ts` so `check_money_basis.ts` can
// read the SAME definition of a rate without importing (and so running) this
// guard. The reasoning above, and the self-test below, stay here.
import { ratesIn, sentences, type Hit } from "./promptRates";

// Source text and two leaf modules. No corpus, no credentials — destroyed
// rather than merely unused, which is the stronger of the two statements
// `check_env_loader` accepts.
delete process.env.DATABASE_URL;

import { SELECT_COUNT } from "../lib/intelligence/caps";
import { baseRateSentence, POOL_RECALL_KS } from "../lib/intelligence/poolRecall";

/** The tree assembled into prompts. Named literally so the tie between the
 *  guard and what it guards is visible from the source. */
const CONTRACTS = path.join(process.cwd(), "contracts");

/** Non-vacuity: states in which this would pass while seeing nothing. */
const MIN_FILES = 5;
const MIN_SENTENCES = 200;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.md$/.test(e) ? [full] : [];
  });
}

function selfTest(): void {
  const mustFire: [string, string][] = [
    ["the 97% sentence, as it was live",
     "- the fund a company actually won is somewhere in the candidate list about 97%\n"
     + "  of the time. It is almost always here."],
    ["the quarter sentence, as it was live",
     "- it is in the rows we currently publish about a quarter of the time. It is\n"
     + "  usually not at the top."],
    ["a rate nobody has written yet, with a different value and shape",
     "The right fund is in the top ten 3 in 5 of the time on this corpus."],
    ["a bare percentage with no frequency words at all",
     "Roughly 61.4% of candidate rows carry a usable scope line."],
  ];
  for (const [name, text] of mustFire) {
    if (!ratesIn("synthetic", text).length) {
      throw new Error(`selfTest: "${name}" did not fire`);
    }
  }
  const mustNotFire: [string, string][] = [
    ["a count over a named sample",
     "Counted over the twelve bench companies, a mean of 2.1 rows of 18 survive both,\n"
     + "and ten of the twelve have fewer survivors than the six they must name."],
    ["a proportion of a thing that is not a frequency",
     "Spend half the budget on the first two rows if that is where the fit is."],
    ["an index and a cap",
     "Return as many indices as the request asks for, distinct, best first."],
    ["the replacement prose, which describes the rate without stating one",
     "How OFTEN it is worth reaching, and how far, is a measured quantity and it is\n"
     + "stated in the request itself, not here."],
  ];
  for (const [name, text] of mustNotFire) {
    const hit = ratesIn("synthetic", text);
    if (hit.length) {
      throw new Error(`selfTest: "${name}" fired on "${hit[0].sentence}"`);
    }
  }
}

/**
 * PROVE IT GOES RED ON THE EVENT IT NAMES.
 *
 * Not a stand-in: the two sentences below are the bytes that were in
 * `contracts/selection/fund-selection.md` at commit a8dd9074, restored in
 * memory and re-judged. If the detector does not reject them this guard is
 * decorative and says so rather than reporting green.
 */
function prove(): void {
  const WAS = `## What the order in front of it already means

- the fund a company actually won is somewhere in the candidate list about 97%
  of the time. It is almost always here.
- it is in the rows we currently publish about a quarter of the time. It is
  usually not at the top.
`;
  const hits = ratesIn("contracts/selection/fund-selection.md (as it was)", WAS);
  console.log("  PROVE: the contract text that shipped, re-judged:");
  for (const h of hits) console.log(`    RED  line ${h.line}: ${h.sentence}`);
  console.log(`    ${hits.length} rate(s) rejected  ${hits.length >= 2
    ? "— the guard bites on the real bytes"
    : "██ FEWER THAN THE TWO THAT SHIPPED — NOT ENFORCING ██"}`);
  if (hits.length < 2) throw new Error("PROVE: the live defect was not fully caught.");
}

// ── run ────────────────────────────────────────────────────────────────────
selfTest();

const problems: string[] = [];
const files = walk(CONTRACTS);
let sentenceCount = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  sentenceCount += sentences(text).length;
  for (const h of ratesIn(path.relative(process.cwd(), f), text)) {
    problems.push(`${h.file}:${h.line} states a rate: "${h.sentence}"\n`
      + `      These files are byte-identical on every request, at every menu length, on `
      + `every corpus. A rate written here is wrong at some depth by construction. Delete `
      + `it, or compute it at request time and let the request carry it.`);
  }
}

// The positive half: the rate is still delivered, at every depth a menu can be.
const depths = [...new Set([...POOL_RECALL_KS, 6, 7, 18, 40])].filter((k) => k > 0).sort((a, b) => a - b);
const silent = depths.filter((k) => !/\d+%/.test(baseRateSentence(k)));
if (silent.length) {
  problems.push(`baseRateSentence states no rate at depth(s) ${silent.join(", ")}. `
    + `Removing the claim from the contract only helps if the computed one arrives: a model `
    + `told nothing about how often the answer is present will assume it usually is.`);
}
// …and all three facts, not just one.
const at40 = baseRateSentence(40);
// The band is read from SELECT_COUNT, not from a literal: this file said "the
// sixth row" for two workstreams after the seat count became 7, and that is the
// drift the tie exists to stop. Asserted against the constant so the guard
// cannot be the next place the number goes stale.
for (const need of [
  `the first ${SELECT_COUNT} rows`,
  "somewhere in this list",
  `BELOW row ${SELECT_COUNT}`,
  "not in this list at all",
]) {
  if (!at40.includes(need)) {
    problems.push(`baseRateSentence at 40 rows does not say "${need}". The band a choice can `
      + `win is sized by the seat count, and the third fact — how often the answer is absent `
      + `— is the one the old hardcoded sentence hid.`);
  }
}

if (files.length < MIN_FILES) {
  problems.push(`Only ${files.length} contract file(s) under contracts/ (expected at least `
    + `${MIN_FILES}). The tree moved and this guard has gone blind.`);
}
if (sentenceCount < MIN_SENTENCES) {
  problems.push(`Only ${sentenceCount} sentence(s) read (expected at least `
    + `${MIN_SENTENCES}). The splitter stopped matching.`);
}

if (process.env.PROVE) prove();

if (problems.length) {
  console.error(`check_prompt_rates: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`check_prompt_rates: ok — ${sentenceCount} sentence(s) across ${files.length} `
  + `contract file(s) state no rate, and baseRateSentence delivers all three figures at every `
  + `one of ${depths.length} menu depth(s) the product can show.`);
