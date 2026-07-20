import { NextRequest } from "next/server";
import { computeVerdict } from "@/lib/intelligence/pipeline";
import { sanitizeCapitalSought, sanitizeEligibility, sanitizeTargetMarkets } from "@/lib/intelligence/sanitize";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

// The fast path: a deterministic eligibility verdict, zero model calls (local
// DB match + code-only evaluation), so it returns in well under a second —
// unlike /api/intelligence, which streams a 2-3 minute AI-researched memo.
// Node runtime for the SQLite-backed corpus lookups; never statically optimised.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: NextRequest) {
  let body: IntelligenceRequest;
  try {
    body = (await request.json()) as IntelligenceRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.company || !body.company.trim()) {
    return Response.json({ error: "A company name is required." }, { status: 400 });
  }

  try {
    const verdict = computeVerdict(
      body.company.trim(),
      body.country?.trim() || undefined,
      sanitizeEligibility(body.eligibility),
      {
        targetMarkets: sanitizeTargetMarkets(body.targetMarkets),
        capitalSought: sanitizeCapitalSought(body.capitalSought),
      },
    );
    return Response.json(verdict);
  } catch (err) {
    console.error("verdict route failed:", err);
    return Response.json({ error: "Could not compute the verdict." }, { status: 500 });
  }
}
