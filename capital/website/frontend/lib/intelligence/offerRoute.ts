/**
 * Is this row something a founder can APPLY TO? THE definition — one place.
 *
 * ── Why this axis exists, separately from liveness ────────────────────────
 * `liveness.ts` answers "has the window shut". This answers a prior question:
 * *was there ever a window, and is this row an offer at all?* Conflating them
 * is not a tidiness problem, it is how three separate populations of non-funds
 * got into the corpus and, twice, got hidden rather than fixed:
 *
 *   GB, 16 leaves    — one row per distinct value of UKRI Gateway to Research's
 *                      `grantCategory`. "Collaborative R&D", "Feasibility
 *                      Studies", "Department for Science Innovation &
 *                      Technology". A founder applies to a *competition*; that
 *                      field classifies an award that was already made.
 *   IPCEI, 11 leaves — one row per Commission decision approving a wave. The
 *                      decision names its beneficiaries. A founder applies to a
 *                      *national expression-of-interest call* run by their own
 *                      Member State, and then to that state's implementing
 *                      scheme.
 *   ES               — rows named after the legal citation that enabled the
 *                      aid. A founder applies to a *convocatoria*.
 *
 * The shared structure, which is the property this axis records:
 *
 *   THE ROW'S IDENTITY WAS TAKEN FROM A REGISTER OF AID ALREADY GRANTED, USING
 *   A FIELD THAT DESCRIBES THE AWARD RATHER THAN IDENTIFYING THE OFFER THE
 *   RECIPIENT APPLIED TO.
 *
 * Marking such a row "closed" makes the symptom disappear and leaves a non-fund
 * in the corpus. That is what `closed_beneficiary_list` did for six hours on
 * 2026-08-07, and it also made the corpus assert that IPCEI is closed — which
 * is false. Nine IPCEI candidates are in the design phase and Estonia's call is
 * open until 31.08.2026.
 *
 * ── The trap on the other side ────────────────────────────────────────────
 * The tempting test is "no `application_url` ⇒ not a fund". It is wrong and it
 * is wrong in the expensive direction: 507 of 806 publishable rows have no
 * recorded route, overwhelmingly real SATR schemes whose route we have simply
 * never harvested. A MISSING ROUTE IS A GAP IN OUR COLLECTION, NOT A FACT ABOUT
 * THE WORLD. So `unrecorded` and `none` are different states and only the
 * second withholds a row.
 *
 * ── Durability, which is why this is a column and not a basis ─────────────
 * `scheme_end_date_basis` is in `BUILT_COLUMNS` in
 * ETL/events/load/populate_funding_instruments.py, which does
 * `DELETE FROM funding_instruments` and restores only the columns it does NOT
 * build. Any judgement written there is erased by the next instrument rebuild —
 * the eleven IPCEI rows would have come back offerable, silently, with no
 * eligibility text. `route_status` is deliberately absent from `BUILT_COLUMNS`,
 * so the preserve-by-difference pass carries it across every rebuild.
 *
 * See project-mgmt/findings/workstream_y_ipcei_reversal.md.
 */

/** Whether an application route is known to exist for this row. */
export const ROUTE_STATUS = {
  /**
   * A route is recorded from an official source: a body that accepts
   * applications, a URL, a call, a submission address. The row is an offer and
   * we can say how to take it up.
   */
  attested: "attested",
  /**
   * We believe this is an offer and have not sourced its route. The default,
   * and by far the largest state. NOT a reason to withhold the row: the
   * Commission's register says these are schemes, and a scheme has a route in
   * by definition even when we have not written it down.
   */
  unrecorded: "unrecorded",
  /**
   * The official source establishes there is NO route in. Aid fixed to a named
   * beneficiary list by the decision that granted it, or a row whose identity
   * is a register artefact rather than an offer.
   *
   * This is the only value that withholds a row, and it is the only value that
   * requires a source. A row is not demoted to a non-fund by assertion — that
   * is the mistake being corrected, in which every input to "IPCEI is closed"
   * was a fact about our own columns.
   */
  none: "none",
} as const;

export type RouteStatus = (typeof ROUTE_STATUS)[keyof typeof ROUTE_STATUS];

/** The minimum a row must expose to be judged, so Postgres rows, the JSON
 *  snapshot and the SQLite rows can all satisfy it. */
export interface OfferRouteFacts {
  routeStatus?: string | null;
  /** Where a founder submits. Recorded from the body's own page. */
  applicationUrl?: string | null;
  /** A dated window from an official register — a call's deadline, or a
   *  notified scheme's expiry. Either way the register is holding a window
   *  open for this row, which a record of past aid never has. */
  schemeEndDate?: string | null;
}

/**
 * May this row be PROPOSED to a founder as something to apply to?
 *
 * Absent or unrecognised is `true`. That is not laxity, it is the same
 * conservative direction as `isClosed` on a row with no end date: the corpus
 * defaults to what it can defend, and it can defend "this is a scheme in the
 * Commission's register" far more easily than "nobody can apply to this".
 * Withholding requires the explicit, sourced `none`.
 */
export function hasOfferRoute(row: OfferRouteFacts): boolean {
  return row.routeStatus !== ROUTE_STATUS.none;
}

/**
 * Does the corpus record ANYTHING a founder could act on to reach this row?
 *
 * This is the measurable half of the axis. `hasOfferRoute()` above says whether
 * a row may be proposed and is a JUDGEMENT, made once per row by a human
 * reading an official source. This one is an OBSERVATION over columns we
 * already hold, and it is what `check_offer_route.ts` ratchets, because a
 * judgement nobody has made yet cannot fail a build.
 *
 * ── The three forms of evidence, and the one deliberately excluded ────────
 * The PM's formulation is "an application route, a deadline, a body that
 * accepts applications". Two of those three are counted here:
 *
 *   `applicationUrl`  — where you submit. The strongest form.
 *   `schemeEndDate`   — a dated window an official register is holding open for
 *                       this row, whether a call's deadline or a notified
 *                       scheme's expiry. Weaker than a URL, and enough: a
 *                       register that records a window is describing something
 *                       still running, which a record of past aid never is.
 *   `route_status = 'attested'` — a route sourced by hand where neither column
 *                       can carry it (an email address, a paper form).
 *
 * `administering_body` is NOT counted, and that exclusion is the load-bearing
 * design decision in this file. It is derived from award attribution — WHO
 * PAID — so every row built out of a register of aid already granted has one by
 * construction. Counting it would make the test structurally blind to the exact
 * population it exists to catch: an artefact of a payment record always has a
 * payer, and never has an application desk. (It happens that the eleven IPCEI
 * rows carry no body either, verified in Postgres 2026-08-07. That is luck, and
 * building the test on it would be building on an accident.)
 *
 * ── What FAILING this does NOT mean ───────────────────────────────────────
 * Not that the row is a non-fund. 379 of 806 publishable rows fail it today,
 * overwhelmingly real schemes whose route we have never harvested. A row that
 * fails is a row we cannot yet tell apart from an artefact — which is why the
 * check ratchets the COUNT rather than withholding the rows.
 */
export function hasRecordedRoute(row: OfferRouteFacts): boolean {
  return (
    row.routeStatus === ROUTE_STATUS.attested ||
    Boolean(row.applicationUrl) ||
    Boolean(row.schemeEndDate)
  );
}

/** SQL for the same predicate, so Python and SQL consumers do not restate it in
 *  prose. `col` prefixes the column for use inside a JOIN. Both dialects are
 *  identical here — no date arithmetic — but both are emitted so a future
 *  divergence has one place to appear. */
export function hasOfferRouteSql(opts: { col?: string } = {}): string {
  const c = opts.col ? `${opts.col}.` : "";
  return `(COALESCE(${c}route_status, '') <> '${ROUTE_STATUS.none}')`;
}
