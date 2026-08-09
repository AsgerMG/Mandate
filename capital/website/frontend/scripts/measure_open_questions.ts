// wsCD — what the open-question path is worth, end to end, as a function of
// how many questions we ask.
//
// ── What is measured ──────────────────────────────────────────────────────
// Real companies, real awards, replayed as if the company were a founder
// filling in the intake — the same population, sampler and metric as
// `measure_recall.ts`, so the numbers compose with the 25% the product ships.
// The only difference between the arms is whether `computeVerdict` is handed
// the judgements.
//
// The curve is EXACT@5 as a function of K, the number of open questions asked.
// "95% if we ask forty things" is not a product; the whole point of stage 2 is
// to keep it to the few that matter, so the budget has to be on the record
// beside the gain.
//
// ── The one call per row, and why the curve is nearly free ────────────────
// The K=6 candidate set CONTAINS the K=1..5 sets by construction: selection is
// a ranked list and the budget is a prefix of it. So the judge runs ONCE per
// row over the top 6, and every point on the curve reads a prefix of the same
// judgements. Six ranking re-runs per row are free (no model call on the
// verdict path); one judging call per row is the whole model spend.
//
// ── How the founder's answer is simulated, and why this is a LOWER bound ──
// A real founder answers the specific question in the moment. The harness
// cannot, so it hands the judge the founder's own description as the answer:
// the prose we actually hold about that company. That is strictly less than a
// real answer would say, and the judge is instructed to return `unknown` when
// the text does not settle the requirement — so every number here is a floor
// on what the shipped path would produce, not a ceiling.
//
// Rows without a leak-free description are excluded rather than counted: on
// those there is nothing for a judge to read, and scoring them would grade the
// population rather than the path.
//
// ── WHAT IT MEASURED, 2026-08-09 (wsCD2) ─────────────────────────────────
// tune, n=120, seed 20260806, live Postgres, OPEN_ABSENCE_ARM=neutral:
//
//   K=0  30.0%   K=1  30.0% (+0.0)   K=2  30.0% (+0.0)
//                K=3  30.0% (+0.0)   K=4  30.0% (+0.0)   K=6  30.0% (+0.0)
//
//   judged verdicts: meets 22, fails 213, unknown 485
//   settled (meets|fails): 235, of which on a ONE-SIDED SPLIT: 235 — all of them
//   pool changed 0, screen changed 0, top-5 reordered 0
//   120 model calls, EUR 1.685, EUR 0.0140 per brief
//
// THE CURVE HAS NO KNEE BECAUSE IT HAS NO RISE, and the reason is structural
// rather than a weakness of the simulated answer. `_wscd2_reach.ts` computes,
// with no model call, the share of rows the scorer CAN move under the most
// favourable verdict assignment that exists: 0.0% at K=1 and K=2, 4.2% at
// K=3, 45.0% at K=6. A question is selected precisely because it SPLITS a
// regime, and the selector takes one question per regime, so the founder's
// answer lands on the demanding side and the other side has no judgement at
// all; `known.length < 2` and `hi === lo` then leave the group alone. 235 of
// 235 settled verdicts landed exactly there.
//
// The 213 confident `fails` are the reason NOT to reach for OPEN_ABSENCE_ARM
// =pass to unblock this. Under "pass" every one of them would demote the fund
// that carries the requirement and promote the sibling whose rules have
// simply never been encoded — a promotion granted for an absence, on prose
// the founder never wrote as an answer to that question. That is the shape of
// the harm that hid Innovate UK, at 213 occurrences per 120 briefs.
//
//   cd website/frontend
//   npx tsx scripts/measure_open_questions.ts                 # tune, N=120
//   SPLIT=holdout N=200 npx tsx scripts/measure_open_questions.ts
//   DRY=1 npx tsx scripts/measure_open_questions.ts           # selection only, no model calls
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_open_questions", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

// The arm must be ON for the whole process, and it is read at module load.
//
// THIS CANNOT BE SET FROM INSIDE THE SCRIPT. ESM `import` statements are
// hoisted and evaluated before any statement in the module body, so an
// assignment here runs AFTER `openQuestions.ts` has already read the variable
// and latched "off" -- and the harness then measures the shipped ranker while
// reporting that it measured the new one. It did exactly that on its first
// run, and reported +0.0 at every budget with a straight face.
//
// So the arm is required from the environment and the run refuses without it.
// A measurement that can silently grade the wrong system is worse than no
// measurement.
if (process.env.OPEN_QUESTION_ARM !== "on") {
  console.error(
    "measure_open_questions: run with OPEN_QUESTION_ARM=on.\n"
    + "  The arm is read at module load and cannot be set from inside this "
    + "file: ESM imports are hoisted, so the modules under test would already "
    + "have latched 'off' and every budget would read +0.0.");
  process.exit(1);
}

import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration, corpusProvenance,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { openQuestionsForShortlist } from "../lib/intelligence/gateReach";
import { judgeOpenAnswers } from "../lib/intelligence/openJudge";
import { openQuestionClassStats, type OpenJudgement } from "../lib/intelligence/openQuestions";
import { generatedArtifactFailures } from "../lib/intelligence/generatedArtifact";
import { withCostTracking } from "../lib/intelligence/cost";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  answersFor, isDescribed, loadRecallSet, partitionByOfferable, type AnswerMode,
} from "./recallSet";

/** The points on the budget curve. 0 is the shipped product. */
const BUDGETS = [0, 1, 2, 3, 4, 6];
const MAX_BUDGET = Math.max(...BUDGETS);

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("measure_open_questions");
  // A run whose ranker was missing a committed signal produces a real figure
  // about a system nobody ships. Refuse rather than report.
  const missing = generatedArtifactFailures();
  if (Object.keys(missing).length) {
    console.error(`refusing to measure: generated artifacts failed to load: ${JSON.stringify(missing)}`);
    process.exit(1);
  }
  const cls = openQuestionClassStats();
  if (!cls.classified) {
    console.error("refusing to measure: no requirement has been classified. "
      + "Run scripts/emit_open_question_class.ts first.");
    process.exit(1);
  }

  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const { file, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const answerMode = (process.env.ANSWERS ?? "real") as AnswerMode;
  const N = Number(process.env.N ?? 120);
  const seed = Number(process.env.SEED ?? DEFAULT_SEED);
  const dry = process.env.DRY === "1";

  // The population: this split, gradable, and carrying prose a judge can read.
  const eligible = all
    .filter((r) => r.split === split)
    .filter(isDescribed);
  const { graded, ungraded } = partitionByOfferable(eligible, (id) => offerable.has(id));
  const sample = sampleRecall(graded, Math.min(N, graded.length), seed);

  console.log(`set ${file} | split ${split} | ANSWERS=${answerMode} | seed ${seed} `
    + `| OPEN_ABSENCE_ARM=${process.env.OPEN_ABSENCE_ARM ?? "neutral"}`);
  console.log(`corpus=${corpusProvenance().source} | classes: ${cls.classified}/${cls.candidates} `
    + `classified by ${cls.model} at ${cls.generatedAt}`);
  console.log(`described+gradable ${graded.length} (ungradable ${ungraded.length}), sampling ${sample.length}\n`);

  const hit: Record<number, number> = Object.fromEntries(BUDGETS.map((k) => [k, 0]));
  const regimeHit: Record<number, number> = Object.fromEntries(BUDGETS.map((k) => [k, 0]));
  // The safety claim, measured rather than argued.
  let poolChanged = 0, screenChanged = 0, movedRows = 0;
  const verdictCount = { meets: 0, fails: 0, unknown: 0 };
  let asked = 0, rowsWithAnyQuestion = 0, done = 0, settled = 0, oneSided = 0;
  const perRegime = new Map<string, { flips: number; n: number }>();

  const { eur, calls } = await withCostTracking(async () => {
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
        targetMarkets: [t.country], capitalSought: a.capitalSought,
        description: t.description || undefined,
      };

      const base = await computeVerdict("TestCo", t.country, answers, opts as never);
      const basePool = base.candidateInstrumentIds ?? [];
      const baseTop5 = (base.instrumentTable ?? []).slice(0, 5)
        .map((r) => r.instrumentId).filter((x): x is string => Boolean(x));
      const want = byId.get(t.instrument);
      const wantRegime = want?.parentId ?? t.instrument;
      if (baseTop5.includes(t.instrument)) { hit[0] += 1; }
      if (baseTop5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime)) regimeHit[0] += 1;

      // Gates for the pool, or the selector sees empty requirement text.
      await hydrateGatesFor(basePool);
      const candidates = openQuestionsForShortlist(basePool, answers, { budget: MAX_BUDGET });
      asked += candidates.length;
      if (candidates.length) rowsWithAnyQuestion += 1;

      let judged: OpenJudgement[] = [];
      if (candidates.length && !dry) {
        const items = candidates.map((c) => ({
          key: c.key,
          requirement: c.requirement,
          answer: {
            key: c.key,
            // What the founder was asked, stated plainly. The shipped path
            // writes this with a model; the ranking effect does not depend on
            // the phrasing, only on the judgement, so the harness does not pay
            // for a writer call it would then throw away.
            question: "Describe what your project does, in relation to this requirement.",
            answer: t.description ?? "",
          },
        }));
        judged = await judgeOpenAnswers(items, t.description ?? undefined);
        const byKey = new Map(candidates.map((c) => [c.key, c]));
        for (const j of judged) {
          verdictCount[j.verdict] += 1;
          // Where a settled verdict LANDS. A question is selected because it
          // splits a regime, so a settled verdict always lands on a splitting
          // requirement -- but under the default absence arm the other side of
          // the split has no judgement, so the group is skipped. This counts
          // how often that one-sidedness is what stops the signal.
          if (j.verdict === "meets" || j.verdict === "fails") {
            const c = byKey.get(j.key);
            if (c) { settled += 1; if (c.carriers < c.regimeSize) oneSided += 1; }
          }
        }
      }

      for (const k of BUDGETS) {
        if (k === 0) continue;
        const keys = new Set(candidates.slice(0, k).map((c) => c.key));
        const slice = judged.filter((j) => keys.has(j.key));
        if (!slice.length) {
          // Nothing to say at this budget: the arm is inert and the row scores
          // exactly as the baseline did. Counted, never re-run.
          if (baseTop5.includes(t.instrument)) hit[k] += 1;
          if (baseTop5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime)) regimeHit[k] += 1;
          continue;
        }
        resetGateHydration();
        const armed = await computeVerdict("TestCo", t.country, answers,
          { ...opts, openJudgements: slice } as never);
        const top5 = (armed.instrumentTable ?? []).slice(0, 5)
          .map((r) => r.instrumentId).filter((x): x is string => Boolean(x));
        if (top5.includes(t.instrument)) hit[k] += 1;
        if (top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime)) regimeHit[k] += 1;

        if (k === MAX_BUDGET) {
          // ── The safety claim, checked on every row ──────────────────────
          // The scorer is wired into the rank-PRESERVING site, so arming it
          // must not remove a fund from the pool and must not change the
          // eligibility screen. Structural, and therefore checkable.
          const armedPool = armed.candidateInstrumentIds ?? [];
          const lost = basePool.filter((id) => !armedPool.includes(id));
          if (lost.length) poolChanged += 1;
          const baseScreen = JSON.stringify(base.eligibilityScreen);
          if (baseScreen !== JSON.stringify(armed.eligibilityScreen)) screenChanged += 1;
          if (top5.join("|") !== baseTop5.join("|")) {
            movedRows += 1;
            const r = wantRegime;
            const e = perRegime.get(r) ?? { flips: 0, n: 0 };
            e.flips += 1; e.n += 1;
            perRegime.set(r, e);
          }
        }
      }
      done += 1;
      if (done % 10 === 0) process.stdout.write(`  ${done}/${sample.length}\r`);
    }
  });

  const pct = (n: number) => `${(100 * n / done).toFixed(1)}%`;
  console.log(`\n\n── EXACT@5 by number of open questions asked (n=${done}) ──`);
  for (const k of BUDGETS) {
    const delta = k === 0 ? "" : ` (${((100 * (hit[k] - hit[0])) / done >= 0 ? "+" : "")}`
      + `${((100 * (hit[k] - hit[0])) / done).toFixed(1)})`;
    console.log(`  K=${k}  EXACT@5 ${String(hit[k]).padStart(3)}/${done} ${pct(hit[k]).padStart(6)}${delta}`
      + `   REGIME@5 ${pct(regimeHit[k]).padStart(6)}`);
  }

  console.log(`\n── the questions ──`);
  console.log(`  rows with at least one open question: ${rowsWithAnyQuestion}/${done} `
    + `(${(100 * rowsWithAnyQuestion / done).toFixed(1)}%)`);
  console.log(`  mean questions offered per row (cap ${MAX_BUDGET}): ${(asked / done).toFixed(2)}`);
  console.log(`  judged verdicts: ${JSON.stringify(verdictCount)}`);
  console.log(`  settled verdicts (meets|fails): ${settled}, of which on a `
    + `one-sided split: ${oneSided}`);

  console.log(`\n── the safety claim ──`);
  console.log(`  rows where a fund LEFT the pool:        ${poolChanged}   (must be 0)`);
  console.log(`  rows where the eligibility screen moved: ${screenChanged}   (must be 0)`);
  console.log(`  rows whose top 5 was reordered:         ${movedRows}   (must be > 0, or nothing was measured)`);

  if (perRegime.size) {
    const top = [...perRegime.entries()].sort((a, b) => b[1].flips - a[1].flips).slice(0, 6);
    console.log(`\n── regime concentration of the movement (${perRegime.size} distinct regimes) ──`);
    for (const [r, v] of top) console.log(`  ${r.padEnd(34)} ${v.flips}`);
  }

  console.log(`\n── cost ──`);
  console.log(`  ${calls} model calls, EUR ${eur.toFixed(3)} total, `
    + `EUR ${(eur / Math.max(done, 1)).toFixed(4)} per brief`);
}

main();
