// wsCD2 — the FREE half of the question-budget curve: how often the open
// scorer is even CAPABLE of moving a row, at each budget K.
//
// ── Why this runs before any model call ───────────────────────────────────
// The judge is the only paid part of the measurement, and the monthly API
// limit has already killed two agents on this workstream. But the scorer's
// ability to act is a STRUCTURAL fact about the selection, not about what a
// founder answers: `openFitScorer` skips a regime unless at least two of its
// leaves carry a settled judgement AND those judgements do not all agree
// (`hi === lo` is an early-out). So there exists an upper bound on the curve
// that no verdict assignment can beat, and it is computable from the
// selection alone.
//
// ── The bound, stated exactly ─────────────────────────────────────────────
// Give an ORACLE the freedom to assign any verdict it likes to every selected
// key — the most favourable assignment possible. A regime can still only move
// if, under that assignment, two of its leaves end up with DIFFERENT fit
// ratios. Per leaf, fit = met/judged over the judged keys it carries. So:
//
//   under "neutral": a regime is reachable iff two of its leaves carry
//     DIFFERENT SETS of selected keys and at least two leaves carry at least
//     one. Identical carrier sets can only ever produce identical fits, and a
//     leaf carrying none has no entry at all.
//
//   under "pass": a leaf carrying none scores 1, so a regime is reachable as
//     soon as ONE leaf carries a selected key (the oracle fails it) and one
//     other does not.
//
// A row is reachable iff any regime represented in its top-5 neighbourhood is
// reachable. This is an upper bound on EXACT@5 movement, not a prediction:
// a reachable row still needs the judge to actually settle the keys that way,
// and needs the movement to be in the right direction.
//
// ── WHAT IT MEASURED, 2026-08-09 ──────────────────────────────────────────
// tune split, n=120, seed 20260806, live Postgres. Share of rows the scorer
// CAN move, under the most favourable verdict assignment that exists:
//
//   K       1       2       3       4       6
//   neutral 0.0%    0.0%    4.2%   10.0%   45.0%     <- the arm that ships
//   pass  100.0%  100.0%  100.0%  100.0%  100.0%
//
// Six questions are offered on 100% of rows, so `offered` is not the binding
// constraint at any budget: the selector always has something to ask, and the
// SCORER is what cannot act on the answer.
//
// The mechanism is the histogram this script prints: of the leaves carrying a
// selected key, 1,080 carry exactly ONE and 19 carry two. `openQuestionsForShortlist`
// deliberately takes one question per regime ("so the budget buys coverage of
// DIFFERENT forks"), so every carrier inside a regime receives the SAME key,
// computes the SAME fit, and `hi === lo` skips the group. Neutral can only act
// where the budget overflows a second key into a regime — which never happens
// below K=3, and is still rare at K=6.
//
// So under the shipping absence arm there is no knee below the full six-slot
// screen budget, and the ceiling even there is 45% of rows able to move AT
// ALL, in either direction. That is the honest bound, and it was free.
//
// Read-only. Postgres and disk. NO model calls.
//
//   cd website/frontend
//   OPEN_QUESTION_ARM=on npx tsx scripts/_wscd2_reach.ts
//   OPEN_QUESTION_ARM=on N=200 npx tsx scripts/_wscd2_reach.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wscd2_reach", ["DATABASE_URL", "VOYAGE_KEY"]);

// Same latch trap as the harness: the arm is read at module load, so it has to
// come from the environment or the selector returns [] and this reports a
// clean, meaningless zero at every budget.
if (process.env.OPEN_QUESTION_ARM !== "on") {
  console.error("_wscd2_reach: run with OPEN_QUESTION_ARM=on (read at module load).");
  process.exit(1);
}

import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration, corpusProvenance,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { openQuestionsForShortlist } from "../lib/intelligence/gateReach";
import {
  MIN_SUBSTANTIVE_LEN, normaliseRequirement, openQuestionClassStats,
} from "../lib/intelligence/openQuestions";
import { generatedArtifactFailures } from "../lib/intelligence/generatedArtifact";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  answersFor, isDescribed, loadRecallSet, partitionByOfferable, type AnswerMode,
} from "./recallSet";

const BUDGETS = [1, 2, 3, 4, 6];
const MAX_BUDGET = Math.max(...BUDGETS);

/** The selected keys a leaf carries, by the same rules `openFitScorer` uses to
 *  decide what it may read: filter role, long enough, deduplicated. */
function carriedKeys(
  gates: { requirement: string; gateRole?: string }[] | undefined,
  selected: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const g of gates ?? []) {
    if (g.gateRole && g.gateRole !== "filter") continue;
    const req = (g.requirement ?? "").trim();
    if (req.length < MIN_SUBSTANTIVE_LEN) continue;
    const key = normaliseRequirement(req);
    if (selected.has(key)) out.add(key);
  }
  return out;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wscd2_reach");
  const missing = generatedArtifactFailures();
  if (Object.keys(missing).length) {
    console.error(`refusing to measure: generated artifacts failed to load: ${JSON.stringify(missing)}`);
    process.exit(1);
  }
  const cls = openQuestionClassStats();
  if (!cls.classified) {
    console.error("refusing to measure: no requirement has been classified.");
    process.exit(1);
  }

  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const { file, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const answerMode = (process.env.ANSWERS ?? "real") as AnswerMode;
  const N = Number(process.env.N ?? 120);
  const seed = Number(process.env.SEED ?? DEFAULT_SEED);

  const eligible = all.filter((r) => r.split === split).filter(isDescribed);
  const { graded, ungraded } = partitionByOfferable(eligible, (id) => offerable.has(id));
  const sample = sampleRecall(graded, Math.min(N, graded.length), seed);

  console.log(`set ${file} | split ${split} | ANSWERS=${answerMode} | seed ${seed}`);
  console.log(`corpus=${corpusProvenance().source} | classes ${cls.classified}/${cls.candidates} by ${cls.model}`);
  console.log(`described+gradable ${graded.length} (ungradable ${ungraded.length}), sampling ${sample.length}\n`);

  const reachNeutral: Record<number, number> = Object.fromEntries(BUDGETS.map((k) => [k, 0]));
  const reachPass: Record<number, number> = Object.fromEntries(BUDGETS.map((k) => [k, 0]));
  const offered: Record<number, number> = Object.fromEntries(BUDGETS.map((k) => [k, 0]));
  let done = 0, rowsWithAnyQuestion = 0, asked = 0;
  // How many DISTINCT selected keys a single regime ever ends up carrying —
  // the quantity the whole neutral-arm question turns on.
  const keysPerRegimeHist = new Map<number, number>();
  const regimesTouched = new Map<string, number>();

  for (const t of sample) {
    resetGateHydration();
    const a = answersFor(t, answerMode);
    const answers = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never;
    const opts = {
      capitalSought: a.capitalSought,
      description: t.description || undefined,
    };

    const base = await computeVerdict("TestCo", t.country, answers, opts as never);
    const basePool = base.candidateInstrumentIds ?? [];
    await hydrateGatesFor(basePool);
    const candidates = openQuestionsForShortlist(basePool, answers, { budget: MAX_BUDGET });
    asked += candidates.length;
    if (candidates.length) rowsWithAnyQuestion += 1;

    // The pool the scorer actually runs over, grouped exactly as it groups.
    const pool = basePool.map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i));
    const byRegime = new Map<string, typeof pool>();
    for (const l of pool) {
      const r = l.parentId ?? l.id;
      (byRegime.get(r) ?? byRegime.set(r, []).get(r)!).push(l);
    }

    for (const k of BUDGETS) {
      const selected = new Set(candidates.slice(0, k).map((c) => c.key));
      if (selected.size) offered[k] += 1;
      let anyNeutral = false, anyPass = false;
      for (const [regimeId, group] of byRegime) {
        if (group.length < 2) continue;
        const sets = group.map((l) => carriedKeys(l.gates, selected));
        const carriers = sets.filter((s) => s.size > 0);
        if (!carriers.length) continue;
        // "pass": one carrier the oracle fails, one non-carrier at 1.
        if (carriers.length < group.length) anyPass = true;
        // "neutral": needs two carriers with DIFFERENT key sets. Identical sets
        // receive identical verdicts and therefore identical fits, and the
        // scorer's `hi === lo` early-out then leaves the group alone.
        const sigs = new Set(carriers.map((s) => [...s].sort().join("|")));
        if (carriers.length >= 2 && sigs.size >= 2) anyNeutral = true;
        if (carriers.length >= 2) anyPass = true;
        if (k === MAX_BUDGET) {
          for (const s of sets) {
            if (!s.size) continue;
            keysPerRegimeHist.set(s.size, (keysPerRegimeHist.get(s.size) ?? 0) + 1);
          }
          if (carriers.length) regimesTouched.set(regimeId, (regimesTouched.get(regimeId) ?? 0) + 1);
        }
      }
      if (anyNeutral) reachNeutral[k] += 1;
      if (anyPass) reachPass[k] += 1;
    }
    done += 1;
    if (done % 10 === 0) process.stdout.write(`  ${done}/${sample.length}\r`);
  }

  const pct = (n: number) => `${(100 * n / done).toFixed(1)}%`;
  console.log(`\n\n── ORACLE REACHABILITY: share of rows the scorer CAN move (n=${done}) ──`);
  console.log(`  (an upper bound on any gain at that budget; no verdict assignment beats it)`);
  console.log(`  K   offered   neutral (ships)   pass (absence arm)`);
  for (const k of BUDGETS) {
    console.log(`  ${k}   ${pct(offered[k]).padStart(6)}    ${pct(reachNeutral[k]).padStart(6)}`
      + `           ${pct(reachPass[k]).padStart(6)}`);
  }

  console.log(`\n── the questions ──`);
  console.log(`  rows with at least one open question: ${rowsWithAnyQuestion}/${done} (${pct(rowsWithAnyQuestion)})`);
  console.log(`  mean questions offered per row (cap ${MAX_BUDGET}): ${(asked / done).toFixed(2)}`);
  console.log(`  distinct regimes carrying a selected key: ${regimesTouched.size}`);
  console.log(`  selected keys carried by ONE leaf (histogram): `
    + JSON.stringify(Object.fromEntries([...keysPerRegimeHist.entries()].sort((a, b) => a[0] - b[0]))));

  if (regimesTouched.size) {
    const top = [...regimesTouched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`\n── regime concentration of the REACH (not of any gain) ──`);
    for (const [r, n] of top) console.log(`  ${r.padEnd(34)} ${n}`);
  }
}

main();
