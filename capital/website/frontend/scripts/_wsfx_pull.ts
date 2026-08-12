// wsFX — diagnostic only. Reads Postgres, writes nothing anywhere.
//
// Pulls the rows whose openness rests on OUR OWN AWARD HISTORY — a past
// `notified_duration` reopened by `last_year > endYear` in isClosed() — plus
// the Norwegian population, with every field a human needs to go and check the
// funder's own page: the source URL, the scheme code, the declared window, the
// award tail.
//
//   npx tsx scripts/_wsfx_pull.ts > /path/to/pull.json

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wsfx_pull", ["DATABASE_URL"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments,
  publishableInstruments,
} from "../lib/intelligence/corpus";
import { isClosed, opennessEvidence, today } from "../lib/intelligence/liveness";

function tally<T>(rows: readonly T[], key: (r: T) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) { const k = key(r); m[k] = (m[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

function pick(r: any) {
  return {
    id: r.id,
    name: r.name,
    country: r.country,
    schemeCode: r.schemeCode ?? null,
    schemeEndDate: r.schemeEndDate ?? null,
    schemeEndBasis: r.schemeEndBasis ?? null,
    lastYear: r.lastYear ?? null,
    firstYear: r.firstYear ?? null,
    sourceWindowPolicy: r.sourceWindowPolicy ?? null,
    successorScheme: r.successorScheme ?? null,
    sourceUrl: r.sourceUrl ?? null,
    sourcePage: r.sourcePage ?? null,
    url: r.url ?? null,
    funder: r.funder ?? r.funderName ?? null,
    family: r.sourceFamilyBucket ?? null,
    capitalType: r.capitalType ?? null,
    eventCount: r.eventCount ?? null,
    totalEur: r.totalEur ?? null,
  };
}

async function main() {
  await hydrateDbInstruments();
  const prov = corpusProvenance();
  const asOf = today();
  const all = loadDbInstruments();
  const byId = new Map(all.map((r) => [r.id, r]));
  const pool = publishableInstruments();

  // Scope 1: held open by award history. Read off the RAW row, because the
  // pool's successor redirect nulls end dates and would hide the basis.
  const heldOpen = pool
    .map((p) => byId.get(p.id) as any)
    .filter((raw) => {
      const end = raw?.schemeEndDate ? String(raw.schemeEndDate).slice(0, 10) : "";
      return !!end && end < asOf && !isClosed(raw, asOf);
    });

  // Scope 2: everything Norwegian in the pool.
  const norway = pool.map((p) => byId.get(p.id) as any).filter((r) => r?.country === "NO");

  // Scope 3: rows the pool offers although isClosed() says closed.
  const offeredWhileClosed = pool
    .map((p) => ({ raw: byId.get(p.id) as any, post: p as any }))
    .filter((x) => x.raw && isClosed(x.raw, asOf))
    .map((x) => ({ ...pick(x.raw), postEvidence: opennessEvidence(x.post, asOf) }));

  const out = {
    asOf,
    provenance: prov,
    counts: {
      corpus: all.length,
      pool: pool.length,
      heldOpenByAwardHistory: heldOpen.length,
      norwayInPool: norway.length,
      offeredWhileClosed: offeredWhileClosed.length,
    },
    poolByCountry: tally(pool, (p: any) => p.country ?? "??"),
    heldOpenByCountry: tally(heldOpen, (r) => r.country ?? "??"),
    heldOpen: heldOpen
      .sort((a, b) => String(a.country).localeCompare(String(b.country)) ||
        String(a.schemeEndDate).localeCompare(String(b.schemeEndDate)))
      .map(pick),
    norway: norway.sort((a, b) => String(a.id).localeCompare(String(b.id))).map(pick),
    offeredWhileClosed,
  };
  process.stdout.write(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
