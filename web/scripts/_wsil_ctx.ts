/**
 * wsIL — what the comparable-company search would be told, and what it costs.
 *
 * FREE, OFFLINE, and REPRODUCIBLE. No credentials, no database, no network, no
 * model call. It renders ONE string per founder per arm out of
 * `comparableSearchContext` -- the function production itself calls -- and
 * diffs them. A second copy of that block here would be grading a prompt no
 * founder is served, which is why it is exported rather than reimplemented.
 *
 *   npx tsx scripts/_wsil_ctx.ts
 *
 * ── What it is for ────────────────────────────────────────────────────────
 * The arm is a change to a PAID stage, so the pre-registration has to say what
 * would move before anything is bought. The answerable half of that is free:
 * does the constructed context actually differ, on how many of the held-out
 * 897, and in what way. Everything downstream of the string -- which companies
 * a search returns, which of them DB-match, which channels that unions into --
 * costs money and is not measured here or guessed at.
 *
 * ── The population ────────────────────────────────────────────────────────
 * The funnel's own draw: held out, described, one founder per company, sorted
 * by name. The same three restrictions ten harnesses in this directory apply,
 * and none of them touches Postgres.
 */
// Pinned OFFLINE deliberately, the way `check_answer_in_prompt` is: every
// module below reads its credentials lazily, so destroying them here is what
// makes the header's claim true rather than merely stated. NOT `NO_PG=1` --
// that flag ALSO switches the ranker to a lexical fallback and serves a
// snapshot, neither of which this run wants or would notice.
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import { COMPARABLE_FIELDS, ANSWER_TELLS_COMPARABLE } from "../lib/intelligence/comparableFacts";
import { comparableSearchContext } from "../lib/intelligence/research";
import { ANSWER_LABEL, type EligibilityAnswers, type IntelligenceRequest } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { isDescribed, loadRecallSet, type RecallRow } from "./recallSet";

const policy = founderPolicyFromEnv();
const { file, rows } = loadRecallSet("wsIL context diff");

// Held out, described, one founder per company, by name.
const seen = new Set<string>();
const population = [...rows.filter((r) => r.split === "holdout" && isDescribed(r))]
  .sort((a, b) => a.name.localeCompare(b.name))
  .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));

interface Case {
  name: string;
  control: string;
  treatment: string;
  added: string[];
  eligibility: EligibilityAnswers;
}

const cases: Case[] = population.map((r: RecallRow) => {
  const f = founderIntake(r, policy);
  // Exactly the shape the route hands the pipeline. `companyType` is resolved
  // from the profile signal inside `runIntelligence` and no harness can set
  // it, so it is absent here as it is absent on a replay.
  const req = {
    company: f.company,
    country: f.country,
    description: f.opts.description,
    eligibility: f.eligibility,
  } as IntelligenceRequest;
  const control = comparableSearchContext(req, "description");
  const treatment = comparableSearchContext(req, "answers");
  const controlLines = new Set(control.split("\n"));
  return {
    name: f.company,
    control,
    treatment,
    added: treatment.split("\n").filter((l) => l.startsWith("- ") && !controlLines.has(l)),
    eligibility: f.eligibility,
  };
});

const n = cases.length;
const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`;

console.log(`wsIL — comparable-search context, control vs treatment`);
console.log(`  set        ${file}`);
console.log(`  population ${n} held-out described founders, one per company`);
console.log(`  policy     identity=${policy.identity} answers=${policy.answers} ` +
  `own-history=${policy.ownHistory} capital=${policy.capital} ` +
  `consortium=${policy.consortium ?? "none (instant path)"}`);

const differ = cases.filter((c) => c.control !== c.treatment);
console.log(`\n  the context DIFFERS on ${differ.length} of ${n} (${pct(differ.length)})`);

// ── Per field: does it reach the prompt, and does it SEPARATE anyone ───────
//
// The second column is the one that decides whether this arm can do anything.
// A line present on every founder with the same value is a constant sentence:
// it lengthens the prompt for all 897 and cannot make any founder's search
// differ from any other founder's. The harness PINS `useOfFunds` for the whole
// population and WITHHOLDS `developmentStage` and `fteBand` from all of it, so
// this table is where a treatment that looks like four new fields turns out to
// be fewer.
console.log(`\n  per admitted field, on this population:\n`);
console.log(`    ${"field".padEnd(20)} ${"reaches".padStart(9)} ${"distinct values".padStart(16)}  disposition`);
for (const f of COMPARABLE_FIELDS) {
  const vals = cases.map((c) => JSON.stringify((c.eligibility as Record<string, unknown>)[f]))
    .filter((v) => v !== undefined && v !== "undefined" && v !== "[]");
  const distinct = new Set(vals).size;
  const disposition = vals.length === 0 ? "ABSENT for everyone — cannot be measured here"
    : distinct === 1 ? "CONSTANT — reaches the prompt, separates nobody"
    : "varies";
  console.log(`    ${f.padEnd(20)} ${pct(vals.length).padStart(9)} ${String(distinct).padStart(16)}  ${disposition}`);
}

const refused = (Object.keys(ANSWER_TELLS_COMPARABLE) as (keyof EligibilityAnswers)[])
  .filter((f) => !ANSWER_TELLS_COMPARABLE[f].tells);
console.log(`\n  ${refused.length} intake field(s) the property REFUSES, so they reach no arm: ` +
  `${refused.join(", ")}`);

// ── How much is added, and how much of it is the same on every founder ─────
const addedCounts = cases.map((c) => c.added.length);
const chars = cases.map((c) => c.treatment.length - c.control.length);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`\n  added lines per founder   min ${Math.min(...addedCounts)} ` +
  `median ${median(addedCounts)} max ${Math.max(...addedCounts)} mean ${mean(addedCounts).toFixed(2)}`);
console.log(`  added characters          median ${median(chars)} mean ${mean(chars).toFixed(0)} ` +
  `(control median ${median(cases.map((c) => c.control.length))} chars)`);

const lineFreq = new Map<string, number>();
for (const c of cases) for (const l of c.added) lineFreq.set(l, (lineFreq.get(l) ?? 0) + 1);
const universal = [...lineFreq.entries()].filter(([, k]) => k === n).map(([l]) => l);
console.log(`\n  ${universal.length} added line(s) are IDENTICAL on all ${n} founders:`);
for (const l of universal) console.log(`    ${l}`);

const varying = cases.map((c) => c.added.filter((l) => lineFreq.get(l) !== n).length);
const noSignal = varying.filter((k) => k === 0).length;
console.log(`\n  founder-SEPARATING added lines   median ${median(varying)} ` +
  `mean ${mean(varying).toFixed(2)}`);
console.log(`  founders whose added block is the SAME as everyone else's: ` +
  `${noSignal} of ${n} (${pct(noSignal)})`);

// ── One rendered pair, so the diff is readable rather than tabulated ───────
const example = differ.find((c) => c.added.some((l) => lineFreq.get(l) !== n)) ?? differ[0];
if (example) {
  console.log(`\n  ── ${example.name}: what the treatment adds ──`);
  for (const l of example.added) {
    console.log(`    + ${l}${lineFreq.get(l) === n ? "   [same on all " + n + "]" : ""}`);
  }
}

// ── And the same for a real founder, which is the case that ships ─────────
//
// The harness cannot answer `developmentStage` or `fteBand` for anybody and
// pins `useOfFunds` for everybody, so what it can measure is a STRICT SUBSET
// of what a real first screen sends. This prints the difference between the
// two so the pre-registration cannot quietly claim the harness measured the
// product's treatment.
const realFirstScreen: EligibilityAnswers = {
  sector: "energy_cleantech",
  useOfFunds: ["capex_plant_equipment"],
  fteBand: "10-49",
  ticketBand: "b2m5_15m",
  developmentStage: "pilot_customers",
  entityCountries: ["Denmark"],
  region: "DK01",
};
const realReq = {
  company: "A real founder", country: "Denmark",
  description: "We build X.", eligibility: realFirstScreen,
} as IntelligenceRequest;
const realAdded = comparableSearchContext(realReq, "answers").split("\n")
  .filter((l) => l.startsWith("- "));
const harnessFields = new Set(COMPARABLE_FIELDS.filter((f) =>
  cases.some((c) => (c.eligibility as Record<string, unknown>)[f] !== undefined)));
console.log(`\n  ── a real first screen sends ${realAdded.length} admitted line(s) ──`);
for (const l of realAdded) console.log(`    + ${l}`);
console.log(`\n  of the ${COMPARABLE_FIELDS.length} admitted fields, the harness can put a value on ` +
  `${harnessFields.size}: ${[...harnessFields].join(", ")}`);
console.log(`  it can put NO value on: ` +
  `${COMPARABLE_FIELDS.filter((f) => !harnessFields.has(f)).join(", ")}`);
console.log(`\n  (labels are ANSWER_LABEL's, so this run follows a reworded question: ` +
  `${COMPARABLE_FIELDS.map((f) => ANSWER_LABEL[f]).slice(0, 3).join("; ")}; ...)`);
