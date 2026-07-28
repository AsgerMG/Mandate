import { NextRequest } from "next/server";
import { hydrateDbInstruments } from "@/lib/intelligence/corpus";
import { checkQuota, recordCost } from "@/lib/intelligence/quota";
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
// The pipeline makes three model calls plus web search; give it headroom.
export const maxDuration = 300;

// Rate limiting and the global spend ceiling now live in lib/intelligence/quota.ts,
// backed by Postgres. The in-memory counter that used to sit here reset on cold
// start — which on a serverless platform means a new instance starts every
// counter at zero, and instances are cheap to provoke. It was a suggestion, not
// a limit, on the one endpoint that costs six model calls per request.

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const quota = await checkQuota(ip, "intelligence");
  if (!quota.allowed) {
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
        console.error("intelligence pipeline failed:", err);
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
