// wsFX — diagnostic only. Reads Postgres, writes nothing anywhere.
//
// Prices the proposed suppression against the SHIPPED pool, per country, so
// the cost is measured rather than asserted. Reads the committed evidence file
// as its input, so the number always tracks the evidence rather than a
// hand-copied list.
//
//   npx tsx scripts/_wsfx_cost.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wsfx_cost", ["DATABASE_URL"]);

import { hydrateDbInstruments, publishableInstruments } from "../lib/intelligence/corpus";

const EVIDENCE = join(__dirname, "..", "..", "..", "project-mgmt", "evidence",
  "funder_evidence_2026-08-12.jsonl");

type Ev = { instrument_id: string; country: string; verdict: string; action: string };

function tally<T>(rows: readonly T[], key: (r: T) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) { const k = key(r); m[k] = (m[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

async function main() {
  const ev: Ev[] = readFileSync(EVIDENCE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  await hydrateDbInstruments();
  const pool = publishableInstruments();
  const inPool = new Map(pool.map((p: any) => [p.id, p]));

  const poolByCountry = tally(pool, (p: any) => p.country ?? "??");

  // Only rows the evidence marks `suppress` — the funder's own page settled it.
  const suppress = ev.filter((e) => e.action === "suppress");
  const rekey = ev.filter((e) => e.action === "rekey");

  function cost(rows: Ev[], label: string) {
    const hit = rows.filter((r) => inPool.has(r.instrument_id));
    const byC = tally(hit, (r) => r.country);
    const per = Object.entries(byC).map(([c, n]) => ({
      country: c, removed: n, poolBefore: poolByCountry[c] ?? 0,
      poolAfter: (poolByCountry[c] ?? 0) - n,
      pctOfCountry: +(100 * n / (poolByCountry[c] || 1)).toFixed(1),
    })).sort((a, b) => b.pctOfCountry - a.pctOfCountry);
    return {
      label,
      rowsProposed: rows.length,
      rowsActuallyInPool: hit.length,
      poolBefore: pool.length,
      poolAfter: pool.length - hit.length,
      pctOfPool: +(100 * hit.length / pool.length).toFixed(1),
      perCountry: per,
    };
  }

  const out = {
    asOf: new Date().toISOString().slice(0, 10),
    evidenceRows: ev.length,
    byVerdict: tally(ev, (e) => e.verdict),
    byAction: tally(ev, (e) => e.action),
    suppress: cost(suppress, "settled non-offerable — propose removing"),
    rekey: cost(rekey, "wrong unit — do NOT remove until the replacement lands"),
    bothIfRekeyAlsoRan: cost([...suppress, ...rekey], "suppress + rekey together"),
  };
  process.stdout.write(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
