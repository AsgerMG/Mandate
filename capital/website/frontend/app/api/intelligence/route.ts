import { NextRequest } from "next/server";
import { runIntelligence } from "@/lib/intelligence/pipeline";
import type { IntelligenceRequest, ProgressEvent } from "@/lib/intelligence/types";

// Needs the Node runtime (filesystem + the Anthropic SDK), and must never be
// statically optimised — every request runs the live pipeline.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The pipeline makes three model calls plus web search; give it headroom.
export const maxDuration = 300;

// Best-effort, in-memory IP rate limit. Resets on cold start — enough to deter
// abuse of a paid API, not a billing-accurate quota. Swap for Vercel KV if you
// need persistence across instances.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: "Rate limit reached. Try again in an hour." }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
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
        await runIntelligence(
          {
            company: body.company.trim(),
            sector: body.sector?.trim() || undefined,
            country: body.country?.trim() || undefined,
            description: body.description?.trim() || undefined,
            companyType: body.companyType?.trim() || undefined,
            capitalSought: Array.isArray(body.capitalSought)
              ? body.capitalSought.filter((v) => typeof v === "string")
              : undefined,
          },
          send,
        );
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
