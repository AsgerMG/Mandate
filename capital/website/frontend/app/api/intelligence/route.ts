import { NextRequest } from "next/server";
import { hydrateDbInstruments } from "@/lib/intelligence/corpus";
import { checkQuota, recordCost } from "@/lib/intelligence/quota";
import { recordEvent } from "@/lib/intelligence/telemetry";
import { withCostTracking } from "@/lib/intelligence/cost";
import { runIntelligence } from "@/lib/intelligence/pipeline";
import {
  sanitizeFreeText,
  sanitizeEligibility,
  withIncorporationCountry,
  sanitizeProfileSignal,
  sanitizeProjectAnswers,
  sanitizeTargetMarkets,
} from "@/lib/intelligence/sanitize";
import type { IntelligenceRequest, ProgressEvent } from "@/lib/intelligence/types";

// Needs the Node runtime (filesystem + the Anthropic SDK), and must never be
// statically optimised — every request runs the live pipeline.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ── HEADROOM FOR THE CALLS THE PIPELINE MAKES, WHICH IS NOT A FIXED NUMBER ──
// This said "three model calls plus web search" and, seven lines below, "six
// model calls per request". Both were literals for a count that is CONDITIONAL,
// so both were wrong and they could not both be right (wsEW). Named instead of
// counted, because the list is checkable against the code and a tally is not:
//
//   discoverAndResearch  one call with web_search, plus ONE resume if the
//                        server-side search loop returns `pause_turn`
//   judgeOpenAnswers     one call, only when the founder answered at least one
//                        open question — skipped entirely when they did not
//   synthesize           one streamed writer call, plus ONE retry with thinking
//                        off if the first returns empty or times out
//   agentSelectRows      ZERO on the shipped path: AGENT_SELECT defaults to
//                        `off`. On an arm, one call, plus one more under
//                        AGENT_SELECT_UNSURE=tool when the model uses the tool
//
// So the shipped floor is two calls and the ceiling is well above it, which is
// what 300 seconds is sized for.
export const maxDuration = 300;

// Rate limiting and the global spend ceiling now live in lib/intelligence/quota.ts,
// backed by Postgres. The in-memory counter that used to sit here reset on cold
// start — which on a serverless platform means a new instance starts every
// counter at zero, and instances are cheap to provoke. It was a suggestion, not
// a limit, on the one endpoint that costs several model calls per request (see
// the list above `maxDuration`).

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const quota = await checkQuota(ip, "intelligence");
  if (!quota.allowed) {
    if (quota.reason === "global") {
      recordEvent("quota_exhausted", "daily euro ceiling refused a request");
    }
    return new Response(JSON.stringify({ error: quota.message }), {
      // 503 for the global ceiling: the service is temporarily unavailable to
      // everyone, which is a different thing from this caller being throttled,
      // and clients should not retry it as if it were.
      status: quota.reason === "global" ? 503 : 429,
      headers: { "content-type": "application/json" },
    });
  }

  let body: IntelligenceRequest;
  try {
    body = (await request.json()) as IntelligenceRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!body.company || !body.company.trim()) {
    return new Response(JSON.stringify({ error: "A company name is required." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        await hydrateDbInstruments();
        const { eur, calls } = await withCostTracking(async () => runIntelligence(
          {
            company: body.company.trim(),
            sector: body.sector?.trim() || undefined,
            country: body.country?.trim() || undefined,
            description: sanitizeFreeText(body.description),
            companyType: body.companyType?.trim() || undefined,
            capitalSought: Array.isArray(body.capitalSought)
              ? body.capitalSought.filter((v) => typeof v === "string")
              : undefined,
            clarifications: Array.isArray(body.clarifications)
              ? body.clarifications
                  .filter(
                    (c) =>
                      c &&
                      typeof c.question === "string" &&
                      typeof c.answer === "string" &&
                      c.answer.trim(),
                  )
                  .map((c) => ({ question: c.question.trim(), answer: c.answer.trim() }))
              : undefined,
            targetMarkets: sanitizeTargetMarkets(body.targetMarkets),
            eligibility: withIncorporationCountry(
              sanitizeEligibility(body.eligibility), body.country?.trim()),
            // The same answers as they stood before the follow-up screen, run
            // through the SAME whitelist. The pipeline takes the difference and
            // intersects it with the questions this founder's own shortlist
            // would have produced; nothing here, and nothing on the request,
            // may name a "late field" directly. See answerProvenance.ts.
            //
            // `withIncorporationCountry` is applied to both, or the top-level
            // `country` select would look like an answer that arrived late for
            // every founder — which is precisely the field that must never be
            // able to be late.
            //
            // Left UNDEFINED when the request does not carry it, rather than
            // defaulted to an empty object: absent means "nothing is late", so
            // a client that simply omits it cannot buy every fund an immunity
            // by omission, and no harness's numbers move.
            eligibilityBeforeRound: body.eligibilityBeforeRound
              ? withIncorporationCountry(
                  sanitizeEligibility(body.eligibilityBeforeRound), body.country?.trim())
              : undefined,
            profileSignal: sanitizeProfileSignal(body.profileSignal),
            projectAnswers: sanitizeProjectAnswers(body.projectAnswers),
          },
          send,
        ));
        // What the request actually cost, measured off each API response and
        // reported so the euro ceiling reflects reality rather than an average.
        console.log("[cost] brief cost EUR %s across %d model calls", eur.toFixed(3), calls);
        recordCost(quota.requestId, eur);
      } catch (err) {
        recordEvent("request_failed", String(err),
          { company: body.company?.slice(0, 60) });
        send({
          type: "error",
          message:
            "The analysis could not be completed. Please try again in a moment.",
        });
      } finally {
        controller.close();
      }
    },
  });

  // Newline-delimited JSON; the client reads it incrementally.
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
