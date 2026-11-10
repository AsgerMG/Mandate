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
