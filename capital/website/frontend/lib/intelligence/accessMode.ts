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

export type AccessMode =
  /** Published criteria, submit and be assessed. */
  | "apply"
  /** Selected and negotiated with, on commercial terms. */
  | "invest";

/** Capital types that are dilutive by construction. */
const DILUTIVE = new Set(["equity", "blended"]);

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
 * Measured before adopting: 18 of 724 publishable instruments, and no country
 * loses its last national route.
 */
export function meetsDataFloor(inst: DbInstrument): boolean {
  const hasAmounts = (inst.totalEur ?? 0) > 0;
  const hasDate = Boolean(inst.lastYear);
  return hasAmounts || hasDate;
}

/**
 * Instruments we hold too little about to say much, without holding nothing.
 *
 * 56 publishable instruments have fewer than five tracked awards, 52 of them
 * national development banks. There is no median award to quote, the sector
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
