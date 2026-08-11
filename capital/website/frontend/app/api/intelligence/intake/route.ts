import { NextRequest } from "next/server";
import { hydrateDbInstruments, hydrateGatesFor } from "@/lib/intelligence/corpus";
import {
  distinctFamilyCount,
  openFieldsForShortlist,
  openQuestionsForShortlist,
  stakesByFund,
  openProjectGatesForShortlist,
} from "@/lib/intelligence/gateReach";
import {
} from "@/lib/intelligence/pipeline";
import { instById } from "@/lib/intelligence/shortlist";
import {
  planAdaptiveScreen,
  inferProfileSignal,
} from "@/lib/intelligence/adaptiveRound";
import { askForRanker, rankerAsksEnabled } from "@/lib/intelligence/rankerAsks";
import { intakeAnswerLines } from "@/lib/intelligence/agentSelect";
import {
  sanitizeCapitalSought,
  sanitizeEligibility,
  withIncorporationCountry,
  sanitizeInstrumentIds,
  sanitizeTargetMarkets,
  sanitizeFreeText,
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
// Raised from 4 with the first screen shrunk from 11 questions to 5: six
// fields moved into this round, and a cap that did not move would have
// silently dropped them. Still fewer questions in total than before, because
// these are chosen against the founder's own shortlist rather than asked of
// everyone.
const GENERIC_QUESTION_CAP = 6;
// Trimmed from 5 to keep the single panel at ten questions. Total journey is
// now 5 + 10 = 15, down from 20.
const PROJECT_QUESTION_CAP = 4;

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
  await hydrateGatesFor(candidateIds);
  const eligibility = withIncorporationCountry(
    sanitizeEligibility(body.eligibility), body.country?.trim());
  const req = {
    company: body.company.trim(),
    sector: body.sector?.trim() || undefined,
    country: body.country?.trim() || undefined,
    description: sanitizeFreeText(body.description),
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
    // wsCD: the requirements no comparator can decide, ranked by how much
    // answering would separate THIS founder's siblings and capped by the arm's
    // own budget. Empty with the arm off, which is the shipped state.
    const openQuestions = openQuestionsForShortlist(candidateIds, eligibility);
    const projectGates = openProjectGatesForShortlist(candidateIds, eligibility, {
      deprioritiseFields: genericFields.map((f) => f.field),
      limit: PROJECT_QUESTION_CAP,
    });

    // Phase 4 rides alongside the planner on the founder's first call only.
    // Independent of the stopping rule above: even a founder whose shortlist
    // has nothing left to ask about can still get a sharper table annotation.
    //
    // ONE planner, not three generators. Three ran here in parallel and could
    // not see each other, so a duplicate could only be caught after the fact
    // by comparing finished questions — which is how a screen asked for
    // technology readiness twice and the brief published both answers. See
    // planAdaptiveScreen.
    // wsEJ. THE STAGE THAT PICKS, ASKING — off by default.
    //
    // It runs alongside the planner rather than after it, because the two are
    // asking the same founder at the same moment and a serial second call would
    // be latency the founder waits through. With the arm ON its questions
    // REPLACE the planner's fixed-answer half and nothing else: those are the
    // questions whose answers land in `EligibilityAnswers` and therefore reach
    // the stage that ranks, which is precisely the half this stage is entitled
    // to own. The planner keeps the project and commercial questions, because
    // positioning has no other source and this stage makes no claim on it.
    //
    // With the arm OFF this is one boolean and no call, and the screen is
    // byte-identical to the one that ships today.
    const [screen, profileSignal, asked] = await Promise.all([
      // The shortlist the screen exists to sharpen. Passing it is what lets
      // the planner ask questions that decide between real candidates rather
      // than questions about gates in the abstract.
      planAdaptiveScreen(req, needsRound ? genericFields : [], projectGates,
        (body.candidateInstrumentIds ?? []).slice(0, 8).map((id) => {
          const inst = instById().get(id);
          return inst
            ? { name: inst.name, country: inst.country, supportType: inst.capitalType }
            : null;
        }).filter((c): c is { name: string; country: string; supportType: string } => Boolean(c)),
        // What each of those funds still turns on, so a question can be chosen
        // because it decides between them rather than because a field has
        // high coverage.
        stakesByFund(candidateIds, eligibility), openQuestions),
      body.wantProfileSignal ? inferProfileSignal(req) : Promise.resolve(null),
      rankerAsksEnabled()
        ? askForRanker(candidateIds, eligibility, {
            country: req.country,
            sector: eligibility?.sector ?? undefined,
            description: req.description,
            answers: intakeAnswerLines(eligibility),
          })
        : Promise.resolve([]),
    ]);

    // The ranker's questions carry a `ref` and a citation the planner's do not,
    // and the panel renders neither — they are kept on the object so an answer
    // can be traced back to the requirement that motivated it.
    const rankerQuestions = asked.map((q) => ({
      field: q.field, question: q.question, options: q.options,
    }));
    const merged = screen || rankerQuestions.length
      ? {
          theme: screen?.theme ?? "A few more things",
          questions: rankerQuestions.length ? rankerQuestions : (screen?.questions ?? []),
          projectQuestions: screen?.projectQuestions ?? [],
        }
      : null;

    // Never block the memo on intake: null just skips the screen.
    return Response.json({ round: merged, profileSignal });
  } catch (err) {
    console.error("intake route failed:", err);
    return Response.json({ round: null, profileSignal: null });
  }
}
