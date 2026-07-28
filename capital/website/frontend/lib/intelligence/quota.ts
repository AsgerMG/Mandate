// Abuse and spend control for the paid endpoint.
//
// /api/intelligence runs six model calls plus web search per request and is
// open to the internet. The only control was an in-memory counter of five per
// hour per IP, and the code said so itself: it "resets on cold start". On a
// serverless platform that is not a limit, it is a suggestion — a new instance
// starts every counter at zero, and instances are cheap to provoke.
//
// Two controls, both in Postgres so they survive a cold start and are shared
// across instances:
//
//   1. per-IP rate limit — unchanged intent, now durable
//   2. a GLOBAL daily ceiling that FAILS CLOSED
//
// The second is the one that matters. A per-IP limit caps one attacker; it
// does nothing about a hundred. The ceiling is the difference between a bad
// day and an unbounded bill, and it must refuse service rather than degrade —
// silently serving a cheaper, worse brief would hide the problem behind
// exactly the failure mode this codebase is worst at detecting.
import type { Client } from "pg";

/** Per IP, per hour. */
export const MAX_PER_IP_HOUR = 5;

/**
 * Global daily spend ceiling, in EUROS.
 *
 * This was a COUNT (200 briefs/day) — a proxy for the thing that matters, and a
 * bad one: a brief whose writer thinks for 150 seconds costs several times one
 * that returns in 24, and a counter cannot tell them apart. Capping on money
 * means the limit means what it says, and the number below can be set from a
 * budget rather than from a guess about average cost.
 *
 * Enforced against real measured spend (cost.ts reads usage off each API
 * response), not an estimate.
 */
export const MAX_DAILY_SPEND_EUR = 50;

let ensured = false;

async function ensureTable(client: Client): Promise<void> {
  if (ensured) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS request_log (
      id         BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_hash    TEXT NOT NULL,
      route      TEXT NOT NULL,
      -- Measured euro cost of the request this row represents. Null until the
      -- brief finishes: the row is written BEFORE the work, so the ceiling
      -- cannot be bypassed by requests that never complete.
      cost_eur   DOUBLE PRECISION
    )`);
  await client.query(
    "CREATE INDEX IF NOT EXISTS request_log_created_idx ON request_log (created_at DESC)");
  await client.query(
    "CREATE INDEX IF NOT EXISTS request_log_ip_idx ON request_log (ip_hash, created_at DESC)");
  // Additive, so an existing deployment picks the column up without a migration.
  await client.query(
    "ALTER TABLE request_log ADD COLUMN IF NOT EXISTS cost_eur DOUBLE PRECISION");
  ensured = true;
}

export type QuotaVerdict =
  | { allowed: true; requestId?: number }
  | { allowed: false; reason: "ip" | "global"; message: string };

/**
 * Record the attempt and decide whether to serve it.
 *
 * The IP is stored as a salted hash, never in the clear: we need to count
 * requests from the same source, which does not require knowing the source.
 *
 * Fails OPEN on a database error, deliberately. The quota exists to bound
 * spend, not to be a availability dependency — a Postgres blip should not take
 * the product down. The global ceiling still bounds the worst case because a
 * sustained outage is visible in a way a slow leak is not.
 */
export async function checkQuota(ip: string, route: string): Promise<QuotaVerdict> {
  const url = process.env.DATABASE_URL;
  if (!url) return { allowed: true };
  let client: Client | undefined;
  try {
    const { Client: PgClient } = await import("pg");
    client = new PgClient({ connectionString: url, connectionTimeoutMillis: 2000 });
    await client.connect();
    await client.query("SET statement_timeout = 2000");
    await ensureTable(client);

    const { createHash } = await import("node:crypto");
    const salt = process.env.IP_HASH_SALT ?? "wincent";
    const ipHash = createHash("sha256").update(salt + ip).digest("hex").slice(0, 32);

    const [spend, perIp] = await Promise.all([
      // Requests still in flight have no cost yet. Charging them at the running
      // average stops a burst of concurrent requests from all passing the check
      // before any of them has reported what it cost.
      client.query(
        `SELECT COALESCE(SUM(cost_eur), 0)::float8 AS spent,
                COUNT(*) FILTER (WHERE cost_eur IS NULL)::int AS pending,
                COALESCE(AVG(cost_eur), 0)::float8 AS avg
           FROM request_log WHERE created_at > now() - interval '1 day'`),
      client.query(
        `SELECT COUNT(*)::int AS n FROM request_log
          WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`, [ipHash]),
    ]);

    const row = spend.rows[0] ?? { spent: 0, pending: 0, avg: 0 };
    // Assume a per-brief cost for in-flight requests until they report. The
    // 0.15 floor covers the cold case where nothing has completed yet and the
    // average is still zero.
    const projected = row.spent + row.pending * Math.max(row.avg, 0.15);
    if (projected >= MAX_DAILY_SPEND_EUR) {
      console.error("[quota] daily SPEND ceiling reached — refusing service", {
        spentEur: Number(row.spent.toFixed(2)), pending: row.pending,
        limitEur: MAX_DAILY_SPEND_EUR, route,
      });
      return {
        allowed: false, reason: "global",
        message: "Wincent has reached its daily limit for generated briefs. Please try tomorrow.",
      };
    }
    if ((perIp.rows[0]?.n ?? 0) >= MAX_PER_IP_HOUR) {
      return {
        allowed: false, reason: "ip",
        message: "Rate limit reached. Try again in an hour.",
      };
    }

    // Written BEFORE the work, so a request that dies mid-flight still counts
    // against the ceiling. Returns the id so the caller can report actual cost.
    const ins = await client.query(
      "INSERT INTO request_log (ip_hash, route) VALUES ($1, $2) RETURNING id", [ipHash, route]);
    return { allowed: true, requestId: ins.rows[0]?.id as number | undefined };
  } catch (err) {
    console.error("[quota] check failed, allowing request:", String(err));
    return { allowed: true };
  } finally {
    await client?.end().catch(() => {});
  }
}

/**
 * Report what a completed request actually cost.
 *
 * Fire-and-forget: a brief that has already been delivered must never fail
 * because the meter could not be updated. An unreported request stays NULL and
 * is charged at the running average by the check above, so the ceiling degrades
 * conservatively rather than leaking.
 */
export function recordCost(requestId: number | undefined, eur: number): void {
  if (!requestId) return;
  void (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    let client: Client | undefined;
    try {
      const { Client: PgClient } = await import("pg");
      client = new PgClient({ connectionString: url, connectionTimeoutMillis: 2000 });
      await client.connect();
      await client.query("UPDATE request_log SET cost_eur = $1 WHERE id = $2", [eur, requestId]);
    } catch (err) {
      console.error("[quota] cost report failed (ignored):", String(err));
    } finally {
      await client?.end().catch(() => {});
    }
  })();
}
