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
 * A third basis, `closed_beneficiary_list`, was added on 2026-08-07 and REMOVED
 * the same day. It was not a kind of date: it said the participants were fixed
 * by the decision that created the row, so there was no window and never had
 * been one. That is a true statement about eleven IPCEI rows and it does not
 * belong here, because this axis answers "when did the window shut" and the
 * answer for those rows is that the question does not apply.
 *
 * Two concrete harms, not just tidiness. It made the corpus assert "IPCEI is
 * closed", which is false — the Commission's Design Support Hub lists nine
 * IPCEI candidates in the design phase and Estonia's expression-of-interest
 * call is open until 31.08.2026. And it forced `isClosed()` to test the basis
 * BEFORE the date, special-casing the one value that was not a date inside the
 * function whose entire contract is date interpretation.
 *
 * "This row is not something anyone can apply to" now lives on its own axis:
 * `route_status` in lib/intelligence/offerRoute.ts. See
 * project-mgmt/findings/workstream_y_ipcei_reversal.md.
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
} as const;

export type SchemeEndBasis =
  (typeof SCHEME_END_BASIS)[keyof typeof SCHEME_END_BASIS];

/**
 * Does the register that publishes this instrument state an application window
 * for it? Recorded per row when the extractor runs, from what the SOURCE
 * publishes — never from whether a value reached us.
 *
 * The distinction the whole degradation policy needs is between two things the
 * corpus otherwise records in the same NULL: "this row has no closing date"
 * and "this row is not the kind of thing that has one". Only the first is a
 * gap a stale copy can be wrong about.
 *
 * ── The unit is the OBJECT WE HOLD, not the agency ────────────────────────
 * Vinnova is the case that forces this. `data.vinnova.se` publishes
 * `Stangningsdatum` on every `ansokningsomgang` — so "does Vinnova publish
 * closing dates" is yes. But our 50 Swedish rows are PROGRAMMES, and a round
 * closing does not close the programme it ran under; a new round opens under
 * the same row. The register states no window for the object we hold, and
 * `load_vinnova_call_eligibility.py` already refuses to write one for exactly
 * that reason. Answering about the agency instead of about the row would
 * withhold fifty live programmes to protect against a date that was never a
 * claim about them. This is the same separation Rule Zero draws between the
 * register artefact and the thing a founder applies to.
 */
export const SOURCE_WINDOW_POLICY = {
  /** The register states a closing date for objects of this kind. A row of
   *  ours carrying none is therefore a gap in OUR copy, and a copy taken
   *  before the window was loaded cannot be told from a fund that has none. */
  publishesWindow: "publishes_window",
  /** The register's record for objects of this kind has no closing date in it
   *  at all. Its silence is the register's and not ours, so no copy of any
   *  age is missing anything. */
  publishesNoWindow: "publishes_no_window",
  /** The register carries the window field and states, for THIS object, that
   *  there is no closing date. A statement, not a silence — the same class of
   *  evidence as `declared_window`, and it decays the same way. */
  declaresOpenEnded: "declares_open_ended",
} as const;

export type SourceWindowPolicy =
  (typeof SOURCE_WINDOW_POLICY)[keyof typeof SOURCE_WINDOW_POLICY];

/** The two values under which a row with no loaded window is still confirmable:
 *  in both, the register itself accounts for the absence. Anything else — a
 *  window-publishing register, or no recorded answer at all — leaves the
 *  absence unexplained, which is the state a stale copy manufactures. */
export function windowAbsenceIsTheRegisters(policy?: string | null): boolean {
  return policy === SOURCE_WINDOW_POLICY.publishesNoWindow ||
    policy === SOURCE_WINDOW_POLICY.declaresOpenEnded;
}

/** The minimum a row must expose to be judged. Deliberately narrow, so the
 *  Postgres rows, the JSON snapshot and the SQLite rows can all satisfy it. */
export interface LivenessFacts {
  schemeEndDate?: string | null;
  schemeEndBasis?: string | null;
  lastYear?: number | null;
  successorScheme?: string | null;
  /** See `SOURCE_WINDOW_POLICY`. On the ROW and not on the observation,
   *  deliberately: an observation is computed from the corpus in hand, and
   *  anything computed from the corpus in hand is what self-cancelled. */
  sourceWindowPolicy?: string | null;
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

// ── Can we CONFIRM this row is open? ───────────────────────────────────────
//
// `isClosed()` answers "what does this corpus say". This half answers the
// question a founder's request actually turns on: "is what this corpus says
// about THIS row still worth acting on".
//
// ── The defect ────────────────────────────────────────────────────────────
// `hydrateDbInstruments()` is Postgres-first and falls back to the committed
// snapshot on any failure — a 2s statement timeout on a loaded database is
// enough. Measured on the pinned 150-pair sample, 2026-08-06:
//
//                     founders shown >=1 closed call in top 5   dead calls in pool
//   Postgres                       0%                                  1.1
//   snapshot fallback             26%                                 20.3
//
// The whole gap was `scheme_end_date`. 86 application deadlines had been loaded
// into Postgres since the snapshot was cut; for every one of them the snapshot
// held `schemeEndDate: null` and went on offering the call. A quarter of
// founders were pointed at a fund whose window had shut.
//
// ── Why this is per row and not a banner ──────────────────────────────────
// "Am I on the snapshot" is the wrong question — it condemns 817 publishable
// rows for the sake of 80. The right one is asked of each row: what is its
// openness actually resting on?
//
//   declared_window   an end date that has not passed. The register states the
//                     window; a store being a few hours behind does not make a
//                     future date untrue.
//   observed_renewal  a notified duration expired and aid was granted after it.
//                     Both facts are on the row.
//   no_deadline_recorded  nothing declares an end. Openness is inferred from
//                     the corpus holding no deadline — and THAT is the
//                     inference a stale store gets wrong, because a deadline
//                     loaded after the cut is indistinguishable from a fund
//                     that has none.
//
// Only the third is at risk, and only where the register in question publishes
// application windows at all. Where it does not, absence is the register's
// steady state and suppressing it would answer a blip by deleting half the
// product. That fact — does this row's register state a closing date for it —
// is `sourceWindowPolicy`, and it is the axis this whole half turns on.
//
// ── Why that fact may NOT be read off the copy ────────────────────────────
// Two versions of it were built and both were read off the rows in front of
// us: first "has any member of this population ever carried a call deadline",
// then "do MOST members carry one". The second is strictly better on a current
// corpus — it separates a register of convocatorias from a catalogue that
// contains a few, which the membership test could not — and both are
// SELF-CANCELLING, for a reason no amount of refining the proportion fixes:
//
//     a copy stale enough to be dangerous has no deadlines in it, so every
//     population reads as one that does not publish them, and the rule that
//     exists for exactly that copy withholds nothing.
//
// Measured, 2026-08-07, on the copy pushed back to the shape it had before the
// call registers were loaded: 812 rows offered, 0 withheld, 84 of them closed
// according to the live register. Identical under both versions. The clause
// that did fire was `basis_not_supplied`, which is a test of the copy's SCHEMA
// and not of its currency, and it withheld 381 of 814 rows to do it.
//
// ── So the fact is recorded, not inferred ─────────────────────────────────
// `source_window_policy` is written per row AT ETL TIME from what the register
// publishes, independently of whether a value came back. A copy carries it
// however far behind it has fallen, which is the property "derived from the
// rows present" can never have. See `SOURCE_WINDOW_POLICY` below for the three
// values and ETL/terms/assign_source_window_policy.py for how each row gets
// one; data/reference/source_window_policy.json holds the per-feed evidence.
//
// Establishing it meant reading the registers rather than our own columns, and
// the answer contradicted what the proportion had inferred. The proportion read
// `national_dev_banks|FR` at 7.4% dated and concluded ADEME is a catalogue of
// standing aids. ADEME's register says otherwise: of 107 dispositifs on the
// Transition Écologique des Entreprises portal — the source page every one of
// our ADEME rows already cites — 86 state a `Date de fin de l'aide`, and 38 of
// those dates have already passed. The open-data extract we ingest carries a
// `date_cloture` column that is empty for 93 of them. Absence in our copy was
// never the register being silent; it was the extract being thin, on the one
// population the proportion had cleared BECAUSE our copy was thin.
//
// That is why the policy may not be derived from loaded values at any grain.
// The two are the same mistake at different resolutions.
//
// ── A window we CLEARED is an answer, not a silence ───────────────────────
// `publishableInstruments()` republishes a closed registration under its
// successor and nulls the end date, deliberately: the date belonged to the
// registration that expired and we do not hold the successor's. That row's
// openness then rests on the register's own `successor_scheme`, which is a
// declared fact sitting on the row — not on our corpus happening to hold no
// deadline. Reading it as absence withheld two Spanish convocatorias that
// Postgres offers, off a field the product had emptied on purpose. It is the
// same confusion check_degradation.ts documents from the other side, where
// reading closure off the raw row called seven redirected schemes dead.
//
// ── NULL is not "open" ────────────────────────────────────────────────────
// A store that does not carry `schemeEndBasis` at all cannot be asked any of
// this: it cannot tell a notified duration from a call deadline. The
// 2026-08-06 snapshot was exactly that store. An absent field therefore reads
// as UNCONFIRMED, never as open — the reading that left 80 dead Spanish calls
// proposable.
//
// The same holds, and matters more, for `sourceWindowPolicy`. A row with no
// recorded answer is not a row whose register is silent; it is a row nobody has
// asked about. Reading NULL as "publishes no window" would restore the exact
// defect this column replaces — an unexamined absence taken for a fact — and
// would do it invisibly, because a fresh corpus and an unclassified one look
// identical from inside the rule. `check_liveness.ts` fails the build when a
// publishable row carries no policy, so the unclassified state is loud rather
// than expensive.

/** What a row's openness is resting on. `closed` rows are excluded upstream and
 *  never reach a founder; the other four are the ways a row can be open. */
export type OpennessEvidence =
  | "closed"
  | "declared_window"
  | "observed_renewal"
  | "successor_registration"
  | "no_deadline_recorded"
  | "basis_not_supplied";

export function opennessEvidence(row: LivenessFacts, asOf: string = today()): OpennessEvidence {
  if (isClosed(row, asOf)) return "closed";
  const end = row.schemeEndDate ? String(row.schemeEndDate).slice(0, 10) : "";
  // A future end date closes nothing whatever its basis, so a missing basis is
  // not an input to this row's verdict and cannot invalidate it.
  if (end && end >= asOf) return "declared_window";
  // A basis with no date is not a state any loader writes — the two columns are
  // populated together, on all 1,084 rows of the 2026-08-07 corpus. It is the
  // signature of the successor redirect, which clears the date of a superseded
  // registration and keeps everything else. Openness then rests on the
  // register naming a successor, which is ON the row, so a copy holding no
  // deadline for it is not an inference at all.
  if (!end && row.successorScheme && row.schemeEndBasis) return "successor_registration";
  // Past-and-open is only reachable through the notified-duration clause, which
  // reads the basis; if the store did not supply the field we did not evaluate
  // that clause, we defaulted through it.
  if (!("schemeEndBasis" in row) || row.schemeEndBasis === undefined) return "basis_not_supplied";
  if (end) return "observed_renewal";
  return "no_deadline_recorded";
}

/** Where the rows being judged came from.
 *
 *  It carried a second field until 2026-08-07 — `populationRecordsDeadlines`,
 *  supplied by the caller from a tally over the corpus in hand. That is gone,
 *  and its absence is the point: an observation is by definition computed from
 *  the copy, so any fact placed here is a fact the copy can destroy. The one
 *  the rule needs now lives on the ROW, as `sourceWindowPolicy`. */
export interface LivenessObservation {
  /** `postgres` is the register itself — there is nothing fresher to check a
   *  row against, so every row it supplies is confirmed by definition. Any
   *  other source is a copy taken at some past instant. */
  source: "postgres" | "snapshot" | "none";
}

/**
 * Why this row's openness cannot be confirmed, or null when it can.
 *
 * The returned string is founder-independent and safe to log: it describes the
 * row and the store, never the applicant.
 */
export function unconfirmedOpen(
  row: LivenessFacts,
  obs: LivenessObservation,
  asOf: string = today(),
): string | null {
  // The live register. Whatever it says is the freshest answer that exists.
  if (obs.source === "postgres") return null;
  switch (opennessEvidence(row, asOf)) {
    case "closed":
      // Not shown regardless; the caller has already dropped it.
      return null;
    case "declared_window":
    case "observed_renewal":
    case "successor_registration":
      return null;
    case "basis_not_supplied":
      return "the store did not supply scheme_end_date_basis, so the liveness " +
        "rule was not evaluated — this row is unlabelled, not open";
    case "no_deadline_recorded":
      // The one clause a stale copy can be wrong about, and the only one that
      // reads `sourceWindowPolicy`. Both confirming values are STATEMENTS by
      // the register about the absence; anything else leaves it unexplained.
      if (windowAbsenceIsTheRegisters(row.sourceWindowPolicy)) return null;
      return row.sourceWindowPolicy
        ? "openness rests on this copy holding no application deadline, and " +
          "this row's register does state one for funds like it — a window " +
          "loaded since this copy was taken would close it"
        : "no source has been asked whether this row's register states an " +
          "application window, so an absent deadline here means nothing " +
          "either way";
  }
}

/**
 * Rows whose recorded policy their own corpus contradicts.
 *
 * `populationRecordsDeadlines()` stood here until 2026-08-07 and DERIVED the
 * policy from the rows: a register was taken to publish windows when most of
 * its rows carried one. That is the self-cancelling form — a stale copy has no
 * dates, so it reads every register as silent — and it is now recorded at ETL
 * time instead. This is what remains of reading the corpus, and the direction
 * is the whole difference:
 *
 *   the copy may FALSIFY a declaration. It may never SUPPLY one.
 *
 * A row declared `publishes_no_window` that nonetheless carries a call
 * deadline is a contradiction with exactly one honest reading — the
 * declaration is stale, because some loader has started writing windows for
 * that feed since it was made. That is the failure mode a per-feed declaration
 * has and a derived proportion does not, so it gets a test.
 *
 * Falsification survives staleness for the same reason derivation does not: it
 * can only ever fire on evidence that IS present. A thin copy produces no false
 * accusations, it just proves nothing — which is the correct behaviour for a
 * check, and the fatal one for a rule.
 *
 * `declares_open_ended` is deliberately not tested this way. It is a per-ROW
 * statement, so a sibling carrying a date contradicts nothing; only the row's
 * own date would, and a row with both is `declared_window` and never reaches
 * this axis.
 */
export function contradictsDeclaredPolicy<T extends LivenessFacts>(row: T): boolean {
  return row.sourceWindowPolicy === SOURCE_WINDOW_POLICY.publishesNoWindow &&
    row.schemeEndBasis === SCHEME_END_BASIS.callDeadline;
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
    `(${c}scheme_end_date IS NOT NULL AND ${past}` +
    ` AND NOT (COALESCE(${c}scheme_end_date_basis, '') = '${SCHEME_END_BASIS.notifiedDuration}'` +
    ` AND ${c}last_year IS NOT NULL AND ${c}last_year > ${endYear}))`
  );
}
