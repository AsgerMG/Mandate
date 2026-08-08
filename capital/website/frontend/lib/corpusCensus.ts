// May this reading of the ETL's corpus be shown to a founder?
//
// ── Why this is its own module, and pure ───────────────────────────────────
// Two things ask that question and they must never answer it differently:
//
//   the RUNTIME (lib/corpusFigures.ts)   decides which numbers the home page
//                                        renders on this request
//   the GUARD (scripts/check_corpus_census.ts)  decides whether somebody has to
//                                        go and look at the corpus
//
// Those are different jobs — the guard fails on the NEWEST census because a bad
// run needs a human; the runtime skips it and serves the newest GOOD one because
// a founder needs a number — but they must agree about what "bad" means. A
// second copy of that predicate is the defect this repo has now fixed four
// times (the intake vocabulary in three places, the country map in eight, the
// eligibility comparator in two, the corpus figures in synthesis.py). So the
// predicate lives here, imports nothing, and both sides call it.
//
// ── The population this protects ───────────────────────────────────────────
// Everything here is about ADMISSIBILITY — is this reading trustworthy — and
// never about CONTENT. It does not filter, reweight or reinterpret a single
// figure. That matters: `ETL/schema/check_aggregate_independence.py` asserts
// that the headline aggregates count everything ever recorded, closed schemes
// included, and are unreachable by liveness. A read path that "improved" the
// numbers on the way past would break that contract silently. The rule here is
// take the census whole or take none of it.

/** Every canonical corpus figure, exactly as `corpus_kpis.CANONICAL_KPI_SQL`
 *  names them. snake_case because this is the ETL's spelling; the mapping to
 *  the site's camelCase happens once, in corpusFigures.ts.
 *
 *  This list is asserted against the Python by
 *  `ETL/schema/check_cross_language_constants.py`: a KPI added to
 *  compute_kpis and not added here would be a figure the live path silently
 *  could not serve, and the page would fall back to the artifact forever
 *  without saying why. */
export const CENSUS_KPI_KEYS = [
  "companies",
  "events",
  "champions",
  "step_companies",
  "total_capital_eur_raw",
  "countries",
  "source_families",
  "sectors",
] as const;

export type CensusKpiKey = (typeof CENSUS_KPI_KEYS)[number];

/** One row of `corpus_census` (ETL/events/load/publish_corpus_census.py). */
export interface CensusRow {
  id: number | string;
  taken_at: Date;
  produced_by: string;
  code_fingerprint: string;
  kpis: Partial<Record<CensusKpiKey, number>> | null;
  instruments: Record<string, number> | null;
  coverage: Record<string, unknown> | null;
  gate: { ok: boolean | null; failures?: string[]; notes?: string[] } | null;
  run_outcome: string;
  errors: string[] | null;
}

export interface Admissibility {
  /** True only when every test below passed. There is no partial credit: a
   *  census is a single reading and half of one is not a corpus. */
  admissible: boolean;
  /** Why not, in the words the person woken by it needs. Empty when admissible. */
  reasons: string[];
}

/**
 * THE predicate. Four independent tests, and a census must pass all of them.
 *
 * Each one exists because of a state that has actually occurred in this
 * table — none is defensive programming against the imaginable.
 *
 *  1. THE GATE SAID YES, IN THOSE WORDS.  `ETL/terms/coverage_gate.py` exists
 *     to refuse a corpus that got worse, and it fired for real this week. The
 *     live read must not be a way around it. The test is `gate.ok === true`
 *     and nothing weaker: on 2026-08-07 the only census ever taken inside the
 *     Railway container recorded `gate: null`, because the gate itself threw
 *     (`no such column: tier`) and the census — correctly — recorded the
 *     failure rather than crashing. A missing verdict is not a passing one.
 *     This repo has already paid for that lesson once, in the seeded gates
 *     whose NULL `gate_role` was read as neutral.
 *
 *  2. THE RUN FINISHED.  `run_outcome` travels with the census precisely so a
 *     failed pipeline cannot leave last week's good numbers standing as the
 *     newest record. 'ok' is the only outcome that means the corpus is whole;
 *     'partial: …' and 'failed at …' say parts of it are not refreshed, and
 *     'unknown' is the default when nobody said — which is not evidence of
 *     success. Same rule as the gate: silence is not consent.
 *
 *  3. NOTHING FELL OVER WHILE IT WAS BEING TAKEN.  The census records a failed
 *     block instead of aborting, which is right — the state you most need
 *     written down is a corpus that broke — and it means `errors` is the only
 *     place that shows up. A census with errors is a partial reading of the
 *     corpus, whatever its numbers say.
 *
 *  4. EVERY FIGURE IS PRESENT AND FINITE.  A missing KPI would otherwise
 *     render as `undefined` on the home page, or worse, as 0. Whole or
 *     nothing: if one figure is missing the reading is not usable, because the
 *     page states them side by side as one description of one corpus.
 *
 * Deliberately NOT tested here:
 *
 *  - AGE. An old census is not a wrong census; it is a true statement about an
 *    older moment, and the runtime compares its timestamp against the
 *    artifact's and serves whichever observation is actually newer. The guard
 *    has its own SILENT test for "the refresh has stopped", which is a
 *    different question with a different answer (wake somebody, don't switch
 *    sources).
 *  - THE CODE FINGERPRINT. A census produced by an older image is a true
 *    reading of the corpus that image saw. That is a deployment problem the
 *    guard reports as DRIFTED; refusing to serve the figures would not fix it
 *    and would trade a real number for an older one.
 *  - WHO PRODUCED IT. Tempting, and wrong as a hard rule: `make republish`
 *    pulls the ETL's own db to a laptop, so a `local` census can be a perfectly
 *    faithful reading of the production store. It is recorded in the
 *    provenance and shown, rather than used to reject.
 */
export function admissibility(row: CensusRow): Admissibility {
  const reasons: string[] = [];

  if (!row.gate || row.gate.ok !== true) {
    const said = !row.gate
      ? "the census recorded no gate verdict at all"
      : row.gate.ok === null
        ? "the gate could not be evaluated (verdict null)"
        : `the gate FAILED: ${(row.gate.failures ?? []).join("; ") || "(no detail)"}`;
    reasons.push(
      `the coverage gate did not pass this corpus — ${said}. The gate exists to ` +
      `refuse a corpus that got worse; an absent verdict is not a passing one.`);
  }

  if (row.run_outcome !== "ok") {
    reasons.push(
      `the pipeline that produced it did not finish cleanly: "${row.run_outcome}". ` +
      `Part of the corpus is not refreshed.`);
  }

  if (row.errors?.length) {
    reasons.push(
      `the census itself recorded ${row.errors.length} error(s) while reading the ` +
      `corpus: ${row.errors.join("; ")}`);
  }

  const missing = CENSUS_KPI_KEYS.filter((k) => {
    const v = row.kpis?.[k];
    return typeof v !== "number" || !Number.isFinite(v);
  });
  if (missing.length) {
    reasons.push(
      `${missing.length} of ${CENSUS_KPI_KEYS.length} canonical figures are missing ` +
      `or not finite (${missing.join(", ")}). The page states these side by side as ` +
      `one description of one corpus; a partial reading is not one.`);
  }

  return { admissible: reasons.length === 0, reasons };
}

export interface CensusChoice {
  /** The newest admissible census, or null when none of the rows offered were. */
  chosen: CensusRow | null;
  /** Why each newer row was passed over. Rendered into the server log and into
   *  the provenance, so a page serving older numbers can always say what it
   *  rejected — the alternative is the silent fallback that put a dead call in
   *  front of 26% of founders. */
  rejected: { id: number | string; takenAt: string; reasons: string[] }[];
}

/**
 * Pick the newest reading fit to publish.
 *
 * Walking back rather than taking-or-leaving the newest is the whole point of
 * having history: one failed Sunday should cost a week of currency, not send
 * the site back to whenever a human last ran `make data`. `corpus_census` is
 * append-only, so the walk is free.
 *
 * Rows must arrive newest-first; the caller orders by `taken_at DESC` in SQL so
 * the ordering is the database's and not a second opinion about it.
 */
export function chooseCensus(rows: CensusRow[]): CensusChoice {
  const rejected: CensusChoice["rejected"] = [];
  for (const row of rows) {
    const verdict = admissibility(row);
    if (verdict.admissible) return { chosen: row, rejected };
    rejected.push({
      id: row.id,
      takenAt: row.taken_at instanceof Date
        ? row.taken_at.toISOString()
        : String(row.taken_at),
      reasons: verdict.reasons,
    });
  }
  return { chosen: null, rejected };
}
