/**
 * The rules nothing checks — DECLARED, with what would be needed to check them.
 *
 * ── The thing this file exists to make impossible ─────────────────────────
 * `scripts/check_contracts.ts` had a rule against dead spec: a `(hard)` rule
 * with no enforcing check fails the build. Its regex was
 * `/^-\s+([A-Z]+-\d+)\s+\(hard\)/`, which requires a digit straight after the
 * hyphen and the literal marker `(hard)`. A Banned rule presents `B1` in the
 * first position and carries no marker at all, so it failed the match twice
 * over: ALL FIFTEEN BANNED RULES WERE INVISIBLE TO THE CHECK THAT EXISTS TO
 * FIND UNENFORCED RULES. Three other regexes in the same file use the correct
 * `([A-Z]+-B?\d+)`. The narrow one was the one that decided enforcement.
 *
 * The loop also only ever looked at `(hard)`. 39 `(judged)` and 7 `(soft)`
 * rules were exempt by design -- on the stated grounds that a model reading the
 * same contract scores them. `contracts.ts` says so in a docstring: "the
 * contracts are also what the quality judge reads". THERE IS NO QUALITY JUDGE.
 * Nothing in this repo reads a contract and scores a rule. The only consumers
 * of `loadContracts()` are this check, a provenance labeller, and the writer's
 * own system prompt. `openJudge.ts` is a gate-eligibility judge that never sees
 * a rule id. So 46 rules were addressed to a reader that does not exist, and
 * the exemption that let them through was written as though it did.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *
 *   EVERY RULE IN EVERY CONTRACT IS EITHER ENFORCED BY A NAMED CHECK, OR
 *   DECLARED HERE WITH THE PREDICATE THAT WOULD ENFORCE IT AND THE REASON IT
 *   DOES NOT.
 *
 * There is no third state. `check_contracts.ts` fails the build on a rule that
 * is in neither, so a rule added tomorrow forces the decision at the moment it
 * is written rather than joining a silent population. The register cannot grow
 * without someone saying, in one line, what checking it would take.
 *
 * This does not make the rules enforced. It makes the SIZE AND SHAPE of the
 * unenforced surface a fact in the build rather than something a workstream
 * has to rediscover by reading regexes.
 *
 * ── The three reasons a rule is here ──────────────────────────────────────
 * `judgement`  deciding it means reading meaning. A keyword heuristic would
 *              cry wolf, and a check that cries wolf trains you to ignore the
 *              report. These are the ones a judge WOULD close, and the note
 *              says what it would have to be given.
 * `no-artifact` mechanically decidable, but the artifact it decides is not
 *              produced anywhere a check can reach for free -- typically it
 *              needs a finished brief, which costs a model call.
 * `buildable`  mechanically decidable on an artifact we already have, and
 *              simply not built yet. These are the backlog, and they should
 *              empty.
 */

export type UnenforcedReason = "judgement" | "no-artifact" | "buildable";

export interface UnenforcedRule {
  why: UnenforcedReason;
  /** What a check would have to decide, in one line. */
  predicate: string;
}

export const UNENFORCED_RULES: Record<string, UnenforcedRule> = {
  // ── Grounding: every one of these is "is this claim supported", which is
  // the definition of a judgement. A judge reading the contract plus the
  // evidence block the claim is supposed to come from would close all eight.
  "GND-1": { why: "judgement", predicate: "every figure in the brief appears in the supplied database evidence" },
  "GND-2": { why: "judgement", predicate: "claims from web search describe activity and maturity only, never funding" },
  "GND-3": { why: "judgement", predicate: "an absent record is written as untraced, never as zero" },
  "GND-4": { why: "judgement", predicate: "amounts are described as committed, never as cash received" },
  "GND-5": { why: "judgement", predicate: "every funder, programme, deadline, person and company named exists in the evidence" },
  "GND-6": { why: "judgement", predicate: "every claim about this company traces to the founder's words or a matched record" },
  "GND-7": { why: "judgement", predicate: "each recommendation is supported by the same evidence a claim would need" },
  "GND-8": { why: "judgement", predicate: "the register is intelligence about awards, not exhortation" },
  "GND-B1": { why: "judgement", predicate: "a dilutive instrument is never described without its cost" },
  "GND-B2": { why: "judgement", predicate: "no eligibility is asserted that the supplied screen leaves open" },

  // ── Voice. VOI-5 is the em-dash rule and IS enforced, as BRIEF-3, on the
  // whole report walk. VOI-B1 is enforced on the same walk. The rest are
  // register, which is what a judge is for.
  "VOI-1": { why: "judgement", predicate: "sentences are short, declarative, and lead with the implication" },
  "VOI-2": { why: "judgement", predicate: "second person for the founder, no first person" },
  "VOI-3": { why: "judgement", predicate: "a position is stated rather than hedged" },
  "VOI-4": { why: "buildable", predicate: "every money amount in reader text matches the EUR display format; needs a number walk over readerText" },
  "VOI-5": { why: "judgement", predicate: "no emoji, rhetorical questions or marketing adjectives; the em-dash half is enforced as BRIEF-3" },
  "VOI-6": { why: "judgement", predicate: "every sentence changes what the reader does" },
  "VOI-7": { why: "judgement", predicate: "the same register holds in every field, which readerText now makes reachable" },

  // ── Document shape.
  "BRIEF-B1": { why: "buildable", predicate: "no markdown heading or section marker inside any prose field; a shape test over readerText" },
  "BRIEF-B2": { why: "judgement", predicate: "the last paragraph is not a restatement of the bottom line" },

  // ── Bottom line.
  "BL-3": { why: "judgement", predicate: "one idea per bullet, in ordinary sentences" },
  "BL-4": { why: "judgement", predicate: "the first bullet opens from the founder's own traced footprint" },
  "BL-5": { why: "judgement", predicate: "the middle bullets name which published fund is the right first move" },
  "BL-6": { why: "judgement", predicate: "the final bullet states the commercial payoff concretely" },
  "BL-7": { why: "judgement", predicate: "each bullet changes a decision rather than restating the table" },
  "BL-B2": { why: "judgement", predicate: "no comparative urgency about other companies" },

  // ── Funds.
  "FUND-8": { why: "judgement", predicate: "whyEligible is specific to this company and grounded in the screen; the 25-word half is buildable and the specificity half is not" },
  "FUND-9": { why: "judgement", predicate: "nextStep is one concrete action drawn from the process briefs" },
  "FUND-10": { why: "judgement", predicate: "blockerPlain restates the row's one obstacle in plain language naming the real threshold" },
  "FUND-11": { why: "judgement", predicate: "a dormant row is described as dormant and never promised an upcoming call" },
  "FUND-12": { why: "judgement", predicate: "no row is described as first, best or strongest relative to another" },
  "FUND-13": { why: "judgement", predicate: "registeredPurpose is used in the scheme's own statutory terms where present" },
  // The mechanical half of this -- does the row HAVE a fact no earlier row
  // had -- is FUND-3's own test and is checked. What is left needs reading:
  // whether a note that is not a byte-copy of its neighbour is nevertheless
  // about the same thing. A substring test against the group heading would
  // pass any competent paraphrase and fail an honest sentence that happens to
  // name the programme, which is the shape of check that trains you to ignore
  // the report.
  "FUND-14": { why: "judgement", predicate: "a row's note, with every fact its group heading already states struck out, still says something about that row" },
  "FUND-B2": { why: "judgement", predicate: "the brief never tells the founder to check whether they qualify; a phrase register would be an enumeration and is refused" },

  // ── Positioning.
  "POS-2": { why: "judgement", predicate: "named people and institutions come from the supplied agenda evidence" },
  "POS-3": { why: "judgement", predicate: "every named person carries their role and their relevance" },
  "POS-4": { why: "judgement", predicate: "framing advice fits the commercial model the founder described" },
  "POS-5": { why: "judgement", predicate: "the mapping to stated priorities is specific rather than generic" },
  "POS-6": { why: "judgement", predicate: "dated movement on a fund in the founder's own table is preferred to the topic-level agenda" },
  // Was a SECOND POS-6. `declaredRules` is a Set, so the collision was absorbed
  // silently and the success line under-counted by one for as long as both
  // existed. Renumbered, and the build now fails on a repeated id.
  "POS-7": { why: "judgement", predicate: "the register stays advisory: never sycophantic, never inventing a relationship" },
  "POS-B1": { why: "judgement", predicate: "no customer, buyer or channel the founder did not state" },
  "POS-B2": { why: "no-artifact", predicate: "no framing recommended for an unpublished fund; same fund-name recognition problem as BL-B1" },

  // ── State of play.
  "SOP-0": { why: "judgement", predicate: "movement on the founder's own funds leads where the evidence has it" },
  "SOP-3": { why: "judgement", predicate: "each development is tied to what it would mean for this company" },
  "SOP-4": { why: "judgement", predicate: "grounded only in the supplied recency-sorted evidence" },
  "SOP-5": { why: "judgement", predicate: "no claim that a change alters eligibility today unless the evidence says so" },
  "SOP-6": { why: "judgement", predicate: "the reader finishes understanding their landscape has moved" },
  "SOP-B1": { why: "judgement", predicate: "no closing summary of the model's own" },
  "SOP-B2": { why: "judgement", predicate: "no development reported and then conceded to change nothing" },

  // ── Round 2. The mechanical half of this contract IS enforced
  // (QUESTION_RULE_IDS); what remains is whether a question is worth asking,
  // which is exactly the judgement a form cannot make.
  "Q-6": { why: "judgement", predicate: "a founder can answer from memory without opening a document" },
  "Q-7": { why: "judgement", predicate: "the question names what this company actually does, in the founder's words" },
  "Q-8": { why: "judgement", predicate: "the question is about the project and the business, never legal form or headcount" },
  "Q-9": { why: "judgement", predicate: "the question's answer would change something" },
  "Q-11": { why: "buildable", predicate: "no question restates a fact already in knownFacts; a set comparison against the intake, not yet built" },
  "Q-12": { why: "judgement", predicate: "the question is asked in the founder's world rather than the programme's" },
  "Q-13": { why: "judgement", predicate: "the question is not already answered by the founder's own description" },
  "Q-14": { why: "judgement", predicate: "an analyst would ask it" },
  "Q-15": { why: "judgement", predicate: "each question states what it decides, in the founder's terms" },
  "Q-B1": { why: "judgement", predicate: "no requirement invented beyond the fund's text; Q-1's verbatim-overlap test is the mechanical half" },
  "Q-B2": { why: "judgement", predicate: "the founder is never asked to interpret statute" },

  // ── Selection. SELECT-1 and SELECT-2 are now enforced (selectionChecks.ts).
  // The rest describe the shape of a good five, which is the judgement the
  // stage exists to make.
  "SELECT-3": { why: "judgement", predicate: "no candidate whose stated requirements the founder plainly cannot meet" },
  "SELECT-4": { why: "judgement", predicate: "a fund whose own eligibility text matches beats one that is merely large" },
  "SELECT-5": { why: "buildable", predicate: "the five span more than one funding level where candidates allow; decidable from each candidate's country and parent, not yet built" },
  "SELECT-6": { why: "buildable", predicate: "two candidates share a parent regime only where both are separately relevant; the parent comparison is decidable, the relevance is not" },
};
