// What the comparable-company search may be told about the founder.
//
// ── The stage, and why it needed a rule of its own ─────────────────────────
// `research.ts` asks a search-grounded model for five European companies that
// are LIKE this one, so that the memo can say who else has been funded for
// work like this. Its context has always been the request's top-level fields:
// the company name, its country, the model's own tech-depth read, and the
// founder's prose description. Nothing the founder ANSWERED has ever reached
// it (wsIK found this while removing `body.sector`).
//
// The obvious repair is to hand it `intakeFactLines(req.eligibility)`, which
// is what wsIK's note proposes and what every other model-facing stage in the
// product is handed. That is the wrong block for this stage, and the reason is
// worth stating because it is the whole content of this file.
//
// `intakeFactLines` renders EVERY answered field, and most of the intake is
// not about the company at all — it is about the founder's standing under aid
// law. "Accumulated losses over half of subscribed capital: yes" is decisive
// for the eligibility screen and is meaningless to a search for peers: no
// candidate company's public profile carries it, so it cannot make any
// candidate more or less comparable. Handing it over spends the model's
// attention on a constraint it cannot act on, and invites it to read the block
// as a filter on the companies it returns.
//
// ── THE PROPERTY ──────────────────────────────────────────────────────────
//
//     A fact may be told to the comparable search only if the SAME FACT could
//     be stated about one of the companies the search is asked to return.
//
// The test for a field nobody has seen yet: write the fact into the profile of
// a company you have never met -- a press piece, a register entry, an investor
// page. If it reads as a fact about that company, it is admissible. If it only
// makes sense as something the founder told US, it is not.
//
//     "stage: pilot customers"          reads fine about anyone       ADMIT
//     "headcount: 10-49"                reads fine about anyone       ADMIT
//     "what they build: mobility"       reads fine about anyone       ADMIT
//     "conditions they would accept"    only makes sense about the
//                                       founder, to us                REFUSE
//     "a single owner holding >25%"     a fact, but one no candidate
//                                       profile carries, so it can
//                                       separate no candidate         REFUSE
//
// It is deliberately NOT `ANSWER_USE`'s `ranks: true` set. That set answers a
// different question -- which answers move the row sort -- and it both admits
// `consortium` (a willingness, not a company fact) and refuses
// `developmentStage` and `fteBand`, which are the two sharpest statements of
// altitude the intake collects and exactly what "a similar altitude" in the
// search prompt is asking for.
//
// ── Exhaustive, so a new intake field cannot slip in either direction ──────
// Keyed on `keyof EligibilityAnswers`, so the compiler refuses a field until
// someone has applied the test above to it, and every refusal carries its
// reason. A register of admitted field names in `research.ts` would be the
// shape this repo fails builds over; this is the property with the test beside
// it, in the same form `ANSWER_USE` and `FIELD_REACH` already take.
import { intakeFactLines } from "./knownFacts";
import type { EligibilityAnswers } from "./types";

export type ComparableFact =
  /** Admissible. `slot` names the part of the search's own output schema the
   *  fact constrains -- product/positioning, maturity, or country -- so the
   *  claim is checkable against the prompt rather than asserted. */
  | { tells: true; slot: "what it builds" | "how far along" | "where" }
  /** Refused, with the reason the test above gives. */
  | { tells: false; reason: string };

export const ANSWER_TELLS_COMPARABLE:
  Record<keyof EligibilityAnswers, ComparableFact> = {
  // ── Admitted: a third party could write this about any company ───────────
  sector: { tells: true, slot: "what it builds" },
  useOfFunds: { tells: true, slot: "what it builds" },
  developmentStage: { tells: true, slot: "how far along" },
  fteBand: { tells: true, slot: "how far along" },
  turnoverBand: { tells: true, slot: "how far along" },
  balanceBand: { tells: true, slot: "how far along" },
  ticketBand: { tells: true, slot: "how far along" },
  organisationType: { tells: true, slot: "what it builds" },
  foundedYear: { tells: true, slot: "how far along" },
  activityCountries: { tells: true, slot: "where" },

  // ── Refused ─────────────────────────────────────────────────────────────
  //
  // `region` is the one genuine judgement call here and it is refused on the
  // stage's own terms rather than on the property. A NUTS id IS a fact about a
  // company. But the prompt asks for comparable EUROPEAN companies and says so
  // twice, and a sub-national location is the single most available thing for
  // a search-grounded model to narrow on: the failure mode is five companies
  // from one Land, which is a worse answer to "who receives public funding and
  // how" than five from five countries. The country is already stated. If this
  // is ever admitted it should be as evidence that the founder is in a regional
  // scheme's catchment, which is the eligibility screen's job and not this
  // stage's.
  // Admissible by the property and REFUSED anyway, because the context already
  // states it. `withIncorporationCountry` (sanitize.ts) puts the panel's single
  // country select at the head of this field on every request, and the panel
  // offers no way to name a second establishment, so the rendered line is the
  // `Country:` line one paragraph above it in our question's words. Measured on
  // the held-out 897: identical to the country on 897 of 897. It becomes
  // admissible the day the intake asks where else the founder has an entity --
  // then the extra names are new information and this reason expires by itself.
  entityCountries: { tells: false, reason: "already stated as `Country:` in the same context. The panel sends one country and withIncorporationCountry puts it here, so the line restates it" },
  region: { tells: false, reason: "a fact about the company, but the search is for EUROPEAN comparables and a sub-national location is the easiest thing for it to narrow on. The country is already in the context" },
  institutionalBacking: { tells: false, reason: "the prompt puts private venture rounds OUT OF SCOPE in its own words. Telling the model the founder is institutionally backed steers it at exactly the class of fact it is instructed not to report" },
  activities: { tells: false, reason: "an aid-law EXCLUSION axis whose permissive value is the truthful answer for the great majority of companies, so it names no property that separates one candidate from another" },
  consortium: { tells: false, reason: "a willingness, not a fact about the company. No candidate's profile states it" },
  cofinancingBand: { tells: false, reason: "what the founder could put up against an award. Not a property of any company the search returns" },
  conditionality: { tells: false, reason: "conditions the founder would accept. Only meaningful as something they told us" },
  wouldOpenEntity: { tells: false, reason: "a stance about the future, and its job is the cure on an establishment blocker" },
  needBy: { tells: false, reason: "the founder's own timing. Nothing about a comparable company" },
  bankRelationship: { tells: false, reason: "the founder's lending relationship. No candidate profile carries it" },
  borrowerModel: { tells: false, reason: "how this applicant would borrow, and pinned to one value for every founder (FIELD_REACH), so it separates nobody" },
  ownerOver25: { tells: false, reason: "the linked-enterprise half of the SME test. A fact, but one no candidate profile carries, so it can separate no candidate" },
  institutionalOwner: { tells: false, reason: "the public-body half of the linked-enterprise test. See ownerOver25" },
  nonEuControl: { tells: false, reason: "ultimate control, an aid-law ownership test. See ownerOver25" },
  lossesOverHalfCapital: { tells: false, reason: "the undertaking-in-difficulty test. Decisive for the eligibility screen, and it cannot make any candidate more or less comparable" },
  exclusionFlags: { tells: false, reason: "the GBER and de minimis exclusions, self-declared. Nothing a candidate's profile states" },
};

/** The admitted fields, derived. Never written out anywhere else. */
export const COMPARABLE_FIELDS: readonly (keyof EligibilityAnswers)[] =
  (Object.keys(ANSWER_TELLS_COMPARABLE) as (keyof EligibilityAnswers)[])
    .filter((f) => ANSWER_TELLS_COMPARABLE[f].tells);

/**
 * The founder's own answers that describe their COMPANY, one line each.
 *
 * Rendered THROUGH `intakeFactLines` rather than beside it. That function is
 * the product's one renderer of an answered field, `check_answer_in_prompt`
 * grades prompts against its own `sayIntakeValue` output, and a stage carrying
 * a second copy of that rendering is the defect `check_answer_reach.ts` exists
 * for -- a label reworded on one side and not the other goes silently wrong,
 * and nothing throws. So this contributes the PREDICATE and nothing else.
 *
 * Empty for a founder who answered none of the admitted fields, which on the
 * instant path is nobody: `sector` is asked on the first screen.
 */
export function comparableFactLines(e?: EligibilityAnswers): string[] {
  return intakeFactLines(e, (f) => ANSWER_TELLS_COMPARABLE[f].tells);
}
