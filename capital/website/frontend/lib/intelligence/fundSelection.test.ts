import { describe, expect, it } from "vitest";
import { renderMenu } from "./fundSelection";
import type { AxisFund } from "./shortlistAxes";

/** Two siblings under one regime that are indistinguishable on everything the
 *  candidate row carried before `funds` did: same body, same cheque, same
 *  capital type, same last year, no distinctive requirement. This is the
 *  BLIND pair the whole measurement is about — 304 of them across the 80-case
 *  fixture, six of which held the fund the company actually won. */
const sibling = (id: string, name: string, funds?: string): AxisFund => ({
  id, name, regime: "regime_x", body: "Ministry of Enterprise",
  country: "SE", capitalType: "grant",
  awardP25: 90_000, awardP50: 120_000, awardP75: 150_000, awardN: 40,
  lastYear: 2026, gates: [], funds,
});

describe("renderMenu — the scheme's own words on the candidate row", () => {
  const input = (subset: AxisFund[]) => ({
    country: "SE", sector: "energy_cleantech", subset,
    baselineTop5: [subset[0].id],
  });

  it("says nothing at all when the scheme page was never fetched", () => {
    const menu = renderMenu(input([sibling("a", "Alpha"), sibling("b", "Beta")]));
    expect(menu).not.toContain("what it funds");
    // And the two rows are then genuinely the same offer, which is the state
    // this line exists to end.
    const rows = menu.split(/\n(?=\[)/).slice(1).map((r) => r.split("\n").slice(1).join("\n"));
    expect(rows[0]).toBe(rows[1]);
  });

  it("separates two otherwise identical siblings", () => {
    const menu = renderMenu(input([
      sibling("a", "Alpha", "Funds pilot lines for battery cell manufacture."),
      sibling("b", "Beta", "Funds forestry residue logistics and terminal handling."),
    ]));
    expect(menu).toContain("what it funds, in the scheme's own words: " +
      "Funds pilot lines for battery cell manufacture.");
    const rows = menu.split(/\n(?=\[)/).slice(1).map((r) => r.split("\n").slice(1).join("\n"));
    expect(rows[0]).not.toBe(rows[1]);
  });

  it("renders the text it is given and does not re-truncate it", () => {
    // One budget, in one place (schemeText.ts). A second cut here would be a
    // second number to keep in step, which is the defect the module exists to
    // avoid -- and it would silently shorten whatever the fixture pinned.
    const long = `Funds ${"a".repeat(400)}.`;
    const menu = renderMenu(input([sibling("a", "Alpha", long), sibling("b", "Beta")]));
    expect(menu).toContain(long);
  });
});
