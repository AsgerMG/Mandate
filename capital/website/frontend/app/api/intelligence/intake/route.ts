import { NextRequest } from "next/server";
import { hydrateDbInstruments, hydrateGatesFor } from "@/lib/intelligence/corpus";
import {
  distinctFamilyCount,
  openFieldsForShortlist,
  openQuestionsForShortlist,
  stakesByFund,
  openProjectGatesForShortlist,
} from "@/lib/intelligence/gateReach";
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
import {
  checkGroundedQuestions, checkQuestions, checkScreenFields,
} from "@/lib/intelligence/questionChecks";
import { mergeGenericQuestions } from "@/lib/intelligence/screenMerge";
import {
  FIELD_ENUM_HINTS,
  type GroundedQuestion, type IntelligenceRequest,
} from "@/lib/intelligence/types";

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
    // be latency the founder waits through. With the arm ON its questions go
    // FIRST in the fixed-answer half and the planner's follow: those are the
    // questions whose answers land in `EligibilityAnswers` and therefore reach
    // the stage that ranks, which is the half this stage has the strongest
    // claim on. The planner keeps the project and commercial questions, because
    // positioning has no other source and this stage makes no claim on it.
    //
    // FIRST, not INSTEAD. This said REPLACE and the code did replace, which
    // discarded up to six gate-closers whose answers the arithmetic scorers
    // read. See the merge below.
    //
    // With the arm OFF this is one boolean and no call, and the screen the
    // founder receives is the one that ships today. That is a claim about the
    // MERGE as much as about this call: with no ranker questions it reduces to
    // the planner's own list, in order, because the planner has already deduped
    // on `ref` (`seenRefs`), every question it returns carries a field drawn
    // from `genericFields`, and `genericFields` is itself `.slice(0,
    // GENERIC_QUESTION_CAP)` — so the dedupe, the fieldless drop and the cap
    // each have nothing to do. Break any one of those upstream and the merge
    // starts repairing the shipped screen silently, which is why the property
    // is asserted below rather than assumed.
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
    //
    // THEY ARE NOW ACTUALLY KEPT (wsEN). This mapped to `{field, question,
    // options}` and dropped the rest, under the comment above saying it did
    // not. `ref` is the ONLY carrier of `RANKER_ASK_PREFIX`, so the drop
    // destroyed the one marker distinguishing a question this stage wrote from
    // one the planner wrote — and with it any possibility of attributing an
    // answer, or a result, to the stage that asked for it.
    const rankerQuestions: GroundedQuestion[] = asked.map((q) => ({
      field: q.field, question: q.question, options: q.options,
      ref: q.ref, instrumentId: q.instrumentId, instrumentName: q.instrumentName,
      gateKey: q.gateKey, quote: q.quote, locator: q.locator,
    }));
    // MERGE, NOT REPLACE. It used to be
    // `rankerQuestions.length ? rankerQuestions : screen.questions`, and that
    // meant one ranker question discarded up to six planner gate-closers whose
    // answers the arithmetic scorers read. `screenMerge.ts` holds the merge and
    // the whole argument for its ordering and its dedupe key.
    const mergedQuestions = mergeGenericQuestions(
      rankerQuestions, screen?.questions ?? [], GENERIC_QUESTION_CAP);
    // ── THE ROUND-2 CONTRACT, DECIDED ON THE SCREEN THAT IS ACTUALLY SENT ──
    //
    // All seven of `QUESTION_RULE_IDS`, and until now none of them ran here.
    // `checkScreenFields` (Q-16) is the merge's own property; `checkQuestions`
    // (Q-1..Q-5) and `checkGroundedQuestions` (Q-10) had call sites in two
    // bench scripts and in nothing a founder's request could reach, while
    // `check_contracts` counted all six enforced because an array literal
    // named them. `scripts/check_check_reachability.ts` is the guard for that
    // class, and these are the calls that make its green mean something: it
    // asserts both that the module is reachable AND that every check function
    // it exports is named on the request path, so wiring one decider could not
    // buy a clean bill for the other two.
    //
    // OBSERVATIONAL, and the same discipline as `checkBrief` at the end of
    // `synthesize` and `checkSelection` inside `agentSelectRows`: it records,
    // it never repairs and it never gates. A repair here would change which
    // questions a founder is asked, which is the adaptive round's own measured
    // surface (workstreams AY/BH) and needs a model-calling run to verify. The
    // planner is the thing that should not have generated the duplicate, and a
    // route silently deleting its output would hide that.
    //
    // Wrapped, because a defect in a check must never be able to cost a
    // founder their screen — the intake route already refuses to block the
    // memo on itself.
    try {
      const violations = [
        ...checkScreenFields(mergedQuestions),
        // The prose half, exactly as the planner returned it.
        //
        // ONLY WHERE A SCREEN EXISTS. `planAdaptiveScreen` returns null when
        // there is nothing left worth asking, and Q-5 is "the commercial half
        // RAN", not "questions exist". Judging a null screen would report a
        // founder who is simply finished as a contract violation on every one
        // of their later calls — a check that cries wolf is a check whose
        // output nobody reads, which is the state this whole workstream is
        // undoing.
        ...(screen ? checkQuestions({
          questions: screen.projectQuestions ?? [],
          description: req.description,
          // Q-5's own condition, and the planner's: the commercial half is
          // expected exactly when the founder has described their company,
          // because positioning has no other source.
          expectCommercial: Boolean(req.description?.trim()),
        }) : []),
        // Q-10 reads the question against the options the FOUNDER SEES, so the
        // fallback matters: where the model gave nothing usable the panel
        // falls back to `FIELD_ENUM_HINTS`, and judging the empty list instead
        // would grade a screen nobody is shown.
        ...checkGroundedQuestions(mergedQuestions.map((q) => ({
          question: q.question,
          field: q.field,
          options: (q.options ?? FIELD_ENUM_HINTS[q.field]?.options ?? [])
            .map((o) => o.label),
        }))),
      ];
      for (const v of violations) {
        console.error(`[intake] ${v.ruleId}: ${v.detail}`);
      }
    } catch (err) {
      console.error("[intake] a round-2 check threw on a real screen:", String(err));
    }
    const merged = screen || mergedQuestions.length
      ? {
          theme: screen?.theme ?? "A few more things",
          questions: mergedQuestions,
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
