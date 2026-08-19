// How much of a founder's table is funds we hold no evidence about?
//
// ── Why this exists as a separate instrument from measure_recall ───────────
// The recall set is built from awards that were MADE. A leaf with zero awards
// on record therefore cannot be an answer under ANY ranker: its absence from
// the key is a property of how the key is built, not a fact about retrieval.
// `scripts/probe_standalone_pool.ts` prints the cross-tabulation — every one of
// the corpus's zero-award publishable leaves is never an answer, and every
// answer has awards — so EXACT@5 and REGIME@5 are structurally blind to how
// these rows are ranked. They can neither reward promoting them nor punish it.
//
// That blindness is exactly what let a promotion sit in the row sort unseen.
// This measures the thing the answer key cannot: what share of the five rows a
// founder is actually shown is a fund whose funding history we do not hold.
//
// It is not a recall metric and must never be read as one. It has no correct
// value. It is a BEFORE/AFTER instrument for a change to how missing data is
// scored, and a monitor for the next register that lands without award history.
//
// Structural, never a list of ids: "no evidence" is `sectorMix` empty or absent
// — the input `sectorFit` reads — and nothing here names a country, a channel
// or a fund.
//
//   npx tsx scripts/measure_evidence_reach.ts
//   N=200 SEED=7 npx tsx scripts/measure_evidence_reach.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("measure_evidence_reach", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { sampleRecall } from "./recallSample";
import { answersFor, loadRecallSet, type AnswerMode } from "./recallSet";

const pct = (n: number, d: number) => `${(100 * n / Math.max(1, d)).toFixed(1)}%`;

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("measure_evidence_reach");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const regimeOf = (id: string) => byId.get(id)?.parentId ?? id;
  const size = new Map<string, number>();
  for (const i of corpus) {
    if (!offerable.has(i.id)) continue;
    size.set(regimeOf(i.id), (size.get(regimeOf(i.id)) ?? 0) + 1);
  }
  /** The two properties WS-AW and WS-BB separate. They are NOT the same set:
   *  290 leaves are standalone, 94 carry no sector history, and the overlap is
   *  94 — every evidence-free leaf is standalone, but two thirds of standalone
   *  leaves carry full award history and can be, and are, answers. */
  const standalone = (id: string) => (size.get(regimeOf(id)) ?? 0) < 2;
  const blind = (id: string) => {
    const m = byId.get(id)?.sectorMix;
    return !m || Object.keys(m).length === 0;
  };

  const { rows } = loadRecallSet();
  const split = process.env.SPLIT ?? "holdout";
  const holdout = rows.filter((r) => r.split === split);
  const N = Math.min(Number(process.env.N ?? 200), holdout.length);
  const country = process.env.COUNTRY?.toUpperCase();
  const pop = country ? holdout.filter((r) => (r.country || "").toUpperCase() === country) : holdout;
  const sample = sampleRecall(pop, Math.min(N, pop.length), Number(process.env.SEED ?? 20260806));
  const mode = (process.env.ANSWERS ?? "real") as AnswerMode;

  /** Every instrument the ACTIVE SET can name, anywhere, for anyone — not just
   *  this sample and not just this country. A leaf outside it cannot be scored
   *  right or wrong by EXACT@5 under any ranker, so its presence on a founder's
   *  table is evidence about the KEY and not about retrieval. */
  const nameable = new Set(rows.map((r) => r.instrument));

  type B = { n: number; pool: number; poolBlind: number; poolAlone: number;
             t5: number; t5Blind: number; t5Alone: number };
  const mk = (): B => ({ n: 0, pool: 0, poolBlind: 0, poolAlone: 0, t5: 0, t5Blind: 0, t5Alone: 0 });
  const by = new Map<string, B>();
  /** How often each standalone leaf is actually SHOWN. The aggregate share says
   *  a third of the table is standalone; only the roster says whether that is a
   *  defect or a gap in the key, and the two look identical in a percentage. */
  const shownAlone = new Map<string, number>();

  for (const t of sample) {
    resetGateHydration();
    const a = answersFor(t, mode);
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"], region: a.region,
    } as never, {
      capitalSought: a.capitalSought,
      description: t.description || t.selfDescription || undefined,
    } as never);
    const pool = (v.candidateInstrumentIds ?? []) as string[];
    const top5 = ((v.instrumentTable ?? []) as { instrumentId?: string }[])
      .slice(0, 5).map((r) => r.instrumentId).filter((x): x is string => Boolean(x));
    for (const k of ["ALL", t.country || "(none)"]) {
      const b = by.get(k) ?? mk();
      b.n++;
      b.pool += pool.length;
      b.poolBlind += pool.filter(blind).length;
      b.poolAlone += pool.filter((id) => standalone(id)).length;
      b.t5 += top5.length;
      b.t5Blind += top5.filter(blind).length;
      b.t5Alone += top5.filter((id) => standalone(id)).length;
      by.set(k, b);
    }
    for (const id of top5) {
      if (standalone(id)) shownAlone.set(id, (shownAlone.get(id) ?? 0) + 1);
    }
  }

  console.log(`\nset split=${split}${country ? ` country=${country}` : ""} ` +
    `seed=${process.env.SEED ?? 20260806} answers=${mode}  replayed ${sample.length}`);
  console.log(`\n  NO EVIDENCE = no sector history on record (what sectorFit reads).`);
  console.log(`  ALONE = sole publishable leaf of its regime (what gateFitScorer reads).`);
  console.log(`\n  ${"bucket".padEnd(11)} ${"n".padStart(4)} | ${"pool".padStart(6)}` +
    ` ${"blind".padStart(6)} ${"share".padStart(6)} ${"alone%".padStart(7)}` +
    ` | ${"top5".padStart(5)} ${"blind".padStart(6)} ${"share".padStart(6)} ${"alone%".padStart(7)}`);
  const sorted = [...by].sort((x, y) => (x[0] === "ALL" ? -1 : y[0] === "ALL" ? 1 : y[1].n - x[1].n));
  for (const [k, b] of sorted) {
    if (b.n < 5 && k !== "ALL") continue;
    console.log(`  ${k.padEnd(11)} ${String(b.n).padStart(4)} |` +
      ` ${(b.pool / b.n).toFixed(1).padStart(6)} ${(b.poolBlind / b.n).toFixed(1).padStart(6)}` +
      ` ${pct(b.poolBlind, b.pool).padStart(6)} ${pct(b.poolAlone, b.pool).padStart(7)} |` +
      ` ${(b.t5 / b.n).toFixed(1).padStart(5)} ${(b.t5Blind / b.n).toFixed(2).padStart(6)}` +
      ` ${pct(b.t5Blind, b.t5).padStart(6)} ${pct(b.t5Alone, b.t5).padStart(7)}`);
  }

  // The number that says whether the ranking is doing anything: if evidence-free
  // rows take the same share of the five as they hold of the pool, they are
  // being drawn uniformly — the sort is not separating them from anything.
  const all = by.get("ALL")!;
  const inPool = all.poolBlind / Math.max(1, all.pool);
  const inTable = all.t5Blind / Math.max(1, all.t5);
  console.log(`\n  LIFT — evidence-free share of the five, over their share of the pool:`);
  console.log(`    pool ${pct(all.poolBlind, all.pool)}  ->  table ${pct(all.t5Blind, all.t5)}` +
    `   x${(inTable / Math.max(1e-9, inPool)).toFixed(2)}`);
  console.log(`    (x1 is a uniform draw. Above 1 the sort PROMOTES a fund for the` +
    ` data we do not hold about it.)`);

  // ── THE ROSTER, which is the section that settles the question ────────────
  // A share cannot distinguish "the ranker is showing rows that can never be
  // right" from "the answer key cannot name the rows the ranker is right about".
  // Both read as "a third of the table is standalone and none of it is ever an
  // answer". Naming the leaves separates them in one glance, because a leaf with
  // a thousand awards on record that the key never names is a fact about the KEY.
  const roster = [...shownAlone].sort((a, b) => b[1] - a[1]);
  const slots = roster.reduce((s, [, n]) => s + n, 0);
  console.log(`\n  WHICH STANDALONE LEAVES ARE ACTUALLY SHOWN — ${slots} row-slot(s) of ` +
    `${all.t5}, ${roster.length} distinct leaf/leaves`);
  console.log(`  ${"instrument".padEnd(30)} ${"shown".padStart(5)} ${"cc".padStart(3)}` +
    ` ${"awards".padStart(7)}  can the key name it?`);
  for (const [id, n] of roster.slice(0, 20)) {
    const i = byId.get(id);
    console.log(`  ${id.padEnd(30)} ${String(n).padStart(5)} ${String(i?.country ?? "").padStart(3)}` +
      ` ${String(i?.eventCount ?? 0).padStart(7)}  ${nameable.has(id) ? "yes" : "NO"}`);
  }
  const unnameable = roster.filter(([id]) => !nameable.has(id));
  const unnameableAwards = unnameable.reduce((s, [id]) => s + (byId.get(id)?.eventCount ?? 0), 0);
  if (unnameable.length) {
    console.log(`\n    ${unnameable.length} of ${roster.length} carry ${unnameableAwards} awards ` +
      `between them and are NEVER an answer\n    anywhere in the active set. For those rows ` +
      `EXACT@5 is not measuring retrieval; it is\n    reporting the coverage of the key. ` +
      `Fixing selection cannot move them.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
