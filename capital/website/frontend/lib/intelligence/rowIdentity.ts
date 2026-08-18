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
import { namesAnApplyableBody, splitDoor, VIA, withDoor } from "./applyableBody";

// ── THE LABEL SHIPS. DOOR-LEVEL *RANKING* DOES NOT ────────────────────────
//
// There was a `ROW_IDENTITY_ARM=door` switch here, default off. It was deleted
// on 2026-08-09 because it was a switch over a settled question in one
// direction and a parked bug fix in the other, and neither is an A/B.
//
// The RANKING half is a structural zero and must not be re-proposed. wsCG2
// measured it directly: the SATR loader already materialises one instrument per
// (regime, scheme, body), so every multi-leaf notified scheme has exactly as
// many distinct bodies as it has leaves (SA.56245 18/18, SA.111723 12/12), and
// leaves sharing a scheme with the SAME body number 0. `doorKey` is therefore a
// re-derivation of the leaf id: DOOR@5 equals EXACT@5 to the pair on every
// population measured (tune 27/27, holdout 24/24, region-known 22/22). wsCI §3
// reproduced it from the other side — every door-keyed permutation of the
// published five is exactly inert. There is nothing here to measure again.
//
// The LABEL half is a different claim and ships on its own merits. It is not a
// ranking rule: it renames and never reorders, demotes or touches the pool. It
// exists because a founder shown one leaf of a twelve-body scheme reads the
// bare regime title -- a rulebook eleven other bodies publish under -- and
// because the table and the question beneath it were spelling one leaf two
// ways. A fix behind a switch nothing could flip is a fix that never runs.

/** The connective, in one place so the label, the memo and the checks agree.
 *  `via` and not "apply to": see the evidence standard at the top of this file.
 *
 *  DEFINED in applyableBody.ts and re-exported here. It moved there when FUND-7
 *  learned to split a published name back into "<what> via <who>" in order to
 *  judge each half for what it claims to be, and applyableBody is the only
 *  module low enough in the import graph for the check, the label and the row
 *  identity to all reach one copy. */
export { VIA, withDoor } from "./applyableBody";

// `withDoor` — THE ONE SPELLING OF A DOOR, wherever a body is printed beside a
// name — is re-exported above. Both places that name a fund by its granting
// body call it: the instrument table (`distinguishRowNames`, and
// `nameRowsAsDoors` after it) and the question rendered underneath it
// (`gateReach`). One function rather than a comment asking three call sites to
// agree — this repo has now hit "two functions, two keys" three times and the
// fix was one exported function every time.

/** The margin the majority vote must clear before the winner is a door. */
export const BODY_SHARE_FLOOR = 0.75;

/** Everything this module needs. Both `InstrumentRow` and `DbInstrument`
 *  satisfy it, which is what lets the metric and the label share one rule. */
export interface BodyBearing {
  administeringBody?: string | null;
  administeringBodyShare?: number | null;
  /** The notified scheme. Part of the identity, not decoration -- see doorKey. */
  schemeCode?: string | null;
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
  if (!namesAnApplyableBody(body)) return null;
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
 * The identity of the row this leaf belongs to: THE SCHEME, VIA THE BODY.
 *
 * Two leaves are the same row when they are the same NOTIFIED SCHEME reached
 * through the same named body -- and only then. A leaf with no nameable body
 * falls back to its own id and can never be credited by a sibling.
 *
 * ── The scheme half is `schemeCode`, AND ITS ABSENCE IS NOT A FALLBACK ────
 * The first cut of this fell back to the parent regime where no notified code
 * existed. It read +22 points of DOOR@5 and the concentration line printed
 * beside it said what that really was: 55 of the 65 gained pairs came from
 * `ademe_aid` and `vinnova_grant`, two regimes whose leaves carry NO notified
 * code and ONE granting body each. The key had merged an agency's entire call
 * portfolio into a single row -- 75 distinctly named ADEME calls, from bicycle
 * tourism to biomass heat, credited as one answer. That is the identical
 * failure workstream M's row collapse was rejected for
 * (findings/sibling_collapse_wsM.md), rebuilt inside a metric where it scores
 * as a win instead of showing up on the page.
 *
 * So a leaf with no notified scheme code is its OWN door, always. The parent is
 * never the scheme half. Two consequences, both intended: an agency's calls
 * stay separate rows, and the metric can only pay where a public register
 * actually says "these awards are one scheme, granted by this body".
 *
 * Even with a code the regime is never the key: `satr_fr_rnd` holds 42 leaves
 * across 17 notified schemes, and a key on the regime would call
 * SA.111723-via-Grand-Est and SA.59366-via-Grand-Est one row. Two schemes, two
 * budgets, two granting decisions.
 */
export function doorKey(
  id: string, _parentId: string | null | undefined, x: BodyBearing,
): string {
  const body = nameableBody(x);
  const scheme = x.schemeCode?.trim();
  if (!body || !scheme) return `leaf::${id}`;
  return `door::${scheme}::${body.toLowerCase()}`;
}

// ── A NAME IS WHAT SOMEBODY CALLED THE FUND. AN ID IS HOW WE FIND IT ───────
//
// ── The defect, found in production and by nothing else (wsHP run 1) ───────
// wsHN renamed 22 rows away from titles that were a government department's
// name, and it worked: no row is TITLED that any more. Two of the seven rows a
// real founder was handed then read
//
//     Régime cadre exempté ... pour la période 2024-2026
//       · rnd  sa 111728  ministere de l economie et des finances ·
//
// because the row disambiguator's last-resort token was the instrument's own
// id with the underscores turned into spaces. `nameableBody` above refuses to
// name a ministry as a door; the id fragment put that same ministry in front
// of the founder as prose with the refusal intact. A rename a slug undoes is
// not a rename, and every offline harness was green.
//
// ── The property ──────────────────────────────────────────────────────────
// A ROW'S DISPLAYED NAME IS BUILT ONLY OUT OF TEXT SOMEBODY WROTE ABOUT THE
// FUND: its own title, a body the register supports naming, the region its
// awards land in, the code it was notified under, what kind of capital it is.
// An internal identifier is none of those, and a fallback that reveals one is
// not a name.
//
// ── The test, for a case nobody has seen ──────────────────────────────────
// NOT a register of forbidden fragments. A slug is whatever the loader built
// out of whatever the register published, so the next one is unguessable by
// construction — a list of the ones we have met would fail this repo's own
// enumeration rule. Ask the question directly instead: flatten the text and
// the id the same way, and any word the two share that NO field a human wrote
// accounts for reached the page from the store rather than from the fund,
// whatever it happens to spell this time.
//
// Two callers, one definition, and they hold different fields — the build
// check holds the corpus record, `scripts/prodcheck.ts` holds only what the
// deployment served a founder. So the accounted-for text is an ARGUMENT, not
// a field list read off a type: each caller passes what it can defend, and
// neither can quietly widen the other's.
//
// What a caller must NOT pass is `administeringBody` raw. It holds the
// ministry's name too, and admitting it here would license precisely the
// laundering this exists to catch: the register refused to print that body,
// and an id fragment spelling it is the refusal with the evidence standard
// removed.

/** Accent-, case- and punctuation-insensitive words. A comparison basis, never
 *  a display form. */
function flatWords(s: string | null | undefined): string[] {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

/**
 * The words of `text` that came from the instrument's internal id and from
 * nothing anybody wrote about the fund. EMPTY is the only passing answer for
 * anything a founder is shown.
 *
 * `text` is what is RENDERED. Pass the string the founder reads, or the check
 * grades a value nobody is shown — which is how this defect survived every
 * offline harness in the first place.
 */
export function internalIdWordsIn(
  text: string,
  instrumentId: string | null | undefined,
  /** Every field whose text a human authored ABOUT this fund, and which this
   *  caller can defend showing. */
  humanFields: readonly (string | null | undefined)[],
): string[] {
  const id = flatWords(instrumentId);
  if (!id.length) return [];
  const human = new Set(humanFields.flatMap(flatWords));
  const fromId = new Set(id.filter((w) => !human.has(w)));
  return [...new Set(flatWords(text).filter((w) => fromId.has(w)))];
}

/**
 * The parts of a published name the DISAMBIGUATOR added, if any.
 *
 * A row's name is "<the fund's own title>[ · <qualifier>]*[ · via <body>]".
 * The title is whatever the register calls the fund and is not ours to judge
 * here; the `via` half is a body and is judged by FUND-7, which is a different
 * question with a different standard. What is left is what this file's
 * property is about.
 *
 * Returns [] for a name nothing was appended to, which is the common case.
 */
export function qualifierSegments(name: string): string[] {
  const { what } = splitDoor(name);
  return what.split(SEGMENT_JOIN).slice(1).map((s) => s.trim()).filter(Boolean);
}

/** How a qualifier is joined to a name. One spelling, so the code that appends
 *  and the code that reads it back cannot disagree. */
export const SEGMENT_JOIN = " · ";
