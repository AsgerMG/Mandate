/**
 * The runtime on a scripted model and in-memory services: no network, no spend.
 *
 * What is proven: the loop's stop-reason handling; that evidence reaches the
 * model only as ledger ids registered from mandate-api citations; that a save
 * the workspace refuses comes back to the model as an error it can fix; and
 * that a mission emits the owner's MissionEvent lifecycle with cited evidence
 * on the decision.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { withCostTracking } from "@/lib/intelligence/cost";
import type { MissionEvent } from "../workspace";
import type { CapitalPort } from "./capital";
import { CitationLedger, type Citation } from "./ledger";
import { runLoop, type ModelClient } from "./loop";
import { runMission } from "./mission";
import { ServiceError, type MandateApi, type PolicyApi } from "./services";
import type { ToolCallRow } from "./usage";

// ── a scripted model ─────────────────────────────────────────────────────

type Block = Anthropic.ContentBlock;
let seq = 0;
const use = (name: string, input: Record<string, unknown>): Block =>
  ({ type: "tool_use", id: `tu_${++seq}`, name, input, caller: { type: "direct" } } as unknown as Block);
const say = (text: string): Block => ({ type: "text", text, citations: null } as unknown as Block);
function message(content: Block[], stop: Anthropic.Message["stop_reason"], model = "claude-sonnet-5-5"): Anthropic.Message {
  return { id: `m${++seq}`, type: "message", role: "assistant", model, content, stop_reason: stop,
    stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 200 } } as unknown as Anthropic.Message;
}

/** Each agent gets its own script, picked by what its system prompt says it is. */
function scripted(scripts: Record<string, ((p: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message)[]>) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: ModelClient = {
    async create(p) {
      calls.push(structuredClone(p));
      const sys = (p.system as Anthropic.TextBlockParam[]).map((b) => b.text).join("\n");
      const who = sys.includes("# Wincent") ? "wincent" : sys.includes("# Regina") ? "regina"
        : sys.includes("You research public-policy") ? "research" : "mandate";
      const next = scripts[who]?.shift();
      if (!next) throw new Error(`script for ${who} ran out`);
      return next(p);
    },
  };
  return { client, calls };
}

function lastToolResults(p: Anthropic.MessageCreateParamsNonStreaming): Anthropic.ToolResultBlockParam[] {
  const last = p.messages[p.messages.length - 1];
  return (Array.isArray(last.content) ? last.content : []).filter(
    (b): b is Anthropic.ToolResultBlockParam => (b as { type: string }).type === "tool_result");
}

// ── loop ─────────────────────────────────────────────────────────────────

describe("runLoop", () => {
  const base = { model: "claude-sonnet-5-5", system: [{ type: "text" as const, text: "sys" }], tools: [] };

  it("re-sends a paused server-tool turn and ends on end_turn", async () => {
    const { client, calls } = scripted({ mandate: [
      () => message([say("searching")], "pause_turn"),
      () => message([say("done")], "end_turn"),
    ] });
    const r = await runLoop({ ...base, client, handlers: {}, messages: [{ role: "user", content: "q" }] });
    expect(r.stop).toBe("end_turn");
    expect(r.text).toBe("done");
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.role).toBe("assistant");
  });

  it("never runs the tools of a refused turn", async () => {
    let ran = 0;
    const { client } = scripted({ mandate: [() => message([use("t", {})], "refusal")] });
    const r = await runLoop({ ...base, client, handlers: { t: { run: async () => { ran++; } } },
      messages: [{ role: "user", content: "q" }] });
    expect(r.stop).toBe("refusal");
    expect(ran).toBe(0);
  });

  it("returns every tool result in one message, errors included", async () => {
    const { client, calls } = scripted({ mandate: [
      () => message([use("ok", { a: 1 }), use("needs", {}), use("ghost", {}), use("boom", {})], "tool_use"),
      () => message([say("fine")], "end_turn"),
    ] });
    await runLoop({ ...base, client, messages: [{ role: "user", content: "q" }], handlers: {
      ok: { run: async (i) => ({ got: i.a }) },
      needs: { required: ["x"], run: async () => "never" },
      boom: { run: async () => { throw new Error("kaboom"); } },
    } });
    const results = lastToolResults(calls[1]);
    expect(results).toHaveLength(4);
    expect(results.map((r) => Boolean(r.is_error))).toEqual([false, true, true, true]);
    expect(String(results[1].content)).toContain("missing required input: x");
  });

  it("asks the model to wrap up past the budget share, and stops at the ceiling", async () => {
    const { client, calls } = scripted({ mandate: [
      () => message([use("t", {})], "tool_use"),
      () => message([use("t", {})], "tool_use"),
      () => message([say("unreachable")], "end_turn"),
    ] });
    const { result } = await withCostTracking(() => runLoop({ ...base, client, messages: [{ role: "user", content: "q" }],
      handlers: { t: { run: async () => "ok" } },
      budget: { wrapUpAt: 0.001, stopAt: 0.005, note: "WRAP UP" } }));
    expect(JSON.stringify(calls[1].messages.at(-1))).toContain("WRAP UP");
    expect(result.stop).toBe("budget");
  });
});

// ── ledger ───────────────────────────────────────────────────────────────

describe("CitationLedger", () => {
  const c: Citation = { sha256: "a".repeat(64), canonical_url: "https://kfw.de/x", span: [0, 10], quote: "Hausbank",
    fetched_at: "2026-11-09T00:00:00Z" };
  it("numbers citations, dedupes the same span, and renders evidence", () => {
    const l = new CitationLedger();
    expect(l.add(c, "wincent", "t")).toBe("c1");
    expect(l.add({ ...c }, "regina", "t")).toBe("c1");
    expect(l.add({ ...c, span: [5, 9] }, "regina", "t")).toBe("c2");
    expect(Object.keys(l.pick(["c2", "c9"]))).toEqual(["c2"]);
    expect(l.evidence("c1")?.publisher).toBe("kfw.de");
  });
});

describe("find_instruments", () => {
  it("keeps its name matches when the screen fails", async () => {
    const { capital } = fakeServices();
    const { findInstruments } = await import("./capital");
    const r = await findInstruments({ ...capital, verdict: async () => { throw new Error("ENOENT companies_index.json"); } },
      { name: "x" }, { objective: "guarantee", name_query: "Ausfallbuergschaft" });
    expect(r.instruments.map((i) => i.instrument_id)).toEqual(["kfw_buergschaft"]);
    expect(r.screen_unavailable).toBeTruthy();
  });
});

// ── precedents ───────────────────────────────────────────────────────────

describe("find_precedents", () => {
  it("ranks by situation, cites the top register page, and says when there is none", async () => {
    const { capital } = fakeServices();
    const { precedents } = await import("./capital");
    const cited: string[] = [];
    const r = await precedents(capital, { instrument_id: "kfw_buergschaft", move: "guarantee",
      situation: { subsector: "fintech", country: "DE", raise_size_eur: 4e6 } },
      async (url) => { cited.push(url); return "c7"; }) as { precedents: { company: string; citation: string | null }[] };
    expect(r.precedents.map((p) => p.company)).toEqual(["Lendwerk GmbH", "Agrar AG"]);
    expect(r.precedents[0].citation).toBe("c7");
    expect(cited).toEqual(["https://register.example/lendwerk"]);
    const none = await precedents(capital, { institution: "Nobody Bank", move: "guarantee" }, async () => null);
    expect(none).toMatchObject({ none_found: true });
  });
});

// ── a whole mission ──────────────────────────────────────────────────────

const SHA = "b".repeat(64);
const QUOTE = "Antraege werden ueber die Hausbank gestellt.";

function fakeServices() {
  const saved: Record<string, Record<string, unknown>[]> = {};
  const messages: Record<string, unknown>[] = [];
  const mandate: MandateApi = {
    fetch: async () => ({ sha256: SHA, canonical_url: "https://kfw.example/b", fetched_at: "2026-11-09T00:00:00Z",
      chars: 100, citable: true, reused: false }),
    cite: async (req) => {
      if (req.sha256 !== SHA || req.quote !== QUOTE) throw new ServiceError("422: the quote is not in the document", 422);
      return { sha256: SHA, canonical_url: "https://kfw.example/b", title: "KfW Buergschaften", span: [10, 10 + QUOTE.length],
        quote: QUOTE, fetched_at: "2026-11-09T00:00:00Z" };
    },
    verify: async () => [],
    profile: async () => ({ version: 1, payload: { name: "Lendo", subsectors: ["fintech"], incorporationCountry: "DE" } }),
    appendProfile: async () => ({ version: 2 }),
    createMission: async () => ({ id: "mission-1" }),
    getMission: async (id) => ({ id, workspace_id: "w", profile_id: "p", profile_version: 1, job: "funding-routes",
      messages: messages.map((x) => ({ created_by: String(x.created_by), content: String(x.content ?? ""),
        payload: x.payload as Record<string, unknown> })) }),
    addMessage: async (_id, body) => { messages.push(body); return {}; },
    save: async (_id, kind, body) => {
      // the double of mandate-api's claim rule: enough to prove a refusal reaches the model
      for (const c of (body.claims as { basis?: string; citation_ids?: string[] }[]) ?? []) {
        if (!c.basis) throw new ServiceError("422: claim 0: basis must be one of cited, judgement, unverified", 422);
        for (const id of c.citation_ids ?? []) {
          if (!(body.citations as Record<string, unknown>)[id]) throw new ServiceError(`422: citation ${id} not provided`, 422);
        }
      }
      (saved[kind] ??= []).push(body);
      return { id: `${kind}-${saved[kind].length}`, created_at: "2026-11-09T00:00:00Z", ordinal: saved[kind].length };
    },
    findActors: async () => ({ actors: [] }),
    addActor: async () => ({}),
    applyEmailFormat: async () => ({}),
  };
  const policy: PolicyApi = {
    search: async () => ({ results: [] }), document: async () => ({}), passages: async () => ({ passages: [] }),
    consultations: async () => ({ consultations: [] }), actors: async () => ({ actors: [] }),
  };
  const inst = {
    id: "kfw_buergschaft", parentId: null, name: "Buergschaftsbank Ausfallbuergschaft", country: "DE", capitalType: "loan",
    administeringBody: "Buergschaftsbank", gates: [{ id: "g1", requirement: "Applied for through the house bank",
      value: "", intakeField: "none", quote: QUOTE, source: { file: "kfw.pdf", locator: "p.2" }, verified: true, gateRole: "obligation" }],
  };
  const capital: CapitalPort = {
    hydrate: async () => {}, instruments: () => [inst as never], hydrateGates: async () => {},
    verdict: async () => ({ eligibilityScreen: [], instrumentTable: [], selfMatched: false, candidateInstrumentIds: [] }),
    demands: async () => [], instrumentSources: async () => ["kfw_src"],
    precedents: async (q) => q.instrument?.sources.includes("kfw_src") ? [
      { company: "Lendwerk GmbH", company_country: "DE", subsector: "fintech", sector_top: "software_data_ai", amount_eur: 2e6,
        kind: "debt/guarantee", started: "2024-03-01", programme: "Ausfallbuergschaft", granting_authority: "Buergschaftsbank",
        source: "kfw_src", raw_source_url: "https://register.example/lendwerk" },
      { company: "Agrar AG", company_country: "FR", subsector: "agritech", sector_top: "agrifood", amount_eur: 9e5,
        kind: "debt/guarantee", started: "2019-01-01", programme: "x", granting_authority: "Buergschaftsbank",
        source: "kfw_src", raw_source_url: null }] : [],
    gateGrounding: async () => [{ instrumentId: "kfw_buergschaft", gateKey: "g1", sha256: SHA }],
  };
  return { mandate, policy, capital, saved, messages };
}

describe("runMission", () => {
  it("runs the lifecycle, cites through the ledger, and lets the model fix a refused save", async () => {
    const svc = fakeServices();
    const { client, calls } = scripted({
      mandate: [
        () => message([use("consult_wincent", { question: "Route for a German loan-book guarantee?" })], "tool_use", "claude-opus-5-5"),
        (p) => {
          const report = String(lastToolResults(p)[0].content);
          expect(report).toContain("[c1]");
          return message([use("save_decision", { title: "Go through a Hausbank", recommendation: "Partner with a bank.",
            confidence: "medium", claims: [{ text: "Bare claim." }] })], "tool_use", "claude-opus-5-5");
        },
        (p) => {
          expect(lastToolResults(p)[0].is_error).toBe(true);
          return message([
            use("save_decision", { title: "Go through a Hausbank", recommendation: "Partner with a bank.", confidence: "medium",
              claims: [{ text: "German guarantees are applied for through the house bank.", basis: "cited", citation_ids: ["c1"] },
                       { text: "A partnership beats a licence here.", basis: "judgement", citation_ids: [] }] }),
            use("save_watch", { kind: "route", subject: "Buergschaftsbank guarantee", route_status: "pursue",
              trigger: "house-bank principle changes" }),
            use("finish_mission", { title: "Guarantee routes", summary: "Germany runs through a Hausbank.",
              sections: [{ heading: "Germany", claims: [{ text: "Via the house bank.", basis: "cited", citation_ids: ["c1"] }] }],
              questions: [{ question: "Which banks do you work with?", why: "the Hausbank is the channel" }] }),
          ], "tool_use", "claude-opus-5-5");
        },
      ],
      wincent: [
        () => message([use("assess_instrument", { instrument_id: "kfw_buergschaft" })], "tool_use"),
        (p) => {
          expect(String(lastToolResults(p)[0].content)).toContain('"citation": "c1"');
          return message([say("Apply through the house bank [c1].")], "end_turn");
        },
      ],
    });
    const logged: ToolCallRow[] = [];
    svc.mandate.logToolCalls = async (rows) => { logged.push(...rows); return { recorded: rows.length }; };
    const events: MissionEvent[] = [];
    const { result } = await withCostTracking(() => runMission(
      { workspaceId: "w", profileId: "p", profileVersion: 1, objective: "Guarantee our loan book in Germany" },
      { client, mandate: svc.mandate, policy: svc.policy, capital: svc.capital, budgetEur: 100 }, (e) => events.push(e)));

    expect(result.finished).toBe(true);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("mission_started");
    expect(types).toContain("specialist_started");
    expect(types).toContain("specialist_completed");
    expect(types.at(-1)).toBe("mission_completed");
    const decision = events.find((e) => e.type === "decision");
    expect(decision?.type === "decision" && decision.decision.evidence[0].canonicalUrl).toBe("https://kfw.example/b");
    expect(decision?.type === "decision" && decision.decision.rationale).toContain("[c1]");
    expect(svc.saved.decisions).toHaveLength(1);
    expect(Object.keys(svc.saved.decisions[0].citations as object)).toEqual(["c1"]);
    expect(svc.saved.watchlist[0].subject).toBe("Buergschaftsbank guarantee");
    expect(svc.saved.deliverable).toHaveLength(1);
    // the specialist ran on Sonnet, the orchestrator on Opus, both adaptive
    expect(calls.filter((c) => c.model === "claude-opus-5-5")).toHaveLength(3);
    expect(calls.filter((c) => c.model === "claude-sonnet-5-5")).toHaveLength(2);
    expect(calls.every((c) => (c.thinking as { type: string }).type === "adaptive")).toBe(true);
    // the usage log: every tool call, by whom, on which mission, with what it cited
    expect(logged.map((r) => `${r.brain}:${r.tool}:${r.ok}`)).toEqual([
      "wincent:assess_instrument:true", "mandate:consult_wincent:true", "mandate:save_decision:false",
      "mandate:save_decision:true", "mandate:save_watch:true", "mandate:finish_mission:true"]);
    expect(logged.every((r) => r.mission_id === "mission-1" && r.caller === "agent")).toBe(true);
    const a = logged[0];
    expect(a.citations).toBe(1);
    expect(a.tables).toContain("capital.eligibility_gates");
    expect(a.args_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("asks the founder first when the ask is vague, then resumes with their answers", async () => {
    const svc = fakeServices();
    const first = scripted({ mandate: [
      () => message([use("ask_founder", { preamble: "Before routes, I need your situation.",
        questions: [{ question: "Are you raising now?", why: "co-investment loans match a round" }] })], "tool_use", "claude-opus-5-5"),
    ] });
    const events: MissionEvent[] = [];
    const r1 = await runMission({ workspaceId: "w", profileId: "p", profileVersion: 1, objective: "How can public money help us?",
      job: "funding-routes" }, { client: first.client, mandate: svc.mandate, policy: svc.policy, capital: svc.capital }, (e) => events.push(e));
    expect(r1).toMatchObject({ awaiting: true, finished: false });
    expect(first.calls).toHaveLength(1);
    expect(events.find((e) => e.type === "questions")).toBeTruthy();
    expect(JSON.stringify(first.calls[0].messages[0])).toContain("Hausbank"); // the job playbook is loaded up front

    const second = scripted({ mandate: [
      (p) => {
        const opening = JSON.stringify(p.messages[0]);
        expect(opening).toContain("Are you raising now?");
        expect(opening).toContain("We close a seed round in March");
        return message([use("finish_mission", { title: "t", summary: "s", questions: [],
          sections: [{ heading: "Raising", claims: [{ text: "Lead with co-investment.", basis: "judgement", citation_ids: [] }] }] })],
          "tool_use", "claude-opus-5-5");
      },
    ] });
    const r2 = await runMission({ workspaceId: "w", profileId: "p", profileVersion: 1, objective: "We close a seed round in March.",
      missionId: r1.missionId }, { client: second.client, mandate: svc.mandate, policy: svc.policy, capital: svc.capital }, () => {});
    expect(r2.finished).toBe(true);
  });

  it("refuses a mission on a profile version that has moved on", async () => {
    const svc = fakeServices();
    const events: MissionEvent[] = [];
    const r = await runMission({ workspaceId: "w", profileId: "p", profileVersion: 3, objective: "x" },
      { client: scripted({}).client, mandate: svc.mandate, policy: svc.policy, capital: svc.capital }, (e) => events.push(e));
    expect(r.finished).toBe(false);
    expect(events[0]).toMatchObject({ type: "error", recoverable: false });
  });
});
