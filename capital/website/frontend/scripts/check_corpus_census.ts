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
// The SAME predicate the home page uses to decide whether a census may be
// rendered. This check and lib/corpusFigures.ts do different jobs — the check
// fails on the NEWEST census because a bad run needs a human, the page skips it
// and serves the newest good one because a founder needs a number — but they
// must not disagree about what "bad" means. Importing it is how that is
// guaranteed rather than intended.
import { admissibility, type CensusRow } from "../lib/corpusCensus";
// "Was this produced by a clock or by a person?", from the one definition both
// freshness readers call. See DRIFTED below for the question it answers here,
// and the SILENT block for why that question is NOT the one SILENT asks.
import { isScheduledProducer } from "./guardVerdict";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();

/** The scheduled workflow's belt: even a DECLARED offline run must fail there,
 *  because that job exists to make the comparison and a skipped comparison is
 *  the failure it reports on. */
const REQUIRE_DB = process.argv.includes("--require-db");

/** How many missed cycles SILENT tolerates before it wakes somebody. Two and a
 *  half is past any single skipped run and short of a second one. It multiplies
 *  the DECLARED schedule below rather than an observed spacing — see SILENT for
 *  why measuring this table's own cadence was abandoned — so a change of cadence
 *  needs no edit here either. */
const MISSED_CYCLES_TOLERATED = 2.5;

// DATABASE_URL is OPTIONAL here, and this is the only check in the repo where
// that is an honest thing to say. Without it this reads the same census rows
// from /api/guards, written by the same publisher from the same figures — one
// record behind two doors, not a weaker measurement. That is precisely what
// lets this run on every pull request without GitHub holding a credential to
// the production database. Declaring it keeps check_env_loader satisfied; what
// it stops being is a reason to abort.
//
// This is the ONE exemption. Everywhere else the declaration still ends the
// process, because the sweep that introduced it exists for check_recall_floor
// printing SKIPPED and exiting 0 — a green build with the floors never
// evaluated. An exemption is only honest where a second door onto the SAME
// record exists, and here one does.
const CREDENTIALS = REQUIRE_DB
  ? "live" as const
  : requireCredentials("check_corpus_census", [], { optional: ["DATABASE_URL"] });

/** The producer name a census carries when the SCHEDULED pipeline wrote it.
 *
 *  publish_corpus_census.py defaults `--produced-by` to `$RAILWAY_SERVICE_NAME`,
 *  which is set only inside the Railway container — so this name identifies a
 *  census taken by the cron and by nothing else. Asserted against
 *  `ETL/lib/railway_service.SERVICE_NAME` by check_cross_language_constants.py;
 *  renaming the service without updating this would otherwise make every
 *  scheduled census invisible here, and SILENT would fire forever. */
const SCHEDULED_PRODUCER = "etl-pipeline";

/** The schedule that service is deployed with, and the one `verify_cron.py`
 *  restores when something writes over it. Asserted against
 *  `railway_service.REAL_CRON_SCHEDULE` by the same check, so a change of
 *  cadence on Railway cannot leave this guard measuring against the old one. */
const SCHEDULED_CRON = "0 3 * * 0";

/** Days between two runs of a cron expression.
 *
 *  Deliberately narrow: it understands the two shapes this repo actually
 *  deploys and returns null for everything else rather than guessing. A wrong
 *  interval here is a guard that either never fires or always does, and both
 *  end with somebody ignoring it — so an unrecognised schedule falls back to a
 *  stated assumption instead of a confident wrong number. */
function intervalDaysOf(cron: string): number | null {
  const [, , dom, month, dow] = cron.trim().split(/\s+/);
  if (month !== "*") return null;
  if (dom === "*" && dow === "*") return 1;                    // daily
  if (dom === "*" && /^[0-6]$/.test(dow)) return 7;            // one named weekday
  return null;
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
    // Including under NO_PG=1, which says "there is deliberately no database" —
    // and there is not. The feed is an HTTPS read of what the census already
    // published, so honouring NO_PG here means taking this door, not skipping
    // the comparison. A skip would be the thing this check reports on.
    console.log(`check_corpus_census: no DATABASE_URL (${CREDENTIALS}) — reading the ` +
                "published census from the verdict feed instead.");
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
  // The question is whether the CRON is still running, so both halves of the
  // test — which censuses count, and how old is too old — have to be about the
  // scheduled run and nothing else.
  //
  // Both halves used to be wrong, in the same way and for the same reason: the
  // population was chosen by what a producer is NOT called
  // (`produced_by !== "local"`), and the limit was inferred from that
  // population's spacing. Selecting by exclusion fails open — every name that
  // was not literally "local" was counted as a weekly run — so the censuses
  // taken by hand while this workstream was being built ("proof-local",
  // "image-equivalent", minutes apart) became the observed cadence, the limit
  // collapsed to 0.1 days, and the guard failed on main against a corpus that
  // was fine. A guard that cries wolf is retired by the people it wakes.
  //
  // The mirror image is the dangerous one and it was equally live: `ageDays`
  // was measured on the newest census of ANY origin, so one census run by hand
  // held the guard green while the cron was dead — the exact failure SILENT
  // exists to catch, defeated by the act of investigating it.
  //
  // So: name the scheduled producer positively (it is the Railway service, and
  // `publish_corpus_census.py` stamps that name from $RAILWAY_SERVICE_NAME),
  // and take the interval from the DECLARED schedule rather than from observed
  // spacing — this table cannot be kept clean enough to measure, and the cron
  // is a fact we already hold in one place.
  //
  // wsAF reached the same incident from the other side and fixed it in place:
  // `isScheduledProducer` for the population, and a MIN_DERIVED_CADENCE_DAYS
  // floor so a burst could never imply a 0.0d cadence. Both are kept and both
  // are still load-bearing — the predicate below at DRIFTED, the floor in
  // check_verdicts.ts, which is the other freshness reader and DOES still derive
  // its limit from observed spacing. What is gone from THIS file is the
  // derivation itself, so there is no longer a spacing here for a floor to
  // stand under. The floor was not dropped; the thing it protected was.
  //
  // SILENT deliberately does not use `isScheduledProducer` for its population.
  // The two are asking different questions and the looser one would be wrong
  // here: "not named local" would count a census from a renamed or unrelated
  // service as evidence the cron fired, which is the fails-open shape this
  // whole block exists to remove. SILENT needs the Railway service BY NAME.
  const scheduled = rows.filter((r) => r.produced_by === SCHEDULED_PRODUCER);
  const newestScheduled = scheduled[0];
  const interval = intervalDaysOf(SCHEDULED_CRON);
  const limit = interval !== null
    ? MISSED_CYCLES_TOLERATED * interval
    : MISSED_CYCLES_TOLERATED * 7;
  const basis = interval !== null
    ? `${MISSED_CYCLES_TOLERATED} × the ${interval}d schedule ${SCHEDULED_CRON}`
    : `${MISSED_CYCLES_TOLERATED} × an assumed weekly schedule — ${SCHEDULED_CRON} is ` +
      `not a shape this check can read, so the interval is a guess`;

  if (!newestScheduled) {
    problems.push(
      `SILENT — no census in the last ${rows.length} was produced by ` +
      `"${SCHEDULED_PRODUCER}".\n` +
      `      Every reading on record was taken by hand. The scheduled refresh has\n` +
      `      never recorded, or the service was renamed — and a hand-run census is\n` +
      `      not evidence the cron is alive, which is why it no longer counts as\n` +
      `      one. Check it: python3 ETL/lib/verify_cron.py`);
  } else {
    const scheduledAge =
      (Date.now() - newestScheduled.taken_at.getTime()) / 86_400_000;
    if (scheduledAge > limit) {
      problems.push(
        `SILENT — the newest SCHEDULED census (#${newestScheduled.id}, by ` +
        `${SCHEDULED_PRODUCER}) is ${scheduledAge.toFixed(1)} days old, past a limit of ` +
        `${limit.toFixed(1)}d (${basis}).\n` +
        `      The weekly refresh has stopped, or it is no longer recording. That is\n` +
        `      the failure that reads as success: the last run's logs still end in\n` +
        `      ALL STEPS COMPLETE. Censuses taken by hand since do not count here —\n` +
        `      they say a person looked, not that the pipeline ran.\n` +
        `      Check the Railway cron: python3 ETL/lib/verify_cron.py`);
    }
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
  if (mine && isScheduledProducer(latest.produced_by) && mine !== latest.code_fingerprint) {
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
