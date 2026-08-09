// wsCK part 5 — the one designed question that already exists, answered for real.
//
// The oracle table says a perfect answer to "how big is the cheque" is worth
// +20.0 tune / +21.6 holdout, second only to topic, present on 97% of leaves and
// — unlike topic — NOT circular: the clean subpopulation (award_n >= 20, 94% of
// pairs) reproduces it at +19.6 / +21.7.
//
// It is also already asked. `ticketBand` sits on the first screen and
// `awardScorer` ranks on order-of-magnitude proximity to the fund's own median
// award. What the headline measures is therefore not "the question is missing" —
// it is that EVERY replayed founder is given the SAME answer, the constant
// `b500k_2m5`, because `ANSWERS` defaults to `off`.
//
// So the honest business case for the question is a paired test: the same
// founder, the same fund, the same draw, ranked twice, differing only in whether
// the ticket band is theirs or the constant.
//
//   constant  every founder asks for EUR 500k-2.5M, which is what the headline
//             number is measured on today
//   derived   the band this company's own award history implies
//
// ── Provenance is reported, never blended ────────────────────────────────
// A band derived from the WON award is read off the answer. One derived from a
// DIFFERENT scheme's award is not. `strict` in `answersFor` is the leak-free
// half, and the two are printed on separate lines for the same reason
// `measure_description_lift` splits by description source: a blended figure here
// would be exactly the retracted-85.5% mistake in a new column.
//
// FREE: one Voyage embed per pair per arm, one Postgres read. No model calls.
//
//   SPLIT=tune N=250 npx tsx scripts/_wsck_money.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsck_money", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  CONSTANT_ANSWERS, answersFor, assertAncestorConvention, assertGradablePopulation,
  loadRecallSet, partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsck_money");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  const N = Math.min(Number(process.env.N ?? 250), set.length);
  const sample = sampleRecall(set, N, Number(process.env.SEED ?? DEFAULT_SEED));

  // The population that can differ AT ALL. A founder with no derivable band gets
  // the constant in both arms and contributes a guaranteed tie, which drags any
  // reported effect toward zero without saying so. Kept in the totals, and
  // reported separately, so both readings are available.
  const derivable = sample.filter((t: RecallRow) => Boolean(t.answerTicketSource && t.answerTicketBand));
  const leakFree = derivable.filter((t: RecallRow) => t.answerTicketSource === "other_scheme");
  console.log(`set=${setFile} split=${split} N=${sample.length}`);
  console.log(`  a ticket band can be derived for ${derivable.length} (${(100 * derivable.length / sample.length).toFixed(0)}%)` +
    `, of which LEAK-FREE (from a different scheme's award) ${leakFree.length}`);
  if (!derivable.length) throw new Error("no founder in this draw has a derivable ticket band — the test measures nothing");

  resetRankerTally();
  const rows: { t: RecallRow; constant: boolean; derived: boolean; changed: boolean }[] = [];
  let done = 0;
  for (const t of sample) {
    const arm = async (ticketBand: string) => {
      resetGateHydration();
      const v = await computeVerdict("TestCo", t.country, {
        entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
        borrowerModel: "operating", ticketBand, consortium: "yes",
        useOfFunds: ["industrial_research", "experimental_development"],
      } as never, {
        targetMarkets: [t.country], capitalSought: CONSTANT_ANSWERS.capitalSought,
        description: t.description || t.selfDescription || undefined,
      } as never);
      return ((v.instrumentTable ?? []).slice(0, 5)
        .map((r: { instrumentId?: string }) => r.instrumentId)).includes(t.instrument);
    };
    const mine = answersFor(t, "ticket").ticketBand;
    const c = await arm(CONSTANT_ANSWERS.ticketBand);
    const d = mine === CONSTANT_ANSWERS.ticketBand ? c : await arm(mine);
    rows.push({ t, constant: c, derived: d, changed: mine !== CONSTANT_ANSWERS.ticketBand });
    if (++done % 50 === 0) console.error(`  … ${done}/${sample.length}`);
  }

  console.log(rankerTallyLine());
  const show = (label: string, sub: typeof rows) => {
    if (!sub.length) { console.log(`  ${label.padEnd(44)} (empty)`); return; }
    const c = sub.filter((r) => r.constant).length;
    const d = sub.filter((r) => r.derived).length;
    const f = sub.filter((r) => r.derived && !r.constant).length;
    const a = sub.filter((r) => !r.derived && r.constant).length;
    console.log(`  ${label.padEnd(44)} n=${String(sub.length).padStart(4)}` +
      `  constant ${(100 * c / sub.length).toFixed(1).padStart(5)}%` +
      `  derived ${(100 * d / sub.length).toFixed(1).padStart(5)}%` +
      `  = ${sgn(100 * (d - c) / sub.length).padStart(6)}` +
      ` +/-${halfWidth(d, sub.length).toFixed(1)}   discordant ${f} for / ${a} against`);
  };
  console.log(`\nPAIRED TICKET TEST — same draw, same fund, one difference`);
  show("WHOLE DRAW (ties from the constant included)", rows);
  show("band actually differs from the constant", rows.filter((r) => r.changed));
  show("...of those, LEAK-FREE (other_scheme)",
    rows.filter((r) => r.changed && r.t.answerTicketSource === "other_scheme"));
  show("...of those, from the WON award (circular)",
    rows.filter((r) => r.changed && r.t.answerTicketSource !== "other_scheme"));

  // ── The guard. A ticket answer is a SCORE here, never a filter, and this is
  //    the line that proves it: if answering truthfully ever removes the won
  //    fund from the table for someone the register says received it, the
  //    question hides funds from people who qualify — which is how Innovate UK
  //    was blocked from every founder who answered ticket size.
  const lost = rows.filter((r) => r.changed && r.constant && !r.derived);
  console.log(`\nWINNERS THE TRUTHFUL ANSWER PUSHES OFF THE TABLE  ${lost.length}` +
    `  (${(100 * lost.length / Math.max(1, rows.filter((r) => r.changed).length)).toFixed(1)}% of those who answer differently)`);
  for (const r of lost.slice(0, 15)) {
    console.log(`   ${r.t.name} (${r.t.country}) -> ${r.t.instrument}` +
      `   asked ${answersFor(r.t, "ticket").ticketBand} instead of ${CONSTANT_ANSWERS.ticketBand}`);
  }
  if (!rows.filter((r) => r.changed).length) {
    throw new Error("nobody in this draw answered differently — the guard tested nothing, " +
      "and a green light on an empty population is not a green light");
  }
}

const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;

main();
