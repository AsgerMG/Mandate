// wsID — HOW MANY FOUNDERS LOSE A ROW TO A COLLISION THE CUT INVENTED.
//
// Free: one Voyage embed and one Postgres read per founder, no model call, no
// write. Production's own table build, so this grades the rows a founder is
// actually served.
//
// ── The question ───────────────────────────────────────────────────────────
// `distinguishRowNames` groups rows by their RAW label. `resolveNameCollisions`
// keys on `rowRenderedLabel`, the same string cut to ROW_TITLE_CHARS. Two rows
// whose titles differ only past character 120 are therefore INVISIBLE to the
// disambiguator -- it sees two distinct names and has nothing to resolve -- and
// IDENTICAL to the collapse, which demotes one of them out of the founder's
// table. nameCollision.ts's own contract says the two must be one function.
//
// So, per founder: how many collisions fire on a pair whose FULL names differ,
// and how often is the row demoted by one of them the fund this founder won.
//
//   SPLIT=all N=897 npx tsx scripts/_wsid_reach.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsid_reach", ["DATABASE_URL", "VOYAGE_KEY"]);

import { SELECT_DEPTH } from "../lib/intelligence/caps";
import {
  findPeersBySubsector, hydrateDbInstruments, isGenericSubsector, loadDbInstruments,
  matchCompany, publishableInstruments, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { oneLine, ROW_TITLE_CHARS } from "../lib/intelligence/schemeText";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import {
  buildInstrumentTableHydrated, founderCountryList, tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const rendered = (r: InstrumentRow) => oneLine(r.instrument, ROW_TITLE_CHARS).toLowerCase();

function founders(): RecallRow[] {
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
  return sampleRecall(set, Math.min(num(process.env.N, 40), set.length),
    num(process.env.SEED, DEFAULT_SEED));
}

async function tableFor(t: RecallRow, policy: FounderPolicy): Promise<InstrumentRow[]> {
  resetGateHydration();
  const f = founderIntake(t, policy);
  const self = matchCompany(f.company, f.country);
  const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
  const dbPeers = sub
    ? findPeersBySubsector(sub, { country: f.country, limit: 4, exclude: [f.company] }) : [];
  const semantic = await semanticFundMatch(f.opts.description ?? "");
  return buildInstrumentTableHydrated({
    fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
    founderCountries: founderCountryList(
      f.country, (f.opts.targetMarkets ?? []) as string[],
      (f.eligibility.entityCountries ?? []) as string[]),
    capitalSought: (f.opts.capitalSought ?? []) as string[],
    description: f.opts.description ?? "",
    semantic,
    ...tableInputFromAnswers(f.eligibility as never),
    log: new ExclusionLog(),
  } as never);
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsid_reach");
  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "off") as AnswerMode,
  };
  const set = founders();
  console.log(`founders=${set.length} split=${process.env.SPLIT ?? "tune"} `
    + `pool=${VERDICT_POOL} menu=${SELECT_DEPTH}`);

  let anyCollision = 0, cutInvented = 0, wonDemoted = 0, wonDemotedCutInvented = 0;
  let seatsLost = 0, seatsLostCutInvented = 0;
  const examples: string[] = [];

  for (const t of set) {
    const table = await tableFor(t, policy);
    // The pool as the memo sees it: the collapse's losers were appended at the
    // very back by `materialiseInstrumentTable`, so the whole array is the
    // universe and the first VERDICT_POOL of it is what competes.
    const by = new Map<string, InstrumentRow[]>();
    for (const r of table) by.set(rendered(r), [...(by.get(rendered(r)) ?? []), r]);
    let has = false, hasInvented = false, wd = false, wdInvented = false;
    for (const [, peers] of by) {
      if (peers.length < 2) continue;
      has = true;
      seatsLost += peers.length - 1;
      const raws = new Set(peers.map((r) => r.instrument.trim().toLowerCase()));
      const invented = raws.size > 1;
      if (invented) { hasInvented = true; seatsLostCutInvented += peers.length - 1; }
      // The demoted rows are the ones behind the survivor in the array.
      const idx = peers.map((r) => table.indexOf(r));
      const keptAt = Math.min(...idx);
      for (const r of peers) {
        if (table.indexOf(r) === keptAt) continue;
        if (r.instrumentId === t.instrument) { wd = true; if (invented) wdInvented = true; }
      }
      if (invented && examples.length < 10) {
        examples.push(`${t.name} (${t.country}) — ${peers.length} rows render alike, `
          + `${raws.size} distinct full names:\n`
          + peers.map((r) => `      ${r.instrumentId}\n        ${r.instrument}`).join("\n"));
      }
    }
    if (has) anyCollision++;
    if (hasInvented) cutInvented++;
    if (wd) wonDemoted++;
    if (wdInvented) wonDemotedCutInvented++;
  }

  const pct = (n: number) => `${(100 * n / set.length).toFixed(1)}%`;
  console.log("");
  console.log(`founders with >=1 rendered-label collision anywhere in the table  ${anyCollision} (${pct(anyCollision)})`);
  console.log(`   ...where the colliding rows have DIFFERENT full names          ${cutInvented} (${pct(cutInvented)})`);
  console.log(`seats demoted by the collapse, total                              ${seatsLost}`);
  console.log(`   ...demoted on a pair the cut made identical                    ${seatsLostCutInvented}`);
  console.log(`founders whose WON fund was the demoted row                       ${wonDemoted} (${pct(wonDemoted)})`);
  console.log(`   ...on a pair the cut made identical                            ${wonDemotedCutInvented} (${pct(wonDemotedCutInvented)})`);
  console.log("");
  for (const e of examples) console.log("  " + e + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
