// wsHR — A ROW'S DISPLAYED NAME IS NEVER THE ROW'S INTERNAL ID.
//
// ── The defect, which only production found ───────────────────────────────
// wsHN renamed 22 rows away from titles that were a government department's
// name. Three weeks later a real founder's brief carried, on two of her seven
// rows (wsHP run 1):
//
//   Régime cadre exempté ... 2024-2026 · rnd  sa 111728  ministere de l
//   economie et des finances · via Conseil régional
//
// `distinguishRowNames`' last-resort token was `instrumentId.slice(prefix)`
// with the underscores turned into spaces. `nameableBody` had REFUSED to name
// that ministry as a door — and the id fragment put it in front of the founder
// anyway, as prose, with the refusal intact.
//
// ── The property, and why it is not a list ────────────────────────────────
// A ROW'S DISPLAYED NAME IS BUILT ONLY OUT OF TEXT SOMEBODY WROTE ABOUT THE
// FUND. A register of forbidden fragments would be useless here by
// construction: a slug is whatever the loader built out of whatever the
// register published, so the next one is unguessable. The test asks the
// question directly instead (`internalIdWordsIn`): flatten the appended
// qualifier and the id the same way, and no word may reach the page from the
// id and from nothing else.
//
// So every case below is one NOBODY HAS SEEN. The ids carry a ministry, a
// named person, a URL, an email, a hex digest and a NUTS code, and none of
// them is named anywhere in the assertion — the test is the property, run over
// whatever those ids happen to spell.
import { describe, expect, it } from "vitest";

import { internalIdWordsIn, qualifierSegments } from "./rowIdentity";
import { distinguishRowNames } from "./shortlist";
import type { InstrumentRow } from "./types";

const TITLE = "Régime cadre exempté de notification relatif aux aides en faveur des PME";

const row = (over: Partial<InstrumentRow>): InstrumentRow => ({
  channel: "state_aid_satr",
  instrument: TITLE,
  ticket: "",
  usedInField: false,
  fit: "",
  country: "FR",
  ...over,
} as InstrumentRow);

/** Everything a human wrote about this fund that we may show. Deliberately
 *  NOT `administeringBody` raw — see `internalIdWordsIn`: admitting it would
 *  license the exact laundering under test, because the id fragment IS the
 *  refused body's name. */
const shown = (r: InstrumentRow) => [r.schemeCode, r.capitalType, r.country];

/** Every appended qualifier on this row that reveals an internal identifier. */
const leaks = (r: InstrumentRow) =>
  qualifierSegments(r.instrument)
    .flatMap((seg) => internalIdWordsIn(seg, r.instrumentId, shown(r)));

describe("a displayed name is a name, not an identifier", () => {
  it.each([
    ["a ministry the register refuses to name",
      "satr_fr_rnd__sa_1__ministere_de_l_economie_et_des_finances"],
    ["a named individual", "nat_fund__prof_dr_ingrid_bergmann_stiftung"],
    ["a URL", "scraped__https_www_example_gov_fr_aides_2026"],
    ["an address", "reg__12_rue_de_la_paix_75002_paris"],
    ["a hex digest", "ademe_aid__volet_2_416bcf9a31d7"],
    ["a NUTS code", "satr_fr_rnd__sa_1__frk2_frf1"],
  ])("no word of the id reaches the page: %s", (_why, hostileId) => {
    // A peer group with NOTHING a human wrote to tell the two apart: same
    // title, same scheme, same capital, no nameable body, no region. This is
    // the case the id fragment used to fill.
    const rows = [
      row({ instrumentId: hostileId, schemeCode: "SA.1", capitalType: "grant" }),
      row({ instrumentId: "satr_fr_rnd__sa_1__other_leaf", schemeCode: "SA.1", capitalType: "grant" }),
    ];
    distinguishRowNames(rows);
    for (const r of rows) expect(leaks(r), `"${r.instrument}"`).toEqual([]);
  });

  it("two rows nothing can separate stay identical, for the collapse to handle", () => {
    // The honest outcome, and the one the id fragment was hiding. A name we
    // invent does not make two rows two options; it makes them one option and
    // a leak. `resolveNameCollisions` demotes -- never deletes -- the loser.
    const rows = [
      row({ instrumentId: "a__x", schemeCode: "SA.1", capitalType: "grant" }),
      row({ instrumentId: "a__y", schemeCode: "SA.1", capitalType: "grant" }),
    ];
    distinguishRowNames(rows);
    expect(rows[0].instrument).toBe(rows[1].instrument);
    expect(rows[0].instrument).toBe(TITLE);
  });

  it("one unnameable body does not cost the whole group its doors", () => {
    // THE BUG THAT MADE THE SLUG THE ONLY BRANCH THAT EVER FIRED. The old test
    // was `bodies.size === peers.length` over the RAW column, so one duplicate
    // body anywhere -- here the two ministry leaves of two regimes publishing
    // under one title -- threw the body away for every peer in the group. Four
    // rows whose granting bodies are published at a 1.0 vote share fell to the
    // id fragment together. Measured on 36 recall founders, this was why 20 of
    // 252 published rows carried an id and ZERO carried a body.
    const body = (id: string, b: string) =>
      row({ instrumentId: id, schemeCode: "SA.1", capitalType: "grant",
            administeringBody: b, administeringBodyShare: 1 });
    const rows = [
      body("satr_fr_rnd__sa_1__conseil_regional", "Conseil régional"),
      body("satr_fr_rnd__sa_1__region_grand_est", "Région Grand Est"),
      // Refused by `nameableBody`: a ministry does not take applications.
      body("satr_fr_rnd__sa_1__ministere", "Ministère de l'économie et des finances"),
      // The duplicate that used to poison the whole group.
      body("satr_fr_equity__sa_1__ministere", "Ministère de l'économie et des finances"),
    ];
    distinguishRowNames(rows);
    const named = rows.filter((r) => / · via /.test(r.instrument));
    expect(named.map((r) => r.instrument.split(" · via ")[1]).sort())
      .toEqual(["Conseil régional", "Région Grand Est"]);
    for (const r of rows) expect(leaks(r), `"${r.instrument}"`).toEqual([]);
  });

  it("the door is the LAST thing on the name, so splitDoor sees a body", () => {
    // `splitDoor` reads the final ` · via ` to hand FUND-7 the two halves of a
    // published name. A qualifier appended after the body would be judged as
    // part of the body and the row would fail a rule about a claim it never
    // made.
    const rows = [
      row({ instrumentId: "x__a", schemeCode: "SA.1", capitalType: "grant",
            administeringBody: "Caisse des Dépôts", administeringBodyShare: 1 }),
      row({ instrumentId: "x__b", schemeCode: "SA.2", capitalType: "equity",
            administeringBody: "Caisse des Dépôts", administeringBodyShare: 1 }),
    ];
    distinguishRowNames(rows);
    for (const r of rows) {
      expect(r.instrument.endsWith(" · via Caisse des Dépôts")).toBe(true);
      expect(leaks(r), `"${r.instrument}"`).toEqual([]);
    }
    // ...and they are still told apart, by the codes a founder can look up.
    expect(rows[0].instrument).not.toBe(rows[1].instrument);
  });

  it("a region is printed by its NAME or not at all", () => {
    // The raw NUTS id is an identifier too. `regionNameFor` returns null for a
    // code the corpus does not know, and falling back to "FRK2" would be the
    // same defect arriving through a different column.
    const rows = [
      row({ instrumentId: "x__a", schemeCode: "SA.1", capitalType: "grant",
            deliveryRegion: "ZZ9-NOT-A-REGION" }),
      row({ instrumentId: "x__b", schemeCode: "SA.1", capitalType: "grant" }),
    ];
    distinguishRowNames(rows);
    for (const r of rows) expect(r.instrument).not.toMatch(/ZZ9/i);
  });
});
