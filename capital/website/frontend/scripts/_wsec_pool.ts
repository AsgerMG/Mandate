// wsEC — WHAT IS IN THE EIGHTEEN, AND WHAT THE WON FUND LOST ITS SEAT TO.
//
// ── The question ──────────────────────────────────────────────────────────
// The won fund is somewhere in the accessible pool on 77.5% of held-out
// founders and inside the eighteen rows the selector is actually shown on
// 44.2% of them (`poolRecallCurve.generated.json`, n=846). wsDR closed the
// obvious response: showing more rows changes nothing and costs EXACT@5. So
// the question is not how many rows, it is WHICH eighteen.
//
// This script answers it without a model. Everything below is a reorder of one
// replay's rows, so the whole space is offline arithmetic over a tape cut once
// per founder: one Voyage embed and one Postgres read, exactly what
// `_wsdr_curve.ts` already pays for.
//
// ── What is recorded, per founder ─────────────────────────────────────────
//   * the SHIPPED order of the accessible pool (what `VERDICT_POOL` cuts)
//   * the SCORE order — `tableTrace`'s `collapsed` stage, which is the exact
//     array `applyPeerPrecedence` is handed, i.e. the pool before the peer
//     prior touches it
//   * the peer prior's rank for every accessible row, off the same
//     (country, sector) cell the shipped code reads
//   * per row: channel, scheme code, family, administering body, relevance,
//     the two boolean tiers above the score, the `mostly X` descriptor and the
//     award median — the last two being the two disqualifiers wsDY scored the
//     bench menus on
//   * the won fund's rank under every ordering
//
// Nothing here decides anything and nothing is written back into the pipeline.
//
// ── FREE BY CONSTRUCTION ──────────────────────────────────────────────────
// ANTHROPIC_API_KEY is deleted before anything that could use it is imported,
// exactly as `_wsdr_curve.ts` does it.
//
//   npx tsx scripts/_wsec_pool.ts                 (the full holdout, n=846)
//   LIMIT=25 npx tsx scripts/_wsec_pool.ts        (a smoke run)
//   OUT=/tmp/pool.json npx tsx scripts/_wsec_pool.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsec_pool", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList, peerPrior,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { readTrace, traceOn, traceReset } from "../lib/intelligence/tableTrace";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";

/** One accessible row, everything a reorder or a disqualifier could read. */
export interface PoolRow {
  id: string;
  /** The display name the founder reads, so a displacer tally names funds
   *  rather than ids. */
  name: string;
  channel: string;
  /** Notified scheme code, when the row is a per-authority child of one. */
  scheme: string;
  /** The instrument's parent family, when it has one — the strongest available
   *  "one programme in different clothes" key. */
  family: string;
  body: string;
  country: string;
  /** The corpus's own `mostly X` label, or "" when the row carries none. */
  mostly: string;
  /** Median of this instrument's OWN awards, null when it has none on file. */
  median: number | null;
  /** Rank in the shipped SCORE order (the array peer precedence is handed). */
  scoreRank: number;
  /** Rank in the (country, sector) peer prior; -1 = the prior has never seen it. */
  peerRank: number;
}

export interface FounderTape {
  company: string;
  country: string;
  sector: string;
  ticketBand: string;
  want: string;
  branch: "specific" | "flat" | "none";
  seatsHeld: number;
  priorLen: number;
  /** The accessible pool IN SHIPPED ORDER. */
  rows: PoolRow[];
}

const num = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsec_pool");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));

  const { rows: all } = loadRecallSet("wsec pool");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  // The same population `_wsdr_curve.ts` measured the curve on: held out,
  // described, one founder per company, deterministic order. A composition
  // measured on a different population could not be read against 44.2%.
  // Held out by default, so a figure quoted off this tape is quoted off the
  // same split the curve is. `SPLIT=tune` is what a candidate ordering is
  // CHOSEN on: picking a constant by reading holdout is not a holdout number.
  const split = process.env.SPLIT ?? "holdout";
  let graded = pop.graded.filter((r) => r.split === split && isDescribed(r));
  const seen = new Set<string>();
  graded = [...graded].sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  const limit = num(process.env.LIMIT, 0);
  if (limit > 0) graded = graded.slice(0, limit);
  console.log(`cutting the pool tape on ${graded.length} ${split} described founders`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  resetRankerTally();
  traceOn();

  const tapes: FounderTape[] = [];
  let done = 0;
  for (const t of graded) {
    resetGateHydration();
    traceReset();
    const f = founderIntake(t, policy);
    const selfRecord = matchCompany(f.company, f.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const semantic = await semanticFundMatch(f.opts.description ?? "");
    const log = new ExclusionLog();
    const countries = founderCountryList(
      f.country, f.opts.targetMarkets, f.eligibility.entityCountries);
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: countries,
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);
    // NO SLICE, exactly as the curve does it: the ranked accessible pool is
    // the list every seam position cuts out of.
    const pool = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);

    const { stages, facts, peerBranch, scoreSeats } = readTrace();
    const collapsed = stages.find((s) => s.name === "collapsed")?.ids ?? [];
    const final = stages.find((s) => s.name === "final")?.ids ?? [];
    // The score order is `collapsed` followed by the rows the name collision
    // demoted — which is exactly how `final` is assembled, minus the peer
    // reorder. Built from the recorded stages rather than re-derived, so it
    // cannot drift from what the code did.
    const inCollapsed = new Set(collapsed);
    const scoreOrder = [...collapsed, ...final.filter((id) => !inCollapsed.has(id))];
    const scoreRankOf = new Map(scoreOrder.map((id, i) => [id, i]));
    const factOf = new Map(facts.map((x) => [x.id, x]));

    const prior = peerPrior(countries[0], f.eligibility.sector);
    const peerRankOf = new Map(prior.map((id, i) => [id, i]));

    tapes.push({
      company: t.name,
      country: f.country,
      sector: f.eligibility.sector ?? "",
      ticketBand: String(f.eligibility.ticketBand ?? ""),
      want: t.instrument,
      branch: peerBranch,
      seatsHeld: scoreSeats,
      priorLen: prior.length,
      rows: pool.map((r): PoolRow => {
        const id = r.instrumentId ?? r.channel;
        const inst = r.instrumentId ? byId.get(r.instrumentId) : undefined;
        const m = /· mostly ([^·]+)$/.exec(r.descriptor ?? "");
        return {
          id,
          name: r.instrument,
          channel: r.channel,
          scheme: (factOf.get(id)?.schemeCode ?? r.schemeCode ?? "").trim(),
          family: inst?.parentId ?? "",
          body: r.administeringBody ?? "",
          country: r.country ?? "",
          mostly: m ? m[1].trim() : "",
          median: r.typicalAward ?? null,
          scoreRank: scoreRankOf.get(id) ?? 1e6,
          peerRank: peerRankOf.get(id) ?? -1,
        };
      }),
    });
    if (++done % 25 === 0) console.log(`  ${done}/${graded.length}`);
  }

  const prov = corpusProvenance();
  const OUT = process.env.OUT ?? "/tmp/wsec_pool.json";
  writeFileSync(OUT, `${JSON.stringify({
    what: "The accessible memo pool per held-out founder, in shipped order, with "
      + "the score order and the peer prior's rank attached to every row. Cut so "
      + "the composition of the eighteen the selector is shown can be measured "
      + "without a model.",
    generatedBy: "scripts/_wsec_pool.ts",
    corpus: `${prov.source} instruments=${prov.instruments}`,
    generatedAt: new Date().toISOString(),
    n: tapes.length,
    tapes,
  })}\n`);
  console.log(`\ncorpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`wrote ${OUT} (${tapes.length} tapes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
