import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/mandate/mission/route";

const live = { workspaceId: "w", profileId: "p", profileVersion: 1, objective: "Choose a market" };
const req = (body: unknown, q = "") =>
  new NextRequest(`http://localhost/api/mandate/mission${q}`, { method: "POST", body: JSON.stringify(body) });

describe("POST /api/mandate/mission with no model budget", () => {
  afterEach(() => { delete process.env.LLM_BUDGET; });

  it("answers a clear 503 before any stream opens", async () => {
    process.env.LLM_BUDGET = "off";
    const res = await POST(req(live));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "The advisor is paused: no model budget.", reason: "llm_budget_off" });
  });

  it("keeps the scripted preview (?demo=1) working", async () => {
    process.env.LLM_BUDGET = "off";
    const res = await POST(req({ ...live, workspaceId: "demo-workspace", mode: "demo" }, "?demo=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("ndjson");
    await res.body?.cancel();
  });
});
