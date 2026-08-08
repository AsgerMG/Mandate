// Does the ADAPTIVE ROUND find the fund a company actually won?
//
// ── Why this exists, and why measure_recall.ts cannot answer it ────────────
// measure_recall.ts replays a real recipient through screen one and stops.
// That is half the product. The real funnel is:
//
//   screen one -> candidate pool -> ADAPTIVE QUESTIONS -> answers -> five rows
//
// The adaptive round generates follow-up questions from the verbatim
// eligibility gates of shortlisted funds, the founder answers them, and
// `scoreEase` then re-ranks the table -- crediting a fund when the founder
// answered a question generated from THAT fund's own gate
// (`instrumentId::gateKey`). So a fund sitting at rank 6-10 after screen one
// can be promoted into the visible five by the round. measure_recall.ts is
// structurally blind to all of it.
//
// This matters right now because 238 instruments just gained per-scheme gates
// cut from their own fetched eligibility text (1,536 gates). Before that, the
// only gates these schemes had were INHERITED regime gates -- identical across
// siblings, so the adaptive round asked every sibling the same question and
// could not discriminate. The corpus work was aimed squarely at this step, and
// this is the only harness that can see whether it paid off.
//
// ── Why it costs nothing ───────────────────────────────────────────────────
// Question GENERATION (`gateReach.ts`) and ease re-ranking (`ease.ts`) are both
// deterministic, model-free code. Production also runs a model call to phrase
// the questions and a founder answers them, but neither changes WHICH gates are
// asked about or how ease scores them. So the discriminating mechanism can be
// exercised end to end for free.
//
// ── The answer simulation, and its honest limits ───────────────────────────
// A real founder answers from their own project. Here, answering "the founder
// engages with every question asked" is the CEILING case: it measures how much
// the round could move recall if the founder answers everything. That is the
// right question for "did the new gates help", because if perfect engagement
// moves nothing, imperfect engagement certainly will not.
//
// It deliberately does NOT answer questions using the won fund's identity --
// that would leak the label into the signal, the same way the project-title
// leak once read 90% recall that was really 10%.
//
// ── WHAT IT FOUND, 2026-08-05 ─────────────────────────────────────────────
// Run on holdout (n=60), immediately after 238 instruments gained per-scheme
// gates cut from their own fetched eligibility text:
//
//   screen one only      EXACT 23%   REGIME 73%
//   after adaptive round EXACT 22%   REGIME 70%
//   promoted into five: 0    demoted out: 1
//
// The round moves nothing, and it is NOT for lack of reach. Diagnosed: the
// candidate pool averages 57 funds, the round asks about exactly 5 of them,
// and the won fund is among those 5 only 12.5% of the time. But raising the
// limit 5 -> 15 -> 30 (6x the questions) still yields 1 promoted / 2 demoted
// and flat recall.
//
// So the binding constraint is not question COVERAGE, it is that `scoreEase`
// barely moves on an answered gate: `resolved` is one component among
// comparable-count, blocked-status and country-match, and it is divided by
// (total gates + shrinkage), so answering one or two of a fund's gates is
// noise against the rest of the score. The mechanism is wired correctly end
// to end and its effect size is ~zero.
//
// The honest read: the adaptive round is not the lever for exact-scheme
// recall. Better per-scheme gates made the QUESTIONS sharper -- which is real
// value for the founder and for the memo -- without changing which five rows
// get shown. Anything aiming at 95% has to move screen-one ranking or the
// ease weighting itself, not the corpus feeding the round.
//
//   npx tsx scripts/measure_funnel_recall.ts
//   SPLIT=holdout N=120 MODE=profile npx tsx scripts/measure_funnel_recall.ts

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_funnel_recall", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { openFieldsForShortlist, openProjectGatesForShortlist } from "../lib/intelligence/gateReach";
import { scoreEase } from "../lib/intelligence/ease";
import type { ProjectAnswer } from "../lib/intelligence/types";
import { loadRecallSet } from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i: any) => [i.id, i]));
  const { rows: all } = loadRecallSet();

  const split = process.env.SPLIT ?? "holdout";
  const mode = process.env.MODE;
  const set = all.filter((r) => (split === "all" || r.split === split) && (!mode || r.mode === mode));
  const N = Math.min(Number(process.env.N ?? 120), set.length);
  // Stride, never the head of the list: the set is grouped by mode and
  // `project` comes first, so slicing samples 66% project against a true
  // population of 16%.
  const step = Math.max(1, Math.floor(set.length / N));
  const sample = set.filter((_, i) => i % step === 0).slice(0, N);

  const stat = {
    screenExact: 0, screenRegime: 0,
    funnelExact: 0, funnelRegime: 0,
    pool: 0, done: 0,
    promoted: 0, demoted: 0, questionsAsked: 0, withQuestions: 0,
  };

  for (const t of sample) {
    const eligibility = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never;

    const v: any = await computeVerdict("TestCo", t.country, eligibility, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"],
      description: t.description || undefined,
    } as never);

    const rows: any[] = v.instrumentTable ?? [];
    const ids = rows.map((r) => r.instrumentId).filter(Boolean) as string[];
    const wantRegime = byId.get(t.instrument)?.parentId ?? t.instrument;
    const regimeOf = (id: string) => (byId.get(id) as any)?.parentId ?? id;

    stat.done++;
    if ((v.candidateInstrumentIds ?? []).includes(t.instrument)) stat.pool++;

    // ── Screen one alone: what measure_recall.ts sees ─────────────────────
    const screenTop5 = ids.slice(0, 5);
    if (screenTop5.includes(t.instrument)) stat.screenExact++;
    if (screenTop5.some((id) => regimeOf(id) === wantRegime)) stat.screenRegime++;

    // ── The adaptive round, exactly as the intake route builds it ─────────
    const openFields = openFieldsForShortlist(v.candidateInstrumentIds ?? [], eligibility);
    const projectGates = openProjectGatesForShortlist(v.candidateInstrumentIds ?? [], eligibility, {
      deprioritiseFields: openFields.map((f: any) => f.field), limit: 5,
    });
    stat.questionsAsked += projectGates.length;
    if (projectGates.length) stat.withQuestions++;

    // The founder engages with every question. See the header: this is the
    // ceiling case, and it never consults the won fund's identity.
    const projectAnswers: ProjectAnswer[] = projectGates.map((g: any) => ({
      questionId: `${g.instrumentId}::${g.gateKey}`,
      question: g.requirement ?? "",
      answer: "Yes",
      instrumentId: g.instrumentId,
      instrumentName: g.instrumentName,
      gateKey: g.gateKey,
      quote: g.quote,
      locator: g.locator,
    }));

    // ── Re-rank on ease, the same call synthesize() makes ─────────────────
    const easeById = scoreEase(
      ids, eligibility, projectAnswers, new Map(), v.eligibilityScreen ?? [],
      new Set([(t.country ?? "").toUpperCase()]),
    );
    const reranked = [...rows].sort((a, b) => {
      const ea = easeById.get(a.instrumentId)?.score ?? 0;
      const eb = easeById.get(b.instrumentId)?.score ?? 0;
      return eb - ea;
    });
    const funnelTop5 = reranked.slice(0, 5).map((r) => r.instrumentId).filter(Boolean) as string[];

    const wasIn = screenTop5.includes(t.instrument);
    const nowIn = funnelTop5.includes(t.instrument);
    if (!wasIn && nowIn) stat.promoted++;
    if (wasIn && !nowIn) stat.demoted++;
    if (nowIn) stat.funnelExact++;
    if (funnelTop5.some((id) => regimeOf(id) === wantRegime)) stat.funnelRegime++;
  }

  const pc = (n: number) => `${n}/${stat.done} (${(100 * n / stat.done).toFixed(0)}%)`;
  console.log(`\nsplit=${split}${mode ? ` mode=${mode}` : ""}  replayed ${stat.done}`);
  console.log(`  in pool                       ${pc(stat.pool)}`);
  console.log(`\n  SCREEN ONE ONLY (what measure_recall.ts reports)`);
  console.log(`    EXACT scheme in top 5       ${pc(stat.screenExact)}`);
  console.log(`    same REGIME in top 5        ${pc(stat.screenRegime)}`);
  console.log(`\n  AFTER THE ADAPTIVE ROUND`);
  console.log(`    EXACT scheme in top 5       ${pc(stat.funnelExact)}`);
  console.log(`    same REGIME in top 5        ${pc(stat.funnelRegime)}`);
  console.log(`\n  what the round did`);
  console.log(`    promoted into the five      ${stat.promoted}`);
  console.log(`    demoted out of the five     ${stat.demoted}`);
  console.log(`    replays that got questions  ${stat.withQuestions}/${stat.done}`);
  console.log(`    mean gate-questions asked   ${(stat.questionsAsked / stat.done).toFixed(1)}`);
}

main();
