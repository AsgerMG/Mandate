/**
 * The data wiring of 10 Nov (mandate/plans/data_audit.md): market tiers in
 * find_instruments, equity stakes as precedents, and the agenda over the
 * relevant news. On fakes: no database, no network.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { agenda, findInstruments, marketTier, precedents, type AgendaRow, type CapitalPort, type PrecedentRow } from "./capital";
import { MARKET_TIER } from "./marketTiers.generated";

const inst = (id: string, country: string) =>
  ({ id, name: `${id} fund`, capitalType: "grant", country, eventCount: 1, gates: [] }) as never;

describe("market tiers", () => {
  it("is generated from capital/reference/europe_scope.json, the one definition", () => {
    const scope = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../capital/reference/europe_scope.json"), "utf8"));
    const want: Record<string, string> = { EU: scope._meta.tiers.eu };
    for (const c of scope.countries) want[c.iso2] = c.tier;
    expect(MARKET_TIER).toEqual(want); // stale? npx tsx scripts/emit_market_tiers.ts
    expect([marketTier("IT"), marketTier("eu"), marketTier("UK"), marketTier("ES"), marketTier("FI"), marketTier(null)])
      .toEqual(["core", "core", "core", "hub", "out", "out"]);
  });

  it("does not offer OUT-market instruments unless the company is established there or the country is named", async () => {
    const port = {
      hydrate: async () => {},
      instruments: () => [inst("it_1", "IT"), inst("fi_1", "FI"), inst("es_1", "ES")],
      verdict: async () => ({ instrumentTable: [
        { instrumentId: "fi_2", instrument: "Finnish", country: "FI", capitalType: "grant" },
        { instrumentId: "it_2", instrument: "Italian", country: "IT", capitalType: "grant" }] }),
    } as unknown as CapitalPort;
    const ids = (r: Awaited<ReturnType<typeof findInstruments>>) => r.instruments.map((i) => i.instrument_id);

    const plain = await findInstruments(port, { name: "x", incorporationCountry: "IT" }, { objective: "grant" });
    expect(ids(plain)).toEqual(["it_2"]);
    expect(plain.not_offered).toMatch(/FI 1/);

    const established = await findInstruments(port, { name: "x", incorporationCountry: "IT", entityCountries: ["FI"] }, { objective: "grant" });
    expect(ids(established)).toEqual(["fi_2", "it_2"]);
    expect(established.not_offered).toBeUndefined();

    const named = await findInstruments(port, { name: "x" }, { objective: "grant", jurisdictions: ["FI"] });
    expect(ids(named)).toEqual(["fi_2"]);
    // a lookup by name is explicit
    const byName = await findInstruments(port, { name: "x" }, { objective: "grant", name_query: "fi_1" });
    expect(ids(byName)).toContain("fi_1");
  });
});

const award: PrecedentRow = { company: "Lendwerk", company_country: "DE", subsector: "fintech", sector_top: "software_data_ai",
  amount_eur: 2e6, kind: "grant", started: "2024-01-01", programme: "x", granting_authority: "HTGF", source: "htgf",
  raw_source_url: "https://register.example/a" };
const stake: PrecedentRow = { company: "Seedco", company_country: "DE", subsector: "fintech", sector_top: "software_data_ai",
  amount_eur: null, kind: "equity stake", started: "2025-05-01", programme: "HTGF IV", granting_authority: "High-Tech Gründerfonds",
  source: "htgf", raw_source_url: "https://htgf.example/portfolio", record: "equity_stake", holder_type: "state_vc", stake: null, exited: false };

describe("find_precedents with equity stakes", () => {
  const asked: unknown[] = [];
  const port = {
    hydrate: async () => {}, instruments: () => [{ ...(inst("htgf_seed", "DE") as object), administeringBody: "HTGF" } as never],
    instrumentSources: async () => ["htgf"],
    precedents: async () => [award],
    equityStakes: async (q: unknown) => { asked.push(q); return [stake]; },
  } as unknown as CapitalPort;

  it("adds who-holds-whom rows for an equity or raise move, scoped by the instrument's register source", async () => {
    const r = await precedents(port, { instrument_id: "htgf_seed", move: "equity", situation: { subsector: "fintech" } },
      async () => null) as { precedents: (PrecedentRow & { evidence: string })[] };
    expect(r.precedents.map((p) => p.company).sort()).toEqual(["Lendwerk", "Seedco"]);
    expect(r.precedents.find((p) => p.company === "Seedco")?.evidence).toMatch(/equity-stake register record/);
    expect(asked).toEqual([{ sources: ["htgf"], limit: 200 }]);
  });

  it("leaves them out of a guarantee question", async () => {
    asked.length = 0;
    const r = await precedents(port, { instrument_id: "htgf_seed", move: "guarantee" }, async () => null) as { precedents: PrecedentRow[] };
    expect(r.precedents.map((p) => p.company)).toEqual(["Lendwerk"]);
    expect(asked).toEqual([]);
  });
});

describe("read_agenda", () => {
  const row = (i: number): AgendaRow => ({ article_id: i, title: `CDP opens fund ${i}`, url: `https://news.example/${i}`,
    published_at: "2026-10-0" + i, source: "Il Sole", source_tier: "trade_press", country: "IT", language: "it",
    signals: [{ type: "programme_policy_change", summary: "new fund" }], excerpt: "x".repeat(900) });
  const port = { agenda: async (q: { limit: number }) => [1, 2, 3, 4].map(row).slice(0, q.limit) } as unknown as CapitalPort;

  it("cites the first articles through grounding by URL and labels the rest as uncited news", async () => {
    const cited: string[] = [];
    const r = await agenda(port, { institution: "CDP", since: "2026-09-01" },
      async (url) => { cited.push(url); return url.endsWith("/2") ? null : `c${cited.length}`; });
    expect(cited).toEqual(["https://news.example/1", "https://news.example/2", "https://news.example/3"]);
    expect(r.articles.map((a) => a.citation)).toEqual(["c1", null, "c3", null]);
    expect(r.articles[1].evidence).toMatch(/not grounded/);
    expect(r.articles[0].excerpt?.length).toBe(400);
  });

  it("needs a filter and an ISO date", async () => {
    await expect(agenda(port, {}, async () => null)).rejects.toThrow(/institution, region or topic/);
    await expect(agenda(port, { topic: "x", since: "last week" }, async () => null)).rejects.toThrow(/ISO date/);
  });
});
