// The row that exists in production must not reach a founder.
//
// Every fixture below is a REAL row from `corpus_census` in Railway Postgres,
// copied verbatim on 2026-08-07. That is deliberate: a hand-invented "degraded
// census" tests whatever the author imagined, and what the author imagined is
// exactly the thing that has never gone wrong. The four rows in that table on
// the day this was written happen to cover a failed run, a crashed gate, a
// recorded error, an outcome nobody set, and two clean readings — which is more
// failure modes than anyone would have thought to write down.
import { describe, expect, it } from "vitest";
import { admissibility, chooseCensus, CENSUS_KPI_KEYS, type CensusRow } from "./corpusCensus";

/** corpus_census #4 — the ONLY reading ever taken inside the Railway container,
 *  and the one a naive live read would have put on the home page. The weekly
 *  pipeline died at refresh_open_calls.py, the coverage gate threw before it
 *  could reach a verdict, and the figures moved a long way: companies 151,426
 *  -> 150,868, sectors 11 -> 8, capital €352.9B -> €408.4B, instruments 1,084
 *  -> 322. */
const CENSUS_4: CensusRow = {
  id: "4",
  taken_at: new Date("2026-08-07T17:51:08.931Z"),
  produced_by: "etl-pipeline",
  code_fingerprint: "3041329326a9cec8",
  kpis: {
    events: 299384, sectors: 8, champions: 9371, companies: 150868,
    countries: 23, step_companies: 589, source_families: 11,
    total_capital_eur_raw: 408433535420.67,
  },
  instruments: { gates: 4018, roots: 257, total: 322, frameworks: 10 },
  coverage: null,
  gate: null,
  run_outcome: "failed at refresh_open_calls.py (rc=1)",
  errors: ["coverage: OperationalError: no such column: tier"],
};

/** corpus_census #3 — a clean reading: run ok, gate passed, no errors. */
const CENSUS_3: CensusRow = {
  id: "3",
  taken_at: new Date("2026-08-07T16:52:12.448Z"),
  produced_by: "image-equivalent",
  code_fingerprint: "142bd1ffdb831d70",
  kpis: {
    events: 297933, sectors: 11, champions: 9365, companies: 151426,
    countries: 23, step_companies: 589, source_families: 11,
    total_capital_eur_raw: 352852279442.4658,
  },
  instruments: { gates: 6368, roots: 348, total: 1084, frameworks: 8 },
  coverage: null,
  gate: { ok: true, notes: [], failures: [] },
  run_outcome: "ok",
  errors: [],
};

/** corpus_census #1 — clean except that nobody recorded how the run went.
 *  `unknown` is publish_corpus_census.py's default when --run-outcome is not
 *  passed, which is most of the time on a laptop. */
const CENSUS_1: CensusRow = {
  ...CENSUS_3,
  id: "1",
  taken_at: new Date("2026-08-07T16:08:05.335Z"),
  produced_by: "local",
  run_outcome: "unknown",
};

describe("admissibility", () => {
  it("serves a census that passed the gate on a run that finished", () => {
    const v = admissibility(CENSUS_3);
    expect(v.admissible).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  // The central assertion of this workstream. Shape A — "lib/data.ts queries
  // Postgres" — implemented without this predicate would today publish 150,868
  // companies and 8 sectors, from a pipeline that died and a gate that never
  // reached a verdict, because those numbers were the freshest available.
  it("refuses the real degraded row, and says all three reasons", () => {
    const v = admissibility(CENSUS_4);
    expect(v.admissible).toBe(false);
    expect(v.reasons.join(" ")).toContain("coverage gate");
    expect(v.reasons.join(" ")).toContain("did not finish cleanly");
    expect(v.reasons.join(" ")).toContain("no such column: tier");
  });

  it("treats a missing gate verdict as a refusal, not as neutral", () => {
    // The distinction that matters: gate.ok === null means the gate could not
    // judge, which is not the same claim as "the corpus is fine". This repo has
    // already paid for reading a NULL as neutral once, in the seeded gates.
    expect(admissibility({ ...CENSUS_3, gate: { ok: null } }).admissible).toBe(false);
    expect(admissibility({ ...CENSUS_3, gate: null }).admissible).toBe(false);
    expect(admissibility({ ...CENSUS_3, gate: { ok: false, failures: ["LOSS route"] } })
      .admissible).toBe(false);
  });

  it("refuses an outcome nobody recorded", () => {
    const v = admissibility(CENSUS_1);
    expect(v.admissible).toBe(false);
    expect(v.reasons.join(" ")).toContain("unknown");
  });

  it("refuses a partial run even though its figures are present", () => {
    expect(admissibility({ ...CENSUS_3, run_outcome: "partial: renew.py" })
      .admissible).toBe(false);
  });

  it("refuses a reading missing any single canonical figure", () => {
    // Whole or nothing: the page states these side by side as one description
    // of one corpus, so a partial reading is not one. Asserted for EVERY key
    // rather than a sample, so a KPI added to compute_kpis is covered the day
    // it is added.
    for (const key of CENSUS_KPI_KEYS) {
      const kpis = { ...CENSUS_3.kpis } as Record<string, number>;
      delete kpis[key];
      const v = admissibility({ ...CENSUS_3, kpis });
      expect(v.admissible, `missing ${key} should be inadmissible`).toBe(false);
      expect(v.reasons.join(" ")).toContain(key);
    }
  });

  it("refuses a figure that is present but not finite", () => {
    expect(admissibility({
      ...CENSUS_3, kpis: { ...CENSUS_3.kpis, companies: NaN },
    }).admissible).toBe(false);
  });
});

describe("chooseCensus", () => {
  it("walks back past the degraded newest row to the newest good one", () => {
    // One failed Sunday should cost a week of currency, not send the site back
    // to whenever a human last ran `make data`.
    const { chosen, rejected } = chooseCensus([CENSUS_4, CENSUS_3, CENSUS_1]);
    expect(chosen?.id).toBe("3");
    expect(rejected.map((r) => r.id)).toEqual(["4"]);
    expect(rejected[0].reasons.length).toBeGreaterThan(0);
  });

  it("reports every rejection when nothing is admissible", () => {
    const { chosen, rejected } = chooseCensus([CENSUS_4, CENSUS_1]);
    expect(chosen).toBeNull();
    expect(rejected.map((r) => r.id)).toEqual(["4", "1"]);
  });

  it("returns nothing, loudly, on an empty table", () => {
    expect(chooseCensus([]).chosen).toBeNull();
  });

  it("trusts the caller's ordering rather than re-sorting", () => {
    // Rows arrive `ORDER BY taken_at DESC` from Postgres. Re-deriving the order
    // here would be a second opinion about which reading is newer, and the two
    // would eventually disagree about a tie.
    const { chosen } = chooseCensus([CENSUS_1, CENSUS_3]);
    expect(chosen?.id).toBe("3");
  });
});
