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
// Skips only when there is no DATABASE_URL — with nothing to compare against
// there is no claim to test. Pass --require-db to turn that skip into a
// failure, which is what the scheduled workflow does: a guard that quietly
// skips because a secret is missing is the same defect it is here to catch.
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
// The SAME predicate the home page uses to decide whether a census may be
// rendered. This check and lib/corpusFigures.ts do different jobs — the check
// fails on the NEWEST census because a bad run needs a human, the page skips it
// and serves the newest good one because a founder needs a number — but they
// must not disagree about what "bad" means. Importing it is how that is
// guaranteed rather than intended.
import { admissibility, type CensusRow } from "../lib/corpusCensus";

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

  if (!rows.length) {
    console.error("check_corpus_census: FAILED — the census table is empty.");
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
  // One predicate, shared with the render path (lib/corpusCensus.ts). A census
  // the site will not serve and a census this check will not pass are now the
  // same set by construction, so the two can never drift into the state where
  // the guard is green and the page is quietly serving last month.
  const verdict = admissibility(latest);
  if (!verdict.admissible) {
    problems.push(
      `DEGRADED — census #${latest.id} is not fit to publish:\n` +
      verdict.reasons.map((r) => `        ${r}`).join("\n") +
      `\n      The site will NOT serve these figures. It is falling back to an\n` +
      `      older reading, which is the gate working — but the corpus itself\n` +
      `      still needs looking at, and only a person can do that.`);
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

  // ── UNDATED: can the two readings still be compared at all? ──────────────
  // The invariant that makes the live read safe to ship is "it can make the
  // site fresher and provably cannot make it staler", and corpusFigures.ts
  // enforces it by comparing `generatedAt` against the census's `taken_at`.
  // That comparison needs a date on BOTH sides. With `generatedAt` absent the
  // parse yields NaN, the comparison is skipped, and the census wins
  // unconditionally — so a census taken BEFORE the last `make data` would
  // quietly replace fresher figures with older ones. The invariant would be
  // gone and everything would still render.
  //
  // Not hypothetical: synthesis.py only learned to stamp the file in this
  // workstream, so every artifact regenerated from a branch without that change
  // arrives undated — which is exactly what a merge from main produced while
  // this was being written.
  if (typeof served.generatedAt !== "string" || !served.generatedAt
      || Number.isNaN(Date.parse(served.generatedAt as string))) {
    problems.push(
      `UNDATED — synthesis.json carries no usable \`generatedAt\` ` +
      `(${JSON.stringify(served.generatedAt)}).\n` +
      `      The render path compares that stamp against the census's taken_at to\n` +
      `      guarantee the live read can only move the site FORWARDS. Undated, the\n` +
      `      comparison is skipped and the census wins unconditionally — including a\n` +
      `      census older than this file. Regenerate it: python3 website/build/synthesis.py`);
  }

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
  // STALE is no longer "the site is showing the wrong numbers" — since wsAK the
  // page reads the census directly and synthesis.json is the FALLBACK. It is
  // still worth failing on, for a reason that only shows up during an outage:
  // the fallback is what founders see when Postgres is unreachable, and a
  // fallback nobody refreshes is a fallback that gets worse every week while
  // reading as healthy. This is the check that keeps the parachute packed.
  //
  // But WHICH side is behind has to be established rather than assumed, and
  // assuming it is the same defect in miniature. Both readings are dated, so
  // the direction is a fact and not an inference:
  //
  //   census newer than the artifact  → the fallback is drifting. The old
  //                                     reading of this check, and the one that
  //                                     `make republish` fixes.
  //   artifact newer than the census  → the ARTIFACT is ahead, which is what a
  //                                     republish immediately after a corpus
  //                                     change looks like. `make republish`
  //                                     would not fix it; it would pull the
  //                                     ETL's db and undo it. The thing that is
  //                                     behind is the ETL's own record, and the
  //                                     honest report says so.
  //
  // Getting this backwards is not cosmetic. A guard that names the wrong fix
  // gets run once, does damage, and is thereafter ignored — which costs more
  // than having no guard, because everything downstream still reads as covered.
  const artifactAt = typeof served.generatedAt === "string"
    ? Date.parse(served.generatedAt) : NaN;
  const artifactIsAhead = Number.isFinite(artifactAt)
    && artifactAt > latest.taken_at.getTime();

  if (disagree.length && !artifactIsAhead) {
    problems.push(
      `STALE — the committed synthesis.json does not describe the corpus the ETL\n` +
      `      holds. The live page reads the census, so founders are not seeing these\n` +
      `      numbers today — but this file IS what they see when Postgres is\n` +
      `      unreachable or the newest censuses fail the gate, and it is drifting:\n` +
      disagree.map((d) => `        ${d}`).join("\n") +
      `\n      census #${latest.id} taken ${latest.taken_at.toISOString().slice(0, 16)}Z` +
      ` by ${latest.produced_by}, ${ageDays.toFixed(1)} days ago.`);
  } else if (disagree.length) {
    problems.push(
      `BEHIND — the ETL's own record is older than the corpus we publish. The\n` +
      `      committed synthesis.json (${served.generatedAt}) is a MORE RECENT\n` +
      `      reading than census #${latest.id} ` +
      `(${latest.taken_at.toISOString().slice(0, 16)}Z, by ${latest.produced_by}):\n` +
      disagree.map((d) => `        ${d}`).join("\n") +
      `\n      The site is serving the newer figures, which is the intended\n` +
      `      behaviour — the live read may only ever move the site forwards. What\n` +
      `      is missing is a census over the current corpus, so the LIVE path has\n` +
      `      something admissible to serve and the site stops depending on the\n` +
      `      committed fallback.\n` +
      `      Do NOT run \`make republish\` for this: step 1 pulls the ETL's db and\n` +
      `      would overwrite the newer corpus with the older one. Let the weekly\n` +
      `      pipeline run and record its own census.`);
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
    console.error("  The site's headline figures follow the census on their own (wsAK), but");
    console.error("  only through a census the coverage gate has passed. Anything above means");
    console.error("  either the corpus needs a person, or the committed fallback has drifted.");
    if (problems.some((p) => p.startsWith("STALE"))) {
      console.error("\n  Fix (pulls the ETL's db, regenerates, gates, and tells you what to commit):");
      console.error("    make republish");
    }
    process.exit(1);
  }
  console.log("check_corpus_census: ok — the site serves the corpus the ETL produced, " +
              "the refresh is running, and it is running this code.");
}

main().catch((err) => {
  console.error("check_corpus_census: FAILED to run —", err);
  process.exit(1);
});
