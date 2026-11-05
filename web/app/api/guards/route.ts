// The published verdicts, readable without credentials.
//
// ── Why this endpoint exists at all ────────────────────────────────────────
// Nine of this repo's checks need a corpus that CI is not allowed to see:
// data/db.sqlite is gitignored and lives on a Railway volume, and the
// eligibility Postgres holds the funds themselves. The obvious fix is a
// DATABASE_URL secret in GitHub Actions, and it is the wrong one: it widens the
// blast radius of one compromised workflow from "can read our code" to "can
// read and write every award, company and fund we hold".
//
// So the guards run where their data is and write a verdict
// (ETL/lib/guard_verdicts.py), and this serves those verdicts to anything that
// asks. The site already holds DATABASE_URL because the product needs it; that
// is a credential we cannot avoid having. GitHub Actions holding one is a
// credential we can. check_verdicts.ts reads this over plain HTTPS and needs
// nothing.
//
// ── Why it is safe to serve unauthenticated ────────────────────────────────
// Not because the payload was reviewed once and found harmless — that is a
// property of a moment, and the next guard to be added would not be covered by
// it. It is a property of the QUERY: this handler selects `summary` and
// `metrics`, and never `detail`. A guard's full output — every row it printed,
// every id it named — lives in a column this endpoint does not read, so a guard
// author cannot leak through it by writing more. What is served is a name, a
// pass/fail, two timestamps, a code hash and the figures the guard chose to
// publish.
//
// GET /api/guards            newest verdict per guard, plus recent history
// GET /api/guards?guard=census&limit=12
import { NextRequest } from "next/server";
import type { Client } from "pg";
import { openPg } from "@/lib/db";

// Reads Postgres per request; there is no build-time answer, and a cached one
// would report the freshness of the cache rather than of the verdicts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** History depth. check_verdicts.ts derives the expected publishing cadence
 *  from the spacing of the verdicts themselves rather than from a hardcoded
 *  week, so it needs several per guard — same reasoning as
 *  check_corpus_census.ts, which established it. */
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Never 200 with an empty list. A reader that cannot tell "no verdicts
    // exist" from "this deployment has no database" would report the second as
    // the first, and the first is a hard failure downstream.
    return Response.json(
      { error: "no database configured on this deployment" }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const only = params.get("guard");
  const limit = Math.min(MAX_LIMIT,
    Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT));

  let client: Client | undefined;
  try {
    client = await openPg(url, { connectMs: 5000 });
    const exists = (await client.query(
      "SELECT to_regclass('guard_verdicts') IS NOT NULL AS ok")).rows[0].ok;
    if (!exists) {
      // Distinguished from "empty" for the same reason as above: no table means
      // nothing has ever published, which is a different and worse fact than a
      // guard having no verdict yet.
      return Response.json({ error: "guard_verdicts does not exist" }, { status: 503 });
    }
    // Newest `limit` per guard. `detail` is deliberately absent; see above.
    const { rows } = await client.query(
      `SELECT guard, status, taken_at, produced_by, code_fingerprint, summary, metrics
         FROM (SELECT *, row_number() OVER (PARTITION BY guard ORDER BY taken_at DESC) rn
                 FROM guard_verdicts
                WHERE ($1::text IS NULL OR guard = $1)) t
        WHERE rn <= $2
        ORDER BY guard, taken_at DESC`, [only, limit]);

    const guards: Record<string, unknown[]> = {};
    for (const r of rows) {
      (guards[r.guard] ??= []).push({
        status: r.status,
        takenAt: (r.taken_at as Date).toISOString(),
        producedBy: r.produced_by,
        codeFingerprint: r.code_fingerprint,
        summary: r.summary,
        metrics: r.metrics,
      });
    }
    return Response.json({ servedAt: new Date().toISOString(), guards }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("guards feed failed:", err);
    return Response.json({ error: "could not read the verdicts" }, { status: 503 });
  } finally {
    await client?.end().catch(() => {});
  }
}
