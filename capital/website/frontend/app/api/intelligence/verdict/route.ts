import { NextRequest } from "next/server";
import { hydrateDbInstruments } from "@/lib/intelligence/corpus";
import { computeVerdict } from "@/lib/intelligence/pipeline";
import { sanitizeCapitalSought, sanitizeEligibility, sanitizeFreeText,
  withIncorporationCountry, sanitizeTargetMarkets,
} from "@/lib/intelligence/sanitize";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

// The fast path: a deterministic eligibility verdict, zero model calls (local
// DB match + code-only evaluation), so it returns in well under a second —
// unlike /api/intelligence, which streams a 2-3 minute AI-researched memo.
// Node runtime for the corpus lookups, which reach POSTGRES: hydrateDbInstruments()
// dynamically imports `pg` and degrades to the committed JSON snapshot when that
// fails. This said "the SQLite-backed corpus lookups" (wsEW) — the local
// db.sqlite is the ETL's cache, no SQLite driver is a dependency of this app,
// and nothing on a request path has read that file. Never statically optimised.
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
    await hydrateDbInstruments();
    const verdict = await computeVerdict(
      body.company.trim(),
      body.country?.trim() || undefined,
      withIncorporationCountry(sanitizeEligibility(body.eligibility), body.country?.trim()),
      {
        targetMarkets: sanitizeTargetMarkets(body.targetMarkets),
        capitalSought: sanitizeCapitalSought(body.capitalSought),
        // Drives thematic leaf selection (relevance.ts), so the shortlist the
        // adaptive round is grounded in already reflects what they do.
        description: sanitizeFreeText(body.description),
      },
    );
    return Response.json(verdict);
  } catch (err) {
    console.error("verdict route failed:", err);
    return Response.json({ error: "Could not compute the verdict." }, { status: 500 });
  }
}
