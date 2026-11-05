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
 * reference/liveness.json for the Python and SQL consumers, and
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
 * counts as evidence of renewal, and only while that year is still within the
 * register's own reporting lag — see `RENEWAL_EVIDENCE_HORIZON_YEARS`, which is
 * what stops a prolongation evidenced in 2022 being read as openness in 2026.
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

/**
 * WE MODEL A CALL. THE FUNDER RUNS A PROGRAMME.
 *
 * `call_deadline` above says a passed deadline closes a row "permanently: a
 * call does not reopen, a successor call is a new row". The first half is true.
 * The second is a statement about OUR SCHEMA that was being read as a statement
 * about the world, and the world disagrees: the successor call is a new row
 * only if somebody loaded it, and when nobody has, suppressing the row we hold
 * deletes a programme that is running.
 *
 * ── What that cost, measured against the funders' own pages ───────────────
 * `project-mgmt/evidence/wsgl_closed_calls_2026-08-13.jsonl` — 15 rows, each
 * with the URL that was read and a verbatim quote in the source language:
 *
 *   3 rows are OPEN RIGHT NOW.     One of them is ADEME's DECARB IND, whose
 *                                  2e relève runs 07 May – 07 Sep 2026 against
 *                                  a row this file kills at 2024-03-07.
 *   8 rows are BETWEEN CALLS.      The programme continues; this round shut.
 *   4 rows are genuinely RETIRED.  The funder's page says it ended.
 *
 * 11 of 15 rows, 14 of 20 founders, suppressed on the expiry of one call.
 *
 * ── THE PROPERTY, and its test for a fund nobody has seen ─────────────────
 *
 *     SUPPRESSING A ROW ON A PASSED APPLICATION DEADLINE IS A CLAIM THAT THE
 *     PROGRAMME ENDED. IT MAY BE MADE ONLY WHERE NOTHING RECORDED ON THE ROW
 *     CONTRADICTS IT.
 *
 * The test, for a fund added next month, in a country and a language nobody
 * here has read: ask its own funder's page whether the programme has run, or
 * is running, a round after the one we hold. That question has an answer for
 * every fund in every register, it is answerable from the source and from
 * nowhere else, and the answer is what `CALL_RECURRENCE` records. No fund,
 * feed, country or date appears in the rule.
 *
 * ── WHY IT MAY NOT BE DERIVED FROM THE CORPUS, measured not asserted ──────
 * The obvious cheap route is to look for a later EDITION of the same programme
 * among our own rows — wsCL's edition relation (`scripts/_wscl_recurrence.ts`)
 * already states that as a property and validates its groups against an
 * independent embedding. Run against the 113 rows this file closes on a call
 * deadline, and scored against wsGL's 15 funder-page verdicts, it fires on
 *
 *   between_calls  2/8 recovered      open  0/3 recovered      retired  0/4
 *
 * and the numbers do not move across the whole θ band 0.30–0.90 (3/8 at 0.30).
 * It recovers NONE of the three programmes that are open today, ADEME's among
 * them, for a reason no threshold fixes: a programme is invisible to us in
 * exactly the case that matters, when we never loaded its later round. The
 * corpus cannot supply this, and `liveness.ts`'s own direction says why —
 * the copy may FALSIFY a declaration, it may never SUPPLY one.
 *
 * So the fact is RECORDED, per row, from the funder's own source, exactly as
 * `SOURCE_WINDOW_POLICY` and `ROUTE_STATUS` are. NULL is not "recurs": a row
 * nobody has asked about stays suppressed, which is today's behaviour, so the
 * unexamined state is the safe one and it is counted rather than assumed.
 *
 * ── WHAT THIS MAY NOT SAY ─────────────────────────────────────────────────
 * `recurs` is a statement that the programme CONTINUES PAST the round we hold.
 * It is not a reopening date and it must never be rendered as one. We do not
 * hold the next window — that is the whole reason the row is in this state —
 * and supplying a date the funder never gave is the failure this module exists
 * to prevent, one axis over.
 *
 * ── HOW TO SEE WHAT THIS LIFTED, WITHOUT SPENDING ANYTHING ────────────────
 *   scripts/_wsgt_lifted.ts    every row this axis takes out of suppression,
 *                              with the funder verdict and source behind each
 *   scripts/_wsgt_caveats.ts   the sentence a founder is actually shown for
 *                              each of them, which is where a reopening date
 *                              would appear if this module ever leaked one
 *   scripts/_wsgt_founder.ts   the end-to-end case: a French industrial-
 *                              decarbonisation founder reaching ADEME, whose
 *                              call we closed in March 2024 and which is
 *                              taking applications today
 */
export const CALL_RECURRENCE = {
  /** The funder's own source establishes that the programme has run, or is
   *  running, a round after the one this row holds. Requires a source: a row is
   *  not lifted out of suppression by assertion. */
  recurs: "recurs",
  /** The funder's own source establishes that this was the whole programme —
   *  a fixed envelope, a concluded call, an abolished scheme. Suppression is
   *  then the funder's statement and not our inference. */
  singleCall: "single_call",
} as const;

export type CallRecurrence =
  (typeof CALL_RECURRENCE)[keyof typeof CALL_RECURRENCE];

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
  /** See `CALL_RECURRENCE`. Recorded from the funder's own page, never derived
   *  here: the derivation was built, measured and is dead (0/3 on the rows that
   *  are open today). Absent means nobody has asked, which suppresses. */
  callRecurrence?: string | null;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * HOW LONG AN OBSERVED RENEWAL GOES ON MEANING SOMETHING.
 *
 * ── The defect, found on a real founder's memo ────────────────────────────
 * On 2026-08-18 `npm run prodcheck` published, as row 5 of seven, SA.40453 —
 * *Régime cadre exempté ... PME pour la période 2014-2020*, `scheme_end_date`
 * 2020-12-30, basis `notified_duration` — with a working link, a EUR 980,817
 * typical award and the next step "confirm this regime is still accepting
 * applications". `betweenCalls` is the mechanism for a row whose window has
 * shut and it did not fire, for a reason that is not a bug in it: the row was
 * never CLOSED. `isClosed()` read `last_year = 2022 > 2020` and returned false,
 * so `callStatus()` returned `open` and never reached the recurrence question.
 * The row was not offered despite a shut window. It was offered as open.
 *
 * ── What the renewal clause may and may not conclude ──────────────────────
 * The clause above is right about the legal fact and wrong about its EXTENT.
 * Aid granted under a notified or block-exempted measure after its notified
 * duration is only lawful if the measure was prolonged, so an award in year Y
 * does establish a prolongation. It establishes one THROUGH YEAR Y. It says
 * nothing whatever about Y+1, and reading it as permanent openness is the
 * forbidden direction this file already names one axis over:
 *
 *     the copy may FALSIFY a declaration. It may never SUPPLY one.
 *
 * A 2022 award falsifies "this window shut in 2020". It does not supply a new
 * window running to today. Four years later the last thing anybody has stated
 * about SA.40453 is still an expiry in the past.
 *
 * ── THE PROPERTY, and its test for a fund nobody here has read ────────────
 *
 *     A ROW WHOSE OWN WINDOW HAS CLOSED IS NOT OFFERED AS OPEN. Its window is
 *     judged on the LATEST DATED FACT anybody has stated about it — the
 *     declared expiry, or a prolongation an award year evidences — and when
 *     that fact is in the past the row may be offered ONLY where the funder's
 *     own source says the programme continues past the round we hold, and then
 *     only WITH THE CAVEAT SHOWN.
 *
 * The test, for a fund loaded next year from a register in a language nobody
 * here reads: take every date the row carries that bears on its window, take
 * the latest, and ask whether it has passed. If it has, the row's own window
 * has closed and `CALL_RECURRENCE` is the only thing that may lift it — NULL
 * is not "recurs". No fund, feed, country, sector or date appears in the rule.
 *
 * ── WHY THE HORIZON IS TWO YEARS, measured rather than chosen ─────────────
 * "Latest dated fact has passed" is exact for a declared expiry and coarse for
 * an award year, because `last_year` is a YEAR and the register publishes with
 * a lag: an award granted this year may lawfully be unpublished for months, so
 * a live scheme routinely shows no award for the current year. Taken literally
 * the rule would close schemes that are running.
 *
 * So it is measured, on the one population whose openness is established
 * WITHOUT reference to any award year — rows whose declared notified duration
 * is still in the future. `scripts/_wshq_lag.ts`, live Postgres, 2026-08-18,
 * 228 such rows:
 *
 *   last award this year        43.4%   cumulative  43.4%
 *   last award 1 year ago       40.4%   cumulative  83.8%
 *   last award 2 years ago      12.3%   cumulative  96.1%
 *   last award 3 years ago       3.5%   cumulative  99.6%
 *
 * A horizon of 0 would call 56.6% of demonstrably-open rows stale; 1 year,
 * 16.2%; 2 years, 3.9%. Two years is where the register's own lag is spent,
 * and past it a silence is no longer explained by publication delay.
 *
 * It is a FIXED constant and deliberately not computed from the corpus at
 * request time, for the reason `populationRecordsDeadlines` was deleted: a
 * copy stale enough to be dangerous shows a long apparent lag, which would
 * widen the horizon exactly when it should narrow. The number above is a
 * measurement written down, not a reading taken. Re-take it with
 * `scripts/_wshq_lag.ts` and move the constant deliberately, in a commit that
 * says what moved.
 */
export const RENEWAL_EVIDENCE_HORIZON_YEARS = 2;

/** Is a prolongation evidenced by an award in `lastYear` still current as of
 *  `asOf`? Asked of the ROW's own year and the clock, so a fund loaded next
 *  year is judged by the same test with no edit anywhere. */
export function renewalIsCurrent(lastYear: number, asOf: string = today()): boolean {
  return lastYear + RENEWAL_EVIDENCE_HORIZON_YEARS >= Number(asOf.slice(0, 4));
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
  // backfilled to notified_duration by ETL/archive/terms/backfill_end_date_basis.py) or
  // came from a call catalogue. Leaving it open would put closed calls back in
  // front of founders, which is the failure the ADEME pass fixed.
  if (row.schemeEndBasis !== SCHEME_END_BASIS.notifiedDuration) return true;

  // Notified duration: expiry is not closure on its own. Aid granted after it
  // is only lawful under a prolonged measure, so a strictly later award year is
  // evidence the notification was renewed and our snapshot is behind.
  //
  // AND THAT EVIDENCE IS ITSELF DATED — see `RENEWAL_EVIDENCE_HORIZON_YEARS`.
  // An award in year Y establishes the measure was prolonged THROUGH Y and
  // nothing after it. Once Y is outside the register's own reporting lag the
  // renewal has stopped being current, the declared expiry is again the last
  // thing anybody has stated about this window, and the row is closed — which
  // is not the end of it, because `callStatus()` then asks the funder.
  const endYear = Number(end.slice(0, 4));
  if (row.lastYear != null && row.lastYear > endYear
      && renewalIsCurrent(row.lastYear, asOf)) return false;
  return true;
}

/**
 * THE THREE STATES A WINDOW CAN BE IN, and there are three and not two.
 *
 *   open           the window we hold has not passed, or its expiry closes
 *                  nothing (a renewed notification).
 *   between_calls  the window we hold HAS passed, and the funder's own source
 *                  says the programme continues past it. OFFERABLE, with the
 *                  caveat shown — see `project-mgmt/evidence/README.md`, which
 *                  has carried this word since before anything implemented it.
 *   shut           the window we hold has passed and nothing recorded on the
 *                  row contradicts the programme having ended. This is what
 *                  `isClosed()` alone used to mean, applied to every row.
 *
 * ── WHY `isClosed()` IS UNCHANGED, and this is layered on top ─────────────
 * `isClosed()` answers exactly one question — HAS THE WINDOW WE HOLD SHUT —
 * and the answer for a between-calls row is YES. That is not a technicality:
 * it is the fact the founder must be told. Widening `isClosed()` to mean "and
 * therefore gone" would have made the two inseparable again, and it would have
 * silently re-pointed `closedSql()`, `reference/liveness.json` and every Python and
 * SQL consumer projected from them at a different question. One definition per
 * question; this is the second question.
 *
 * `publishableInstruments()` asks THIS one, because publishability is what the
 * distinction changes. Everything else still asks `isClosed()` and gets the
 * same answer it always got.
 */
export type CallStatus = "open" | "between_calls" | "shut";

export function callStatus(row: LivenessFacts, asOf: string = today()): CallStatus {
  if (!isClosed(row, asOf)) return "open";
  return row.callRecurrence === CALL_RECURRENCE.recurs ? "between_calls" : "shut";
}

/** May this row be withheld on the strength of its own expired window?
 *
 *  The negation is the property: a fund whose programme recurs may not be
 *  suppressed on the expiry of one call. Stated as a predicate so a caller
 *  cannot restate it, and asked of the ROW, so a fund loaded next month is
 *  judged by the same test with no edit anywhere. */
export function isShut(row: LivenessFacts, asOf: string = today()): boolean {
  return callStatus(row, asOf) === "shut";
}

/** True when this row is offered DESPITE a window we hold having shut. The
 *  product owes the founder a caveat exactly here and nowhere else. */
export function isBetweenCalls(row: LivenessFacts, asOf: string = today()): boolean {
  return callStatus(row, asOf) === "between_calls";
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
// one; reference/source_window_policy.json holds the per-feed evidence.
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
  | "between_calls"
  | "declared_window"
  | "observed_renewal"
  | "successor_registration"
  | "no_deadline_recorded"
  | "basis_not_supplied";

export function opennessEvidence(row: LivenessFacts, asOf: string = today()): OpennessEvidence {
  // Asked before `closed`, because a between-calls row IS closed in the sense
  // `isClosed()` means and is offered anyway. Its openness rests on nothing —
  // it is not offered as open — which is why it is its own value here rather
  // than a sixth way of being open.
  if (isBetweenCalls(row, asOf)) return "between_calls";
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
    case "between_calls":
      // ── THE ONE STATE A STALE COPY CANNOT MAKE WRONG ────────────────────
      // Every other clause here defends against a copy that is behind the
      // register on a DEADLINE. This row is offered while asserting that the
      // deadline it holds has already passed, so a deadline loaded since the
      // copy was cut cannot falsify anything it says: the worst a fresher
      // store could hold is a later window, which would move the row towards
      // `open` and never towards withheld.
      //
      // Both halves of the claim it does make — the window we hold has shut,
      // and the funder's source says the programme continues — travel ON the
      // row. Neither is inferred from the corpus in hand, which is the
      // property this whole half turns on.
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
 *  ── IT IS STILL `isClosed`, AND THAT IS A KNOWN, BOUNDED DIVERGENCE ──────
 *  This projects the WINDOW test and nothing else, because that is what
 *  `isClosed()` means and this is its SQL. It deliberately does not project
 *  `isShut()`: `call_recurrence` is not a column in Postgres yet, so emitting
 *  SQL that reads it would break every Python consumer on the next run.
 *
 *  The consequence, stated rather than discovered later. Three consumers ask
 *  "may the product show this row" and get an answer that is now one row-class
 *  too narrow — `extend_recall_set.py` ("never make an instrument the right
 *  answer if the product may not show it"), `emit_peer_prior.py`, and
 *  `load_scheme_text.py`'s `live_ids()`. They will treat a between-calls row as
 *  unproposable while the brief offers it: the row gets no scheme text, no peer
 *  prior, and is excluded the next time the recall set is REGENERATED. That
 *  under-serves those rows; it cannot mis-serve a founder, because nothing in
 *  that direction adds a row to a brief.
 *
 *  Closing it is one commit and it belongs with the column: add
 *  `shut_sql()` to ETL/lib/liveness.py alongside `closed_sql()`, AND the
 *  `call_recurrence` column outside `BUILT_COLUMNS` in
 *  ETL/events/load/populate_funding_instruments.py, so a rebuild does not erase
 *  it — the failure `route_status` records.
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
  // The renewal horizon, in the same SQL, because a projection that dropped it
  // would have the ETL judging SA.40453 open while the product suppresses it —
  // which is the five-copies fault this whole file exists to end.
  const nowYear = opts.sqlite
    ? `CAST(strftime('%Y', 'now') AS INTEGER)`
    : `EXTRACT(year FROM current_date)::int`;
  return (
    `(${c}scheme_end_date IS NOT NULL AND ${past}` +
    ` AND NOT (COALESCE(${c}scheme_end_date_basis, '') = '${SCHEME_END_BASIS.notifiedDuration}'` +
    ` AND ${c}last_year IS NOT NULL AND ${c}last_year > ${endYear}` +
    ` AND ${c}last_year + ${RENEWAL_EVIDENCE_HORIZON_YEARS} >= ${nowYear}))`
  );
}
