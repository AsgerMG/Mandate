// Publishing side of the verdict channel, for the guards that are TypeScript.
//
// The corpus-side guards are Python and run inside the Railway container, where
// ETL/lib/guard_verdicts.py both runs them and publishes for them. These four —
// corpus_currency, hydration_parity, degradation, recall_floor — are TypeScript,
// need Node and the frontend's own modules, and there is nowhere automatic that
// has all three plus credentials. So they publish for themselves, from wherever
// they were run, and check_verdicts.ts holds them to the code they judged: a
// verdict is bound to a hash of that code, so changing the ranker and merging
// without re-running the floors goes red rather than green.
//
// ── One schema, one hash, one registry ─────────────────────────────────────
// The DDL is read from ETL/schema/guard_verdicts.sql rather than written again
// here. The fingerprint shells out to ETL/lib/guard_verdicts.py rather than
// being reimplemented — a second implementation of a fingerprint is a
// fingerprint of two different things the first time either changes, which is
// the reasoning check_corpus_census.ts already established for the census hash.
// The registry is the same JSON Python reads.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Repo root from web, where every guard is run. */
const ROOT = path.join(__dirname, "..", "..", "capital");
const REGISTRY = path.join(ROOT, "data", "guard_registry.json");
const SCHEMA = path.join(ROOT, "ETL", "schema", "guard_verdicts.sql");
const RUNNER = path.join(ROOT, "ETL", "lib", "guard_verdicts.py");

export interface Verdict {
  /** 'error' is the guard itself falling over, which is not the same claim as
   *  the thing it guards being broken and must not be published as one. */
  status: "ok" | "failed" | "error";
  /** One line, written to be read by whoever the failure wakes up. SERVED
   *  publicly by /api/guards — keep it to what you would put in a status page. */
  summary: string;
  /** Figures the guard measured. Also served. Numbers and booleans. */
  metrics?: Record<string, unknown>;
  /** Full output. Stored, never served. */
  detail?: string;
}

export interface GuardSpec {
  id: string;
  cadence: string;
  code: string[];
  refresh: string;
  needs: string[];
}

export function registry(): GuardSpec[] {
  return (JSON.parse(readFileSync(REGISTRY, "utf8")) as { guards: GuardSpec[] }).guards;
}

export function guardSpec(id: string): GuardSpec {
  const g = registry().find((x) => x.id === id);
  if (!g) throw new Error(`no guard '${id}' in data/guard_registry.json`);
  return g;
}

/**
 * The shortest cadence an OBSERVED spacing is allowed to imply, in days.
 *
 * Both freshness readers derive their age limit from how far apart the
 * verdicts they can see actually are. That is the right shape — it needs no
 * edit when the cron moves — but it has a degenerate case that has already
 * fired: publish several verdicts in a burst, which any local proof run does,
 * and the median gap is ~0.0 days. 2.5 × 0.0 is 0.0, so a census six minutes
 * old gets reported SILENT. A limit derived from data must still refuse to
 * derive nonsense from data.
 *
 * A day is the floor because nothing here publishes faster than the daily
 * Vercel build, so a limit under a day cannot describe a real cadence — only a
 * burst.
 */
export const MIN_DERIVED_CADENCE_DAYS = 1;

/**
 * Was this verdict produced by something that runs on a clock, rather than by
 * a person at a terminal?
 *
 * Only scheduled verdicts may set the cadence: somebody running a guard four
 * times while debugging is not evidence about how often the cron fires.
 *
 * Both readers spelled this `produced_by !== "local"`, and a proof run
 * labelled `proof-local` walked straight through it — every one of its burst
 * verdicts counted as scheduled, which is how a 0.0-day cadence got into the
 * data. The producer is a free-form name (`RAILWAY_SERVICE_NAME`, or `local`
 * when that is unset), so it cannot be matched against an allow-list of
 * services without breaking the day somebody renames the Railway service.
 *
 * So: a local run is one that SAYS local, anywhere in its name. Both error
 * directions are now bounded — mistaking a scheduled verdict for a local one
 * only shrinks the sample, and falling under three drops to the cold-start
 * limit; mistaking local for scheduled is what MIN_DERIVED_CADENCE_DAYS
 * catches.
 */
export function isScheduledProducer(producedBy: string): boolean {
  return !/local/i.test(producedBy);
}

/** The hash this verdict is bound to, from the one implementation. */
export function fingerprint(id: string): string {
  return execFileSync("python3", [RUNNER, "fingerprint", id],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * Tee console output into a buffer while still printing it.
 *
 * The `detail` column wants everything the guard said, and the guard already
 * says it to the console. Asking each one to build a second copy of its own
 * output in a string is how the two versions come to disagree.
 */
export function startTape(): () => string {
  const lines: string[] = [];
  const wrap = (orig: (...a: unknown[]) => void) => (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
    orig(...args);
  };
  console.log = wrap(console.log.bind(console)) as typeof console.log;
  console.error = wrap(console.error.bind(console)) as typeof console.error;
  return () => lines.join("\n");
}

/**
 * Record what this guard decided, where anything without credentials can read it.
 *
 * Never throws and never changes the caller's exit code: publishing is the
 * REPORTING channel, and a reporting failure must not be able to mask or worsen
 * the thing it is reporting on. It is loud here, and check_verdicts.ts fails on
 * a verdict that is missing or bound to the wrong code — so a publish that
 * silently did not happen still surfaces, one layer out.
 */
export async function publishVerdict(id: string, v: Verdict): Promise<void> {
  // ── A GUARD RUN FROM AN UNMERGED BRANCH MUST NOT STAMP THE SHARED FEED ───
  // `check_verdicts.ts` reads the LATEST verdict per guard and reports DRIFTED
  // when its `code_fingerprint` does not match the checkout doing the reading.
  // So a guard re-run in an agent worktree — which is how this repo works, and
  // which the guard's own `refresh` command invites — writes a verdict bound to
  // code that is not on main, and every build on main goes red for a change
  // nobody merged. The fix is not to stop re-running the guards; it is to be
  // able to re-run one for its FIGURES without claiming they cover main.
  //
  // Opt-in, so nothing that publishes today stops publishing, and loud, because
  // a verdict that silently did not happen is the failure mode this whole
  // channel exists to remove.
  if (process.env.GUARD_NO_PUBLISH) {
    console.log(`  [verdict] ${id} = ${v.status} NOT published (GUARD_NO_PUBLISH). `
      + `The figures above are this checkout's; the shared feed still carries `
      + `whatever the last merged run said, which is the honest state for a `
      + `branch. Unset it on the run that is meant to speak for main.`);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Not an error: a guard that skipped for want of credentials has decided
    // nothing, and a verdict saying otherwise would be a lie. The absence is
    // what check_verdicts.ts reports.
    return;
  }
  let fp: string;
  try {
    fp = fingerprint(id);
  } catch (err) {
    console.error(`  [verdict] NOT published for ${id}: could not compute the code`);
    console.error(`  fingerprint (${err}). An unbound verdict would claim to cover`);
    console.error(`  code it cannot name, so nothing is written.`);
    return;
  }
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
    await client.connect();
    try {
      await client.query(readFileSync(SCHEMA, "utf8"));
      const { rows } = await client.query(
        `INSERT INTO guard_verdicts (guard, status, produced_by, code_fingerprint,
                                     summary, metrics, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, taken_at`,
        [id, v.status, process.env.GUARD_PRODUCED_BY ?? "local", fp,
         v.summary.slice(0, 400), JSON.stringify(v.metrics ?? {}),
         (v.detail ?? "").slice(-8000)]);
      console.log(`  [verdict] ${id} = ${v.status} published as ` +
                  `#${rows[0].id}, code ${fp}`);
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error(`  [verdict] NOT published for ${id}: ${err}`);
    console.error(`  check_verdicts.ts will report this guard as SILENT.`);
  }
}
