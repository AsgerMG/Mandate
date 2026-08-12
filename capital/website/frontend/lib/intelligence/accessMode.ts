// Do you apply to this, or do you pitch it?
//
// ── The distinction ────────────────────────────────────────────────────────
// A public promotional bank publishes criteria, takes an application and
// assesses it against them. A public-backed investment vehicle selects,
// negotiates, takes a seat on the cap table, and usually wants a lead investor
// already in place. Both are public money. Only one is something a founder can
// walk up to and apply for.
//
// A brief that offers the second to a founder who came looking for the first
// is off-promise, and it happened: a solo founder at pilot stage, who never
// asked for equity, was told to approach two venture funds — one of which does
// not invest at all without a lead.
//
// ── Derived, never listed ──────────────────────────────────────────────────
// The signal is in the instruments' own encoded gates, which describe investor
// behaviour in their own words ("founder must accept a cap-table investor",
// "targets companies with investable financials"). Reading that generalises to
// funds in countries we have not looked at yet; a list of known VC names would
// not, and would go stale the first time one was added.
import type { DbInstrument } from "./corpus";
// ONE liveness vocabulary. The basis constant and `today()` are imported
// rather than restated so the data floor and `isClosed()` cannot drift apart
// on what a call deadline is or on what "now" means.
import { SCHEME_END_BASIS, today } from "./liveness";

export type AccessMode =
  /** Published criteria, submit and be assessed. */
  | "apply"
  /** Selected and negotiated with, on commercial terms. */
  | "invest";

/**
 * Capital types that are dilutive by construction.
 *
 * ── Why `blended` is not one of them ───────────────────────────────────────
 * It was, and the reasoning was that a blended instrument carries an equity
 * component. Nothing in the corpus carries that meaning. `blended` is what
 * `family_capital_type` emits when no kind reached its 60% threshold — a
 * statement about a VOTE, not about capital, and it is emitted for any
 * unresolved mixture whatever the kinds involved.
 *
 * Every `blended` instrument in the corpus, checked one by one against the
 * split vote the ETL records beside each label: 1,451 loan / 1,526 guarantee;
 * three grant / loan splits; two grant / tax-credit splits; two register rows
 * stating loan and grant; one with no vote at all. Not one equity award among
 * them. Treating the label as dilution took the largest of them — a national
 * debt programme with 2,977 awards — and made it visible only to founders who
 * asked for equity, which is the one thing it does not provide, while hiding
 * it from every founder who asked for the debt it does.
 *
 * The protective intent is intact and is why `equity` stays: silence is still
 * not consent to dilution. What changed is that the guard now fires on a label
 * that asserts dilution, rather than on one that asserts nothing.
 */
const DILUTIVE = new Set(["equity"]);

/** The dilution set, for the tests that pin the property above. Exported so
 *  `capitalPreference.test.ts` tests the set the code uses rather than a copy
 *  of it — a copy would keep passing after this one changed. */
export const DILUTIVE_FOR_TEST: ReadonlySet<string> = DILUTIVE;

/**
 * Gate language that describes an INVESTOR rather than a grantor.
 *
 * Matched on what the requirement asserts about the relationship, not on any
 * institution's name: taking a cap-table seat, co-investing beside a lead, or
 * screening for investability are things only an investor requires, whoever
 * they are and whatever language they wrote it in.
 */
const INVESTOR_RELATIONSHIP =
  /cap[- ]?table|co-?invest|alongside a lead|lead investor|equity stake|shareholding|investable|investment committee|exit/i;

export function accessMode(inst: DbInstrument): AccessMode {
  if (!DILUTIVE.has(inst.capitalType)) return "apply";
  // A dilutive instrument is not automatically an investor: the EIC's blended
  // route carries an equity component and is still applied for through a
  // published call. The gates decide.
  const describesInvestor = inst.gates.some((g) => INVESTOR_RELATIONSHIP.test(g.requirement));
  return describesInvestor ? "invest" : "apply";
}

/**
 * Whether an instrument may be shown at all, given what the founder asked for.
 *
 * Silence is not consent to dilution. An empty capital preference used to mean
 * "anything", which is how a founder who had not thought about equity was
 * offered it. It now means the non-dilutive routes; equity is opt-in, because
 * a founder who has not raised before does not know that leaving a field blank
 * is what put a cap-table investor in front of them.
 */
export function passesCapitalPreference(
  inst: DbInstrument,
  capitalSought: string[] | undefined,
): boolean {
  // Keyed on whether the instrument DILUTES, not on whether it behaves like a
  // venture fund. Access mode reads each instrument's gates, and gate coverage
  // is uneven: one national venture arm classifies as "apply" purely because
  // nobody has encoded its terms yet. Making visibility depend on that would
  // make a founder's exposure to dilution a function of our own encoding
  // backlog. Capital type is recorded for every instrument, so it holds
  // everywhere.
  //
  // accessMode still decides how a published row DESCRIBES itself, where
  // being told "this one takes a board seat" is useful rather than protective.
  if (!DILUTIVE.has(inst.capitalType)) return true;
  return (capitalSought ?? []).includes("equity");
}

/**
 * Instruments with no award amounts AND no award date on record.
 *
 * We hold events for them, so we know they exist, and nothing else: not what
 * they give, not whether they have given it recently. Their scale and liveness
 * components can only be guesses, and a guess scored at its midpoint outranks
 * a fund we measured and found middling — so the less we knew, the better an
 * instrument did.
 *
 * Blast radius, re-measured against Postgres on 2026-08-13: of 1,088 corpus
 * rows, 18 pass every other publishable predicate and fail only this one, and
 * no country loses its last national route. (The "18 of 724" this line used to
 * quote was the same 18 against a corpus that has since grown to 1,088
 * instruments and 771 publishable — and it was self-contradictory as written,
 * since this test IS one of the predicates `publishableInstruments` applies, so
 * a publishable instrument can never be below the floor.)
 *
 * ── The register clause, and why it is not a loosening ────────────────────
 * The two tests above are both AWARD facts, because award history was the only
 * thing the corpus held. A call register states the same two properties
 * directly, about a fund that has not paid anything yet: a total budget, and
 * the exact date applications close. Spain's BDNS is the first such source in
 * the corpus and by construction it can only ever contain funds with no award
 * history — its instruments are built from awards, so a currently-open call
 * cannot be in the award stream. Without this clause, "which five funds should
 * I apply to" is answered for Spain from 13 rows, all of them found by
 * accident of having already paid out.
 *
 * A register-stated application window that HAS NOT PASSED is a stronger
 * liveness fact than anything the first two tests accept — it is the fund's own
 * declaration, where `lastYear` is a proxy the corpus infers, and the floor
 * already accepts a `lastYear` five years stale. Rejecting a window open today
 * while accepting an award from 2021 is not conservatism, it is incoherence.
 *
 * Deliberately narrow, in three ways:
 *   - `callDeadline` only. A `notifiedDuration` is a State-aid notification's
 *     expiry, routinely prolonged, and says nothing about whether anyone can
 *     apply — see liveness.ts for why the two must never be conflated.
 *   - FUTURE only. A past call deadline means permanently closed, so this can
 *     never resurrect anything; `isClosed()` would drop the row regardless, and
 *     this clause agreeing with it keeps the two from drifting.
 *   - It grants nothing on SCALE. These rows still have no award median, so
 *     `awardScorer` gives them 1.0 — the same neutral the corpus already gives
 *     the 141 publishable instruments with no usable one (no `awardP50`, or
 *     fewer than `AWARD_N_FLOOR` awards behind it; 2026-08-13, was 98) — and
 *     `scaleFit` 0.5 in the memo only.
 *
 * ── AND IT IS NO LONGER A NO-OP, WHICH IS THE POINT OF IT ─────────────────
 * At adoption this paragraph read "of the 41 instruments that fail the first
 * two tests, ZERO have a future call deadline", i.e. the clause admitted
 * nothing that existed yet. Re-measured against Postgres on 2026-08-13: 131
 * instruments have neither amounts nor a `lastYear`, and 87 of them are
 * admitted by a future call deadline. That is the register sources landing, and
 * it is what the clause was written for — but it means the third test now
 * carries a seventh of the corpus, so it is load-bearing and a change to it is
 * no longer free. Re-take both figures before quoting either.
 */
export function meetsDataFloor(inst: DbInstrument): boolean {
  const hasAmounts = (inst.totalEur ?? 0) > 0;
  const hasDate = Boolean(inst.lastYear);
  const end = inst.schemeEndDate ? String(inst.schemeEndDate).slice(0, 10) : "";
  const hasOpenWindow =
    inst.schemeEndBasis === SCHEME_END_BASIS.callDeadline &&
    end.length === 10 &&
    end >= today();
  return hasAmounts || hasDate || hasOpenWindow;
}

/**
 * Instruments we hold too little about to say much, without holding nothing.
 *
 * 133 of the 771 publishable instruments have fewer than five tracked awards
 * (2026-08-13; it was 56 of 724 when this was written, and the growth is the
 * register sources, which by construction arrive with no award history at all).
 * There is no median award to quote, the sector
 * history is a handful of companies, and precedent is close to noise — so
 * every judgement about them is thinner than it looks beside a fund measured
 * across thousands of awards.
 *
 * DEMOTED, never deleted, and the row says why. A fund we have barely observed
 * is not the same as a fund that does not fit, and dropping it silently is how
 * a genuine route disappears with nobody noticing — the failure this product
 * is least able to detect in itself. meetsDataFloor already handles the case
 * where we hold nothing at all; this is the weaker one.
 */
export const THIN_EVIDENCE_AWARDS = 5;

export function hasThinEvidence(inst: DbInstrument): boolean {
  return (inst.eventCount ?? 0) < THIN_EVIDENCE_AWARDS;
}
