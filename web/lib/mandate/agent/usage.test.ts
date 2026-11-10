import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { argsHash, logRow, TOOL_TABLES, toolCallRow } from "./usage";
import { reginaTools, wincentTools, type Ctx } from "./mission";

describe("the usage log", () => {
  it("hashes arguments as mandate/usage.py does (canonical JSON)", () => {
    const want = createHash("sha256").update('{"a":"é","b":1}').digest("hex");
    expect(argsHash({ b: 1, a: "é" })).toBe(want);
  });

  it("counts rows, citation ids and row sources, and keeps a failure's error", () => {
    const r = toolCallRow({ brain: "wincent", tool: "find_precedents", input: { institution: "Bpifrance" }, ms: 12.4,
      result: { precedents: [{ citation: "c1", source: "satr" }, { citation: null, source: "bpi_open_data" }, { citation: "c1" }] } });
    expect(r).toMatchObject({ result_count: 3, citations: 1, sources: ["bpi_open_data", "satr"], ok: true, ms: 12,
      args_summary: "institution=Bpifrance" });
    expect(r.tables).toContain("capital.public_funding_events");
    const f = toolCallRow({ brain: "regina", tool: "search_law", input: {}, error: "boom", ms: 1 });
    expect(f).toMatchObject({ ok: false, error: "boom", result_count: 0, citations: 0 });
  });

  it("never throws when the sink fails", async () => {
    await expect(logRow(async () => { throw new Error("down"); }, toolCallRow({ brain: "mandate", tool: "x", input: {}, ms: 0 })))
      .resolves.toBeUndefined();
  });

  it("maps every specialist tool to the tables it reads", () => {
    const ctx = { deps: { capital: {}, policy: {}, mandate: {} }, ledger: {}, profile: { version: 0, payload: {} } } as unknown as Ctx;
    const names = [...wincentTools(ctx).tools, ...reginaTools(ctx).tools].map((t) => t.name);
    expect(names.filter((n) => !TOOL_TABLES[n])).toEqual([]);
  });
});
