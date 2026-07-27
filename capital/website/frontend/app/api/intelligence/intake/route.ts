import { NextRequest } from "next/server";
import { hydrateDbInstruments, hydrateGateDetail } from "@/lib/intelligence/corpus";
import {
  distinctFamilyCount,
  openFieldsForShortlist,
  openProjectGatesForShortlist,
} from "@/lib/intelligence/gateReach";
import {
  generateGroundedRound,
  generateProjectQuestions,
  inferProfileSignal,
} from "@/lib/intelligence/pipeline";
import {
  sanitizeCapitalSought,
  sanitizeEligibility,
  withIncorporationCountry,
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

// brief_funnel_v2 question budget: 8-10 on one mandatory screen, split roughly
// half generic gate-closers, half project questions. Was 8 generic and zero
// project, which is why every memo read the same.
const GENERIC_QUESTION_CAP = 4;
const PROJECT_QUESTION_CAP = 5;

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

  await hydrateDbInstruments();

  const candidateIds = sanitizeInstrumentIds(body.candidateInstrumentIds) ?? [];
  // The adaptive round writes its questions from the funds' VERBATIM gate
  // text, so it needs phase two of hydration. Without this the quotes come
  // back empty and the questions silently fall back to paraphrase — the
  // grounding that makes them worth asking, gone with no error.
  await hydrateGateDetail(candidateIds);
  const eligibility = withIncorporationCountry(
    sanitizeEligibility(body.eligibility), body.country?.trim());
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

    // brief_funnel_v2: the panel is one screen with two halves. The generic
    // half closes eligibility gates the verdict engine needs (fixed enums);
    // the project half asks what this company actually does, phrased from the
    // shortlist's own requirement text. Budget is 8-10 total, so the generic
    // side is capped tighter than the old 8 to make room.
    const genericFields = openFields.slice(0, GENERIC_QUESTION_CAP);
    const projectGates = openProjectGatesForShortlist(candidateIds, eligibility, {
      deprioritiseFields: genericFields.map((f) => f.field),
      limit: PROJECT_QUESTION_CAP,
    });

    // Phase 4 rides alongside the round fetch on the founder's first call
    // only — never re-run on round 2, one read per session is enough.
    // Independent of the stopping rule above: even a founder whose shortlist
    // has nothing more to ask about can still get a sharper table annotation.
    const [round, projectQuestions, profileSignal] = await Promise.all([
      needsRound ? generateGroundedRound(req, genericFields) : Promise.resolve(null),
      projectGates.length ? generateProjectQuestions(req, projectGates) : Promise.resolve([]),
      body.wantProfileSignal ? inferProfileSignal(req) : Promise.resolve(null),
    ]);

    // The project half can carry the screen on its own: a founder whose
    // generic gates are all closed still benefits from project questions, so
    // the round is synthesised rather than dropped when only that half exists.
    const merged =
      round || projectQuestions.length
        ? {
            theme: round?.theme || "Your project",
            questions: round?.questions ?? [],
            projectQuestions,
          }
        : null;

    // Never block the memo on intake: null just skips the screen.
    return Response.json({ round: merged, profileSignal });
  } catch (err) {
    console.error("intake route failed:", err);
    return Response.json({ round: null, profileSignal: null });
  }
}
