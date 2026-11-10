import { describe, expect, it } from "vitest";
import {
  activityTags, findInstruments, matchStatus, normaliseStatus, toNuts,
  type CapitalPort, type LayerCitation, type RegionPriorityRow, type StatusKeyRow, type StatusRuleRow,
} from "./capital";

// The property under test (playbook §4d.2, §4e): a status the company holds OR PLANS is
// matched to the doors it opens, per role and level, with what is still required and how
// the status is obtained; a rule whose quote cannot be resolved is never shown as cited.

const SHA = "a".repeat(64);
const cit = (quote: string, located = true): LayerCitation => ({ sha256: SHA, url: "https://x.example", quote, char_start: 0, char_end: quote.length, located });
const rule = (r: Partial<StatusRuleRow> & Pick<StatusRuleRow, "rule_key" | "product_family" | "role" | "status_key" | "effect">): StatusRuleRow => ({
  country: "IT", level: "national", nuts: null, instrument_ids: [], any_of: null, activity_tags: [],
  statement: r.rule_key, verify_note: null, citations: [cit(`quote ${r.rule_key}`)], ...r,
});
const key = (k: string): StatusKeyRow => ({ key: k, label: k, kind: "licence", country: "IT", how_obtained: `obtain ${k}`, citations: [cit(`how ${k}`)] });

const RULES: StatusRuleRow[] = [
  rule({ rule_key: "fdg.direct.106", product_family: "it.fdg.direct_guarantee", role: "intermediary", status_key: "lic.it.tub106", effect: "one_of", any_of: "lender", instrument_ids: ["fondo_di_garanzia"], activity_tags: ["lending"] }),
  rule({ rule_key: "fdg.direct.bank", product_family: "it.fdg.direct_guarantee", role: "intermediary", status_key: "lic.it.bank_tub13", effect: "one_of", any_of: "lender" }),
  rule({ rule_key: "fdg.app.estab", product_family: "it.fdg.direct_guarantee", role: "applicant", status_key: "estab.it", effect: "required" }),
  rule({ rule_key: "fdg.app.startup", product_family: "it.fdg.direct_guarantee", role: "applicant", status_key: "status.it.startup_innovativa", effect: "priority" }),
  rule({ rule_key: "smartstart", product_family: "it.smart_start", role: "applicant", status_key: "status.it.startup_innovativa", effect: "required",
    citations: [cit("scanned pdf quote", false)] }),
  rule({ rule_key: "sabatini.sme", product_family: "it.nuova_sabatini", role: "applicant", status_key: "status.eu.sme_annex_i", effect: "required", activity_tags: ["robotics"] }),
];
const REGIONS: RegionPriorityRow[] = [
  { nuts: "ITH5", country: "IT", region: "Emilia-Romagna", strategy: "S3", priority: "meccatronica e motoristica", activity_tags: ["robotics", "automation", "advanced_manufacturing"], citations: [cit("meccatronica e motoristica")] },
  { nuts: "ITC4", country: "IT", region: "Lombardia", strategy: "S3", priority: "Manifattura avanzata", activity_tags: ["robotics", "advanced_manufacturing"], citations: [cit("Manifattura avanzata")] },
  { nuts: "ITI4", country: "IT", region: "Lazio", strategy: "S3", priority: "Economia del Mare", activity_tags: ["blue_economy"], citations: [cit("Economia del Mare")] },
];

function port(extra: Partial<CapitalPort> = {}): CapitalPort {
  return {
    statusLayer: async () => ({ keys: ["lic.it.tub106", "status.it.startup_innovativa", "estab.it"].map(key), rules: RULES, regions: REGIONS }),
    regionGated: async (nuts: string[]) => nuts.includes("ITC4") ? [{ instrument_id: "lomb_ri", name: "Ricerca&Innova", capital_type: "grant", allowed: ["ITC4"] }] : [],
    ...extra,
  } as unknown as CapitalPort;
}
const fakeCite = () => {
  let n = 0;
  return async () => `c${++n}`;
};
type Door = { product_family: string; role: string; door: string; still_required?: string[]; evidence: { rule: string; citations: string[]; uncited_quotes?: string[] }[] };

describe("match_status: a status is matched to the doors it opens", () => {
  it("names the statuses by their common names and refuses to guess the rest", () => {
    expect(normaliseStatus("art106")).toEqual({ key: "lic.it.tub106" });
    expect(normaliseStatus("Art. 106 TUB")).toEqual({ key: "lic.it.tub106" });
    expect(normaliseStatus("startup_innovativa")).toEqual({ key: "status.it.startup_innovativa" });
    expect(normaliseStatus("estab.it.ITC4")).toEqual({ key: "estab.it", nuts: "ITC4" });
    expect(normaliseStatus("a unicorn")).toEqual({});
    expect(toNuts("Emilia Romagna")).toBe("ITH5");
    expect(toNuts("itc4")).toBe("ITC4");
    expect(activityTags("robot deployment in factories")).toEqual(expect.arrayContaining(["robotics", "advanced_manufacturing"]));
  });

  it("opens the intermediary door with 106 and says what the applicant side still needs", async () => {
    const r = await matchStatus(port(), { status: ["art106", "startup_innovativa"] }, fakeCite()) as { doors: Door[]; statuses: { status: string; citations: string[] }[] };
    const lender = r.doors.find((d) => d.product_family === "it.fdg.direct_guarantee" && d.role === "intermediary")!;
    expect(lender.door).toBe("open for this role");
    expect(lender.evidence[0].citations).toEqual(["c1"]);
    const app = r.doors.find((d) => d.product_family === "it.fdg.direct_guarantee" && d.role === "applicant")!;
    expect(app.door).toMatch(/^not yet/);
    expect(app.still_required).toEqual(["estab.it"]);
    // the plan step: how the status is obtained, cited
    expect(r.statuses.find((s) => s.status === "lic.it.tub106")?.citations.length).toBe(1);
  });

  it("an establishment in the region closes the gap and lists that region's own instruments", async () => {
    const r = await matchStatus(port(), { status: ["startup_innovativa", "estab.it.ITC4"] }, fakeCite()) as { doors: Door[]; regional_instruments: { instrument_id: string }[] };
    expect(r.doors.find((d) => d.product_family === "it.fdg.direct_guarantee" && d.role === "applicant")?.door).toBe("open for this role");
    expect(r.regional_instruments.map((x) => x.instrument_id)).toEqual(["lomb_ri"]);
  });

  it("never presents an unresolvable quote as cited", async () => {
    const r = await matchStatus(port(), { status: ["startup_innovativa"] }, fakeCite()) as { doors: Door[] };
    const ss = r.doors.find((d) => d.product_family === "it.smart_start")!;
    expect(ss.evidence[0].citations).toEqual([]);
    expect(ss.evidence[0].uncited_quotes).toEqual(["scanned pdf quote"]);
  });

  it("ranks regions by how much of the activity their own strategy names, cited", async () => {
    const r = await matchStatus(port(), { status: ["sme"], activity: "robot deployment" }, fakeCite()) as { region_fit: { nuts: string; priorities: { citations: string[] }[] }[] };
    expect(r.region_fit.map((x) => x.nuts)).toEqual(["ITH5", "ITC4"]);
    expect(r.region_fit[0].priorities[0].citations).toHaveLength(1);
  });

  it("says plainly when the layer is not loaded", async () => {
    const r = await matchStatus(port({ statusLayer: async () => ({ keys: [], rules: [], regions: [] }) }), { status: ["art106"] }, fakeCite());
    expect(r).toHaveProperty("error");
  });
});

describe("find_instruments: national vs regional", () => {
  const inst = (id: string, deliveryRegion: string | null) => ({ id, name: id, capitalType: "grant", country: "IT", eventCount: 1, gates: [], deliveryRegion }) as never;
  const p = {
    hydrate: async () => {},
    instruments: () => [inst("nat", null), inst("lomb", "ITC4"), inst("laz", "ITI4")],
    verdict: async () => ({ instrumentTable: ["nat", "lomb", "laz"].map((id) => ({ instrumentId: id, instrument: id, country: "IT", capitalType: "grant" })) }),
  } as unknown as CapitalPort;
  const ids = async (extra: Record<string, string>) =>
    (await findInstruments(p, { name: "x" }, { objective: "robots", jurisdictions: ["IT"], ...extra })).instruments.map((i) => i.instrument_id);

  it("filters by level and by region, and labels every row's level", async () => {
    expect(await ids({ level: "national" })).toEqual(["nat"]);
    expect(await ids({ level: "regional" })).toEqual(["lomb", "laz"]);
    expect(await ids({ region: "Lombardia" })).toEqual(["nat", "lomb"]);
    expect(await ids({ region: "Lombardia", level: "regional" })).toEqual(["lomb"]);
    const r = await findInstruments(p, { name: "x" }, { objective: "robots", region: "ITI4" });
    expect(r.instruments.find((i) => i.instrument_id === "laz")).toMatchObject({ level: "regional", region: "ITI4" });
  });
});
