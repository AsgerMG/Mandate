// Can a founder reach this fund by answering the intake at all?
//
// ── The class of defect ────────────────────────────────────────────────────
// The pipeline filters instruments on a handful of CORPUS AXES against the
// founder's own answers. Each such filter is a join between two vocabularies:
// the values a row may carry, and the answers a founder may give. When a value
// appears on the corpus side with no answer that admits it, every row carrying
// it is removed for every founder in every country, however they answer — and
// nothing anywhere goes red. The fund is simply never in anybody's pool.
//
// That has now happened twice on one axis and been MISDIAGNOSED once:
//
//   * `unknown` (capital_type) — a fact we never recorded. Nine publishable
//     instruments, including a French programme with 2,835 awards, invisible
//     to everyone. Found by accident while attributing a different loss.
//   * `blended` — reported by an earlier check as stranded, and the truth was
//     the opposite: it is reachable by EVERY option precisely because no option
//     maps to it. A check that read the MAP rather than asking the FUNCTION
//     went red over a fund every founder can see.
//
// ── The property ───────────────────────────────────────────────────────────
// Every value a publishable row can carry on a filtered axis must be either
//
//   (a) REACHABLE — some single answer a founder can give admits it, or
//   (b) DECLARED unofferable, here, with a reason and a policy.
//
// Silence is the only forbidden state. A value nobody has classified must be
// loud, because the values that will hurt are the ones nobody enumerated.
//
// ── Why reachability is asked of the FUNCTION, never of a map ─────────────
// `reachable` calls the shipping filter itself, one intake answer at a time.
// Recomputing "the set of values some option maps to" is a different question
// and the two have already disagreed in production: `blended` is in no option's
// mapped values and is admitted by all of them. A check that answers
// differently from the filter is worse than no check, because nothing fails
// when a diagnostic lies.
//
// One answer at a time, not the whole set at once: a fund reachable only by a
// founder who ticks every box is reachable by no founder who has a preference.
//
// ── The two policies, and why they are not the same word ──────────────────
// `withhold` is a DECISION. The row is a real object we have described
// correctly, and it is not something this product may offer — an accelerator
// that hands out coaching and no capital is not a fund a founder can raise
// from, and putting it in a table headed by a capital question would be
// answering a question they did not ask. Withheld rows are removed from the
// publishable set outright (see corpus.ts), so they are never silently dropped
// by a preference filter that would be reading our editorial choice as the
// founder's refusal.
//
// `gap` is a FAILURE. We do not know what the row is, and the honest word for
// that is the one the column already carries. A gap is ratcheted toward zero
// and may never grow: the fix is upstream, in the ETL, where the fund's own
// documents can settle it.
//
// Declaring a gap therefore costs something — it is counted, printed and
// capped — while declaring a withhold does not, which is the right way round.
import type { DbInstrument } from "./corpus";
import { instrumentServesCapital } from "./shortlist";
import { instrumentServesCountry } from "./shortlist";
import { CAPITAL_OPTIONS } from "./types";

export type UnofferablePolicy =
  /** A described row this product may not offer. Removed from publishable. */
  | "withhold"
  /** A fact we failed to record. Ratcheted toward zero; fix upstream. */
  | "gap";

export interface UnofferableDeclaration {
  policy: UnofferablePolicy;
  /** Why, in a sentence someone auditing this in a year can act on. */
  reason: string;
}

export interface OfferableAxis {
  /** The corpus column this filters on. */
  key: string;
  /** What the founder is answering, for the failure message. */
  question: string;
  /** The value a row carries. Never null — an empty column is a value too, and
   *  the whole point is that a blank must not be able to hide. */
  valueOf(i: DbInstrument): string;
  /** Does SOME single intake answer admit this value? Calls the shipping
   *  filter, never a restatement of it. */
  reachable(value: string): boolean;
  /** Values that are unreachable on purpose, each with a policy and a reason. */
  declared: Record<string, UnofferableDeclaration>;
  /** Ceiling on publishable rows stranded under a `gap` declaration. A
   *  CEILING, never a target. */
  gapCeiling: number;
}

const CAPITAL_ANSWERS = CAPITAL_OPTIONS.map((o) => o.value);

export const OFFERABLE_AXES: OfferableAxis[] = [
  {
    key: "capital_type",
    question: "What kind of capital are you looking for?",
    valueOf: (i) => i.capitalType || "(empty)",
    reachable: (v) => CAPITAL_ANSWERS.some((a) => instrumentServesCapital(v, [a])),
    declared: {
      // ── Withheld: described correctly, and not capital ──────────────────
      // Emitted by the ETL when the programme's OWN page says participants
      // receive support and no money: EIT Digital's Venture Acceleration
      // Programme gives "free access to the 12-month EIT Digital Accelerator
      // Programme worth EUR 50,000", and EIT Food's RisingFoodStars is an
      // association whose members historically PAID a fee to join.
      //
      // These are real, and worth entering, and they are not a raise. Every
      // option this product's intake offers is a kind of capital, so there is
      // no answer that means "coaching"; leaving them in the pool would put
      // them in front of a founder under a support-type label that asserts
      // money. Withheld at the corpus boundary rather than by the capital
      // filter, so the reason recorded is ours and not a misread preference.
      non_financial: {
        policy: "withhold",
        reason:
          "the official source says participants receive support but no capital; " +
          "every intake option is a kind of capital, so no answer can mean this, " +
          "and offering it under a capital heading would answer a question the " +
          "founder did not ask",
      },
      // Withheld: we ASKED the official source and it does not say. The EIT
      // ClimAccelerator format is two-stage — Stage 1 is cash up to EUR 25,000,
      // Stage 2 is a Climate-SAFE, "a simple agreement for future equity" — and
      // the Clean Cities Spain 2024 cohort page names neither the stage nor the
      // instrument. Between a grant and a convertible is exactly the ambiguity
      // a founder cannot be exposed to on a guess.
      //
      // Distinct from `unknown`, and the distinction is what makes the ratchet
      // mean anything: a finished piece of work with a negative result is not a
      // debt, and leaving it inside the gap count would put a floor under the
      // number that no amount of upstream work could remove.
      undetermined: {
        policy: "withhold",
        reason:
          "the official source was consulted and does not state what this pays; " +
          "where the plausible answers span grant and equity, offering it on a " +
          "guess risks dilution nobody asked for",
      },
      // ── Gap: we never recorded what this fund pays ─────────────────────
      // NOT a property of the fund. `instrumentServesCapital` is right to
      // refuse it — a founder who ticked Grants and Loans should not be handed
      // a tax credit — but it is refusing on a fact that was never collected,
      // so it reads our silence as the founder's refusal.
      //
      // There is no safe default. Three of the EIT vehicles in this corpus
      // that ARE typed carry `equity`, and one of the untyped ones is named
      // "portfolio", so admitting untyped rows to a grant-seeker's pool could
      // put a cap-table investor in front of someone who never asked for one.
      // The fix is upstream, in CAPITAL_BY_BASIS, and the ratchet is what
      // stops the gap being quietly re-opened while that happens.
      unknown: {
        policy: "gap",
        reason:
          "the capital kind was never recorded for this instrument; fix it in " +
          "ETL/events/load/populate_funding_instruments.py (CAPITAL_BY_BASIS) " +
          "from the source's own documents, never by guessing in the filter",
      },
      "(empty)": {
        policy: "gap",
        reason:
          "the capital_type column is blank, which is the same failure as " +
          "`unknown` with less to go on",
      },
    },
    // Re-derived against Postgres each time the data improves. Lower it
    // whenever it can be lowered; never raise it to make a build green — a
    // rise means funds are landing that no founder can be shown.
    gapCeiling: 1,
  },
  {
    // Included because the property is about the AXIS CLASS, not about capital.
    // Country is the other hard corpus-vs-intake filter in `selectLeafInstruments`,
    // it has never been asked this question, and asking it is nearly free.
    key: "country",
    question: "Where are you based / where do you want to raise?",
    valueOf: (i) => i.country || "(empty)",
    // A founder names their own country, so the reachable set is "every ISO2 a
    // founder could type", which is not enumerable — but the failure that
    // matters IS: a row whose country no founder can name, because the column
    // is blank or holds something that is not a country code. Probing the
    // filter with the row's own value answers exactly that: a well-formed
    // country is reachable by the founder who lives in it, and a malformed one
    // is reachable by nobody.
    reachable: (v) => v !== "(empty)" && instrumentServesCountry(v, [v]),
    declared: {
      "(empty)": {
        policy: "gap",
        reason:
          "the country column is blank, so no founder's country matches it and " +
          "the row is removed for everyone; fix it upstream in the extractor",
      },
    },
    gapCeiling: 0,
  },
];

/** Values on this axis that this product has decided not to offer. Read by
 *  `publishableInstruments()` so a withheld row is withheld ONCE, at the
 *  corpus boundary, rather than by whichever filter happens to reject it. */
export function withheldValues(axis: OfferableAxis): Set<string> {
  return new Set(Object.entries(axis.declared)
    .filter(([, d]) => d.policy === "withhold").map(([v]) => v));
}

/** True when this instrument carries a value some axis has declared unofferable
 *  by DECISION. Gaps are deliberately not included: a row we failed to describe
 *  stays in the corpus and is counted, because hiding it would hide the debt. */
export function isWithheldByPolicy(i: DbInstrument): boolean {
  return OFFERABLE_AXES.some((a) => withheldValues(a).has(a.valueOf(i)));
}
