import { NextRequest } from "next/server";
import { resolveProfileBody } from "@/lib/mandate/profileRequest";
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
  wantsProjectQuestion,
} from "@/lib/intelligence/adaptiveRound";
import { askForRanker, rankerAsksEnabled } from "@/lib/intelligence/rankerAsks";
import { intakeAnswerLines } from "@/lib/intelligence/agentSelect";
import {
  sanitizeCapitalSought,
  sanitizeEligibility,
  withIncorporationCountry,
  sanitizeInstrumentIds,
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

// ── THESE SIZE THE CANDIDATE POOLS, NOT THE SCREEN (wsFV) ──────────────────
// They read as slot budgets and are not: both are how many CANDIDATES this
// route offers the planner, and the screen's own cap is
// `SCREEN_QUESTION_CAP = 6` in adaptiveRound.ts, which counts the generic and
// project halves TOGETHER. So 6 + 4 candidates compete for six seats and the
// panel a founder sees can never exceed six questions.
//
// The comments here said "8-10 on one mandatory screen" and "Total journey is
// now 5 + 10 = 15, down from 20", and neither number is reachable: the journey
// is 5 + at most 6. Corrected rather than deleted, because WHY each pool is the
// size it is still matters — the reason a cap moved is the part a later reader
// needs.
//
// Not renumbered here. Changing either would change which questions a founder
// is asked, which is this round's own measured surface (workstreams AY/BH) and
// costs a model-calling run to verify.
//
// Generic: the eligibility gate-closers, whose answers become
// `EligibilityAnswers` and reach the stage that ranks. Raised from 4 when the
// first screen shrank from 11 questions to 5 — six fields moved into this
// round, and a pool that did not move would have silently dropped them.
const GENERIC_QUESTION_CAP = 6;
// Project: what this company actually does, phrased from the shortlist's own
// requirement text. Trimmed from 5 when the round became a single panel. Was
// zero for a long time, which is why every memo read the same.
const PROJECT_QUESTION_CAP = 4;

export async function POST(request: NextRequest) {
  let body: IntelligenceRequest & { wantProfileSignal?: boolean };
  try {
    body = (await request.json()) as IntelligenceRequest & { wantProfileSignal?: boolean };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // The shared Mandate profile, when sent, is the company: capital's own body
  // fields are derived from it (lib/mandate/profileRequest.ts). Absent, no-op.
  const resolved = resolveProfileBody(body);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }
  body = resolved.body;

  if (!body.company || !body.company.trim()) {
    return Response.json({ error: "A company name is required." }, { status: 400 });
  }

  await hydrateDbInstruments();

  // ── ONE SHORTLIST, AND IT IS THE FOUNDER'S (wsFV) ────────────────────────
  // `instById()` is the same map `hydrateGatesFor`, `stakesByFund` and the
  // candidate block below all resolve an id against, so an id that survives
  // here is an id every one of them can actually look up. That is the whole
  // membership question, and asking it against the map the consumers use is
  // what makes the answer true by construction rather than by coincidence —
  // the argument `pickRegion` makes for `regionNameFor` over a shape regex.
  const corpus = instById();
  const candidateIds =
    sanitizeInstrumentIds(body.candidateInstrumentIds, (id) => corpus.has(id)) ?? [];
  // The adaptive round writes its questions from the funds' VERBATIM gate
  // text, so it needs phase two of hydration. Without this the quotes come
  // back empty and the questions silently fall back to paraphrase — the
  // grounding that makes them worth asking, gone with no error.
  await hydrateGatesFor(candidateIds);
  const eligibility = withIncorporationCountry(
    sanitizeEligibility(body.eligibility), body.country?.trim());
  // ── THREE READS REMOVED (wsIK) ──────────────────────────────────────────
  // `body.sector`, `body.companyType` and `body.targetMarkets`. `basePayload()`
  // sends none of them, so all three were `undefined` on every request and only
  // a harness could fill them. `sector` is already here inside `eligibility`;
  // `companyType` is resolved from the profile signal in `runIntelligence` and
  // is not an input; `targetMarkets` is gone from the request entirely.
  const req = {
    company: body.company.trim(),
    country: body.country?.trim() || undefined,
    description: sanitizeFreeText(body.description),
    capitalSought: sanitizeCapitalSought(body.capitalSought),
    eligibility,
  };

  try {
    const openFields = openFieldsForShortlist(candidateIds, eligibility);
    const families = distinctFamilyCount(candidateIds);
    const needsRound = openFields.length > 0 && openFields[0].reachPct >= MIN_REACH_PCT && families > MIN_FAMILIES;

    // brief_funnel_v2: the panel is one screen with two halves. The generic
    // half closes eligibility gates the verdict engine needs (fixed enums);
    // the project half asks what this company actually does, phrased from the
    // shortlist's own requirement text. The generic side is capped tighter than
    // the old 8 to leave the project half room to compete for the screen's six
    // seats — see the note on the two caps above.
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
        // `candidateIds`, NOT `body.candidateInstrumentIds` (wsFV). This read
        // the raw body while every other argument on this call was built from
        // the sanitised list, so the prompt NAMED one set of funds and showed
        // the gates, stakes and verbatim quotes of a different, shorter one.
        // That is the worse half of the defect: a prompt that names the right
        // funds reads correct, and the model was being asked to write questions
        // separating funds it was never shown the requirements for. The two
        // lists are now one list, so they cannot disagree again.
        candidateIds.slice(0, 8).map((id) => {
          const inst = corpus.get(id);
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
          // AND NOT WHEN POOL P IS ON THIS SCREEN (wsIV). Q-5's premise is
          // "positioning has no other source than Pool C". For a founder whose
          // description is too thin to separate anything, Pool P is that
          // source -- their commercial model is part of what they are being
          // asked to describe -- and the planner is told so in the same words.
          // Expecting Pool C anyway would log a violation on every screen where
          // the two instructions agree, which is how a check stops being read.
          // `wantsProjectQuestion` is false with the arm off, so this line is
          // inert on the shipped default.
          expectCommercial: Boolean(req.description?.trim())
            && !wantsProjectQuestion(req.description),
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
