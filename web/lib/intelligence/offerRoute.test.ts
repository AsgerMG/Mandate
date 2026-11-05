import { describe, expect, it } from "vitest";
import { ROUTE_STATUS, hasOfferRoute, hasRecordedRoute } from "./offerRoute";

describe("hasOfferRoute — may this row be proposed at all", () => {
  it("withholds only the explicit, sourced `none`", () => {
    expect(hasOfferRoute({ routeStatus: ROUTE_STATUS.none })).toBe(false);
  });

  it("proposes a row whose route we simply have not harvested", () => {
    // The direction that matters. 379 of 806 publishable rows are in this
    // state and nearly all are real schemes. A missing route is a gap in OUR
    // COLLECTION, not a fact about the world — reading it the other way is
    // precisely the reasoning that produced "IPCEI is closed".
    expect(hasOfferRoute({ routeStatus: null })).toBe(true);
    expect(hasOfferRoute({})).toBe(true);
    expect(hasOfferRoute({ routeStatus: ROUTE_STATUS.unrecorded })).toBe(true);
  });

  it("proposes a row carrying a value it does not recognise", () => {
    // Defaults to what the corpus can defend. A typo must not silently delete
    // a fund from the offer.
    expect(hasOfferRoute({ routeStatus: "nonesuch" })).toBe(true);
  });
});

describe("hasRecordedRoute — can we SHOW a way in", () => {
  it("counts an application URL", () => {
    expect(hasRecordedRoute({ applicationUrl: "https://example.org/apply" }))
      .toBe(true);
  });

  it("counts a dated window from an official register", () => {
    expect(hasRecordedRoute({ schemeEndDate: "2027-06-29" })).toBe(true);
  });

  it("counts a route attested by hand where no column can carry it", () => {
    // An email address or a paper form. Estonia's IPCEI biotechnology call
    // takes proposals by email, so there is no URL to record.
    expect(hasRecordedRoute({ routeStatus: ROUTE_STATUS.attested })).toBe(true);
  });

  it("does NOT count an administering body", () => {
    // The load-bearing exclusion. `administering_body` is derived from award
    // attribution — who PAID — so every row built out of a register of aid
    // already granted has one by construction. Counting it would make the
    // ratchet structurally blind to the population it exists to catch: an
    // artefact of a payment record always has a payer and never has an
    // application desk. This test exists so nobody "improves" coverage by
    // adding it.
    expect(hasRecordedRoute(
      { administeringBody: "Bundesministerium für Wirtschaft" } as never))
      .toBe(false);
  });

  it("is false for a Commission approval decision", () => {
    // The eleven IPCEI waves, as they actually sit in Postgres: no application
    // URL, no window, because the decision records aid already allocated.
    expect(hasRecordedRoute({
      routeStatus: ROUTE_STATUS.none,
      applicationUrl: null,
      schemeEndDate: null,
    })).toBe(false);
  });

  it("is a different question from hasOfferRoute", () => {
    // A row can be proposable and still have no route we can print — that is
    // the majority state, and conflating the two axes is the whole defect.
    const row = { routeStatus: null, applicationUrl: null, schemeEndDate: null };
    expect(hasOfferRoute(row)).toBe(true);
    expect(hasRecordedRoute(row)).toBe(false);
  });
});
