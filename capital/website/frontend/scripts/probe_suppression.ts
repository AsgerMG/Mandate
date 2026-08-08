// What the degradation policy withholds, row by row, and what it costs the
// French answer key.
//
// Diagnostic only — nothing in the request path imports this. It exists to
// answer the one question the archetype table cannot: of the rows the policy
// withholds, how many are rows a French founder actually WON, and would the
// live register have called any of them closed?
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// The live-register arm below reconnects deliberately with LIVE_URL, so the
// fallback arm can be forced onto the snapshot without losing the referee.
// Captured BEFORE the contract, which deletes DATABASE_URL under NO_PG — the
// referee must survive the offline declaration, or this probe compares the
// snapshot against itself.
const LIVE_URL = process.env.DATABASE_URL;
requireCredentials("probe_suppression", ["DATABASE_URL"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  suppressedForUnconfirmedLiveness,
} from "../lib/intelligence/corpus";
import { isClosed, opennessEvidence, today } from "../lib/intelligence/liveness";
import { loadRecallSet } from "./recallSet";

async function main() {
  // ── The fallback arm: exactly what a degraded request builds ──────────────
  await hydrateDbInstruments();
  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} observedAt=${prov.observedAt}`);
  const publishable = publishableInstruments();
  const withheld = suppressedForUnconfirmedLiveness();
  const all = loadDbInstruments();
  console.log(`publishable=${publishable.length} withheld=${withheld.length}`);

  const byId = new Map(all.map((i) => [i.id, i]));
  const byCountry = new Map<string, number>();
  const byPop = new Map<string, number>();
  const byReason = new Map<string, number>();
  for (const w of withheld) {
    byCountry.set(w.country, (byCountry.get(w.country) ?? 0) + 1);
    const i = byId.get(w.id);
    const pop = `${i?.sourceFamilyBucket ?? "?"}|${i?.country ?? "?"}`;
    byPop.set(pop, (byPop.get(pop) ?? 0) + 1);
    const key = w.reason.slice(0, 40);
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  console.log("\nWITHHELD by country:", [...byCountry].sort((a, b) => b[1] - a[1]));
  console.log("WITHHELD by population:", [...byPop].sort((a, b) => b[1] - a[1]));
  console.log("WITHHELD by reason:", [...byReason]);

  // ── The French answer key ─────────────────────────────────────────────────
  const { rows } = loadRecallSet();
  const fr = rows.filter((r: any) => r.country === "FR" && r.split === "holdout");
  const withheldIds = new Set(withheld.map((w) => w.id));
  const frLost = fr.filter((r: any) => withheldIds.has(r.instrument));
  console.log(`\nFR holdout pairs: ${fr.length}; answers among the withheld: ${frLost.length}`);
  const lostByFund = new Map<string, number>();
  for (const r of frLost as any[]) {
    const id = r.instrument;
    lostByFund.set(id, (lostByFund.get(id) ?? 0) + 1);
  }
  console.log("top withheld answers:",
    [...lostByFund].sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([id, n]) => `${n}x ${byId.get(id)?.name ?? id} [${id}]`));

  // ── Per-row detail on the withheld set ────────────────────────────────────
  const asOf = today();
  const detail = withheld.map((w) => {
    const i = byId.get(w.id)!;
    return {
      id: w.id, name: i.name, country: i.country,
      pop: `${i.sourceFamilyBucket}|${i.country}`,
      schemeEndDate: i.schemeEndDate ?? null,
      schemeEndBasis: i.schemeEndBasis ?? null,
      lastYear: i.lastYear ?? null,
      evidence: opennessEvidence(i, asOf),
      frAnswers: lostByFund.get(w.id) ?? 0,
      eventCount: i.eventCount,
    };
  });
  writeFileSync("/tmp/wsAC_withheld.json", JSON.stringify(detail, null, 2));
  console.log(`\nwrote ${detail.length} rows to /tmp/wsAC_withheld.json`);

  // ── Would the LIVE register call any of them closed? ──────────────────────
  if (LIVE_URL && withheld.length) {
    const { Client } = await import("pg");
    const c = new Client({ connectionString: LIVE_URL, connectionTimeoutMillis: 15_000 });
    await c.connect();
    try {
      const res = await c.query(
        `SELECT id, scheme_end_date, scheme_end_date_basis, last_year
           FROM funding_instruments WHERE id = ANY($1)`, [withheld.map((w) => w.id)]);
      const live = new Map(res.rows.map((r: any) => [r.id, r]));
      let liveClosed = 0, liveHasDate = 0, absent = 0;
      for (const w of withheld) {
        const l = live.get(w.id);
        if (!l) { absent++; continue; }
        if (l.scheme_end_date) liveHasDate++;
        if (isClosed({
          schemeEndDate: l.scheme_end_date, schemeEndBasis: l.scheme_end_date_basis,
          lastYear: l.last_year,
        }, asOf)) liveClosed++;
      }
      console.log(`\nOF THE ${withheld.length} WITHHELD, ON THE LIVE REGISTER:`);
      console.log(`  ${liveHasDate} carry a scheme_end_date the snapshot does not`);
      console.log(`  ${liveClosed} are actually CLOSED  <- the harm the policy prevents`);
      console.log(`  ${absent} are absent from the live register`);
      console.log(`  ${withheld.length - liveClosed - absent} are withheld and OPEN <- the collateral`);
    } finally { await c.end(); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
