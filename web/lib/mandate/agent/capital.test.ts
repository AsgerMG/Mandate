import { describe, expect, it } from "vitest";
import { findInstruments, interpretTypes, type CapitalPort } from "./capital";

// A guarantee question asked as "loan" (the screen's vocabulary folds
// guarantees into loans) saw none of the corpus's guarantee instruments
// (alignment run, 2026-11-10). The property: a guarantee question reaches
// every guarantee instrument in scope, whichever way the type was spelled.
describe("a guarantee question is a guarantee question", () => {
  it("reads 'loan' alone with a guarantee objective as guarantee", () => {
    expect(interpretTypes("guarantee cover on our SME loan book", ["loan"])).toMatchObject({ types: ["guarantee"], inferred: true });
    expect(interpretTypes("Bürgschaft für Betriebsmittelkredit", [])).toMatchObject({ guarantee: true });
    expect(interpretTypes("working-capital loan", ["loan"])).toMatchObject({ types: ["loan"], guarantee: false });
    expect(interpretTypes("guarantee or loan", ["loan", "guarantee"])).toMatchObject({ types: ["loan", "guarantee"], inferred: false });
  });

  it("lists guarantee instruments in scope and keeps loans out unless asked", async () => {
    const inst = (id: string, capitalType: string, country: string, eventCount = 1) =>
      ({ id, name: id, capitalType, country, eventCount, gates: [] }) as never;
    let screenAsked: string[] = [];
    const port = {
      hydrate: async () => {},
      instruments: () => [inst("g_it", "guarantee", "IT", 5), inst("cg_de", "counter_guarantee", "DE", 9),
        inst("g_es", "guarantee", "ES"), inst("l_it", "loan", "IT")],
      verdict: async (_p: unknown, _o: string, types: string[]) => {
        screenAsked = types;
        return { instrumentTable: [{ instrumentId: "l_it2", instrument: "a loan", country: "IT", capitalType: "loan" }] };
      },
    } as unknown as CapitalPort;
    const r = await findInstruments(port, { name: "x" }, { objective: "public guarantee on our loan portfolio",
      instrument_types: ["loan"], jurisdictions: ["IT", "DE"] });
    expect(r.instruments.map((i) => i.instrument_id)).toEqual(["cg_de", "g_it"]);
    expect(screenAsked).toEqual(["loan"]);
    expect(r.interpreted_as).toMatch(/^guarantee/);
  });
});

import { roleRank } from "./capital";
describe("roleRank: seniority from the role's own words", () => {
  it("ranks heads, deputies, unit heads and staff in any of our languages", () => {
    expect(roleRank("Director-General")).toBe(0);
    expect(roleRank("Directeur général")).toBe(0);
    expect(roleRank("Secretary of State for Business")).toBe(0);
    expect(roleRank("Deputy Director-General - Investment")).toBe(1);
    expect(roleRank("Cheffe du service")).toBe(2);
    expect(roleRank("Vice-President of the Board")).toBe(1);
    expect(roleRank("responsabile dell'unità")).toBe(2);
    expect(roleRank("Assistant to the Director-General")).toBe(4);
    expect(roleRank("Adviser - to the Director-General")).toBe(4);
    expect(roleRank("member")).toBe(4);
    expect(roleRank("Chair of the Management Board")).toBe(0);
    expect(roleRank("Deputy Chair of the Management Board")).toBe(1);
    expect(roleRank("Member of the Management Board (promotional loans)")).toBe(2);
      // the head of a named sub-unit is a unit head, whatever the unit is called
    expect(roleRank("Head of CEO Office")).toBe(2);
    expect(roleRank("Chef du bureau du président")).toBe(2);
    expect(roleRank("Chief Executive Officer (CEO)")).toBe(0);
    expect(roleRank("Director-General of DG GROW")).toBe(0);
    expect(roleRank("Head of SME Credit")).toBe(2);
});
});

import { mergeAliases } from "./capital";
describe("mergeAliases: one body, whatever the source called it", () => {
  it("hides the alias and hangs its children under the canonical body", () => {
    const rows = [
      { key: "eu.clima", parent_key: "eu.commission", same_as: null },
      { key: "eu.dg_climate_action", parent_key: "eu.commission", same_as: "eu.clima" },
      { key: "eu.dg_climate_action.ets", parent_key: "eu.dg_climate_action", same_as: null },
    ];
    const out = mergeAliases(rows);
    expect(out.map((r) => r.key)).toEqual(["eu.clima", "eu.dg_climate_action.ets"]);
    expect(out.find((r) => r.key === "eu.dg_climate_action.ets")?.parent_key).toBe("eu.clima");
  });
});

import { findStakeholders } from "./capital";
describe("findStakeholders: a post the register names no one for", () => {
  it("says the post has no named holder instead of printing a placeholder", async () => {
    const port = {
      institutions: async () => [{ key: "it.mef", parent_key: null, name: "Ministero", kind: "ministry", market: "IT" },
        { key: "it.mef.udg", parent_key: "it.mef", name: "Ufficio di gabinetto", kind: "unit", market: "IT" }],
      stakeholders: async () => [
        { key: "it.mef.head", institution_key: "it.mef", role: "Ministro", holder_name: "Giancarlo Giorgetti", last_verified: "2026-11-23", citations: [] },
        { key: "it.mef.udg.resp", institution_key: "it.mef.udg", role: "responsabile dell'unità", holder_name: null, last_verified: "2026-11-24", citations: [] },
        { key: "it.mef.member_x", institution_key: "it.mef", role: "Board member", holder_name: null, last_verified: "2026-11-24",
          citations: [{ association: "absent_from_newest_reading", quote: "" }] }],
    } as unknown as CapitalPort;
    const r = await findStakeholders(port, { market: "IT", institution: "it.mef" }, async () => null) as { people: { holder: string | null; holder_note?: string }[] };
    const unnamed = r.people.find((p) => p.holder === null);
    expect(unnamed?.holder_note).toMatch(/names no holder/);
    expect(r.people.find((p) => p.holder === "Giancarlo Giorgetti")?.holder_note).toBeUndefined();
    // someone who left the chart is gone, not a vacant post
    expect(r.people.filter((p) => p.holder === null)).toHaveLength(1);
  });
});
