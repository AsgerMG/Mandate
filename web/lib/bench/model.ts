// The local bench app's data model, shared by the page and the local routes.
// Pure: no node imports (check_client_boundary), so the client can use it.
//
// Aligned with mandate/plans/pa_os.md §2 (Portfolio > Mandate > File > Missions):
// a BenchMandate is a `workspaces` row + its `mandate_charters` version (client,
// brief, markets as jurisdictions, status) + a short company profile; a
// BenchConversation is a `mission` (kind chat) or an expert interview, keyed by
// mandate. Field names follow those tables so the files can later be loaded
// into mandate-api without a rename table.
import { parseLanded, type Citation, type Landed } from "./events";

export const BRAINS = ["wincent", "regina"] as const;
export type Brain = (typeof BRAINS)[number];
/** Who answers in a conversation: a brain, or the interviewer (training). */
export type Agent = Brain | "interviewer";
export const AGENTS: readonly Agent[] = [...BRAINS, "interviewer"];

export const BRAIN_LABEL: Record<Agent, string> = { wincent: "Wincent", regina: "Regina", interviewer: "Interviewer" };
export const BRAIN_DOMAIN: Record<Brain, string> = { wincent: "Public capital", regina: "Policy and regulation" };

export const MANDATE_STATUS = ["active", "paused", "closed"] as const;
export type MandateStatus = (typeof MANDATE_STATUS)[number];

export type BenchMandate = {
  id: string;
  client: string;          // workspaces.name
  brief: string;           // mandate_charters.objectives (one paragraph)
  markets: string[];       // mandate_charters.jurisdictions
  status: MandateStatus;   // mandate_charters.status
  profile: string;         // company_profiles, as text the brains read first
  created_at: string;
  updated_at: string;
};

export type ConversationKind = "chat" | "interview" | "lesson";

export type BenchMessage = {
  role: "client" | "agent";
  text: string;
  at: string;
  /** set on an agent message whose turn did not finish */
  error?: string;
  interrupted?: boolean;
};

export type BenchConversation = {
  id: string;
  mandate_id: string | null;
  agent: Agent;
  /** the brain an interview or lesson is FOR (its playbooks); = agent for a chat */
  brain: Brain;
  kind: ConversationKind;
  title: string;
  /** the interview guide (interviews only), e.g. regina_sme_interview.md */
  guide?: string;
  /** the Claude Code session, resumed on every turn */
  session_id: string | null;
  messages: BenchMessage[];
  cites: Record<string, Citation>;
  sources: { url: string; label: string }[];
  saved: { path: string; ledger: string | null }[];
  created_at: string;
  updated_at: string;
};

export type ConversationSummary = Pick<BenchConversation, "id" | "mandate_id" | "agent" | "brain" | "kind" | "title" | "created_at" | "updated_at"> & { turns: number; running?: boolean };

export const ID_RE = /^[a-z0-9][a-z0-9-]{5,63}$/;
export const isId = (s: unknown): s is string => typeof s === "string" && ID_RE.test(s);

/** A title from the first message: its first sentence, cut at a word. */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const sentence = flat.split(/(?<=[.?!])\s/)[0] ?? flat;
  if (sentence.length <= 64) return sentence.replace(/[.\s]+$/, "") || "New case";
  const cut = sentence.slice(0, 64);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[,;:\s]+$/, "")}…`;
}

// ── validation of what the page sends ──────────────────────────────────────

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);

export function validateMandateInput(body: unknown, partial = false): Result<Partial<Pick<BenchMandate, "client" | "brief" | "markets" | "status" | "profile">>> {
  if (!body || typeof body !== "object") return { ok: false, error: "expected an object" };
  const b = body as Record<string, unknown>;
  const out: Partial<Pick<BenchMandate, "client" | "brief" | "markets" | "status" | "profile">> = {};
  if (b.client !== undefined || !partial) {
    const c = str(b.client, 200)?.trim();
    if (!c) return { ok: false, error: "the client name is required (up to 200 characters)" };
    out.client = c;
  }
  for (const [k, max] of [["brief", 4000], ["profile", 8000]] as const) {
    if (b[k] === undefined) { if (!partial) out[k] = ""; continue; }
    const v = str(b[k], max);
    if (v === null) return { ok: false, error: `${k} must be text up to ${max} characters` };
    out[k] = v.trim();
  }
  if (b.markets !== undefined || !partial) {
    const raw = b.markets ?? [];
    const list = typeof raw === "string" ? raw.split(/[,;]/) : raw;
    if (!Array.isArray(list) || list.length > 40 || !list.every((m) => typeof m === "string" && m.length <= 60))
      return { ok: false, error: "markets must be a list of up to 40 names" };
    out.markets = [...new Set(list.map((m) => m.trim()).filter(Boolean))];
  }
  if (b.status !== undefined || !partial) {
    const s = b.status ?? "active";
    if (!MANDATE_STATUS.includes(s as MandateStatus)) return { ok: false, error: "status must be active, paused or closed" };
    out.status = s as MandateStatus;
  }
  return { ok: true, value: out };
}

// ── what landed, across a conversation or a whole mandate ──────────────────

export type LandedItem = { text: string; conversation: string; at: string };
export type Rollup = {
  decisions: LandedItem[]; flags: LandedItem[]; steps: LandedItem[]; watches: LandedItem[];
  question: string | null;
  sources: { label: string; url?: string; ids: string[] }[];
  last_activity: string | null;
};

/** Everything the replies of these conversations settled, newest last,
 *  deduplicated by text (a decision repeated in a later reply counts once). */
export function rollup(convs: BenchConversation[]): Rollup {
  const out: Rollup = { decisions: [], flags: [], steps: [], watches: [], question: null, sources: [], last_activity: null };
  const seen = new Set<string>();
  const sorted = [...convs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const c of sorted) {
    if (!out.last_activity || c.updated_at > out.last_activity) out.last_activity = c.updated_at;
    for (const m of c.messages) {
      if (m.role !== "agent" || !m.text) continue;
      const l: Landed = parseLanded(m.text);
      for (const k of ["decisions", "flags", "steps", "watches"] as const) {
        for (const text of l[k]) {
          const key = `${k}:${text.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out[k].push({ text, conversation: c.id, at: m.at });
        }
      }
      if (l.question) out.question = l.question;
    }
  }
  out.sources = groupSources(Object.assign({}, ...sorted.map((c) => c.cites)), sorted.flatMap((c) => c.sources));
  return out;
}

/** Citations grouped by the document they quote: one row per document with
 *  every id that points into it, instead of the same title six times. */
export function groupSources(cites: Record<string, Citation>, web: { url: string; label: string }[] = []): Rollup["sources"] {
  const groups = new Map<string, { label: string; url?: string; ids: string[] }>();
  const keyOf = (c: Citation) => (c.url ? c.url.replace(/#.*$/, "").replace(/\/$/, "") : (c.label ?? "").toLowerCase().trim());
  const ordered = Object.entries(cites).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  for (const [id, c] of ordered) {
    const key = keyOf(c) || id;
    const g = groups.get(key);
    if (g) { g.ids.push(id); if (!g.label && c.label) g.label = c.label; }
    else groups.set(key, { label: c.label || c.url || id, url: c.url, ids: [id] });
  }
  for (const s of web) {
    const key = keyOf({ url: s.url });
    if (!groups.has(key)) groups.set(key, { label: s.label, url: s.url, ids: [] });
  }
  return [...groups.values()];
}

// ── proposals: files the interviewer suggests writing ──────────────────────

export type Proposal = { path: string; content: string };

/** Paths the app may write on the owner's accept: the brains' playbooks and
 *  the eval scenarios. Nothing else, and never outside the repo. */
export const PROPOSAL_PATH_RE = /^mandate\/(playbooks\/[a-z0-9][a-z0-9_.-]*\.md|eval\/scenarios\/[a-z0-9][a-z0-9_-]*\.yaml)$/;
export const proposalPathOk = (p: string) => PROPOSAL_PATH_RE.test(p) && !p.includes("..");

/** The interviewer writes each proposed file as a fenced block whose info
 *  string names it: ```file path=mandate/playbooks/x.md ... ```. The habits
 *  list comes as a plain section. Blocks with a path the app may not write are
 *  dropped here, so the page never offers them. */
export function parseProposals(text: string): Proposal[] {
  const out: Proposal[] = [];
  const re = /^(`{3,}|~{3,})file\s+path=["']?([^\s"'`]+)["']?[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm;
  for (const m of text.matchAll(re)) {
    const path = m[2].replace(/^\.?\//, "");
    if (proposalPathOk(path)) out.push({ path, content: m[3].replace(/\n?$/, "\n") });
  }
  return out;
}

/** The reply with the proposal blocks folded out (they show as cards). */
export const withoutProposals = (text: string) =>
  text.replace(/^(`{3,}|~{3,})file\s+path=["']?([^\s"'`]+)["']?[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (_, __, p: string) => `*Proposed file: \`${p}\` (below)*`);

export type DiffLine = { op: " " | "+" | "-"; text: string };

/** A line diff (LCS), enough for a playbook of a few hundred lines. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.replace(/\n$/, "").split("\n") : [];
  const b = after.replace(/\n$/, "").split("\n");
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return [...a.map((t) => ({ op: "-" as const, text: t })), ...b.map((t) => ({ op: "+" as const, text: t }))];
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: " ", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: "-", text: a[i++] });
    else out.push({ op: "+", text: b[j++] });
  }
  while (i < n) out.push({ op: "-", text: a[i++] });
  while (j < m) out.push({ op: "+", text: b[j++] });
  return out;
}

// ── bench runs and their grading block ─────────────────────────────────────

export const RUN_FILE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[A-Za-z0-9_-]+\.md$/;

export type RunGrade = { grade: number | null; off: string; rewrite: string; graded_at: string | null };
export type RunSummary = { file: string; date: string; case: string; brain: Brain; title: string; grade: number | null; graded_at: string | null };

/** The run's brain: Regina when the transcript says so in its head, else Wincent
 *  (every run before 11 Nov was Wincent's). */
export function runBrain(md: string, file: string): Brain {
  const head = md.slice(0, 1500);
  if (/\bregina\b/i.test(head) || /regulatory|policy/i.test(file)) return "regina";
  return "wincent";
}

const GRADE_HEAD = /^##\s+Grade\b[^\n]*\n+(?:```[^\n]*\n([\s\S]*?)\n```)?/m;

/** Read the run's grading block: `grade: 4` (or 1-5 placeholder = none), the
 *  free-text fields the app writes, and any other keys left as they were. */
export function parseGrade(md: string): RunGrade {
  const block = md.match(GRADE_HEAD)?.[1] ?? "";
  const fields = yamlish(block);
  const g = (fields.grade ?? "").match(/^\s*([1-5])(?:\s|$|#)/);
  return {
    grade: g ? Number(g[1]) : null,
    off: fields.whats_off ?? fields.wrong ?? "",
    rewrite: fields.rewrite ?? fields.rewrite_first_paragraph ?? "",
    graded_at: fields.graded_at?.trim() || null,
  };
}

/** Top-level `key: value` and `key: |` block scalars, in order. Enough for the
 *  grading block (which is not parsed as YAML anywhere else). */
function yamlish(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | null = null;
  let lines: string[] = [];
  const flush = () => { if (key) out[key] = lines.join("\n").replace(/\s+$/, ""); };
  for (const raw of block.split("\n")) {
    const m = raw.match(/^([a-z_/]+):\s?(.*)$/i);
    if (m) {
      flush();
      key = m[1];
      const v = m[2].replace(/\s+#.*$/, "");
      lines = /^\|/.test(v) ? [] : [v];
    } else if (key) lines.push(raw.replace(/^ {2}/, ""));
  }
  flush();
  return out;
}

const indent = (s: string) => s.trim() ? s.trim().split("\n").map((l) => `  ${l}`).join("\n") : "  ";

/** The transcript with its grading block replaced by the owner's grade. Keys
 *  the app does not own stay as they were (never delete what was written). */
export function writeGrade(md: string, g: { grade: number; off: string; rewrite: string }, now: string): string {
  const owned = new Set(["grade", "whats_off", "rewrite", "graded_at", "graded_by"]);
  const m = md.match(GRADE_HEAD);
  const kept = m?.[1] ? m[1].split("\n").reduce<{ lines: string[]; skip: boolean }>((acc, raw) => {
    const k = raw.match(/^([a-z_/]+):/i)?.[1];
    if (k) acc.skip = owned.has(k);
    if (!acc.skip) acc.lines.push(raw);
    return acc;
  }, { lines: [], skip: false }).lines.join("\n").replace(/\s+$/, "") : "";
  const block = [
    `grade: ${g.grade}`,
    `whats_off: |`, indent(g.off),
    `rewrite: |`, indent(g.rewrite),
    `graded_by: owner (bench app)`,
    `graded_at: ${now}`,
    ...(kept ? [kept] : []),
  ].join("\n");
  const section = `## Grade (owner)\n\n\`\`\`\n${block}\n\`\`\`\n`;
  if (!m) return `${md.replace(/\s*$/, "\n\n")}${section}`;
  return md.slice(0, m.index) + section + md.slice((m.index ?? 0) + m[0].length).replace(/^\n*/, "\n");
}
