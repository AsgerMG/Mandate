// Nothing a founder's request can reach may read the answer key.
//
// ── Why this exists, and why it is an import-graph check ────────────────────
//
// This project grades itself on "did the fund this company actually won appear
// in the published rows". Several stores in this repo ANSWER that question
// directly, and three of them sit in the same directory the memo path imports
// from:
//
//   lib/intelligence/profileLeakIndex.generated.json   1.7 MB, all 1,088
//       `instrument_profiles.profile_text` values, up to 40 REAL WINNING
//       PROJECT TITLES each, committed, credential-free. A `readFileSync` from
//       any memo-path module reaches it in milliseconds.
//   lib/intelligence/__recallSet*.json                 the answer key itself:
//       `description -> the instrument that company won`.
//   instrument_profiles.profile_text                   the same text in
//       Postgres. The shipped ranker touches this table and is safe ONLY
//       because it consumes a scalar percentile; any query selecting the text
//       hands over the answer.
//
// A fourth is subtler and already loaded: `funding_instruments.sample_project_
// titles` is SELECTed in corpus.ts, parsed onto `DbInstrument`, and read by
// nothing. It is one property access away from any module in the path.
//
// ── The property ────────────────────────────────────────────────────────────
//
//   NO MODULE REACHABLE FROM THE MEMO PATH MAY NAME AN ANSWER-BEARING SOURCE.
//
// Reach is DERIVED from the import graph, transitively, exactly as
// check_env_loader.ts derives credential reach — not from a hand-kept list of
// files, because a new module that imports a bad one would not be on such a
// list. The entry points are the two things a founder's request runs:
// `computeVerdict` and `runIntelligence`, both in lib/intelligence/pipeline.ts.
//
// It is a NAME check, not a behaviour check. That is the point: a leak here is
// worth more than a leak anywhere else in the product, so the bar is "this
// module does not mention the answer", not "this module probably does not use
// it". Diagnostics, harnesses and the leak guard itself name these sources
// legitimately and are not reachable from the request path, so they are not
// implicated by construction rather than by exemption.
//
// ── AND WHY A NAME CHECK IS NOT ENOUGH (property 2, below) ─────────────────
//
// A name check asks "does this module mention the answer". It cannot ask "was
// this VALUE computed from the answer", and that is the leak that is actually
// available today. `funding_instruments.delivery_region` names nothing: it is a
// four-character NUTS id. It is also a PLURALITY OVER THE BENEFICIARY REGION OF
// EVERY AWARD the fund has made — the state aid register's own answer to "who
// won here, and where are they" — collapsed to one string. Show it on a
// candidate row beside a founder who answered `region`, and the row that
// matches is the row whose past winners look like this founder. That is the
// answer key, aggregated. Property 1 would pass it without a word.
//
// The same is true of `sector_mix`, which is already on every row through
// `fundDescriptor`'s "mostly biotech & pharma" clause, and it will be true of
// whatever column somebody derives next year in a table nobody here has read.
// So the second property reasons about DERIVATION and not about names.
//
// Prove both can fail:
//   PROVE=1 npx tsx scripts/check_answer_not_reachable.ts
// Property 2's proof is not a printed sentence. It takes the real ETL pass and
// the real row-building module, applies the three edits a person adding an
// award-derived column would actually make, and requires the check to come back
// RED on them — then requires the unedited tree to come back green.
//
// The walk itself lives in `_import_graph.ts` and is shared with
// `check_check_reachability.ts`, which asks the same question ("what can a
// request reach") about a different set of modules. Two copies of that
// derivation would agree today and drift the first time either guard's
// resolver was fixed.
import { readFileSync } from "fs";
import path from "path";

import { code, reachable, walk } from "./_import_graph";

const ROOT = process.cwd();
const LIB = path.join(ROOT, "lib");
const ENTRY = path.join(LIB, "intelligence", "pipeline.ts");

/** The answer-bearing sources, each with why it answers the question.
 *  A PROPERTY per source, not a list of files that happen to be bad today. */
const ANSWER_SOURCES: { pattern: RegExp; what: string }[] = [
  { pattern: /profileLeakIndex/,
    what: "the full profile corpus: up to 40 real winning project titles per fund" },
  { pattern: /__recallSet/,
    what: "the answer key itself — description to the instrument that company won" },
  { pattern: /\bprofile_text\b/,
    what: "instrument_profiles.profile_text — the text the leak index is built from" },
  { pattern: /\bsample_project_titles\b|\bsampleProjectTitles\b/,
    what: "real award titles, already loaded onto DbInstrument and read by nothing" },
  { pattern: /public_funding_events/,
    what: "the award table the ground truth is drawn from" },
  { pattern: /\bsatr_staging\b/,
    what: "beneficiary_name on every row" },
];

// ════════════════════════════════════════════════════════════════════════════
// PROPERTY 2 — DERIVATION, NOT NAMES
// ════════════════════════════════════════════════════════════════════════════
//
//   A COLUMN COMPUTED FROM THE AWARD TABLES MAY REACH THE MODEL-FACING ROW
//   ONLY IF IT CANNOT BE MOVED BY THE FOUNDER'S OWN AWARD.
//
// Two things have to be derived rather than listed for that to hold for a
// column added next year by somebody who never reads this file.
//
// ── WHICH COLUMNS ARE COMPUTED FROM AWARDS ────────────────────────────────
// Read from the pass that computes them. `populate_funding_instruments.py`
// aggregates `funding_instruments` out of `public_funding_events` and names
// `BUILT_COLUMNS` — "every column this pass DERIVES from the events corpus" —
// for its own reasons: the INSERT reads it, and so does the snapshot that
// protects everything NOT on it. A column absent from that tuple is not
// written at all, so a new award-derived column is in this check's input on the
// day it is created and nobody has to remember this file exists.
//
// ── WHICH OF THEM ARE STATISTICS OVER WHO WON ─────────────────────────────
// THE BENEFICIARY-SWAP TEST, and it is a test rather than an opinion:
//
//     Replace every beneficiary in the award tables with an opaque token
//     unique to that beneficiary — same awards, same amounts, same dates, same
//     granting authorities, same notified scheme codes, no identity and no
//     attributes. Re-run the pass. Does the column's value change?
//
//   NO  -> it is a fact about the AWARD or the GRANTOR. Amounts, counts, dates,
//          totals, the body that granted it, the regime it was notified under.
//          A founder cannot recognise themselves in it, so it carries no answer.
//   YES -> it is a statistic over WHO WON: their region, their sector, how many
//          of them there were like this founder. A founder CAN recognise
//          themselves in it, and a row selected because the founder matches it
//          was selected by reading the answer key in aggregate.
//
// The test decides `company_count` the right way round, which is why it is
// stated over identity AND attributes: distinct beneficiaries stay distinct
// under the swap, so a count of them is an award fact, while their regions and
// sectors are gone, so a plurality over those is not.
//
// ── AND THE ONE WAY A BENEFICIARY STATISTIC MAY STILL BE SHOWN ────────────
// The ETL had already reached this distinction and built the remedy, under a
// different name. `populate_funding_instruments.py` resolves a RECALL HOLDOUT
// and passes it to exactly the columns that fail the swap test, with the reason
// written out: "The holdout removes only the VOTE, never the row: event counts,
// award percentiles, totals and every published corpus statistic are untouched,
// because those are descriptions and are not graded." Its `--signals-only` mode
// names that set of columns a second time, so the check reads it there.
//
// So a column that fails the swap test may still reach a row when the pass
// computes it on the holdout — the companies in the recall sets are absent from
// the statistic, so the founder being replayed cannot be in it, and the number
// we grade ourselves on cannot have come from the award we are predicting. The
// check does not take that on the declaration's word: it verifies the claim
// against the ETL's own holdout column set, so declaring `held-out` for a
// column the pass does not hold out is red.
//
// STATED HONESTLY. The holdout protects THE MEASUREMENT. A real founder in
// production is in no recall set, so their own award does count toward these
// columns; what the holdout guarantees is that a recall number is not the
// answer key read back to us. That is the claim it can support and it is not
// the same as "no founder's award influences this row".
//
// ── WHAT COUNTS AS REACHING ───────────────────────────────────────────────
// `InstrumentRow` is the model-facing row — the object `renderRow` prints and
// `buildPrompt` hands to the selector — so the modules that name that type are
// the ones that build or render it. Any award-derived column read as a property
// in one of them has reached the row's construction. This is deliberately an
// OVER-approximation: it flags a column read only to SCORE with, and that is
// correct rather than tolerated, because ranking on a statistic over who won is
// the same leak as printing one. `peerPrior` is exactly that and is exactly why
// it is held out.
//
// What it does NOT do: it is a property-access scan, so a column reached
// through a computed key (`leaf[k]`) is invisible to it. That is stated rather
// than papered over. No such access exists in these modules today, and the
// anti-vacuity floor below fails the check if the scan ever stops finding the
// columns we know are read.

/** How a column that came out of the award tables is allowed to reach a row. */
type Derivation = "award-fact" | "held-out";

/** Every award-derived column the row-building and row-rendering modules read,
 *  and the swap-test answer for each. Keyed by the ETL's own spelling, so this
 *  and `BUILT_COLUMNS` are one namespace and a rename breaks loudly.
 *
 *  FAIL-CLOSED: a column reaching a row with no entry here is red. This is not
 *  a register of the bad ones — it is the argument, written where the column
 *  arrives, for every one of them. */
const DERIVATION: Record<string, { class: Derivation; why: string }> = {
  // ── Facts about the award, the grantor or the regime. Swap-invariant. ──
  parent_id: { class: "award-fact", why: "which rollup the leaf hangs under" },
  name: { class: "award-fact", why: "the granting body's or programme's own name" },
  country: { class: "award-fact", why: "where the granting authority sits" },
  administering_body: { class: "award-fact", why: "who granted the money" },
  administering_body_share: { class: "award-fact",
    why: "share of this fund's awards made by that body — a fact about the grantor" },
  source_family_bucket: { class: "award-fact", why: "which register the awards came from" },
  capital_type: { class: "award-fact", why: "what kind of capital the awards were" },
  event_count: { class: "award-fact", why: "how many awards, not who received them" },
  total_eur: { class: "award-fact", why: "the sum of the amounts" },
  first_year: { class: "award-fact", why: "when the awards start" },
  last_year: { class: "award-fact", why: "when the awards stop" },
  scheme_code: { class: "award-fact", why: "the notified regime the awards were made under" },
  application_url: { class: "award-fact", why: "the fund's own submission page" },
  scheme_operators: { class: "award-fact", why: "the bodies that disburse under the scheme" },
  award_p25: { class: "award-fact", why: "a percentile of the amounts" },
  award_p50: { class: "award-fact", why: "a percentile of the amounts" },
  award_p75: { class: "award-fact", why: "a percentile of the amounts" },
  award_n: { class: "award-fact", why: "how many priced awards stand behind those percentiles" },
  intensity_p50: { class: "award-fact", why: "grant over project cost — two amounts" },
  intensity_n: { class: "award-fact", why: "how many projects stand behind that ratio" },

  // ── Statistics over WHO WON. Swap-variant, so the holdout is the licence. ──
  sector_mix: { class: "held-out",
    why: "a distribution over the RECIPIENTS' sectors, and the founder answers `sector`. " +
      "It reaches the prompt on nearly every row as fundDescriptor's `mostly X` clause" },
  delivery_region: { class: "held-out",
    why: "a plurality over the RECIPIENTS' NUTS regions, and the founder answers `region`. " +
      "It reaches the prompt as the token distinguishRowNames appends to a same-name sibling" },
};

/** The ETL pass that derives instrument columns from the events corpus. */
const ETL_PASS = path.resolve(
  ROOT, "..", "..", "ETL", "events", "load", "populate_funding_instruments.py");

const camelOf = (col: string) => col.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Every column the events pass derives, from the pass's own tuple. */
function builtColumns(py: string): string[] {
  const m = /BUILT_COLUMNS\s*=\s*\(([\s\S]*?)\)/.exec(py);
  return m ? [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]) : [];
}

/** The columns that pass computes on the recall holdout, from the same file.
 *  `--signals-only` exists to refresh exactly these and nothing else, so its
 *  tuple IS the pass's statement of which columns the holdout touches. */
function heldOutColumns(py: string): string[] {
  const m = /if args\.signals_only:[\s\S]{0,600}?cols\s*=\s*\(([\s\S]*?)\)/.exec(py);
  return m ? [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]) : [];
}

/** Award-derived columns read as a property by a module that builds or renders
 *  the model-facing row. */
function reachedColumns(
  modules: { file: string; src: string }[], cols: string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { file, src } of modules) {
    if (!/\bInstrumentRow\b/.test(src)) continue;
    for (const c of cols) {
      if (!new RegExp(`\\.(${c}|${camelOf(c)})\\b`).test(src)) continue;
      out.set(c, [...(out.get(c) ?? []), file]);
    }
  }
  return out;
}

/** The whole property, over inputs the caller supplies — so PROVE can hand it
 *  a tree with the new column genuinely added instead of a description of one. */
function auditDerivation(
  py: string, modules: { file: string; src: string }[],
  declared: Record<string, { class: Derivation; why: string }>,
): { findings: string[]; reached: Map<string, string[]>; built: number; heldOut: string[] } {
  const built = builtColumns(py);
  const heldOut = heldOutColumns(py);
  const reached = reachedColumns(modules, built);
  const findings: string[] = [];
  for (const [col, where] of [...reached].sort()) {
    const d = declared[col];
    const at = where.map((f) => path.relative(ROOT, f)).join(", ");
    if (!d) {
      findings.push(
        `  ${col}\n      is derived from the award tables (BUILT_COLUMNS) and is read by ${at}\n` +
        `      but no derivation is declared for it`);
      continue;
    }
    if (d.class === "held-out" && !heldOut.includes(col)) {
      findings.push(
        `  ${col}\n      is declared "held-out" — "${d.why}" — but ${path.basename(ETL_PASS)}\n` +
        `      does not compute it on the recall holdout (its holdout set is ` +
        `${heldOut.join(", ") || "empty"})`);
    }
  }
  // A declaration for a column nothing reads is a claim about a leak that does
  // not exist, and a table of those is how the next reader stops believing any
  // of it. So the table is exactly the live surface, in both directions: it
  // grows in the commit that starts reading a column and shrinks in the commit
  // that stops.
  for (const col of Object.keys(declared)) {
    if (reached.has(col)) continue;
    findings.push(
      `  ${col}\n      is declared here — "${declared[col].why}" — but no module that ` +
      `builds or renders\n      a row reads it${built.includes(col) ? "" : ", and the events pass no longer derives it"}. ` +
      `The declaration is stale: drop it.`);
  }
  return { findings, reached, built: built.length, heldOut };
}

function main() {
  const files = walk(LIB);
  const known = new Set(files);
  if (!known.has(ENTRY)) {
    console.error(`check_answer_not_reachable: cannot find the entry point ${ENTRY}`);
    process.exit(1);
  }

  const inPath = reachable([ENTRY], known, ROOT);
  const findings: string[] = [];
  for (const f of [...inPath].sort()) {
    const src = code(readFileSync(f, "utf8"));
    for (const { pattern, what } of ANSWER_SOURCES) {
      if (pattern.test(src)) {
        findings.push(`  ${path.relative(process.cwd(), f)}\n      names ${what}`);
      }
    }
  }

  // Anti-vacuity: a check that reaches nothing reports green forever. The
  // request path is a large graph; if it collapses to a handful of modules the
  // resolver has broken and the result means nothing.
  if (inPath.size < 20) {
    console.error(`check_answer_not_reachable: FAILED — the import graph resolved to ` +
      `only ${inPath.size} module(s) from ${path.relative(process.cwd(), ENTRY)}. ` +
      `That is not the memo path; the resolver is broken and a green result here ` +
      `would be meaningless.`);
    process.exit(1);
  }

  if (process.env.PROVE) {
    console.log(`  PROVE: ${inPath.size} modules reachable from the request path`);
    console.log(`  PROVE: planting a reference makes this red — the check reads NAMES,`);
    console.log(`         so adding \`sampleProjectTitles\` to any of them fails the build`);
  }

  if (findings.length) {
    console.error(`\ncheck_answer_not_reachable: FAILED — ${findings.length} module(s) ` +
      `on the memo path name an answer-bearing source:\n`);
    for (const f of findings) console.error(f);
    console.error(`\nA founder's request must not be able to read what that founder won.`);
    console.error(`These sources exist for measurement and for the leak guard, neither of`);
    console.error(`which runs a request. If a fund fact is genuinely needed on the page,`);
    console.error(`take it from a store with no beneficiary, award or title column —`);
    console.error(`eligibility_gates and eligibility_clauses are safe by construction.`);
    process.exit(1);
  }

  // ── PROPERTY 2 ───────────────────────────────────────────────────────────
  let py: string;
  try { py = readFileSync(ETL_PASS, "utf8"); } catch {
    console.error(`check_answer_not_reachable: FAILED — cannot read the events pass at ` +
      `${path.relative(ROOT, ETL_PASS)}. Which columns are derived from award history is ` +
      `read from that file; without it this check cannot ask the question and green ` +
      `would mean nothing.`);
    process.exit(1);
  }
  const modules = files.map((f) => ({ file: f, src: code(readFileSync(f, "utf8")) }));
  const audit = auditDerivation(py, modules, DERIVATION);

  // Anti-vacuity, three ways. Each of these is a parse of somebody else's file,
  // and a parse that silently returns nothing turns this half of the check into
  // a green light forever.
  const vacuous =
    audit.built < 20 ? `the events pass declares only ${audit.built} derived column(s) — BUILT_COLUMNS did not parse`
    : audit.heldOut.length < 2 ? `the events pass names ${audit.heldOut.length} holdout column(s) — its --signals-only set did not parse`
    : audit.reached.size < 10 ? `only ${audit.reached.size} award-derived column(s) are read by any row-building module — the property scan did not parse`
    : "";
  if (vacuous) {
    console.error(`check_answer_not_reachable: FAILED — ${vacuous}. A green result on ` +
      `derivation would be meaningless.`);
    process.exit(1);
  }

  if (process.env.PROVE) {
    // THE REAL FAILURE, not a description of it. Somebody adds a column that is
    // a plurality over the recipients' COUNTRY OF INCORPORATION — an obvious
    // thing to want, in a table nobody reading this file has read — wires it
    // through the pass, and reads it while building a row. Three edits, applied
    // to the real files, and the check has to come back red on all three
    // variants below.
    const NEW = "top_recipient_country";
    const withColumn = py.replace(/(BUILT_COLUMNS\s*=\s*\()/, `$1\n    "${NEW}",`);
    if (withColumn === py) {
      console.error(`  PROVE FAILED: could not plant a column in BUILT_COLUMNS — the parse ` +
        `this check depends on has moved.`);
      process.exit(1);
    }
    const rowModule = modules.find((m) => /\bInstrumentRow\b/.test(m.src)
      && new RegExp(`\\.(delivery_region|${camelOf("delivery_region")})\\b`).test(m.src));
    if (!rowModule) {
      console.error(`  PROVE FAILED: no module both names InstrumentRow and reads a known ` +
        `award-derived column, so there is nothing to plant into.`);
      process.exit(1);
    }
    const planted = modules.map((m) => m === rowModule
      ? { ...m, src: `${m.src}\nconst _plant = (leaf: DbInstrument) => leaf.${camelOf(NEW)};\n` }
      : m);

    // (a) derived from awards, read while building a row, undeclared.
    const a = auditDerivation(withColumn, planted, DERIVATION);
    // (b) declared, but as a beneficiary statistic the pass does not hold out.
    const b = auditDerivation(withColumn, planted, {
      ...DERIVATION,
      [NEW]: { class: "held-out", why: "a plurality over the recipients' country" },
    });
    // (c) the tree as it stands, which must be clean or (a) and (b) prove nothing.
    const c = auditDerivation(py, modules, DERIVATION);
    const names = (r: { findings: string[] }) => r.findings.join("\n");
    const bad: string[] = [];
    if (!names(a).includes(NEW)) bad.push(`(a) an UNDECLARED award-derived column was not caught`);
    if (!names(b).includes(NEW)) bad.push(`(b) a column declared "held-out" that the pass does not hold out was not caught`);
    if (c.findings.length) bad.push(`(c) the unedited tree is already red, so (a) and (b) prove nothing:\n${names(c)}`);
    if (bad.length) {
      console.error(`  PROVE FAILED on derivation:\n${bad.map((s) => `    ${s}`).join("\n")}`);
      process.exit(1);
    }
    console.log(`  PROVE: ${audit.built} award-derived column(s) in the events pass, ` +
      `${audit.reached.size} of them read while building or rendering a row`);
    console.log(`  PROVE: planting "${NEW}" in BUILT_COLUMNS and reading it in ` +
      `${path.relative(ROOT, rowModule.file)} makes this RED —`);
    console.log(`         undeclared (a), and still red when declared "held-out" while the ` +
      `pass does not hold it out (b).`);
    console.log(`  PROVE: the unedited tree is green (c), so the two reds are the plant.`);
  }

  if (audit.findings.length) {
    console.error(`\ncheck_answer_not_reachable: FAILED — ${audit.findings.length} ` +
      `award-derived column(s) reach the model-facing row without a sound derivation:\n`);
    for (const f of audit.findings) console.error(f);
    console.error(`\nA value computed from the award tables may reach a row only if the ` +
      `founder's own\naward cannot move it. Apply the beneficiary-swap test in the header: ` +
      `strip every\nrecipient's identity and attributes from the award tables, keep the ` +
      `amounts, dates and\ngranting authorities, re-derive. If the value changes it is a ` +
      `statistic over WHO WON,\nand the only way it may be shown is for ` +
      `${path.basename(ETL_PASS)} to compute it on the\nrecall holdout — the same remedy ` +
      `emit_peer_prior.py already applies to the peer rank.`);
    process.exit(1);
  }

  console.log(`check_answer_not_reachable: ok — ${inPath.size} modules reachable from ` +
    `the request path, none names an answer-bearing source ` +
    `(${ANSWER_SOURCES.length} sources checked); ` +
    `${audit.reached.size} of the events pass's ${audit.built} derived column(s) reach a ` +
    `row, every one classified, and the ${audit.heldOut.length} the holdout covers are the ` +
    `ones that need it.`);
}

main();
