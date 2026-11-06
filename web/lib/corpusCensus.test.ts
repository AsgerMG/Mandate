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
import {
  admissibility, censusMeasures, chooseCensus, shrinkage,
  CENSUS_KPI_KEYS, type CensusRow,
} from "./corpusCensus";

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

// ── Did THIS corpus get worse? ─────────────────────────────────────────────
//
// Fixtures again copied verbatim, this time the three rows that produced the
// alarm wsHC was given: the laptop at 7,471 gates and the volume at 6,401,
// five hours apart, on the SAME code fingerprint.
const CENSUS_9: CensusRow = {
  id: 9,
  taken_at: new Date("2026-08-08T22:26:58.418Z"),
  produced_by: "local",
  code_fingerprint: "e25d3712f8cc48f2",
  kpis: {
    events: 299384, sectors: 11, champions: 9371, companies: 151426,
    countries: 23, step_companies: 589, source_families: 11,
    total_capital_eur_raw: 408433535420.6861,
  },
  instruments: { gates: 7471, roots: 352, total: 1088, frameworks: 10 },
  coverage: null,
  gate: { ok: true, failures: [], notes: [] },
  run_outcome: "ok",
  errors: [],
  store: "local",
};

/** The same store, a week later, having lost the 1,070 gates of the
 *  2026-08-08 encoding session and nothing else. Instruments unchanged at
 *  1,088; every KPI unchanged or higher. This is the shape of the failure
 *  coverage_gate.py's own header opens with — 453 instruments taken from a
 *  full rulebook down to one rule each, with no instrument lost. */
const CENSUS_LOCAL_AFTER_LOSS: CensusRow = {
  ...CENSUS_9,
  id: 12,
  taken_at: new Date("2026-08-15T22:26:58.418Z"),
  instruments: { gates: 6401, roots: 352, total: 1088, frameworks: 10 },
};

const CENSUS_10: CensusRow = {
  id: 10,
  taken_at: new Date("2026-08-09T03:13:37.009Z"),
  produced_by: "etl-pipeline",
  code_fingerprint: "e25d3712f8cc48f2",
  kpis: {
    events: 299428, sectors: 8, champions: 9372, companies: 151915,
    countries: 23, step_companies: 589, source_families: 11,
    total_capital_eur_raw: 408436443019.87,
  },
  instruments: { gates: 6401, roots: 352, total: 1088, frameworks: 10 },
  coverage: null,
  gate: { ok: false, failures: ["LOSS  eligibility: 898"], notes: [] },
  run_outcome: "partial: refresh_open_calls.py",
  errors: [],
  store: "railway-volume",
};

const CENSUS_11: CensusRow = {
  ...CENSUS_10,
  id: 11,
  taken_at: new Date("2026-08-16T03:15:13.352Z"),
  code_fingerprint: "c99a0aeb2a070141",
  kpis: { ...CENSUS_10.kpis, events: 299469, companies: 151936,
          total_capital_eur_raw: 408444397332.38 },
  run_outcome: "failed at classify_taxonomy.py (rc=1)",
};

describe("censusMeasures", () => {
  it("judges what the census records, not what somebody listed", () => {
    // The whole point. `instruments.gates` is recorded by
    // publish_corpus_census.py and appears in no tuple in coverage_gate.py, so
    // it was measured every week and judged by nothing.
    const m = censusMeasures(CENSUS_9);
    expect(m["instruments.gates"]).toBe(7471);
    expect(m["kpis.companies"]).toBe(151426);
  });

  it("covers a measure nobody has added yet", () => {
    // A test for the unseen case. Nothing in this repo has ever recorded
    // `instruments.doors`; the day publish_corpus_census.py does, it must be
    // judged with no edit here, in coverage_gate.py, or anywhere else.
    const invented: CensusRow = {
      ...CENSUS_9,
      instruments: { ...CENSUS_9.instruments, doors: 4200 } as Record<string, number>,
    };
    expect(censusMeasures(invented)["instruments.doors"]).toBe(4200);
  });

  it("takes numbers only, and finite ones", () => {
    const junk: CensusRow = {
      ...CENSUS_9,
      instruments: { gates: 7471, note: "rebuilt", broken: NaN } as unknown as Record<string, number>,
    };
    const m = censusMeasures(junk);
    expect(m["instruments.gates"]).toBe(7471);
    expect("instruments.note" in m).toBe(false);
    expect("instruments.broken" in m).toBe(false);
  });
});

describe("shrinkage", () => {
  it("catches the loss of a thousand gates with every instrument still there", () => {
    // RED BEFORE GREEN. Judged by everything that existed before this function,
    // this pair is silent: admissibility passes both rows, the six coverage
    // axes are instrument counts over a per-instrument boolean and move by 15,
    // and no KPI moves at all.
    expect(admissibility(CENSUS_LOCAL_AFTER_LOSS).admissible).toBe(true);

    const found = shrinkage([CENSUS_LOCAL_AFTER_LOSS, CENSUS_9]);
    expect(found.map((f) => f.measure)).toEqual(["instruments.gates"]);
    expect(found[0]).toMatchObject({
      store: "local", now: 6401, mark: 7471, markCensus: 9,
    });
    expect(found[0].tolerance).toBeCloseTo(37.355, 3);
  });

  it("does not read one store's corpus as another store's history", () => {
    // The error that produced two confidently wrong conclusions in one evening.
    // The volume has never held more than 6,401 gates; the laptop's 7,471 is
    // not evidence that it did. Cross-store is DIVERGED's question.
    const found = shrinkage([CENSUS_11, CENSUS_10, CENSUS_9]);
    expect(found).toEqual([]);
  });

  it("does not re-introduce the FALSE ALARM of 2026-08-06", () => {
    // 150 instruments joined, every axis GAINED about seventy, and five of six
    // axes fell more than seven points AS SHARES. Nothing was lost. A test that
    // reads an absolute count cannot see a share, so there is nothing here to
    // fire on.
    const before: CensusRow = {
      ...CENSUS_9,
      instruments: { gates: 6368, roots: 348, total: 1084, frameworks: 8 },
    };
    const after: CensusRow = {
      ...CENSUS_9, id: 13, taken_at: new Date("2026-08-09T22:26:58.418Z"),
      instruments: { gates: 6438, roots: 348, total: 1234, frameworks: 8 },
    };
    expect(shrinkage([after, before])).toEqual([]);
  });

  it("does catch the BLIND SPOT, where the share RISES", () => {
    // Delete 150 instruments of which 130 had a known route: n 1011 -> 861,
    // route 908 -> 778, share 89.8% -> 90.4%. A percentage gate passes this.
    // The denominator is not consulted here at any point.
    const before: CensusRow = {
      ...CENSUS_9, instruments: { gates: 7471, roots: 352, total: 1011, frameworks: 10 },
    };
    const after: CensusRow = {
      ...CENSUS_9, id: 14, taken_at: new Date("2026-08-09T22:26:58.418Z"),
      instruments: { gates: 7471, roots: 352, total: 861, frameworks: 10 },
    };
    expect(shrinkage([after, before]).map((f) => f.measure)).toEqual(["instruments.total"]);
  });

  it("does not let a reading that already failed raise the mark", () => {
    // The same rule coverage_gate.py applies with advance(): a census that
    // failed the loss test does not become the new baseline. Otherwise a walk
    // down one tolerated step at a time never fails on any single run.
    //
    // Census #4 is the real instance: a reading taken MID-REBUILD, 322
    // instruments, that happens to record `frameworks: 10` where every sound
    // reading of that corpus records 8. Left to raise the mark it would report
    // a loss of two frameworks that never happened.
    const midRebuild: CensusRow = {
      ...CENSUS_3, id: 4, store: "unknown",
      taken_at: new Date("2026-08-07T17:51:08.931Z"),
      instruments: { gates: 4018, roots: 257, total: 322, frameworks: 10 },
    };
    const sound: CensusRow = {
      ...CENSUS_3, id: 6, store: "unknown",
      taken_at: new Date("2026-08-07T22:07:00.000Z"),
      instruments: { gates: 6368, roots: 350, total: 1086, frameworks: 8 },
    };
    expect(shrinkage([sound, midRebuild, { ...CENSUS_3, id: 3, store: "unknown" }]))
      .toEqual([]);
  });

  it("tolerates noise proportionally and nothing more", () => {
    const drop = (gates: number): CensusRow => ({
      ...CENSUS_9, id: 99, taken_at: new Date("2026-08-15T00:00:00.000Z"),
      instruments: { ...CENSUS_9.instruments, gates },
    });
    // 0.5% of 7,471 is 37.4; a fall of 37 is inside it and 38 is not.
    expect(shrinkage([drop(7471 - 37), CENSUS_9])).toEqual([]);
    expect(shrinkage([drop(7471 - 38), CENSUS_9]).length).toBe(1);
  });

  it("never reports a measure a store has only ever recorded once", () => {
    expect(shrinkage([CENSUS_9])).toEqual([]);
  });
});
