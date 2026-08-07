import { describe, it, expect } from "vitest";
import { SCHEME_END_BASIS, closedSql, isClosed } from "./liveness";

const N = SCHEME_END_BASIS.notifiedDuration;
const C = SCHEME_END_BASIS.callDeadline;
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

  // ── The basis that was tried here and does not belong ──────────────────
  it("does NOT close a row that merely has no date, whatever else it carries", () => {
    // The IPCEI regression, held down. On 2026-08-07 a third basis,
    // `closed_beneficiary_list`, was added so that eleven Commission approval
    // decisions would read as closed WITHOUT a date. The rows deserved to be
    // withheld; this axis was the wrong place to do it, and doing it here made
    // the corpus assert that IPCEI is closed -- which is false. Nine IPCEI
    // candidates are in the design phase and Estonia's call is open until
    // 31.08.2026.
    //
    // "There is no way into this row" is now `route_status` in
    // ./offerRoute.ts. If a future pass reaches for this axis again to express
    // it, this test fails: an unknown basis with no date must stay OPEN, and
    // the withholding must be argued somewhere it can carry a source.
    expect(isClosed({ schemeEndBasis: "closed_beneficiary_list" }, AS_OF)).toBe(false);
    expect(isClosed({ schemeEndDate: null, schemeEndBasis: "closed_beneficiary_list",
                      lastYear: 2025 }, AS_OF)).toBe(false);
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
    }
    expect(closedSql({ col: "f" })).toContain("f.scheme_end_date_basis");
    expect(closedSql()).toContain("current_date");
    expect(closedSql({ sqlite: true })).toContain("date('now')");
  });
});
