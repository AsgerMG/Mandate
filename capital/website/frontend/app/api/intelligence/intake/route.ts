import { NextRequest } from "next/server";
import { distinctFamilyCount, openFieldsForShortlist } from "@/lib/intelligence/gateReach";
import { generateGroundedRound, inferProfileSignal } from "@/lib/intelligence/pipeline";
import {
  sanitizeCapitalSought,
  sanitizeEligibility,
  sanitizeInstrumentIds,
  sanitizeTargetMarkets,
} from "@/lib/intelligence/sanitize";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

// Phase 3C: one grounded adaptive round per call. Phase 4: the free-text
// profile signal rides alongside it on the founder's first call only (see
// wantProfileSignal below) — same request, same loading state, no added
// serial latency. Node runtime (Anthropic SDK + fund-process reads); never
// statically optimised.
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
  let body: IntelligenceRequest & { wantProfileSignal?: boolean };
  try {
    body = (await request.json()) as IntelligenceRequest & { wantProfileSignal?: boolean };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.company || !body.company.trim()) {
    return Response.json({ error: "A company name is required." }, { status: 400 });
  }

  const candidateIds = sanitizeInstrumentIds(body.candidateInstrumentIds) ?? [];
  const eligibility = sanitizeEligibility(body.eligibility);
  const req = {
    company: body.company.trim(),
    sector: body.sector?.trim() || undefined,
    country: body.country?.trim() || undefined,
    description: body.description?.trim() || undefined,
    companyType: body.companyType?.trim() || undefined,
    capitalSought: sanitizeCapitalSought(body.capitalSought),
    targetMarkets: sanitizeTargetMarkets(body.targetMarkets),
    eligibility,
  };

  try {
    const openFields = openFieldsForShortlist(candidateIds, eligibility);
    const families = distinctFamilyCount(candidateIds);
    const needsRound = openFields.length > 0 && openFields[0].reachPct >= MIN_REACH_PCT && families > MIN_FAMILIES;

    // Phase 4 rides alongside the round fetch on the founder's first call
    // only — never re-run on round 2, one read per session is enough.
    // Independent of the stopping rule above: even a founder whose shortlist
    // has nothing more to ask about can still get a sharper table annotation.
    const [round, profileSignal] = await Promise.all([
      needsRound ? generateGroundedRound(req, openFields) : Promise.resolve(null),
      body.wantProfileSignal ? inferProfileSignal(req) : Promise.resolve(null),
    ]);
    // Never block the memo on intake: null just skips the screen.
    return Response.json({ round, profileSignal });
  } catch (err) {
    console.error("intake route failed:", err);
    return Response.json({ round: null, profileSignal: null });
  }
}
