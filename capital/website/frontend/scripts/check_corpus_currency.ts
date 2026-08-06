// Do the two corpora agree about which funds are OPEN, and can the retrieval
// index still find all of them?
//
// ── Why this exists ────────────────────────────────────────────────────────
// On 2026-08-06 the same measurement, on the same code and the same pinned
// sample, read pool 97% and pool 77% twenty minutes apart, and two separate
// workstreams reported both upward as if they described one system. They did
// not. The runs had ranked on two different corpora:
//
//   Postgres            pool 72%   1.1 closed calls in the pool per founder
//   committed snapshot  pool 95%  20.3 closed calls in the pool per founder
//
// and NOTHING said which one a run had used, because `hydrateDbInstruments()`
// degrades to `public/data/instrument_terms.json` on any Postgres failure,
// prints one line, and continues. Bisecting field by field, the entire 20-point
// gap is `scheme_end_date` and `scheme_end_date_basis`: the snapshot predates
// 86 loaded application deadlines and carries no basis key at all, so the one
// liveness rule reads every SATR notification expiry as a permanent closure in
// one corpus and not in the other. 26% of founders served off the snapshot were
// shown at least one fund whose deadline had passed. On Postgres: 0%.
//
// ── The property, not the incident ─────────────────────────────────────────
// The check is NOT "does the snapshot have a schemeEndBasis key". That names
// today's missing field and would pass tomorrow with a different one missing.
// The property is:
//
//     the fallback corpus must answer every liveness question exactly as
//     Postgres does
//
// so it is tested by asking both — `isClosed()` from the one definition, over
// every instrument in the corpus. A dropped field, a stale value, a new column
// the exporter does not carry yet, a reload half applied: all of them surface
// as a disagreement, including the ones nobody has thought of. The second half
// is the same shape for the retrieval index: everything publishable must have a
// profile, or the semantic ranker scores it zero and "thematically wrong" and
// "not in the index" become indistinguishable.
//
// Skips only when there is no DATABASE_URL — with nothing to compare against
// there is no claim to test. It never passes quietly on a comparison it could
// have made.
import { readFileSync } from "fs";
import path from "path";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }

import { isClosed, today } from "../lib/intelligence/liveness";

interface SnapshotRecord {
  id: string;
  schemeEndDate?: string | null;
  schemeEndBasis?: string | null;
  lastYear?: number | null;
  successorScheme?: string | null;
}

/** How many disagreements are worth printing before the point is made. */
const SHOW = 8;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("check_corpus_currency: skipped — no DATABASE_URL, nothing to compare against");
    return;
  }

  const file = path.join(process.cwd(), "public", "data", "instrument_terms.json");
  const snapshot = (JSON.parse(readFileSync(file, "utf8")) as {
    generatedAt?: string; records: SnapshotRecord[];
  });
  const snapById = new Map(snapshot.records.map((r) => [r.id, r]));

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let live: any[], profileMissing: number, profileOrphan: number, profiles: number;
  try {
    live = (await client.query(
      `SELECT id, name, scheme_end_date, scheme_end_date_basis, last_year, successor_scheme
         FROM funding_instruments ORDER BY id COLLATE "C"`)).rows;
    // Everything the advisor can SHOW, it must be able to FIND. An instrument
    // with no profile is not merely unranked: semanticFundMatch returns a map
    // without it, every reader defaults it to 0, and it is scored identically
    // to a fund that is thematically wrong.
    profileMissing = Number((await client.query(
      `SELECT COUNT(*) n FROM funding_instruments i
        WHERE NOT EXISTS (SELECT 1 FROM instrument_profiles p WHERE p.instrument_id = i.id)`
    )).rows[0].n);
    profileOrphan = Number((await client.query(
      `SELECT COUNT(*) n FROM instrument_profiles p
        WHERE NOT EXISTS (SELECT 1 FROM funding_instruments i WHERE i.id = p.instrument_id)`
    )).rows[0].n);
    profiles = Number((await client.query(
      "SELECT COUNT(*) n FROM instrument_profiles WHERE embedding IS NOT NULL")).rows[0].n);
  } finally {
    await client.end();
  }

  const asOf = today();
  const problems: string[] = [];

  // ── 1. The two corpora must agree about liveness ─────────────────────────
  const disagree: string[] = [];
  let missingFromSnapshot = 0, extraInSnapshot = 0;
  for (const r of live) {
    const s = snapById.get(r.id);
    if (!s) { missingFromSnapshot++; continue; }
    const pgClosed = isClosed({
      schemeEndDate: r.scheme_end_date, schemeEndBasis: r.scheme_end_date_basis,
      lastYear: r.last_year, successorScheme: r.successor_scheme,
    }, asOf);
    const snapClosed = isClosed(s, asOf);
    if (pgClosed !== snapClosed) {
      disagree.push(
        `${r.id}\n        postgres ${pgClosed ? "CLOSED" : "open  "}  ` +
        `end=${r.scheme_end_date ?? "-"} basis=${r.scheme_end_date_basis ?? "-"} lastYear=${r.last_year ?? "-"}\n` +
        `        snapshot ${snapClosed ? "CLOSED" : "open  "}  ` +
        `end=${s.schemeEndDate ?? "-"} basis=${s.schemeEndBasis ?? "-"} lastYear=${s.lastYear ?? "-"}`);
    }
  }
  for (const s of snapshot.records) if (!live.some((r) => r.id === s.id)) extraInSnapshot++;

  if (disagree.length) {
    problems.push(
      `${disagree.length} of ${live.length} instruments are OPEN in one corpus and CLOSED in the other.\n` +
      `      The fallback in hydrateDbInstruments() is therefore not a degraded\n` +
      `      version of production — it is a different answer to "which funds exist".\n` +
      disagree.slice(0, SHOW).map((d) => `      ${d}`).join("\n") +
      (disagree.length > SHOW ? `\n      ... and ${disagree.length - SHOW} more` : ""));
  }
  if (missingFromSnapshot || extraInSnapshot) {
    problems.push(
      `the snapshot holds ${snapshot.records.length} instruments and Postgres holds ${live.length}: ` +
      `${missingFromSnapshot} live instrument(s) absent from the snapshot, ` +
      `${extraInSnapshot} snapshot instrument(s) no longer in the corpus.`);
  }

  // ── 2. Everything showable must be retrievable ───────────────────────────
  if (profileMissing) {
    problems.push(
      `${profileMissing} instrument(s) have no row in instrument_profiles.\n` +
      `      semanticFundMatch scores them 0, which the ranker cannot tell apart\n` +
      `      from "thematically wrong" — so they are invisible, not merely last.\n` +
      `      This also fires while a --rebuild is mid-flight, which is correct:\n` +
      `      a number taken across a half-loaded index is not reproducible.`);
  }
  if (profileOrphan) {
    problems.push(
      `${profileOrphan} profile(s) point at an instrument that is gone. The index ` +
      `is ranking funds the corpus no longer contains.`);
  }

  console.log(`  snapshot generated ${snapshot.generatedAt ?? "(unstamped)"}, ` +
              `${snapshot.records.length} records`);
  console.log(`  postgres ${live.length} instruments, ${profiles} embedded profiles, as of ${asOf}`);

  if (problems.length) {
    console.error("\ncheck_corpus_currency: FAILED\n");
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("  Every figure this repo publishes depends on which of these two");
    console.error("  corpora the run happened to load, and the run is not told. Until");
    console.error("  they agree, a pool/recall number is a property of the connection.");
    console.error("\n  Fix: regenerate and republish the snapshot —");
    console.error("    make eligibility");
    console.error("  which re-exports public/data/instrument_terms.json from the same");
    console.error("  store Postgres is published from, and rebuilds the profile index:");
    console.error("    python3 ETL/terms/build_instrument_profiles.py run");
    process.exit(1);
  }
  console.log("check_corpus_currency: ok — the snapshot and Postgres agree on every " +
              "liveness verdict, and every instrument is retrievable.");
}

main().catch((err) => {
  console.error("check_corpus_currency: FAILED to run —", err);
  process.exit(1);
});
