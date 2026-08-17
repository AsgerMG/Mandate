// What a euro figure in a model's prompt is a quantity OF.
//
// ── The defect this exists to close (wsHM) ─────────────────────────────────
//
// The writer's prompt printed four euro quantities, on four different bases,
// with nothing saying which was which:
//
//   the ASK            the founder's answer to "how much are you looking for",
//                      one number for their whole need, printed in the
//                      AUTHORITATIVE scoping profile as `Ticket sought: X`.
//   the TICKET         a curated band for the KIND of door, hand-written once
//                      per programme in `fund-processes/*.md`. Wide by
//                      construction: 53 of 84 rows on the twelve archetypes
//                      carry the same string, "from EUR 100k to tens of EUR M
//                      under GBER".
//   the TYPICAL AWARD  this scheme's own median over the awards it has really
//                      paid. One scheme's contribution to one project.
//   a COMPARABLE FIRM's amount
//                      that company's TOTAL across every award it drew on that
//                      whole CHANNEL, over several years. Not one cheque, and
//                      not this leaf's.
//
// Handed all four unlabelled, the model does what a reader does: it assumes
// they are comparable and matches them. The recorded briefs show it, in its
// own words, on a founder who answered EUR 15M-50M:
//
//   "Innovation Fund SSP is the standout first move: it is sized for capex
//    grants from EUR 2.5M into the tens or hundreds of millions, matching your
//    EUR 15M to EUR 50M ask directly."
//
// That row's measured median is EUR 4.0M over 57 awards -- below the FLOOR of
// the band it was said to match "directly". The model reached for the widest
// quantity on the row (the curated ticket) because that is the only one that
// can be made to agree with the ask, and it demoted the narrow ones in prose:
// ERC POC ("typically funds smaller proof-of-concept extensions ... rather than
// industrial-scale deployment"), EIC Transition ("this lane is normally
// SME-scaled"). Both were the smallest payers on their table.
//
// ── Why that is backwards and not merely sloppy ────────────────────────────
// `project-mgmt/findings/award_direction_wsHE/` measured the direction on 897
// founders whose won scheme is known: the schemes founders actually WIN pay
// LESS than the amount they stated, by a large factor, nearly all of the time.
// A symmetric "closest to the ask" rule whose target sits above almost every
// candidate is not a proximity rule at all -- it degenerates into "prefer the
// larger payer", and the larger payer is usually the wrong door. wsHE removed
// that term from the SCORE (`AWARD_TERM`). It could not touch this, because
// this is the model doing the same arithmetic in prose, one stage later, and
// the bottom line it writes is where the founder is told which door to open
// first (BL-5).
//
// On the twelve archetypes, at the published cap, EVERY published row's median
// award sits below the founder's stated band floor -- 84 of 84 -- and the
// rank-1 row is the one row the writer is shown no measured median for at all
// (`distinguisherPhrases` is empty on row 0 by construction). So the top row
// is precisely where the curated band is the ONLY money fact in evidence.
// Reproduce free: `npx tsx scripts/_wshm_money.ts`.
//
// ── THE PROPERTY ───────────────────────────────────────────────────────────
//
//   A MONEY QUANTITY HANDED TO A MODEL CARRIES THE BASIS IT IS MEASURED ON.
//
// The test, for a field nobody has added yet: take any euro figure a prompt
// prints and ask -- a quantity of WHAT, paid by WHOM to WHOM, over WHAT span?
// If the prompt does not answer, the reader answers for it, and the tapes show
// which answer it picks: the one that makes the numbers comparable.
//
// `scripts/check_money_basis.ts` fails the build on a row field that renders a
// QUANTITY and has no entry in `ROW_QUANTITIES`, so the next one forces the
// sentence to be written rather than joining a silent population. Finding the
// quantities is a TEST over rendered values (`isQuantityValue`), never a list
// of fields somebody remembered; deciding which of them are EUROS is the
// register, because no test can tell 4,043,400 euros from 7 gates checked.
//
// ── NO RATES HERE ──────────────────────────────────────────────────────────
// `check_prompt_rates.ts` forbids a frequency in any contract, for a reason
// that applies just as hard to this file: these strings are byte-identical on
// every request and every corpus, so a rate typed here is wrong at some depth
// by construction. The measured figures live in the finding. The prompt gets
// the DIRECTION, which does not move.
//
// Hermetic: one import, of a types-only leaf. No corpus, no fs, no pg, so a
// check can read it.
import { AXIS_LABEL } from "./rowNovelty";

/**
 * The founder's stated amount, introduced by what it is and what it is not.
 *
 * It replaced the bare `Ticket sought: <band>`, which named a quantity without
 * naming its subject. The intake asks "How much are you looking for?" and
 * offers one band; nothing on that screen asks the founder to split the number
 * by source or to separate a round from a project cost, so the honest label
 * says what we hold rather than asserting a basis we did not ask for. The
 * three readings the recorded briefs gave one answer -- "your ask", "a project
 * ticket", "your capex ask" -- were all invented downstream of this line.
 *
 * Splitting the question itself is the cleaner fix and it belongs to whoever
 * owns the intake (wsHE says the same). Until then the prompt states the
 * ambiguity instead of resolving it silently.
 */
export const askLine = (bandLabel: string): string =>
  `Amount they are looking for: ${bandLabel} ` +
  `(their answer to "how much are you looking for", ONE figure for the whole ` +
  `need. The intake did not ask them to split it by source, so it is not what ` +
  `any single scheme pays and it is not a project budget)`;

/**
 * EVERY QUANTITY A ROW RENDERS, DECLARED — money with its basis, and
 * everything else with what it counts instead.
 *
 * There is no third state, and that is the whole design. A check cannot tell
 * `typicalAward: 4043400` from `gatesChecked: 7` by looking at the value: both
 * are bare positive numbers. Only a person knows, so the register forces the
 * sentence at the moment a numeric field is added rather than letting it join
 * a silent population -- the same shape as `UNENFORCED_RULES` and
 * `UNROUTED_STAGES`, for the same reason.
 *
 * `money: true` entries are the ones the writer is told the basis of. The rest
 * are declared here and stay out of the prompt: a count of gates checked is
 * not a euro figure and labelling it as one would be its own confusion.
 *
 * Keyed by the field's own name on `InstitutionEntry`, so a rename cannot
 * leave the register describing a field that no longer exists -- the check
 * reads the row's keys, never a copy of them.
 */
export interface RowQuantity {
  /** Is this a euro amount? Only these reach the writer's money block. */
  money: boolean;
  /** A quantity of WHAT, paid by WHOM to WHOM, over WHAT span. */
  basis: string;
}

export const ROW_QUANTITIES: Readonly<Record<string, RowQuantity>> = {
  ticket: { money: true, basis:
    `a curated band for the KIND of door, written once for the whole ` +
    `programme and carried by every scheme under it. It is wide by ` +
    `construction and separates nothing inside a group` },
  typicalAward: { money: true, basis:
    `THIS scheme's own median over the awards it has really paid, with the ` +
    `count behind it. One scheme's contribution to one project` },
  comparableFirms: { money: true, basis:
    `a comparable company's TOTAL across every award it drew on that whole ` +
    `channel over several years. Not one cheque, and not this scheme's` },
  awardP25: { money: true, basis:
    `the same awards as the median, read at the lower and upper quartile: ` +
    `the middle half of what this scheme has paid` },
  awardP75: { money: true, basis:
    `the same awards as the median, read at the lower and upper quartile: ` +
    `the middle half of what this scheme has paid` },
  structuringNotes: { money: true, basis:
    `the scheme's OWN words about how its money is shaped -- rates, ceilings, ` +
    `co-financing -- so any figure inside is a limit per project set by the ` +
    `scheme, never something it has paid` },
  judgementCriteria: { money: true, basis:
    `the scheme's OWN conditions, verbatim. A figure inside is a threshold it ` +
    `sets, never an amount it has paid` },
  // Declared, and deliberately NOT money.
  aidIntensity: { money: false, basis:
    `a SHARE of eligible project cost, between zero and one, measured over ` +
    `this scheme's awards. It is already rendered as a percentage` },
  gatesChecked: { money: false, basis:
    `how many of this scheme's encoded eligibility filters could be evaluated ` +
    `for this founder. A count of rules, not of euros or of awards` },
};

/** The money half, which is what the writer is told the basis of. */
export const MONEY_BASIS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ROW_QUANTITIES).filter(([, q]) => q.money).map(([k, q]) => [k, q.basis]));

/**
 * The one relationship between the ask and the awards, stated because the
 * model will otherwise infer one, and the tapes show which one it infers.
 *
 * ONE-SIDED, and deliberately the same shape as `AWARD_TERM=oneside` in the
 * score: below the ask is the ordinary case and says nothing about a row;
 * far above the whole ask is a scheme answering a different question. The
 * prompt and the score now make the same claim, so a paid run measures one
 * position rather than two that disagree.
 */
export const AWARD_RELATION: string =
  `The amount the founder is looking for and the amounts on these rows are ` +
  `not the same kind of quantity, so they do not compare. Public capital is ` +
  `assembled from several awards, and the schemes founders actually go on to ` +
  `win pay a FRACTION of the figure they stated, the typical one off by most ` +
  `of an order of magnitude and many by more. A scheme paying less than that ` +
  `figure is therefore the ORDINARY case: it is never on its own a reason to ` +
  `call a row small, ` +
  `secondary, slow, a poor fit, or anything other than a door. The one money ` +
  `fact that does bear on a row runs the other way: a scheme whose typical ` +
  `award is far larger than the founder's entire stated need is answering a ` +
  `different question, and saying so is fair. So never write that a row ` +
  `matches, fits or is sized to the amount they are looking for, and never ` +
  `prefer one row to another on how close its money is to it. Where money is ` +
  `worth a sentence, say what THIS scheme has actually paid and what that ` +
  `would cover.`;

/** The whole money block, as the writer receives it: the bases, then the one
 *  relationship. Stated ONCE per table rather than once per row -- 84 copies
 *  of it would spend the context the founder's own answers need, and the
 *  claim is about the quantities, not about any particular row. */
export function moneyBasisBlock(axes: readonly string[]): string {
  // Fields sharing a basis share a LINE. The quartiles are one measurement
  // read at two points -- saying it twice would model the very repetition the
  // row block was rebuilt to remove, and would read as two different facts.
  const byBasis = new Map<string, string[]>();
  for (const a of axes) {
    const basis = MONEY_BASIS[a];
    if (!basis) continue;
    byBasis.set(basis, [...(byBasis.get(basis) ?? []), a]);
  }
  // Named by the label the ROW ITSELF prints, never by the field name. The
  // model reads "typical award" and "comparable firms funded through it"; a
  // block explaining `typicalAward` and `comparableFirms` would be explaining
  // identifiers it has never seen. `AXIS_LABEL` is the same map the group
  // headers and the WHAT-SETS-THIS-ROW-APART line are rendered from, so this
  // block and the rows it describes cannot drift apart.
  const lines = [...byBasis].map(([basis, fields]) =>
    `- "${fields.map((f) => AXIS_LABEL[f] ?? f).join('", "')}": ${basis}.`);
  return `## What the money on these rows means (read before writing any figure)\n` +
    (lines.length ? `${lines.join("\n")}\n\n` : "") +
    AWARD_RELATION;
}

/**
 * Does this rendered value state a QUANTITY the reader could compare?
 *
 * A TEST, not a register, and it is what makes `check_money_basis.ts` catch
 * the field nobody has added yet. Two ways a row states one, and they are the
 * two this codebase actually produces:
 *
 *   - a bare number (`typicalAward`, `awardP25`, `gatesChecked`);
 *   - a string, or a list or object of strings, carrying a currency mark
 *     (`ticket`, `structuringNotes`, the `amount` inside a comparable firm) --
 *     all of which are prose the corpus wrote.
 *
 * Two naming conventions are excluded, and they are `rowNovelty.renderNumber`'s
 * own rather than a second set that agrees today: a field ending `Year` names a
 * point in time, and one ending `N` is the count of observations behind
 * another value and never travels alone.
 *
 * It deliberately does NOT try to decide whether a number is money. It cannot:
 * `typicalAward: 4043400` and `gatesChecked: 7` are both bare positive
 * numbers. That decision is `ROW_QUANTITIES`, where a person makes it once.
 */
export function isQuantityValue(axis: string, value: unknown): boolean {
  const hasCurrency = (s: string) => /(?:€|EUR)\s*[\d.,]/i.test(s);
  if (typeof value === "number") {
    if (axis.endsWith("Year")) return false;      // a point in time
    if (axis.endsWith("N")) return false;         // observations behind a value
    return value !== 0;
  }
  if (typeof value === "string") return hasCurrency(value);
  if (Array.isArray(value)) return value.some((v) => isQuantityValue(axis, v));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .some((v) => typeof v === "string" && hasCurrency(v));
  }
  return false;
}
