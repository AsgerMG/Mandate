// One turn of a bench conversation: Claude Code headless as the conversation's
// agent, on the owner's plan (API key stripped from the environment), resumed
// per turn with --resume. Server only.
//
// A turn belongs to the SERVER, not to the browser request: closing or
// reloading the page does not stop it. The page attaches to a running turn
// (all events so far are replayed, then it follows), and only Stop kills it,
// with its whole process group. One turn per conversation at a time. The
// conversation file is updated as text arrives, so a reload or a restart loses
// at most a second of it; a turn cut off by a restart is marked interrupted.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { brainToolHint, type BenchEvent } from "./events";
import { BRAIN_LABEL, type BenchConversation, type BenchMandate } from "./model";
import { BENCH_RUNS_DIR, getConversation, getMandate, nowIso, repoRoot, updateConversation } from "./store";

type Turn = {
  conversationId: string;
  child: ChildProcess;
  events: BenchEvent[];
  listeners: Set<(e: BenchEvent) => void>;
  done: boolean;
  stopped: boolean;
};
const G = globalThis as unknown as { __benchTurns?: Map<string, Turn> };
const turns = (G.__benchTurns ??= new Map());

export const isRunning = (conversationId: string) => turns.get(conversationId)?.done === false;

export const ledgerFor = (agent: string, sid: string) => `/tmp/${agent}-bench-${sid}.ledger.json`;

/** The environment the agent runs in: the dev server's, minus anything that
 *  would bill the API instead of the owner's plan. */
export function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "NODE_OPTIONS", "MANDATE_BENCH_LOCAL"]) delete env[k];
  delete (env as Record<string, string | undefined>).NODE_ENV;
  return env;
}

const PROPOSAL_FORMAT = `When asked to finish and distil (or to turn a critique into a lesson), write each file you propose as a COMPLETE new version of that file, in a fenced block whose info string names it, exactly like this:

\`\`\`\`file path=mandate/playbooks/<name>.md
<the whole file, as it should read after the change>
\`\`\`\`

Use four backticks for the fence, so the file may contain code blocks. Paths you may propose: mandate/playbooks/*.md (edit an existing file, or a new one such as policy-watch.md) and mandate/eval/scenarios/*.yaml (new eval cases, same format as the existing ones). Read the current file first and keep everything that is still true: change only what the expert said, and never drop a rule they did not retract. Outside the blocks, give a short "Habits" list (the 5-8 strongest, in the expert's words) and one line per file on what changed and why. The owner reviews every file before anything is written.`;

function sessionNote(c: BenchConversation, sid: string): string {
  if (c.agent === "interviewer" && c.kind === "score") {
    return `You are the Mandate interviewer, inside the bench app, SCORING a re-test of ${BRAIN_LABEL[c.brain]} against an eval case. Be strict and brief.
Reply in plain markdown, and end with the one SCORE line the message asks for, exactly as specified.`;
  }
  if (c.agent === "interviewer") {
    const guide = c.guide ? `mandate/playbooks/interviews/${c.guide}` : c.kind === "distil" ? "(none: a batch of the owner's feedback)" : "(no guide: a lesson from a graded run)";
    const who = c.kind === "lesson" ? "the owner, critiquing a run" : c.kind === "distil" ? "the owner, sending a batch of feedback items (each has an id in brackets)" : "the subject-matter expert";
    return `You are the Mandate interviewer, inside the bench app (a chat window). You are training ${BRAIN_LABEL[c.brain]}: the playbooks you improve are ${BRAIN_LABEL[c.brain]}'s.
Interview guide: ${guide}.
The person typing (or speaking, transcribed) is ${who}.
When your proposal answers feedback items, name them in the block's info string: addresses=<id>,<id>.
Reply in plain markdown. Never show tool names, commands or JSON.
${PROPOSAL_FORMAT}`;
  }
  return `You are talking with the client through the Mandate bench app (a chat window).
Session note: use the scratch ledger ${ledgerFor(c.agent, sid)} for every brain_tool call in this run (--run).
The app copies the ledger next to the transcript when the run is saved: do not copy it yourself.
Reply in plain markdown. Tables are fine. Never show tool names, commands, JSON or file paths, except the saved transcript path when asked to save.`;
}

/** The client profile the brain reads before the first message of a mandate's conversation. */
export function mandateContext(m: BenchMandate): string {
  return [
    "Context from the bench app (the mandate this conversation belongs to; treat it as the client profile, and ask for what it does not say):",
    `Client: ${m.client}`,
    m.markets.length ? `Markets: ${m.markets.join(", ")}` : "",
    m.brief ? `Mandate brief: ${m.brief}` : "",
    m.profile ? `Client profile:\n${m.profile}` : "",
    "---",
  ].filter(Boolean).join("\n");
}

/** When the Claude session is gone (it could not be resumed), the next turn
 *  starts a fresh one carrying the conversation so far. */
function transcriptContext(c: BenchConversation): string {
  const lines = c.messages.filter((m) => m.text.trim()).slice(-12).map((m) =>
    `${m.role === "client" ? "CLIENT" : BRAIN_LABEL[c.agent].toUpperCase()}: ${m.text.length > 4000 ? `${m.text.slice(0, 4000)}…` : m.text}`);
  return lines.length ? `The conversation so far (the earlier session could not be resumed; continue from here):\n\n${lines.join("\n\n")}\n\n---\n` : "";
}

export function claudeArgs(c: BenchConversation, sid: string, resume: boolean): string[] {
  const ROOT = repoRoot();
  const tools = c.agent === "interviewer"
    ? ["Read", "Glob", "Grep"]
    : ["Bash(npx tsx web/scripts/brain_tool.ts *)", "Read", "WebSearch", "WebFetch",
      // Saving the run: Write is governed by Edit rules; "//" makes the path absolute.
      `Edit(${BENCH_RUNS_DIR}/**)`, `Edit(/${path.join(ROOT, BENCH_RUNS_DIR)}/**)`];
  return [
    "-p", "--agent", c.agent, "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    ...(resume ? ["--resume", sid] : ["--session-id", sid]),
    "--permission-mode", "dontAsk", "--strict-mcp-config",
    "--allowedTools", ...tools,
    "--append-system-prompt", sessionNote(c, sid),
  ];
}

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown };

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : "")).join("");
  return "";
}

/** brain_tool prints one JSON object; its `citations` carry quote and URL. */
export function citationsOf(out: string): BenchEvent | null {
  const at = out.indexOf("{\n");
  if (at < 0) return null;
  try {
    const j = JSON.parse(out.slice(at)) as { citations?: Record<string, { quote?: string; label?: string; canonical_url?: string }> };
    const items = Object.fromEntries(Object.entries(j.citations ?? {}).map(([id, c]) =>
      [id, { quote: c.quote, label: c.label, url: c.canonical_url }]));
    return Object.keys(items).length ? { t: "cites", items } : null;
  } catch { return null; }
}

export function hintFor(name: string, input: Record<string, unknown>): BenchEvent[] {
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
  if (name === "Read" || name === "Grep" || name === "Glob") {
    const f = String(input.file_path ?? input.path ?? "");
    return [{ t: "activity", label: /interviews/.test(f) ? "reading the interview guide" : /playbooks/.test(f) ? "reading the method" : "reading a file", kind: "reading" }];
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

export class TurnBusy extends Error {}

/** Start a turn. The client message is stored first; the reply is stored as
 *  it streams. Throws TurnBusy when the conversation already has one running. */
export function startTurn(conversationId: string, message: string): Turn {
  if (isRunning(conversationId)) throw new TurnBusy("a turn is already running in this conversation");
  const conv = getConversation(conversationId);
  if (!conv) throw new Error("no such conversation");

  const resume = !!conv.session_id;
  const sid = conv.session_id ?? randomUUID();
  let prompt = message;
  if (!resume) {
    const prior = conv.messages.length ? transcriptContext(conv) : "";
    const m = conv.mandate_id ? getMandate(conv.mandate_id) : null;
    prompt = [m && conv.agent !== "interviewer" ? mandateContext(m) : "", prior, message].filter(Boolean).join("\n\n");
  }
  const at = nowIso();
  updateConversation(conversationId, (c) => {
    c.messages.push({ role: "client", text: message, at }, { role: "agent", text: "", at, interrupted: true });
  });

  const ROOT = repoRoot();
  const child = spawn(process.env.CLAUDE_BIN ?? "claude", claudeArgs(conv, sid, resume), {
    cwd: ROOT, env: childEnv(), stdio: ["pipe", "pipe", "pipe"], detached: true,
  });
  child.stdin?.end(prompt);

  const turn: Turn = { conversationId, child, events: [], listeners: new Set(), done: false, stopped: false };
  turns.set(conversationId, turn);
  const emit = (e: BenchEvent) => {
    if (turn.done) return;
    turn.events.push(e);
    for (const l of turn.listeners) { try { l(e); } catch { /* a closed stream */ } }
  };

  // The reply text as the page would show it, persisted on a short throttle.
  let text = "";
  let sawText = false;
  let sessionSeen = resume;
  const cites: Record<string, { quote?: string; label?: string; url?: string }> = {};
  const sources: { url: string; label: string }[] = [];
  let dirty = false;
  const persist = (final?: { error?: string; stopped?: boolean; saved?: { path: string; ledger: string | null }[] }) => {
    if (!dirty && !final) return;
    dirty = false;
    updateConversation(conversationId, (c) => {
      const last = c.messages[c.messages.length - 1];
      if (last?.role === "agent") {
        last.text = text;
        if (final) {
          delete last.interrupted;
          if (final.stopped) last.interrupted = true;
          if (final.error) last.error = final.error;
        }
      }
      if (sessionSeen) c.session_id = sid;
      Object.assign(c.cites, cites);
      for (const s of sources) if (!c.sources.some((x) => x.url === s.url)) c.sources.push(s);
      if (final?.saved) c.saved.push(...final.saved);
    });
  };
  const timer = setInterval(() => persist(), 1200);
  const ping = setInterval(() => { for (const l of turn.listeners) { try { l({ t: "ping" }); } catch { /* closed */ } } }, 15_000);

  emit({ t: "conversation", id: conversationId });
  emit({ t: "activity", label: "thinking", kind: "thinking" });

  const savedMd: string[] = [];
  const bashIds = new Set<string>();
  let stderr = "";
  let resultError: string | null = null;
  let buf = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev: { type?: string; parent_tool_use_id?: string | null; event?: { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string } }; message?: { content?: Block[] }; is_error?: boolean; result?: string };
      try { ev = JSON.parse(line); } catch { continue; }
      if (!sessionSeen) { sessionSeen = true; dirty = true; } // the session exists now: safe to resume next turn
      if (ev.parent_tool_use_id) continue; // a subagent's inner work
      if (ev.type === "stream_event") {
        const e = ev.event;
        if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
          text = (text + e.delta.text).replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n");
          sawText = true; dirty = true;
          emit({ t: "text", d: e.delta.text });
        } else if (e?.type === "content_block_start" && e.content_block?.type === "text") emit({ t: "activity", label: "writing", kind: "writing" });
        else if (e?.type === "content_block_start" && e.content_block?.type === "thinking") emit({ t: "activity", label: "thinking", kind: "thinking" });
        else if (e?.type === "message_start") {
          if (sawText) { text += "\n\n"; dirty = true; }
          emit({ t: "text", d: "" });
        }
      } else if (ev.type === "assistant") {
        for (const b of ev.message?.content ?? []) {
          if (b.type !== "tool_use" || !b.name) continue;
          const input = b.input ?? {};
          for (const h of hintFor(b.name, input)) {
            if (h.t === "source" && !sources.some((s) => s.url === h.url)) { sources.push({ url: h.url, label: h.label }); dirty = true; }
            emit(h);
          }
          if (b.name === "Bash" && b.id) bashIds.add(b.id);
          const fp = String(input.file_path ?? "");
          if (b.name === "Write" && fp.includes(BENCH_RUNS_DIR) && fp.endsWith(".md")) savedMd.push(fp);
        }
      } else if (ev.type === "user") {
        for (const b of ev.message?.content ?? []) {
          if (b.type !== "tool_result" || !b.tool_use_id || !bashIds.has(b.tool_use_id)) continue;
          const c = citationsOf(toolResultText(b.content));
          if (c && c.t === "cites") { Object.assign(cites, c.items); dirty = true; emit(c); }
        }
      } else if (ev.type === "result" && ev.is_error) {
        resultError = ev.result || "the agent stopped with an error";
      }
    }
  });
  child.stderr?.on("data", (c: Buffer) => { stderr = (stderr + c.toString("utf8")).slice(-2000); });

  let finished = false;
  const finish = (code: number | null, spawnError?: string) => {
    if (finished) return;
    finished = true;
    clearInterval(timer); clearInterval(ping);
    const saved: { path: string; ledger: string | null }[] = [];
    for (const md of savedMd) {
      const abs = path.isAbsolute(md) ? md : path.join(ROOT, md);
      if (!existsSync(abs)) continue;
      const ledger = abs.replace(/\.md$/, ".ledger.json");
      let copied: string | null = null;
      const scratch = ledgerFor(conv.agent, sid);
      if (existsSync(scratch) && !existsSync(ledger)) { copyFileSync(scratch, ledger); copied = path.relative(ROOT, ledger); }
      saved.push({ path: path.relative(ROOT, abs), ledger: copied });
      emit({ t: "saved", path: path.relative(ROOT, abs), ledger: copied });
    }
    let error: string | undefined;
    if (turn.stopped) error = undefined;
    else if (spawnError) error = `could not start Claude Code: ${spawnError}`;
    else if (resultError) error = resultError;
    else if (code !== 0) error = plainError(stderr, code);
    if (error && /No conversation found|session.*not found/i.test(stderr + (resultError ?? ""))) {
      sessionSeen = false; // the session is gone: the next turn starts fresh with the transcript
      updateConversation(conversationId, (c) => { c.session_id = null; });
      error = "The earlier session could not be resumed. Retry: a fresh session starts with the conversation so far.";
    }
    persist({ error, stopped: turn.stopped, saved });
    emit(turn.stopped ? { t: "done", stopped: true } : error ? { t: "done", error } : { t: "done" });
    turn.done = true;
    turn.listeners.clear();
    // keep the finished turn briefly so a page reloading right now can replay its end
    setTimeout(() => { if (turns.get(conversationId) === turn) turns.delete(conversationId); }, 30_000);
  };
  child.on("error", (err) => finish(-1, err.message));
  child.on("close", (code) => finish(code));
  return turn;
}

function plainError(stderr: string, code: number | null): string {
  const tail = stderr.trim().split("\n").slice(-3).join(" ");
  if (/usage limit|rate limit|limit reached/i.test(tail)) return `Claude Code says the usage limit is reached. ${tail}`;
  if (/not logged in|login|authenticat/i.test(tail)) return "Claude Code is not logged in on this laptop. Run `claude` once in a terminal and log in.";
  return tail || `Claude Code stopped unexpectedly (exit ${code}).`;
}

/** Follow a turn: every event so far, then each new one. Returns unsubscribe. */
export function attach(conversationId: string, send: (e: BenchEvent) => void): (() => void) | null {
  const turn = turns.get(conversationId);
  if (!turn) return null;
  for (const e of turn.events) send(e);
  if (turn.done) return () => {};
  turn.listeners.add(send);
  return () => { turn.listeners.delete(send); };
}

/** Stop a running turn: the whole process group, SIGTERM then SIGKILL. */
export function stopTurn(conversationId: string): boolean {
  const turn = turns.get(conversationId);
  if (!turn || turn.done) return false;
  turn.stopped = true;
  const kill = (sig: NodeJS.Signals) => {
    try { if (turn.child.pid) process.kill(-turn.child.pid, sig); } catch { try { turn.child.kill(sig); } catch { /* gone */ } }
  };
  kill("SIGTERM");
  setTimeout(() => { if (turn.child.exitCode === null && turn.child.signalCode === null) kill("SIGKILL"); }, 3000).unref();
  return true;
}

/** An NDJSON stream of a turn's events, for the page. Closing it (a reload)
 *  only detaches: the turn goes on. */
export function turnStream(conversationId: string): Response | null {
  const enc = new TextEncoder();
  let unsub: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: BenchEvent) => {
        if (closed) return;
        controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        if (e.t === "done") { closed = true; unsub?.(); controller.close(); }
      };
      unsub = attach(conversationId, send);
      if (!unsub) { closed = true; controller.close(); }
    },
    cancel() { unsub?.(); },
  });
  if (!turns.has(conversationId)) return null;
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
