import { describe, it, expect } from "vitest";
import {
  SCHEME_END_BASIS, SOURCE_WINDOW_POLICY, closedSql, contradictsDeclaredPolicy,
  isClosed, opennessEvidence, unconfirmedOpen,
} from "./liveness";

const N = SCHEME_END_BASIS.notifiedDuration;
const C = SCHEME_END_BASIS.callDeadline;
/** The register states a window for objects like this one, so an absence in
 *  our copy is OUR gap. */
const W = SOURCE_WINDOW_POLICY.publishesWindow;
/** The register has no window field at all. Its silence is not our gap. */
const NW = SOURCE_WINDOW_POLICY.publishesNoWindow;
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
      { schemeEndDate: "2024-12-30", schemeEndBasis: N, lastYear: 2025 }, AS_OF)).toBe(false);
  });

  // ── And the prolongation it evidences ends where the award year ends ────
  it("re-closes a notified duration whose renewal evidence has gone stale", () => {
    // SA.40453, published to a real founder as row 5 of seven on 2026-08-18
    // with "confirm this regime is still accepting applications" under it. The
    // 2022 award evidences a prolongation THROUGH 2022 and says nothing about
    // 2026, so four years later the declared expiry is again the last thing
    // anybody has stated about this window.
    expect(isClosed(
      { schemeEndDate: "2020-12-30", schemeEndBasis: N, lastYear: 2022 }, AS_OF)).toBe(true);
  });

  it("judges the renewal against the CLOCK, not against the expiry", () => {
    // The same row, same award year, read at two different times. A rule that
    // only compared lastYear to the end date would answer identically on both
    // and is the rule that shipped SA.40453; a fund loaded next year is judged
    // by this same test with no edit anywhere.
    const row = { schemeEndDate: "2022-12-30", schemeEndBasis: N, lastYear: 2023 };
    expect(isClosed(row, "2025-01-01")).toBe(false);
    expect(isClosed(row, "2026-01-01")).toBe(true);
  });

  it("holds the horizon open for the register's own reporting lag", () => {
    // Measured on rows whose openness is established WITHOUT any award year —
    // a declared duration still in the future — 56.6% report no award in the
    // current year and 16.2% none for two years. A horizon of zero would call
    // most demonstrably-open schemes dead. See RENEWAL_EVIDENCE_HORIZON_YEARS.
    expect(isClosed(
      { schemeEndDate: "2023-12-30", schemeEndBasis: N, lastYear: 2024 }, "2026-08-06")).toBe(false);
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
      expect(unconfirmedOpen({ ...row, sourceWindowPolicy: W }, PG, AS_OF)).toBeNull();
    }
  });

  it("withholds the exact shape of the 86 dead calls", () => {
    // A Spanish convocatoria as the snapshot held it: no end date, in a
    // population whose register publishes deadlines. Postgres held
    // 2025-04-14 / call_deadline for the same row and correctly withheld it.
    expect(unconfirmedOpen(
      { schemeEndDate: null, schemeEndBasis: null, lastYear: 2026,
        sourceWindowPolicy: W },
      SNAP, AS_OF)).toContain("does state one");
  });

  it("serves an undated row whose register does not publish deadlines", () => {
    // 310 of 390 absence-based open rows -- EIC, Horizon, the KICs, the Baltic
    // development banks. If this ever returns a reason, a Railway blip deletes
    // half the product, and the policy stops being a floor and becomes an
    // outage.
    expect(unconfirmedOpen(
      { schemeEndDate: null, schemeEndBasis: null, lastYear: 2025,
        sourceWindowPolicy: NW },
      SNAP, AS_OF)).toBeNull();
  });

  it("serves a declared future window off a snapshot", () => {
    // A store being hours behind does not make a future date untrue, and this
    // is the clause that keeps a freshly loaded open call offerable.
    expect(unconfirmedOpen(
      { schemeEndDate: "2030-01-01", schemeEndBasis: C, sourceWindowPolicy: W },
      SNAP, AS_OF)).toBeNull();
  });

  it("serves an observed renewal off a snapshot", () => {
    expect(unconfirmedOpen(
      { schemeEndDate: "2020-12-30", schemeEndBasis: N, lastYear: 2024,
        sourceWindowPolicy: W },
      SNAP, AS_OF)).toBeNull();
  });

  it("reads an ABSENT basis field as unconfirmed, never as open", () => {
    // The 2026-08-06 snapshot exactly: the key is not there at all. A store
    // that cannot tell a notified duration from a call deadline cannot
    // classify the populations either, so nothing it says about an undated row
    // can be acted on. NULL-reads-as-live is what left 80 dead Spanish calls
    // proposable.
    const noKey = { schemeEndDate: null, lastYear: 2026, sourceWindowPolicy: NW };
    expect(unconfirmedOpen(noKey, SNAP, AS_OF)).toContain("scheme_end_date_basis");
    // Distinct from a basis that is present and null, which is a store saying
    // "no end date is recorded" rather than a store that lost the column.
    expect(unconfirmedOpen({ ...noKey, schemeEndBasis: null }, SNAP, AS_OF)).toBeNull();
  });

  it("withholds a row nobody has asked about", () => {
    // NULL is not neutral and must never be read as `publishes_no_window`. A
    // fresh corpus and an unclassified one look identical from inside the rule,
    // so defaulting here would restore the exact defect the column replaces --
    // an unexamined absence taken for a fact -- and would do it invisibly.
    expect(unconfirmedOpen({ schemeEndDate: null, schemeEndBasis: null },
      SNAP, AS_OF)).toContain("no source has been asked");
  });

  it("serves a row the successor redirect emptied", () => {
    // `publishableInstruments()` republishes a superseded registration under
    // its successor and nulls the end date on purpose. The basis stays, and a
    // basis with no date is a state no loader writes -- it is the redirect's
    // signature. Openness rests on `successor_scheme`, which is ON the row, so
    // the fallback is not inferring anything from our corpus being silent.
    //
    // Postgres offers these rows. Withholding them off the snapshot is pure
    // asymmetry: two Spanish convocatorias, no correctness bought.
    expect(unconfirmedOpen(
      { schemeEndDate: null, schemeEndBasis: C, successorScheme: "919463",
        lastYear: 2026, sourceWindowPolicy: W },
      SNAP, AS_OF)).toBeNull();
    // A successor named on a row that still HAS its window changes nothing:
    // the window is what is being read, and it is still there.
    expect(unconfirmedOpen(
      { schemeEndDate: "2020-01-01", schemeEndBasis: C, successorScheme: "919463",
        sourceWindowPolicy: W },
      SNAP, AS_OF)).toBeNull();
  });

  it("classifies each way a row can be open", () => {
    expect(opennessEvidence({ schemeEndDate: "2020-01-01", schemeEndBasis: C }, AS_OF)).toBe("closed");
    expect(opennessEvidence({ schemeEndDate: "2030-01-01", schemeEndBasis: C }, AS_OF)).toBe("declared_window");
    expect(opennessEvidence({ schemeEndDate: "2020-12-30", schemeEndBasis: N, lastYear: 2024 }, AS_OF)).toBe("observed_renewal");
    expect(opennessEvidence({ schemeEndDate: null, schemeEndBasis: C, successorScheme: "919463" }, AS_OF))
      .toBe("successor_registration");
    expect(opennessEvidence({ schemeEndDate: null, schemeEndBasis: null }, AS_OF)).toBe("no_deadline_recorded");
    expect(opennessEvidence({ schemeEndDate: null }, AS_OF)).toBe("basis_not_supplied");
  });
});

describe("source window policy", () => {
  const SNAP = { source: "snapshot" } as const;
  const AS_OF_ = "2026-08-06";

  // THE PROPERTY, and the whole reason this is a column rather than a tally:
  // the fact is about the REGISTER and is recorded at ETL time, so a copy
  // carries it however far behind it has fallen. The rule it replaced derived
  // it from the rows in hand, which meant a copy with no deadlines in it read
  // every register as publishing none -- so the safeguard withheld nothing on
  // exactly the corpus it exists for.
  it("survives a copy that has lost every deadline", () => {
    // The same Spanish convocatoria before and after the deadlines are
    // stripped. Under the old rule the stripped copy re-classified its whole
    // population as one that publishes nothing and offered the row. Here the
    // stripping cannot touch the answer, because the answer is not in the
    // dates.
    const loaded = { schemeEndDate: "2025-04-14", schemeEndBasis: C,
                     sourceWindowPolicy: W };
    const stripped = { schemeEndDate: null, schemeEndBasis: null,
                       sourceWindowPolicy: W };
    expect(unconfirmedOpen(loaded, SNAP, AS_OF_)).toBeNull();
    expect(unconfirmedOpen(stripped, SNAP, AS_OF_)).toContain("does state one");
  });

  it("serves a register whose silence is its own", () => {
    // The 310 absence-based open rows that must NOT be withheld -- EIC,
    // Horizon, the KICs, the Baltic development banks. Their registers publish
    // awards and have no window field, so no copy of any age is missing one.
    // If this ever returns a reason, a Railway blip deletes half the product.
    for (const policy of [NW, SOURCE_WINDOW_POLICY.declaresOpenEnded]) {
      expect(unconfirmedOpen(
        { schemeEndDate: null, schemeEndBasis: null, sourceWindowPolicy: policy },
        SNAP, AS_OF_)).toBeNull();
    }
  });

  it("does not read an unrecognised value as an answer", () => {
    // A writer that invents a fourth value is writing something the product
    // cannot match, and matching loosely here would silently offer rows.
    expect(unconfirmedOpen(
      { schemeEndDate: null, schemeEndBasis: null, sourceWindowPolicy: "probably_not" },
      SNAP, AS_OF_)).not.toBeNull();
  });

  it("flags a declaration its own corpus contradicts", () => {
    // The failure mode a per-feed declaration has and a derived proportion does
    // not: a feed starts publishing windows and the declaration goes stale. It
    // is a CHECK and not a rule, so it can only ever fire on evidence that is
    // present -- a thin copy proves nothing rather than accusing wrongly.
    expect(contradictsDeclaredPolicy(
      { schemeEndDate: "2025-04-14", schemeEndBasis: C, sourceWindowPolicy: NW })).toBe(true);
    expect(contradictsDeclaredPolicy(
      { schemeEndDate: "2025-04-14", schemeEndBasis: C, sourceWindowPolicy: W })).toBe(false);
    // A notified duration is not a window, and reading it as one would accuse
    // every SATR country of a stale declaration.
    expect(contradictsDeclaredPolicy(
      { schemeEndDate: "2020-12-30", schemeEndBasis: N, sourceWindowPolicy: NW })).toBe(false);
    // Nothing to contradict on a copy that carries no dates -- which is the
    // point: falsification survives staleness, derivation does not.
    expect(contradictsDeclaredPolicy(
      { schemeEndDate: null, schemeEndBasis: null, sourceWindowPolicy: NW })).toBe(false);
  });
});
