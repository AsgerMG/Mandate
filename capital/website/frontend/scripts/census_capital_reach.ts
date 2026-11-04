// How much of the answer key is UNREACHABLE by the harness's own intake answer?
//
// `measure_recall.ts` and `check_recall_floor.ts` both pass a fixed
// `capitalSought: ["grant","loan"]` for every replayed pair. That is a property
// of the harness, not of the founder: the intake offers five capital options and
// a pair whose won fund carries one of the other three is excluded by the
// founder's own stated preference before ranking is consulted at all.
//
// If that population is non-trivial, `pool` has a CEILING below 100 that no
// ranking change can lift -- the same shape as the closed-scheme clamp workstream
// T found, and it would be attributed to retrieval in exactly the same way.
//
// Model-free and read-only. Reports the split by the won fund's capital_type,
// and separately what each intake option would reach, so the choice of a wider
// constant is priced rather than assumed.
//
//   npx tsx scripts/census_capital_reach.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("census_capital_reach", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { CAPITAL_SOUGHT_TO_DB, instrumentServesCapital } from "../lib/intelligence/shortlist";
import { passesCapitalPreference } from "../lib/intelligence/accessMode";
import { CAPITAL_OPTIONS } from "../lib/intelligence/types";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers,
} from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("census_capital_reach");
  const p = corpusProvenance();
  console.log(`corpus=${p.source} instruments=${p.instruments} at ${p.hydratedAt}\n`);

  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerableList = publishableInstruments();
  const offerable = new Set(offerableList.map((i) => i.id));

  // ── The corpus side ──────────────────────────────────────────────────────
  const capCount = new Map<string, number>();
  for (const i of offerableList) capCount.set(i.capitalType, (capCount.get(i.capitalType) ?? 0) + 1);
  console.log(`publishable instruments by capital_type (n=${offerableList.length}):`);
  for (const [k, n] of [...capCount].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k}`);
  }
  // Reachability is asked of `instrumentServesCapital` ITSELF, one intake
  // option at a time — never of `CAPITAL_SOUGHT_TO_DB` recomputed here. The two
  // stopped being the same question when workstream AR added
  // `INDEFINITE_CAPITAL`: `blended` is in no option's mapped values and IS
  // reachable by all of them, so the map-based test reported the corpus's
  // largest debt programme as stranded from every founder on the same day the
  // filter began admitting it. `check_capital_reach.ts` asks the function for
  // exactly this reason, and a census that answered differently from the guard
  // would be the more dangerous of the two — nothing fails when a diagnostic
  // lies.
  //
  // One option at a time, not the whole set: a fund reachable only by a founder
  // who ticks every box is reachable by no founder who has a preference.
  const options = CAPITAL_OPTIONS.map((o) => o.value);
  const unreachable = [...capCount].filter(
    ([k]) => !options.some((o) => instrumentServesCapital(k, [o])));
  console.log(`  capital_type values NO intake option can reach: ` +
    (unreachable.length ? unreachable.map(([k, n]) => `${k} (${n})`).join(", ") : "none"));
  const indefinite = [...capCount].filter(
    ([k]) => !new Set(Object.values(CAPITAL_SOUGHT_TO_DB).flat()).has(k)
      && options.some((o) => instrumentServesCapital(k, [o])));
  if (indefinite.length) {
    console.log(`  ...and reachable by EVERY option because the label names no ` +
      `kind of capital: ` + indefinite.map(([k, n]) => `${k} (${n})`).join(", "));
  }

  // Per country, the share of publishable instruments the harness constant hides.
  const HARNESS = ["grant", "loan"];
  const byCountry = new Map<string, { n: number; hidden: number }>();
  for (const i of offerableList) {
    const c = byCountry.get(i.country) ?? { n: 0, hidden: 0 };
    c.n++;
    if (!passesCapitalPreference(i, HARNESS) || !instrumentServesCapital(i.capitalType, HARNESS)) c.hidden++;
    byCountry.set(i.country, c);
  }
  console.log(`\npublishable instruments the harness constant [${HARNESS}] hides, by country:`);
  for (const [k, m] of [...byCountry].sort((a, b) => b[1].hidden - a[1].hidden).slice(0, 12)) {
    if (!m.hidden) continue;
    console.log(`  ${k.padEnd(4)} ${String(m.hidden).padStart(4)} of ${String(m.n).padStart(4)}` +
      `  (${(100 * m.hidden / m.n).toFixed(0)}%)`);
  }

  // ── The answer-key side ──────────────────────────────────────────────────
  const { file, rows: all } = loadRecallSet();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, file);

  for (const split of ["tune", "holdout"]) {
    const rows = pop.graded.filter((r) => r.split === split);
    const tally = new Map<string, number>();
    let blocked = 0;
    for (const r of rows) {
      const inst = byId.get(r.instrument);
      const ct = inst?.capitalType ?? "(unknown)";
      tally.set(ct, (tally.get(ct) ?? 0) + 1);
      if (inst && (!passesCapitalPreference(inst, HARNESS)
        || !instrumentServesCapital(inst.capitalType, HARNESS))) blocked++;
    }
    console.log(`\n${file} split=${split}: ${rows.length} gradable pairs, ` +
      `answer capital_type:`);
    for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${k}  (${(100 * n / rows.length).toFixed(1)}%)`);
    }
    console.log(`  CEILING on pool imposed by capitalSought=[${HARNESS}]: ` +
      `${(100 * (rows.length - blocked) / rows.length).toFixed(1)}%  ` +
      `(${blocked} pairs unreachable by the founder's own stated preference)`);
    // What each additional intake option would recover, one at a time.
    for (const opt of CAPITAL_OPTIONS) {
      if (HARNESS.includes(opt.value)) continue;
      const wider = [...HARNESS, opt.value];
      let recovered = 0;
      for (const r of rows) {
        const inst = byId.get(r.instrument);
        if (!inst) continue;
        const wasBlocked = !passesCapitalPreference(inst, HARNESS)
          || !instrumentServesCapital(inst.capitalType, HARNESS);
        const nowOk = passesCapitalPreference(inst, wider)
          && instrumentServesCapital(inst.capitalType, wider);
        if (wasBlocked && nowOk) recovered++;
      }
      console.log(`    + "${opt.label}" would make ${recovered} of those reachable`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
