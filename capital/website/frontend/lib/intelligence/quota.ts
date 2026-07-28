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
/** Every brief, everyone, per day. Roughly a low-tens-of-dollars ceiling at
 *  current per-brief cost — set to bound the damage, not the business, and
 *  meant to be raised deliberately rather than discovered. */
export const MAX_GLOBAL_DAY = 200;

let ensured = false;

async function ensureTable(client: Client): Promise<void> {
  if (ensured) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS request_log (
      id         BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_hash    TEXT NOT NULL,
      route      TEXT NOT NULL
    )`);
  await client.query(
    "CREATE INDEX IF NOT EXISTS request_log_created_idx ON request_log (created_at DESC)");
  await client.query(
    "CREATE INDEX IF NOT EXISTS request_log_ip_idx ON request_log (ip_hash, created_at DESC)");
  ensured = true;
}

export type QuotaVerdict =
  | { allowed: true }
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

    const [global, perIp] = await Promise.all([
      client.query(
        "SELECT COUNT(*)::int AS n FROM request_log WHERE created_at > now() - interval '1 day'"),
      client.query(
        `SELECT COUNT(*)::int AS n FROM request_log
          WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`, [ipHash]),
    ]);

    if ((global.rows[0]?.n ?? 0) >= MAX_GLOBAL_DAY) {
      console.error("[quota] GLOBAL daily ceiling reached — refusing service", {
        limit: MAX_GLOBAL_DAY, route,
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

    await client.query("INSERT INTO request_log (ip_hash, route) VALUES ($1, $2)", [ipHash, route]);
    return { allowed: true };
  } catch (err) {
    console.error("[quota] check failed, allowing request:", String(err));
    return { allowed: true };
  } finally {
    await client?.end().catch(() => {});
  }
}
