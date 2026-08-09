// WHAT A ROW IS.
//
// A row has always been A SCHEME: one notified regime, one line on the page.
// The measurement that forced this file says that is the wrong unit. Under FULL
// founder information the honest ceiling on EXACT@5 is 66%, and 29 points of
// the shortfall is SIBLING INDISTINGUISHABILITY: leaves that share a notified
// scheme, inherit the same gates, and differ only in WHO ADMINISTERS THEM. No
// intake question separates those, because there is nothing to separate -- they
// are one programme delivered through many doors.
//
// So the unit becomes the DOOR: this scheme, via the body that granted the
// money. `SA.111723` becomes `SA.111723 via Region Normandie`.
//
// ── The evidence standard, which is the whole of the honesty argument ──────
// `administeringBody` is not a claim we invented and it is not a claim we
// inferred from our own columns. It is a MAJORITY VOTE over the granting
// authority the EU State Aid Transparency Register publishes on each individual
// award (see populate_funding_instruments.py), and `administeringBodyShare` is
// that vote's margin. So the register is the source; the vote is arithmetic
// over the register.
//
// What the register supports is therefore a statement about AWARD HISTORY --
// "the awards recorded under this leaf were granted by X" -- and NOT a
// statement about intake: nothing here says X is currently accepting
// applications, or that X is the only door into the scheme. Every caller must
// keep the row's claim inside that. `via` is the word chosen for exactly this
// reason; "apply to" would assert something the register never said.
//
// ── Two things disqualify a body from being named ─────────────────────────
//  1. A MINISTRY. A government department notifies a regime; it does not take
//     applications. Naming one sends a founder to a dead end dressed as a lead,
//     and a wrongly-shown row is worse than a missing one. Same predicate the
//     brief checks and `displayInstitutionName` already use, imported rather
//     than restated, so a body can never be applyable in one file and not in
//     another.
//  2. A WEAK VOTE. Where the leaf's awards are scattered across many granting
//     authorities, the plurality is not a door, it is the busiest agency in a
//     country's aid system -- the defect that told a robotics founder to
//     approach the German agricultural bank.
//
// The floor is 0.75 and the number barely matters, which is the point.
// Measured over the 780 leaves in multi-leaf regimes (scripts/_wscg_bodyshare.ts):
// 640 carry a body, and 608 of those 640 have a share of 0.99 or better. The
// distribution is not a spectrum with a judgement call in the middle; it is a
// mass at certainty plus a thin tail. 0.60 admits 489 leaves, 0.75 admits 484,
// 0.90 admits 479 -- five leaves between the loosest and the strictest. 0.75 is
// taken because it sits in the flat, and because it is strictly above the 0.60
// that `displayInstitutionName` uses for the much stronger claim that a body IS
// the whole instrument.
import { NOT_AN_APPLYABLE_BODY } from "./briefChecks";

/** ── The arm ───────────────────────────────────────────────────────────────
 *  `scheme` is today's product and the default. `door` is the body-level row.
 *
 *  Read once at module load, never per call, for the same reason
 *  `SECTOR_CLIP_ARM` is: a measurement must not be able to drift mid-run. */
export type RowIdentityArm = "scheme" | "door";
export const ROW_IDENTITY_ARM: RowIdentityArm =
  process.env.ROW_IDENTITY_ARM === "door" ? "door" : "scheme";

/** The margin the majority vote must clear before the winner is a door. */
export const BODY_SHARE_FLOOR = 0.75;

/** Everything this module needs. Both `InstrumentRow` and `DbInstrument`
 *  satisfy it, which is what lets the metric and the label share one rule. */
export interface BodyBearing {
  administeringBody?: string | null;
  administeringBodyShare?: number | null;
}

/**
 * The body this leaf may be shown as being delivered through, or null.
 *
 * Null is not "we have no body" -- it is "the register does not support naming
 * one", which covers a missing body, a ministry, and a vote too scattered to be
 * a door. Callers must treat all three the same way: say nothing extra.
 */
export function nameableBody(x: BodyBearing): string | null {
  const body = x.administeringBody?.trim();
  if (!body) return null;
  if (NOT_AN_APPLYABLE_BODY.test(body)) return null;
  const share = x.administeringBodyShare;
  // A NULL share is not neutral here, and this is the one place this file
  // departs from the repo's "a gap in our data is never evidence against"
  // convention -- deliberately. Elsewhere the gap decides whether a fund is
  // RANKED; here it decides whether we PRINT A CLAIM about who grants the
  // money. Printing on an unmeasured vote is asserting something we did not
  // measure, and that is the failure mode this whole file is guarding.
  if (share == null || !(share >= BODY_SHARE_FLOOR)) return null;
  return body;
}

/**
 * The identity of the row this leaf belongs to.
 *
 * Under `scheme` this is the leaf itself, so nothing merges and nothing is
 * credited that is not exact. Under `door` two leaves are the same row when
 * they are the same notified regime reached through the same named body -- and
 * ONLY then: a leaf with no nameable body falls back to its own id and can
 * never be credited by a sibling.
 */
export function doorKey(
  id: string, parentId: string | null | undefined, x: BodyBearing,
): string {
  const body = nameableBody(x);
  if (!body) return `leaf::${id}`;
  return `door::${parentId ?? id}::${body.toLowerCase()}`;
}

/** The connective, in one place so the label, the memo and the checks agree.
 *  `via` and not "apply to": see the evidence standard at the top of this file. */
export const VIA = "via";
