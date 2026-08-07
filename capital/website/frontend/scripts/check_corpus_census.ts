// Does the website still serve the corpus the ETL produces?
//
// ── Why this exists ────────────────────────────────────────────────────────
// The headline figures a founder reads — companies, events, € committed,
// countries — come from public/data/synthesis.json, a COMMITTED build artifact.
// lib/data.ts imports it statically. Nothing about it is live: the numbers
// change only when somebody regenerates the file and pushes.
//
// The ETL, meanwhile, refreshes a Railway-resident db.sqlite every Sunday at
// 03:00 UTC and nothing downstream follows. Measured over this repo's own git
// history, the median gap between an ETL run and the site data catching up is
// 4.6 days and the worst was 32 (`python3 ETL/lib/drift_window.py`). There was
// no check at all, because there COULD not be one: db.sqlite is gitignored and
// lives on a volume, so no build step is permitted to read it and nothing on
// this side of the boundary could ask what the ETL now holds.
//
// publish_corpus_census.py closes that by writing what the ETL corpus contains
// into the Postgres the product already reads. This is the other half: it
// compares the committed artifacts against that record.
//
// ── The four ways this fails, and why each is separate ─────────────────────
//   STALE      the census is newer than the numbers we serve, and disagrees.
//              The site is behind. This is the ordinary case and the fix is
//              one command.
//   SILENT     no census for well over the observed ETL cadence. The weekly
//              refresh has stopped. This is the failure that looks exactly
//              like success — the logs still end in ALL STEPS COMPLETE, from
//              the previous Sunday — so it is tested against the cadence the
//              censuses THEMSELVES establish rather than a hardcoded week.
//   DEGRADED   the census recorded errors, or the coverage gate failed on the
//              corpus it describes. Republishing would ship a worse corpus, so
//              the answer is not "run the fix", it is "look at the corpus".
//   DRIFTED    the container is not running the committed code. The Railway
//              service has no repo trigger; it is deployed by CLI upload and
//              nothing redeploys it when main changes. On 2026-08-07 the fix
//              for a failing ETL step sat on main while Railway ran the image
//              that contained the bug.
//   DIVERGED   a DERIVED store holds something the corpus of record does not.
//              Being behind is ordinary; being AHEAD means a store holds the
//              only copy of something, and the next sync in either direction
//              destroys it. See below and website/build/lib/corpus_stores.py.
//   SCHEMA     a store has migrations pending, or has ids recorded with no file
//              behind them (somebody ran ALTER by hand), or two stores disagree
//              about which migrations they have.
//
// ── Why DIVERGED is in THIS file and not a new one ─────────────────────────
// The corpus was found split across two SQLite stores that had drifted in
// OPPOSITE directions — the volume 1,451 events ahead, the laptop 764
// instruments and 2,350 gates ahead — with no owner and nothing comparing
// them. That is the same problem this file already solves one level up
// (committed artifacts vs the ETL's corpus), and the census is already the
// channel: it records what a corpus contains and now also WHICH STORE it was
// read from. A second mechanism beside it would be a second thing to keep in
// sync, which is the defect this repo keeps paying for.
//
// The comparison is DIRECTIONAL and per table family, not an equality over a
// total. Equality is wrong (the record legitimately runs ahead of every derived
// store between a Sunday cron and the next pull) and a total is wrong (the two
// families drift oppositely, so their errors cancel and the aggregate looks
// calm while both halves are wrong).
//
// Skips only when there is no DATABASE_URL — with nothing to compare against
// there is no claim to test. Pass --require-db to turn that skip into a
// failure, which is what the scheduled workflow does: a guard that quietly
// skips because a secret is missing is the same defect it is here to catch.
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

// Both env files, repo root first. DATABASE_URL is documented as living at the
// repo root while most harnesses here read only ./.env.local, so a check run
// from the frontend on a checkout that has only the root file would skip
// itself and report that as a pass. CI has neither and must not need them.
for (const p of ["../../.env.local", ".env.local"]) {
  try {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* rely on the process environment */ }
}

const REQUIRE_DB = process.argv.includes("--require-db");

/** Before there is census history to measure, the ETL cadence is weekly and two
 *  missed cycles is unambiguous. Used only for the cold start — once three
 *  censuses exist the limit is derived from their actual spacing, so a change
 *  of cadence needs no edit here and cannot drift out of step with the cron. */
const COLD_START_MAX_AGE_DAYS = 15;

interface CensusRow {
  id: number;
  taken_at: Date;
  produced_by: string;
  code_fingerprint: string;
  kpis: Record<string, number> | null;
  instruments: Record<string, number> | null;
  coverage: { instruments: number; complete: number } | null;
  gate: { ok: boolean | null; failures: string[]; notes: string[] } | null;
  run_outcome: string;
  errors: string[];
  store: string;
  schema_state: { applied: string[]; pending: string[]; unknown: string[] } | null;
}

interface StoreMap {
  ofRecord: string;
  stores: Record<string, string>;
  families: Record<string, string[]>;
  familyMeasures: Record<string, string[]>;
}

/** The ownership map, read from the ONE definition rather than restated here.
 *  Same pattern as fingerprintOfCheckout() below and for the same reason: a
 *  second copy of "which store is authoritative" is a second thing that can be
 *  wrong, in the guard that exists to catch exactly that. */
function storeMap(): StoreMap | null {
  try {
    return JSON.parse(execFileSync("python3",
      ["../../website/build/lib/corpus_stores.py"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    return null;
  }
}

/** snake_case → camelCase. The site's JSON and the ETL's SQL name the same
 *  figures in two conventions; deriving the mapping means a KPI added to
 *  compute_kpis is compared automatically, where a hand-written table of pairs
 *  would silently stop covering it. */
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function fingerprintOfCheckout(): string | null {
  // Shelling out to the one implementation rather than rewriting the hash in
  // TypeScript. A second implementation of a fingerprint is a fingerprint of
  // two different things the first time either changes.
  try {
    return execFileSync("python3",
      ["../../ETL/events/load/publish_corpus_census.py", "--fingerprint"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (REQUIRE_DB) {
      console.error("check_corpus_census: FAILED — --require-db was given and there");
      console.error("  is no DATABASE_URL. This check is the only thing that sees the");
      console.error("  ETL's corpus; skipping it silently is how the drift got to 32 days.");
      process.exit(1);
    }
    console.log("check_corpus_census: skipped — no DATABASE_URL, nothing to compare against");
    return;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let rows: CensusRow[];
  let pgInstruments = 0, pgGates = 0;
  try {
    const exists = (await client.query(
      "SELECT to_regclass('public.corpus_census') IS NOT NULL AS ok")).rows[0].ok;
    if (!exists) {
      console.error("check_corpus_census: FAILED — there is no corpus_census table.");
      console.error("  The ETL has never recorded what its corpus contains, so nothing");
      console.error("  can tell whether the site is serving it. Add the census step to");
      console.error("  the weekly run: ETL/events/extract/railway_cron.py");
      process.exit(1);
    }
    rows = (await client.query(
      `SELECT id, taken_at, produced_by, code_fingerprint, kpis, instruments,
              coverage, gate, run_outcome, errors,
              COALESCE(store, 'unknown') AS store, schema_state
         FROM corpus_census ORDER BY taken_at DESC LIMIT 40`)).rows;
    // Postgres is a store too, and it is the one the product actually reads.
    // It needs no census row: it is right here, so it is asked directly.
    pgInstruments = Number((await client.query(
      "SELECT COUNT(*) n FROM funding_instruments")).rows[0].n);
    pgGates = Number((await client.query(
      "SELECT COUNT(*) n FROM eligibility_gates")).rows[0].n);
  } finally {
    await client.end();
  }

  if (!rows.length) {
    console.error("check_corpus_census: FAILED — the census table is empty.");
    process.exit(1);
  }

  const problems: string[] = [];
  const map = storeMap();
  if (!map) {
    problems.push(
      `the store ownership map could not be read (website/build/lib/corpus_stores.py).\n` +
      `      Without it there is no definition of which store is authoritative, so\n` +
      `      every comparison below is between two stores of equal standing — which\n` +
      `      is the state this check exists to end.`);
  }
  const ofRecord = map?.ofRecord ?? "railway-volume";

  // The newest census PER STORE. Everything below asks a question about a
  // specific store, and `rows[0]` answers none of them: on 2026-08-07 the
  // newest census was a laptop probe taken an hour after the pipeline's, so a
  // check reading rows[0] compared the website against the wrong corpus and
  // reported that all was well.
  const newestByStore = new Map<string, CensusRow>();
  for (const r of rows) if (!newestByStore.has(r.store)) newestByStore.set(r.store, r);

  const record = newestByStore.get(ofRecord);
  if (!record) {
    problems.push(
      `no census has EVER been taken against the corpus of record (${ofRecord}).\n` +
      `      Stores seen: ${[...newestByStore.keys()].join(", ") || "none"}.\n` +
      `      Every figure below therefore describes a derived copy. The weekly run\n` +
      `      records one: ETL/events/extract/railway_cron.py.`);
  }

  // `latest` means the newest census OF THE STORE OF RECORD, falling back to the
  // newest of anything only so the remaining checks can still say something.
  const latest = record ?? rows[0];
  const ageDays = (Date.now() - latest.taken_at.getTime()) / 86_400_000;

  // ── SILENT: has the refresh stopped? ─────────────────────────────────────
  // The limit is the cadence the censuses themselves establish. Two and a half
  // intervals is past any single missed run and short of a second one.
  //
  // Measured over the STORE, not over produced_by. `produced_by !== "local"`
  // counted `image-equivalent` and `proof-local` — two laptop probes taken 20
  // minutes apart — as scheduled runs, which would have derived a cadence of
  // hours and then failed SILENT on a refresh that was perfectly healthy.
  let limit = COLD_START_MAX_AGE_DAYS;
  let basis = `cold start, no cadence established yet (${rows.length} census(es))`;
  const scheduled = rows.filter((r) => r.store === ofRecord);
  if (scheduled.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < scheduled.length; i++) {
      gaps.push((scheduled[i - 1].taken_at.getTime() - scheduled[i].taken_at.getTime())
        / 86_400_000);
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    limit = 2.5 * median;
    basis = `2.5 × the observed ${median.toFixed(1)}d cadence of the scheduled runs`;
  }
  if (ageDays > limit) {
    problems.push(
      `SILENT — the newest census is ${ageDays.toFixed(1)} days old, past a limit of ` +
      `${limit.toFixed(1)}d (${basis}).\n` +
      `      The weekly refresh has stopped, or it is no longer recording. That is\n` +
      `      the failure that reads as success: the last run's logs still end in\n` +
      `      ALL STEPS COMPLETE. Check the Railway cron: python3 ETL/lib/verify_cron.py`);
  }

  // ── DEGRADED: is the corpus it describes fit to publish? ─────────────────
  if (latest.errors?.length) {
    problems.push(
      `DEGRADED — census #${latest.id} recorded ${latest.errors.length} error(s):\n` +
      latest.errors.map((e) => `        ${e}`).join("\n"));
  }
  // The run that produced it. A census written only on a good run would leave
  // last week's numbers standing as the newest record after a failure, and
  // everything below would read them and report that all is well.
  if (/^(failed|partial)/.test(latest.run_outcome)) {
    problems.push(
      `DEGRADED — the pipeline that produced census #${latest.id} did not finish ` +
      `cleanly: "${latest.run_outcome}".\n` +
      `      Some part of the corpus is not refreshed. Republishing would ship\n` +
      `      a corpus assembled from a half-run pipeline.`);
  }
  if (latest.gate && latest.gate.ok === false) {
    problems.push(
      `DEGRADED — the corpus in census #${latest.id} FAILED the coverage gate:\n` +
      latest.gate.failures.map((f) => `        ${f}`).join("\n") +
      `\n      Do not republish. The gate is refusing a corpus that got worse.`);
  }

  // ── DRIFTED: is the container running the committed code? ───────────────
  const mine = fingerprintOfCheckout();
  if (mine && latest.store === ofRecord && mine !== latest.code_fingerprint) {
    problems.push(
      `DRIFTED — census #${latest.id} was produced by code fingerprinted ` +
      `${latest.code_fingerprint}, this checkout is ${mine}.\n` +
      `      The scheduled ETL is not running the code in this repository. It has no\n` +
      `      repo trigger; only \`railway up\` redeploys it. Fix:\n` +
      `        python3 ETL/lib/verify_cron.py --deploy`);
  }

  // ── DIVERGED: does a derived store hold what the record does not? ────────
  //
  // The tolerance is stated and it is ZERO, in one direction only. A derived
  // store BEHIND the record is stale — ordinary, expected between a Sunday cron
  // and the next pull, and fixed by syncing. A derived store AHEAD of the record
  // holds the only copy of something: real awards, or an evening of gate
  // encoding. There is no volume of that which is acceptable, because the next
  // sync in either direction is a whole-file overwrite and it is destroyed.
  //
  // Per family, never in aggregate: on 2026-08-07 the volume was 1,451 events
  // ahead and the laptop 764 instruments ahead, so any total would have shown
  // two stores comfortably close together and both halves wrong.
  if (record) {
    const measured: Array<[string, string, number, number]> = [];  // family, measure, derived, record
    for (const [store, row] of newestByStore) {
      if (store === ofRecord) continue;
      for (const [family, measures] of Object.entries(map?.familyMeasures ?? {})) {
        const src = family === "instruments" ? row.instruments : row.kpis;
        const rec = family === "instruments" ? record.instruments : record.kpis;
        for (const m of measures) {
          const a = src?.[m], b = rec?.[m];
          if (typeof a !== "number" || typeof b !== "number") continue;
          if (a > b) measured.push([`${store}/${family}`, m, a, b]);
        }
      }
    }
    // Postgres, asked directly rather than from a census row.
    if (record.instruments) {
      if (pgInstruments > (record.instruments.total ?? 0)) {
        measured.push(["postgres/instruments", "total", pgInstruments,
                       record.instruments.total ?? 0]);
      }
      if (pgGates > (record.instruments.gates ?? 0)) {
        measured.push(["postgres/instruments", "gates", pgGates,
                       record.instruments.gates ?? 0]);
      }
    }
    if (measured.length) {
      problems.push(
        `DIVERGED — ${measured.length} measure(s) where a DERIVED store is AHEAD of the\n` +
        `      corpus of record (${ofRecord}). Each is a row that exists in exactly one\n` +
        `      place, and both sync paths (pull_db.py, push_local.py) move the whole\n` +
        `      file with --overwrite, so the next sync in either direction destroys it.\n` +
        measured.map(([where, m, a, b]) =>
          `        ${where}.${m}: derived ${a.toLocaleString()}, record ${b.toLocaleString()} ` +
          `(+${(a - b).toLocaleString()} held only by the derived store)`).join("\n") +
        `\n      Reconcile by union, never by overwrite:\n` +
        `        python3 ETL/events/load/reconcile_stores.py --help`);
    }
  }

  // ── SCHEMA: can every store reach the schema this checkout expects? ──────
  // Migrations used to reach whichever store a human was pointed at. That was
  // the laptop every time, and the volume — the corpus of record — was three
  // weeks behind, which surfaced as `no such column: tier` inside an unrelated
  // block of the census rather than as a schema problem.
  const schemaProblems: string[] = [];
  const seenSets = new Map<string, string>();
  for (const [store, row] of newestByStore) {
    const s = row.schema_state;
    if (!s) {
      schemaProblems.push(`${store}: census #${row.id} records no schema state ` +
        `(taken before the census carried one, or the block failed)`);
      continue;
    }
    if (s.pending?.length) {
      schemaProblems.push(`${store}: ${s.pending.length} migration(s) PENDING — ` +
        `${s.pending.join(", ")}`);
    }
    if (s.unknown?.length) {
      schemaProblems.push(`${store}: ${s.unknown.length} id(s) recorded with no file ` +
        `behind them — ${s.unknown.join(", ")}. Applied by hand; no other store ` +
        `can reproduce it.`);
    }
    seenSets.set(store, (s.applied ?? []).join(","));
  }
  if (new Set(seenSets.values()).size > 1) {
    schemaProblems.push(`the stores do not have the same migrations:\n` +
      [...seenSets].map(([s, ids]) =>
        `          ${s}: ${ids.split(",").length} applied`).join("\n"));
  }
  if (schemaProblems.length) {
    problems.push(
      `SCHEMA — a store cannot reach the schema this checkout expects:\n` +
      schemaProblems.map((p) => `        ${p}`).join("\n") +
      `\n      Migrations are a pipeline step, not a thing to remember:\n` +
      `        python3 ETL/events/load/migrations/apply.py all`);
  }

  // ── STALE: do the numbers we serve match the corpus that exists? ─────────
  // Compared against the census OF THE STORE OF RECORD. Comparing against the
  // newest census of anything is how the site could be declared current against
  // a laptop probe while the corpus it is supposed to serve held 1,451 more
  // events and €55.6B more capital.
  const file = path.join(process.cwd(), "public", "data", "synthesis.json");
  const served = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const disagree: string[] = [];
  if (latest.kpis) {
    for (const [key, value] of Object.entries(latest.kpis)) {
      const k = camel(key);
      if (!(k in served)) continue;      // a KPI the site does not publish
      const got = served[k] as number;
      const same = Number.isInteger(value)
        ? got === value
        : Math.abs(got - value) <= Math.abs(value) * 1e-9;
      if (!same) disagree.push(`${k}: site ${got}, ETL corpus ${value}`);
    }
  }
  if (disagree.length) {
    problems.push(
      `STALE — synthesis.json does not describe the corpus the ETL holds.\n` +
      disagree.map((d) => `        ${d}`).join("\n") +
      `\n      census #${latest.id} taken ${latest.taken_at.toISOString().slice(0, 16)}Z` +
      ` by ${latest.produced_by}, ${ageDays.toFixed(1)} days ago.`);
  }

  // Every store, side by side, whether or not anything failed. The divergence
  // was invisible for as long as it was because no output ever put the stores
  // on the same page.
  console.log(`  corpus of record: ${ofRecord}`);
  for (const [store, r] of newestByStore) {
    const age = ((Date.now() - r.taken_at.getTime()) / 86_400_000).toFixed(1);
    console.log(
      `  ${store === ofRecord ? "*" : " "} ${store.padEnd(15)} #${String(r.id).padStart(3)} ` +
      `${age.padStart(5)}d  ${(r.kpis?.companies ?? 0).toLocaleString()} companies · ` +
      `${(r.kpis?.events ?? 0).toLocaleString()} events · ` +
      `${(r.instruments?.total ?? 0).toLocaleString()} instruments · ` +
      `${(r.instruments?.gates ?? 0).toLocaleString()} gates`);
  }
  console.log(`    postgres        live       — · — · ${pgInstruments.toLocaleString()} ` +
              `instruments · ${pgGates.toLocaleString()} gates`);
  console.log(`  site serves ${(served.companies as number)?.toLocaleString()} companies · ` +
              `${(served.events as number)?.toLocaleString()} events · ${served.countries} countries`);

  if (problems.length) {
    console.error("\ncheck_corpus_census: FAILED\n");
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("  The site's headline figures are a committed file. They do not follow");
    console.error("  the ETL on their own, and a founder cannot tell the difference.");
    console.error("\n  Fix (pulls the ETL's db, regenerates, gates, and tells you what to commit):");
    console.error("    make republish");
    process.exit(1);
  }
  console.log("check_corpus_census: ok — the site serves the corpus of record, the " +
              "refresh is running, it is running this code, every store has the same " +
              "schema, and no derived store holds a row the record lacks.");
}

main().catch((err) => {
  console.error("check_corpus_census: FAILED to run —", err);
  process.exit(1);
});
