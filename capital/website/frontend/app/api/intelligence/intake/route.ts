import { NextRequest } from "next/server";
import { distinctFamilyCount, openFieldsForShortlist } from "@/lib/intelligence/gateReach";
import { generateGroundedRound } from "@/lib/intelligence/pipeline";
import {
  sanitizeCapitalSought,
  sanitizeEligibility,
  sanitizeInstrumentIds,
  sanitizeTargetMarkets,
} from "@/lib/intelligence/sanitize";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

// Phase 3C: one grounded adaptive round per call. Node runtime (Anthropic SDK
// + fund-process reads); never statically optimised.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Stopping rule (advisory_pipeline Phase 3C): below this, nothing left could
// plausibly move the shortlist's fitting/not-fitting boundary enough to be
// worth another round — matches ETL/terms/aggregate_intake_usage.py's reach
// methodology, scoped live to this founder's shortlist instead of the whole
// corpus (see gateReach.ts).
const MIN_REACH_PCT = 15;
const MIN_FAMILIES = 3;

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

  const candidateIds = sanitizeInstrumentIds(body.candidateInstrumentIds) ?? [];
  const eligibility = sanitizeEligibility(body.eligibility);

  try {
    const openFields = openFieldsForShortlist(candidateIds, eligibility);
    const families = distinctFamilyCount(candidateIds);
    if (!openFields.length || openFields[0].reachPct < MIN_REACH_PCT || families <= MIN_FAMILIES) {
      // Nothing left worth asking — never spend a model call to find that out.
      return Response.json({ round: null });
    }

    const round = await generateGroundedRound(
      {
        company: body.company.trim(),
        sector: body.sector?.trim() || undefined,
        country: body.country?.trim() || undefined,
        description: body.description?.trim() || undefined,
        companyType: body.companyType?.trim() || undefined,
        capitalSought: sanitizeCapitalSought(body.capitalSought),
        targetMarkets: sanitizeTargetMarkets(body.targetMarkets),
        eligibility,
      },
      openFields,
    );
    // Never block the memo on intake: null just skips the screen.
    return Response.json({ round });
  } catch (err) {
    console.error("intake route failed:", err);
    return Response.json({ round: null });
  }
}
