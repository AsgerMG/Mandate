/**
 * Is this fund still open? THE definition — there is exactly one, and this is it.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * "Is this fund still open" was being decided in five places from two different
 * sources: `publishableInstruments()` here, `live_ids()` in
 * ETL/terms/load_scheme_text.py, `publishable()` in scripts/
 * measure_country_class.ts, and hand-written SQL in ETL/terms/emit_peer_prior.py
 * and ETL/terms/extend_recall_set.py — each carrying a "mirrors
 * publishableInstruments()" comment. That comment IS the bug. Twice in one
 * night the same confusion shipped from two of those places independently: a
 * fetch record's `status: closed` turned out to be a CALL window, and then, at
 * corpus scale, a SATR notification expiry was read as a scheme closure and hid
 * 306 leaves including `Fondo di garanzia per le PMI` (13,892 awards).
 *
 * So: this module is the definition, `scripts/emit_liveness.ts` projects it to
 * data/liveness.json for the Python and SQL consumers, and
 * `scripts/check_liveness.ts` fails the build if that projection is stale.
 *
 * ── The property, and why the obvious test is wrong ───────────────────────
 * `scheme_end_date` carries TWO different kinds of date under one name, and
 * whether the date closes anything depends entirely on which it is:
 *
 *   notified_duration — the expiry of the State-aid NOTIFICATION for a standing
 *     scheme (SATR `caseMeasureEndDate`). Renewal is routine and our snapshot
 *     of the register is stale, so expiry alone is not closure.
 *   call_deadline — the date THIS instrument stopped accepting applications
 *     (a convocatoria's plazo, an appel a projets' `date_cloture`). Past means
 *     closed, permanently: a call does not reopen, a successor call is a new row.
 *
 * A third basis was added on 2026-08-07 and is not a kind of DATE at all:
 * `closed_beneficiary_list` says the participants were fixed by the decision
 * that created the row, so there is no window and never was one. See the
 * constant for the evidence.
 *
 * The tempting single test — "it awarded money after its end date, so it is
 * still alive" — was measured and does NOT separate them. 50 of Spain's 80
 * correctly-closed convocatorias award after their end date, and 3 of the 6
 * ADEME calls unpublished on 2026-08-05 do too. An award date is a GRANTING
 * date, not an application date: every call in the corpus publishes its
 * decisions after its deadline. Adopting that test would have re-published 50
 * dead Spanish calls.
 *
 * The same observation is decisive in the other population, for a legal reason:
 * aid may not lawfully be granted under a notified or block-exempted measure
 * after its notified duration expires unless the measure was prolonged. So an
 * award dated after a `notified_duration` is positive evidence of renewal —
 * observed behaviour overruling a declared window — while an award dated after
 * a `call_deadline` is just the decision tail and means nothing.
 *
 * ── Granularity ───────────────────────────────────────────────────────────
 * Postgres holds award recency as `last_year`, a year. That is the conservative
 * direction: 94% of notified durations expire on 12-30 or 06-29 (the statutory
 * GBER boundary days), so a same-year award almost certainly precedes the
 * expiry and the row correctly stays closed. Only a STRICTLY later award year
 * counts as evidence of renewal.
 */

/** Which register supplied `scheme_end_date`, and therefore what it means.
 *  Recorded at each write site; see ETL/lib/liveness.py for the Python view. */
export const SCHEME_END_BASIS = {
  /** SATR `caseMeasureEndDate` — a notification's expiry, routinely renewed. */
  notifiedDuration: "notified_duration",
  /** This instrument's own application deadline — permanent once passed. */
  callDeadline: "call_deadline",
  /**
   * The participants were FIXED by the decision that created this row: aid
   * approved for a named beneficiary list, with no route in for anyone not
   * already on it.
   *
   * ── Why this is a basis and not a date ────────────────────────────────
   * The other two bases answer "when did the window shut". This one answers a
   * prior question — there was never a window. An individual State-aid
   * approval (IPCEI waves, ad hoc aid, rescue-and-restructuring decisions) is
   * a finding about aid already allocated to companies the Commission names.
   * Its `scheme_end_date` is therefore not merely unknown, it is not a
   * quantity the row has, so this basis closes the row WITHOUT one.
   *
   * The evidence is in the rows' own harvested text: "The Member States only
   * grant support to the beneficiaries listed in recital (248) above and the
   * funding is not available to all undertakings in a comparable situation."
   * A row whose own source says that cannot be an application route.
   *
   * The money is still real and still reachable — through the NATIONAL scheme
   * that implements the approval, which is its own row in this corpus (the
   * German IPCEI-CIS Förderrichtlinie under SA.112879, for one). Dropping the
   * approval keeps the door and removes the wall with the picture of a door
   * painted on it.
   */
  closedBeneficiaryList: "closed_beneficiary_list",
} as const;

export type SchemeEndBasis =
  (typeof SCHEME_END_BASIS)[keyof typeof SCHEME_END_BASIS];

/** The minimum a row must expose to be judged. Deliberately narrow, so the
 *  Postgres rows, the JSON snapshot and the SQLite rows can all satisfy it. */
export interface LivenessFacts {
  schemeEndDate?: string | null;
  schemeEndBasis?: string | null;
  lastYear?: number | null;
  successorScheme?: string | null;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Has the declared window passed AND does observed activity agree?
 *
 * `asOf` is injectable so tests can pin a date; it defaults to today.
 * A row with no end date is open — that is not an assumption, it is the only
 * thing the corpus knows, and it is why Spain's 80 convocatorias were offerable
 * until their deadlines were loaded.
 */
export function isClosed(row: LivenessFacts, asOf: string = today()): boolean {
  // Tested BEFORE the date, because this basis is the one case where there is
  // no date to test: the beneficiary list was closed by the decision itself.
  // Ordering it after the `!end` guard would make it a no-op on exactly the
  // rows it exists for.
  if (row.schemeEndBasis === SCHEME_END_BASIS.closedBeneficiaryList) return true;

  const end = row.schemeEndDate ? String(row.schemeEndDate).slice(0, 10) : "";
  if (!end || end >= asOf) return false;

  // An UNLABELLED end date is treated as a call deadline, i.e. it closes the
  // row. That is the safe direction and it is also the historical one: every
  // date written before the basis column existed either came from SATR (and is
  // backfilled to notified_duration by ETL/terms/backfill_end_date_basis.py) or
  // came from a call catalogue. Leaving it open would put closed calls back in
  // front of founders, which is the failure the ADEME pass fixed.
  if (row.schemeEndBasis !== SCHEME_END_BASIS.notifiedDuration) return true;

  // Notified duration: expiry is not closure on its own. Aid granted after it
  // is only lawful under a prolonged measure, so a strictly later award year is
  // evidence the notification was renewed and our snapshot is behind.
  const endYear = Number(end.slice(0, 4));
  if (row.lastYear != null && row.lastYear > endYear) return false;
  return true;
}

/** SQL for the same predicate, so the Python and SQL consumers do not restate
 *  it in prose. `col` prefixes columns for use inside a JOIN.
 *
 *  Dialect note: written for Postgres, where `scheme_end_date` is TEXT and must
 *  be cast to compare as a date. The SQLite consumers compare lexically, which
 *  is equivalent for ISO-8601 dates, and pass `sqlite: true`. */
export function closedSql(opts: { col?: string; sqlite?: boolean } = {}): string {
  const c = opts.col ? `${opts.col}.` : "";
  const past = opts.sqlite
    ? `${c}scheme_end_date < date('now')`
    : `${c}scheme_end_date::date < current_date`;
  const endYear = opts.sqlite
    ? `CAST(substr(${c}scheme_end_date, 1, 4) AS INTEGER)`
    : `EXTRACT(year FROM ${c}scheme_end_date::date)::int`;
  return (
    `(COALESCE(${c}scheme_end_date_basis, '') = '${SCHEME_END_BASIS.closedBeneficiaryList}'` +
    ` OR (${c}scheme_end_date IS NOT NULL AND ${past}` +
    ` AND NOT (COALESCE(${c}scheme_end_date_basis, '') = '${SCHEME_END_BASIS.notifiedDuration}'` +
    ` AND ${c}last_year IS NOT NULL AND ${c}last_year > ${endYear})))`
  );
}
