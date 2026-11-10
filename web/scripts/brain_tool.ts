/**
 * The bench: Wincent's and Regina's tools, without the model.
 *
 *   npx tsx web/scripts/brain_tool.ts <tool> '<json args>' [--profile <file.json | json>] [--run <ledger.json>]
 *
 * prints one JSON object: { tool, result, citations } on stdout.
 *
 * WHY. Phase 1 of mandate/plans/master_plan.md is a conversation with each
 * brain. Until the API budget returns, the conversation runs inside Claude Code
 * (.claude/agents/wincent.md): Claude Code is the model, and this script is its
 * hands. It runs the SAME handlers production gives the model
 * (wincentTools / reginaTools in web/lib/mandate/agent/mission.ts), so the bench
 * and production cannot drift: a fix to a tool is a fix to both.
 *
 * READ-ONLY. DATABASE_URL is replaced by CAPITAL_RO_DATABASE_URL before any
 * corpus code loads. Citations resolve through mandate.api.citations.resolve
 * (the function behind mandate-api's /grounding/cite) on that read-only
 * connection, via web/scripts/brain_tool_grounding.py. Nothing fetches into
 * grounding, saves to a workspace, or writes the profile; those tools are not
 * offered. No Anthropic call is made (`research` is replaced by the Claude Code
 * session's own WebSearch/WebFetch). fund_requirements embeds the focus with
 * Voyage (cents).
 *
 * USAGE LOG. Every call is logged as one mandate.tool_calls row (caller
 * 'bench'), by the same toolCallRow the agent loop uses: through mandate-api
 * when MANDATE_API_URL and MANDATE_SERVICE_TOKEN are set, otherwise appended to
 * web/.bench/tool_calls.jsonl (gitignored) for a later upload. --no-log skips it.
 *
 * CITATION IDS. Each call starts a fresh ledger unless --run names a ledger
 * file: then ids continue across calls ([c1], [c2]...) exactly as in one
 * production mission, and every citation is kept in that file.
 */
import { spawn, spawnSync } from "child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { createInterface } from "readline";
import { loadEnvLocal } from "./loadEnv";

const WINCENT = ["find_instruments", "assess_instrument", "fund_requirements", "application_route", "find_precedents", "profile_get"];
const REGINA = ["search_law", "document", "consultations", "actors"];

function usage(msg?: string): never {
  if (msg) console.error(msg);
  console.error(`usage: npx tsx web/scripts/brain_tool.ts <tool> '<json args>' [--profile <file|json>] [--run <ledger.json>]
  wincent: ${WINCENT.join(", ")}
  regina:  ${REGINA.join(", ")}
  --list   print each tool's description and input schema
  --no-log do not record the call in the usage log`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--list") flags.list = "1";
    else if (argv[i] === "--no-log") flags.nolog = "1";
    else if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i] ?? "";
    else pos.push(argv[i]);
  }
  return { flags, pos };
}

const readJson = (s: string) => JSON.parse(existsSync(s) ? readFileSync(s, "utf8") : s);

/** The read-only grounding bridge: one Python child for the whole call. */
function groundingBridge(dbUrl: string) {
  const repo = path.resolve(__dirname, "..", "..");
  const child = spawn("python3", [path.join(__dirname, "brain_tool_grounding.py")], {
    cwd: repo, env: { ...process.env, BENCH_GROUNDING_URL: dbUrl, PYTHONPATH: repo }, stdio: ["pipe", "pipe", "inherit"],
  });
  const waiting: ((line: string) => void)[] = [];
  createInterface({ input: child.stdout }).on("line", (l) => waiting.shift()?.(l));
  let chain = Promise.resolve<unknown>(undefined);
  const ask = (req: Record<string, unknown>) => {
    const p = chain.then(() => new Promise<{ ok?: unknown; error?: string }>((res) => {
      waiting.push((l) => res(JSON.parse(l)));
      child.stdin.write(JSON.stringify(req) + "\n");
    }));
    chain = p.catch(() => undefined);
    return p;
  };
  return { ask, close: () => child.stdin.end() };
}

async function main() {
  // Runnable from the repo root as documented: tsx resolves the "@/" alias from
  // the tsconfig in the working directory, so re-enter once with web's tsconfig
  // named (the caller's cwd is kept, so relative paths still mean what they say).
  if (!process.env.TSX_TSCONFIG_PATH) {
    const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      stdio: "inherit", env: { ...process.env, TSX_TSCONFIG_PATH: path.resolve(__dirname, "..", "tsconfig.json") },
    });
    process.exit(r.status ?? 1);
  }
  const { flags, pos } = parseArgs(process.argv.slice(2));
  // Paths given on the command line are the caller's; resolve them before the
  // env walk moves into web/ (where web/.env.local and its ancestors are found).
  const isPath = (s?: string) => !!s && !s.trim().startsWith("{") && !s.trim().startsWith("[");
  for (const k of ["profile", "run"]) if (isPath(flags[k])) flags[k] = path.resolve(flags[k]);
  if (isPath(pos[1])) pos[1] = path.resolve(pos[1]);
  process.chdir(path.resolve(__dirname, ".."));
  loadEnvLocal();
  const ro = process.env.CAPITAL_RO_DATABASE_URL;
  if (!ro) usage("CAPITAL_RO_DATABASE_URL is not set (repo-root or web/.env.local, or: source mandate/ops/_railway.sh; db_var CAPITAL_RO_DATABASE_PUBLIC_URL)");
  // Read-only, before any corpus module reads the env.
  process.env.DATABASE_URL = ro;

  const [{ wincentTools, reginaTools }, { realCapital }, { CitationLedger }, { httpPolicyApi, mandateApiFromEnv }, { toolCallRow, logRow }] = await Promise.all([
    import("../lib/mandate/agent/mission"), import("../lib/mandate/agent/capital"),
    import("../lib/mandate/agent/ledger"), import("../lib/mandate/agent/services"),
    import("../lib/mandate/agent/usage"),
  ]);
  type Row = Parameters<typeof logRow>[1];
  const api = mandateApiFromEnv();
  const usageSink = flags.nolog ? undefined : api?.logToolCalls
    ? (rows: Row[]) => api.logToolCalls!(rows)
    : async (rows: Row[]) => {
      const dir = path.resolve(__dirname, "..", ".bench");
      mkdirSync(dir, { recursive: true });
      appendFileSync(path.join(dir, "tool_calls.jsonl"), rows.map((r) => JSON.stringify({ ...r, at: new Date().toISOString() })).join("\n") + "\n");
    };
  type Ctx = Parameters<typeof wincentTools>[0];

  const bridge = groundingBridge(ro);
  const notOnBench = (what: string) => async () => { throw new Error(`${what} is not available on the bench (it writes, or needs the service token)`); };
  const mandate = {
    cite: async (req: Record<string, unknown>) => {
      const r = await bridge.ask({ op: "cite", ...req });
      if (r.error) throw new Error(r.error);
      return r.ok;
    },
    // Production fetches the page into grounding (a write). The bench only
    // reports a version grounding already holds; otherwise the row stays a
    // register record, not grounded, which is what the tool then says.
    fetch: async (url: string) => {
      const r = await bridge.ask({ op: "latest", url });
      if (r.error) throw new Error(r.error);
      if (!r.ok) throw new Error(`${url} is not in grounding (the bench never fetches)`);
      return r.ok;
    },
    verify: notOnBench("verify"), profile: notOnBench("profile"), appendProfile: notOnBench("profile_append"),
    createMission: notOnBench("missions"), getMission: notOnBench("missions"), addMessage: async () => ({}),
    save: notOnBench("workspace saves"), findActors: notOnBench("actors_register_find"),
    addActor: notOnBench("actors_register_add"), applyEmailFormat: notOnBench("suggest_email"),
  };

  const profile = flags.profile ? readJson(flags.profile) : { name: "bench" };
  const ledger = new CitationLedger();
  type Entry = ReturnType<typeof ledger.all>[number];
  const prior: Entry[] = flags.run && existsSync(flags.run) ? JSON.parse(readFileSync(flags.run, "utf8")) : [];
  for (const e of prior) ledger.add(e.citation, e.specialist, e.via, e.label);
  const before = ledger.all().length;

  const ctx = {
    deps: {
      client: { create: async () => { throw new Error("no model on the bench: Claude Code is the model"); } },
      mandate, policy: httpPolicyApi(), capital: realCapital,
    },
    ledger, missionId: "bench", profileId: "bench", profile: { version: 0, payload: profile },
    emit: () => {}, budget: { wrapUpAt: Infinity, stopAt: Infinity, note: "" },
  } as unknown as Ctx;

  const w = wincentTools(ctx);
  const r = reginaTools(ctx);
  const offered = new Map<string, { tool: unknown; handler: (typeof w.handlers)[string]; who: string }>();
  for (const [set, names, who] of [[w, WINCENT, "wincent"], [r, REGINA, "regina"]] as const) {
    for (const n of names) offered.set(n, { tool: set.tools.find((t) => t.name === n), handler: set.handlers[n], who });
  }

  if (flags.list) {
    console.log(JSON.stringify([...offered.entries()].map(([n, o]) => ({ who: o.who, ...(o.tool as object), name: n })), null, 1));
    bridge.close();
    return;
  }
  const [name, raw] = pos;
  if (!name) usage();
  const o = offered.get(name);
  if (!o) usage(`unknown tool ${name}`);
  const input = raw ? readJson(raw) : {};
  const missing = (o.handler.required ?? []).filter((k) => input[k] === undefined || input[k] === null || input[k] === "");
  if (missing.length) usage(`missing required input: ${missing.join(", ")}`);

  let result: unknown;
  let error: string | undefined;
  const t0 = Date.now();
  try {
    result = await o.handler.run(input);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await logRow(usageSink, toolCallRow({ brain: o.who as "wincent" | "regina", tool: name, input, result, error,
    ms: Date.now() - t0, missionId: flags.run ? `bench:${path.basename(flags.run)}` : null, caller: "bench" }));
  bridge.close();
  const fresh = ledger.all().slice(before);
  if (flags.run) writeFileSync(flags.run, JSON.stringify(ledger.all(), null, 1));
  console.log(JSON.stringify({
    tool: name, brain: o.who, ...(error ? { error } : { result }),
    citations: Object.fromEntries(fresh.map((e) => [e.id, {
      quote: e.citation.quote, label: e.label, canonical_url: e.citation.canonical_url,
      sha256: e.citation.sha256, span: e.citation.span, fetched_at: e.citation.fetched_at,
    }])),
  }, null, 1));
  process.exit(error ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
