// wsEO — WHICH OPEN FUNDS ACTUALLY REACH A REAL FOUNDER'S MENU.
//
// ── Why this and not "which rows are missing text" ────────────────────────
// P1's target is stated as a coverage percentage, and a coverage percentage is
// a fact about the corpus, not about a founder. 398 open rows carry no
// description; 228 of them are in countries where this repo holds no founder at
// all, so fetching them would raise the number and move nothing that is
// measured. The owner's constraint is the correct one: prioritise by
// APPEARANCES IN A REAL FOUNDER'S MENU, among funds that are open.
//
// So this replays the real recall population through the production pool
// builder and tallies, per instrument, how many founders' menus it lands in. It
// reports two depths because the plan moves the seam between them:
//   - accessible  — `accessiblePool()`, the whole list a founder could be shown
//                   (P2/P3's target, ceiling 77.5%)
//   - shown       — the first VERDICT_POOL rows, which is the menu today
//
// ── FREE by construction ─────────────────────────────────────────────────
// ANTHROPIC_API_KEY is deleted before any import. The only paid call is the
// Voyage embedding behind `semanticFundMatch`, the shipped ranker, which prints
// its own tally line.
//
// ── It cannot read an answer ─────────────────────────────────────────────
// The tally is over POOL MEMBERSHIP only. The won instrument is never read, and
// nothing here is keyed on it: this measures demand, not recall.
//
//   npx tsx scripts/_wsey_menu_demand.ts
//   LIMIT=25 npx tsx scripts/_wsey_menu_demand.ts     (a smoke run)
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsey_menu_demand", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  findPeersBySubsector, hydrateDbInstruments, isGenericSubsector, loadDbInstruments,
  matchCompany, publishableInstruments, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList, tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { VERDICT_POOL } from "../lib/intelligence/caps";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet } from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsey_menu_demand");
  const corpus = loadDbInstruments();
  const open = publishableInstruments();
  const openById = new Map(open.map((i) => [i.id, i]));
  const inCorpus = new Map(corpus.map((i) => [i.id, i]));

  const { rows: all } = loadRecallSet("wseo menu demand");
  // DESCRIBED, because an undescribed founder gives the semantic ranker nothing
  // to rank on and its pool would be a fact about our gaps, not about demand.
  // One founder per company, sorted first, so the sample is deterministic.
  const seen = new Set<string>();
  let pop = all.filter(isDescribed)
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  // ── STRIDE, not slice ────────────────────────────────────────────────────
  // A capped run has to keep the population's COUNTRY MIX or the ranking it
  // produces is a ranking of the sample. `LIMIT=250` takes the first 250
  // companies in name order, and measured on this set that is 82 British
  // founders out of 250 (33%) against 183 of 1,534 in the population (12%) --
  // GB has no open row in this corpus, so its pools are EU-level funds, and a
  // GB-heavy sample ranks EU-level demand up and Swedish and Czech demand down.
  // The bias is not noise: company names cluster by market.
  //
  // STRIDE=6 takes every sixth founder instead. Same deterministic order, same
  // country mix to within a founder or two, ~1/6 the wall clock. LIMIT is kept
  // for a smoke run and says what it costs.
  const stride = Number(process.env.STRIDE ?? 0);
  if (stride > 1) pop = pop.filter((_, i) => i % stride === 0);
  const limit = Number(process.env.LIMIT ?? 0);
  if (limit > 0) pop = pop.slice(0, limit);
  const byCountry = new Map<string, number>();
  for (const r of pop) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
  console.log(`replaying ${pop.length} described founders over ${open.length} open rows`);
  console.log("  founders by country: " +
    [...byCountry].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));

  const policy: FounderPolicy = founderPolicyFromEnv();
  resetRankerTally();
  const accessible = new Map<string, number>();
  const shown = new Map<string, number>();
  let poolTotal = 0;
  let done = 0;
  for (const t of pop) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    const self = matchCompany(f.company, f.country);
    const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
    const peers = sub
      ? findPeersBySubsector(sub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const semantic = await semanticFundMatch(f.opts.description ?? "");
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(peers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(
        f.country, f.opts.targetMarkets, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);
    const pool = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
    poolTotal += pool.length;
    pool.forEach((r, idx) => {
      const id = r.instrumentId;
      if (!id) return;
      accessible.set(id, (accessible.get(id) ?? 0) + 1);
      if (idx < VERDICT_POOL) shown.set(id, (shown.get(id) ?? 0) + 1);
    });
    if (++done % 50 === 0) console.log(`  ${done}/${pop.length}`);
  }
  console.log(rankerTallyLine());

  const n = pop.length;
  const rows = open.map((i) => ({
    id: i.id,
    name: i.name,
    country: i.country,
    described: Boolean((i.description ?? "").trim()),
    accessible: accessible.get(i.id) ?? 0,
    shown: shown.get(i.id) ?? 0,
  })).sort((a, b) => b.accessible - a.accessible || b.shown - a.shown);

  const reached = rows.filter((r) => r.accessible > 0);
  const undescribedReached = reached.filter((r) => !r.described);
  console.log(`\nmean accessible pool ${(poolTotal / (n || 1)).toFixed(1)}`);
  console.log(`open rows that reach ANY founder's accessible pool: ${reached.length} of ${open.length}`);
  console.log(`  ... of which undescribed: ${undescribedReached.length}`);
  console.log(`open rows that reach NOBODY: ${open.length - reached.length} ` +
    `(${rows.filter((r) => r.accessible === 0 && !r.described).length} of them undescribed)`);

  console.log("\nTOP UNDESCRIBED OPEN ROWS BY MENU APPEARANCES:");
  for (const r of undescribedReached.slice(0, 60)) {
    console.log(`  ${String(r.accessible).padStart(5)} acc ${String(r.shown).padStart(5)} shown  ` +
      `${r.country.padEnd(3)} ${r.id.padEnd(34)} ${r.name.slice(0, 46)}`);
  }

  const cc = new Map<string, { rows: number; appearances: number }>();
  for (const r of undescribedReached) {
    const e = cc.get(r.country) ?? { rows: 0, appearances: 0 };
    e.rows += 1; e.appearances += r.accessible; cc.set(r.country, e);
  }
  console.log("\nundescribed demand by country (rows reaching a menu, total appearances):");
  for (const [k, e] of [...cc].sort((a, b) => b[1].appearances - a[1].appearances)) {
    console.log(`  ${k.padEnd(4)} rows=${String(e.rows).padStart(4)} appearances=${e.appearances}`);
  }

  // OUT rather than a second copy of this file with one string changed. A
  // capped run and a full run differ by two env vars and must not differ by a
  // module, or the two drift and the one that drifts is the one still quoted.
  const out = process.env.OUT ?? "/tmp/wsey_menu_demand.json";
  writeFileSync(out, JSON.stringify({
    founders: n, openPool: open.length, meanPool: poolTotal / (n || 1), rows,
  }, null, 1));
  console.log(`\nwrote ${out}`);
  void inCorpus; void openById;
}
main();
