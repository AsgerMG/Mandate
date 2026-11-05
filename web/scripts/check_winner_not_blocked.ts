// A screen may not remove a fund from a company that WON it.
//
// ── The defect class ──────────────────────────────────────────────────────
// The worst thing this codebase can do is hide a fund from someone who
// qualifies for it. `check_comparator_admits.ts` watches one route to that — a
// comparator that can reject an answer it can never accept. This watches the
// other, and the more dangerous one, because it is not a coding error at all:
// a screen that is CORRECTLY implemented over a WRONGLY MODELLED territory.
//
// A territorial screen removes an instrument whose own notification declares a
// region the applicant is not in. It is the one address-derived mechanism Rule
// Zero supports, since `catchment_source = ec_case_register` is the EC State
// aid case register's own declared region rather than an inference from where
// our award history happens to sit. It is also, measured, wrong for a
// structural reason:
//
//   A TERRITORIAL REMIT ATTACHES TO THE ESTABLISHMENT CARRYING OUT THE
//   PROJECT, NOT TO THE COMPANY'S REGISTERED SEAT.
//
// A company registered in one region won a scheme delivered by a body whose
// remit covers another, because that is where the work was done. Asking a
// founder for their address answers a different question from the one the
// body's remit asks, and no register we hold records the project site. So the
// screen removes the correct answer, silently, from someone it has proof
// qualifies.
//
// ── The property ──────────────────────────────────────────────────────────
//   No pair (company, instrument) that the award register records as a WIN may
//   be excluded by our own territorial screen.
//
// Stated over any pair, any instrument, any declared region. It names no fund,
// no country, no sector and no body: the population is the whole answer key,
// the region test is the product's own `regionsOverlap`, and an instrument
// loaded tomorrow is judged by the same rule with no edit here.
//
// ── Two things the derivation must not do ─────────────────────────────────
// CIRCULARITY. A founder's region is used ONLY where it was recovered from a
// DIFFERENT scheme's award (`regionSource = other_scheme`). The region on the
// very award under test was read off the answer, so judging the answer by it
// would grade the screen on a region the answer supplied.
//
// SILENCE IS NOT EXCLUSION. An instrument the register declares no catchment
// for is UNKNOWN, never blocked. A screen that removed everything the case
// register is silent about would remove 61% of the corpus on no evidence at
// all. Those pairs are counted and reported separately, never as passes.
//
// ── Why this is a RATCHET and not a pass at zero ──────────────────────────
// The count is 15 today and has been since it was first measured (workstream
// CJ, `project-mgmt/findings/address_door_wsCJ.md` §4, reproduced by
// `scripts/_wscj_screen.ts` §1 against live Postgres). A guard that reds the
// build on the day it lands gets switched off, and a guard that calls 15
// acceptable is a lie about 15 founders. So the debt is PINNED at today's
// measurement and may only fall. See BLOCKED_CEILING.
//
// ── Hermetic ──────────────────────────────────────────────────────────────
// Committed artifacts only: the active answer key (through `recallSet.ts`, the
// one loader for it) and `officialCatchments.generated.json`. No DATABASE_URL,
// no VOYAGE_KEY, no ANTHROPIC_API_KEY, no network, well under a second. That
// is not a convenience — a guard that needs a credential is a guard that skips
// on CI and on every fresh worktree, which is the failure `loadEnv.ts` records
// as a green build with the floors never evaluated.
//
//   cd website/frontend && npx tsx scripts/check_winner_not_blocked.ts
import { readFileSync } from "node:fs";
import path from "node:path";

import { regionsOverlap } from "../lib/intelligence/regions.generated";
import { loadRecallSet, type RecallRow } from "./recallSet";

/** The artifact this check watches, named literally so the tie between the
 *  guard and the file it guards is visible from the source rather than
 *  inferable through two imports. `check_artifact_reachability.py` looks for
 *  exactly this; `scripts/emit_official_catchments.ts` produces it. */
const WATCHES = "officialCatchments.generated.json";

/** ── DEBT, NOT A TARGET ────────────────────────────────────────────────────
 *
 *  15 verified winners are excluded by the territorial screen today. That is a
 *  defect this repo has already decided not to ship a screen on top of — it is
 *  why the screen is NOT SHIPPED — and it is recorded here so that the number
 *  cannot rise without somebody seeing it.
 *
 *  IT MAY FALL, NEVER RISE. Raising this line is not a fix. It is a record that
 *  a founder was newly cut off from a fund they had already won, and that
 *  somebody chose to accept it. The fixes that legitimately lower it are: a
 *  corrected catchment encoding in `ETL/terms/encode_declared_catchment.py`, or
 *  a corrected attribution in the answer key. Both are edits to the data the
 *  screen is wrong ABOUT; neither is an edit to this constant alone.
 *
 *  Measured 2026-08-09 over `__recallSetDoors.json`: 15 of 582 = 2.6%. */
const BLOCKED_CEILING = 15;

/** ── The anti-vacuity pin ──────────────────────────────────────────────────
 *
 *  `blocked` can be driven to zero two ways: by fixing the encoding, or by
 *  emptying an input. Deleting catchments from the artifact, pointing the check
 *  at a smaller answer key, or breaking the join all produce a serene `0
 *  blocked` — the exact failure mode that once published a confident green over
 *  0 instruments.
 *
 *  So the POPULATION is floored as well as the verdict. Both inputs are
 *  committed artifacts, so this is a pin under two versioned files rather than
 *  a claim about the moving corpus, and a deliberate rebuild that moves it is
 *  the review moment the pin exists to force. Set just under today's 582.
 *
 *  Lowering it to make a run pass is the one edit that defeats the check
 *  entirely. */
const MIN_TESTED = 550;

interface Artifact {
  generatedAt?: string;
  official?: number;
  instruments?: number;
  catchments?: Record<string, string[]>;
}

/** The founder's region, taken ONLY where it came from a different scheme's
 *  award — see CIRCULARITY above. */
const leakFreeRegion = (r: RecallRow): string | undefined =>
  r.regionSource === "other_scheme" ? (r.region || undefined) : undefined;

/** Does an officially declared catchment admit a founder in `region`?
 *
 *  `undefined` means the official source does not say, and callers MUST keep
 *  those. The region test is `regionsOverlap`, the same function the product's
 *  `region_within` comparator uses, so a change to how NUTS ids nest changes
 *  this verdict with no edit here. */
function admits(catchment: string[] | undefined, region: string): boolean | undefined {
  if (!catchment || !catchment.length) return undefined;
  return catchment.some((c) => regionsOverlap(c, region));
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

function main() {
  const file = path.join(process.cwd(), "lib", "intelligence", WATCHES);
  let artifact: Artifact;
  try {
    artifact = JSON.parse(readFileSync(file, "utf8")) as Artifact;
  } catch (e) {
    // Not a fallback. An unreadable input here means the check proved nothing,
    // and "proved nothing" must never share a colour with "passed".
    console.error(`\nFAIL — could not read ${WATCHES} at ${file}: `
      + `${e instanceof Error ? e.message : String(e)}.\n`
      + `  Re-cut it with scripts/emit_official_catchments.ts. This check has\n`
      + `  asserted nothing about whether a screen blocks a verified winner.`);
    process.exit(1);
  }
  const catchments = artifact.catchments ?? {};

  const { file: setFile, rows } = loadRecallSet("check_winner_not_blocked");

  console.log(`watching ${WATCHES} — ${Object.keys(catchments).length} of `
    + `${artifact.instruments ?? "?"} instruments carry an officially declared `
    + `catchment, cut at ${artifact.generatedAt ?? "(unknown)"}`);

  let tested = 0, blocked = 0, silent = 0, noRegion = 0;
  const names: string[] = [];
  for (const r of rows) {
    const region = leakFreeRegion(r);
    if (!region) { noRegion++; continue; }
    const verdict = admits(catchments[r.instrument], region);
    if (verdict === undefined) { silent++; continue; }
    tested += 1;
    if (verdict) continue;
    blocked += 1;
    // NAMED, because a rate hides which ones. Every line here is a founder the
    // screen would tell "this is not your programme" about a programme they
    // demonstrably won.
    names.push(`${r.name} (${r.country}, ${region}) -> ${r.instrument}`);
  }

  console.log(`answer key ${setFile}: ${rows.length.toLocaleString()} pairs`);
  console.log(`  no leak-free region, cannot be judged        ${noRegion}`);
  console.log(`  register silent on the fund, KEPT not blocked ${silent}`);
  console.log(`  testable: leak-free region + official catchment ${tested} `
    + `(floor ${MIN_TESTED})`);
  console.log(`  VERIFIED WINNERS THE SCREEN WOULD BLOCK      ${blocked} `
    + `${pct(blocked, tested)} (ceiling ${BLOCKED_CEILING})`);
  for (const n of names) console.log(`      ${n}`);

  // NON-VACUITY, before any verdict. In order of what it tells you.
  if (!Object.keys(catchments).length) {
    console.error(`\nFAIL — ${WATCHES} declares no catchment for any instrument. `
      + `Nothing\n  could be screened, so nothing could be shown to block a winner. `
      + `Re-cut it\n  with scripts/emit_official_catchments.ts.`);
    process.exit(1);
  }
  if (!rows.length) {
    console.error(`\nFAIL — the answer key ${setFile} holds no pairs, so there is no `
      + `verified\n  winner to protect. This check measured nothing.`);
    process.exit(1);
  }
  if (tested < MIN_TESTED) {
    console.error(`\nFAIL — only ${tested} pair(s) could be tested, under the floor of `
      + `${MIN_TESTED}.\n`
      + `  A screen guard that runs out of population reports a clean zero and\n`
      + `  proves nothing. Either the catchment cut, the answer key or the join\n`
      + `  between them has shrunk. Lowering this floor is not a fix.`);
    process.exit(1);
  }
  if (blocked > BLOCKED_CEILING) {
    console.error(`\nFAIL — ${blocked} companies the register says WON a fund are `
      + `excluded from it\n  by the territorial screen, above the ceiling of `
      + `${BLOCKED_CEILING}. Each one is a\n`
      + `  founder hidden from a programme they qualify for, which is the worst\n`
      + `  thing this product can do.\n\n`
      + `  A territorial remit attaches to the establishment carrying out the\n`
      + `  project, not to the registered seat, and no register we hold records\n`
      + `  the project site. Fix the catchment encoding or the attribution.\n`
      + `  RAISING THE CEILING IS NOT A FIX — it is a record that somebody\n`
      + `  accepted the new exclusions.`);
    process.exit(1);
  }
  console.log(`\nPASS — no verified winner is newly blocked; the standing debt of `
    + `${BLOCKED_CEILING}\n  has not risen. It is debt, not a target: it is why the `
    + `territorial screen\n  is not shipped.`);
}

main();
