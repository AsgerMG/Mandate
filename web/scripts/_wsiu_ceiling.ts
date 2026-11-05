/**
 * wsIU — THE CEILING ON THIS CHANGE, DERIVED OFFLINE FROM THE COMMITTED
 * SNAPSHOT AND THE COMMITTED POPULATION. No Postgres, no Voyage, no model.
 *
 * A founder can only recover THEIR OWN won fund from a naming repair if the
 * fund they won is one of the rows the repair renames. So the count of founders
 * in the graded population whose won instrument is one of the eight
 * `innovasjon_norge_*` leaves is a HARD CEILING on what this change can add to
 * EXACT@6 — every other founder it can only move menu rows for.
 *
 * The population is reproduced by the same three calls `_wsif_reach.ts` makes,
 * in the same order, with the same defaults, so it is the same 897 founders.
 *
 * Run from web:  SPLIT=all N=897 npx tsx scripts/_wsiu_ceiling.ts
 */
delete process.env.DATABASE_URL;

async function main() {
  const { loadDbInstruments, publishableInstruments } = await import("../lib/intelligence/corpus");
  const { DEFAULT_SEED, sampleRecall } = await import("./recallSample");
  const {
    assertAncestorConvention, assertGradablePopulation, loadRecallSet,
    partitionByOfferable, reattributeMissingAnswers,
  } = await import("./recallSet");

  const { file, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, file);
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  const n = Math.min(Number(process.env.N ?? 40), set.length);
  const drawn = sampleRecall(set, n, Number(process.env.SEED ?? DEFAULT_SEED));

  const IN = drawn.filter((r) => r.instrument.startsWith("innovasjon_norge_"));
  const NO = drawn.filter((r) => r.country === "NO");
  console.log(`\npopulation drawn: ${drawn.length}`);
  console.log(`  founders in country NO                       ${NO.length}`);
  console.log(`  founders whose WON fund is an Innovasjon Norge leaf   ${IN.length}`
    + `   -> CEILING ${(IN.length / drawn.length * 100).toFixed(2)} points on EXACT@6`);
  const by = new Map<string, number>();
  for (const r of IN) by.set(r.instrument, (by.get(r.instrument) ?? 0) + 1);
  for (const [k, v] of [...by].sort()) console.log(`      ${k.padEnd(40)} ${v}`);

  // The same ceiling for every other class the whole-corpus rename touches, so
  // the Norwegian share of wsIF's 12 is not assumed.
  // THE OTHER NINE CLASSES, exactly — the ids check_row_titles_distinct itself
  // groups, not a prefix that catches their unrelated siblings.
  const OTHER = new Set([
    "bdns_conv_880456", "bdns_conv_880548", "bdns_conv_880457", "bdns_conv_880579",
    "cdti_idi", "cdti_neotec",
    "bpifrance_innovup_leader_idf", "bpifrance_inov", "bpifrance_pmup_idf",
    "satr_fr_equity__sa_111723__ministere_de_l_economie_et_des_finances",
    "satr_fr_equity__sa_111723__ministere_de_la_transition_ecologique_et_solidai",
    "satr_fr_rnd__sa_111723__ministere_de_l_economie_et_des_finances",
    "satr_fr_rnd__sa_111723__ministere_de_la_transition_ecologique_et_solidai",
    "satr_fr_rnd__sa_111723__ministere_des_armees",
    "satr_fr_rnd__sa_111726__direction_generale_de_l_amenagement_du_logement_",
    "satr_fr_rnd__sa_111726__ministere_de_la_transition_ecologique_et_solidai",
    "satr_it_rnd__sa_110595__ministero_dell_universita_e_della_ricerca_direzi",
    "satr_it_rnd__sa_110595__ufficio_coordinamento_pnrr_e_dipartimenti_di_ecc",
    "altum_aue", "altum_aui",
  ]);
  const others = drawn.filter((r) => OTHER.has(r.instrument));
  console.log(`\n  founders whose won fund is in one of the OTHER nine same-name classes: ${others.length}`);
  const ob = new Map<string, number>();
  for (const r of others) ob.set(r.instrument, (ob.get(r.instrument) ?? 0) + 1);
  for (const [k, v] of [...ob].sort()) console.log(`      ${k.padEnd(75)} ${v}`);
}

main();

export {};
