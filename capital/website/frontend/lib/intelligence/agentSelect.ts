// wsDD — A MODEL IN THE SELECTION SEAT.
//
// Every ordering attempt in this project has been arithmetic over precomputed
// features, and all of them are closed by measurement: no single signal beats
// the shipped ranker, the seat allocation is optimal at every count, a +6.0
// paired re-ordering delivers zero through the shipped path, and an oracle
// holding the answer key gains one case in six hundred by per-row routing.
// Nothing has ever READ the funds and the founder and CHOSEN.
//
// ── WHAT THE SELECTOR SEES, AND THE ARITHMETIC THAT SIZES IT ──────────────
// Measured, not assumed (scripts/_wsdd_seam.ts, tune, N=120, all on EMBEDDING):
//
//   published table          exactly 6 rows, always. It IS instrumentTable.
//   candidate pool           min 25, p25 79, MEDIAN 105, p75 125, max 185
//   won leaf in the pool     95.0%
//   won leaf rank in pool    median 21, p75 38  (among the cases it is in)
//
// So the brief's premise that a selector re-picks from ~18-29 rows is wrong in
// both directions: the published table is SIX, and reselecting over it has a
// ceiling of 26.7% — which is the shipped number itself, i.e. exactly zero
// headroom. The list to read is the RANKED POOL, and its depth is a real
// trade, because a selector cannot pick what it was not shown:
//
//   K=10  ceiling 33.3%   K=20  ceiling 46.7%   K=30  ceiling 65.0%
//   K=40  ceiling 74.2%   K=50  ceiling 80.0%   K=75  ceiling 86.7%
//
// and chance (six blind picks out of K) falls as 6/K: 15.0% at K=40. Those two
// curves cross the shipped 26.7% in opposite directions, which is what makes
// K=40 the honest pilot depth: the ceiling is nearly three times the shipped
// number and chance is well below it, so the arm can neither be flattered by a
// short list nor rescued by a lucky one.
//
// ── THE LEAK, WHICH IS THE WHOLE DIFFICULTY ───────────────────────────────
// A model with retrieval is the easiest way yet to reintroduce it. State the
// reach PER PATH, because the two vector indexes are not the same risk and
// treating them as one is how this gets shipped wrong.
//
//   instrument_profiles — WHAT A FUND FUNDS. Its `profile_text` is built by
//     ETL/terms/build_instrument_profiles.py and section 5 of that document is
//     literally "Projects it has actually funded: " followed by up to 40 real
//     `public_funding_events.project_title` strings. For a `project`-mode
//     recall pair the founder's description IS a project title. Handing this
//     text to a selector is handing it the answer key, and the number would
//     rise for exactly that reason.
//
//     THE SHIPPED RANKER ALREADY USES THIS INDEX AND IS NOT LEAKING, because
//     it consumes a SCALAR: semanticFundMatch returns a percentile per
//     instrument and never the text behind it, and ETL/lib/recall_holdout.py
//     strips a graded pair's own title out of the document before it is
//     embedded. So the rule this module holds is narrow and testable: the
//     selector may consume the semantic SCORE, which is already in the shipped
//     path, and MUST NEVER be shown profile_text. It never is — nothing here
//     queries instrument_profiles at all.
//
//   eligibility_embeddings — WHAT A FUND DEMANDS. embed_eligibility.py writes
//     one row per gate whose text is `requirement` plus an optional
//     `Value: ...`, drawn from eligibility_gates. There is no beneficiary, no
//     award, no amount and no project title in that table by construction, so
//     no query against it can return who won. This is the index a selector may
//     read freely — and it is, pointedly, the one with zero production call
//     sites today, so it is also the only genuinely NEW information available.
//
//   the rendered rows — gate `requirement` text (judgementCriteria), the
//     corpus-wide award median and count, the delivery body, the last award
//     year. All of these are aggregates over the fund's whole award history or
//     statements of what it demands. None is conditioned on THIS founder.
//
//   usedInField — DELIBERATELY NOT RENDERED. It is tier 1 of the shipped row
//     sort and it is true when the founder's own traced awards used a channel,
//     which for a replayed founder contains the answer. The harness withholds
//     it (ownHistory: "withheld") and the honest thing is for the selector not
//     to read it either, rather than to rely on a harness flag being set.
//
// ── WHAT IT MAY DO TO THE PAGE ────────────────────────────────────────────
// A PURE REORDER of rows the shipped path already built and already cleared.
// It adds nothing, removes nothing and re-gates nothing, so no row can be
// published that the shipped selection did not already deem publishable, and
// check_winner_not_gated / check_winner_not_blocked are untouched by
// construction. On any failure — bad JSON, timeout, missing key, an id it made
// up — the shipped order is returned unchanged. That is the floor, and it is
// the property that makes the arm safe to measure at all.
//
// Founder prose is untrusted: it arrives through `fence`, which declaws
// prompt-control sequences and marks the block as data. A description is not
// an instruction.
//
// ── WHERE IT SITS, AND WHY IT MOVED (wsDL) ────────────────────────────────
// wsDD put this call in `computeVerdict`, which reorders the FAST-PATH table.
// That table is a screen the panel never renders on its own; the brief a
// founder reads is built by `runIntelligence`, which does not receive
// `computeVerdict`'s output at all — it rebuilds its own pool from
// `buildInstrumentTableHydrated` and hands it to `orderMemoCandidates`. So the
// model's ranking was discarded before a word was written, and no arm measured
// on the fast path could ever have reached the product.
//
// `agentSelectMemoPool` is therefore the production entry point and it is
// called from ONE place: `runIntelligence`, on the pool immediately before
// `synthesize`. Three things follow, and each was a requirement:
//
//   THE ORDER REACHES THE WRITER'S INPUT, AND SINCE wsGB IT IS THE WHOLE OF
//     THE ORDER. `orderMemoCandidates` used to sort on verdict rank and break
//     ties on the pool's incoming index; that sort is deleted, so it now
//     carries the incoming order through, demoting only a row whose institution
//     name is already shown. Reordering the pool therefore reorders the
//     candidates the writer is SHOWN, and — because the list is cut to
//     `WRITER_CANDIDATE_CAP` — decides which candidates it is shown at all.
//
//     AND IT DECIDES THE PUBLISHED ORDER. That is also new, and it arrived from
//     the other end: `SHIPPED_PUBLISH_ORDER` is `candidates`, so `pipeline.ts`
//     publishes rows in the order they were handed to the writer rather than in
//     the order the writer chose to mention them. Between that and the removed
//     sort there is now nothing between this function's output and the page but
//     the name collapse and two caps.
//
//     AND THE WRITER DECIDES NEITHER, AS OF wsGK. Both channels by which its
//     reply could change the table are closed: a candidate it returns no note
//     for keeps its seat and publishes from its own facts (wsGC), and copy
//     that reads as a thing to wait for no longer sorts a row behind the
//     others (wsGK — with 8 candidates cut to 7, that demotion evicted the
//     fund it matched on at any rank, including the model's first choice).
//     The writer changes what a row SAYS. This function decides the rest.
//
//   THE POOL DOES NOT CHANGE. The call sits AFTER `accessiblePool(...)
//     .slice(0, VERDICT_POOL)`, so it permutes a fixed set of rows and cannot
//     add, drop or re-gate one. Placing it one line earlier — on the ranked
//     list before the cut — would let it reach deeper, and would change WHICH
//     rows hold a pool seat. That is a membership change, the pool metric would
//     move with it, and a gain measured against a moving pool is not evidence.
//     The reach/invariance trade is real and is deliberately resolved in favour
//     of invariance; moving the seam earlier is the next measurement, not a
//     silent default.
//
//   IT SEES THE WHOLE FOUNDER. `runIntelligence` is the LAST call the panel
//     makes: `/verdict` -> `/intake` -> `/`. The adaptive round has already
//     been asked and answered by the time this runs, so the fields that do not
//     exist during `computeVerdict` exist here. That is why the answer lines
//     are now derived from what is populated rather than from a fixed list.
import Anthropic from "@anthropic-ai/sdk";

import {
  AGENT_SELECT_ARM, depthLever, EFFORTS, MAX_TOKENS_BY_EFFORT, SELECT_COUNT,
  SELECT_DEPTH, THINK_EFFORT, TIMEOUT_BY_EFFORT,
  type AgentSelectArm, type ThinkEffort,
} from "./caps";
import { recordUsage } from "./cost";
import { retrieveDemands } from "./demandRetrieval";
import { baseRateSentence } from "./poolRecall";
import { regionNameFor } from "./regions.generated";
import { oneLine, ROW_TITLE_CHARS } from "./schemeText";
import { cutTitles } from "./rowTitleCut";
import {
  ANSWER_LABEL, ANSWER_USE, FIELD_VALUE_DOMAIN,
  type EligibilityAnswers, type InstrumentRow, type ProjectAnswer,
} from "./types";
import { checkSelection } from "./selectionChecks";
import { peerPrior } from "./shortlist";
import { declaw, fence } from "./untrusted";
import { assessAll, type InstrumentAssessment } from "./verdict";
import { assembleInstructions } from "./contracts";

/** The arm, and the type of an arm. Defined in `./caps`, the leaf module that
 *  holds every other lever this stage reads, and re-exported here so every
 *  caller that has always imported them from the ranker still can. See that
 *  file for why a pure environment read must not sit behind the Anthropic
 *  client. */
export { AGENT_SELECT_ARM, type AgentSelectArm };
/** The thinking lever and its two ceilings. Defined in `./caps` for the same
 *  reason every other lever is, and re-exported so `_wsga_headtohead.ts`,
 *  `_wsei_depth_arms.ts`, `_wsdq_run.ts` and `_wsdr_seam.ts` are unchanged. */
export { EFFORTS, MAX_TOKENS_BY_EFFORT, THINK_EFFORT, TIMEOUT_BY_EFFORT, type ThinkEffort };
/** The measured base rate, read at the depth of the list actually shown.
 *  Defined in `./poolRecall` beside the curve it reads. */
export { baseRateSentence };

export const agentSelectEnabled = (): boolean => AGENT_SELECT_ARM !== "off";

/**
 * ── WHERE THE SEAM SITS: BEFORE THE CUT, OR AFTER IT (wsDR) ────────────────
 *
 * `late` is where wsDL put it and it is still the default. The call runs AFTER
 * `accessiblePool(...).slice(0, VERDICT_POOL)`, so it permutes eighteen rows
 * that were selected by a score it had no part in. That placement bought POOL
 * INVARIANCE: same set in, same set out, so `check_winner_not_gated` and
 * `check_winner_not_blocked` are untouched by construction and no gain can be
 * an artefact of a moving pool. wsDL recorded the trade in those words and
 * called moving it earlier "the next measurement, not a silent default".
 *
 * `early` is that measurement. The call runs BEFORE the cut, on the whole
 * accessible pool, and the top `VERDICT_POOL` of ITS order hold the seats. The
 * model then chooses which rows are in the pool, which is the architecture the
 * owner specified: our code selects the subset, the model ranks it.
 *
 * ── WHAT THIS COSTS, STATED BECAUSE IT IS REAL ────────────────────────────
 * Pool invariance is GONE under `early`, by design and not by accident. Six
 * rows the score ranked 19th or deeper take seats from rows ranked 13th to
 * 18th, so "the pool did not move" stops being available as a safety property
 * and something as strong has to replace it. Two things do:
 *
 *   THE ELIGIBILITY SCREENS DO NOT MOVE. `accessiblePool` runs BEFORE this
 *     call on both settings, so every row either seam can promote has already
 *     cleared the same gating and blocking. `check_winner_not_gated` and
 *     `check_winner_not_blocked` are about that screen and not about order, so
 *     they are as untouched under `early` as under `late` — and they are run
 *     and reported either way rather than argued from.
 *
 *   POOL RECALL IS REPORTED, BOTH WAYS. Membership changing is only acceptable
 *     if the answer survives the change at least as often. A model that
 *     promotes six rows from rank 19+ pushes six rows out of the pool, and if
 *     the fund the company actually won is more often among the six pushed out
 *     than among the six pulled in, that is a loss no ranking gain redeems.
 *     `scripts/_wsdr_seam.ts` measures it on both settings off one pool object
 *     and prints both, so it cannot be discovered later.
 *
 * Read once at module scope, and throws on anything unrecognised, for the same
 * reason `AGENT_SELECT` is: a lever that reads a typo as its default reports
 * the control's number under the treatment's name.
 */
export type AgentSelectSeam = "late" | "early";
const SEAMS: AgentSelectSeam[] = ["late", "early"];
export const AGENT_SELECT_SEAM: AgentSelectSeam = (() => {
  const raw = process.env.AGENT_SELECT_SEAM ?? "late";
  if (!SEAMS.includes(raw as AgentSelectSeam)) {
    throw new Error(
      `AGENT_SELECT_SEAM must be one of ${SEAMS.join("|")}, got "${raw}". ` +
      `It is read once at module scope precisely so a typo cannot read as "late".`);
  }
  return raw as AgentSelectSeam;
})();

/**
 * ── THE NONSENSE ARM: a permutation with no model in it ────────────────────
 *
 * wsDP. The checklist line that gated the first euro of real spend was "the
 * model's order reaches the published memo — arm on vs off produces a
 * different memo order on the same founder", and it was circular: the only
 * arms that permute the pool are the ones that call Anthropic, and the owner
 * had refused spending until the checklist was green.
 *
 * The circularity is only in the MODEL, not in the claim. What has to be shown
 * is that a permutation applied at `agentSelectMemoPool` survives
 * `orderMemoCandidates`, the display-name collapse and the writer cap, and
 * reaches the rows that publish. Nothing about that is specific to the
 * permutation being a good one — so this arm supplies a permutation that is
 * free, deterministic, and unmistakably not a ranking.
 *
 * REVERSAL, and reversal specifically. A seeded shuffle would do the same job
 * and would be harder to read: with a reversal the pool's LAST row is first,
 * so the arm's own output is legible as garbage at a glance, and the overlap
 * with the shipped candidates is at its minimum, which is what makes the
 * difference at the writer's input large enough to see per founder rather than
 * on average.
 *
 * IT IS STILL A PURE PERMUTATION, which is the safety property everything else
 * rests on: same rows, same count, same set, different order. So the pool
 * metric cannot move under it and `check_winner_not_gated` /
 * `check_winner_not_blocked` are untouched — under this arm exactly as under
 * the model's, and for the same reason.
 */
export function reverseNonsense(rows: InstrumentRow[]): InstrumentRow[] {
  tally.reversed++;
  return [...rows].reverse();
}

/** How deep into the ranked pool the selector reads. Defined in `./caps`, the
 *  leaf module that holds the other seam depth, and re-exported here so every
 *  caller that has always imported it from the ranker still can. See that file
 *  for the reasoning and for why a hermetic check must not reach through this
 *  module to read a number. */
export { SELECT_DEPTH } from "./caps";
/** How many rows the selector NAMES. Defined in `./caps` beside the other
 *  depths and TIED to `BRIEF_LIMITS.institutionsMax` by `check_contracts.ts`.
 *  The sentence that used to sit here said "DISPLAY_CAP is 6" — that is the
 *  INSTANT SCREEN's cut, a different funnel; the memo publishes seven. See
 *  `caps.ts`. */
export { SELECT_COUNT };
/**
 * `assist` only: how many of the shipped top rows are FROZEN.
 *
 * The free arm measured EXACT@6 17% against the shipped 27%, and the shape of
 * the loss says what went wrong: CHANNEL@5 fell 92% -> 75%, so the model was
 * not picking the wrong sibling, it was leaving the right neighbourhood
 * altogether. That is a judgement failure with the prior switched off, not a
 * shortage of information about what the funds demand.
 *
 * So bound it. The shipped order keeps the first KEEP seats -- the ones the
 * empirical ranker is most confident about and most often right about -- and
 * the model spends the remaining seats reaching into ranks it would otherwise
 * never reach. This is the only shape in which the model's judgement can ADD a
 * case without being able to destroy one: the frozen seats are exactly the
 * control's, so the arm's floor is the control's score on those seats.
 */
export const SELECT_KEEP = depthLever("AGENT_SELECT_KEEP", 3, { min: 0 });

/**
 * ── WHEN MAY THE MODEL REORDER AT ALL? (wsIJ) ─────────────────────────────
 *
 * THE PROPERTY, and it is the whole lever:
 *
 *   **The model's ordering is published only when the model's own first choice
 *   is NOT the first row we offered it. When its first choice confirms our
 *   first row, we publish our own order unchanged.**
 *
 * It is total and decidable on any reply: `picks[0] === 0` or it does not, for
 * every founder, every menu and every arm, with nothing enumerated and no fund,
 * body, country or regime named. A new reply tomorrow is classified by the same
 * one-line test.
 *
 * ── WHY THAT PARTICULAR FACT ──────────────────────────────────────────────
 *
 * The model's first choice is the only part of its reply that can be scored
 * against our own prior BEFORE any outcome is known. When it agrees with us
 * about the single best row, its reply has told us nothing our score did not
 * already say -- and the remaining six picks are then churn, on a model that
 * disagrees with ITSELF on 18% of identical prompts (wsII). When it disagrees
 * about the first row, the reply is carrying information, and its whole
 * ordering is worth taking.
 *
 * ── WHAT IT IS WORTH, MEASURED FREE ON TWO PAID TAPES ─────────────────────
 *
 * `scripts/_wsij_conditional.ts`, offline, on the 76 founders both paid runs
 * called. Against TODAY's behaviour, paired on the same call:
 *
 *     EXACT@6          +4.96 points   95% [-0.76, +10.68]   60 of 60 LORO
 *     reciprocal rank  +0.0049        95% [-0.0116, +0.0215]  35 of 60 LORO
 *
 * That is the mirror image of wsII and should be read as one. wsII: the model
 * improves the ORDERING (recip 60/60) and does not improve VISIBILITY (EXACT@6
 * 29/60). This: abstention recovers VISIBILITY and leaves the ordering where it
 * was. It is a complement to the model's ordering, not a rival to it.
 *
 * It is NOT merely "reorder fewer founders". Abstaining on the same NUMBER of
 * founders chosen at random scores -0.0294 / -0.0265 on reciprocal rank against
 * this rule's -0.0007 / +0.0110: p = 0.006 and p = 0.004, in the two runs
 * independently.
 *
 * ── WHY IT DEFAULTS TO `off` ──────────────────────────────────────────────
 *
 * Because the EXACT@6 interval still touches zero on 76 founders, and EXACT@6
 * is the only measure this rule moves. It is a candidate with a pre-registered
 * confirmation (`project-mgmt/wsIJ_prereg.md`), not a result. `off` is
 * byte-for-byte today's behaviour: the predicate is not evaluated.
 *
 * ── AND WHAT IT IS NOT ────────────────────────────────────────────────────
 *
 * Not `assist`. `assist` freezes our top rows and never SHOWS them to the
 * model, so the model cannot confirm or contradict them and there is nothing to
 * abstain on. This rule shows the model everything, exactly as today, and uses
 * its answer to decide whether to believe the rest of its answer.
 */
const ABSTAIN_MODES = ["off", "confirmed"] as const;
export type AbstainMode = (typeof ABSTAIN_MODES)[number];
export const ABSTAIN_MODE: AbstainMode = (() => {
  const raw = process.env.AGENT_SELECT_ABSTAIN ?? "off";
  if (!ABSTAIN_MODES.includes(raw as AbstainMode)) {
    throw new Error(
      `AGENT_SELECT_ABSTAIN must be one of ${ABSTAIN_MODES.join("|")}, got "${raw}". ` +
      `Read once, up front, so a typo cannot read as "off" and report a run of ` +
      `today's behaviour under the arm's name.`);
  }
  return raw as AbstainMode;
})();

/**
 * THE RULE ITSELF, as one function, so the property has exactly one home and
 * the test below has exactly one thing to point at.
 *
 * `picks` are indices into the menu the model was SHOWN. Under the shipped arm
 * that menu starts at our own top row, so index 0 is our first row. Under
 * `assist` the frozen leaders are not on the menu at all, so index 0 is the
 * first row we offered -- which is the same sentence, and the reason the rule
 * is stated over the menu rather than over the pool.
 */
export function abstains(picks: number[]): boolean {
  return ABSTAIN_MODE === "confirmed" && picks[0] === 0;
}

/**
 * ── MAY IT NAME FEWER THAN THE PAGE HAS SEATS? (wsDY) ─────────────────────
 *
 * `exactly` is the shipped regime and the default: the reply is exactly
 * SELECT_COUNT indices, because the page is sized in code.
 *
 * ── What that regime does to the answer, measured for nothing ─────────────
 * wsDS ran the twelve bench companies at effort `high` on menus byte-identical
 * to wsDQ's, so the reasoning behind every pick is on disk and paid for. Read
 * for this question it says the same thing on eight of the twelve:
 *
 *   bunq   "only #2 and #4 explicitly match the software and AI sector" ...
 *          "I'm constrained to pick 6 from this list of 18, so I need to
 *           identify which ones are least egregiously mismatched"
 *   Neura  "that's just three options when I need six distinct picks. Since the
 *           requirement is to return exactly six selections regardless of fit
 *           quality, I'll have to rank them with the best matches first"
 *   Nortal "only one program (option 0) actually lands within the requested
 *           bracket. Every other option falls well below"
 *
 * And `scripts/_wsdy_slots.ts` counted it over all twelve without a model:
 * scoring the eighteen rows against two rules -- an award median an order of
 * magnitude off the band, and a descriptor naming another sector -- a mean of
 * 2.1 rows survived both, and ten of the twelve had fewer survivors than the six
 * they had to name.
 *
 * ██ THAT MEASUREMENT IS WITHDRAWN. wsIB, 2026-08-19. READ THIS BEFORE ██
 * ██ QUOTING ANY NUMBER ABOVE OR BELOW IT.                             ██
 *
 * Two things were wrong with it, and the second is worse than the first.
 *
 *   THE SECOND RULE IS NOT IN THIS PROMPT AND NEVER WAS. Scroll to
 *     `buildPrompt`. The prompt states three disqualifiers -- a cheque an order
 *     of magnitude away from what the company needs, demands the company plainly
 *     fails, a scheme that stopped paying out -- and not one of them is about a
 *     descriptor. Its only sector sentence is a TIE-BREAK about the TITLE:
 *     "where two are equally good, prefer the one whose title is specific to
 *     what this company does over the one whose title is generic". It
 *     disqualifies nothing. The paragraph that stood here said the two rules
 *     were the ones "THIS PROMPT ITSELF STATES", about a prompt fifteen hundred
 *     lines below it. It was a comment asserting a measurement of a prompt that
 *     did not say what the comment said it said.
 *
 *   AND THE RULE CONDEMNS THE RIGHT ANSWER. It was strict string equality
 *     between a row's `mostly X` clause and the founder's own sector label.
 *     `mostly X` names ONE bucket of a distribution whose median top share is
 *     0.47; measured on the answer key, the founder's own sector is the largest
 *     bucket of the fund they WON on 26 of 78 founders. So a perfect selector
 *     fails that test two times in three by construction, and on the two paid
 *     forty-row tapes it throws out the fund the company actually won on 43.6%
 *     and 46.2% of founders -- against the 48.4% and 48.0% at which it condemns
 *     the model. Those two rates are not distinguishable (wsHZ).
 *
 * `scripts/_ruler.ts` is the one implementation of both tests, calibrated
 * against that labelled set, and `npx tsx scripts/_wsib_ruler.ts` reproduces
 * every figure above before reporting the corrected ones. Free, offline, no
 * model. What it says:
 *
 *                                   as published        re-derived
 *   picks called a failure          48.4% / 48.0%      3.3% / 2.7%
 *   won fund disqualified           43.6% / 46.2%     12.8% / 14.1%
 *   mean survivors of forty rows     11.5 / 11.2       30.2 / 30.0
 *   FEWER SURVIVORS THAN 7 SEATS    26/78 / 27/78      0/78 / 0/78
 *   mean survivors of eighteen               2.1              6.3
 *   fewer than the six seats               10/12             7/12
 *
 * ██ SO THE WRITTEN CASE FOR THIS LEVER IS GONE, AND IT IS GONE ON ITS OWN ██
 * ██ TERMS. The mechanism `atMost` exists to relieve is "a founder holds     ██
 * ██ fewer qualifying rows than seats, so every pick beyond them is a seat   ██
 * ██ filled by construction". Re-derived at the depth that SHIPS, that       ██
 * ██ founder does not occur: 0 of 156 across both paid runs. There is no     ██
 * ██ seat pressure to relieve.                                               ██
 *
 * The eighteen-row residual that remains -- 6.3 survivors, seven of twelve
 * short of six -- is ENTIRELY the money rule: money-only gives 6.8 and the same
 * seven. And that rule is itself badly calibrated. The fund a company actually
 * won writes a typical cheque of a median 0.45x the BOTTOM of the band the
 * founder asked for, 0.19x at the quartile, because a public grant is one
 * component of a raise and not the raise; read one-sided at floor/10 it
 * condemns the won fund 11.5% and 12.8% of the time while cutting 18% of the
 * menu. It is left where it is and reported with that rate rather than moved,
 * because it is this prompt's own sentence.
 *
 * The category errors this lever was invented for are real and are not
 * withdrawn: health-research grants did go to a bank and farming grants to a
 * robotics company, in the SIXTH and THIRD seats of a six-seat reply. What is
 * withdrawn is the explanation. "It had run out of funds to name and could not
 * say so" was inferred from a survivor count that does not hold, and the model
 * had a mean of 30 qualifying rows to reach for.
 *
 * ── Why a short reply is safe here, and is not "showing the founder less" ──
 * `agentSelectRows` already fills behind the picks: chosen rows move to the
 * front in the model's order and EVERY OTHER ROW KEEPS ITS SHIPPED RELATIVE
 * POSITION. So declining a seat does not empty it, it returns it to the
 * empirical ranker -- the order that ships today, on its own. That makes the
 * arm additive in exactly the sense `assist` is: the model can add a case it is
 * sure of without being able to spend a seat on one it is not.
 *
 * ── STILL OFF, AND THAT IS NOW A DECISION RATHER THAN AN OMISSION (wsGS) ──
 *
 * Everything above was measured on an EIGHTEEN-row menu with SIX seats. Both
 * numbers have moved: `VERDICT_POOL` is 40 and `SELECT_COUNT` is 7. Read the
 * evidence at the depth that actually ships and it does not carry:
 *
 *   IT CANNOT BE RE-DERIVED AT FORTY, AND NOBODY HAS. `_wsdy_slots.ts` parses
 *     recorded prompts, and every prompt on disk under `first_test_wsDQ` and
 *     `dark_levers_wsDS` renders EIGHTEEN rows — including the runs whose tally
 *     line says `depth=40`, because `VERDICT_POOL` was 18 when they ran and the
 *     menu is the smaller of the two. So "at forty rows the pressure is worse"
 *     is an extrapolation from a menu that no longer exists. Scaling 2.1 of 18
 *     linearly puts it near 4.7 of 40 against SEVEN seats — still short, but a
 *     survivors-to-seats ratio of 0.67 where the measured one was 0.35. The
 *     direction of the change is toward LESS pressure, not more.
 *
 *   AND THE FORTY-ROW RUN'S OWN TAPE CONTRADICTS THE PATHOLOGY. wsGA ran 148
 *     briefs at `depth=40 count=7` in `exactly` mode and its line records
 *     `0 short reply` and `0 seat(s) on a row already picked under the SAME
 *     TITLE`. The eighteen-row failure was the model spending seats it did not
 *     believe in — sibling pairs and out-of-sector rows in the fifth and sixth
 *     places. The floor that catches half of that read zero across 148 briefs.
 *
 * TURNING IT ON AGAINST AN EIGHTEEN-ROW MEASUREMENT WOULD BE THIS FILE'S OWN
 * NAMED DEFECT — the base rate that was true of a 105-row pool and false of the
 * list actually shown. So it stays off, and the reason is written down instead
 * of the flag being flipped.
 *
 * ── WHAT WOULD FALSIFY THIS, and what cannot see it ──────────────────────
 * `npm run stages` cannot: there is no model in that ladder, so this lever is
 * invisible to it in both settings. Nothing free can decide it. What would
 * change the answer is one of two things, both readable off a paid run's own
 * tally line at forty rows and neither of them a new harness:
 *
 *   a non-zero `seat(s) on a row already picked under the SAME TITLE`, which is
 *   the floor on seats spent for want of an alternative; or a per-row grading
 *   showing picks in the last seats that fail a disqualifier THIS PROMPT
 *   ACTUALLY STATES, graded by an instrument that does not also throw out the
 *   fund the company won.
 *
 * The second of those has now been done, on both paid forty-row tapes, and it
 * came back the wrong way for this lever: 3.3% and 2.7% of picks, 0 of 156
 * founders short of seats. Until the first one reads non-zero the honest
 * position is no longer "the evidence was measured on a menu the product no
 * longer builds" — it is that the evidence, re-measured on the menu the product
 * DOES build, is against.
 *
 * OFF BY DEFAULT, and read once at module scope with a throw on anything
 * unrecognised, for the reason every other lever in this file is: a flag that
 * reads a typo as its default reports the control's number under the
 * treatment's name.
 */
/**
 * ── SHOULD THE PROMPT SAY WHAT `mostly X` IS? (wsIB) — PROPOSED, OFF ──────
 *
 * OFF BY DEFAULT AND IT MUST STAY OFF UNTIL SOMEBODY BUYS THE MEASUREMENT.
 * Nothing free can decide this: it changes the bytes the model reads, so every
 * tape on disk answers a different question.
 *
 * ── The observation, and it is not the one wsIB was sent to find ──────────
 * I was asked whether the prompt's sector disqualifier should say "unrelated"
 * rather than "another". IT DOES NOT SAY EITHER. There is no descriptor
 * disqualifier in this prompt. Read the block below: the only sector sentence
 * is a TIE-BREAK about the TITLE ("where two are equally good, prefer the one
 * whose title is specific to what this company does"), and it disqualifies
 * nothing. The phrase "a descriptor naming another sector" exists only in this
 * file's own comments and in four measurement scripts, all of which attributed
 * it to the prompt. That is the defect wsIB closed, and it makes the prompt
 * change I was asked to propose unnecessary: there is no wrong word to fix.
 *
 * ── What IS wrong, and it is the opposite shape ───────────────────────────
 * Every row prints `mostly X`, and THE LEGEND BELOW DOES NOT MENTION IT. Six
 * bullets explain the title, the body, the cheque, the year, the qualification
 * line and the row-specific requirement. The descriptor is not among them, so
 * the model meets an unexplained one-word sector label on every row and has to
 * decide for itself what it means. The reasoning wsDS paid for says what it
 * decided:
 *
 *   bunq   "only #2 and #4 explicitly match the software and AI sector"
 *   Neura  "that's just three options when I need six distinct picks"
 *
 * It read the label as a RESTRICTION. It is not one. `sectorClause` renders the
 * single largest bucket of a distribution, and only when that bucket clears
 * `FOCUS_SHARE`; the median top share is 0.47, so `mostly X` typically means
 * "X is the biggest slice of a fund that also funds several other things".
 * Measured on the answer key: the founder's own sector is the largest bucket of
 * the fund they actually WON on 26 of 78 founders. A model filtering on that
 * label discards the right answer two times in three, which is the same
 * arithmetic that broke the ruler — the model was simply making the ruler's
 * mistake first.
 *
 * ── The proposal, and why it is a LEGEND line and not a new rule ──────────
 * `explain` adds one bullet to the block that explains the other six. It states
 * what the number is and does not tell the model what to conclude from it,
 * because a sentence telling the model to discount the descriptor would be this
 * file's own named defect: an instruction written to move a metric rather than
 * to describe the page.
 *
 * ── The cheaper alternative, and whoever buys this should sweep both ──────
 * `ROW_DESCRIPTOR=share` already exists in `shortlist.ts` and renders
 * "47% software & AI" instead of "mostly software & AI". It states the number
 * on the row itself and needs no prose at all. It is the stronger arm on
 * priors, because a legend can be skimmed past and a number on the row cannot,
 * and it is the one to sweep first.
 *
 * ── What would falsify the whole idea ─────────────────────────────────────
 * If the model's picks are already indifferent to the descriptor, this changes
 * nothing and costs tokens. That is checkable on a tape for free and it has not
 * been done: grade picks against the row's descriptor and see whether a row
 * whose descriptor matches the founder is likelier to be picked than one whose
 * descriptor does not, holding the shipped rank fixed. If the enrichment is
 * near 1.0, do not buy this.
 */
const SECTOR_NOTES = ["off", "explain"] as const;
export type SectorNote = (typeof SECTOR_NOTES)[number];
export const SECTOR_NOTE: SectorNote = (() => {
  const raw = process.env.AGENT_SELECT_SECTOR_NOTE ?? "off";
  if (!SECTOR_NOTES.includes(raw as SectorNote)) {
    throw new Error(
      `AGENT_SELECT_SECTOR_NOTE must be one of ${SECTOR_NOTES.join("|")}, got "${raw}". ` +
      `Read once at module scope so a typo cannot read as "off".`);
  }
  return raw as SectorNote;
})();

const COUNT_MODES = ["exactly", "atMost"] as const;
export type SelectCountMode = (typeof COUNT_MODES)[number];
export const SELECT_COUNT_MODE: SelectCountMode = (() => {
  const raw = process.env.AGENT_SELECT_COUNT_MODE ?? "exactly";
  if (!COUNT_MODES.includes(raw as SelectCountMode)) {
    throw new Error(
      `AGENT_SELECT_COUNT_MODE must be one of ${COUNT_MODES.join("|")}, got "${raw}". ` +
      `It is read once at module scope precisely so a typo cannot read as "exactly".`);
  }
  return raw as SelectCountMode;
})();

/**
 * `adviser` only: the thinking budget, and how many candidates it may look up.
 *
 * BOTH ARE COST CONTROLS, and the budget is the binding constraint on this
 * whole design. Thinking bills as OUTPUT — 5x the input rate — so a generous
 * budget is the fastest way to turn a EUR 0.012 brief into a EUR 0.20 one. The
 * target is about EUR 0.04 per brief, roughly triple the free arm, and these
 * two numbers are what hold it there:
 *
 *   1024 thinking tokens is room to weigh a shortlist, not room to ruminate.
 *   Retrieval fires ONLY on candidates the model itself declares ambiguous,
 *   capped at LOOKUP_MAX. Retrieving for all 40 rows would cost more than the
 *   brief is allowed to and would bury the separating fact in bulk text —
 *   which is the failure the free arm already demonstrated.
 *
 * A selector that needs half a euro per founder to beat a free ranker is not a
 * product, so the design is shaped by the budget rather than apologising to it.
 *
 * NOTE ON THE API, paid for once: claude-sonnet-5 REMOVED the fixed thinking
 * budget. `thinking: {type: "enabled", budget_tokens: N}` returns a 400 --
 * "not supported for this model. Use thinking.type.adaptive and
 * output_config.effort" -- and the first 120-case run of this arm failed every
 * call that way. Depth is now an EFFORT level, and the hard ceiling is
 * `max_tokens`, which caps thinking and reply TOGETHER. So max_tokens is the
 * cost bound here, not a suggestion: at effort "low" the reply is a handful of
 * integers and 1,536 tokens is ample, while bounding the worst case at about
 * EUR 0.014 of output per call.
 */
// `EFFORTS`, `ThinkEffort`, `THINK_EFFORT`, `MAX_TOKENS_BY_EFFORT` and
// `TIMEOUT_BY_EFFORT` are defined in `./caps`, the leaf module that holds every
// other lever this stage reads, and re-exported at the imports above so every
// caller that has always imported them from the ranker still can. They moved so
// `check_maxtok_headroom.ts` can read a ceiling without pulling the Anthropic
// client and the corpus layer in behind one number.
export const LOOKUP_MAX = depthLever("AGENT_SELECT_LOOKUPS", 5, { min: 0 });

/**
 * ── HOW THE MODEL IS ALLOWED TO ASK FOR A FUND'S OWN RULES ────────────────
 *
 * `declare` is the shipped design and it does not fire. The model is asked, in
 * the same JSON as its picks, to name up front the candidates it cannot
 * separate — a PRE-declaration, made before it has looked anything up. Measured
 * twice, on the same twelve companies:
 *
 *   effort low   (wsDQ)   0 of 12 declared anything
 *   effort high  (wsDS)   0 of 12, after 79,252 thinking tokens
 *
 * The second run is what makes this a verdict rather than a suspicion. The
 * obvious reading of wsDQ was that a model doing no reasoning gives the
 * compliant empty answer — the instruction ends "if you already know, leave it
 * empty". That reading is now excluded: at effort `high` the model reasoned at
 * length and explicitly about eligibility, naming blockers in its own thinking,
 * and still declared nothing. So `eligibility_embeddings` — 4,579+ chunks, an
 * HNSW index, refreshed and guarded — has never once been read on a real
 * request, and the reason is the shape of the hook, not the depth of the model.
 *
 * The likely mechanism, and the reason a tool is the honest alternative: asking
 * a model to enumerate its own uncertainty BEFORE it investigates is asking for
 * a self-report about a state it has not entered yet. A tool inverts that. The
 * model does not have to predict which rows will puzzle it; it reaches for the
 * rules at the moment one does, which is the only moment it actually knows.
 *
 * `off` exists so the channel can be removed rather than left as a hook that
 * never fires, which is the outcome the owner named as acceptable and which is
 * strictly better than shipping dead surface.
 *
 * DEFAULT IS UNCHANGED. `declare` stays the default so this file's behaviour is
 * identical until something measured says otherwise.
 */
const UNSURE_MODES = ["declare", "tool", "off"] as const;
export type UnsureMode = (typeof UNSURE_MODES)[number];
export const UNSURE_MODE: UnsureMode = (() => {
  const raw = process.env.AGENT_SELECT_UNSURE ?? "declare";
  if (!UNSURE_MODES.includes(raw as UnsureMode)) {
    throw new Error(`AGENT_SELECT_UNSURE must be one of ${UNSURE_MODES.join("|")}, got "${raw}"`);
  }
  return raw as UnsureMode;
})();

/**
 * ── WHAT THE PROMPT TELLS THE MODEL HAPPENS TO ITS ORDER ───────────────────
 *
 * THE PROPERTY, AND THE TEST. Every sentence in a model-facing prompt that
 * describes what this system will DO with the reply must have an executing
 * counterpart, and the test is a reader's rather than a matcher's: take the
 * sentence and NAME THE FUNCTION THAT PERFORMS IT. A sentence that survives
 * that test unnamed is not a stylistic problem, it is a false description of
 * our own machinery, and the model is entitled to act on it.
 *
 * ── The one that failed the test ──────────────────────────────────────────
 * From 2026-08-11 to 2026-08-19 this bullet read:
 *
 *   "your order is honoured WITHIN a qualification band, not across one: a row
 *    with a named obstacle is published below the rows nothing rules them out
 *    of, whatever place you give it."
 *
 * No function performed it. `wsGB` deleted the verdict-band sort on 08-12 —
 * `memoCandidates.ts` records the removal ("the SORT ITSELF ... only the last
 * of those three survives") and `pipeline.ts` states the consequence flatly
 * ("There is no band sort, so there is nothing to protect them from"). The
 * sentence was never revisited, and wsHW's re-read certified the prompt
 * byte-identical to wsHO's, which is exactly why seven days of divergence
 * survived an audit designed to catch changes.
 *
 * The model obeyed it. Across ~2,900 menu rows over two recorded runs it takes
 * an OPEN row at the head of the list 49.2% of the time and an OBSTRUCTED row
 * 9.6% — a 5x suppression on n=534 head rows, the most reproducible thing in
 * either tape. AEROTEX is the act caught on tape: the selector placed the fund
 * that founder actually won in the LAST seat, a demotion exactly as instructed.
 *
 * ── WHAT IT DOES NOT SAY, AND WHY THAT MATTERS ────────────────────────────
 * The 5x is attributable to the PARAGRAPH, not to this one sentence. The two
 * bullets either side of it are TRUE and push the same way — "a named obstacle
 * IS a fault, and a real one", "a scheme whose stated demands this company
 * plainly fails is the wrong scheme". Either would depress an obstructed row
 * on its own. So no gain is claimed here and none should be quoted: separating
 * the three is a paid arm nobody has bought. This is a correctness fix. A
 * prompt that describes deleted machinery is wrong at any price.
 *
 * ── AND REINSTATING THE SORT IS THE TRAP, NOT THE FIX ─────────────────────
 * Making the sentence true by putting the band sort back was measured on the
 * same tapes and costs more than it saves: OUR OWN published table would lose
 * the won fund on 10 of 11 obstructed-won founders, because the score's 39.02%
 * EXACT@6 depends on publishing exactly those obstructed rows. The obstacle is
 * information the founder is owed, not a penalty the pipeline applies.
 *
 * ── What the default now says, and why each clause is true ────────────────
 * Named against the code, clause by clause, because that is the test above:
 *   "the rows you name move to the front, in your order"  — `agentSelectRows`
 *     is a PURE REORDER; picks move to the front in the model's own order.
 *   "the rest keep our ranking behind them"               — same function: every
 *     other row keeps its shipped relative position.
 *   "nothing re-sorts the result"                         — `orderMemoCandidates`
 *     has no `.sort()` at all; `publishRankByKey` reads a positional index.
 *   "the table is cut at a fixed length"                  — `WRITER_CANDIDATE_CAP`
 *     then `BRIEF_LIMITS.institutionsMax`.
 *   "a row whose institution is already named moves to the back" —
 *     `resolveNameCollisions`, demote-not-delete, SEL-DUPE-NAME.
 *   "the obstacle is printed beside the row"              — `pipeline.ts` sets
 *     `blocker` from the assessment, in the fund's own words.
 *
 * It deliberately adds NO new push in either direction. The judgement about
 * what an obstacle is worth already lives in the two true bullets around it;
 * this one states the mechanism and stops, so that the arms differ in what the
 * model is told about our code and not in how hard it is leaned on.
 *
 * ── Why the false text stays reachable ────────────────────────────────────
 * `bandSort` serves the retired paragraph verbatim, so the difference is
 * measurable later against a recorded control rather than argued about. It is
 * a description of machinery that does not exist and must never be the
 * default. Read once at module scope and throwing on anything unrecognised,
 * for the reason every lever in this file is: a flag that reads a typo as its
 * default reports the control's number under the treatment's name.
 */
const ORDER_CLAIMS = ["published", "bandSort"] as const;
export type OrderClaim = (typeof ORDER_CLAIMS)[number];
export const ORDER_CLAIM: OrderClaim = (() => {
  const raw = process.env.AGENT_SELECT_ORDER_CLAIM ?? "published";
  if (!ORDER_CLAIMS.includes(raw as OrderClaim)) {
    throw new Error(
      `AGENT_SELECT_ORDER_CLAIM must be one of ${ORDER_CLAIMS.join("|")}, got "${raw}". ` +
      `It is read once at module scope precisely so a typo cannot read as "published".`);
  }
  return raw as OrderClaim;
})();

export const ORDER_CLAIM_PROSE: Record<OrderClaim, string> = {
  published:
`  * your order is the published order. The rows you name move to the front in
    the order you name them, the rows you do not name keep our own ranking
    behind them, and the table is cut at a fixed length — so a place you spend
    is a place spent. Nothing re-sorts the result afterwards: a row with a
    named obstacle publishes exactly where you put it, with the obstacle
    printed beside it in the fund's own words. The only row that moves is one
    whose institution a row above it already names, and it moves to the back`,
  bandSort:
`  * your order is honoured WITHIN a qualification band, not across one: a row
    with a named obstacle is published below the rows nothing rules them out of,
    whatever place you give it. So spend your best places on schemes that are
    both open and right, and do not try to promote an obstructed scheme past an
    open one`,
};

/** The one tool the selector may call. Its input is INDICES INTO THE MENU IT
 *  WAS SHOWN, never a free-text query and never an instrument id — so the model
 *  cannot use it to reach a fund it was not already offered, and the retrieval
 *  stays a lookup about candidates in front of it rather than a search of the
 *  corpus. That is the same boundary the `declare` path relies on for its leak
 *  argument, enforced the same way. */
const LOOKUP_TOOL = {
  name: "lookup_requirements",
  description:
    "Return a fund's own eligibility requirements, in its own words, for "
    + "candidates you are looking at. Use it where a rule you cannot see on the "
    + "row would change your answer.",
  input_schema: {
    type: "object" as const,
    properties: {
      indices: {
        type: "array" as const,
        items: { type: "integer" as const },
        description: "Index numbers from the CANDIDATES list, at most "
          + `${LOOKUP_MAX}.`,
      },
    },
    required: ["indices"],
  },
};

const MODEL = process.env.AGENT_SELECT_MODEL ?? "claude-sonnet-5";

/**
 * Constructed LAZILY, and that is not a style choice.
 *
 * ES imports are hoisted, so a module-scope `new Anthropic()` runs before the
 * importing script's body -- and every harness in this repo loads credentials
 * in its body, via `loadEnvLocal()`. A client built at import time therefore
 * captures the environment as it was BEFORE .env.local was read, and every
 * call fails authentication. Measured: the first 120-case run of this arm made
 * 120 calls, all of which failed that way, and reported the CONTROL's numbers.
 * The arm attestation caught it; nothing else would have.
 */
let lastUnsureIds: string[] = [];
let clientMemo: Anthropic | null = null;
const anthropic = (): Anthropic => (clientMemo ??= new Anthropic());

/** Per-run counters, so a measurement can say what actually happened rather
 *  than assume the arm ran. A run where every call failed and fell back would
 *  otherwise print the control's number under the treatment's banner. */
const tally = {
  calls: 0, ok: 0, failed: 0, shortReply: 0, invalidIds: 0,
  /** ── TWO DENOMINATORS, AND THE LINE USED THE WRONG ONE (wsGS) ──────────
   *
   *  `calls` counts SEAM INVOCATIONS -- once per founder, incremented where the
   *  arm decides to spend. `truncated`, `thoughtOn`, `thinkingTokens` and
   *  `toolAsked` are incremented inside `ask()`, which runs a SECOND time on
   *  every brief where retrieval fired. The published line divided the second
   *  by the first and printed the impossible `thought on 210/148 call(s)`
   *  (findings/headtohead_wsGA): 148 founders, 62 of them retrieved, 148+62 =
   *  210 API calls, every one of which thought.
   *
   *  A ratio over the wrong denominator is not a rounding error -- it made a
   *  per-call rate unreadable in the one direction that matters, because
   *  `4 CUT OFF` was silently 4-in-210 and not 4-in-148.
   *
   *  THE PROPERTY: a counter incremented inside `ask()` is reported over
   *  `apiCalls`; a counter incremented in `agentSelectRows` is reported over
   *  `calls`. `apiCalls` is incremented on the same line that builds the
   *  request, so a third round added tomorrow counts itself. */
  apiCalls: 0,
  /** ── THE MENU THE MODEL WAS ACTUALLY SHOWN (wsHI) ──────────────────────
   *
   *  The line printed `depth=`, which is `SELECT_DEPTH` -- a CAP, and one that
   *  has read 40 on every recorded run in this tree since before the ranker
   *  shipped. The menu handed over is `min(SELECT_DEPTH, pool)` and the pool is
   *  cut upstream by `VERDICT_POOL`. The two were equal exactly never.
   *
   *  It cost a paid run. wsGS raised the token ceiling on the stated ground
   *  that wsGA's truncations happened at forty rows "because the same line says
   *  depth=40". wsGA's own tape records `menu: 18` on all 98 called founders:
   *  VERDICT_POOL was 18 until the day AFTER that run. The replacement ceiling
   *  was therefore sized on evidence from a menu less than half the length of
   *  the one shipping.
   *
   *  THE PROPERTY: the record states the menu it MEASURED, never the lever that
   *  bounded it. Reported as a range because it varies per founder -- a short
   *  accessible pool yields a short menu -- and the max is what a ceiling has
   *  to survive. `check_maxtok_headroom.ts` reads it back. */
  menuMin: Infinity as number, menuMax: 0,
  /** ── THE OTHER WAY A CEILING FAILS, AND THE QUIETER ONE ────────────────
   *
   *  A ceiling the clock cannot reach never truncates: the call times out
   *  first, which lands in `exits.threw` rather than in `truncated`. So a
   *  truncation count of zero is compatible with a ceiling that never had a
   *  chance to bind, and no recorded run in this tree states its own duration,
   *  so nothing can tell the two apart after the fact.
   *
   *  The slowest call is the one number that settles it: against
   *  `TIMEOUT_BY_EFFORT` it says how much of the clock the run actually used. */
  slowestMs: 0,
  /** Picks that were a second row of a programme already picked -- SELECT-8
   *  stated in the prompt and measured here rather than assumed (wsDY). */
  siblingPicks: 0, siblingBriefs: 0,
  /** `atMost` only: seats the model chose not to fill, and on how many briefs. */
  declinedSeats: 0, declinedBriefs: 0,
  emptyReply: 0, badJson: 0, eur: 0, lookups: 0, resolved: 0,
  /** Calls the API cut off at max_tokens, and the thinking they were billed
   *  for. A truncated call falls back to the shipped order, so without this
   *  counter a max_tokens ceiling set too low for the effort reads as the
   *  model refusing to choose -- which is how a run measures its own control
   *  and reports it as a treatment. */
  truncated: 0, thinkingTokens: 0, thinkingChars: 0, thoughtOn: 0,
  /** `tool` mode: calls on which the model ASKED for a fund's own rules. The
   *  whole question about this channel is whether it ever fires, so the count
   *  of times the model reached for it is the measurement, not a diagnostic. */
  toolAsked: 0,
  /** `dry` only: the size of the prompt the adviser WOULD have sent, and of
   *  the evidence round two would have carried. Priced by _wsdd_cost.ts. */
  dryChars: [] as number[], dryEvidenceChars: [] as number[], dryRetrieved: 0,
  /** `reverse` only: pools permuted with no model in the loop. */
  reversed: 0,
  /** SELECT-1/SELECT-2 as `checkSelection` decides them, on the real reply.
   *  OBSERVATIONAL: counted, never repaired. See the call site. */
  selectionViolations: 0, selectionViolationBriefs: 0,
  /** ── EVERY WAY OUT OF `agentSelectRows`, AND EXACTLY ONE PER CALL ────────
   *
   *  Two of these returned silently: a pool no longer than `SELECT_COUNT`, and
   *  a menu no longer than `want`. Both are ordinary on a founder with a short
   *  accessible pool, both publish the shipped order, and neither left a trace
   *  — so a run that hit them on a third of its founders reported "no
   *  difference" and could not say whether the model had judged and agreed or
   *  had never been asked. That is not a diagnostic gap, it is a result that
   *  cannot be interpreted, and it is a precondition for any paid run.
   *
   *  THE PROPERTY: every exit from `agentSelectRows` increments exactly one of
   *  these. It is stated over the total rather than over a list of returns, so
   *  an exit added tomorrow is covered: `agentSelect.exits.test.ts` calls the
   *  function once per reachable shape and asserts the total moved by one. */
  exits: {
    armOff: 0, reversed: 0, poolNotLongerThanCount: 0, menuNotLongerThanWant: 0,
    dryPriced: 0, noUsablePick: 0, threw: 0, chose: 0,
  } as Record<ExitReason, number>,
};

/** The ways `agentSelectRows` can end. Named rather than counted, because
 *  "fell back" is four different facts and only one of them is about the
 *  model. */
export type ExitReason =
  | "armOff" | "reversed" | "poolNotLongerThanCount" | "menuNotLongerThanWant"
  | "dryPriced" | "noUsablePick" | "threw" | "chose" | "confirmed";

/** The ONLY way out of `agentSelectRows`. Every `return` in that function goes
 *  through here, so the counter cannot be forgotten at a new exit — the way it
 *  was forgotten at two. */
function leave(reason: ExitReason, rows: InstrumentRow[]): InstrumentRow[] {
  tally.exits[reason]++;
  return rows;
}

/** What each exit means, for the tally line. A count with no sentence beside
 *  it is a number somebody will have to come back and interpret. */
const EXIT_WHAT: Record<ExitReason, string> = {
  armOff: "arm off, untouched",
  reversed: "REVERSED (diagnostic)",
  poolNotLongerThanCount: `pool <= ${SELECT_COUNT} rows, nothing to choose between`,
  menuNotLongerThanWant: "menu no longer than the seats on offer",
  dryPriced: "priced, not called",
  noUsablePick: "no usable pick, shipped order kept",
  threw: "the call threw, shipped order kept",
  chose: "the model chose",
  confirmed: "the model's first choice was ours, our order kept (wsIJ)",
};
export function agentSelectExitLine(): string {
  const total = Object.values(tally.exits).reduce((a, b) => a + b, 0);
  if (!total) return "agent-select exits: the seam was not reached";
  return `agent-select exits (${total} call(s) to the seam): ` +
    (Object.entries(tally.exits) as [ExitReason, number][])
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${EXIT_WHAT[k]}`).join(", ");
}
/** Read by the exit test, and by any harness that wants the raw counts rather
 *  than the sentence. */
export function agentSelectExits(): Record<ExitReason, number> {
  return { ...tally.exits };
}
export function resetAgentSelectTally(): void {
  tally.menuMin = Infinity; tally.menuMax = 0; tally.slowestMs = 0;
  tally.calls = 0; tally.apiCalls = 0; tally.ok = 0; tally.failed = 0;
  tally.shortReply = 0; tally.invalidIds = 0;
  tally.siblingPicks = 0; tally.siblingBriefs = 0;
  tally.declinedSeats = 0; tally.declinedBriefs = 0;
  tally.emptyReply = 0; tally.badJson = 0; tally.eur = 0;
  tally.lookups = 0; tally.resolved = 0;
  tally.dryChars = []; tally.dryEvidenceChars = []; tally.dryRetrieved = 0;
  tally.reversed = 0;
  tally.truncated = 0; tally.thinkingTokens = 0;
  tally.thinkingChars = 0; tally.thoughtOn = 0; tally.toolAsked = 0;
  tally.selectionViolations = 0; tally.selectionViolationBriefs = 0;
  // Cleared by iterating the object rather than by naming the keys, so an exit
  // added tomorrow is reset without an edit here — a reason that survived a
  // reset would report the previous run's founders as this one's.
  for (const k of Object.keys(tally.exits) as ExitReason[]) tally.exits[k] = 0;
}
export function agentSelectTallyLine(): string {
  // The nonsense arm reports itself as nonsense. A line that read like the
  // others would be a line a reader could quote as a ranking result.
  if (AGENT_SELECT_ARM === "reverse") {
    return `agent-select: arm=reverse — ${tally.reversed} pool(s) REVERSED, ` +
      `0 model calls, EUR 0.0000. THIS IS NOT A RANKING: the shipped ranker's ` +
      `worst candidate is placed first. Any order or table produced under this ` +
      `arm is deliberately wrong and exists only to show that the pool's order ` +
      `reaches the memo.`;
  }
  if (!tally.calls) return `agent-select: arm=${AGENT_SELECT_ARM}, no calls made`;
  // `menu=` BEFORE `depth=`, because it is the fact and `depth=` is the lever
  // that bounds it. A reader who takes the first number they meet as "how many
  // rows the model saw" is now right rather than wrong -- which is the whole
  // defect wsHI found, and the reason a paid run was resized on the strength of
  // an eighteen-row measurement that read as forty. See `tally.menuMax`.
  const menu = tally.menuMax
    ? (tally.menuMin === tally.menuMax ? `${tally.menuMax}` : `${tally.menuMin}-${tally.menuMax}`)
    : "none";
  return `agent-select: menu=${menu} rows arm=${AGENT_SELECT_ARM} depth=${Number.isFinite(SELECT_DEPTH) ? SELECT_DEPTH : "all"} count=${SELECT_COUNT_MODE === "atMost" ? "<=" : ""}${SELECT_COUNT}` +
    (AGENT_SELECT_ARM === "assist" ? ` keep=${SELECT_KEEP}` : "") +
    // Printed only when it is ON. A lever that reads `abstain=off` on every
    // line trains the reader to skip the field, and this is the field that
    // says whether the run's order is the model's at all.
    (ABSTAIN_MODE === "confirmed"
      ? ` abstain=confirmed (${tally.exits.confirmed} of ${tally.exits.confirmed + tally.exits.chose} kept ours)` : "") +
    (AGENT_SELECT_ARM === "adviser"
      ? ` effort=${THINK_EFFORT} maxtok=${MAX_TOKENS_BY_EFFORT[THINK_EFFORT]}`
        + (UNSURE_MODE === "declare" ? ` unsure=declare` : "")
        + ` lookups=${tally.lookups} (${tally.resolved} brief(s) retrieved)` : "") +
    // Reported on EVERY arm, because `tool` now fires on every arm. Printing it
    // only for the adviser is how a channel comes to run unreported.
    (UNSURE_MODE === "tool"
      ? ` unsure=tool asked=${tally.toolAsked}/${tally.apiCalls} API call(s)` +
        (AGENT_SELECT_ARM === "adviser" ? "" :
          ` lookups=${tally.lookups} (${tally.resolved} brief(s) retrieved)`) : "") +
    ` model=${MODEL} — ${tally.ok}/${tally.calls} chose, ${tally.failed} FELL BACK to the` +
    ` shipped order (${tally.emptyReply} empty reply, ${tally.badJson} unparseable),` +
    ` ${tally.shortReply} short reply, ${tally.invalidIds} unusable id(s)` +
    // What the model did with the seats: the ones it declined (`atMost` only)
    // and the ones it spent twice on one programme. Both belong next to "short
    // reply" because all three are about the SHAPE of the answer, and only the
    // mode tells you whether a short answer was the licence being used or a
    // defect.
    (SELECT_COUNT_MODE === "atMost"
      ? `, DECLINED ${tally.declinedSeats} seat(s) on ${tally.declinedBriefs} brief(s) (kept the shipped order there)` : "") +
    `, ${tally.siblingPicks} seat(s) on a row already picked under the SAME TITLE (a floor) across ${tally.siblingBriefs} brief(s)` +
    // The two hard selection rules, decided on the reply as it arrived rather
    // than on the repaired picks. A non-zero here is the model breaking a rule
    // the system prompt told it would be checked; the repair still happens, so
    // this changes nothing a founder sees.
    `, ${tally.selectionViolations} SELECT-rule violation(s) on ${tally.selectionViolationBriefs} reply(ies)` +
    // The thinking that HAPPENED, next to the thinking we asked for. wsDQ set
    // effort=low and 10 of 12 calls spent zero thinking tokens, so the setting
    // alone never established that the lever moved. `truncated` is here for the
    // opposite reason: it is the only thing that distinguishes a ceiling set too
    // low from a model that declined, and both of those publish the control.
    // Over `apiCalls`, not `calls`: round two is a second request on the same
    // brief, so every counter incremented inside `ask()` has a denominator of
    // its own. The line that printed "thought on 210/148 call(s)" was dividing
    // by the founders.
    (AGENT_SELECT_ARM === "adviser"
      ? `, ${tally.apiCalls} API call(s) over ${tally.calls} brief(s)`
        + `, thought on ${tally.thoughtOn}/${tally.apiCalls} API call(s)`
        + ` (${tally.thinkingTokens} thinking token(s) billed,`
        + ` ${tally.thinkingChars} readable char(s)),`
        + ` ${tally.truncated}/${tally.apiCalls} CUT OFF at max_tokens`
        // Beside the truncation count, never apart from it: a zero here is only
        // evidence the ceiling holds if the clock was not the thing that cut
        // the calls off instead. Percentage of the wall this effort is allowed.
        + `, slowest call ${tally.slowestMs}ms of ${TIMEOUT_BY_EFFORT[THINK_EFFORT]}ms`
        + ` (${((tally.slowestMs / TIMEOUT_BY_EFFORT[THINK_EFFORT]) * 100).toFixed(1)}% of the clock)`
      : "") +
    `, EUR ${tally.eur.toFixed(4)} total, EUR ${(tally.eur / tally.calls).toFixed(4)} per brief`;
}
/** `dry` only. The measured prompt sizes, for pricing an arm before running
 *  it — the budget is per brief and has to be known in advance, not found in
 *  the invoice. */
export function agentSelectDrySizes(): {
  prompts: number[]; evidence: number[]; retrieved: number;
} {
  return {
    prompts: [...tally.dryChars], evidence: [...tally.dryEvidenceChars],
    retrieved: tally.dryRetrieved,
  };
}

/**
 * ── WHAT THE MODEL DID WITH THE PRIOR, recorded for the case just decided ──
 *
 * wsCZ (e32c0c4b) established that the peer prior is substantially INFERRED
 * rather than observed: 44% of its slots are held by inference, and the
 * canonical example is a film scheme credited by 215 awards from 170 German
 * software companies under entirely different schemes. `applyPeerPrecedence`
 * copies that cell order wholesale.
 *
 * That changes what this arm is for. Handing the model a prior that is 44%
 * inference and asking it to adjudicate is not "give the model the answer" —
 * it is a test of whether a reader of the actual fund text can tell a sound
 * prior slot from an unsound one. So the headline number is the less
 * interesting half. The interesting half is: when the model OVERRODE the
 * prior, was it right?
 *
 * Recorded here and joined against the answer key in the harness, because only
 * the harness knows which fund won and this module must never.
 */
export interface PriorDecision {
  /** Menu candidates the peer prior ranked at all, best first. */
  priorRanked: string[];
  /** What the model chose, in its order. */
  picked: string[];
  /** Picks that the prior had also ranked — the model FOLLOWED the prior. */
  followed: string[];
  /** Prior-ranked candidates the model declined to pick — OVERRIDES. */
  overrode: string[];
  /** Picks the prior had not ranked at all — the model REACHED past it. */
  reached: string[];
  /** Candidates the model said it could not tell apart. */
  unsure: string[];
}
let lastDecision: PriorDecision | null = null;
export function agentSelectLastDecision(): PriorDecision | null { return lastDecision; }

export function agentSelectCostPerBrief(): number {
  return tally.calls ? tally.eur / tally.calls : 0;
}

/**
 * ── THE TRANSCRIPT: what was sent, what came back, verbatim ────────────────
 *
 * wsDQ. The owner's instruction for the first paid run was "set the test up so
 * that we can see every step transparently"; a verdict with no trace behind it
 * is what this project has spent a week retracting. Nothing in this module
 * previously kept the bytes: the tally counts calls and the decision record
 * keeps ids, and neither can answer "what did we ask it, and what did it say".
 *
 * OFF BY DEFAULT AND OFF IN PRODUCTION. It is enabled only by a harness
 * calling `setAgentSelectTracing(true)`, there is no environment variable that
 * turns it on, and every write is behind that flag. A request that has not
 * asked for a transcript allocates nothing and behaves identically — this is
 * observation, and an observer that changes the thing observed would void the
 * run it exists to record.
 *
 * The full text is kept, uncut. A truncated prompt is a reconstruction, and
 * grading a reconstruction is the defect class this repo has paid for twice.
 */
export interface AgentSelectTurn {
  /** 1 = the first ask; 2 = the re-ask after retrieval resolved an ambiguity. */
  round: number;
  system: string;
  user: string;
  /** Every text block, joined — the model's reply exactly as it arrived. */
  reply: string;
  /** Every thinking block, joined. Empty unless the arm enabled thinking. */
  thinking: string;
  model: string;
  usage: unknown;
  eur: number;
}
/** One pool row, as much of it as a reader needs to recognise the fund. The
 *  ON arm's prompt already renders all of this; the OFF arm has no prompt, so
 *  without this the control side of the record would be a list of ids. */
export interface AgentSelectRow {
  instrumentId: string;
  instrument: string;
  administeringBody?: string;
  country?: string;
  capitalType?: string;
  descriptor?: string;
  typicalAward?: number;
  typicalAwardN?: number;
  lastAwardYear?: number;
  description?: string;
}
export interface AgentSelectTrace {
  arm: AgentSelectArm;
  /** The pool as it arrived, in order, and as it left. */
  poolIn: string[];
  poolOut: string[];
  /** `poolIn`, with enough of each row to read it. */
  poolDetail: AgentSelectRow[];
  /** The rows actually offered to the model, in menu-index order. */
  menu: string[];
  /** Menu indices the model named, in its own order. */
  picks: number[];
  /** Instrument ids for those picks, in the model's order. */
  pickedIds: string[];
  /** Menu indices the model said it could not separate. */
  unsure: number[];
  /** What retrieval returned for them: instrument id -> the gate text shown. */
  retrieved: { instrumentId: string; text: string }[];
  turns: AgentSelectTurn[];
  /** Set when the arm gave up and returned the shipped order unchanged. */
  fellBack: string | null;
  eur: number;
}
let tracing = false;
let traceMemo: AgentSelectTrace | null = null;
/** Turn the transcript on for this process. Harnesses only. */
export function setAgentSelectTracing(on: boolean): void { tracing = on; }
/** The transcript of the most recent seam call, or null. */
export function agentSelectLastTrace(): AgentSelectTrace | null { return traceMemo; }

/** A transcript seeded with the pool as it arrived and nothing else, so an arm
 *  that returns without calling still leaves a readable record of what it was
 *  handed. `poolOut` starts equal to `poolIn` and is overwritten only by a
 *  path that actually permutes. */
function seedTrace(rows: InstrumentRow[]): AgentSelectTrace {
  const ids = rows.map((r) => r.instrumentId ?? r.channel);
  return {
    arm: AGENT_SELECT_ARM,
    poolIn: ids,
    poolOut: ids,
    poolDetail: rows.map((r) => ({
      instrumentId: r.instrumentId ?? r.channel,
      instrument: r.instrument,
      administeringBody: r.administeringBody,
      country: r.country,
      capitalType: r.capitalType,
      descriptor: r.descriptor,
      typicalAward: r.typicalAward,
      typicalAwardN: r.typicalAwardN,
      lastAwardYear: r.lastAwardYear,
      description: r.description,
    })),
    menu: [], picks: [], pickedIds: [], unsure: [], retrieved: [],
    turns: [], fellBack: null, eur: 0,
  };
}

const eur = (n: number | undefined | null): string =>
  n == null || !Number.isFinite(n) ? "n/a"
    : n >= 1e6 ? `EUR ${(n / 1e6).toFixed(1)}M`
      : n >= 1e3 ? `EUR ${Math.round(n / 1e3)}k` : `EUR ${Math.round(n)}`;

// `oneLine` and `ROW_TITLE_CHARS` are imported from `./schemeText`, where they
// sit beside `beyondTitle`. That module decides whether a description repeats
// the title, which is a question about the title AS RENDERED HERE — so the cut
// and the number it cuts at have to be one definition, not two that agree.

/**
 * The requirements a row prints: its LEAST SHARED, always at least one.
 *
 * ── What the cut is for, and it is still right ─────────────────────────────
 * 66% of candidate rows share their entire requirement block byte-for-byte
 * with a sibling — "Tobacco, gambling and betting, and weapons and munitions
 * are outside the scope" alone appeared on 2,316 of 4,626 rendered rows.
 * Printing it forty times spends a third of the prompt saying something
 * identical about every option, which is the definition of an uninformative
 * feature, and it crowds out the facts that separate.
 *
 * ── What it was ALSO doing, which it was never for (wsFG) ──────────────────
 * It was deleting the row's only sentence. 18,362 gate instances are visible
 * to the 837 open rows and 781 printed — 4.3% — and the two stages that did
 * most of that were this filter and the `.slice(0, 2)` behind it. 164 menu
 * rows (21.1%) held requirements and printed none, and on 94 of them the
 * least-shared requirement they held sat on under 60% of the menu: not
 * boilerplate, just above a threshold calibrated for a different problem.
 *
 * A threshold cannot tell those apart because it is not asking about the row,
 * it is asking about the corpus. So the rule is stated about the row instead.
 *
 * ── THE PROPERTY ──────────────────────────────────────────────────────────
 *
 *   A ROW THAT HOLDS ANY REQUIREMENT PRINTS ONE, and the one it prints is the
 *   least widely shared it holds. Being common is a reason to print a
 *   requirement LAST, never a reason to print nothing: a row that says nothing
 *   can only be chosen by its position, and its position is the empirical
 *   ranker's answer restated.
 *
 * Two consequences, and both are the property rather than a tuned number:
 *
 *   THE THRESHOLD NOW RANKS RATHER THAN GATES. Where a row holds requirements
 *     the list does not share, those are what print — unchanged, that is the
 *     0.35 cut doing the job it was written for. Where every requirement it
 *     holds is common, the least common one prints anyway. Nothing is silenced
 *     for being unsurprising.
 *
 *   THERE IS NO SECOND CAP. `.slice(0, 2)` is gone. How many requirements a
 *     row holds is decided in ONE place — `JUDGEMENT_CAP` in shortlist.ts,
 *     which is the stage that knows about own-versus-inherited rules and about
 *     the framework label. A second, smaller cut here was silently discarding
 *     the third requirement that stage had already selected as the row's best,
 *     which is the same defect as two truncations of one description.
 *
 * Together the two changes take the requirements PRINTED across one founder's
 * fourteen menus from 271 to 407 — 252 rows, 1.08 a row to 1.62
 * (`_wsfg_silence.ts`, before and after on the same founder).
 *
 * The test for the unseen case is stated over an arbitrary menu rather than
 * over the requirements we happen to hold: for ANY row with a non-empty
 * requirement list, the result is non-empty, and its first element is a
 * requirement no rarer one was passed over for. See `rowSaysSomething.test.ts`.
 *
 * fundSelection.ts carries the 0.35 cutoff too and DELIBERATELY still gates on
 * it: that module has no production caller and reordering a dead path to match
 * a live one is a change nothing can measure. The two numbers agreeing was
 * never the contract; this one now means something different from that one.
 *
 * ── THE CUT IS A PROPORTION, SO IT DID NOT MOVE WITH THE POOL (wsGS) ──────
 * Read as a count it looks like a number nobody chose: 7 at eighteen rows, 14
 * at forty. It is the same rule at both. `0.35` is a share OF THE LIST, and the
 * question it asks — does this demand separate this row from the others in
 * front of the model — is a question about the share and not about the count.
 * A demand on 13 of 40 rows tells a reader as little as one on 6 of 18. Nothing
 * here needs re-tuning because the pool widened, and a future reader who
 * re-derives the count and "corrects" it will have changed the rule.
 *
 * The one part that is NOT proportional is `Math.max(2, ...)`, and it is inert
 * on this path: `ceil(0.35 * L) >= 2` for every L >= 3, and `agentSelectRows`
 * has already returned through `poolNotLongerThanCount` or
 * `menuNotLongerThanWant` for anything shorter. It is kept because `distinctive`
 * is exported and a caller with a two-row list would otherwise get a cutoff of
 * 1, which suppresses every requirement any two rows share.
 */
export function distinctive(rows: InstrumentRow[]): (r: InstrumentRow) => string[] {
  const seen = new Map<string, number>();
  for (const r of rows) for (const g of r.judgementCriteria ?? []) {
    seen.set(g, (seen.get(g) ?? 0) + 1);
  }
  const share = (g: string) => seen.get(g) ?? 0;
  const cutoff = Math.max(2, Math.ceil(rows.length * 0.35));
  return (r) => {
    const held = r.judgementCriteria ?? [];
    if (!held.length) return [];
    const rare = held.filter((g) => share(g) < cutoff);
    // `reduce` rather than a sort, so ties keep the incoming order — which is
    // shortlist.ts's own-criteria-before-inherited-ones ordering, and a
    // scheme's own rule outranking its regime's is a correctness property
    // there, not a presentation one.
    const chosen = rare.length ? rare : [held.reduce((a, b) => (share(b) < share(a) ? b : a))];
    return chosen.map((g) => oneLine(g, 180));
  };
}

/**
 * WHAT THE PRIOR KNOWS, handed to the model as INPUT rather than as a rule.
 *
 * The free arm's failure was judgement with the prior switched off: CHANNEL@5
 * fell 92% -> 75%, so the model was leaving the right neighbourhood, not
 * picking the wrong sibling. It never saw the one thing the ranker is built
 * from — which funds companies like this one have actually won. This hands it
 * over as a fact it may weigh and, where the fund plainly does not fit, may
 * overrule. That is the adjudication the ranker cannot do and the free arm had
 * no basis for.
 *
 * LEAK: `peerPrior` reads peerPrior.generated.json, emitted by
 * ETL/terms/emit_peer_prior.py, which resolves its holdout through
 * ETL/lib/recall_holdout.py and drops EVERY company in EVERY `__recallSet*.json`
 * by glob, BY DEFAULT, before counting a single pair. The founder being
 * replayed is therefore absent from the statistic that describes them, and the
 * rank below cannot have been computed from the award we are asking the model
 * to predict.
 */
function peerRank(country?: string, sector?: string): Map<string, number> {
  const out = new Map<string, number>();
  try {
    peerPrior(country, sector).forEach((id, i) => { if (!out.has(id)) out.set(id, i + 1); });
  } catch { /* the prior is optional; its absence must not fail a brief */ }
  return out;
}

/**
 * THE QUALIFICATION LINE — the one fact on the row that IS about this founder.
 *
 * `assessAll` is pure, model-free and runs in memory over gates the pool
 * already hydrated, and it answers, per fund per founder, the only question
 * this product has ever written a principle about: can they walk through this
 * door, and if not, what is the one thing in the way. Until wsDL it was
 * computed inside `synthesize()` and attached to `InstitutionEntry` — i.e.
 * AFTER any selection — so we worked the eligibility answer out and showed the
 * model none of it.
 *
 * It is not a leak. It is a comparison between the founder's OWN answers and
 * the fund's own encoded requirement text; no beneficiary, award or title is
 * involved, and `verdict.ts` reaches no store that holds one.
 *
 * The vocabulary is `verdict.ts`'s and is deliberately asymmetric: "nothing we
 * can check rules them out" is never "they qualify". Saying it any other way
 * in a prompt would invite the model to publish a promise the product refuses
 * to make.
 */
function verdictLine(a: InstrumentAssessment | undefined): string {
  if (!a) return "";
  const checked = `${a.checked} encoded rule${a.checked === 1 ? "" : "s"} checked against their answers`;
  switch (a.status) {
    case "open":
      return `qualification: nothing we can check rules them out (${checked})`;
    case "one_blocker":
      return `qualification: one thing in the way — "${oneLine(a.blockers[0]?.requirement ?? "", 160)}" (${checked})`;
    case "blocked":
      // Cannot occur on the memo seam: `accessiblePool` removed these before
      // the pool was cut. Rendered rather than assumed away, because a silent
      // branch is how a dropped row would come back unlabelled.
      return `qualification: conclusively fails ${a.blockers.length} of its own rules (${checked})`;
    default:
      return "qualification: no encoded rule could be evaluated — we cannot say either way";
  }
}

/** How many characters of the composed descriptor a row may spend. Unchanged
 *  from the budget `oneLine(r.descriptor, 60)` used; what changed is WHICH end
 *  of the composite pays for it. */
const DESCRIPTOR_CHARS = 60;

/** The separator `fundDescriptor` joins with. One definition, because a row
 *  that splits on a different character than the one that joined it silently
 *  reads the whole descriptor as a single part. */
const DESCRIPTOR_SEP = " \u00b7 ";

/** How much of the registered purpose a row may spend.
 *
 *  Not a sentence budget: `registeredPurpose` is a composed phrase \u2014 the uses
 *  of funds the scheme's articles permit, and then the articles. Measured over
 *  the 421 instruments that carry one (`scripts/_wsgv_rowfields.ts`, live
 *  corpus): p50 76 characters, p90 158, max 236.
 *
 *  140 leaves nearly all of the p90 intact and cuts only the tail, where a
 *  scheme cites five articles at once. What a cut removes is the CITATION and
 *  not the meaning, because `registeredPurpose` composes the uses of funds
 *  first and the article list last. */
const REGISTERED_PURPOSE_CHARS = 140;

/**
 * The row's kind of capital, and the descriptor parts that are left.
 *
 * ── The property, and its test for the unseen case ────────────────────────
 * A ROW STATES EACH FACT ONCE, AND A BUDGET NEVER COSTS IT A FACT.
 *
 * `fundDescriptor` composes `CAPITAL_WORD[capitalType] · region · what it
 * mostly funds`. The row was printing the raw `capitalType` column beside that
 * whole string, so the kind of capital appeared twice — "grant" and then
 * "Grants", four fields apart — and the characters went on the repeat.
 *
 * Two things follow, and neither is a list of known duplicates:
 *
 *   THE READER'S WORD WINS. Where a descriptor part names the same fact as the
 *     `capitalType` column, that part IS the column rendered for a reader, and
 *     it takes the slot the raw value used to hold. The raw value prints only
 *     where no part names it — one statement of the fact, not fewer facts.
 *   AND IT DOES NOT COMPETE FOR THE BUDGET. It is lifted out of the budgeted
 *     text entirely, so a long region name can never cost the row its kind of
 *     capital. Only the parts that are genuinely new to the row are budgeted.
 *
 * A part that restates a field the row prints beside the descriptor — the body,
 * the country — is dropped. Normalisation is deliberately shallow: case,
 * punctuation, and the plural the corpus's own word carries. It is not a
 * stemmer; two facts that differ by more than that are two facts.
 *
 * Stated over the parts rather than over their positions, so a fourth clause
 * added to `fundDescriptor` tomorrow is carried with no edit here.
 */
export function descriptorParts(r: InstrumentRow): { capital: string; rest: string[] } {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/s$/, "");
  const said = new Set([r.administeringBody, r.country]
    .filter(Boolean).map((v) => norm(String(v))));
  const parts = (r.descriptor ?? "").split(DESCRIPTOR_SEP)
    .map((p) => p.trim())
    .filter((p) => p && !said.has(norm(p)));
  const key = r.capitalType ? norm(r.capitalType) : "";
  const i = key ? parts.findIndex((p) => norm(p) === key) : -1;
  return {
    capital: i >= 0 ? parts[i] : (r.capitalType ?? ""),
    rest: i >= 0 ? [...parts.slice(0, i), ...parts.slice(i + 1)] : parts,
  };
}

/**
 * Fit the parts into a budget, LAST FIRST.
 *
 * `fundDescriptor` puts what the scheme mostly funds at the end, and that is
 * the one part of the composite the row does not already carry — the line that
 * separates two rows of one body in one country. Cutting from the front of the
 * string, which is what `oneLine` does, spent the budget on the parts that were
 * redundant and then deleted the one that was not.
 *
 * Nothing is invented and nothing is reordered: the parts print in the order
 * `fundDescriptor` composed them. What changes is which one pays when there is
 * not room for all of them.
 */
export function fitDescriptor(parts: string[], budget: number): string {
  const out: string[] = [];
  let left = budget;
  for (const p of [...parts].reverse()) {
    // Below this a part is an ellipsis and a syllable, which is noise rather
    // than an abbreviated fact.
    if (left < 12) break;
    const cut = oneLine(p, left);
    out.unshift(cut);
    left -= cut.length + DESCRIPTOR_SEP.length;
  }
  return out.join(DESCRIPTOR_SEP);
}

/**
 * WHICH ROWS ON THIS MENU ARE THE SAME NOTIFIED SCHEME, said in indices.
 *
 * ── The defect it targets, and only that one ──────────────────────────────
 * SELECT-8 already gives the model the founder's test for whether two rows are
 * one option: would a company turned down by one be turned down by the other?
 * The model applies it to what it can see, and what it cannot see is that rows
 * [3] and [11] are two granting bodies delivering ONE notified regime. Measured
 * on the twelve bench companies, four of twelve spent two of six seats on a
 * sibling pair, and thinking did not fix it — a missing FACT, not a missing
 * judgement. `sameTitlePickCount` counts the strict subset of that defect which
 * is decidable from the titles alone; this is the fact behind the rest of it.
 *
 * ── A FACT, NOT A RULE, and the difference is measured ────────────────────
 * It states who shares a regime. It does not say pick one. Collapsing a
 * notified scheme is the wsCG2 defect and this repo has the number for it:
 * SA.111723 has fourteen leaves and fourteen different granting bodies, the
 * dedupe that treated them as one was 50% of all misses, and pool recall fell
 * 97% -> 83% when the notified-scheme repeat was made a filter. The founder's
 * own test still decides; the row only stops hiding the input to it.
 *
 * ── Why an index list rather than the code alone ──────────────────────────
 * A bare "SA.111723" on two rows forty lines apart is a fact the reader has to
 * find by scanning. The code was in the row TITLE once and was removed because
 * it produced a token zero times, which is the same lesson from the other side:
 * an identifier nothing can act on earns nothing. The indices are what the
 * model answers in, so this is the code rendered in the units of the decision.
 *
 * SILENT WHERE IT SEPARATES NOTHING. A row whose scheme code no other row on
 * this menu shares gets no line — the fact is about a PAIR, and 50% of rows
 * carry a code while far fewer share one with a row in front of this founder.
 *
 * LEAK: `scheme_code` is the SA number a scheme was notified under. It is on
 * the register before the first award and does not move when the recipients
 * change, which is why `check_answer_not_reachable.ts` classifies it an
 * award-fact rather than a statistic over who won.
 */
export function schemeSiblings(rows: InstrumentRow[]): (i: number) => string {
  const byCode = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const c = (r.schemeCode ?? "").trim();
    if (c) byCode.set(c, [...(byCode.get(c) ?? []), i]);
  });
  return (i: number) => {
    const c = (rows[i]?.schemeCode ?? "").trim();
    const group = c ? byCode.get(c) ?? [] : [];
    if (group.length < 2) return "";
    const others = group.filter((j) => j !== i).map((j) => `[${j}]`);
    return `notified under the same scheme (${c}) as ${others.join(", ")}`;
  };
}

/** One candidate as the model reads it. Everything here is either a statement
 *  of what the fund DEMANDS, an aggregate over its whole award history, or our
 *  own model-free read of the founder's answers against that fund's rules.
 *  `usedInField` is omitted on purpose — see the header. */
function renderRow(
  i: number, r: InstrumentRow, reqs: string[], siblings: string, peers?: Map<string, number>,
  assessments?: Map<string, InstrumentAssessment>,
  /** This row's title as cut ALONGSIDE the rest of the menu. Passed in rather
   *  than computed here because the cut is a fact about the whole menu: whether
   *  a character may be given up depends on which other rows the model is
   *  reading. Absent, the row falls back to the plain cut, which is what a
   *  caller holding one row can honestly say. */
  title?: string,
): string {
  const facts: string[] = [];
  if (r.administeringBody) facts.push(oneLine(r.administeringBody, 70));
  if (r.country) facts.push(r.country);
  // ── THE DESCRIPTOR IS THREE FACTS, AND TWO WERE ALREADY ON THE ROW (wsGS) ─
  //
  // `fundDescriptor` composes `CAPITAL_WORD[capitalType] · region · what it
  // mostly funds`, joined by DESCRIPTOR_SEP. So the row was printing the kind
  // of capital TWICE — once as the raw column value and once as the corpus's
  // own word for it, four fields apart — and the region beside a country it
  // usually sits inside.
  //
  // The third part is the only one of the three that is NOT already on this
  // row: what the scheme mostly pays for. `oneLine(descriptor, 60)` cut from
  // the END, so a long region name deleted exactly that clause and left the
  // row repeating itself. `fitDescriptor` spends the budget from the last part
  // backwards, so what gets dropped is what the row already said.
  //
  // The raw `capitalType` is kept as the FALLBACK for a row with no descriptor
  // at all: the point is one statement of the fact, not fewer facts.
  const { capital, rest } = descriptorParts(r);
  if (capital) facts.push(capital);
  if (r.typicalAward != null && (r.typicalAwardN ?? 0) >= 5) {
    // ── A MEDIAN IS ONE NUMBER, AND SCALE IS THE QUESTION IT CANNOT ANSWER ─
    // The row has printed a median over real awards since it existed. Two
    // funds with the same median are not the same fund: one whose middle half
    // lands between EUR 200k and EUR 300k has a ticket, and one whose middle
    // half spans EUR 25k to EUR 4M does not. A founder asking for EUR 2M is
    // ruled out by the first and is inside the second, and the median alone
    // says the same thing about both.
    //
    // ONE CLAUSE ON A LINE THAT ALREADY PRINTS THE MEDIAN, so the leak
    // question has precedent rather than a new answer: these are two more
    // percentiles of the same amounts, from the same column family, behind the
    // same `typicalAwardN` floor. `check_answer_not_reachable.ts` classifies
    // all four the same way and for the same reason — strip every recipient's
    // identity and attributes from the award tables and a percentile of the
    // amounts does not move.
    //
    // Silent where it would say nothing. p75 == p25 is a fund that has paid
    // one amount, and "between EUR 50k and EUR 50k" spends characters to
    // restate the median; the row prints the median alone there.
    //
    // AFTER the count, not between the median and it. Read aloud, "EUR 495k,
    // half between EUR 343k and EUR 699k over 2,463 real awards" leaves the n
    // dangling off the range when it belongs to all three numbers.
    const span = r.awardP25 != null && r.awardP75 != null && r.awardP75 > r.awardP25
      ? `, half between ${eur(r.awardP25)} and ${eur(r.awardP75)}` : "";
    facts.push(`typical award ${eur(r.typicalAward)} over ${r.typicalAwardN} real awards${span}`);
  } else facts.push("no reliable award median");
  if (r.lastAwardYear) facts.push(`last awarded ${r.lastAwardYear}`);
  if (rest.length) facts.push(fitDescriptor(rest, DESCRIPTOR_CHARS));
  const pr = r.instrumentId ? peers?.get(r.instrumentId) : undefined;
  if (pr) facts.push(`#${pr} most-won by comparable companies`);
  const verdict = r.instrumentId ? verdictLine(assessments?.get(r.instrumentId)) : "";
  return [
    `[${i}] ${title ?? oneLine(r.instrument, ROW_TITLE_CHARS)}`,
    `     ${facts.join(" · ")}`,
    verdict ? `     ${verdict}` : "",
    // Who else on THIS menu is the same notified regime. See `schemeSiblings`:
    // a fact about a pair, printed only where the pair is in front of the
    // reader, and never a rule about which of them to take.
    siblings ? `     ${siblings}` : "",
    // What the scheme itself says it funds — the single line that separates
    // two siblings sharing a descriptor. Two EDF rows both render as
    // "Grants · mostly defence & security"; their own pages say "stops before
    // anything is built" and "turns an existing design into hardware".
    //
    // Read-safe on the request path and tested across the whole recall set: a
    // statement of scope with no beneficiary, award or project title in it.
    // Distinct from `instrument_profiles.profile_text`, which carries real
    // winning project titles and is not reachable from here.
    //
    // ── WHAT THE STATE SAID THIS SCHEME MAY PAY FOR ──────────────────────
    // The GBER article the scheme was NOTIFIED under, as words: "industrial
    // research, experimental development (Art. 25(2)(b), Art. 25(2)(c))".
    // Measured live (`scripts/_wsgv_rowfields.ts`): 421 of 1,078 instruments
    // carry one (39.1%), taking 127 distinct values.
    //
    // A DIFFERENT QUESTION FROM THE TWO LINES BELOW, which is why it is its own
    // line and not folded into either. `funds:` is the body's own prose about
    // what it pays for and `who may apply:` is its prose about who may ask;
    // this is neither prose nor the body's — it is the legal envelope the
    // Commission registered, and it is the same claim for every scheme citing
    // that article. A founder who needs experimental development funded can
    // read a scheme notified only for feasibility studies and stop.
    //
    // WHAT IT IS NOT. It has zero variance inside a sibling group, and that is
    // measured rather than assumed: of the 34 notified schemes holding more
    // than one leaf, the number where the registered purpose differs between
    // leaves is ZERO. So it cannot separate siblings and nothing here pretends
    // it can — that is what the line below this one is for. It separates
    // ACROSS regimes,
    // which is the cut the descriptor and the two sentences below all make
    // badly, and it is the only field on the row that is statutory rather than
    // measured or written by the grantor.
    //
    // IT LOST AS A SCORER AND THAT IS NOT THIS. `objectiveScorer` multiplies
    // rows by whether their registered use of funds matches the founder's, and
    // it was measured at zero — see the header there for why (coverage is not
    // random: everything carrying an objective is a national scheme, so the
    // boost became a channel prior). A number that cannot rank a menu is a
    // different thing from a fact a reader cannot obtain elsewhere.
    //
    // LEAK: a NOTIFICATION fact, not award history. `emit_instrument_objectives
    // .py` reads `satr_staging.objectives_text` per SA number — the text the
    // Commission registered before a single award was made — and maps the
    // article number through EU law (Reg. 651/2014), naming no fund, body or
    // country. It is constant across every award the scheme has ever made, so
    // the beneficiary-swap test in `check_answer_not_reachable.ts` leaves it
    // unchanged and it is not in the events pass's derived set at all.
    //
    // Budgeted here rather than at construction because nothing else renders
    // it: it is a short composed phrase, and the cap is a guard against an
    // article list, not a sentence cut.
    r.registeredPurpose
      ? `     registered to fund: ${oneLine(r.registeredPurpose, REGISTERED_PURPOSE_CHARS)}` : "",
    // Already budgeted by `fundsSentence` on the row (180 chars, whole
    // sentences). Not re-cut here: one budget, one place.
    r.description ? `     funds: ${r.description}` : "",
    // ── AND WHO THE SCHEME SAYS MAY APPLY ────────────────────────────────
    // A SEPARATE LABELLED LINE, deliberately, and not folded into `funds:`.
    // The two answer different questions -- what the money is for, and who it
    // is open to -- and a row that runs them together makes the reader work
    // out which half of a sentence is which. A prompt that cannot say which is
    // which has spent the characters and kept none of the meaning.
    //
    // What it is worth, measured on the real menu (`_wsfg_silence.ts`): before
    // this line, one founder moved across fourteen markets read 252 rows of
    // which 56 carried no sentence from the fund at all -- Czechia 17 of 18,
    // Estonia 15 of 18, Norway 9 of 18, against zero in Germany and France.
    // A row with nothing on it can only be chosen by its position, which is
    // the empirical ranker's answer restated.
    //
    // Read-safe by the argument in corpus.ts and tested by the same probes as
    // `description`: a statement of what the fund DEMANDS, from the fund's own
    // page, with no beneficiary, award or project title in it. It is also the
    // column `check_gate_pertinence.ts` judges value by value, so a text that
    // names an institution instead of a condition fails the build.
    //
    // Already budgeted by `fundsSentence` at DEMANDS_SENTENCE_CHARS on the
    // row. Not re-cut here: one budget, one place.
    r.eligibilityText ? `     who may apply: ${r.eligibilityText}` : "",
    reqs.length ? `     demands: ${reqs.join(" / ")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * ── SIX DISTINCT INDICES IS NOT SIX DISTINCT OPTIONS (wsDY) ────────────────
 *
 * SELECT-8 says it in the contract the selector already reads: "Several
 * variants of one regime is one option shown several times, and a founder who
 * fails that regime is left with nothing." The USER prompt then asked for
 * "exactly N DISTINCT index numbers" -- and two leaves of one programme satisfy
 * that perfectly.
 *
 * Measured on the twelve bench companies, twice, one lever apart: at effort
 * `low` four of twelve spent two of six seats on a sibling pair (ZIM and ZIM,
 * Ettevotja rakendusuuringute toetus 2023 and 2024, DEI+ and DEI+); at effort
 * `high` Neura Robotics spent THREE of its six on Innovation Fund SSP, MSP and
 * Battery. Thinking did not fix it, which is what a missing instruction rather
 * than a missing judgement looks like.
 *
 * ── WHY THIS IS SAID AND NOT COMPUTED ─────────────────────────────────────
 * The obvious implementation is to group the menu by `channel` and print the
 * groups. It was written, run against all twelve pools, and thrown away,
 * because `channel` is where the DATA comes from and not what the founder
 * applies to. It puts all eighteen of Aleph Alpha's rows in one bucket, and it
 * puts Horizon EU CL1 and CL4 in one bucket -- a health cluster and a
 * technology-sovereignty cluster, which are two real options with two real
 * calls. A prompt line telling the model to pick at most one of those suppresses
 * a fund the founder would otherwise see, which is the wsCG2 defect exactly:
 * collapsing doors of one scheme recovers nothing and costs real routes.
 *
 * Nor is a title-prefix rule available. "Innovation Fund SSP / MSP / Battery"
 * are three lots of one decision and "Horizon EU CL1 / CL3 / CL4" are three
 * different ones, and no prefix separates them. A key that cannot tell those
 * apart is a register of the collisions we happen to have seen.
 *
 * So the prompt states the TEST instead, and the model applies it to the pair
 * in front of it -- which is the one thing on this page that can. The test is
 * the founder's: would a company turned down by one of these be turned down by
 * the other?
 *
 * ── WHAT IS MEASURED, AND WHY IT IS A FLOOR ───────────────────────────────
 * Two picks rendering under the SAME TITLE are one option beyond argument, and
 * that is decidable from the menu with no key at all. It is a strict LOWER
 * BOUND on the defect: it catches ZIM/ZIM and DEI+/DEI+ and misses Innovation
 * Fund SSP/MSP. Reported as a floor rather than as the number, because the
 * alternative is a count that flatters itself.
 *
 * Nothing is deduplicated in code. Choosing WHICH sibling survives is a product
 * decision and `nameCollision.ts` holds the precedent for it: a display rule may
 * not delete from the universe, so a loser demotes rather than disappears.
 */
export function sameTitlePickCount(rows: InstrumentRow[], picks: number[]): number {
  const seen = new Set<string>();
  let dup = 0;
  for (const i of picks) {
    const t = oneLine(rows[i]?.instrument ?? "").toLowerCase();
    if (!t) continue;
    if (seen.has(t)) dup++; else seen.add(t);
  }
  return dup;
}

export interface SelectContext {
  /**
   * ── THE COMPANY'S OWN NAME. RESTORED, NOT ADDED (wsGS) ────────────────
   *
   * `git log -S "ctx.company"` returns exactly one commit — 7ec6a0c8, the one
   * that ADDED it, with the reasoning and the measurement in the same diff. No
   * commit, comment, test or check anywhere in the tree records a decision to
   * take it out. wsDL then moved the production seam from `computeVerdict` to
   * `agentSelectMemoPool` and rewrote this context around the memo's request
   * object, and the field did not survive the move. That is a deletion by
   * omission, and it is the class of change this repo pays for most.
   *
   * WHY IT WAS PUT THERE. Measured on 120 replayed founders
   * (`findings/adviser_design.md`, `scripts/_wsdf_dump.ts`): the founder half
   * of the prompt is 658 characters against a 16,036-character whole, and
   * 40 of the 120 receive a brief BYTE-IDENTICAL to another founder's once the
   * fence nonce is removed. Same country, same sector, same pinned intake, and
   * the same per-sector template description. One in three founders is, to the
   * model, the same company — and a model cannot pick different funds for
   * founders it cannot tell apart.
   *
   * The name is the first thing a real founder types and it fixes most of those
   * collisions: "Lailaps Films GmbH" makes films, "BODENS KOMMUN" is a
   * municipality, "FINNISH METEOROLOGICAL INSTITUTE" is a state research body.
   * None of that is anywhere else in the prompt.
   *
   * STATED HONESTLY: that finding also says the collisions are "very likely an
   * artifact of the harness, not of the product" — those descriptions were
   * de-leaked, and stripping the answer out stripped the substance with it. So
   * the 40/120 is what the name buys THE MEASUREMENT, which is the surface
   * every number in this repo is read off. What it buys a real founder is
   * smaller and is not zero.
   *
   * LEAK, measured rather than asserted, in that same commit. The risk is aid
   * fixed to a named beneficiary, which would put the company itself on a
   * candidate row. Over 87 gradable cases, the number of times a distinctive
   * token of the founder's name lands on the row of the fund they actually won
   * AND on no other row is TWO, and both are substring coincidences of
   * nationality rather than identity: "finnish" inside "Business Finland",
   * "tekniska" inside "flygtekniska". Zero name the company. Rows that DO name
   * a beneficiary are aid with `routeStatus = "none"` and are never
   * publishable, so they cannot reach this list at all.
   *
   * AND THE NAME IS ALREADY IN THIS BRIEF'S OTHER MODEL CALL. `synthesize` has
   * sent `Founder's company: ${req.company}` to the writer throughout
   * (pipeline.ts). A leak argument against showing the name to the stage that
   * ORDERS the rows would have to explain why the stage that WRITES them may
   * see it — and `ctx.description` beside it is fenced founder prose, which is
   * far more identifying than a name.
   *
   * UNTRUSTED. In production this is a text field a founder types, so it is
   * declawed like the description — a company may not be called "ignore your
   * instructions". Clipped to a name's length, because the only thing that may
   * arrive here is an identity.
   */
  company?: string;
  country?: string;
  sector?: string;
  /** The founder's own free text. UNTRUSTED — fenced, never interpolated raw. */
  description?: string;
  /** What the founder answered on the intake, already rendered as short
   *  `label: value` lines by the caller. Trusted: these are our own option
   *  labels from the vocabulary contract, not free text. */
  answers?: string[];
  /** What is NOT answered among the fields that provably rank. Rendered as one
   *  honest line rather than as a column of empty labels. */
  unanswered?: string[];
  /** Model-free, per fund per founder: `assessAll`'s read of this founder's
   *  answers against each candidate's own encoded rules. */
  assessments?: Map<string, InstrumentAssessment>;
  /**
   * ── THE OTHER HALF OF THE SCREEN, WHICH NEVER REACHED THIS STAGE (wsEN) ──
   *
   * Round two has two halves and only one of them was here. `answers` above
   * carries the fixed-enum half: our own option values, one short line each.
   * The PROSE half — the project questions, whose whole reason for existing is
   * that a twelve-field vocabulary cannot express what a company builds — was
   * assembled by the pipeline, handed to the writer, and dropped on the floor
   * before the stage that CHOOSES saw any of it.
   *
   * What is lost by that is not a nuance. A `ProjectAnswer` carries the fund
   * whose requirement prompted the question, that fund's gate, and the
   * requirement VERBATIM. So the founder has already been asked, in their own
   * words, about the exact condition a candidate imposes, and answered — and
   * the model ranking that candidate was shown neither the question nor the
   * answer.
   *
   * UNTRUSTED. `answer` is founder prose, exactly as `description` is, and it
   * is fenced for the same reason. `question` and `quote` are ours and the
   * fund's respectively, but they ride inside the same block: one fence around
   * the whole exchange is one thing for a reader to trust, where a fence per
   * field would invite the next author to leave one off.
   */
  projectAnswers?: ProjectAnswer[];
}

/** Is this value an answer, or the absence of one? An empty array is
 *  unanswered everywhere in this product — see EligibilityAnswers on why
 *  `["none"]` and `[]` must never read the same. */
const answered = (v: unknown): boolean =>
  v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

/**
 * The founder's intake, as short trusted lines — EVERY field they answered.
 *
 * ── What this replaced, and the arithmetic that condemned it ──────────────
 * A fixed list of fifteen `say(...)` calls. Run from `computeVerdict` it was
 * worse than it looks: the adaptive round had not happened yet, so eight of
 * the fifteen were structurally empty at that moment, three more can never be
 * non-empty at all (`FIELD_REACH` declares `foundedYear` and
 * `activityCountries` unreachable and `organisationType` staged), and two
 * fields ANSWER_USE declares `ranks: true` — `sector` and `entityCountries` —
 * were not on the list.
 *
 * So the rule is now a property rather than a register: say every field the
 * founder answered, in the words `ANSWER_LABEL` gives, ordered so the six
 * fields with `ranks: true` come first because those are the ones the
 * deterministic ranker itself is built from. Nothing is enumerated here, so a
 * field added to the intake tomorrow is carried with no edit to this file —
 * and the compiler will already have demanded a label for it.
 *
 * These are OUR option values from the vocabulary contract, not founder prose,
 * so they are trusted and need no fencing.
 */
export function intakeAnswerLines(a: EligibilityAnswers | undefined): string[] {
  if (!a) return [];
  const keys = Object.keys(ANSWER_LABEL) as (keyof EligibilityAnswers)[];
  const rank = (k: keyof EligibilityAnswers) => (ANSWER_USE[k].ranks ? 0 : 1);
  return keys
    .filter((k) => answered((a as Record<string, unknown>)[k]))
    // Stable within each group: `Object.keys` order is the declaration order
    // of ANSWER_LABEL, which is deliberately ranks-first already. The sort
    // guarantees it rather than relying on someone keeping the table tidy.
    .map((k, i) => ({ k, i }))
    .sort((x, y) => rank(x.k) - rank(y.k) || x.i - y.i)
    .map(({ k }) => {
      const v = (a as Record<string, unknown>)[k];
      const say = FIELD_VALUE_DOMAIN[k] === "region" ? namedRegion : String;
      return `${ANSWER_LABEL[k]}: ${(Array.isArray(v) ? v : [v]).map(say).join(", ")}`;
    });
}

/**
 * A NUTS id AND the place it names — `DE7 (Hessen)`.
 *
 * We asked the founder for their region and stored the answer as the code the
 * question offered; the candidate row describes the same place in words,
 * because `fundDescriptor` names an instrument's reach from
 * `regionNameFor`. So the founder's answer and the fund's row never used the
 * same token, and the model had no way to see that they matched. Measured on
 * wsDR's nine: Focused Energy answered `region: DE7`, their won fund's row said
 * "Hessen", and wsDV classed the miss as "the connecting fact is absent from
 * the intake" — it was present twice, in two vocabularies.
 *
 * Keyed on `FIELD_VALUE_DOMAIN` rather than on the field name, so a second
 * region-valued field added to the intake tomorrow is rendered the same way
 * with no edit here. The code is kept beside the name because it is the one an
 * encoded gate is written against, and dropping it would trade this defect for
 * its mirror image.
 */
const namedRegion = (v: unknown): string => {
  const id = String(v);
  const name = regionNameFor(id);
  return name && name.toLowerCase() !== id.toLowerCase() ? `${id} (${name})` : id;
};

/**
 * What the founder has NOT told us, among the fields that provably rank.
 *
 * A prompt that lists an empty label teaches the model that the founder
 * declined to answer, which is a different and usually false claim: on the
 * fast path most of these fields had not been ASKED yet. Naming the gap once,
 * in one line, is the honest version — and it is scoped to the six
 * `ranks: true` fields because those are the ones whose absence demonstrably
 * changes an ordering.
 */
export function unansweredRankingFields(a: EligibilityAnswers | undefined): string[] {
  const keys = Object.keys(ANSWER_LABEL) as (keyof EligibilityAnswers)[];
  return keys
    .filter((k) => ANSWER_USE[k].ranks)
    .filter((k) => !answered((a as Record<string, unknown> | undefined)?.[k]))
    .map((k) => ANSWER_LABEL[k]);
}

const textOf = (m: Anthropic.Message): string => m.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text).join("\n");

/** The reasoning blocks, for the transcript only. Nothing downstream reads
 *  them: the arm's output is the `picks` array and always has been. */
const thinkingOf = (m: Anthropic.Message): string => m.content
  .filter((b): b is Anthropic.ThinkingBlock => b.type === "thinking")
  .map((b) => b.thinking).join("\n");

/** Pull the one JSON object out of a reply that may be fenced or prefaced.
 *  Returns null rather than throwing, so the caller falls back to the shipped
 *  order instead of degrading into a short table. */
function parseJson<T>(raw: string): T | null {
  for (const src of [raw.replace(/```(?:json)?/gi, ""), raw]) {
    const s = src.indexOf("{"), e = src.lastIndexOf("}");
    if (s < 0 || e <= s) continue;
    try { return JSON.parse(src.slice(s, e + 1)) as T; } catch { /* keep trying */ }
    let depth = 0;
    for (let i = s; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        try { return JSON.parse(src.slice(s, i + 1)) as T; } catch { /* give up */ }
        break;
      }
    }
  }
  return null;
}

/** The selector's system prompt, assembled from `contracts/` like every
 *  other stage. Memoised because it is byte-identical on every request and
 *  reading nine markdown files per brief is a cost with no benefit; the
 *  cache key is the process, exactly as for the writer. */
let systemMemo: string | null = null;
export const selectorSystemPrompt = (): string =>
  (systemMemo ??= assembleInstructions("selector"));

// `baseRateSentence` moved to `./poolRecall` (wsGS), the leaf module that owns
// the curve it reads. It is a pure function of that artifact and of the menu
// length, it reaches nothing else, and `check_prompt_rates.ts` has to call it to
// assert the rate is still delivered -- which through this module would drag the
// Anthropic client and the corpus layer in behind one sentence. Re-exported at
// the top of this file so `_wsdr_seam.ts` is unchanged.

/**
 * EXPORTED FOR DIAGNOSTICS, and for one reason: what a model is told is a thing
 * this repo has to be able to LOOK AT for free, before spending on a run.
 * wsDJ found nine defects in exactly this surface, and every one of them was
 * found by reading the real prompt rather than a reconstruction of it. A
 * diagnostic that rebuilds the prompt prices and grades a different arm.
 *
 * Pure, and makes no call. `scripts/_wsdl_menu.ts` is its only consumer.
 */
export function buildPrompt(
  head: InstrumentRow[], ctx: SelectContext, keep: number, want: number,
  peers?: Map<string, number>, evidence?: Map<string, string[]>,
): string {
  const reqs = distinctive(head);
  const sibling = schemeSiblings(head);
  // ── THE TITLES ARE CUT AGAINST EACH OTHER, NOT ONE AT A TIME (wsID) ──────
  // `oneLine` per row takes the first 120 characters, and on the legal titles
  // this corpus is full of that is the part two funds SHARE. Four Catalan loan
  // lines notified under four different aid regulations reached this menu as
  // one string four times; so did a Basque programme's "Área 1" and "Área 2".
  // The model was not choosing badly between them, it was choosing between
  // identical strings. Same budget, spent on the part that differs.
  const titles = cutTitles(head.map((r) => r.instrument), ROW_TITLE_CHARS);
  const menu = head.map((r, i) => {
    const row = renderRow(i, r, reqs(r), sibling(i), peers, ctx.assessments, titles[i]);
    const ev = r.instrumentId ? evidence?.get(r.instrumentId) : undefined;
    return ev?.length
      ? `${row}\n     you asked about this one — its own rules say: ${ev.map((e) => oneLine(e, 200)).join(" | ")}`
      : row;
  }).join("\n");
  // Answers, then ONE line for the gap. A column of empty labels reads as
  // "they declined to say"; a named gap reads as what it is.
  const told = [
    ...(ctx.answers ?? []).map((a) => `  ${a}`),
    ...(ctx.unanswered?.length
      ? [`  (not answered, so judge without it: ${ctx.unanswered.join("; ")})`] : []),
  ];
  const answeredBlock = told.length ? told.join("\n") : "  (they have not answered the intake yet)";
  // The description is DATA. `fence` declaws prompt-control sequences and wraps
  // the block in a per-request nonce so it cannot be closed by typing the
  // delimiter, and says in the prompt what the block is for.
  const desc = ctx.description
    ? fence("description", ctx.description)
    : "(no description on file)";
  // The prose half of round two. Question, then answer, then the fund and the
  // verbatim requirement that motivated the question — because an answer whose
  // provenance is stripped is a sentence about the company, while an answer
  // beside the rule it was asked against is evidence about a candidate.
  //
  // ONE fence around the whole exchange (see SelectContext.projectAnswers). The
  // budget is deliberate and small: these are short answers, and this stage has
  // already demonstrated that bulk text buries the fact that separates.
  //
  // NOT EVERY ANSWER HAS A REQUIREMENT BEHIND IT, and the header above this
  // block says so. `projectAnswers` also carries the COMMERCIAL half —
  // `adaptiveRound.ts` writes those with `instrumentId: ""` and `quote: ""`
  // because they are about how the company sells, not about any fund's rule.
  // They are passed rather than filtered out: how a company makes money is
  // exactly what decides which instrument suits it. What is not available is
  // telling the model they were all prompted by a quoted requirement, which is
  // what a single unconditional sentence over this block would do.
  const projectBlock = ctx.projectAnswers?.length
    ? fence("round-two answers", ctx.projectAnswers.map((a) => [
      `Q: ${oneLine(a.question, 200)}`,
      `A: ${oneLine(a.answer, 300)}`,
      a.quote
        ? `   (asked because ${oneLine(a.instrumentName || a.instrumentId, 70)} requires: `
          + `"${oneLine(a.quote, 200)}")`
        : "",
    ].filter(Boolean).join("\n")).join("\n\n"))
    : "";
  // A NAME, not a paragraph: declawed and clipped, because the only thing that
  // may arrive here is an identity. It is not `fence`d — a fence declares a
  // block of founder PROSE and this is one line of it; declawing is the part
  // that matters, and the label says what it is.
  const named = ctx.company ? oneLine(declaw(ctx.company).text, 90) : "";
  const adviser = AGENT_SELECT_ARM === "adviser";
  // THE ONE LEVER wsDY LEFT READY. See SELECT_COUNT_MODE: under `atMost` the
  // number is a ceiling, the seats declined keep the empirical ranker's own
  // order, and the model is told so -- because a model that is not told what
  // happens to a seat it declines will assume the founder simply sees less.
  const atMost = SELECT_COUNT_MODE === "atMost";
  const countAsk = atMost
    ? `Between 1 and ${want} DISTINCT index numbers from the list above`
    : `Exactly ${want} DISTINCT index numbers from the list above`;
  // The template is the strongest instruction on the page: six zeros ARE a
  // request for six however the sentence above them is worded. Under `atMost`
  // it shows the shape and not the count, and the ceiling is carried by the
  // sentence -- which is the only place it can be carried without anchoring.
  const shape = atMost ? "0" : Array.from({ length: want }, () => "0").join(",");
  const countLicence = atMost
    ? `\n\nYou have ${want} places and you do not have to fill them. Name only the schemes
you would actually tell this founder to apply to. A place you do not use is not
wasted and is not left empty: it keeps the empirical ranker's own choice, which
is what ships without you. So naming a scheme you have just judged wrong is
strictly worse than naming fewer. If two of these deserve a place, name two.`
    : "";
  // wsIB, off by default. One legend line for a label the legend never
  // explained. See SECTOR_NOTE above for what it is and what would falsify it.
  const sectorNote = SECTOR_NOTE === "explain"
    ? `
  * where a row says "mostly X", X is simply the largest single sector in what
    that scheme has already paid for — usually under half of it. It is a
    description of the scheme's past recipients, not a restriction on who may
    apply, and a scheme is not ruled out by it`
    : "";
  const framing = keep > 0
    ? `An empirical ranker has already claimed the top ${keep} place${keep === 1 ? "" : "s"} on this
company's shortlist, and those are settled -- they are not shown below and they
are not yours to change. Your job is the ${want} remaining place${want === 1 ? "" : "s"}, chosen from the
schemes the ranker placed BEHIND them.

That is the part the ranker is worst at.${baseRateSentence(head.length)} Find the ${want} that
genuinely fit this company better than their position suggests.`
    : `The ${head.length} candidates below are already ordered by an empirical ranker built from
real award pairs, best first. That order is informative and it is not
authoritative.${baseRateSentence(head.length)}`;

  // ── THE CLOSING BLOCK: the prior, the unsure channel, and the template ────
  //
  // Three independent facts, and they were nested as one ternary inside
  // another, which is what made `UNSURE_MODE=tool` unreachable except under
  // `adviser` (wsEN). A mode no default can reach is dead surface, and this
  // repo's own rule is that dead surface is deleted or made reachable. Made
  // reachable, because the measurement it exists for is still open: `declare`
  // fired 0 times in 24 paid calls, and the stated hypothesis is that the shape
  // of the hook is the reason rather than the depth of the model. Testing that
  // hypothesis requires a hook that can be turned on by itself.
  //
  // WHY `tool` IS ORTHOGONAL AND `declare` IS NOT. `tool` is opt-in: no
  // default reaches it, so detaching it from `adviser` changes no shipped
  // behaviour and no measured arm. `declare` is the DEFAULT of `UNSURE_MODE`,
  // so detaching it would put the unsure template into the `rows` and `assist`
  // prompts, which are measured arms, without anybody setting anything. That is
  // a silent change to a control and it is exactly what this file's levers
  // exist to prevent.
  const prior = adviser
    ? `Some rows carry "#n most-won by comparable companies". That is what companies
in this company's own country and sector have actually won, counted over real
awards. It is the strongest single piece of evidence on the page and it is not
a verdict: it says what worked for companies like this one, not what fits THIS
one. Weigh it, and overrule it where this company plainly fails what the fund
demands or needs a cheque of a different order.

`
    : "";
  /** One sentence, three closings. `lead` differs only because the tool path
   *  has a turn to finish first. */
  const replyWith = (lead: string) => `${lead} ONLY this JSON, no preamble and no code fence.
${countAsk}, best first, naming DIFFERENT PROGRAMMES rather than merely
different numbers`;
  let tail: string;
  if (UNSURE_MODE === "tool") {
    tail = `${prior}You have a tool, \`lookup_requirements\`, that returns a fund's own eligibility
rules in its own words. Use it whenever a rule you cannot see would change your
answer — most usefully where two candidates look alike, or where a row's summary
does not tell you whether this company qualifies. You may call it once, for up
to ${LOOKUP_MAX} candidates at a time. Choosing not to call it is a fine answer when the
rows already tell you what you need.

When you are done, ${replyWith("reply with")}:
{"picks":[${shape}]}`;
  } else if (adviser && UNSURE_MODE === "declare") {
    // ── THE TEMPLATE IS THE INSTRUCTION, AND IT SAID "NOTHING" ─────────────
    // This block used to close with `{"picks":[...],"unsure":[]}` and, four
    // lines above it, "if you already know, leave it empty". The file argues a
    // few lines up that the template is the strongest instruction on the page
    // — six zeros ARE a request for six however the sentence above them is
    // worded — and then handed the model a pre-filled empty answer for this
    // field and a sentence licensing it. It came back empty 24 times out of 24,
    // at two effort levels.
    //
    // So the template now shows the SHAPE and not the answer, exactly as the
    // `atMost` picks template does, and the sentence that pre-answered it is
    // gone. Declining is still available and still legitimate — it is stated as
    // a choice rather than as the default.
    //
    // EXPECT NOTHING FROM THIS. At effort `high` the model reasoned explicitly
    // about eligibility, named blockers in its own thinking, and still declared
    // nothing; that is the measurement, and one prompt edit does not overturn
    // it. It is changed because it is free and because it was wrong.
    tail = `${prior}IF TWO CANDIDATES LOOK THE SAME TO YOU, SAY SO INSTEAD OF GUESSING. List their
index numbers in "unsure" and you will be shown those funds' own eligibility
rules and asked again. Name at most ${LOOKUP_MAX}, and only where the extra rules could
actually change your answer.

${replyWith("Reply with")}, plus the index numbers of any you cannot separate:
{"picks":[${shape}],"unsure":[0]}`;
  } else {
    tail = `${prior}${replyWith("Reply with")}:
{"picks":[${shape}]}`;
  }
  return `Choose the ${want} public funding schemes this company should actually apply to.

THE COMPANY${named ? `
  name: ${named}   (their own words for themselves -- read it, it is often the
        most specific thing you will be told about what they do)` : ""}
  country: ${ctx.country ?? "unknown"}
  sector: ${ctx.sector ?? "unknown"}

WHAT THEY TOLD US
${answeredBlock}

WHAT THEY SAY THEY DO
${desc}
${projectBlock ? `
WHAT THEY ANSWERED ON THE FOLLOW-UP SCREEN, IN THEIR OWN WORDS
Where a candidate's own requirement prompted the question, that requirement is
quoted under the answer and the candidate is named, so you can see which
candidate the answer bears on. The rest were asked about the company and how it
sells, and carry no requirement because none prompted them.
${projectBlock}
` : ""}
HOW TO READ THE LIST
${framing}

Each row carries only what the scheme demands, what it has really done, and our
own rule-by-rule read of this company's answers against it:
  * the scheme's own title — usually the single most specific thing on the page
  * the delivery body, the country, and the kind of capital
  * the median cheque it has actually written, and over how many real awards
  * the year it last paid out
  * a qualification line: what its OWN encoded rules make of the answers above.
    "nothing we can check rules them out" is not approval — most schemes have
    far more rules than we hold — and "no encoded rule could be evaluated" is
    ignorance, not a fault. A named obstacle IS a fault, and a real one.
  * any requirement that is specific to it rather than shared with the whole list${sectorNote}

Judge fit on substance:
  * a scheme whose typical cheque is an order of magnitude away from what this
    company needs is the wrong scheme however well the rest fits
  * a scheme whose stated demands this company plainly fails is the wrong scheme
    even if it is near the top
${ORDER_CLAIM_PROSE[ORDER_CLAIM]}
  * a scheme that stopped paying out years ago is the wrong scheme
  * where two are equally good, prefer the one whose title is specific to what
    this company does over the one whose title is generic
  * you may reach well down the list — a better-matching scheme at rank 30 beats
    a vaguely-matching one at rank 2 — but do not reach for a famous programme
    because it is famous
  * give them ${want} REAL ALTERNATIVES. Two rows can be one option: the same
    programme in a different year, a different lot of one scheme, the same
    scheme under a second title. The test is the founder's — would a company
    turned down by one of them be turned down by the other? If yes, they are one
    option, spend one place on the better of the two, and use the place you saved
    on something a different body decides. Two rows of different clusters,
    different calls or different bodies are two options and both may be chosen
${countLicence}

CANDIDATES
${menu}

${tail}`;
}

/**
 * Reorder the ranked candidate rows by asking a model to choose.
 *
 * PURE REORDER: the returned array is a permutation of the input. The chosen
 * rows move to the front in the model's own order and every other row keeps
 * its shipped relative position behind them. Nothing is added, removed, or
 * re-gated, so `candidateInstrumentIds` is unchanged as a SET and the pool
 * metric cannot move.
 *
 * Returns the input untouched on every failure path.
 */
export async function agentSelectRows(
  rows: InstrumentRow[], ctx: SelectContext,
): Promise<InstrumentRow[]> {
  // Cleared FIRST, so a stale transcript from the previous founder can never be
  // read as this one's.
  //
  // THE OFF ARM IS TRACED TOO, and that is the point rather than a courtesy.
  // The two arms necessarily run in two processes -- `AGENT_SELECT` is read
  // once at module scope so a typo cannot read as "off" -- and the pipeline
  // makes a live web-search call upstream of the pool. So the control is only
  // a control if the pool that reached the seam was the SAME pool, and the
  // only way to state that rather than assume it is to record the off arm's
  // pool at the same seam. A comparison whose control cannot be checked is the
  // failure this whole workstream exists to stop repeating.
  if (tracing) traceMemo = seedTrace(rows);
  // ── THE DECISION IS CLEARED ON ENTRY, FOR THE SAME REASON THE TRACE IS ───
  // `lastDecision` is module state and a serverless container is warm across
  // requests, exactly like `traceMemo` one line above -- but its reset sat
  // BELOW four of the exits `leave` names: `armOff`, `reversed`,
  // `poolNotLongerThanCount`, `menuNotLongerThanWant`. So with the arm ON, a
  // founder whose pool is no longer than SELECT_COUNT -- which wsEN counts
  // because it happens to a third of the founders in a run -- left the previous
  // founder's picks standing in a global.
  //
  // That was inert while nothing consumed the decision, then not inert at all
  // while `orderMemoCandidates` had a `pinned` argument reading it — one
  // founder's chosen funds promoted past the writer cap in another founder's
  // brief. `pinned` is gone (wsGB), so no brief reads this again; what reads it
  // is `scripts/_wsdq_run.ts`, and a diagnostic reporting the PREVIOUS
  // founder's picks under this one's name is the same defect with a smaller
  // blast radius. The reset stays for that reason and not for the old one.
  //
  // Deliberately NOT inside `leave()`: `leave` is also the successful exit
  // (`chose`), and clearing there would erase the decision the caller is about
  // to read. Entry is the only point that covers every exit without erasing the
  // one result worth keeping.
  lastDecision = null;
  lastUnsureIds = [];
  if (AGENT_SELECT_ARM === "off") return leave("armOff", rows);
  // BEFORE the SELECT_COUNT guard, deliberately. That guard exists because a
  // model cannot usefully choose six from six; a reversal is defined on any
  // length, and a diagnostic that silently declined to permute a short pool
  // would report "no difference" for a reason that has nothing to do with the
  // seam it is testing.
  if (AGENT_SELECT_ARM === "reverse") return leave("reversed", reverseNonsense(rows));
  // COUNTED, not silent (wsEN). A pool no longer than the number of seats is a
  // real and ordinary founder — there is nothing for a model to choose between
  // — and it publishes the shipped order. Reported, because a run that hits it
  // on a third of its founders and says "no difference" is describing its own
  // control.
  if (rows.length <= SELECT_COUNT) return leave("poolNotLongerThanCount", rows);
  // NOTE: no by-name check for ANTHROPIC_API_KEY here, deliberately.
  //
  // It was redundant -- a missing key makes the lazy client throw and the catch
  // below returns the shipped order, which is exactly what the guard did -- and
  // it was not free: check_env_loader tracks credential reach TRANSITIVELY, so
  // one named read in a module pipeline.ts imports made thirty harnesses that
  // never make this call fail for not declaring a key they do not need. The
  // fallback is the contract; it does not need a second spelling.

  const head = rows.slice(0, Math.min(SELECT_DEPTH, rows.length));
  // `assist` freezes the shipped leaders and offers the model only what sits
  // behind them. The frozen rows are removed from the menu entirely rather
  // than shown and forbidden: a prompt-level "you may not choose these" was
  // measured to leak in this repo before (fundSelection.ts kept 70% of gate
  // 1's five when told to keep all of them), and a constraint enforced in code
  // cannot be argued with.
  const keep = AGENT_SELECT_ARM === "assist" ? Math.min(SELECT_KEEP, rows.length) : 0;
  const menuRows = AGENT_SELECT_ARM === "assist" ? head.slice(keep) : head;
  const want = Math.max(1, SELECT_COUNT - keep);
  // Same as above and a distinct fact: under `assist` the frozen seats are cut
  // off the menu first, so a pool that WAS long enough can leave a menu that is
  // not. Counted separately because the fix is different — one is the founder's
  // pool, the other is `SELECT_KEEP`.
  if (menuRows.length <= want) return leave("menuNotLongerThanWant", rows);
  // `dry` prices the ADVISER: it builds the identical prompt through the
  // identical code path and runs the identical retrieval, and simply never
  // calls Anthropic. Pricing a reconstruction of a prompt rather than the
  // prompt itself is how a cost estimate quietly describes a different arm.
  // The transcript starts here, so a call that falls back still leaves a record
  // of what it was asked. A fallback with no trace is the one outcome that
  // teaches nothing.
  if (traceMemo) traceMemo.menu = menuRows.map((r) => r.instrumentId ?? r.channel);
  const dry = AGENT_SELECT_ARM === "dry";
  const adviser = AGENT_SELECT_ARM === "adviser" || dry;
  const peers = adviser ? peerRank(ctx.country, ctx.sector) : undefined;
  if (dry) {
    tally.dryChars.push(buildPrompt(menuRows, ctx, keep, want, peers).length);
    // Round two's real weight, measured rather than guessed: the same lookup
    // the adviser would make, against eligibility_embeddings only. Standing in
    // for the model's own "unsure" list with the leading candidates is the
    // conservative choice -- it fires retrieval on every case, where the live
    // arm fires it only when the model says it cannot tell.
    const ids = menuRows.slice(0, LOOKUP_MAX)
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    const founderText = [ctx.description ?? "", ...(ctx.answers ?? [])].join("\n").trim();
    if (ids.length && founderText) {
      const chunks = await retrieveDemands(ids, founderText);
      if (chunks.length) {
        tally.dryRetrieved++;
        tally.dryEvidenceChars.push(
          chunks.reduce((a, c) => a + Math.min(c.text.length, 200) + 40, 0));
      }
    }
    return leave("dryPriced", rows);
  }
  // ── THE ONE PLACE THIS STAGE SPENDS, AND THE ONE INTERLOCK ON IT (wsGB) ──
  //
  // A harness declares its credential contract through `requireCredentials`,
  // and a contract without ANTHROPIC_API_KEY is that harness saying it does not
  // call a model. That was free to trust while `AGENT_SELECT` defaulted to
  // `off`; it defaults to `adviser` now, so a harness declaring
  // ["DATABASE_URL", "VOYAGE_KEY"] and reaching this line would spend once per
  // founder while its own contract said otherwise. See `NO_SPEND_ENV` in
  // scripts/loadEnv.ts for the property and for why it travels through the
  // environment instead of an import.
  //
  // NOT `leave(...)`. Every other exit here returns the shipped order, and that
  // is right for a model that failed; this is a run that must not have STARTED,
  // and returning the control's order under the treatment's name is the failure
  // mode this whole module is instrumented against. It throws, in the founder
  // loop, naming the harness and the one-word fix.
  //
  // Production never sets it: `requireCredentials` is a `scripts/` function and
  // a Next.js request has not called it.
  const declaredFree = process.env.WINCENT_DECLARED_NO_ANTHROPIC;
  if (declaredFree) {
    throw new Error(
      `${declaredFree} declared a credential contract WITHOUT ANTHROPIC_API_KEY, and the `
      + `ranking seam is about to call a model: AGENT_SELECT is "${AGENT_SELECT_ARM}", which `
      + `is the default since the ranker shipped. Either declare the key, or say which free `
      + `arm you meant — AGENT_SELECT=off for the control, =dry to price the prompt, `
      + `=reverse for a permutation with no model in it.`);
  }
  tally.calls++;
  // The menu as HANDED OVER, recorded on the same line that decides to spend,
  // so the record can never again describe a lever instead of a measurement.
  tally.menuMin = Math.min(tally.menuMin, menuRows.length);
  tally.menuMax = Math.max(tally.menuMax, menuRows.length);
  try {
    const ask = async (
      evidence?: Map<string, string[]>,
      /** `tool` mode only: the turns so far, replayed. Thinking blocks are
       *  echoed back UNCHANGED, which the API requires when a conversation with
       *  thinking on is continued on the same model — reconstructing or
       *  dropping them is rejected. */
      history?: Anthropic.MessageParam[],
    ) => {
      const system = selectorSystemPrompt();
      const user = buildPrompt(menuRows, ctx, keep, want, peers, evidence);
      // Not `adviser && ...`: the tool is the one unsure channel that is opt-in
      // on every axis, so it is offered whenever it is asked for. See the
      // closing block in `buildPrompt` for why `declare` is not.
      const useTool = UNSURE_MODE === "tool";
      // Incremented HERE, on the line that builds the request, so a third round
      // added tomorrow counts itself. Every counter below this point in `ask`
      // is per-API-call and is reported over this number.
      tally.apiCalls++;
      const startedAt = Date.now();
      const r = await anthropic().messages.create({
      model: MODEL,
      ...(useTool ? { tools: [LOOKUP_TOOL] } : {}),
      // Thinking bills as OUTPUT, so max_tokens must clear the budget with
      // room for the reply or the answer is truncated into the empty-content
      // failure this arm already paid for once -- and DID pay for again at
      // effort `high` on the shipped 1,536. See MAX_TOKENS_BY_EFFORT.
      max_tokens: adviser ? MAX_TOKENS_BY_EFFORT[THINK_EFFORT] : 1024,
      // Thinking ON for the adviser and OFF everywhere else. The free arm
      // needs none — its reply is SELECT_COUNT integers — and at a small
      // max_tokens it spent the whole allowance thinking and returned an empty
      // content block on 3 of 8 cases. The adviser is weighing a prior against
      // stated requirements and is allowed the room, bounded by
      // MAX_TOKENS_BY_EFFORT above because thinking is billed at the output
      // rate. (This said "six integers", written when SELECT_COUNT was 6, and
      // "bounded by THINK_BUDGET", an identifier that exists nowhere in the
      // tree — a comment naming the constant cannot go stale when it moves.)
      // Adaptive is the only on-mode on this model; `disabled` is still valid
      // and is what the cheaper arms use. Effort, not a token count, is the
      // depth control -- see THINK_EFFORT.
      //
      // `display: "summarized"` IS THE FIX FOR THE BILLED-EMPTY THINKING, and
      // it is one field. On claude-sonnet-5 `display` defaults to "omitted":
      // the thinking block is returned, its signature is returned, and its TEXT
      // is an empty string. wsDQ recorded Nortal at 310 billed thinking tokens
      // and `THINKING (0 chars)` and read that as "no readable block arrived" —
      // the block arrived, redacted by default. Replaying that exact prompt
      // both ways is what settled it: unset -> 0 characters, "summarized" ->
      // 321. It changes nothing about what is spent or what is decided; it
      // decides only whether a run we PAID for can be read afterwards, which is
      // the difference between a measurement and an anecdote.
      ...(adviser && THINK_EFFORT !== "off"
        ? {
            thinking: { type: "adaptive" as const, display: "summarized" as const },
            output_config: { effort: THINK_EFFORT },
          }
        : { thinking: { type: "disabled" as const } }),
      // Nothing may bill untracked. recordUsage feeds the same accumulator the
      // euro ceiling in quota.ts is enforced against.
      // The stage that RANKS was the only model stage in the product with no
      // system prompt: role, framing, judging rules and output contract were
      // all one user string. It now assembles from `contracts/` through the
      // same positive per-stage routing every other stage uses, so
      // `UNROUTED_STAGES` is empty and `check_contracts` enforces it.
      system,
      messages: [{ role: "user", content: user }, ...(history ?? [])],
      }, {
        timeout: adviser ? TIMEOUT_BY_EFFORT[THINK_EFFORT] : TIMEOUT_BY_EFFORT.off,
        maxRetries: 1,
      });
      // Recorded BEFORE anything is parsed, because this is the one signal that
      // separates "the model declined to answer" from "we cut it off mid
      // thought". Both produce an empty reply and both return the shipped
      // order; only one of them is about the model.
      if (r.stop_reason === "max_tokens") tally.truncated++;
      // Recorded beside the truncation for the reason the truncation counter
      // exists: a ceiling the clock cannot reach times out instead of binding,
      // and the timeout is counted somewhere else entirely. Only calls that
      // RETURNED are timed -- one that threw never reaches this line -- so this
      // is the slowest SUCCESSFUL call, which is what has to be compared
      // against TIMEOUT_BY_EFFORT to say whether the ceiling had a chance.
      tally.slowestMs = Math.max(tally.slowestMs, Date.now() - startedAt);
      recordUsage(r.model ?? MODEL, r.usage as never);
      // Local euro tally as well, because a bench run has no AsyncLocalStorage
      // context and recordUsage is a no-op there — which is exactly the run
      // that has to report euros per brief.
      const { costOf } = await import("./cost");
      const spent = costOf(r.model ?? MODEL, r.usage as never);
      tally.eur += spent;
      // What the thinking lever actually did, per call, from the API's own
      // numbers rather than from the setting we asked for. `thoughtOn` counts
      // calls that spent ANY thinking at all: at effort `low` wsDQ found 10 of
      // 12 spent zero, so "thinking was on" and "the model thought" are
      // different claims and the tally line has to be able to tell them apart.
      const billed = (r.usage as unknown as {
        output_tokens_details?: { thinking_tokens?: number };
      }).output_tokens_details?.thinking_tokens ?? 0;
      tally.thinkingTokens += billed;
      tally.thinkingChars += thinkingOf(r).length;
      if (billed > 0) tally.thoughtOn++;
      if (traceMemo) {
        traceMemo.turns.push({
          round: evidence ? 2 : 1, system, user,
          reply: textOf(r), thinking: thinkingOf(r),
          model: r.model ?? MODEL, usage: r.usage, eur: spent,
        });
        traceMemo.eur += spent;
      }
      return r;
    };

    let res = await ask();
    let v = parseJson<{ picks: unknown; unsure?: unknown }>(textOf(res));

    // ── ROUND TWO: resolve the ambiguities the model ITSELF declared ────────
    // Retrieval fires only here, and only on the candidates it named. That is
    // both the owner's design — fetch the thing that separates two funds you
    // cannot tell apart — and the reason this arm fits its budget: looking up
    // all forty rows would cost more than the brief is allowed to and would
    // bury the separating fact in bulk text, which is precisely how the free
    // arm failed.
    // ── `tool`: the model asks, at the moment it wants to ───────────────────
    // Same retrieval, same leak boundary, same LOOKUP_MAX. The only thing that
    // changes is WHEN the model is asked to know it is unsure: `declare` wants
    // that judgement before it has looked at anything, and got it 0 times in 24
    // measured calls. Here the request arrives as a tool call mid-turn.
    //
    // Bounded to ONE round of retrieval, deliberately. An unbounded loop on a
    // stage whose whole output is SELECT_COUNT integers is a cost with no ceiling, and
    // the second call already carries everything the first one learned.
    if (UNSURE_MODE === "tool") {
      const call = res.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === "tool_use" && b.name === LOOKUP_TOOL.name);
      if (call) {
        tally.toolAsked++;
        const idx = (Array.isArray((call.input as { indices?: unknown })?.indices)
          ? (call.input as { indices: unknown[] }).indices : [])
          .filter((i): i is number => Number.isInteger(i) && (i as number) >= 0
            && (i as number) < menuRows.length)
          .slice(0, LOOKUP_MAX);
        const ids = [...new Set(idx
          .map((i) => menuRows[i].instrumentId)
          .filter((id): id is string => Boolean(id)))];
        lastUnsureIds = ids;
        if (traceMemo) traceMemo.unsure = idx;
        const founderText = [ctx.description ?? "", ...(ctx.answers ?? [])]
          .join("\n").trim();
        const chunks = ids.length ? await retrieveDemands(ids, founderText) : [];
        if (traceMemo) {
          traceMemo.retrieved = chunks.map((c) => ({ instrumentId: c.instrumentId, text: c.text }));
        }
        if (chunks.length) { tally.lookups += ids.length; tally.resolved++; }
        const byId = new Map<string, string[]>();
        for (const c of chunks) byId.set(c.instrumentId, [...(byId.get(c.instrumentId) ?? []), c.text]);
        // A lookup that found nothing still gets an answer, and an honest one.
        // Returning silence would leave the model waiting on a result that
        // never comes and invite it to invent what the rules probably say.
        const body = idx.length
          ? idx.map((i) => {
            const id = menuRows[i].instrumentId ?? "";
            const got = byId.get(id) ?? [];
            return `[${i}] ${menuRows[i].instrument}\n`
              + (got.length ? got.map((t) => `  - ${t}`).join("\n")
                : "  (no eligibility rules recorded for this one)");
          }).join("\n\n")
          : "No valid candidate index was named, so nothing was looked up.";
        const res2 = await ask(undefined, [
          // `res.content` verbatim: thinking blocks must be echoed back
          // unchanged or the API rejects the continuation.
          { role: "assistant", content: res.content },
          {
            role: "user",
            content: [{
              type: "tool_result" as const,
              tool_use_id: call.id,
              content: body,
            }],
          },
        ]);
        const v2 = parseJson<{ picks: unknown }>(textOf(res2));
        // Keep the second answer only if it is usable. A failed follow-up must
        // degrade to the first answer, never past it.
        if (Array.isArray(v2?.picks) && v2!.picks.length) { res = res2; v = v2; }
      }
    } else if (adviser && UNSURE_MODE === "declare") {
      const unsure = (Array.isArray(v?.unsure) ? v!.unsure : [])
        .filter((i): i is number => Number.isInteger(i) && (i as number) >= 0
          && (i as number) < menuRows.length)
        .slice(0, LOOKUP_MAX);
      const ids = [...new Set(unsure
        .map((i) => menuRows[i].instrumentId)
        .filter((id): id is string => Boolean(id)))];
      lastUnsureIds = ids;
      if (traceMemo) traceMemo.unsure = unsure;
      if (ids.length) {
        // The founder's side of the question. `declaw` is applied inside
        // `fence` for the prompt; here the text only ever becomes a vector, so
        // it can reach no instruction surface at all.
        const founderText = [ctx.description ?? "", ...(ctx.answers ?? [])]
          .join("\n").trim();
        const chunks = await retrieveDemands(ids, founderText);
        if (traceMemo) {
          traceMemo.retrieved = chunks.map((c) => ({ instrumentId: c.instrumentId, text: c.text }));
        }
        if (chunks.length) {
          tally.lookups += ids.length;
          tally.resolved++;
          const evidence = new Map<string, string[]>();
          for (const c of chunks) {
            evidence.set(c.instrumentId, [...(evidence.get(c.instrumentId) ?? []), c.text]);
          }
          const res2 = await ask(evidence);
          const v2 = parseJson<{ picks: unknown }>(textOf(res2));
          // Keep round two only if it produced something usable. A failed
          // second call must degrade to the first answer, never past it.
          if (Array.isArray(v2?.picks) && v2!.picks.length) { res = res2; v = v2; }
        }
      }
    }

    const raw = Array.isArray(v?.picks) ? v!.picks : [];
    const picks = [...new Set(raw.filter(
      (i): i is number => Number.isInteger(i) && (i as number) >= 0
        && (i as number) < menuRows.length))].slice(0, want);
    if (picks.length < raw.length) tally.invalidIds += raw.length - picks.length;
    // ── SELECT-1 AND SELECT-2, ON THE REPLY THAT WAS ACTUALLY GIVEN ────────
    //
    // The selector's system prompt tells the model, verbatim, that "rules
    // marked (hard) are checked mechanically after you reply". SELECT-1 and
    // SELECT-2 are the two hard rules in `contracts/selection/`, and until now
    // `checkSelection` had no caller on the request path at all — only a bench
    // script and a unit test. So the sentence was false, and
    // `scripts/check_contracts.ts` counted both rules enforced because an array
    // literal named them. `scripts/check_check_reachability.ts` is the guard
    // for the class; this is the call that makes the claim true.
    //
    // Read on `raw`, deliberately, not on `picks`: `picks` has already had the
    // non-integers, the duplicates, the out-of-range indices and the excess
    // dropped, so checking it would grade our own repair and report SELECT-2
    // as never violated by construction. That is the exact "the old view"
    // versus "the truth" distinction `contractReach.test.ts` pins down.
    //
    // OBSERVATIONAL, and the same discipline as `checkBrief` at the end of
    // `synthesize`: it counts, it never repairs and it never gates. The repair
    // above is the product behaviour and it stays; a founder is not served by a
    // check refusing to hand over a table, and a check that can block a run is
    // a check nobody dares tighten. Wrapped, because a defect in a check must
    // never be able to cost a founder their brief.
    try {
      const violations = checkSelection(
        raw, menuRows.length, want, SELECT_COUNT_MODE);
      if (violations.length) {
        tally.selectionViolations += violations.length;
        tally.selectionViolationBriefs++;
      }
    } catch (err) {
      console.error("[agentSelect] checkSelection threw on a real reply:", String(err));
    }
    if (!picks.length) {
      // No usable pick. Distinguish the two causes, because they need
      // different fixes and an aggregate "failed" count hides which one is
      // biting: an empty content block is a token-budget problem, a non-empty
      // reply that yielded nothing is a prompt or parsing problem.
      if (!textOf(res).trim()) tally.emptyReply++; else tally.badJson++;
      tally.failed++;
      if (traceMemo) {
        traceMemo.fellBack = textOf(res).trim()
          ? "the reply parsed to no usable index — the shipped order was published"
          : "the reply was empty — the shipped order was published";
        traceMemo.poolOut = traceMemo.poolIn;
      }
      return leave("noUsablePick", rows);
    }
    // Under `atMost` a short reply is the answer, not a defect: the seats it
    // declines keep the empirical ranker's order. Counted separately so a run
    // can report how often the model used the licence, which is the whole of
    // what the lever is for.
    if (picks.length < want) {
      if (SELECT_COUNT_MODE === "atMost") {
        tally.declinedSeats += want - picks.length;
        tally.declinedBriefs++;
      } else tally.shortReply++;
    }
    // SELECT-8, measured. Not repaired here: which sibling survives is a product
    // decision, and nameCollision.ts holds the precedent that a display rule may
    // not delete from the universe.
    const dupes = sameTitlePickCount(menuRows, picks);
    if (dupes) { tally.siblingPicks += dupes; tally.siblingBriefs++; }
    tally.ok++;

    // The permutation. Chosen first in the model's order; everything else keeps
    // the shipped order behind them, so a short reply degrades toward the
    // control rather than into a truncated page.
    const chosen = picks.map((i) => menuRows[i]);
    if (peers) {
      // Only the prior-ranked candidates that were actually ON THE MENU count
      // as overridable: a fund the model was never shown cannot have been
      // declined by it, and counting those would inflate the override rate
      // with rows the arm never had a chance to consider.
      const onMenu = menuRows
        .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      const ranked = onMenu.filter((id) => peers.has(id))
        .sort((a, b) => (peers.get(a) ?? 0) - (peers.get(b) ?? 0));
      const pickedIds = chosen
        .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      const pickedSet = new Set(pickedIds);
      lastDecision = {
        priorRanked: ranked,
        picked: pickedIds,
        followed: pickedIds.filter((id) => peers.has(id)),
        overrode: ranked.filter((id) => !pickedSet.has(id)),
        reached: pickedIds.filter((id) => !peers.has(id)),
        unsure: lastUnsureIds,
      };
    }
    const frozen = rows.slice(0, keep);
    const taken = new Set([...frozen, ...chosen]);
    // wsIJ. `abstains` is the whole rule; see its declaration for what it is
    // worth and why it defaults off. Deliberately HERE, below every tally and
    // below `lastDecision`: what the model said is recorded either way, so a
    // tape taken under this lever can still be re-scored as if it were off,
    // and a run of the two arms costs one call and not two.
    const kept = abstains(picks);
    const out = kept
      ? rows
      : [...frozen, ...chosen, ...rows.filter((r) => !taken.has(r))];
    if (traceMemo) {
      traceMemo.picks = picks;
      traceMemo.pickedIds = chosen.map((r) => r.instrumentId ?? r.channel);
      traceMemo.poolOut = out.map((r) => r.instrumentId ?? r.channel);
      if (kept) traceMemo.fellBack =
        "AGENT_SELECT_ABSTAIN=confirmed and the model's first choice was our " +
        "first row, so our own order was published (wsIJ)";
    }
    return leave(kept ? "confirmed" : "chose", out);
  } catch (err) {
    tally.failed++;
    console.error("[agentSelect] call failed, keeping the shipped order:", String(err));
    if (traceMemo) {
      traceMemo.fellBack = `the call threw — the shipped order was published: ${String(err)}`;
      traceMemo.poolOut = traceMemo.poolIn;
    }
    return leave("threw", rows);
  }
}

/**
 * ── THE PRODUCTION SEAM: the memo's pool, reordered by the model ───────────
 *
 * ONE function, called from `runIntelligence` and from every harness that
 * measures this arm. Not two — a diagnostic that rebuilds the seam it is
 * grading is the defect class this repo has paid for repeatedly, and it is
 * exactly how wsDD came to measure an arm that could not reach the product.
 *
 * WHAT IT GUARANTEES WITH THE ARM OFF: the argument array, BY REFERENCE.
 * `agentSelectRows` returns `rows` on the off arm before anything else runs,
 * and this function returns before `assessAll` on the same test, so the arm-off
 * path allocates nothing, computes nothing and cannot differ from the path that
 * existed before this file did. `scripts/_wsdl_equiv.ts` asserts that identity
 * over replayed founders rather than trusting the reading.
 *
 * ── AND THAT PATH IS THE CONTROL NOW, NOT THE PRODUCT (wsGB) ──────────────
 * `AGENT_SELECT` defaults to `adviser`, so `off` is reached by being NAMED. It
 * is not dead surface and must not be removed: it is the control arm of
 * `scripts/_wsga_headtohead.ts`, the subject of `_wsdl_equiv.ts`, and the free
 * replay every offline harness in `scripts/` asks for. Every failure path in
 * `agentSelectRows` still degrades to exactly the order it produces, so the
 * branch is also the shape of the fallback and not only of a control.
 *
 * WHAT IT ADDS WITH THE ARM ON, and none of it is new IO:
 *   * every answer the founder actually gave, in the words ANSWER_LABEL holds,
 *     plus one honest line naming the ranking fields they did not give;
 *   * `assessAll` per fund per founder — pure, model-free, over gates the pool
 *     already hydrated, so it costs no query that was not already made.
 *
 * `eligibility` here is the POST-ADAPTIVE-ROUND answer set. `runIntelligence`
 * is the last call the panel makes, so the fields that do not exist during
 * `computeVerdict` exist by the time this runs.
 */
export async function agentSelectMemoPool(
  rows: InstrumentRow[],
  req: {
    country?: string;
    description?: string;
    eligibility?: EligibilityAnswers;
    /** The prose half of round two. Already on `IntelligenceRequest`, and
     *  `runIntelligence` already passes that whole object here — so widening
     *  this type is the entirety of what was needed to make it reach the stage
     *  that chooses. It was being assembled, sent to the writer, and never
     *  shown to the ranker. */
    projectAnswers?: ProjectAnswer[];
    /** The founder's own name for their company. Already required on
     *  `IntelligenceRequest` and already on the object `runIntelligence` hands
     *  here, so widening this type is the entirety of what was needed to put it
     *  back in front of the stage that chooses. See `SelectContext.company`. */
    company?: string;
  },
): Promise<InstrumentRow[]> {
  if (AGENT_SELECT_ARM === "off") {
    // The off arm returns HERE, one function ABOVE the traced one, and that
    // early return is the byte-identity guarantee `_wsdl_equiv` asserts by
    // reference. So the control's pool would be invisible to a transcript
    // recorded any deeper -- and the control's pool is the one thing that has
    // to be recorded for the treatment's pool to mean anything, because the
    // two arms are two processes with a live web-search call upstream of both.
    // Written only when a harness asked for a transcript; with tracing off
    // this branch allocates nothing and the return is unchanged.
    if (tracing) traceMemo = seedTrace(rows);
    return rows;
  }
  const ids = rows.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  return agentSelectRows(rows, {
    company: req.company,
    country: req.country,
    sector: req.eligibility?.sector ?? undefined,
    description: req.description,
    answers: intakeAnswerLines(req.eligibility),
    unanswered: unansweredRankingFields(req.eligibility),
    assessments: assessAll(ids, req.eligibility),
    projectAnswers: req.projectAnswers,
  });
}
