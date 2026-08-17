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
  /** WHICH STORE this census read — derived from the environment by
   *  publish_corpus_census.py, not labelled by hand. Optional because rows
   *  written before the column existed do not carry it, and because the
   *  verdict-feed path reconstructs a row from published metrics.
   *  See website/build/lib/corpus_stores.py for why the store, not the
   *  producer, is the fact: three censuses taken against the SAME laptop file
   *  carried three different producer labels. */
  store?: string;
  /** What this store could and could not reach of the committed migrations.
   *  `unknown` is an id the store records that the runner cannot produce — DDL
   *  applied by hand, which no other store can reproduce. */
  schema_state?: { applied: string[]; pending: string[]; unknown: string[] } | null;
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

// ── Did THIS corpus get worse? ─────────────────────────────────────────────
//
// `admissibility` above asks whether one reading is trustworthy. This asks a
// different question of the same table, and nothing was asking it: has a store
// come to hold LESS than it once held.
//
// ── The hole this fills, and why it was invisible ──────────────────────────
// `ETL/terms/coverage_gate.py` already tests for loss, and tests it well — the
// argument in its header for an absolute mark over a percentage is the right
// argument and is not restated here. What it does is iterate two hardcoded
// tuples, `AXES` (six) and `KPI_AXES` (eight). `instruments.gates` is in
// neither. The census has recorded it every week since the table existed and
// nothing has ever had an opinion about whether it fell.
//
// The six coverage axes cannot stand in, because they are INSTRUMENT COUNTS
// OVER A PER-INSTRUMENT BOOLEAN. `eligibility` counts funds holding at least
// one evaluable gate, so stripping 450 funds from a full rulebook down to one
// rule each moves it by nothing. That is not hypothetical: it is the incident
// coverage_gate.py's own header opens with. The gate was written for that
// failure and still cannot see it, because it counts funds and the loss was
// depth. Measured on the real rows, 1,070 gates map to 15 instruments.
//
// ── The property ───────────────────────────────────────────────────────────
//   Every numeric measure a census records about a corpus is judged for loss
//   against the highest that SAME STORE has ever recorded on a census that did
//   not itself fail this test.
//
// Three clauses, each load-bearing:
//
//   EVERY NUMERIC MEASURE.  Derived from the recorded payload, never listed.
//     A measure added to publish_corpus_census.py is judged from its second
//     census onward with no edit here — which is what stops `gates` from
//     becoming the fifteenth special case and an axis added next year from
//     becoming the sixteenth.
//
//   THAT SAME STORE.  "Did this corpus get worse" is a question about one
//     store over time. `project-mgmt/coverage_baseline.json` is a single
//     committed file that coverage_gate.py runs against whichever database it
//     is pointed at, so its mark is the maximum over every store anyone has
//     ever run it on while its verdict is about one — which is why census #11
//     reports "LOSS eligibility: 898, down from a high of 913. Something the
//     corpus knew, it no longer knows" when the volume never knew it and the
//     laptop did. Cross-store difference is a real problem with a different
//     fix, and the DIVERGED arm of check_corpus_census.ts already names it.
//     Saying it in LOSS's words makes the two indistinguishable to a reader,
//     and that cost two confidently wrong conclusions in one evening.
//     The census table is the only per-store history that exists, so the mark
//     is read from it and there is no file to keep.
//
//   THAT DID NOT ITSELF FAIL.  The same rule coverage_gate.py applies with
//     advance(): a reading that failed does not become the new baseline, so a
//     walk down one tolerated step at a time fails on the second step instead
//     of never. It also refuses a mark to a reading taken mid-rebuild — census
//     #4, 322 instruments, recording `frameworks: 10` where every sound
//     reading of that corpus records 8.
//
// It re-introduces neither recorded failure of the percentage gate, because it
// never looks at a share. The FALSE ALARM of 2026-08-06 (150 instruments join,
// every count rises, five of six shares fall) has no falling count to fire on.
// The BLIND SPOT (150 instruments deleted, `route` 908 -> 778 while its share
// RISES to 90.4%) has a count 130 below its mark and fires. Both are asserted
// in corpusCensus.test.ts.

/** How far a measure may fall below its mark before that is a loss rather than
 *  noise. PROPORTIONAL ONLY, with a floor of one.
 *
 *  This is `coverage_gate.kpi_tolerance` and deliberately not a second rule —
 *  asserted equal by `ETL/schema/check_cross_language_constants.py`. Its
 *  argument carries over unchanged: the instrument axes carry a floor of three
 *  because a parent/child re-split of one regime legitimately moves a handful
 *  of rows, and no measure judged here has that mechanism, while several are
 *  small enough that a floor of three would license losing a quarter of them
 *  without a word. */
export const LOSS_TOLERANCE_SHARE = 0.005;

export function lossTolerance(mark: number): number {
  return Math.max(1, LOSS_TOLERANCE_SHARE * Math.abs(mark));
}

/** Every numeric measure one census records about the corpus it read, keyed
 *  `block.measure`.
 *
 *  Read off the payload rather than off a list, so the set grows with the
 *  census. The two blocks walked are the ones that hold ABSOLUTE COUNTS of
 *  things in the corpus. `coverage` is deliberately not among them: it is
 *  coverage_gate.py's own snapshot, judged by coverage_gate.py, and it carries
 *  `shares` — and a share is the one quantity this test must never read, for
 *  the reason the FALSE ALARM above records. */
export function censusMeasures(row: CensusRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const block of ["kpis", "instruments"] as const) {
    const values = row[block] as Record<string, unknown> | null | undefined;
    if (!values) continue;
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[`${block}.${key}`] = value;
      }
    }
  }
  return out;
}

export interface Shrink {
  /** The store that got smaller. Never a comparison between two stores. */
  store: string;
  /** `block.measure`, as `censusMeasures` keys it. */
  measure: string;
  /** What the store's newest census records. */
  now: number;
  /** The most it has ever recorded on a census that did not itself fail. */
  mark: number;
  /** Which census set that mark, so the claim can be checked by hand. */
  markCensus: number | string;
  /** The newest census, the one being judged. */
  census: number | string;
  tolerance: number;
}

/**
 * Every measure that has fallen, per store.
 *
 * Rows arrive newest-first, as everything else in this module expects and as
 * the caller's `ORDER BY taken_at DESC` provides. Only the NEWEST census of
 * each store is reported on; the older ones are history, and their job is to
 * establish the mark.
 */
export function shrinkage(rows: CensusRow[]): Shrink[] {
  const byStore = new Map<string, CensusRow[]>();
  for (const row of rows) {
    const store = row.store ?? "unknown";
    if (!byStore.has(store)) byStore.set(store, []);
    byStore.get(store)!.push(row);
  }

  const found: Shrink[] = [];
  for (const [store, newestFirst] of byStore) {
    const marks = new Map<string, { value: number; census: number | string }>();
    let failures: Shrink[] = [];
    // Oldest first: a mark can only be set by something that came before.
    for (const row of [...newestFirst].reverse()) {
      failures = [];
      const measures = censusMeasures(row);
      for (const [measure, now] of Object.entries(measures)) {
        const mark = marks.get(measure);
        if (!mark) continue;
        const tolerance = lossTolerance(mark.value);
        if (mark.value - now > tolerance) {
          failures.push({
            store, measure, now, mark: mark.value, markCensus: mark.census,
            census: row.id, tolerance,
          });
        }
      }
      // A reading that failed does not become the baseline — coverage_gate.py's
      // advance() rule, and the whole reason the mark is not a ratchet.
      if (failures.length) continue;
      for (const [measure, value] of Object.entries(measures)) {
        const mark = marks.get(measure);
        if (!mark || value > mark.value) marks.set(measure, { value, census: row.id });
      }
    }
    found.push(...failures);
  }
  return found;
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
