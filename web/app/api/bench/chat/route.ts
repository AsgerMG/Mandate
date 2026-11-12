// LOCAL-ONLY. The bench app's one route: runs Claude Code headless as the
// wincent agent on the owner's own plan (no Anthropic API key, no API cost),
// keeps the conversation across turns with --resume, and streams a cleaned-up
// view of its events to /bench as NDJSON.
//
// It refuses (404) unless ALL of: NODE_ENV=development, MANDATE_BENCH_LOCAL=1,
// not on Vercel, the request addressed to localhost, and (when a browser sends
// one) a localhost Origin. It must never run anywhere but the owner's laptop:
// it spawns a process with tool access to the checkout.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { benchEnabled, brainToolHint, type BenchEvent } from "@/lib/bench/events";

export const dynamic = "force-dynamic";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isLocalRequest(req: Request): boolean {
  const host = req.headers.get("host") ?? "";
  if (!LOCAL_HOST.test(host)) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try { if (!LOCAL_HOST.test(new URL(origin).host)) return false; } catch { return false; }
  }
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd && !fwd.split(",").every((a) => /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(a.trim()))) return false;
  return true;
}

const ROOT = process.env.MANDATE_BENCH_ROOT ?? path.resolve(process.cwd(), "..");
const BENCH_DIR = "mandate/eval/runs/bench/";
const ledgerFor = (sid: string) => `/tmp/wincent-bench-${sid}.ledger.json`;

const sessionNote = (sid: string) => `You are talking with the client through the Mandate bench app (a chat window).
Session note: use the scratch ledger ${ledgerFor(sid)} for every brain_tool call in this run (--run).
The app copies the ledger next to the transcript when the run is saved: do not copy it yourself.
Reply in plain markdown. Never show tool names, commands, JSON or file paths, except the saved transcript path when asked to save.`;

/** The environment the agent runs in: the dev server's, minus anything that
 *  would bill the API instead of the owner's plan. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "NODE_OPTIONS", "MANDATE_BENCH_LOCAL"]) delete env[k];
  delete (env as Record<string, string | undefined>).NODE_ENV; // the dev server's, not the agent's
  return env;
}

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown };

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : "")).join("");
  return "";
}

/** brain_tool prints one JSON object; its `citations` carry quote and URL. */
function citationsOf(out: string): BenchEvent | null {
  const at = out.indexOf("{\n");
  if (at < 0) return null;
  try {
    const j = JSON.parse(out.slice(at)) as { citations?: Record<string, { quote?: string; label?: string; canonical_url?: string }> };
    const items = Object.fromEntries(Object.entries(j.citations ?? {}).map(([id, c]) =>
      [id, { quote: c.quote, label: c.label, url: c.canonical_url }]));
    return Object.keys(items).length ? { t: "cites", items } : null;
  } catch { return null; }
}

function hintFor(name: string, input: Record<string, unknown>): BenchEvent[] {
  if (name === "Bash") {
    const cmd = String(input.command ?? "");
    const m = cmd.match(/brain_tool\.ts\s+([a-z_]+)\s+'([^']*)'/);
    if (!m) return [/playbooks\//.test(cmd)
      ? { t: "activity", label: "reading the method", kind: "reading" }
      : { t: "activity", label: "working through the case", kind: "thinking" }];
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(m[2]); } catch { /* keep the bare hint */ }
    return [brainToolHint(m[1], args)];
  }
  if (name === "Read") {
    const f = String(input.file_path ?? "");
    return [{ t: "activity", label: /playbooks/.test(f) ? "reading the method" : "reading a file", kind: "reading" }];
  }
  if (name === "WebSearch") return [{ t: "activity", label: "searching official sources", kind: "researching" }];
  if (name === "WebFetch") {
    const url = String(input.url ?? "");
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep */ }
    return [{ t: "activity", label: `reading ${host}`, kind: "reading" }, { t: "source", url, label: host }];
  }
  if (name === "Write") return [{ t: "activity", label: "saving the run", kind: "writing" }];
  return [{ t: "activity", label: "working through the case", kind: "thinking" }];
}

export async function POST(req: Request): Promise<Response> {
  if (!benchEnabled(process.env) || !isLocalRequest(req)) return new Response("Not found", { status: 404 });

  let body: { message?: unknown; sessionId?: unknown };
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 20000) return new Response("message required", { status: 400 });
  const resume = typeof body.sessionId === "string" && UUID.test(body.sessionId) ? body.sessionId : null;
  const sid = resume ?? randomUUID();

  const args = [
    "-p", "--agent", "wincent", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    ...(resume ? ["--resume", sid] : ["--session-id", sid]),
    "--permission-mode", "dontAsk", "--strict-mcp-config",
    "--allowedTools", "Bash(npx tsx web/scripts/brain_tool.ts *)", "Read", "WebSearch", "WebFetch",
    // Saving the run: Write is governed by Edit rules; "//" makes the path absolute.
    `Edit(${BENCH_DIR}**)`, `Edit(/${path.join(ROOT, BENCH_DIR)}**)`,
    "--append-system-prompt", sessionNote(sid),
  ];
  const child = spawn(process.env.CLAUDE_BIN ?? "claude", args, { cwd: ROOT, env: childEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(message);

  const enc = new TextEncoder();
  const savedMd: string[] = [];
  let stderr = "";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: BenchEvent) => { if (!closed) controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); };
      send({ t: "session", id: sid });
      send({ t: "activity", label: "thinking", kind: "thinking" });
      const bashIds = new Set<string>();
      let buf = "";
      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: { type?: string; parent_tool_use_id?: string | null; event?: { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string } }; message?: { content?: Block[] }; is_error?: boolean; result?: string };
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.parent_tool_use_id) continue; // a subagent's inner work: not the conversation
          if (ev.type === "stream_event") {
            const e = ev.event;
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) send({ t: "text", d: e.delta.text });
            else if (e?.type === "content_block_start" && e.content_block?.type === "text") send({ t: "activity", label: "writing", kind: "writing" });
            else if (e?.type === "content_block_start" && e.content_block?.type === "thinking") send({ t: "activity", label: "thinking", kind: "thinking" });
            else if (e?.type === "message_start") send({ t: "text", d: "" });
          } else if (ev.type === "assistant") {
            for (const b of ev.message?.content ?? []) {
              if (b.type !== "tool_use" || !b.name) continue;
              const input = b.input ?? {};
              for (const h of hintFor(b.name, input)) send(h);
              if (b.name === "Bash" && b.id) bashIds.add(b.id);
              const fp = String(input.file_path ?? "");
              if (b.name === "Write" && fp.includes(BENCH_DIR) && fp.endsWith(".md")) savedMd.push(fp);
            }
          } else if (ev.type === "user") {
            for (const b of ev.message?.content ?? []) {
              if (b.type !== "tool_result" || !b.tool_use_id || !bashIds.has(b.tool_use_id)) continue;
              const c = citationsOf(toolResultText(b.content));
              if (c) send(c);
            }
          } else if (ev.type === "result" && ev.is_error) {
            send({ t: "done", error: ev.result || "the agent stopped with an error" });
          }
        }
      });
      child.stderr.on("data", (c: Buffer) => { stderr = (stderr + c.toString("utf8")).slice(-2000); });
      child.on("error", (err) => { send({ t: "done", error: `could not start claude: ${err.message}` }); closed = true; controller.close(); });
      child.on("close", (code) => {
        if (closed) return;
        for (const md of savedMd) {
          const abs = path.isAbsolute(md) ? md : path.join(ROOT, md);
          if (!existsSync(abs)) continue;
          const ledger = abs.replace(/\.md$/, ".ledger.json");
          let copied: string | null = null;
          if (existsSync(ledgerFor(sid)) && !existsSync(ledger)) { copyFileSync(ledgerFor(sid), ledger); copied = path.relative(ROOT, ledger); }
          send({ t: "saved", path: path.relative(ROOT, abs), ledger: copied });
        }
        send(code === 0 ? { t: "done" } : { t: "done", error: stderr.trim().split("\n").slice(-3).join(" ") || `claude exited ${code}` });
        closed = true;
        controller.close();
      });
    },
    cancel() { child.kill("SIGTERM"); },
  });
  req.signal.addEventListener("abort", () => child.kill("SIGTERM"));

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return new Response("Not found", { status: 404 });
}
