import { describe, it, expect } from "vitest";
import {
  SCHEME_END_BASIS, closedSql, isClosed, opennessEvidence,
  populationRecordsDeadlines, unconfirmedOpen,
} from "./liveness";

const N = SCHEME_END_BASIS.notifiedDuration;
const C = SCHEME_END_BASIS.callDeadline;
const B = SCHEME_END_BASIS.closedBeneficiaryList;
const AS_OF = "2026-08-06";

describe("liveness", () => {
  it("leaves a row with no end date open", () => {
    // The only thing the corpus knows. Spain's 80 convocatorias were offerable
    // for months because of this, and the fix was to LOAD their deadlines —
    // not to invent closure for rows we know nothing about.
    expect(isClosed({ schemeEndDate: null, lastYear: 2026 }, AS_OF)).toBe(false);
  });

  it("leaves a future end date open regardless of basis", () => {
    expect(isClosed({ schemeEndDate: "2030-01-01", schemeEndBasis: N }, AS_OF)).toBe(false);
    expect(isClosed({ schemeEndDate: "2030-01-01", schemeEndBasis: C }, AS_OF)).toBe(false);
  });

  // ── The whole point: the same facts, two answers ────────────────────────
  it("reopens a notified duration that granted aid after it expired", () => {
    // Fondo di garanzia per le PMI (SA.57625), 13,892 awards. Aid may not
    // lawfully be granted under an expired measure, so a later award year is
    // evidence the notification was prolonged.
    expect(isClosed(
      { schemeEndDate: "2020-12-30", schemeEndBasis: N, lastYear: 2021 }, AS_OF)).toBe(false);
  });

  it("keeps a call deadline closed even though it awarded afterwards", () => {
    // An award date is a GRANTING date. Every call in the corpus publishes its
    // decisions after its deadline — ADEME's 'Appel a projets 2024' closed
    // 2024-07-09 and awarded in 2026. If this ever returns false, 50 of Spain's
    // 80 dead convocatorias are back in front of founders.
    expect(isClosed(
      { schemeEndDate: "2024-07-09", schemeEndBasis: C, lastYear: 2026 }, AS_OF)).toBe(true);
  });

  it("closes a notified duration whose awards stopped with it", () => {
    expect(isClosed(
      { schemeEndDate: "2021-06-29", schemeEndBasis: N, lastYear: 2021 }, AS_OF)).toBe(true);
  });

  it("treats a same-year award as BEFORE the expiry, not after", () => {
    // 94% of notified durations expire on 12-30 or 06-29, so a same-year award
    // almost certainly precedes them. Year granularity is all Postgres holds
    // and this is the conservative direction.
    expect(isClosed(
      { schemeEndDate: "2023-12-30", schemeEndBasis: N, lastYear: 2023 }, AS_OF)).toBe(true);
  });

  it("closes an UNLABELLED past date", () => {
    // The safe default. An unlabelled date is read as a call deadline so a dead
    // call is never re-proposed while its basis is being established.
    expect(isClosed({ schemeEndDate: "2021-01-01", lastYear: 2026 }, AS_OF)).toBe(true);
    expect(isClosed(
      { schemeEndDate: "2021-01-01", schemeEndBasis: "", lastYear: 2026 }, AS_OF)).toBe(true);
  });

  // ── The third basis: closed by the decision, with no date to read ───────
  it("closes a fixed beneficiary list even with no end date at all", () => {
    // The IPCEI waves. Every date field is empty because the row never had a
    // window: the Commission approved aid for companies it names. Tested with
    // a recent award year too, because these decisions keep disbursing for
    // years and the money moving is not a door opening.
    expect(isClosed({ schemeEndBasis: B }, AS_OF)).toBe(true);
    expect(isClosed(
      { schemeEndDate: null, schemeEndBasis: B, lastYear: 2025 }, AS_OF)).toBe(true);
  });

  it("closes a fixed beneficiary list even when the date is in the FUTURE", () => {
    // The ordering test. `isClosed` returns early on a future date, so a basis
    // checked after that guard would silently do nothing on any row that also
    // carries a notified duration. The list being closed outranks the window.
    expect(isClosed(
      { schemeEndDate: "2030-01-01", schemeEndBasis: B, lastYear: 2026 }, AS_OF)).toBe(true);
  });

  it("does not close an ordinary row that merely has no basis", () => {
    // Guards the blast radius: the new basis must close exactly the rows that
    // declare it, and nothing else. 512 rows carry no basis at all.
    expect(isClosed({ schemeEndDate: null, schemeEndBasis: null }, AS_OF)).toBe(false);
  });

  it("emits SQL that agrees with the TypeScript on every case above", () => {
    // Both dialects are generated from one function, so this guards the shape
    // rather than re-testing the logic: a column renamed in one and not the
    // other is how the two stores start publishing different funds.
    for (const sql of [closedSql(), closedSql({ sqlite: true })]) {
      expect(sql).toContain("scheme_end_date");
      expect(sql).toContain("scheme_end_date_basis");
      expect(sql).toContain("last_year");
      expect(sql).toContain(N);
      expect(sql).toContain(B);
    }
    expect(closedSql({ col: "f" })).toContain("f.scheme_end_date_basis");
    expect(closedSql()).toContain("current_date");
    expect(closedSql({ sqlite: true })).toContain("date('now')");
  });
});

// ── The degradation policy ────────────────────────────────────────────────
// Written against the corpus state that caused the harm, not against the fixed
// one: the 2026-08-06 snapshot carried NO schemeEndBasis key on any record and
// schemeEndDate: null for 86 rows whose deadlines Postgres already held. Every
// case below is a shape taken from that night.
describe("unconfirmedOpen", () => {
  const PG = { source: "postgres" } as const;
  const SNAP = { source: "snapshot" } as const;

  it("confirms every row the live register supplies", () => {
    // Postgres IS the register. There is nothing fresher to check it against,
    // so the policy must be a complete no-op on that path or it becomes a
    // permanent tax on the healthy case.
    for (const row of [
      { schemeEndDate: null, schemeEndBasis: null, lastYear: 2025 },
      { schemeEndDate: "2020-12-30", schemeEndBasis: N, lastYear: 2024 },
      { schemeEndDate: "2030-01-01", schemeEndBasis: C },
    ]) {
      expect(unconfirmedOpen(row, { ...PG, populationRecordsDeadlines: true }, AS_OF)).toBeNull();
    }
  });

  it("withholds the exact shape of the 86 dead calls", () => {
    // A Spanish convocatoria as the snapshot held it: no end date, in a
    // population whose register publishes deadlines. Postgres held
    // 2025-04-14 / call_deadline for the same row and correctly withheld it.
    expect(unconfirmedOpen(
      { schemeEndDate: null, schemeEndBasis: null, lastYear: 2026 },
      { ...SNAP, populationRecordsDeadlines: true }, AS_OF)).toContain("no application deadline");
  });

  it("serves an undated row whose register does not publish deadlines", () => {
    // 310 of 390 absence-based open rows -- EIC, Horizon, the KICs, the Baltic
    // development banks. If this ever returns a reason, a Railway blip deletes
    // half the product, and the policy stops being a floor and becomes an
    // outage.
    expect(unconfirmedOpen(
      { schemeEndDate: null, schemeEndBasis: null, lastYear: 2025 },
      { ...SNAP, populationRecordsDeadlines: false }, AS_OF)).toBeNull();
  });

  it("serves a declared future window off a snapshot", () => {
    // A store being hours behind does not make a future date untrue, and this
    // is the clause that keeps a freshly loaded open call offerable.
    expect(unconfirmedOpen(
      { schemeEndDate: "2030-01-01", schemeEndBasis: C },
      { ...SNAP, populationRecordsDeadlines: true }, AS_OF)).toBeNull();
  });

  it("serves an observed renewal off a snapshot", () => {
    expect(unconfirmedOpen(
      { schemeEndDate: "2020-12-30", schemeEndBasis: N, lastYear: 2024 },
      { ...SNAP, populationRecordsDeadlines: true }, AS_OF)).toBeNull();
  });

  it("reads an ABSENT basis field as unconfirmed, never as open", () => {
    // The 2026-08-06 snapshot exactly: the key is not there at all. A store
    // that cannot tell a notified duration from a call deadline cannot
    // classify the populations either, so nothing it says about an undated row
    // can be acted on. NULL-reads-as-live is what left 80 dead Spanish calls
    // proposable.
    const noKey = { schemeEndDate: null, lastYear: 2026 };
    expect(unconfirmedOpen(noKey, { ...SNAP, populationRecordsDeadlines: false }, AS_OF))
      .toContain("scheme_end_date_basis");
    // Distinct from a basis that is present and null, which is a store saying
    // "no end date is recorded" rather than a store that lost the column.
    expect(unconfirmedOpen({ ...noKey, schemeEndBasis: null },
      { ...SNAP, populationRecordsDeadlines: false }, AS_OF)).toBeNull();
  });

  it("treats an unknown population as deadline-recording", () => {
    // Absent means "we did not ask", and the safe reading of not having asked
    // is the conservative one.
    expect(unconfirmedOpen({ schemeEndDate: null, schemeEndBasis: null },
      SNAP, AS_OF)).not.toBeNull();
  });

  it("classifies each way a row can be open", () => {
    expect(opennessEvidence({ schemeEndDate: "2020-01-01", schemeEndBasis: C }, AS_OF)).toBe("closed");
    expect(opennessEvidence({ schemeEndDate: "2030-01-01", schemeEndBasis: C }, AS_OF)).toBe("declared_window");
    expect(opennessEvidence({ schemeEndDate: "2020-12-30", schemeEndBasis: N, lastYear: 2024 }, AS_OF)).toBe("observed_renewal");
    expect(opennessEvidence({ schemeEndDate: null, schemeEndBasis: null }, AS_OF)).toBe("no_deadline_recorded");
    expect(opennessEvidence({ schemeEndDate: null }, AS_OF)).toBe("basis_not_supplied");
  });
});

describe("populationRecordsDeadlines", () => {
  it("marks a population from any one member carrying a call deadline", () => {
    const rows = [
      { pop: "calls|ES", schemeEndDate: "2025-04-14", schemeEndBasis: C },
      { pop: "calls|ES", schemeEndDate: null, schemeEndBasis: null },
      { pop: "standing|EU", schemeEndDate: null, schemeEndBasis: null },
      // A notified duration is NOT a deadline. If this ever marked the
      // population, every SATR country would qualify and the policy would
      // withhold 390 rows instead of 80.
      { pop: "standing|EU", schemeEndDate: "2020-12-30", schemeEndBasis: N },
    ];
    const records = populationRecordsDeadlines(rows, (r) => r.pop);
    expect(records(rows[1])).toBe(true);
    expect(records(rows[2])).toBe(false);
  });
});
