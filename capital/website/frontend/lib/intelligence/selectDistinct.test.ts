// wsDY — SIX DISTINCT INDICES IS NOT SIX DISTINCT OPTIONS.
//
// Two properties are pinned here and neither is a wording check:
//
//   1. The ask names PROGRAMMES. The output line used to say "N DISTINCT index
//      numbers", which two leaves of one scheme satisfy perfectly, while
//      SELECT-8 in the contract beside it said the opposite. Measured: 4 of 12
//      bench companies spent two of six seats on a sibling pair at effort
//      `low`, and Neura Robotics spent three of six on Innovation Fund SSP, MSP
//      and Battery at effort `high` — so thinking did not fix it.
//
//   2. The FLOOR counter counts what it says it counts. It is deliberately the
//      same-title case only: that is decidable with no family key, and a key
//      that could tell "Innovation Fund SSP / MSP" from "Horizon EU CL1 / CL4"
//      does not exist. Under-counting is the safe direction; a count that
//      grouped CL1 with CL4 would report a defect that is two real options.
import { describe, expect, it } from "vitest";

import { buildPrompt, sameTitlePickCount } from "./agentSelect";
import type { InstrumentRow } from "./types";

const row = (channel: string, instrument: string): InstrumentRow => ({
  channel, instrument, ticket: "", usedInField: false, fit: "",
  instrumentId: `${channel}__${instrument}`.toLowerCase().replace(/\W+/g, "_"),
});

describe("the selector asks for distinct programmes", () => {
  const rows = [
    row("innovation_fund", "Innovation Fund SSP"),
    row("innovation_fund", "Innovation Fund MSP"),
    row("horizon_eu_pillar_ii", "Horizon EU CL1"),
    row("horizon_eu_pillar_ii", "Horizon EU CL4"),
    row("state_aid_satr", "ZIM"),
    row("state_aid_satr", "ZIM"),
    row("eic", "EIC Accelerator"),
  ];

  it("does not anchor the reply length in the JSON template", () => {
    // `exactly` is the default and its template is N zeros, which is correct
    // there. The atMost template is checked in the harness that sets the lever;
    // what is pinned here is that the default has not silently changed.
    const p = buildPrompt(rows, { country: "DE", sector: "software_data_ai" }, 0, 6);
    expect(p).toContain('{"picks":[0,0,0,0,0,0]}');
  });

  it("says programmes, not index numbers, in the output contract", () => {
    const p = buildPrompt(rows, { country: "DE", sector: "software_data_ai" }, 0, 6);
    expect(p).toContain("naming DIFFERENT PROGRAMMES rather than merely");
    expect(p).not.toContain("DISTINCT\nindex numbers");
  });

  it("states the founder's test rather than naming a family key", () => {
    const p = buildPrompt(rows, { country: "DE", sector: "software_data_ai" }, 0, 6);
    expect(p).toContain("turned down by one of them be turned down by the other");
    // No computed grouping is printed. A `channel`-derived group block would put
    // CL1 and CL4 in one bucket, which suppresses a real option.
    expect(p).not.toContain("horizon_eu_pillar_ii");
    expect(p).not.toContain("innovation_fund");
  });

  it("counts a second row under the same title, and nothing else", () => {
    expect(sameTitlePickCount(rows, [4, 5])).toBe(1);   // ZIM, ZIM
    expect(sameTitlePickCount(rows, [2, 3])).toBe(0);   // CL1, CL4 are two options
    expect(sameTitlePickCount(rows, [0, 1])).toBe(0);   // the known floor: SSP/MSP missed
    expect(sameTitlePickCount(rows, [4, 5, 6, 2])).toBe(1);
    expect(sameTitlePickCount(rows, [])).toBe(0);
  });
});
