// The bench app's local store. Server only (node:fs).
//
// Mandates and conversations hold client details, so they live OUTSIDE the
// repo, under ~/Mandate-backups/bench/ (MANDATE_BENCH_DATA overrides), one JSON
// file each, owner-only permissions. Every write is atomic (temp file + rename)
// so a crash or a restart mid-write never leaves half a file. All fs calls are
// synchronous: within the one dev-server process a read-modify-write cannot
// interleave with another.
//
// Repo writes (a run's grade, an accepted playbook proposal) go through
// writeRepoFile, which only writes the paths the model allows.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  brainsOfPlaybook, BRAINS, foldFeedback, isId, proposalPathOk, RUN_FILE_RE,
  type BenchConversation, type BenchMandate, type Brain, type ConversationSummary, type FeedbackEvent, type FeedbackItem, type Retest, type ReviewSet,
} from "./model";

export const dataRoot = () => process.env.MANDATE_BENCH_DATA ?? path.join(os.homedir(), "Mandate-backups", "bench");
export const repoRoot = () => process.env.MANDATE_BENCH_ROOT ?? path.resolve(process.cwd(), "..");
export const BENCH_RUNS_DIR = "mandate/eval/runs/bench";

const dir = (kind: "mandates" | "conversations") => {
  const d = path.join(dataRoot(), kind);
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};

export function atomicWrite(file: string, content: string, mode = 0o600): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, content, { mode });
    renameSync(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw e;
  }
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
export const nowIso = () => new Date().toISOString();

function readJsonFile<T>(file: string): T | null {
  try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return null; }
}
function listJson<T>(d: string): T[] {
  return readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => readJsonFile<T>(path.join(d, f))).filter((x): x is T => !!x);
}

// ── mandates ───────────────────────────────────────────────────────────────

/** Mandates written before the portfolio fields default to all brains, one portfolio. */
const withDefaults = (m: BenchMandate): BenchMandate => ({ ...m, portfolio_id: m.portfolio_id ?? "default", brains: m.brains?.length ? m.brains : [...BRAINS] });
export const listMandates = (): BenchMandate[] =>
  listJson<BenchMandate>(dir("mandates")).map(withDefaults).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
export const getMandate = (id: string): BenchMandate | null => {
  const m = isId(id) ? readJsonFile<BenchMandate>(path.join(dir("mandates"), `${id}.json`)) : null;
  return m ? withDefaults(m) : null;
};
export function saveMandate(m: BenchMandate): void {
  if (!isId(m.id)) throw new Error("bad mandate id");
  atomicWrite(path.join(dir("mandates"), `${m.id}.json`), JSON.stringify(m, null, 2));
}

// ── conversations ──────────────────────────────────────────────────────────

export const getConversation = (id: string): BenchConversation | null =>
  isId(id) ? readJsonFile<BenchConversation>(path.join(dir("conversations"), `${id}.json`)) : null;
export function saveConversation(c: BenchConversation): void {
  if (!isId(c.id)) throw new Error("bad conversation id");
  atomicWrite(path.join(dir("conversations"), `${c.id}.json`), JSON.stringify(c, null, 2));
}
export const listConversations = (filter: { mandate_id?: string | null } = {}): BenchConversation[] =>
  listJson<BenchConversation>(dir("conversations"))
    .filter((c) => filter.mandate_id === undefined || c.mandate_id === filter.mandate_id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

export const summarise = (c: BenchConversation, running = false): ConversationSummary => ({
  id: c.id, mandate_id: c.mandate_id, agent: c.agent, brain: c.brain, kind: c.kind, title: c.title,
  created_at: c.created_at, updated_at: c.updated_at, turns: c.messages.filter((m) => m.role === "client").length,
  ...(running ? { running } : {}),
});

/** Read-modify-write one conversation (synchronous, so not interleaved). */
export function updateConversation(id: string, fn: (c: BenchConversation) => void): BenchConversation | null {
  const c = getConversation(id);
  if (!c) return null;
  fn(c);
  c.updated_at = nowIso();
  saveConversation(c);
  return c;
}

// ── repo files: runs, playbooks, scenarios ─────────────────────────────────

/** Absolute path of a repo file the app may read or write, or null. */
export function repoPath(rel: string, kind: "proposal" | "run"): string | null {
  const ok = kind === "run" ? RUN_FILE_RE.test(rel) : proposalPathOk(rel);
  if (!ok) return null;
  const abs = path.resolve(repoRoot(), kind === "run" ? path.join(BENCH_RUNS_DIR, rel) : rel);
  const root = path.resolve(repoRoot()) + path.sep;
  return abs.startsWith(root) ? abs : null;
}

export function readRepoFile(abs: string): string | null {
  try { return readFileSync(abs, "utf8"); } catch { return null; }
}

export function writeRepoFile(abs: string, content: string): void {
  atomicWrite(abs, content, 0o644);
}

// ── the feedback queue ─────────────────────────────────────────────────────

const feedbackFile = () => { mkdirSync(dataRoot(), { recursive: true, mode: 0o700 }); return path.join(dataRoot(), "feedback.jsonl"); };

/** Append one event (one line; O_APPEND keeps concurrent small writes whole). */
export function appendFeedback(e: FeedbackEvent): void {
  appendFileSync(feedbackFile(), `${JSON.stringify(e)}\n`, { mode: 0o600 });
}
export function readFeedback(): FeedbackItem[] {
  let raw = "";
  try { raw = readFileSync(feedbackFile(), "utf8"); } catch { return []; }
  const events: FeedbackEvent[] = [];
  for (const line of raw.split("\n")) { if (!line.trim()) continue; try { events.push(JSON.parse(line)); } catch { /* a torn last line */ } }
  return foldFeedback(events);
}

const git = (args: string[]): string | null => {
  try { return execFileSync("git", args, { cwd: repoRoot(), encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
};

/** The playbooks a brain reads right now, and the commit they are at. */
export function playbooksInForce(brain: Brain): FeedbackItem["playbooks"] {
  let files: string[] = [];
  try { files = readdirSync(path.join(repoRoot(), "mandate/playbooks")).filter((f) => f.endsWith(".md") && f !== "README.md"); } catch { /* none */ }
  files = files.filter((f) => brainsOfPlaybook(f).includes(brain)).map((f) => `mandate/playbooks/${f}`).sort();
  const sha = git(["rev-parse", "--short=10", "HEAD"]);
  const dirty = files.length ? (git(["status", "--porcelain", "--", ...files]) ?? "") !== "" : false;
  return { sha, dirty, files };
}

// ── re-tests ───────────────────────────────────────────────────────────────

const retestDir = () => { const d = path.join(dataRoot(), "retests"); mkdirSync(d, { recursive: true, mode: 0o700 }); return d; };
export const listRetests = (): Retest[] => listJson<Retest>(retestDir()).sort((a, b) => b.created_at.localeCompare(a.created_at));
export const getRetest = (id: string): Retest | null => (isId(id) ? readJsonFile<Retest>(path.join(retestDir(), `${id}.json`)) : null);
export function saveRetest(r: Retest): void {
  if (!isId(r.id)) throw new Error("bad retest id");
  atomicWrite(path.join(retestDir(), `${r.id}.json`), JSON.stringify(r, null, 2));
}

// ── review sets (runs handed to a reviewer, in order) ──────────────────────

const reviewSetDir = () => { const d = path.join(dataRoot(), "review-sets"); mkdirSync(d, { recursive: true, mode: 0o700 }); return d; };
export const listReviewSets = (): ReviewSet[] => listJson<ReviewSet>(reviewSetDir()).sort((a, b) => b.created_at.localeCompare(a.created_at));
export const getReviewSet = (id: string): ReviewSet | null => (isId(id) ? readJsonFile<ReviewSet>(path.join(reviewSetDir(), `${id}.json`)) : null);
export function saveReviewSet(s: ReviewSet): void {
  if (!isId(s.id)) throw new Error("bad review set id");
  atomicWrite(path.join(reviewSetDir(), `${s.id}.json`), JSON.stringify(s, null, 2));
}

export const SCENARIO_RE =/^[a-z0-9][a-z0-9_-]*$/;
export function readScenario(id: string): string | null {
  if (!SCENARIO_RE.test(id)) return null;
  return readRepoFile(path.join(repoRoot(), "mandate/eval/scenarios", `${id}.yaml`));
}
export function listScenarios(): string[] {
  try { return readdirSync(path.join(repoRoot(), "mandate/eval/scenarios")).filter((f) => /^[a-z0-9][a-z0-9_-]*\.yaml$/.test(f)).map((f) => f.slice(0, -5)).sort(); }
  catch { return []; }
}

/** The interview guides an interview may run (mandate/playbooks/interviews/*.md). */
export const interviewGuides = (): string[] => {
  try { return readdirSync(path.join(repoRoot(), "mandate/playbooks/interviews")).filter((f) => /^[a-z0-9_-]+\.md$/.test(f)).sort(); }
  catch { return []; }
};

export const mtimeOf =(abs: string): string | null => {
  try { return statSync(abs).mtime.toISOString(); } catch { return null; }
};
export const exists = existsSync;
