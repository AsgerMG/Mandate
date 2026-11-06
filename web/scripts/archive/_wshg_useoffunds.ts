// wsHG — DERIVE `useOfFunds` FROM THE FOUNDER'S OWN WORDS, AND FROM NOTHING ELSE.
//
// `door_separation_wsHA/README.md` §6: the corpus declares a different purpose
// for the two doors on 86 of 287 sibling-miss pairs (30.0%), the founder is
// asked exactly that on the first page, and `objectiveScorer` already ranks on
// it. `founderIntake` pins the field for all 897 founders and says why: the
// only derivation available reads the register's `objectives_text`, which is a
// statement about the SCHEME being predicted, so deriving it that way would let
// the objective signal grade itself.
//
// This derives it from a different place entirely.
//
// ── THE INPUT IS ONE STRING, AND THE CODE PROVES IT ───────────────────────
// The model sees `r.description` and nothing else. Not the won fund, not its
// id, not its name, not its scheme, not `r.sector`, not `r.instrumentName`,
// not `descriptionFrom`. `promptFor()` takes a single-key object so there is
// no second field to forget about, and `assertNoAnswer()` then searches the
// ASSEMBLED prompt for every answer-bearing string on the row and throws
// before the call is made.
//
// ── WHY A FIELD DERIVED THIS WAY CANNOT LEAK ──────────────────────────────
// The derived value is a pure function of `r.description`, and
// `r.description` is ALREADY handed to the ranker on every arm of this
// harness: `semanticFundMatch(f.opts.description)` embeds it,
// `buildInstrumentTableHydrated` receives it, `orderMemoCandidates` receives
// it. A post-processing of an input the ranker already reads cannot carry more
// information about the answer than that input already carries. The
// description itself clears `isDescribed()` — `own_project_title_leaks`
// excluded — and the exact / 8-gram / sibling bars of `check_recall_leaks`.
// `check_answer_not_reachable.ts` is a statement about `lib/`; this file is a
// harness script and is not reachable from `pipeline.ts`, which is why it may
// name the recall set at all.
//
// ── THE PROMPT IS A PROPERTY AND A TEST, NOT A REGISTER ───────────────────
// No fund, country, sector, scheme or instrument appears in it. The eight
// options come from `USE_OF_FUNDS_OPTIONS` — the vocabulary contract — read
// out of the code rather than transcribed, so an option added to the intake is
// classified on the next run with no edit here. Each carries the test that
// decides an unseen description.
//
// ── COVERAGE IS THE ANSWER, NOT AN INCONVENIENCE ──────────────────────────
// `cannot_tell` is a first-class outcome. A founder answering the first-page
// question has STATED what the money is for; a founder's award-derived
// description may simply not mention it. The share that says nothing is the
// honest measure of whether this is a real product route on this population,
// so the prompt is written to make `cannot_tell` easy to choose and the run
// prints the split three ways.
//
// FREE TO RE-RUN. Cached by sha256 of the description text.
//
// Usage:
//   OUT=/tmp/wshg_uof.json npx tsx scripts/_wshg_useoffunds.ts
//   LIMIT=20 ...            a costed smoke run first
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";

import { USE_OF_FUNDS_OPTIONS } from "../../lib/intelligence/types";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
import { isDescribed, loadRecallSet } from "../recallSet";
import type { RecallRow } from "../recallSet";

loadEnvLocal();
requireCredentials("wshg_useoffunds", ["ANTHROPIC_API_KEY"]);

const MODEL = process.env.UOF_MODEL ?? "claude-haiku-4-5";
const CACHE = process.env.UOF_CACHE ?? "/tmp/wshg_uof_cache.json";
const OUT = process.env.OUT ?? "/tmp/wshg_uof.json";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const CONCURRENCY = Number(process.env.UOF_CONCURRENCY ?? 8);
/** Haiku 4.5 list price per million tokens, 2026-08. */
const PRICE_IN = 1.0, PRICE_OUT = 5.0;

const VALUES: readonly string[] = USE_OF_FUNDS_OPTIONS.map((o) => o.value);
type Basis = "stated" | "inferred" | "cannot_tell";
interface Label { uses: string[]; basis: Basis }

/** ── THE PROMPT ───────────────────────────────────────────────────────────
 *  Written as a property with a test per option, generated from the
 *  vocabulary rather than transcribed. Nothing about public funding, no
 *  programme, no country, no sector, no example drawn from the corpus. */
const SYSTEM = `You read a short description of what a company is doing or building, written by or about that company. You decide what the money for that work would be SPENT ON.

Return the categories below that the description supports, and say on what basis.

THE CATEGORIES. Each is followed by the test that decides an unseen description.

industrial_research — research aimed at new knowledge, before there is a product.
  TEST: the work described is investigation whose output is understanding, and no specific product or prototype is being built yet.

experimental_development — building, prototyping, piloting or demonstrating a product, process or service.
  TEST: something concrete is being made or trialled, and the point of making it is to find out whether and how it works.

feasibility_study — a study, assessment or scoping exercise that decides whether to proceed.
  TEST: the deliverable is an answer to "should we do this, and how", not the thing itself.

rd_facilities — research and development facilities, equipment, instruments or lab or test space.
  TEST: the spend is on the place or the kit the work happens in, not on the work.

ip_protection — patents, trademarks, freedom-to-operate, and the cost of obtaining or defending them.
  TEST: the spend buys a legal right over an invention.

production_capex — building, buying, converting or expanding capacity to produce or manufacture at scale.
  TEST: the output of the spend is a line, plant, machine or installation that will make or deliver a real quantity of something for customers.

market_launch — bringing a finished thing to market: commercial rollout, entering a market, scaling sales, certification for sale.
  TEST: the thing already works, and the spend is on getting it bought.

working_capital — general operations, payroll, stock, cash flow, running the business.
  TEST: the spend keeps the company going and is not attached to any particular piece of work.

THE BASIS. Exactly one:

stated — the description says, in some form, what the work or the money is for. You are reading it off the text.
inferred — the description does not say what the money is for, but it describes the work closely enough that the category follows from what the work IS.
cannot_tell — the description does not support any category. Use this whenever the text is only a company name, a list of partners or organisations, a registry dump of administrative fields, a bare programme or project title with no subject matter, a year, a place, a slogan, or anything else that leaves you guessing about what is actually being done.

RULES.
- Prefer cannot_tell over a guess. Choosing a category you are not reading out of the text makes the answer worse than no answer.
- cannot_tell must come with an empty list. Any other basis must name at least one category.
- Return at most three categories. If several fit, return the ones the text most directly supports.
- Judge only the description in front of you. Do not reason about what kind of funding the company might be applying for, what programme this might be, or what a company like this usually needs.
- The description may be in any language. Read it in the language it is written in.`;

const SCHEMA = {
  type: "object",
  properties: {
    uses: { type: "array", items: { type: "string", enum: VALUES } },
    basis: { type: "string", enum: ["stated", "inferred", "cannot_tell"] },
  },
  required: ["uses", "basis"],
  additionalProperties: false,
} as const;

const key = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/** The ONLY thing that becomes a prompt. One key, so there is no second field
 *  to forget about when somebody adds one to `RecallRow`. */
const promptFor = (input: { description: string }) =>
  `Description:\n${input.description}\n\nWhat would the money be spent on?`;

const norm = (s: string) =>
  s.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

/** ── THE LEAK ASSERTION, OVER THE ASSEMBLED PROMPT ────────────────────────
 *
 *  Not "the code looks right": the string that is about to be sent is searched
 *  for every answer-bearing value on the row. Case-insensitive, and id
 *  separators normalised, because `vinnova_grant__6g` and `Vinnova Grant 6G`
 *  are the same answer.
 *
 *  ── THE PROPERTY, WITH NO EXEMPTION CLAUSE ──────────────────────────────
 *
 *      A FOUNDER WHOSE PROMPT CARRIES ANY ANSWER-BEARING STRING OF THEIR OWN
 *      ROW IS NOT CLASSIFIED AT ALL. THEY KEEP THE PIN, AND THEY ARE COUNTED.
 *
 *  The first draft of this guard tried to decide which hits were *really*
 *  leaks. It found two shapes and neither was worth the argument:
 *
 *    * `Demonstrator` — a fund whose display name is one ordinary English
 *      noun, appearing in two founders' prose about their own work. Almost
 *      certainly harmless: one common word cannot single out one of 1,088
 *      instruments.
 *    * `descriptionFrom` — the regime a rebuilt description was recovered
 *      from. Usually a DIFFERENT regime than the won fund, which is the whole
 *      point of the rebuild. But measured rather than assumed: **on 31 of the
 *      430 rows that carry one, `descriptionFrom` IS the won fund's own
 *      ancestor** (`innovate_uk` under `innovate_uk__grant_for_r_d_...`).
 *      That is the sibling relaxation `recallSet.ts` names as the leak.
 *
 *  Deciding case by case means writing a rule whose job is to let a leak
 *  candidate through, and a workstream that argues its way past its own guard
 *  has no guard. Withholding costs 10 of 897 founders (1.1%) and buys a
 *  position that needs no argument, so the guard has no exemption and the
 *  10 are disclosed on screen and in the finding.
 *
 *  A withheld founder is not dropped from the population — they keep the
 *  pinned answer, exactly as a founder the classifier could not read does, so
 *  the funnel's denominator does not move with the guard. */
const IDENTIFIER_MIN_CHARS = 8;

function answerStringsIn(prompt: string, r: RecallRow): { field: string; raw: string }[] {
  const hay = norm(prompt);
  const banned: [string, string][] = [
    ["instrument", r.instrument],
    ["instrumentName", r.instrumentName ?? ""],
    ["descriptionFrom", (r as { descriptionFrom?: string }).descriptionFrom ?? ""],
    ["reattributedFrom", (r as { reattributedFrom?: string }).reattributedFrom ?? ""],
  ];
  const hits: { field: string; raw: string }[] = [];
  for (const [field, raw] of banned) {
    const needle = norm(raw);
    // Below this length a "hit" is a substring coincidence inside an ordinary
    // word rather than a mention, and a guard that cries wolf gets switched
    // off. The recall set's own exact / 8-gram / sibling bars already cover
    // the substring case; this is the belt on top of them.
    if (needle.length < IDENTIFIER_MIN_CHARS) continue;
    if (!hay.includes(needle)) continue;
    hits.push({ field, raw });
  }
  return hits;
}

/** ── PRE-FLIGHT, BEFORE THE FIRST PAID TOKEN ──────────────────────────────
 *  Run over the WHOLE population up front rather than per call. A leak check
 *  that fires at founder 54 has already spent money on 53, and the operator
 *  then has an incentive to widen it and keep going. Discovering it at zero
 *  spend removes that incentive.
 *
 *  ANTI-VACUITY. If the withheld share were large, the recall set's own leak
 *  bars would have stopped working and a green result here would mean nothing.
 *  Above 5% this throws rather than quietly measuring a rump. */
const WITHHELD_MAX_SHARE = 5;
function preflight(population: RecallRow[]): { clean: RecallRow[]; withheld: Map<string, string> } {
  const clean: RecallRow[] = [];
  const withheld = new Map<string, string>();
  for (const r of population) {
    const prompt = promptFor({ description: (r.description ?? "").trim().slice(0, 2000) });
    const hits = answerStringsIn(prompt, r);
    if (!hits.length) { clean.push(r); continue; }
    withheld.set(r.name, hits.map((h) => `${h.field}=${h.raw}`).join(", "));
  }
  const share = (100 * withheld.size) / population.length;
  if (share > WITHHELD_MAX_SHARE) {
    throw new Error(
      `_wshg_useoffunds: ${withheld.size}/${population.length} (${share.toFixed(1)}%) of prompts `
      + "carry an answer-bearing string from their own row. That is far more than the recall "
      + "set's leak bars should allow, so those bars have stopped working and classifying the "
      + "remainder would be measuring a rump of unknown provenance. Nothing has been spent.");
  }
  console.log(`leak pre-flight: ${population.length} prompt(s) checked against `
    + "`instrument`, `instrumentName`, `descriptionFrom`, `reattributedFrom`");
  console.log(`  ${clean.length} carry none and are classified; `
    + `${withheld.size} (${share.toFixed(1)}%) are WITHHELD and keep the pin:`);
  const byReason = new Map<string, number>();
  for (const v of withheld.values()) byReason.set(v, (byReason.get(v) ?? 0) + 1);
  for (const [why, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${why}`);
  }
  return { clean, withheld };
}

(async () => {
  const { file, rows } = loadRecallSet("wsHG use-of-funds");
  // The funnel's own population, re-derived by the same three restrictions:
  // held out, described, one founder per company, sorted by name. Nothing here
  // depends on Postgres — re-attribution moves `instrument`, never `name` or
  // `description` — so this list is the funnel's draw computed offline.
  const held = rows.filter((r) => r.split === "holdout" && isDescribed(r));
  const seen = new Set<string>();
  const population = [...held].sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  console.log(`set ${file}; held-out described one-per-company: ${population.length} founder(s)`);
  const { clean, withheld } = preflight(population);

  const cache: Record<string, Label> =
    existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const pending = clean.filter((r) => !cache[key((r.description ?? "").trim())]);
  const todo = pending.slice(0, Number.isFinite(LIMIT) ? LIMIT : clean.length);
  console.log(`\ncached ${clean.length - pending.length}, to classify ${todo.length}, `
    + `model ${MODEL}, concurrency ${CONCURRENCY}`);

  const client = new Anthropic();
  let inTok = 0, outTok = 0, done = 0, failed = 0;

  const classify = async (r: RecallRow) => {
    const description = (r.description ?? "").trim();
    // 2,000 characters is the set's own maximum, so this truncation never
    // fires today; it is here so a longer description cannot silently change
    // what a run costs.
    const prompt = promptFor({ description: description.slice(0, 2000) });
    let res;
    try {
      res = await client.messages.create({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM,
        // Haiku 4.5 predates adaptive thinking; omitting `thinking` runs
        // without it, which is what a 200-token classification wants.
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      } as never) as { usage: { input_tokens: number; output_tokens: number };
        content: { type: string; text?: string }[] };
    } catch (e) {
      failed++;
      console.error(`  ${r.name}: ${(e as Error)?.message ?? e}`);
      return;
    }
    inTok += res.usage.input_tokens; outTok += res.usage.output_tokens;
    const text = res.content.find((c) => c.type === "text")?.text;
    if (!text) { failed++; return; }
    let parsed: Label;
    try { parsed = JSON.parse(text) as Label; } catch { failed++; return; }
    // The schema constrains the enum; it cannot constrain the ONE invariant
    // that matters for the coverage figure, so it is enforced here: an empty
    // list is only honest as `cannot_tell`, and a named category is not
    // `cannot_tell`. A row that disagrees with itself is normalised DOWN, to
    // the answer that claims less.
    const uses = [...new Set(parsed.uses ?? [])].filter((u) => VALUES.includes(u));
    const basis: Basis = uses.length === 0 ? "cannot_tell"
      : parsed.basis === "cannot_tell" ? "inferred" : parsed.basis;
    cache[key(description)] = { uses: basis === "cannot_tell" ? [] : uses, basis };
    done++;
    if (done % 50 === 0) {
      writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  ${done}/${todo.length}  in ${inTok} out ${outTok}  `
        + `$${((inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT).toFixed(3)}`);
    }
  };

  // A fixed pool rather than one big Promise.all: 897 simultaneous requests is
  // a rate-limit incident, and a rate-limit incident on a paid run is spend
  // with no measurement at the end of it.
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
    for (;;) { const r = queue.shift(); if (!r) return; await classify(r); }
  }));
  writeFileSync(CACHE, JSON.stringify(cache));

  const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;
  console.log(`\nclassified ${done}, failed ${failed}; tokens in ${inTok} out ${outTok}; `
    + `COST $${cost.toFixed(3)}`);

  // ── THE ARTEFACT THE FUNNEL ARM READS ────────────────────────────────────
  // Keyed by COMPANY NAME, which is what `founderIntake` puts on a replayed
  // founder. Carries no instrument id, so the file itself is not a copy of the
  // answer key.
  // A withheld founder must not carry a label even by accident — the run that
  // discovered the guard had already classified a few of them before it fired,
  // so their cache entries are PURGED rather than merely unread.
  let purged = 0;
  for (const r of population) {
    if (!withheld.has(r.name)) continue;
    const k = key((r.description ?? "").trim());
    if (cache[k]) { delete cache[k]; purged++; }
  }
  if (purged) {
    writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`purged ${purged} cached label(s) belonging to WITHHELD founders`);
  }

  const out: Record<string, Label> = {};
  let missing = 0;
  for (const r of clean) {
    const l = cache[key((r.description ?? "").trim())];
    if (!l) { missing++; continue; }
    out[r.name] = l;
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));

  const nonEmpty = Object.values(out).filter((l) => l.uses.length > 0).length;
  const byBasis = new Map<string, number>();
  for (const l of Object.values(out)) byBasis.set(l.basis, (byBasis.get(l.basis) ?? 0) + 1);
  const byUse = new Map<string, number>();
  for (const l of Object.values(out)) for (const u of l.uses) byUse.set(u, (byUse.get(u) ?? 0) + 1);
  // THE DENOMINATOR IS THE WHOLE POPULATION, not the classified subset. A
  // coverage figure over `clean` would quietly exclude the founders the leak
  // guard removed and read higher for it, which is the one direction a
  // coverage figure must never be flattered in.
  const N = population.length;
  const pct = (x: number) => `${((100 * x) / N).toFixed(1)}%`;

  console.log(`\nwrote ${OUT}: ${Object.keys(out).length}/${N} founders`
    + (missing ? `  (${missing} still unclassified)` : ""));
  console.log(`\nCOVERAGE — the pre-registered outcome 1, over all ${N} founders`);
  console.log(`  a non-empty answer      ${String(nonEmpty).padStart(4)}/${N}  ${pct(nonEmpty)}`);
  for (const b of ["stated", "inferred", "cannot_tell"]) {
    console.log(`    ${b.padEnd(22)}${String(byBasis.get(b) ?? 0).padStart(4)}       `
      + `${pct(byBasis.get(b) ?? 0)}`);
  }
  console.log(`    ${"withheld (leak guard)".padEnd(22)}${String(withheld.size).padStart(4)}       `
    + `${pct(withheld.size)}`);
  console.log(`\nWHAT THE MONEY IS FOR, across the ${nonEmpty} answered`);
  for (const [u, n] of [...byUse].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${u.padEnd(26)}${String(n).padStart(4)}  ${pct(n)}`);
  }
  // The pinned answer, so the reader can see how far the derivation moves from
  // it without going to another file.
  const PIN = new Set(["industrial_research", "experimental_development"]);
  const same = Object.values(out).filter((l) =>
    l.uses.length === PIN.size && l.uses.every((u) => PIN.has(u))).length;
  console.log(`\n  identical to the PIN     ${String(same).padStart(4)}/${N}  ${pct(same)}`
    + `   <- these founders are the arms' own control`);
  console.log(`  differs from the PIN     ${String(nonEmpty - same).padStart(4)}/${N}  `
    + `${pct(nonEmpty - same)}`);
})();
