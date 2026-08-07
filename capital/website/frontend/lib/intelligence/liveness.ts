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
// deadlines at all. Measured over the corpus: of 390 absence-based open rows,
// 310 sit in populations where no member has ever carried a call deadline —
// EIC, Horizon, the EIT KICs, the Baltic development banks. Their absence is
// the register's steady state, not a gap, and suppressing them would answer a
// blip by deleting half the product. See `populationRecordsDeadlines`.
//
// ── What "the register publishes deadlines" has to MEAN ───────────────────
// The first version of that test was "has any member ever carried a call
// deadline", and a single member satisfies it. Measured 2026-08-07 on the
// republished snapshot, exactly two populations carried any at all:
//
//                          rows   carrying a deadline   share
//   state_aid_satr|ES       174           168           96.6%
//   national_dev_banks|FR    81             6            7.4%
//
// Those are not the same kind of register and the membership test cannot tell
// them apart. `bdns_es_ayudas` IS a register of convocatorias: a row without a
// deadline is the 3% we have not finished loading. `ademe_aid` is a catalogue
// of standing aids — the source pages are the French government's
// `aides-entreprise` entries, whose eligibility is sectoral and whose windows
// are open — into which six dated appels à projets happen to fall. Reading
// those six as evidence about the other seventy withheld the whole ADEME
// register, and ADEME is what French founders actually win: 488 of 778 French
// holdout answers were in the withheld set, and EXACTLY ZERO of the 80
// withheld rows were ones the live register would have refused.
//
// So the test is a proportion, not a membership: a population RECORDS
// deadlines when most of its rows carry one. That is the operational meaning
// of "records", not a tuned constant — and the corpus reads it at 96.6% and
// 7.4%, with nothing anywhere near the middle, so where exactly the line sits
// changes no row. It stays derived from the corpus rather than listed: if
// ADEME's loader ever starts extracting windows in earnest, that population
// crosses back on its own and the suppression returns without an edit.
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
// this: it cannot tell a notified duration from a call deadline, so it cannot
// tell a deadline-recording population from a steady one either. The 2026-08-06
// snapshot was exactly that store. An absent field therefore reads as
// UNCONFIRMED, never as open — the reading that left 80 dead Spanish calls
// proposable.

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

/** Where the rows being judged came from. */
export interface LivenessObservation {
  /** `postgres` is the register itself — there is nothing fresher to check a
   *  row against, so every row it supplies is confirmed by definition. Any
   *  other source is a copy taken at some past instant. */
  source: "postgres" | "snapshot" | "none";
  /** Does the register this row was drawn from publish application deadlines
   *  for rows like it? A property of the CORPUS, not of the row, so the caller
   *  supplies it — see `populationRecordsDeadlines`. Absent is read as "yes",
   *  which is the conservative direction. */
  populationRecordsDeadlines?: boolean;
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
      return obs.populationRecordsDeadlines === false
        ? null
        : "openness rests on the corpus holding no application deadline, and " +
          "this row's register does publish them — a deadline loaded since " +
          "this copy was taken would close it";
  }
}

/**
 * Which populations publish application deadlines, and therefore where a row
 * without one is a row we have not finished loading.
 *
 * THE PROPERTY:
 *
 *   A register records application windows when MOST of its rows carry one.
 *   Where it does, a member with none is a gap in our copy. Where it does not,
 *   a member with none is what the register publishes.
 *
 * The unit is whatever `keyOf` returns — in the product, the register a row was
 * drawn from for one country.
 *
 * ── Why a proportion and not "has any member ever" ────────────────────────
 * Membership is satisfied by one row and cannot tell a register of calls from
 * a catalogue of standing aids that contains a few. On the 2026-08-07 corpus
 * it read `state_aid_satr|ES` (168 of 174 dated) and `national_dev_banks|FR`
 * (6 of 81 dated) as the same thing, and withheld all 75 undated French rows
 * for the sake of six. Nothing the live register would have refused was among
 * them, and 488 of 778 French holdout answers were.
 *
 * A share is not a tuned constant here: "most" IS what "records them" means,
 * and the two populations sit at 96.6% and 7.4% with the rest of the corpus at
 * zero, so the reading does not depend on where the line is drawn. `shares()`
 * exists so a human can look rather than take that on trust — if a population
 * ever lands near the middle, the answer is to find out what that register
 * actually is, not to move a number.
 *
 * Still derived from the corpus, never listed: a catalogue whose loader starts
 * extracting windows crosses over on its own, and a list would be edited late.
 */
export function populationRecordsDeadlines<T extends LivenessFacts>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): ((row: T) => boolean) & { shares: () => Map<string, { dated: number; total: number }> } {
  const tally = new Map<string, { dated: number; total: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const t = tally.get(k) ?? { dated: 0, total: 0 };
    t.total++;
    if (r.schemeEndBasis === SCHEME_END_BASIS.callDeadline) t.dated++;
    tally.set(k, t);
  }
  const records = (row: T) => {
    const t = tally.get(keyOf(row));
    return t ? t.dated * 2 > t.total : false;
  };
  records.shares = () => new Map(tally);
  return records;
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
