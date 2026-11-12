// The bench app's local routes, end to end against a temp store, a temp repo
// and a FAKE claude binary (no Claude Code usage, no network).
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chatPOST, GET as chatGET } from "@/app/api/bench/chat/route";
import { GET as convGET, PATCH as convPATCH } from "@/app/api/bench/conversations/route";
import { GET as mandGET, PATCH as mandPATCH, POST as mandPOST } from "@/app/api/bench/mandates/route";
import { GET as propGET, POST as propPOST } from "@/app/api/bench/proposals/route";
import { GET as runsGET, POST as runsPOST } from "@/app/api/bench/runs/route";
import { POST as stopPOST } from "@/app/api/bench/stop/route";
import { POST as trPOST } from "@/app/api/bench/transcribe/route";
import { GET as pbGET } from "@/app/api/bench/playbooks/route";
import { isLocalRequest } from "./guard";
import { atomicWrite } from "./store";

let tmp: string;
const BASE = "http://localhost:3000";
const req = (url: string, init: RequestInit & { json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("host", "localhost:3000");
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return new Request(BASE + url, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
};
const body = async (r: Response) => r.json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const events = async (r: Response) => (await r.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));

// The fake claude: prints a short stream-json conversation, or sleeps (to be stopped).
const FAKE = `#!/usr/bin/env node
const args = process.argv.slice(2);
let input = ""; process.stdin.on("data", (d) => input += d); process.stdin.on("end", () => {
  require("fs").appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, input, pid: process.pid }) + "\\n");
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
  out({ type: "system", subtype: "init" });
  if (input.includes("SLEEP")) { setInterval(() => {}, 1000); return; }
  if (input.includes("FAIL")) { process.stderr.write("boom: something broke\\n"); process.exit(1); }
  out({ type: "stream_event", event: { type: "message_start" } });
  out({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } });
  for (const d of ["## Decisions\\n", "- Go EU first\\n\\n", "Which way?"]) out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: d } } });
  out({ type: "result", is_error: false });
});
`;

beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "bench-routes-"));
  const repo = path.join(tmp, "repo");
  mkdirSync(path.join(repo, "mandate/eval/runs/bench"), { recursive: true });
  mkdirSync(path.join(repo, "mandate/playbooks/interviews"), { recursive: true });
  mkdirSync(path.join(repo, "mandate/eval/scenarios"), { recursive: true });
  writeFileSync(path.join(repo, "mandate/playbooks/interviews/regina_sme_interview.md"), "# Guide\n");
  writeFileSync(path.join(repo, "mandate/playbooks/regina.md"), "# Regina\n\nold rule\n");
  writeFileSync(path.join(repo, "mandate/eval/runs/bench/2026-11-11_case_a.md"), "# Bench run: case_a\n\n## Grade (owner)\n\n```\ngrade:\nplaybook: |\n```\n");
  const bin = path.join(tmp, "fake-claude.js");
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o755);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MANDATE_BENCH_LOCAL", "1");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("MANDATE_BENCH_DATA", path.join(tmp, "data"));
  vi.stubEnv("MANDATE_BENCH_ROOT", repo);
  vi.stubEnv("CLAUDE_BIN", bin);
  vi.stubEnv("FAKE_LOG", path.join(tmp, "calls.jsonl"));
  delete process.env.VERCEL;
});
afterAll(() => { vi.unstubAllEnvs(); rmSync(tmp, { recursive: true, force: true }); });
beforeEach(() => writeFileSync(path.join(tmp, "calls.jsonl"), ""));
const calls = () => readFileSync(path.join(tmp, "calls.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the local-only guard", () => {
  it("refuses another host, a foreign origin, a cross-site fetch and a forwarded request", () => {
    const h = (o: Record<string, string>) => new Request(BASE + "/api/bench/mandates", { headers: { host: "localhost:3000", ...o } });
    expect(isLocalRequest(h({}))).toBe(true);
    expect(isLocalRequest(h({ host: "mandate.example.com" }))).toBe(false);
    expect(isLocalRequest(h({ origin: "https://evil.example" }))).toBe(false);
    expect(isLocalRequest(h({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isLocalRequest(h({ "x-forwarded-for": "8.8.8.8" }))).toBe(false);
  });
  it("hides every route when the bench is not switched on", async () => {
    vi.stubEnv("MANDATE_BENCH_LOCAL", "0");
    try {
      for (const r of [await mandGET(req("/api/bench/mandates")), await convGET(req("/api/bench/conversations")), await runsGET(req("/api/bench/runs")),
        await pbGET(req("/api/bench/playbooks")), await propGET(req("/api/bench/proposals?path=mandate/playbooks/regina.md")),
        await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "hi" } })), await chatGET(req("/api/bench/chat?conversationId=c-xxxxxx")),
        await stopPOST(req("/api/bench/stop", { method: "POST", json: {} })), await trPOST(req("/api/bench/transcribe", { method: "POST" })),
        await mandPOST(req("/api/bench/mandates", { method: "POST", json: { client: "x" } })), await runsPOST(req("/api/bench/runs", { method: "POST", json: {} })),
        await propPOST(req("/api/bench/proposals", { method: "POST", json: {} }))])
        expect(r.status).toBe(404);
    } finally { vi.stubEnv("MANDATE_BENCH_LOCAL", "1"); }
  });
});

describe("mandates and conversations", () => {
  it("creates a mandate, starts a chat in it with the profile in the first message, and persists the reply", async () => {
    const bad = await mandPOST(req("/api/bench/mandates", { method: "POST", json: { brief: "no name" } }));
    expect(bad.status).toBe(400);
    const created = await body(await mandPOST(req("/api/bench/mandates", { method: "POST", json: { client: "Acme Lending", markets: ["DE", "IT"], brief: "Guarantees.", profile: "German GmbH, 40 staff." } })));
    const mid = created.mandate.id;

    const evs = await events(await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "What are our routes?", agent: "wincent", mandateId: mid } })));
    expect(evs.map((e) => e.t)).toContain("done");
    expect(evs.find((e) => e.t === "done").error).toBeUndefined();
    const cid = evs.find((e) => e.t === "conversation").id;
    const [first] = calls();
    expect(first.args).toContain("--agent");
    expect(first.args[first.args.indexOf("--agent") + 1]).toBe("wincent");
    expect(first.args).toContain("--session-id");
    expect(first.input).toContain("Client: Acme Lending");
    expect(first.input).toContain("German GmbH, 40 staff.");
    expect(first.input.endsWith("What are our routes?")).toBe(true);

    const { conversation, running } = await body(await convGET(req(`/api/bench/conversations?id=${cid}`)));
    expect(running).toBe(false);
    expect(conversation.title).toBe("What are our routes?");
    expect(conversation.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(conversation.messages.map((m: { role: string }) => m.role)).toEqual(["client", "agent"]);
    expect(conversation.messages[1].text).toBe("## Decisions\n- Go EU first\n\nWhich way?");
    expect(conversation.messages[1].interrupted).toBeUndefined();

    // the second turn resumes the session and does not repeat the profile
    await events(await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "EU then.", conversationId: cid } })));
    const second = calls()[1];
    expect(second.args[second.args.indexOf("--resume") + 1]).toBe(conversation.session_id);
    expect(second.input).toBe("EU then.");

    const overview = await body(await mandGET(req(`/api/bench/mandates?id=${mid}`)));
    expect(overview.rollup.decisions.map((d: { text: string }) => d.text)).toEqual(["Go EU first"]);
    expect(overview.conversations).toHaveLength(1);
    const list = await body(await mandGET(req("/api/bench/mandates")));
    expect(list.mandates[0].counts.decisions).toBe(1);

    const patched = await mandPATCH(req("/api/bench/mandates", { method: "PATCH", json: { id: mid, status: "paused" } }));
    expect((await body(patched)).mandate.status).toBe("paused");
    expect((await mandPATCH(req("/api/bench/mandates", { method: "PATCH", json: { id: mid, status: "won" } }))).status).toBe(400);
    expect((await convPATCH(req("/api/bench/conversations", { method: "PATCH", json: { id: cid, title: "Renamed" } }))).status).toBe(200);
  });

  it("validates what a chat may start", async () => {
    const post = (json: unknown) => chatPOST(req("/api/bench/chat", { method: "POST", json }));
    expect((await post({ message: "" })).status).toBe(400);
    expect((await post({ message: "x".repeat(20_001) })).status).toBe(400);
    expect((await post({ message: "hi", agent: "root" })).status).toBe(400);
    expect((await post({ message: "hi", conversationId: "../../etc" })).status).toBe(400);
    expect((await post({ message: "hi", mandateId: "m-doesnotexist" })).status).toBe(404);
    expect((await post({ message: "hi", agent: "interviewer", brain: "regina", guide: "../secret.md" })).status).toBe(400);
    expect((await chatPOST(new Request(BASE + "/api/bench/chat", { method: "POST", headers: { host: "localhost:3000" }, body: "not json" }))).status).toBe(400);
    expect(calls()).toHaveLength(0);
  });

  it("runs an interview as the interviewer, read-only, with the guide named", async () => {
    const evs = await events(await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "Let's start.", agent: "interviewer", brain: "regina", guide: "regina_sme_interview.md" } })));
    expect(evs.at(-1)).toEqual({ t: "done" });
    const [c] = calls();
    expect(c.args[c.args.indexOf("--agent") + 1]).toBe("interviewer");
    const tools = c.args.slice(c.args.indexOf("--allowedTools") + 1, c.args.indexOf("--append-system-prompt"));
    expect(tools).toEqual(["Read", "Glob", "Grep"]);
    expect(c.args.at(-1)).toContain("mandate/playbooks/interviews/regina_sme_interview.md");
  });

  it("allows one turn at a time, stops it for real, and keeps the partial reply", async () => {
    const res = await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "SLEEP please" } }));
    const reader = res.body!.getReader();
    const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).split("\n")[0]);
    const cid = first.id;
    const again = await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "again", conversationId: cid } }));
    expect(again.status).toBe(409);
    expect((await body(await convGET(req(`/api/bench/conversations?id=${cid}`)))).running).toBe(true);
    // a reload re-attaches to the running turn
    const attached = await chatGET(req(`/api/bench/chat?conversationId=${cid}`));
    expect(attached.status).toBe(200);
    expect((await body(await stopPOST(req("/api/bench/stop", { method: "POST", json: { conversationId: cid } })))).stopped).toBe(true);
    const rest = await events(attached);
    expect(rest.at(-1)).toEqual({ t: "done", stopped: true });
    reader.cancel();
    const { conversation, running } = await body(await convGET(req(`/api/bench/conversations?id=${cid}`)));
    expect(running).toBe(false);
    expect(conversation.messages.at(-1).interrupted).toBe(true);
    // the claude process is really gone
    expect(() => process.kill(calls()[0].pid, 0)).toThrow();
  });

  it("reports a failed turn in plain words, and a retry replaces the failed exchange", async () => {
    const evs = await events(await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "FAIL now" } })));
    const done = evs.at(-1);
    expect(done.error).toContain("boom: something broke");
    const cid = evs.find((e) => e.t === "conversation").id;
    let c = (await body(await convGET(req(`/api/bench/conversations?id=${cid}`)))).conversation;
    expect(c.messages).toHaveLength(2);
    expect(c.messages[1].error).toContain("boom");
    await events(await chatPOST(req("/api/bench/chat", { method: "POST", json: { message: "FAIL now", conversationId: cid, retry: true } })));
    c = (await body(await convGET(req(`/api/bench/conversations?id=${cid}`)))).conversation;
    expect(c.messages).toHaveLength(2);
  });
});

describe("runs, playbooks and proposals", () => {
  it("lists runs and writes the owner's grade into the run's block", async () => {
    const { runs } = await body(await runsGET(req("/api/bench/runs")));
    expect(runs).toEqual([expect.objectContaining({ file: "2026-11-11_case_a.md", brain: "wincent", grade: null })]);
    expect((await runsPOST(req("/api/bench/runs", { method: "POST", json: { file: "2026-11-11_case_a.md", grade: 7 } }))).status).toBe(400);
    expect((await runsPOST(req("/api/bench/runs", { method: "POST", json: { file: "../../x.md", grade: 3 } }))).status).toBe(404);
    const ok = await body(await runsPOST(req("/api/bench/runs", { method: "POST", json: { file: "2026-11-11_case_a.md", grade: 3, off: "Italy wrong", rewrite: "Lead with 106." } })));
    expect(ok.grade).toMatchObject({ grade: 3, off: "Italy wrong", rewrite: "Lead with 106." });
    const md = readFileSync(path.join(tmp, "repo/mandate/eval/runs/bench/2026-11-11_case_a.md"), "utf8");
    expect(md).toContain("grade: 3");
    expect(md).toContain("playbook: |");
  });

  it("lists playbooks with their brain", async () => {
    const { playbooks } = await body(await pbGET(req("/api/bench/playbooks")));
    expect(playbooks.map((p: { file: string }) => p.file).sort()).toEqual(["interviews/regina_sme_interview.md", "regina.md"]);
    expect(playbooks.find((p: { file: string }) => p.file === "regina.md").brains).toEqual(["regina"]);
    expect((await pbGET(req("/api/bench/playbooks?file=../../secret"))).status).toBe(400);
  });

  it("writes an accepted proposal only inside playbooks and scenarios", async () => {
    const cur = await body(await propGET(req("/api/bench/proposals?path=mandate/playbooks/regina.md")));
    expect(cur.current).toContain("old rule");
    const w = await body(await propPOST(req("/api/bench/proposals", { method: "POST", json: { path: "mandate/eval/scenarios/new_case.yaml", content: "id: new_case" } })));
    expect(w).toEqual({ path: "mandate/eval/scenarios/new_case.yaml", created: true });
    expect(readFileSync(path.join(tmp, "repo/mandate/eval/scenarios/new_case.yaml"), "utf8")).toBe("id: new_case\n");
    for (const p of ["web/app/page.tsx", "mandate/playbooks/../../../x.md", ".claude/agents/wincent.md"])
      expect((await propPOST(req("/api/bench/proposals", { method: "POST", json: { path: p, content: "x" } }))).status).toBe(400);
  });
});

describe("transcription input", () => {
  it("refuses what is not a recording before touching whisper", async () => {
    const r = await trPOST(req("/api/bench/transcribe", { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" }));
    expect(r.status).toBe(400);
    const empty = await trPOST(req("/api/bench/transcribe", { method: "POST", headers: { "content-type": "audio/webm" }, body: new Uint8Array(10) }));
    expect(empty.status).toBe(400);
    const lang = await trPOST(req("/api/bench/transcribe?lang=xx", { method: "POST", headers: { "content-type": "audio/webm" }, body: new Uint8Array(1000) }));
    expect(lang.status).toBe(400);
  });
});

describe("atomic writes", () => {
  it("leaves no temp file behind and replaces the whole file", () => {
    const f = path.join(tmp, "atomic", "x.json");
    atomicWrite(f, "one");
    atomicWrite(f, "two");
    expect(readFileSync(f, "utf8")).toBe("two");
    expect(readdirSync(path.dirname(f))).toEqual(["x.json"]);
  });
});
