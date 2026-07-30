// Persist what each founder was actually shown.
//
// Nothing recorded this before. bench_report.ts can tell whether a brief is
// well FORMED — right number of rows, every row actionable, blockers in plain
// English — but not whether it was RIGHT, because the outcome was never
// captured anywhere. Twelve synthetic archetypes are a regression suite, not
// evidence about real founders.
//
// This is deliberately written now rather than when it is needed: every brief
// served before the table exists is evidence permanently lost. It cannot be
// backfilled.
//
// What it deliberately does NOT do:
//   * block or slow the response — one fire-and-forget insert after the brief
//     has already streamed, and any failure is swallowed with a log;
//   * store free text the founder wrote about themselves. Company name and
//     description are what they typed and are kept, because without them a
//     recorded shortlist cannot be interpreted; nothing else is collected, and
//     there is no identifier tying two briefs to one person.
import type { EligibilityAnswers, InstitutionEntry } from "./types";

export interface BriefRecord {
  company: string;
  country?: string;
  description?: string;
  eligibility?: EligibilityAnswers;
  capitalSought?: string[];
  /** The shortlist as published, with the code-computed verdict per row —
   *  the part we would need in order to check a decision later. */
  institutions: Pick<InstitutionEntry,
    "institution" | "channel" | "country" | "verdict" | "blocker" | "stale">[];
  /** Rows the pipeline dropped and why, so a thin brief can be explained
   *  after the fact instead of guessed at. */
  droppedBlocked: number;
  droppedWatchOnly: number;
  candidateCount: number;
  /** Every exclusion rule that fired, and how many funds it removed
   *  (exclusions.ts). The two counters above are a two-rule summary of what
   *  is really a fourteen-rule funnel; this is the whole of it, and it is the
   *  before-state the fit score has to be measured against. */
  exclusions?: Record<string, number>;
  durationMs: number;
  /** Which build produced it — the same reason bench runs carry a git SHA:
   *  without it, records from different pipeline versions get compared as
   *  though they were the same system. */
  codeVersion?: string;
}

let ensured = false;

/** Created on first use rather than by a migration: this table belongs to the
 *  app, not the ETL, and there is no Postgres DDL in the repo (see
 *  migrate_to_postgres.py, which self-heals its columns the same way). */
async function ensureTable(client: import("pg").Client): Promise<void> {
  if (ensured) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS brief_records (
      id            BIGSERIAL PRIMARY KEY,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      company       TEXT NOT NULL,
      country       TEXT,
      description   TEXT,
      eligibility   JSONB,
      capital_sought TEXT[],
      institutions  JSONB NOT NULL,
      dropped_blocked    INTEGER,
      dropped_watch_only INTEGER,
      candidate_count    INTEGER,
      duration_ms   INTEGER,
      code_version  TEXT,
      exclusions    JSONB,
      -- Filled in later, by hand or by a follow-up, when we learn what
      -- happened. The whole point of the table: without an outcome column
      -- there is nothing to measure precision against.
      outcome       TEXT,
      outcome_note  TEXT
    )`);
  await client.query(
    "CREATE INDEX IF NOT EXISTS brief_records_created_idx ON brief_records (created_at DESC)");
  // Self-healing column add. CREATE TABLE IF NOT EXISTS is a no-op against the
  // table that already exists in production, so a column added to the DDL
  // above would never appear there and every insert naming it would fail.
  // Same approach as migrate_to_postgres.py, for the same reason: this table
  // belongs to the app and there is no migration runner in the repo.
  await client.query("ALTER TABLE brief_records ADD COLUMN IF NOT EXISTS exclusions JSONB");
  ensured = true;
}

/**
 * How long the IDENTIFYING free text is kept. Set to 90 days by the user
 * 2026-07-28, down from 400.
 *
 * That shorter window creates a real tension, so the design changed with it.
 * 400 days was chosen to outlast a public-funding application cycle (6-12
 * months), which is the only way the outcome of a brief becomes knowable. At
 * 90 days the evidence would expire before the outcome exists, which would
 * quietly kill the backlogged outcome loop.
 *
 * Resolved by separating the two things that were being conflated. What is
 * SENSITIVE is the founder's own prose and their company name — those go at 90
 * days, no exceptions. What is USEFUL is the structured record: which
 * instruments we shortlisted, what verdict the engine reached, what was
 * dropped and why. None of that identifies anyone once the name and
 * description are gone, so it is kept.
 *
 * Standard data minimisation: shorten the retention of what is identifying,
 * not of what is anonymous.
 */
export const RETENTION_DAYS = 90;

/**
 * Anonymise submissions past the retention window.
 *
 * Runs opportunistically after a write rather than on a scheduler, because a
 * cron that nobody notices has stopped is worse than one bounded by traffic:
 * if briefs are being written, the purge is running. At most once an hour per
 * warm instance.
 *
 * At 90 days EVERY row loses its company name, country and description — the
 * three fields that could identify a business — whether or not an outcome was
 * ever recorded. What remains is the shortlist, the verdicts and the drop
 * counts, which describe our own behaviour rather than anyone's company.
 *
 * Deliberately an UPDATE, not a DELETE. Deleting would also destroy the record
 * of what the product recommended, which is the evidence the outcome loop
 * needs and which stops being personal data the moment the name is gone.
 */
let lastPurge = 0;
async function purgeExpired(client: import("pg").Client): Promise<void> {
  if (Date.now() - lastPurge < 60 * 60 * 1000) return;
  lastPurge = Date.now();
  const scrubbed = await client.query(
    `UPDATE brief_records
        SET company = 'anonymised', country = NULL, description = NULL
      WHERE created_at < now() - $1::interval AND company <> 'anonymised'`,
    [`${RETENTION_DAYS} days`]);
  if (scrubbed.rowCount) {
    console.log("[brief_records] retention: anonymised %d rows older than %d days",
      scrubbed.rowCount, RETENTION_DAYS);
  }
}

/** Fire-and-forget. Never throws, never awaited by the request path. */
export function recordBrief(rec: BriefRecord): void {
  void (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    let client: import("pg").Client | undefined;
    try {
      const { Client } = await import("pg");
      client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
      await client.connect();
      await client.query("SET statement_timeout = 3000");
      await ensureTable(client);
      await client.query(
        `INSERT INTO brief_records
           (company, country, description, eligibility, capital_sought, institutions,
            dropped_blocked, dropped_watch_only, candidate_count, duration_ms, code_version,
            exclusions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [rec.company, rec.country ?? null, rec.description ?? null,
         rec.eligibility ? JSON.stringify(rec.eligibility) : null,
         rec.capitalSought ?? null, JSON.stringify(rec.institutions),
         rec.droppedBlocked, rec.droppedWatchOnly, rec.candidateCount,
         rec.durationMs, rec.codeVersion ?? null,
         rec.exclusions ? JSON.stringify(rec.exclusions) : null],
      );
      await purgeExpired(client);
    } catch (err) {
      // A brief that was already delivered must never fail because we could
      // not write a note about it.
      console.error("brief_records write failed (ignored):", String(err));
    } finally {
      await client?.end().catch(() => {});
    }
  })();
}
