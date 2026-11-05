// wsHA — DOES OUR OWN MACHINERY HAVE AN OPINION ABOUT WHICH DOOR?
//
// `_wsha_doors.ts` isolates the pairs and `_wsha_report.ts` asks which COLUMNS
// vary inside them. This asks the question one step further in, and it is the
// one with a defect attached to it:
//
//   THE ENCODED GATES AND THE FOUR PER-LEAF SCORERS ALREADY RUN ON EVERY ONE
//   OF THESE PAIRS. DO THEY SEPARATE THE TWO DOORS FOR THIS PARTICULAR
//   FOUNDER, AND IF THEY DO, WHY WAS THE OTHER DOOR STILL THE ONE SHOWN?
//
// If the gates are FLAT between the won door and the door we showed, then no
// amount of downstream work reaches the choice and the answer has to come from
// content or from the intake. If the gates DIFFER and the wrong door was still
// shown, the choice is being made somewhere that is not reading them, which is
// a different finding and a much more actionable one.
//
// ── WHY THIS IS A THIRD SCRIPT AND NOT A FLAG ON THE FIRST ─────────────────
// `_wsha_doors.ts` costs one Voyage embedding per founder and ~45 minutes over
// the funnel's draw. Everything here is DERIVABLE from its output plus the
// corpus: `founderIntake` is deterministic and offline, and the pair
// instruments are named in the dump, so one gate hydration covers all of them.
// Re-deriving a founder's answers is free; re-embedding their description is
// not. A question asked after the fact must not cost the run again.
//
// FREE. Postgres reads and no network beyond them. ANTHROPIC_API_KEY is
// deleted before import. NO PAID MODEL CALL, and no Voyage call either.
//
//   IN=/tmp/wsha_doors.json npx tsx scripts/_wsha_gates.ts
//
// @ws-active until 2026-09-30
import { readFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("wsha_gates", ["DATABASE_URL", "VOYAGE_KEY"]) === "offline") {
  throw new Error(
    "_wsha_gates: NO_PG is set, which deletes DATABASE_URL and serves the "
    + "committed snapshot instead. The snapshot carries a different gate set "
    + "from the store the product reads, and the whole question here is what "
    + "the SHIPPED gates decide.");
}

import {
  corpusProvenance, type DbInstrument, hydrateDbInstruments, hydrateGatesFor,
  loadDbInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import {
  awardScorer, gateFitScorer, objectiveScorer, regionScorer, registeredPurpose,
} from "../lib/intelligence/shortlist";
import { assessInstrument } from "../lib/intelligence/verdict";
import type { DoorRow, InstrumentSnapshot } from "./_wsha_doors";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { loadRecallSet, reattributeMissingAnswers, type RecallRow } from "./recallSet";

interface Dump {
  meta: Record<string, unknown> & { fingerprint: string; n: number };
  rows: DoorRow[];
  snapshot: InstrumentSnapshot[];
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

/** Two floats are the same OPINION when the sort cannot tell them apart. The
 *  reassignment's own test is `pref(a) === pref(b)` on doubles; this is the
 *  same test with the float noise of five multiplied normalisations taken out,
 *  so a difference reported here is one a reader could act on. */
const SAME = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function main() {
  const src = process.env.IN ?? "/tmp/wsha_doors.json";
  const dump = JSON.parse(readFileSync(src, "utf8")) as Dump;

  // ── THE FOUNDERS, RE-DERIVED RATHER THAN RE-EMBEDDED ─────────────────────
  // Keyed on name AND won instrument: `reattributeMissingAnswers` can rewrite
  // the instrument on a row, so the key has to be built AFTER it runs or a
  // re-attributed founder silently pairs with their own pre-attribution row.
  const { rows: all } = loadRecallSet("wsHA gate separation");
  const corpus0 = loadDbInstruments();
  const inCorpus = new Set(corpus0.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), () => true);
  const byKey = new Map<string, RecallRow>();
  for (const r of fixed.rows) byKey.set(`${r.name}::${r.instrument}`, r);

  const policy = founderPolicyFromEnv();
  const pairs = dump.rows.filter(
    (r) => r.offerable && r.rankAccessible !== null && !r.hit && r.siblingsShown.length > 0);

  console.log("# wsHA — do the encoded gates separate the two doors\n");
  console.log("```");
  console.log(`draw fingerprint    ${dump.meta.fingerprint}`);
  console.log(`corpus              ${corpusProvenance().source} instruments=${corpus0.length}`);
  console.log(`pairs               ${pairs.length}`);
  console.log("```\n");

  const inst = new Map(loadDbInstruments().map((i) => [i.id, i]));

  interface Cnt { n: number; differ: number; favoursWon: number; favoursShown: number }
  const mk = (): Cnt => ({ n: 0, differ: 0, favoursWon: 0, favoursShown: 0 });
  const scorers: Record<string, Cnt> = {
    objective: mk(), award: mk(), region: mk(), gateFit: mk(), COMBINED: mk(),
  };
  let verdictDiffer = 0, verdictSame = 0, bothUnknown = 0, bothOpen = 0;
  let checkedDiffer = 0, blockerDiffer = 0;
  const statusPair = new Map<string, number>();
  const missingRow: string[] = [];
  const actionable: string[] = [];
  const favouredRanks: number[] = [];

  // ── THE REGISTERED PURPOSE, WHICH IS ANSWER-INDEPENDENT ──────────────────
  // Everything else on this page is measured under a replayed founder, and the
  // replay PINS `useOfFunds` to one pair of values for all 897 of them —
  // deliberately, because the only derivation available reads the objective off
  // the scheme being predicted and would let the signal grade itself
  // (`leaf_separation_wsAO.md` §2). So `objectiveScorer` below answers to a
  // constant and cannot be read as its production headroom.
  //
  // This block does not depend on the founder at all. It asks only whether the
  // CORPUS holds a different declared purpose for the two doors — the fact's
  // existence, separated from whether any given founder's answer reaches it.
  let bothPurpose = 0, onePurpose = 0, neitherPurpose = 0;
  let purposeDiffers = 0, articlesDiffer = 0;

  for (const p of pairs) {
    const rec = byKey.get(`${p.company}::${p.won}`);
    if (!rec) { missingRow.push(p.company); continue; }
    const f = founderIntake(rec, policy);
    const won = inst.get(p.won);
    const sib = inst.get(p.siblingsShown[0]);
    if (!won || !sib) { missingRow.push(p.company); continue; }
    const leaves: DbInstrument[] = [won, sib];

    // ── THE VERDICT PRODUCTION'S OWN POOL FILTER COMPUTES ──────────────────
    const aw = assessInstrument(won, f.eligibility as never);
    const as = assessInstrument(sib, f.eligibility as never);
    statusPair.set(`${aw.status} / ${as.status}`,
      (statusPair.get(`${aw.status} / ${as.status}`) ?? 0) + 1);
    if (aw.status === as.status) verdictSame++; else verdictDiffer++;
    if (aw.status === "unknown" && as.status === "unknown") bothUnknown++;
    if (aw.status === "open" && as.status === "open") bothOpen++;
    if (aw.checked !== as.checked) checkedDiffer++;
    if (aw.blockers.length !== as.blockers.length) blockerDiffer++;

    const pw = registeredPurpose(won.id); const ps = registeredPurpose(sib.id);
    if (pw && ps) {
      bothPurpose++;
      if (pw !== ps) articlesDiffer++;
      // The ARTICLES are the fine grain (25(2)(b) against 25(2)(c)); the
      // `useOfFunds` half is the coarse grain, and it is the only half that
      // maps onto a question a founder is actually asked. Counted apart,
      // because a difference the intake vocabulary cannot express is not a
      // difference the founder can state.
      const uf = (s: string) => s.replace(/\s*\(Art\..*$/, "");
      if (uf(pw) !== uf(ps)) purposeDiffers++;
    } else if (pw || ps) onePurpose++;
    else neitherPurpose++;

    // ── THE FOUR PER-LEAF SCORERS THE SIBLING REASSIGNMENT MULTIPLIES ──────
    // `openFitScorer` is the fifth and is neutral by construction here: it
    // reads the adaptive round's judgements, and a replayed founder has none.
    // Restricting each scorer to the two doors changes the normalising
    // constant and not the ORDER between them, which is the only thing this
    // asks about.
    const obj = objectiveScorer(leaves.map((l) => l.id), f.eligibility.useOfFunds);
    const awd = awardScorer(leaves, f.eligibility.ticketBand);
    const reg = regionScorer(leaves, f.eligibility.region);
    const gate = gateFitScorer(leaves, f.eligibility as never);
    const vals: Record<string, [number, number]> = {
      objective: [obj(won.id), obj(sib.id)],
      award: [awd(won), awd(sib)],
      region: [reg(won), reg(sib)],
      gateFit: [gate(won), gate(sib)],
    };
    let prefWon = 1, prefSib = 1;
    for (const [k, [a, b]] of Object.entries(vals)) {
      const c = scorers[k]; c.n++;
      if (!SAME(a, b)) { c.differ++; if (a > b) c.favoursWon++; else c.favoursShown++; }
      prefWon *= a; prefSib *= b;
    }
    const c = scorers.COMBINED; c.n++;
    if (!SAME(prefWon, prefSib)) {
      c.differ++;
      if (prefWon > prefSib) {
        c.favoursWon++;
        // THE ACTIONABLE CASE. Our own reassignment preferred the door the
        // founder won, over the door we put on the page, and the page still
        // showed the other one.
        //
        // The pool rank is what decides between two very different stories.
        // The reassignment is RANK-PRESERVING within a channel: it hands the
        // channel's existing score slots to its leaves in `pref` order, so a
        // leaf preferred over its sibling receives the better of their two
        // slots. If the won door is nonetheless sitting deep in the accessible
        // pool, the preference did not reach the ordering at all — and that is
        // a defect. If it is sitting just above the cut, the preference DID
        // act and something after it (peer precedence, the scheme dedupe, the
        // writer cap) took the row back off the page, which is the mechanism
        // `rank_shape_wsGY.md` §4 already prices at net +3.2 EXACT.
        favouredRanks.push(p.rankAccessible ?? -1);
        if (actionable.length < 25) {
          actionable.push(
            `${p.company} (${p.country}) · pref won=${prefWon.toFixed(4)} `
            + `shown=${prefSib.toFixed(4)} · won door at pool rank `
            + `${p.rankAccessible}/${p.accessibleLen} · ${p.won} OVER ${p.siblingsShown[0]}`);
        }
      } else c.favoursShown++;
    }
  }

  const N = scorers.COMBINED.n;
  console.log("## 1. The encoded verdict on each door, for this founder\n");
  console.log("```");
  console.log(`pairs evaluated                                  ${N}`);
  console.log(`verdict STATUS identical on both doors           ${verdictSame}  ${pct(verdictSame, N)}`);
  console.log(`  ...both "unknown" — no filter could be run     ${bothUnknown}  ${pct(bothUnknown, N)}`);
  console.log(`  ...both "open"                                 ${bothOpen}  ${pct(bothOpen, N)}`);
  console.log(`verdict STATUS differs                           ${verdictDiffer}  ${pct(verdictDiffer, N)}`);
  console.log(`number of filters CHECKED differs                ${checkedDiffer}  ${pct(checkedDiffer, N)}`);
  console.log(`number of BLOCKERS differs                       ${blockerDiffer}  ${pct(blockerDiffer, N)}`);
  console.log("```\n");
  console.log("| verdict pair (WON / SHOWN) | pairs | share |");
  console.log("|---|--:|--:|");
  for (const [k, v] of [...statusPair.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`| ${k} | ${v} | ${pct(v, N)} |`);
  }
  console.log("");

  console.log("## 2. The registered purpose — the corpus alone, no founder in it\n");
  console.log("```");
  console.log(`both doors declare a purpose                     ${bothPurpose}  ${pct(bothPurpose, N)}`);
  console.log(`  ...their GBER ARTICLES differ                  ${articlesDiffer}  ${pct(articlesDiffer, N)}`);
  console.log(`  ...their USE OF FUNDS differ                   ${purposeDiffers}  ${pct(purposeDiffers, N)}`);
  console.log(`      (the coarse half, the one the intake asks)`);
  console.log(`exactly one door declares a purpose              ${onePurpose}  ${pct(onePurpose, N)}`);
  console.log(`neither door declares one                        ${neitherPurpose}  ${pct(neitherPurpose, N)}`);
  console.log("```\n");

  console.log("## 3. Does the shipped sibling reassignment have an opinion\n");
  console.log("| scorer | has an opinion | favours the WON door | favours the SHOWN door |");
  console.log("|---|--:|--:|--:|");
  for (const [k, v] of Object.entries(scorers)) {
    const nm = k === "COMBINED" ? "**COMBINED (the product's `pref`)**" : `\`${k}\``;
    console.log(`| ${nm} | ${pct(v.differ, v.n)} | ${pct(v.favoursWon, v.n)} | ${pct(v.favoursShown, v.n)} |`);
  }
  console.log("");

  if (actionable.length) {
    console.log("## 4. Pairs where our OWN preference already picked the won door\n");
    const sorted = [...favouredRanks].sort((a, b) => a - b);
    const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
    console.log("```");
    console.log(
      `pool rank of the won door on these ${sorted.length} pairs:  `
      + `min ${sorted[0]}  p25 ${q(0.25)}  MEDIAN ${q(0.5)}  p75 ${q(0.75)}  max ${sorted[sorted.length - 1]}`);
    console.log(
      `  ...at rank 7 or better (the preference reached the order, `
      + `something after it removed the row)   ${sorted.filter((r) => r <= 6).length}`);
    console.log(
      `  ...outside the 40-row pool cut (the preference never reached the order)`
      + `                     ${sorted.filter((r) => r > 40).length}`);
    console.log("");
    for (const a of actionable) console.log(a);
    console.log("```\n");
  }
  if (missingRow.length) {
    console.log(`(${missingRow.length} pair(s) skipped — no recall row or instrument: `
      + `${missingRow.slice(0, 5).join(", ")})`);
  }
}

async function boot() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wsha_gates");
  const dump = JSON.parse(
    readFileSync(process.env.IN ?? "/tmp/wsha_doors.json", "utf8")) as Dump;
  await hydrateGatesFor(dump.snapshot.map((s) => s.id));
  main();
}

boot().catch((e) => { console.error(e); process.exit(1); });
