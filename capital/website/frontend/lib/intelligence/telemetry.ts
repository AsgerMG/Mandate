// Error and degradation capture, on the infrastructure we already have.
//
// Chosen over a hosted tracker (Sentry et al) deliberately: no signup, no cost,
// and — the reason that actually decided it — no new processor to add to the
// privacy notice, for a product whose whole posture is "no account, no email,
// no third-party tracking".
//
// The tradeoff taken honestly: no stack traces, no real-time paging. What this
// gives instead is the thing this product actually needs, which is different
// from what a crash tracker gives. Our failure mode is not a 500. It is a
// SUBTLY WORSE ANSWER — a brief that ships two rows instead of five, or falls
// back to the thinking-off writer, or loses its comparables. None of that
// throws, so a crash tracker would sit silent through all of it.
//
// So this records DEGRADATION as a first-class event alongside errors, and
// scripts/health_report.ts turns both into a digest.
import type { Client } from "pg";
import { openPg } from "@/lib/db";

/** What went wrong, in the vocabulary of this pipeline's known failure modes. */
export type EventKind =
  /** The request died; the founder saw an error. */
  | "request_failed"
  /** Adaptive writer blew its deadline; the thinking-off retry ran. */
  | "writer_timeout"
  /** Writer hit max_tokens and produced nothing usable. */
  | "writer_truncated"
  /** Comparable research failed or did not parse; brief continued without it. */
  | "research_degraded"
  /** Gate detail could not be fetched; citations render blank. */
  | "hydration_degraded"
  /** Brief shipped fewer than two institutions. */
  | "thin_brief"
  /** Daily euro ceiling refused a request. */
  | "quota_exhausted"
  /** Prompt-control sequences were stripped from founder-supplied text. */
  | "prompt_injection_blocked"
  /** The writer returned no note for a candidate it was told to write about.
   *  A degradation rather than an error: the row publishes from its own facts
   *  and keeps its rank, so nothing is lost, but a call that skipped part of
   *  its task is worth watching and cannot be seen in the output.
   *
   *  It replaces `writer_over_rejected` — "writer disqualified more candidates
   *  than the cap allows; rows reinstated" — which described the
   *  disqualification flag, outlived it, and had no emitter left in the repo. */
  | "writer_notes_missing"
  /** A published brief broke a contract rule `checkBrief` can decide.
   *  Observational: the brief still ships. Until 2026-08-11 these predicates
   *  ran only on fixtures, so a rule firing in production was invisible until
   *  a human rendered the page. */
  | "brief_rule_violated"
  /** `checkBrief` itself threw while inspecting a published brief. The brief
   *  still ships; this says the instrument is broken, not the output. */
  | "brief_check_failed"
  /** The writer printed one of our own keys into text a founder reads, and it
   *  was replaced with the fund's name before the brief was served (BRIEF-5).
   *  A degradation: the founder gets clean prose, and this is the only way the
   *  contract's effect on a live model is ever visible from outside. */
  | "memo_id_redacted"
  /** The redaction itself threw. The brief still ships, which means an
   *  identifier may have reached the page: the instrument is broken and this
   *  is not a degradation the system absorbed. */
  | "memo_id_redact_failed";

/** Degradations are expected occasionally; errors are not. Kept apart so a
 *  digest can distinguish "the system absorbed a problem" from "it failed". */
const DEGRADATIONS: ReadonlySet<EventKind> = new Set<EventKind>([
  "writer_timeout", "writer_truncated", "research_degraded",
  "hydration_degraded", "thin_brief", "writer_notes_missing",
  // A violated rule is a degradation, not an error: the brief is published and
  // usable, and the system absorbed the problem rather than failing. A check
  // that THREW is an error -- the instrument is broken and nothing is watching.
  "brief_rule_violated",
  // Same argument one step earlier: the identifier was caught and the founder
  // reads the fund's name. The REPAIR failing is an error, and is not here.
  "memo_id_redacted",
]);

let ensured = false;

async function ensureTable(client: Client): Promise<void> {
  if (ensured) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_log (
      id         BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      kind       TEXT NOT NULL,
      severity   TEXT NOT NULL,
      route      TEXT,
      detail     TEXT,
      meta       JSONB
    )`);
  await client.query(
    "CREATE INDEX IF NOT EXISTS event_log_created_idx ON event_log (created_at DESC)");
  await client.query(
    "CREATE INDEX IF NOT EXISTS event_log_kind_idx ON event_log (kind, created_at DESC)");
  ensured = true;
}

/**
 * Record an event. Fire-and-forget and never throws.
 *
 * A brief that already reached the founder must not fail because we could not
 * write a note about it — and an observability layer that can take down the
 * thing it observes is worse than none.
 */
export function recordEvent(
  kind: EventKind,
  detail: string,
  meta: Record<string, unknown> = {},
  route = "intelligence",
): void {
  const severity = DEGRADATIONS.has(kind) ? "degraded" : "error";
  // Always log locally too: platform logs are the fallback when Postgres is
  // the thing that is broken.
  const line = `[${severity}] ${kind}: ${detail}`;
  if (severity === "error") console.error(line, meta);
  else console.warn(line, meta);

  void (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    let client: Client | undefined;
    try {
      client = await openPg(url, { connectMs: 2000, statementMs: 2000 });
      await ensureTable(client);
      await client.query(
        "INSERT INTO event_log (kind, severity, route, detail, meta) VALUES ($1,$2,$3,$4,$5)",
        [kind, severity, route, detail.slice(0, 2000), JSON.stringify(meta)],
      );
    } catch {
      // Deliberately silent: console.error above already carries it, and a
      // failed telemetry write must not produce a second error to chase.
    } finally {
      await client?.end().catch(() => {});
    }
  })();
}
