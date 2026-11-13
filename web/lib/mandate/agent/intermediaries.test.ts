import { describe, expect, it } from "vitest";
import {
  findIntermediaries, sameInstitution, toMarket, toProductType,
  type CapitalPort, type IntermediaryRow, type LayerCitation,
} from "./capital";

// The property (follow public money through its channels): for a market and a product, the
// intermediaries already carrying EIF/InvestEU or fund-of-funds backing come back cited, the
// company's OWN banks first, and a quote that does not resolve is never shown as cited.

const cit = (quote: string, located = true): LayerCitation =>
  ({ sha256: "b".repeat(64), url: "https://www.eif.org/x.pdf", quote, char_start: 0, char_end: quote.length, located });
const row = (r: Partial<IntermediaryRow> & Pick<IntermediaryRow, "key" | "market" | "name" | "kind" | "product_types">): IntermediaryRow => ({
  backing: "eif_investeu_guarantee", backing_detail: [], as_of: "2025-12-31", website: null, note: null,
  citations: [cit(`line ${r.name}`)], ...r,
});
const ROWS: IntermediaryRow[] = [
  row({ key: "eu.eif", market: "EU", name: "European Investment Fund (EIB Group)", kind: "implementing_partner", product_types: ["guarantee", "equity"], note: "open call" }),
  row({ key: "dk.danske_bank", market: "DK", name: "Danske Bank A/S", kind: "bank", product_types: ["loan"], backing_detail: [{ programme: "EIF Sustainability Guarantee", support: "direct_guarantee", currency: "EUR", amount: 50_000_000 }] }),
  row({ key: "dk.sydbank", market: "DK", name: "Sydbank A/S", kind: "bank", product_types: ["loan"], backing_detail: [{ programme: "x", support: "direct_guarantee", amount: 500_000_000 }] }),
  row({ key: "dk.flex", market: "DK", name: "Flex Garanti II ApS", kind: "specialised_lender", product_types: ["loan"], citations: [cit("scanned", false)] }),
  row({ key: "dk.capidea", market: "DK", name: "Capidea Kapital IV KS", kind: "fund", product_types: ["equity"], backing: "eif_investeu_equity" }),
  row({ key: "de.dl", market: "DE", name: "Deutsche Leasing Finance GmbH", kind: "lessor", product_types: ["lease"] }),
  row({ key: "se.seb", market: "SE", name: "Skandinaviska Enskilda Banken AB", kind: "bank", product_types: ["loan"] }),
];
const port = (rows = ROWS): CapitalPort => ({
  intermediaries: async (markets: string[]) => rows.filter((r) => markets.includes(r.market)),
}) as unknown as CapitalPort;
const fakeCite = () => {
  let n = 0;
  return async () => `c${++n}`;
};
type Out = {
  intermediaries: { name: string; is_client_bank?: boolean; citations: string[]; uncited_quotes?: string[] }[];
  client_banks_backed?: string[]; client_banks_not_listed?: string[]; other_products_in_market?: string[];
  implementing_partner: { name: string; citations: string[] }[]; error?: string;
};

describe("find_intermediaries: who already carries the public backing", () => {
  it("lists a market's backed lenders for the product, the client's own bank first, cited", async () => {
    const r = await findIntermediaries(port(), { market: "Denmark", product_type: "loan", client_banks: ["Danske Bank", "Nordea"] }, fakeCite()) as Out;
    expect(r.intermediaries.map((i) => i.name)).toEqual(["Danske Bank A/S", "Sydbank A/S", "Flex Garanti II ApS"]);
    expect(r.intermediaries[0].is_client_bank).toBe(true);
    expect(r.client_banks_backed).toEqual(["Danske Bank"]);
    expect(r.client_banks_not_listed).toEqual(["Nordea"]);
    expect(r.other_products_in_market).toEqual(["equity"]);
    expect(r.implementing_partner[0].citations.length).toBe(1);
  });

  it("never shows an unresolved quote as cited", async () => {
    const r = await findIntermediaries(port(), { market: "DK", product_type: "loan" }, fakeCite()) as Out;
    const flex = r.intermediaries.find((i) => i.name.startsWith("Flex"))!;
    expect(flex.citations).toEqual([]);
    expect(flex.uncited_quotes).toEqual(["scanned"]);
    expect(r.intermediaries[0]).not.toHaveProperty("is_client_bank");
  });

  it("reads product words and market names, and keeps markets apart", async () => {
    const r = await findIntermediaries(port(), { market: "Germany", product_type: "operating leasing" }, fakeCite()) as Out;
    expect(r.intermediaries.map((i) => i.name)).toEqual(["Deutsche Leasing Finance GmbH"]);
    expect(toProductType("Bürgschaft")).toBe("guarantee");
    expect(toProductType("VC round")).toBe("equity");
    expect(toMarket("United Kingdom")).toBe("UK");
    expect(toMarket("xx land")).toBeUndefined();
  });

  it("matches a client bank by name or acronym, not by a shared common word", () => {
    expect(sameInstitution("SEB", "Skandinaviska Enskilda Banken AB")).toBe(true);
    expect(sameInstitution("danske bank", "Danske Bank A/S")).toBe(true);
    expect(sameInstitution("Bank", "Danske Bank A/S")).toBe(false);
    expect(sameInstitution("Nordea Bank", "Danske Bank A/S")).toBe(false);
  });

  it("says so when the layer is not loaded, and refuses an unknown product", async () => {
    expect((await findIntermediaries(port([]), { market: "DK", product_type: "loan" }, fakeCite()) as Out).error).toMatch(/migration 041/);
    expect((await findIntermediaries(port(), { market: "DK", product_type: "grant" }, fakeCite()) as Out).error).toMatch(/product_type/);
  });
});
