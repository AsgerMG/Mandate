// What the home page actually serves, under every state Postgres can be in.
//
// corpusCensus.test.ts covers WHICH census may be shown. This covers what
// happens around that decision, and the three properties it has to hold:
//
//   1. PASS-THROUGH. Whatever figure the census carries is the figure the page
//      states. `ETL/schema/check_aggregate_independence.py` proves the
//      DEFINITION is unreachable by liveness -- closing every fund leaves every
//      corpus figure unchanged -- but that proof is about corpus_kpis.py, and a
//      read path that filtered or reweighted on the way past would break the
//      contract downstream of it, in the one place nobody would look. So the
//      contract is asserted here too, at the other end of the wire.
//
//   2. IT CANNOT THROW. Every Postgres failure lands on the committed artifact.
//      A home page that 500s because Railway blipped is worse than one showing
//      last Tuesday's figures.
//
//   3. IT CANNOT MOVE THE SITE BACKWARDS. The live read may only ever make the
//      figures fresher. This is the invariant that made the change shippable.
//
// The `pg` module is mocked rather than reached, so these run in CI with no
// database -- the same reason the guard skips without DATABASE_URL.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ARTIFACT = {
  generatedAt: "2026-08-07T22:08:33+00:00",
  companies: 151426,
  events: 299384,
  champions: 9371,
  stepCompanies: 589,
  totalCapitalEur: "€408.4B",
  totalCapitalEurRaw: 408433535420.6861,
  countries: 23,
  sourceFamilies: 11,
  sectors: 11,
};

vi.mock("@/public/data/synthesis.json", () => ({ default: ARTIFACT }));

/** A census row in the shape `pg` returns it. Clean unless told otherwise, and
 *  observed AFTER the artifact above — so the default case is the one where the
 *  live read is the fresher reading and therefore the one that wins. Tests that
 *  care about the other ordering set `taken_at` explicitly. */
function census(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    taken_at: new Date("2026-08-08T02:00:00.000Z"),
    produced_by: "etl-pipeline",
    code_fingerprint: "142bd1ffdb831d70",
    kpis: {
      events: 297933, sectors: 11, champions: 9365, companies: 151426,
      countries: 23, step_companies: 589, source_families: 11,
      total_capital_eur_raw: 352852279442.4658,
    },
    instruments: null,
    coverage: null,
    gate: { ok: true, failures: [], notes: [] },
    run_outcome: "ok",
    errors: [],
    ...overrides,
  };
}

/** Install a fake `pg` whose Client either returns rows or fails as told. */
function mockPg(behaviour: { rows?: unknown[]; fail?: string }) {
  vi.doMock("pg", () => ({
    Client: class {
      async connect() {
        if (behaviour.fail) throw new Error(behaviour.fail);
      }
      async query(sql: string) {
        if (/^SET /.test(sql)) return { rows: [] };
        return { rows: behaviour.rows ?? [] };
      }
      async end() { /* nothing to close */ }
    },
  }));
}

async function read() {
  const mod = await import("./corpusFigures");
  return mod.readCorpusFigures();
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  process.env.DATABASE_URL = "postgres://stub/stub";
});

afterEach(() => {
  vi.doUnmock("pg");
  vi.restoreAllMocks();
  delete process.env.DATABASE_URL;
});

describe("the live path", () => {
  it("passes every census figure through untouched", async () => {
    // Property 1. The artifact deliberately holds DIFFERENT numbers, so a
    // figure that matched by accident cannot make this pass. An older artifact
    // date, so the census is the one that wins.
    const row = census();
    mockPg({ rows: [row] });
    const got = await read();

    expect(got.provenance.source).toBe("census");
    expect(got.companies).toBe(row.kpis.companies);
    expect(got.events).toBe(row.kpis.events);
    expect(got.champions).toBe(row.kpis.champions);
    expect(got.stepCompanies).toBe(row.kpis.step_companies);
    expect(got.countries).toBe(row.kpis.countries);
    expect(got.sourceFamilies).toBe(row.kpis.source_families);
    expect(got.sectors).toBe(row.kpis.sectors);
    expect(got.totalCapitalEurRaw).toBe(row.kpis.total_capital_eur_raw);
  });

  it("does not filter the headline by liveness", async () => {
    // The contract check_aggregate_independence.py asserts, restated at the
    // read end: the aggregates count everything ever recorded, closed schemes
    // included. A census taken over a corpus whose funds have ALL closed must
    // still publish the same figures -- this module has no idea what a fund is,
    // and the assertion is that it stays that way.
    const closed = census({ instruments: { total: 0, offerable: 0 } });
    mockPg({ rows: [closed] });
    const got = await read();
    expect(got.companies).toBe(151426);
    expect(got.events).toBe(297933);
    expect(got.totalCapitalEurRaw).toBe(352852279442.4658);
  });

  it("formats the euro total the same way the artifact does", async () => {
    // Same corpus, two code paths: if these disagree the difference looks like
    // the money moved. check_cross_language_constants.py holds the Python and
    // TypeScript halves together; this holds the census and artifact halves.
    mockPg({ rows: [census({ kpis: { ...census().kpis, total_capital_eur_raw: 408433535420.6861 } })] });
    const got = await read();
    expect(got.totalCapitalEur).toBe(ARTIFACT.totalCapitalEur);
  });
});

describe("when Postgres is unreachable", () => {
  // Property 2, and the specific defect this codebase has already shipped: a
  // silent fallback put a dead application link in front of 26% of founders.
  it("serves the artifact rather than throwing", async () => {
    mockPg({ fail: "connect ETIMEDOUT 10.0.0.1:5432" });
    const got = await read();
    expect(got.provenance.source).toBe("artifact");
    expect(got.companies).toBe(ARTIFACT.companies);
    expect(got.events).toBe(ARTIFACT.events);
  });

  it("marks the render DEGRADED and keeps the error", async () => {
    mockPg({ fail: "connect ETIMEDOUT 10.0.0.1:5432" });
    const got = await read();
    expect(got.provenance.degraded).toBe(true);
    expect(got.provenance.error).toContain("ETIMEDOUT");
  });

  it("says so on the page, not only in the log", async () => {
    // The log is read by us; the page is read by a founder. A fallback that
    // renders identically to the real thing is the one that lasts 32 days.
    const { corpusAsOf } = await import("./corpusFigures");
    mockPg({ fail: "boom" });
    expect(corpusAsOf((await read()).provenance)).toContain("last published");
    vi.resetModules();
    mockPg({ rows: [census()] });
    expect(corpusAsOf((await read()).provenance)).toContain("live");
  });

  it("is NOT degraded when there was simply no database configured", async () => {
    // A static build never had a live source to prefer. Calling that an outage
    // would make the real outage unremarkable.
    delete process.env.DATABASE_URL;
    const got = await read();
    expect(got.provenance.source).toBe("artifact");
    expect(got.provenance.degraded).toBe(false);
  });
});

describe("when nothing admissible is on offer", () => {
  it("falls back rather than serving a corpus the gate refused", async () => {
    const bad = census({
      id: 4,
      taken_at: new Date("2026-08-07T17:51:08.931Z"),
      gate: null,
      run_outcome: "failed at refresh_open_calls.py (rc=1)",
      errors: ["coverage: OperationalError: no such column: tier"],
      kpis: { ...census().kpis, companies: 150868, sectors: 8 },
    });
    mockPg({ rows: [bad] });
    const got = await read();
    expect(got.provenance.source).toBe("artifact");
    expect(got.provenance.degraded).toBe(true);
    // and it can say what it refused
    expect(got.provenance.rejected?.[0].reasons.join(" ")).toContain("coverage gate");
    expect(got.companies).toBe(ARTIFACT.companies);
    expect(got.sectors).toBe(ARTIFACT.sectors);
  });

  it("walks back to the newest good census rather than all the way to the artifact", async () => {
    const bad = census({ id: 4, taken_at: new Date("2026-08-07T17:51:08.931Z"), gate: { ok: false, failures: ["LOSS sectors"] } });
    mockPg({ rows: [bad, census()] });
    const got = await read();
    expect(got.provenance.source).toBe("census");
    expect(got.provenance.censusId).toBe(3);
    expect(got.provenance.rejected).toHaveLength(1);
  });

  it("falls back on an empty table", async () => {
    mockPg({ rows: [] });
    expect((await read()).provenance.source).toBe("artifact");
  });
});

describe("the invariant: the live read can only move the site forwards", () => {
  // Property 3. This is what made the change shippable, so it is asserted
  // rather than argued.
  it("prefers the artifact when the artifact is the more recent reading", async () => {
    // `make republish` pulls the ETL's db to a laptop minutes ago; the newest
    // census may be days old. The fresher reading wins on its date, not on
    // which mechanism produced it.
    mockPg({ rows: [census({ taken_at: new Date("2026-08-01T00:00:00Z") })] });
    const got = await read();
    expect(got.provenance.source).toBe("artifact");
    expect(got.provenance.degraded).toBe(false);
    expect(got.provenance.reason).toContain("more recent reading");
  });

  it("prefers the census when the census is the more recent reading", async () => {
    mockPg({ rows: [census({ taken_at: new Date("2026-08-08T00:00:00Z") })] });
    expect((await read()).provenance.source).toBe("census");
  });

  it("never serves figures observed earlier than the ones it replaced", async () => {
    // The property itself, swept rather than sampled: across a range of census
    // dates either side of the artifact's, whatever wins must be the newer
    // observation. A future edit that reorders the preference fails here.
    const artifactAt = Date.parse(ARTIFACT.generatedAt);
    for (const offsetHours of [-72, -24, -1, 1, 24, 72]) {
      vi.resetModules();
      const takenAt = new Date(artifactAt + offsetHours * 3_600_000);
      mockPg({ rows: [census({ taken_at: takenAt })] });
      const got = await read();
      const servedAt = Date.parse(got.provenance.observedAt);
      expect(servedAt, `census ${offsetHours}h from the artifact`)
        .toBe(Math.max(artifactAt, takenAt.getTime()));
    }
  });

  it("warns loudly when the artifact is undated and the invariant cannot hold", async () => {
    // With no stamp there is nothing to compare, so the census wins by default
    // and could be older. check_corpus_census.ts fails the build on this, but
    // the render must not be silent about it either.
    vi.resetModules();
    vi.doMock("@/public/data/synthesis.json", () => ({
      default: { ...ARTIFACT, generatedAt: undefined },
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPg({ rows: [census({ taken_at: new Date("2026-01-01T00:00:00Z") })] });
    const got = await read();
    expect(got.provenance.source).toBe("census");
    expect(warn.mock.calls.flat().join(" ")).toContain("generatedAt");
  });
});
