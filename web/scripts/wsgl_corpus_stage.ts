/**
 * The CORPUS stage of the funnel, on its own, against Postgres.
 *
 * `measure_funnel` walks every stage and needs an embedding call per founder.
 * The first four rows of that ladder need none: they are pure predicates over
 * `funding_instruments`. This runs those, so the attribution of the
 * publishability loss can be re-derived in seconds and for nothing, as often as
 * the corpus changes.
 *
 * Reads only. Writes a JSON blob to stdout when `JSON=1`.
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention. No embedding call, no model call.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsgl_corpus_stage", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishabilityContext,
  publishabilityFailures, publishableInstruments, requireLiveCorpus,
  suppressedForUnconfirmedLiveness,
} from "../lib/intelligence/corpus";
import {
  assertAncestorConvention, isDescribed, loadRecallSet, reattributeMissingAnswers,
} from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsgl_corpus_stage");
  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const ctx = publishabilityContext(corpus);
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const degraded = new Set(suppressedForUnconfirmedLiveness().map((r) => r.id));

  const { file, rows: all } = loadRecallSet("wsgl corpus stage");
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  // The SAME population `measure_funnel` draws: held out, described, one
  // founder per company, taken BEFORE the offerability cut. Restated here
  // rather than imported because measure_funnel builds it inline inside
  // `main()`; if that is ever extracted, this should call it.
  const split = process.env.SPLIT ?? "holdout";
  const seen = new Set<string>();
  const drawn = fixed.rows
    .filter((r) => (split === "all" || r.split === split) && isDescribed(r))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));

  const reasons = new Map<string, number>();
  const perReasonRows = new Map<string, Map<string, number>>();
  let lost = 0, unattributed = 0;
  for (const t of drawn) {
    const won = t.instrument;
    if (!inCorpus.has(won) || offerable.has(won) || degraded.has(won)) continue;
    lost++;
    const why = publishabilityFailures(byId.get(won)!, ctx);
    if (!why.length) unattributed++;
    for (const w of why) {
      reasons.set(w, (reasons.get(w) ?? 0) + 1);
      const m = perReasonRows.get(w) ?? new Map<string, number>();
      m.set(won, (m.get(won) ?? 0) + 1);
      perReasonRows.set(w, m);
    }
  }

  console.log(`set=${file} population=${drawn.length} corpus=${corpus.length} `
    + `publishable=${offerable.size} degraded=${degraded.size}`);
  console.log(`lost at the publishability stage: ${lost}`
    + ` (${((lost / drawn.length) * 100).toFixed(1)} pts)\n`);
  for (const [w, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(5)}  ${w}`);
    const rows = [...(perReasonRows.get(w) ?? [])].sort((a, b) => b[1] - a[1]);
    for (const [id, c] of rows.slice(0, 8)) {
      console.log(`         ${String(c).padStart(3)}  ${id}  ${byId.get(id)?.name ?? ""}`);
    }
    if (rows.length > 8) console.log(`         ... ${rows.length - 8} more instrument(s)`);
  }
  console.log(`${String(unattributed).padStart(5)}  UNATTRIBUTED`);

  // Corpus-wide, independent of any founder: what each predicate costs the
  // whole instrument table. The founder view above is weighted by who won what.
  const wide = new Map<string, number>();
  for (const i of corpus) {
    for (const w of publishabilityFailures(i, ctx)) wide.set(w, (wide.get(w) ?? 0) + 1);
  }
  console.log("\ncorpus-wide (rows, not founders):");
  for (const [w, n] of [...wide].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(5)}  ${w}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
