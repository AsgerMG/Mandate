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
//
// ── It no longer needs credentials ─────────────────────────────────────────
// This check only ever needed the database to READ the census. So the census
// now also publishes itself on the verdict feed (/api/guards), and with no
// DATABASE_URL this falls back to that feed rather than skipping — which is how
// it came to run on every pull request without GitHub holding a credential to
// the production database.
//
// The DATABASE_URL path is kept, and preferred where it exists, for one reason:
// it reads the corpus_census table directly, so it still works on a laptop
// against a corpus that has not been published anywhere, and it does not depend
// on the site being up.
//
// --require-db forces the direct path. The scheduled workflow used to pass it
// precisely because a guard that quietly skips for want of a secret is the same
// defect it is here to catch; it now has nothing to skip for.
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

/** The census as published on the credential-free feed.
 *
 *  Same rows, same fields, one HTTP call instead of a connection string — the
 *  census writes both from the figures it just recorded, so this is not a
 *  second measurement of the corpus that could disagree with the first. */
async function rowsFromFeed(): Promise<CensusRow[]> {
  const reg = JSON.parse(readFileSync(
    path.join(__dirname, "..", "..", "..", "data", "guard_registry.json"), "utf8"),
  ) as { feed: { url: string } };
  const url = `${process.env.GUARD_FEED_URL || reg.feed.url}?guard=census&limit=12`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (err) {
    console.error(`check_corpus_census: FAILED — the verdict feed is unreachable.\n  ${url}\n  ${err}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`check_corpus_census: FAILED — the verdict feed returned ${res.status}.`);
    console.error(`  ${url}`);
    console.error("  Without it there is nothing to compare the site against, and");
    console.error("  reporting that as a pass is the defect this check exists to catch.");
    process.exit(1);
  }
  const body = (await res.json()) as {
    guards: Record<string, {
      status: string; takenAt: string; producedBy: string; codeFingerprint: string;
      summary: string; metrics: Record<string, unknown>;
    }[]>;
  };
  return (body.guards?.census ?? []).map((r) => ({
    id: Number((r.metrics as { census_id?: number }).census_id ?? 0),
    taken_at: new Date(r.takenAt),
    produced_by: r.producedBy,
    code_fingerprint: r.codeFingerprint,
    kpis: (r.metrics as { kpis?: CensusRow["kpis"] }).kpis ?? null,
    instruments: (r.metrics as { instruments?: CensusRow["instruments"] }).instruments ?? null,
    coverage: (r.metrics as { coverage?: CensusRow["coverage"] }).coverage ?? null,
    gate: (r.metrics as { gate?: CensusRow["gate"] }).gate ?? null,
    run_outcome: String((r.metrics as { run_outcome?: string }).run_outcome ?? "unknown"),
    errors: ((r.metrics as { errors?: string[] }).errors ?? []),
  }));
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
    console.log("check_corpus_census: no DATABASE_URL — reading the published census " +
                "from the verdict feed instead.");
    return await judge(await rowsFromFeed());
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let rows: CensusRow[];
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
              coverage, gate, run_outcome, errors
         FROM corpus_census ORDER BY taken_at DESC LIMIT 12`)).rows;
  } finally {
    await client.end();
  }
  return await judge(rows);
}

/** Everything below is the same judgement whichever source the rows came from.
 *  One implementation, deliberately: a feed path that judged by slightly
 *  different rules from the direct path would make the answer depend on which
 *  machine asked. */
async function judge(rows: CensusRow[]) {
  if (!rows.length) {
    console.error("check_corpus_census: FAILED — no census has ever been recorded.");
    console.error("  Add the census step to the weekly run, or check that it is still");
    console.error("  running: ETL/events/extract/railway_cron.py, make verify-cron");
    process.exit(1);
  }

  const latest = rows[0];
  const ageDays = (Date.now() - latest.taken_at.getTime()) / 86_400_000;
  const problems: string[] = [];

  // ── SILENT: has the refresh stopped? ─────────────────────────────────────
  // The limit is the cadence the censuses themselves establish. Two and a half
  // intervals is past any single missed run and short of a second one.
  let limit = COLD_START_MAX_AGE_DAYS;
  let basis = `cold start, no cadence established yet (${rows.length} census(es))`;
  const scheduled = rows.filter((r) => r.produced_by !== "local");
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
  if (mine && latest.produced_by !== "local" && mine !== latest.code_fingerprint) {
    problems.push(
      `DRIFTED — census #${latest.id} was produced by code fingerprinted ` +
      `${latest.code_fingerprint}, this checkout is ${mine}.\n` +
      `      The scheduled ETL is not running the code in this repository. It has no\n` +
      `      repo trigger; only \`railway up\` redeploys it. Fix:\n` +
      `        python3 ETL/lib/verify_cron.py --deploy`);
  }

  // ── STALE: do the numbers we serve match the corpus that exists? ─────────
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

  console.log(`  newest census #${latest.id} — ${latest.taken_at.toISOString().slice(0, 16)}Z ` +
              `by ${latest.produced_by}, ${ageDays.toFixed(1)}d old, code ${latest.code_fingerprint}, ` +
              `run ${latest.run_outcome}`);
  if (latest.kpis) {
    console.log(`  ETL corpus  ${latest.kpis.companies?.toLocaleString()} companies · ` +
                `${latest.kpis.events?.toLocaleString()} events · ${latest.kpis.countries} countries`);
  }
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
  console.log("check_corpus_census: ok — the site serves the corpus the ETL produced, " +
              "the refresh is running, and it is running this code.");
}

main().catch((err) => {
  console.error("check_corpus_census: FAILED to run —", err);
  process.exit(1);
});
