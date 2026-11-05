// What we already know about this founder, in one place.
//
// ── Why this is shared ─────────────────────────────────────────────────────
// This block used to be a private helper of the memo writer. Every question
// generator ran without it, so nothing that decided WHAT TO ASK could see what
// the founder had already told us on screen 1.
//
// The cost was visible in a live run. The founder had answered
// `developmentStage: scaling_revenue`, and the round-2 screen still asked for
// the product's technology readiness level — twice, in two different framings,
// getting TRL 6 to one and TRL 7-8 to the other. The brief then published both
// numbers about the same product.
//
// A stage that re-asks a settled fact is now a bug in one place rather than an
// omission repeated in three.
//
// ── AND THE WRITER NEVER SWITCHED OVER (wsHL) ──────────────────────────────
// The paragraph above describes an extraction that was only half finished. The
// `heading` parameter below exists so the memo writer can keep its established
// "Scoping profile" wording — and the memo writer never called this function.
// It kept its own copy, `eligibilityContext` in pipeline.ts, and the two
// drifted exactly as `check_answer_reach.ts`'s docstring says two copies of one
// mapping always do. Measured 2026-08-18 by comparing both blocks against
// `ANSWER_LABEL`, which the compiler makes exhaustive:
//
//   missing from the WRITER's block    sector, useOfFunds, region, activities,
//                                      exclusionFlags, institutionalOwner,
//                                      balanceBand
//   missing from THIS one              region, exclusionFlags,
//                                      institutionalOwner, balanceBand
//
// Three of those — `sector`, `useOfFunds` and `region` — are the fields
// ANSWER_USE declares `ranks: true`, and all three are asked on SCREEN ONE.
// They are the same two answers `tableInputFromAnswers` was written to stop
// losing, lost again one layer over: the ranking half was fixed and the PROMPT
// half was not, and the prompt is what the model that writes the brief reads.
// `region` was missing from both, and check_answer_reach calls it "the single
// biggest measured lever in the product".
//
// So the list is gone. What is rendered is now a PROPERTY — every field the
// founder answered, in the words `ANSWER_LABEL` gives — which is the shape
// `intakeAnswerLines` in agentSelect.ts already uses for the selector, and for
// the same stated reason. `check_answer_in_prompt.ts` holds it to that.
import {
  ACTIVITY_OPTIONS, ANSWER_LABEL, BORROWER_MODELS, EXCLUSION_OPTIONS,
  FIELD_VALUE_DOMAIN, ORGANISATION_TYPE_OPTIONS, SECTOR_OPTIONS, TICKET_BANDS,
  USE_OF_FUNDS_OPTIONS,
} from "./types";
import type { EligibilityAnswers, IntelligenceRequest } from "./types";
// The basis a quantity is measured on, for the intake fields that carry one.
// One register, read here, so both prompt sites describe the founder's own
// number the same way. See money.ts for what the recorded briefs did without it.
import { withAnswerBasis } from "./money";
import { regionNameFor } from "./regions.generated";

/**
 * Option tables that carry a human label, for PRETTINESS ONLY.
 *
 * A field absent from here renders its raw vocabulary value with underscores
 * turned into spaces, which is honest and is what half of the old list already
 * did. Nothing about whether a field APPEARS is decided here — that is decided
 * by `ANSWER_LABEL`, which is keyed on `keyof EligibilityAnswers` so the
 * compiler demands an entry for every intake field, and it is enforced by
 * `check_answer_in_prompt.ts`. A partial record cannot silently drop a field
 * from the prompt; the worst it can do is spell one plainly.
 */
const LABELLED: Partial<Record<keyof EligibilityAnswers,
  readonly { value: string; label: string }[]>> = {
  sector: SECTOR_OPTIONS,
  organisationType: ORGANISATION_TYPE_OPTIONS,
  useOfFunds: USE_OF_FUNDS_OPTIONS,
  activities: ACTIVITY_OPTIONS,
  exclusionFlags: EXCLUSION_OPTIONS,
  borrowerModel: BORROWER_MODELS,
  ticketBand: TICKET_BANDS,
};

/** Answered, in this product's one sense of the word: `["none"]` is an answer
 *  and `[]` is silence. See EligibilityAnswers. */
const answered = (v: unknown): boolean =>
  v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

/**
 * A NUTS id AND the place it names — `DE7 (Hessen)`.
 *
 * The same rendering, for the same reason, as `namedRegion` in agentSelect.ts:
 * the founder answered with the code the question offered and every candidate
 * row describes the same place in words, so a model handed only one of the two
 * has no way to see that they match. Keyed on `FIELD_VALUE_DOMAIN` rather than
 * on the field name, so a second region-valued field is rendered this way with
 * no edit here.
 */
export const sayIntakeValue = (field: keyof EligibilityAnswers, v: unknown): string => {
  if (FIELD_VALUE_DOMAIN[field] === "region") {
    const id = String(v);
    const name = regionNameFor(id);
    return name && name.toLowerCase() !== id.toLowerCase() ? `${id} (${name})` : id;
  }
  const opt = LABELLED[field]?.find((o) => o.value === String(v));
  return opt ? opt.label : String(v).replace(/_/g, " ");
};

/**
 * Every intake field the founder answered, as one line each.
 *
 * A property, not a register: the field list is `Object.keys(ANSWER_LABEL)`,
 * which the compiler keeps exhaustive over `EligibilityAnswers`, so a field
 * added to the intake tomorrow reaches every model that reads this block with
 * no edit in this file. A field nobody answered prints nothing, so there is no
 * way to accumulate empty labels.
 *
 * These are our own words for our own questions and our own vocabulary values,
 * never founder prose, so they are trusted and need no fencing.
 */
export function intakeFactLines(
  e?: EligibilityAnswers,
  /** Which fields this reader may see. Omitted, every answered field is
   *  rendered, which is what every caller but the comparable-company search
   *  wants and what this function did before the parameter existed.
   *
   *  A PREDICATE and not a list: the one stage that narrows the block
   *  (`comparableFacts.ts`) derives its predicate from an exhaustive Record,
   *  so the narrowing is a declared property and this function stays the
   *  single renderer. The alternative -- a second renderer beside this one, or
   *  a caller grepping these strings for the labels it wants -- is the
   *  two-copies-of-one-mapping defect `check_answer_reach.ts` exists for, and
   *  a label reworded on one side of it goes silently wrong. */
  admits: (f: keyof EligibilityAnswers) => boolean = () => true,
): string[] {
  if (!e) return [];
  const keys = Object.keys(ANSWER_LABEL) as (keyof EligibilityAnswers)[];
  return keys
    .filter((k) => admits(k) && answered((e as Record<string, unknown>)[k]))
    .map((k) => {
      const v = (e as Record<string, unknown>)[k];
      const line = `${ANSWER_LABEL[k]}: ${(Array.isArray(v) ? v : [v]).map((x) => sayIntakeValue(k, x)).join(", ")}`;
      // A quantity carries what it is a quantity OF. `ANSWER_LABEL` says what
      // the FIELD is; a number needs its basis as well, or the reader supplies
      // one. `ticketBand` is the case that was measured doing damage.
      return withAnswerBasis(k, line);
    });
}

/**
 * The consequences a bare value does not carry.
 *
 * Kept as EXTRA lines rather than as replacements: `intakeFactLines` above
 * already states what the founder answered, and these say what that answer
 * MEANS for aid law. Dropping them when the list became a property would have
 * traded one silent loss for another — the undertaking-in-difficulty note in
 * particular is the one line that changes what a writer may claim.
 */
function consequenceLines(e?: EligibilityAnswers): string[] {
  return [
    e?.ownerOver25 === "yes"
      ? "NOTE: an owner holding 25% or more means the SME test needs the linked-enterprise check"
      : "",
    e?.nonEuControl === "yes"
      ? "NOTE: majority non-EU control restricts the defence lanes"
      : "",
    e?.lossesOverHalfCapital === "yes"
      ? "FLAG: accumulated losses may exceed half of share capital (undertaking-in-difficulty risk: most GBER aid blocked until equity is restored)"
      : "",
  ].filter(Boolean);
}

/**
 * The founder's own answers, formatted for a model prompt.
 *
 * `heading` lets the writer keep its established "Scoping profile" wording
 * while the planner introduces the block as what it must not re-ask.
 */
export function knownFacts(
  req: Pick<IntelligenceRequest, "company" | "country" | "description" | "companyType">,
  e?: EligibilityAnswers,
  heading = "## What the founder has already told us (AUTHORITATIVE)",
): string {
  const lines = [
    req.company ? `Company: ${req.company}` : "",
    req.country ? `Incorporated in: ${req.country}` : "",
    req.companyType ? `Self-described type: ${req.companyType}` : "",
    ...intakeFactLines(e),
    ...consequenceLines(e),
  ].filter(Boolean);
  return lines.length ? `${heading}\n${lines.join("\n")}` : "";
}
