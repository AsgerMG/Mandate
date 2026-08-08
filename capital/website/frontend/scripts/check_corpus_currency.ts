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
// The THIRD half is the same property once more, for the OFFLINE mirror of that
// index. `semanticCache.generated.json` is what every NO_PG check ranks on, and
// on 2026-08-07 it was found holding 1,014 instruments against a live index of
// 1,084 — 86 funds absent, 16 scored that no longer exist, and ~83% of the
// shared ids at a different rank. It had been that way since the previous day's
// reload and NOTHING was red, because the artifact is committed and no check
// compared it to anything. Same property, same shape: a derived artifact must
// answer for exactly the corpus that ships.
//
// Skips only when there is no DATABASE_URL — with nothing to compare against
// there is no claim to test. It never passes quietly on a comparison it could
// have made.
import { readFileSync } from "fs";
import path from "path";

// Repo root AND frontend, from the one shared loader. Reading only
// ./.env.local was a way for this check to skip itself and report that as a
// pass: a checkout that carries DATABASE_URL at the repo root -- where it is
// documented to live -- and not under website/frontend produced "skipped,
// nothing to compare against" on a machine that had the credentials all along.
// The block that used to sit here had been copy-pasted into seven harnesses
// while thirty-three others still carried the single-path version; see
// scripts/loadEnv.ts.
// And then a DECLARED contract, because the fixed path only made the skip
// rarer. Without DATABASE_URL and without NO_PG this check now ENDS non-zero
// rather than printing "skipped" and returning 0 -- which was the exact defect
// it exists to catch, in itself.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials("check_corpus_currency", ["DATABASE_URL"]);

// This guard needs credentials, so it cannot run in CI. It therefore publishes
// what it decided (scripts/guardVerdict.ts) and check_verdicts.ts asserts on
// that without any — including that the verdict was taken on THIS code, so a
// change to the snapshot or to the liveness rule cannot ship on an old pass.
import { publishVerdict, startTape } from "./guardVerdict";

const GUARD = "corpus_currency";
const tape = startTape();

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
  // The only skip left is the one somebody declared. "No credentials" is no
  // longer reachable here: it ended the process at the top of the file.
  if (CREDENTIALS === "offline") {
    console.log("check_corpus_currency: skipped — NO_PG=1, so there is no live "
      + "corpus to compare the committed one against");
    return;
  }
  const url = process.env.DATABASE_URL as string;

  const file = path.join(process.cwd(), "public", "data", "instrument_terms.json");
  const snapshot = (JSON.parse(readFileSync(file, "utf8")) as {
    generatedAt?: string; records: SnapshotRecord[];
  });
  const snapById = new Map(snapshot.records.map((r) => [r.id, r]));

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let live: any[], profileMissing: number, profileOrphan: number, profiles: number;
  let profileIds: Set<string>, textProfileIds: Set<string>;
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
    profileIds = new Set((await client.query(
      "SELECT instrument_id FROM instrument_profiles WHERE embedding IS NOT NULL"
    )).rows.map((r: { instrument_id: string }) => r.instrument_id));
    profiles = profileIds.size;
    textProfileIds = new Set((await client.query(
      `SELECT instrument_id FROM instrument_profiles
        WHERE profile_text IS NOT NULL AND btrim(profile_text) <> ''`
    )).rows.map((r: { instrument_id: string }) => r.instrument_id));
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

  // ── 3. EVERY offline mirror of the index must answer for the same corpus ──
  // Compared on the ID SET, not on a count and not on a mtime. A count matches
  // by coincidence the moment one fund is added and another withdrawn, and a
  // timestamp says when the file was written rather than what is in it.
  //
  // Two artifacts are cut from `instrument_profiles` and committed, and BOTH
  // were found 70 instruments behind on 2026-08-07:
  //
  //   semanticCache.generated.json    the SCORES. Every NO_PG check ranks on it.
  //   profileLeakIndex.generated.json the TEXT. `check_recall_leaks` tests the
  //                                   recall set against it, so a stale copy
  //                                   cannot see a description that leaks into
  //                                   one of the profiles it does not hold --
  //                                   and a leak inflates every recall figure
  //                                   taken from the set, silently.
  //
  // The second is the more dangerous of the two: it is a guard, and a guard
  // checking 1,014 of 1,084 profiles reports green over the other 70.
  const leakFile = path.join(process.cwd(), "lib", "intelligence", "profileLeakIndex.generated.json");
  let leakIds: Set<string> | null = null;
  let leakBuiltAt = "";
  try {
    const idx = JSON.parse(readFileSync(leakFile, "utf8")) as
      { profile: Record<string, string>; builtAt?: string };
    leakIds = new Set(Object.keys(idx.profile ?? {}));
    leakBuiltAt = idx.builtAt ?? "(unstamped)";
  } catch {
    problems.push(`lib/intelligence/profileLeakIndex.generated.json is missing or ` +
      `unreadable, so check_recall_leaks cannot test the recall set at all.`);
  }
  if (leakIds) {
    // Only profiles with TEXT can be in it: the emitter drops any whose text
    // squashes to nothing, so the live side of this comparison is the textual
    // profiles, not every row of the table.
    const missing = [...textProfileIds].filter((id) => !leakIds.has(id));
    const extra = [...leakIds].filter((id) => !textProfileIds.has(id));
    if (missing.length || extra.length) {
      problems.push(
        `the committed profile LEAK index holds ${leakIds.size} instruments against ` +
        `${textProfileIds.size} live\n` +
        `      (built ${leakBuiltAt}): ${missing.length} live profile(s) it has never seen, ` +
        `${extra.length} gone.\n` +
        `      check_recall_leaks therefore reports green over profiles it does not\n` +
        `      hold. A description that leaks into one of them grades retrieval on a\n` +
        `      query copied out of the answer, and inflates every recall figure taken\n` +
        `      from the set — which is the exact defect that artifact exists to catch.\n` +
        `      Rebuild: DATABASE_URL=... python3 ETL/terms/emit_profile_leak_index.py` +
        (missing.length ? `\n      e.g. missing ${missing.slice(0, 3).join(", ")}` : ""));
    }
  }

  const cacheFile = path.join(process.cwd(), "lib", "intelligence", "semanticCache.generated.json");
  let cache: Record<string, { scores?: Record<string, number> } | Record<string, number>> | null = null;
  try {
    cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    problems.push(`lib/intelligence/semanticCache.generated.json is missing or unreadable. ` +
      `Every NO_PG check would silently rank on the lexical fallback.`);
  }
  let cacheDescriptions = 0;
  if (cache) {
    const entries = Object.entries(cache);
    cacheDescriptions = entries.length;
    const stale: string[] = [];
    for (const [desc, v] of entries) {
      const scores = (v && typeof v === "object" && "scores" in v
        ? (v as { scores: Record<string, number> }).scores
        : v) as Record<string, number>;
      const ids = new Set(Object.keys(scores ?? {}));
      const missing = [...profileIds].filter((id) => !ids.has(id)).length;
      const extra = [...ids].filter((id) => !profileIds.has(id)).length;
      if (missing || extra) {
        stale.push(`${desc.slice(0, 48)}...  scored ${ids.size}, ` +
                   `${missing} live profile(s) missing, ${extra} no longer in the index`);
      }
    }
    if (!entries.length) {
      problems.push(`the committed semantic cache is EMPTY. An emitter run whose ` +
        `Voyage key or Postgres connection had failed would produce exactly this ` +
        `and report success; re-run scripts/emit_semantic_cache.ts with credentials.`);
    } else if (stale.length) {
      problems.push(
        `${stale.length} of ${entries.length} description(s) in the committed semantic\n` +
        `      cache do not score the ${profileIds.size} instruments the live index holds.\n` +
        `      Every NO_PG check — the unit tests, the archetypes, the red team — ranks\n` +
        `      on this file, so they are grading a corpus that no longer exists. Funds\n` +
        `      absent from it score 0, which the ranker cannot tell from "wrong".\n` +
        stale.slice(0, SHOW).map((s) => `      ${s}`).join("\n") +
        (stale.length > SHOW ? `\n      ... and ${stale.length - SHOW} more` : ""));
    }
  }

  console.log(`  snapshot generated ${snapshot.generatedAt ?? "(unstamped)"}, ` +
              `${snapshot.records.length} records`);
  console.log(`  postgres ${live.length} instruments, ${profiles} embedded profiles, as of ${asOf}`);
  console.log(`  semantic cache ${cacheDescriptions} descriptions, ` +
              `leak index ${leakIds?.size ?? 0} profiles (built ${leakBuiltAt || "-"})`);

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
    console.error("  and re-cut the offline mirror of that index, which is committed:");
    console.error("    npx tsx scripts/emit_semantic_cache.ts");
    await publishVerdict(GUARD, {
      status: "failed",
      summary: `${problems.length} disagreement(s) between the committed snapshot ` +
               `and Postgres (${live.length} instruments, ${profiles} profiles)`,
      metrics: { problems: problems.length, snapshotRecords: snapshot.records.length,
                 liveInstruments: live.length, profiles, profileMissing, profileOrphan },
      detail: tape(),
    });
    process.exit(1);
  }
  console.log("check_corpus_currency: ok — the snapshot and Postgres agree on every " +
              "liveness verdict, every instrument is retrievable, and both committed " +
              "mirrors of the index (scores, profile text) cover exactly the live one.");
  await publishVerdict(GUARD, {
    status: "ok",
    summary: `snapshot and Postgres agree on every liveness verdict; ` +
             `${live.length} instruments, ${profiles} embedded profiles`,
    metrics: { problems: 0, snapshotRecords: snapshot.records.length,
               liveInstruments: live.length, profiles, profileMissing, profileOrphan },
    detail: tape(),
  });
}

main().catch(async (err) => {
  console.error("check_corpus_currency: FAILED to run —", err);
  // 'error', not 'failed': the guard fell over, which is a different claim from
  // the corpora disagreeing, and publishing it as the latter would send whoever
  // reads it to look at the wrong thing.
  await publishVerdict(GUARD, {
    status: "error", summary: `the guard could not complete: ${err}`, detail: tape(),
  });
  process.exit(1);
});
