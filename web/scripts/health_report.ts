/**
 * Operational health, from the data we already keep.
 *
 * FREE. Reads Postgres only — no model calls, no third-party service.
 *
 * This is the alerting layer, chosen over a hosted error tracker because this
 * product's failure mode is not a crash. A brief that ships two rows instead of
 * five, or falls back to the thinking-off writer, or silently loses its
 * comparables, is a WORSE ANSWER that throws nothing — a crash tracker sits
 * silent through every one of them.
 *
 * So this reports three things a stack trace cannot:
 *   1. errors — the request died and a founder saw a failure
 *   2. degradations — the system absorbed a problem and shipped anyway
 *   3. spend against the ceiling, with the trend
 *
 * Run: npx tsx scripts/health_report.ts [--days 7]
 * Exits non-zero when something needs attention, so it can be a cron or a
 * status check rather than something someone remembers to look at.
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("health_report", ["DATABASE_URL"]);

/** Above this share of requests failing outright, something is broken. */
const ERROR_RATE_ALERT = 0.05;
/** Degradations are expected sometimes; a third of all briefs is not. */
const DEGRADED_RATE_ALERT = 0.33;
/** Warn while there is still time to react, not once the ceiling has hit. */
const SPEND_WARN_FRACTION = 0.7;

const bar = (n: number, max: number, width = 24) =>
  "█".repeat(Math.max(0, Math.round((n / Math.max(max, 1)) * width)));

async function main() {
  const daysArg = process.argv.indexOf("--days");
  const days = daysArg !== -1 ? Number(process.argv[daysArg + 1]) : 7;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set — nothing to report on");
    process.exitCode = 1;
    return;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  const problems: string[] = [];

  try {
    const iv = `${days} days`;

    // The tables are created lazily on first write, so on a fresh deployment
    // event_log does not exist until something has gone wrong. A monitoring
    // tool that crashes because nothing has failed yet is worse than useless —
    // it reports an outage of itself. Create them idempotently and move on.
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_log (
        id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        kind TEXT NOT NULL, severity TEXT NOT NULL, route TEXT,
        detail TEXT, meta JSONB)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS request_log (
        id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ip_hash TEXT NOT NULL, route TEXT NOT NULL, cost_eur DOUBLE PRECISION)`);

    const briefs = await client.query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE jsonb_array_length(institutions) < 2)::int AS thin,
              COALESCE(AVG(jsonb_array_length(institutions)), 0)::float8 AS avg_rows,
              COALESCE(AVG(duration_ms), 0)::float8 AS avg_ms
         FROM brief_records WHERE created_at > now() - $1::interval`, [iv]);
    const b = briefs.rows[0];

    const events = await client.query(
      `SELECT kind, severity, COUNT(*)::int AS n
         FROM event_log WHERE created_at > now() - $1::interval
        GROUP BY 1, 2 ORDER BY n DESC`, [iv]);

    const spend = await client.query(
      `SELECT COALESCE(SUM(cost_eur), 0)::float8 AS eur, COUNT(*)::int AS n
         FROM request_log WHERE created_at > now() - interval '1 day'`);
    const today = spend.rows[0];

    const daily = await client.query(
      `SELECT date_trunc('day', created_at)::date AS d,
              COUNT(*)::int AS n, COALESCE(SUM(cost_eur), 0)::float8 AS eur
         FROM request_log WHERE created_at > now() - $1::interval
        GROUP BY 1 ORDER BY 1`, [iv]);

    const { MAX_DAILY_SPEND_EUR } = await import("../lib/intelligence/quota");

    console.log(`\nWincent health — last ${days} days\n${"─".repeat(56)}`);
    console.log(`briefs generated     ${b.n}`);
    if (b.n > 0) {
      console.log(`rows per brief       ${b.avg_rows.toFixed(1)}`);
      console.log(`median duration      ${Math.round(b.avg_ms / 1000)}s`);
      console.log(`thin (<2 rows)       ${b.thin}  (${((b.thin / b.n) * 100).toFixed(0)}%)`);
    }

    const errors = events.rows.filter((r) => r.severity === "error");
    const degraded = events.rows.filter((r) => r.severity === "degraded");
    const errorTotal = errors.reduce((n, r) => n + r.n, 0);
    const degradedTotal = degraded.reduce((n, r) => n + r.n, 0);

    console.log(`\nerrors               ${errorTotal}`);
    for (const r of errors) console.log(`  ${String(r.n).padStart(4)}  ${r.kind}`);
    console.log(`degradations         ${degradedTotal}`);
    for (const r of degraded) console.log(`  ${String(r.n).padStart(4)}  ${r.kind}`);

    console.log(`\nspend today          EUR ${today.eur.toFixed(2)} of ${MAX_DAILY_SPEND_EUR} ` +
      `(${((today.eur / MAX_DAILY_SPEND_EUR) * 100).toFixed(0)}%)`);
    if (daily.rows.length) {
      const max = Math.max(...daily.rows.map((r) => r.eur));
      console.log("\ndaily spend");
      for (const r of daily.rows) {
        console.log(`  ${r.d.toISOString().slice(5, 10)}  EUR ${r.eur.toFixed(2).padStart(6)} ` +
          `${bar(r.eur, max)}`);
      }
    }

    // ── What needs attention ────────────────────────────────────────────────
    if (b.n > 0 && errorTotal / b.n > ERROR_RATE_ALERT) {
      problems.push(`error rate ${((errorTotal / b.n) * 100).toFixed(0)}% ` +
        `exceeds ${ERROR_RATE_ALERT * 100}% — requests are failing, not just degrading`);
    }
    if (b.n > 0 && degradedTotal / b.n > DEGRADED_RATE_ALERT) {
      problems.push(`degradation rate ${((degradedTotal / b.n) * 100).toFixed(0)}% ` +
        `exceeds ${DEGRADED_RATE_ALERT * 100}% — briefs are shipping, but worse than they should`);
    }
    if (today.eur > MAX_DAILY_SPEND_EUR * SPEND_WARN_FRACTION) {
      problems.push(`spend at ${((today.eur / MAX_DAILY_SPEND_EUR) * 100).toFixed(0)}% of the ` +
        `daily ceiling — raise MAX_DAILY_SPEND_EUR deliberately or expect 503s`);
    }
    const quotaHits = events.rows.find((r) => r.kind === "quota_exhausted");
    if (quotaHits) {
      problems.push(`the ceiling refused ${quotaHits.n} request(s) — real users were turned away`);
    }

    console.log(`\n${"─".repeat(56)}`);
    if (problems.length) {
      console.log("NEEDS ATTENTION");
      for (const p of problems) console.log(`  · ${p}`);
      process.exitCode = 1;
    } else {
      console.log("nothing needs attention");
    }
  } finally {
    await client.end();
  }
}

main();
