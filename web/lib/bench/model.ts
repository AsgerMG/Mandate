// The local bench app's data model, shared by the page and the local routes.
// Pure: no node imports (check_client_boundary), so the client can use it.
//
// Aligned with mandate/plans/pa_os.md §2 (Portfolio > Mandate > File > Missions):
// a BenchMandate is a `workspaces` row + its `mandate_charters` version (client,
// brief, markets as jurisdictions, status) + a short company profile; a
// BenchConversation is a `mission` (kind chat) or an expert interview, keyed by
// mandate. Field names follow those tables so the files can later be loaded
// into mandate-api without a rename table.
import { withoutBoard } from "./board";
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
  /** pa_os.md §2: the team's portfolio this mandate sits in (one today) */
  portfolio_id: string;
  /** the brains deployed on this mandate; they share its profile and what landed */
  brains: Brain[];
  client: string;          // workspaces.name
  brief: string;           // mandate_charters.objectives (one paragraph)
  markets: string[];       // mandate_charters.jurisdictions
  status: MandateStatus;   // mandate_charters.status
  profile: string;         // company_profiles, as text the brains read first
  created_at: string;
  updated_at: string;
};

export type ConversationKind = "chat" | "interview" | "lesson" | "distil" | "retest" | "score" | "eval_run";

/** A reviewer's comment on one reply: good / off and a free-text note, any
 *  number of them per reply (the owner, then the expert). Each is an item in
 *  the feedback queue (item_id). */
export type Review = { item_id: string; reviewer: string; rating: "good" | "off" | null; note: string; at: string };
/** A reviewer's 1-5 grade of a whole run. */
export type ReviewGrade = { item_id: string; reviewer: string; grade: number; note: string; at: string };

/** The judge's verdict on an eval run, as mandate/eval/run_conversation.py judge_summary writes it. */
export type JudgeSummary = {
  grade: number | null; holistic: number | null; scale?: string | null;
  must_met: number | null; must_partly: number | null; must_total: number | null; must_not_hit: number | null; must_not_total?: number | null;
  overall?: string | null; strongest?: string | null; weakest?: string | null; judged_at?: string | null; judgement: string | null;
};

/** An eval run, read as a conversation: which case, which brain, which run
 *  (the loop's tag, "bench" for a saved bench run, "retest" for the app's
 *  re-test), the transcript in the repo and the judge's grade. Written by
 *  mandate/eval/run_conversation.py (loop.run_case and the importer) and by
 *  the re-test route; the same JSON format as every other conversation. */
export type EvalRun = {
  kind: "eval_run";
  case_id: string;
  brain: Brain;
  tag: string;
  run_file: string | null;
  source: "loop" | "bench" | "retest";
  ran_at: string;
  /** the judge's grade (null until judged) */
  grade: number | null;
  judge: JudgeSummary | null;
  /** the owner's grade written in the transcript's grading block, if any */
  owner_grade: number | null;
  instruction?: string;
};

export type BenchMessage = {
  role: "client" | "agent";
  text: string;
  at: string;
  /** the owner's quick rating of this reply (the item is in the feedback queue) */
  feedback?: { rating: "good" | "off"; item_id: string; note?: string };
  /** reviewers' comments on this reply (an eval run under review) */
  reviews?: Review[];
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
  /** the owner's 1-5 grade of the whole conversation */
  grade?: { grade: number; item_id: string };
  /** a distil: the feedback items it was given */
  feedback_ids?: string[];
  /** a re-test or its scoring: the eval case */
  case?: string;
  /** an eval run (kind eval_run, or a re-test): the run it shows */
  eval_run?: EvalRun;
  /** reviewers' 1-5 grades of the run, oldest first */
  review_grades?: ReviewGrade[];
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

type MandateFields = Pick<BenchMandate, "client" | "brief" | "markets" | "status" | "profile" | "brains">;
export function validateMandateInput(body: unknown, partial = false): Result<Partial<MandateFields>> {
  if (!body || typeof body !== "object") return { ok: false, error: "expected an object" };
  const b = body as Record<string, unknown>;
  const out: Partial<MandateFields> = {};
  if (b.brains !== undefined || !partial) {
    const raw = b.brains ?? [...BRAINS];
    if (!Array.isArray(raw) || !raw.length || !raw.every((x) => BRAINS.includes(x as Brain))) return { ok: false, error: "deploy at least one brain (wincent, regina)" };
    out.brains = BRAINS.filter((x) => raw.includes(x));
  }
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
      const l: Landed = parseLanded(withoutBoard(m.text, ""));
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

export type Proposal = { path: string; content: string; addresses: string[] };

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
  const re = /^(`{3,}|~{3,})file\s+path=["']?([^\s"'`]+)["']?([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm;
  for (const m of text.matchAll(re)) {
    const path = m[2].replace(/^\.?\//, "");
    const addresses = (m[3].match(/addresses=["']?([^\s"'`]+)/)?.[1] ?? "").split(",").map((s) => s.trim()).filter((s) => ID_RE.test(s));
    if (proposalPathOk(path)) out.push({ path, content: m[4].replace(/\n?$/, "\n"), addresses });
  }
  return out;
}

/** The reply with the proposal blocks folded out (they show as cards). */
export const withoutProposals = (text: string) =>
  text.replace(/^(`{3,}|~{3,})file\s+path=["']?([^\s"'`]+)["']?[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (_, __, p: string) => `*Proposed file: \`${p}\` (see Proposed changes)*`);

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

// ── the feedback queue (the improvement loop) ──────────────────────────────
//
// One append-only JSON-lines file: an item is created once and its status
// changes are later lines (never rewritten, never deleted). Each item carries
// what it is about (brain, mandate, conversation, message) and the playbooks
// in force when it was given (git sha + files), so a later fix can be traced
// back to the feedback it answers and the method it corrected.

export const THEMES = ["facts", "missing", "method", "sources", "tone", "other"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  facts: "Wrong fact", missing: "Missing something", method: "Wrong approach", sources: "Sources / citations", tone: "Tone or length", other: "Other",
};

export type FeedbackKind = "reply" | "conversation" | "run" | "interview";
export type FeedbackStatus = "open" | "noted" | "resolved" | "dismissed";

export type FeedbackItem = {
  id: string;
  kind: FeedbackKind;
  brain: Brain;
  rating: "good" | "off" | null;
  grade: number | null;
  theme: Theme;
  note: string;
  mandate_id: string | null;
  conversation_id: string | null;
  message_index: number | null;
  run_file: string | null;
  /** what was rated: the reply's opening, the conversation's title */
  excerpt: string;
  playbooks: { sha: string | null; dirty: boolean; files: string[] };
  created_at: string;
  status: FeedbackStatus;
  resolution?: { at: string; by: "accepted" | "dismissed" | "reopened"; paths?: string[]; conversation_id?: string };
  /** who gave it (a review: the owner or the expert by name); absent = the owner */
  reviewer?: string;
  /** the eval case, when the item is about an eval run */
  case?: string | null;
};

export type FeedbackEvent =
  | { type: "item"; item: FeedbackItem }
  | { type: "status"; id: string; status: FeedbackStatus; at: string; by: "accepted" | "dismissed" | "reopened"; paths?: string[]; conversation_id?: string };

/** Is this feedback something to act on? Good ratings and high grades without
 *  a note are signal (kept, counted), not work. */
export function initialStatus(i: Pick<FeedbackItem, "kind" | "rating" | "grade" | "note">): FeedbackStatus {
  if (i.kind === "interview" || i.rating === "off") return "open";
  if (i.grade !== null && i.grade <= 3) return "open";
  return i.note.trim() ? "open" : "noted";
}

/** The queue as it stands: every item with its latest status, newest first. */
export function foldFeedback(events: FeedbackEvent[]): FeedbackItem[] {
  const items = new Map<string, FeedbackItem>();
  for (const e of events) {
    if (e.type === "item") items.set(e.item.id, { ...e.item });
    else {
      const it = items.get(e.id);
      if (!it) continue;
      it.status = e.status;
      it.resolution = { at: e.at, by: e.by, ...(e.paths ? { paths: e.paths } : {}), ...(e.conversation_id ? { conversation_id: e.conversation_id } : {}) };
    }
  }
  return [...items.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Which brain reads a playbook: by name (policy-*, regina* for Regina;
 *  funding-*, wincent* for Wincent); the rest is shared method. */
export function brainsOfPlaybook(file: string): Brain[] {
  const f = file.replace(/^mandate\/playbooks\//, "");
  if (/^(policy-|regina)|interviews\/regina/.test(f)) return ["regina"];
  if (/^(funding-|wincent)|interviews\/wincent/.test(f)) return ["wincent"];
  return ["wincent", "regina"];
}

/** The message that sends a batch of feedback to the interviewer to distil. */
export function distilMessage(brain: Brain, items: FeedbackItem[], titles: Record<string, string>): string {
  const lines = items.map((i) => {
    const reply = i.message_index !== null ? `, reply ${i.message_index}` : "";
    const where = i.run_file ? `run ${i.run_file}${i.case ? ` (eval case ${i.case})` : ""}${reply}`
      : i.conversation_id ? `conversation "${titles[i.conversation_id] ?? i.conversation_id}"${reply}` : "";
    const what = i.kind === "interview" ? "Interview (its distilled habits are in the excerpt)" : i.rating ? `Rated ${i.rating}` : i.grade ? `Graded ${i.grade}/5` : "Note";
    const by = i.reviewer && i.reviewer.toLowerCase() !== "owner" ? `The reviewer (${i.reviewer})` : "The owner";
    return [`[${i.id}] ${what} · ${THEME_LABEL[i.theme]} · ${where} · playbooks at ${i.playbooks.sha ?? "unknown"}${i.playbooks.dirty ? " (+uncommitted edits)" : ""}`,
      i.note ? `  ${by}: "${i.note.replace(/\s+/g, " ")}"` : "",
      i.excerpt ? `  What was said: "${i.excerpt.replace(/\s+/g, " ").slice(0, 600)}"` : ""].filter(Boolean).join("\n");
  });
  return `Distil this feedback on ${BRAIN_LABEL[brain]} into playbook edits.

${lines.join("\n\n")}

Find the habits behind it (general, not about one case). Propose the playbook edits and any new or updated eval cases in the file-block format, and name the feedback each block addresses in its info string, e.g. \`\`\`\`file path=mandate/playbooks/<name>.md addresses=${items.slice(0, 2).map((i) => i.id).join(",")}
Feedback you cannot act on (a one-off fact, or unclear): say so in one line each, by id.`;
}

// ── eval scenarios and re-tests ────────────────────────────────────────────

export type Scenario = { id: string; job: string; founder_says: string; founder_followup: string; must: string[]; must_not: string[] };

/** The few fields a re-test needs, read from a scenario YAML (folded `>`
 *  blocks and `- ` lists at the top level). Not a YAML parser. */
export function parseScenario(yaml: string): Scenario {
  const lines = yaml.split("\n");
  const block = (key: string): string => {
    const at = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (at < 0) return "";
    const inline = lines[at].slice(key.length + 1).trim().replace(/^[>|][-+]?$/, "").replace(/\s+#.*$/, "");
    const out = inline ? [inline.replace(/^["']|["']$/g, "")] : [];
    if (!inline) for (let i = at + 1; i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === ""); i++) out.push(lines[i].trim());
    return out.join(" ").replace(/\s+/g, " ").trim();
  };
  const list = (key: string): string[] => {
    const at = lines.findIndex((l) => new RegExp(`^${key}:\\s*(#.*)?$`).test(l));
    if (at < 0) return [];
    const out: string[] = [];
    for (let i = at + 1; i < lines.length && (/^\s/.test(lines[i]) || lines[i].trim() === ""); i++) {
      const m = lines[i].match(/^\s+-\s+(.*)$/);
      if (m) out.push(m[1].replace(/^["']|["']$/g, ""));
      else if (out.length && lines[i].trim() && !lines[i].trim().startsWith("#")) out[out.length - 1] += ` ${lines[i].trim()}`;
    }
    return out;
  };
  return { id: block("id"), job: block("job"), founder_says: block("founder_says"), founder_followup: block("founder_followup"), must: list("must"), must_not: list("must_not") };
}

export type Score = { must_met: number; must_total: number; must_not_hit: number; must_not_total: number; grade: number | null };

/** The grader ends its reply with one line: SCORE {"must_met":..,...}. */
export function parseScore(text: string): Score | null {
  const m = [...text.matchAll(/SCORE\s*(\{[^\n]*\})/g)].pop();
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as Partial<Score>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
    if (n(j.must_met) === null || n(j.must_total) === null) return null;
    const g = n(j.grade);
    return { must_met: n(j.must_met)!, must_total: n(j.must_total)!, must_not_hit: n(j.must_not_hit) ?? 0, must_not_total: n(j.must_not_total) ?? 0, grade: g !== null && g >= 1 && g <= 5 ? g : null };
  } catch { return null; }
}

export type Retest = {
  id: string;
  case: string;
  brain: Brain;
  /** the distil conversation whose accepted change this re-test checks, if any */
  after_change: string | null;
  playbooks_sha: string | null;
  playbooks_dirty: boolean;
  run_conversation: string;
  score_conversation: string | null;
  score: Score | null;
  created_at: string;
};

// ── eval runs under review ─────────────────────────────────────────────────
//
// Train, Review runs: every eval run as a chat, a comment on each reply and a
// 1-5 grade of the whole, by a named reviewer (the owner, or the expert). Each
// comment is a feedback item (so Distil reads it) linked to the conversation,
// the reply, the run file and the case; the conversation keeps a copy per
// reply so the thread shows what was said. Append-only, like the queue.

export const DEFAULT_REVIEWER = "Owner";
export const REVIEWER_RE = /^[\p{L}\p{N} .,'()-]{1,60}$/u;
/** The reviewer's name as typed, or the owner's when it is empty or not a name. */
export const reviewerName = (v: unknown): string => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s && REVIEWER_RE.test(s) ? s : DEFAULT_REVIEWER;
};

/** An eval case's id as words: "fintech_guarantees" -> "Fintech guarantees". */
export const caseLabel = (id: string) => { const s = id.replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };

export const isEvalRunConversation =(c: Pick<BenchConversation, "kind" | "eval_run">) => c.kind === "eval_run" || !!c.eval_run;

/** Write a reviewer's comment (or grade) into the conversation, next to the
 *  feedback item that carries it. A reply may carry any number of reviews; a
 *  plain chat keeps its one quick rating (`feedback`), as before. */
export function recordReview(c: BenchConversation, item: FeedbackItem): void {
  const reviewed = isEvalRunConversation(c) || item.reviewer !== undefined;
  const reviewer = item.reviewer ?? DEFAULT_REVIEWER;
  if (item.kind === "reply" && item.message_index !== null) {
    const m = c.messages[item.message_index];
    if (!m) return;
    if (reviewed) (m.reviews ??= []).push({ item_id: item.id, reviewer, rating: item.rating, note: item.note, at: item.created_at });
    else if (item.rating) m.feedback = { rating: item.rating, item_id: item.id, ...(item.note ? { note: item.note } : {}) };
  } else if (item.kind === "conversation" && item.grade !== null) {
    if (reviewed) (c.review_grades ??= []).push({ item_id: item.id, reviewer, grade: item.grade, note: item.note, at: item.created_at });
    c.grade = { grade: item.grade, item_id: item.id };
  }
}

export type EvalRunSummary = {
  id: string; title: string; case_id: string; brain: Brain; tag: string; source: EvalRun["source"]; ran_at: string;
  run_file: string | null; judge_grade: number | null; owner_grade: number | null;
  /** the latest reviewer grade, and who gave it */
  review_grade: { grade: number; reviewer: string } | null;
  replies: number; comments: number; reviewers: string[];
};

export function evalRunSummary(c: BenchConversation): EvalRunSummary | null {
  const r = c.eval_run;
  if (!r) return null;
  const reviews = c.messages.flatMap((m) => m.reviews ?? []);
  const last = c.review_grades?.[c.review_grades.length - 1];
  return {
    id: c.id, title: c.title, case_id: r.case_id, brain: r.brain, tag: r.tag, source: r.source, ran_at: r.ran_at || c.created_at,
    run_file: r.run_file, judge_grade: r.grade ?? r.judge?.grade ?? null, owner_grade: r.owner_grade ?? null,
    review_grade: last ? { grade: last.grade, reviewer: last.reviewer } : null,
    replies: c.messages.filter((m) => m.role === "agent").length, comments: reviews.length,
    reviewers: [...new Set([...reviews.map((x) => x.reviewer), ...(c.review_grades ?? []).map((g) => g.reviewer)])],
  };
}

/** Runs grouped by case and brain, the case with the latest run first, each
 *  case's runs latest first. */
export function groupEvalRuns(runs: EvalRunSummary[]): { case_id: string; brain: Brain; runs: EvalRunSummary[] }[] {
  const groups = new Map<string, { case_id: string; brain: Brain; runs: EvalRunSummary[] }>();
  for (const r of runs) {
    const k = `${r.case_id}\u0000${r.brain}`;
    if (!groups.has(k)) groups.set(k, { case_id: r.case_id, brain: r.brain, runs: [] });
    groups.get(k)!.runs.push(r);
  }
  const out = [...groups.values()];
  for (const g of out) g.runs.sort((a, b) => b.ran_at.localeCompare(a.ran_at) || b.id.localeCompare(a.id));
  return out.sort((a, b) => b.runs[0].ran_at.localeCompare(a.runs[0].ran_at) || a.case_id.localeCompare(b.case_id));
}

/** A review set: runs handed to a reviewer (the expert) in order, opened at
 *  /bench/review/<id> with nothing but the runs and the comment controls. */
export type ReviewSet = { id: string; title: string; note: string; conversation_ids: string[]; created_at: string };

export function validateReviewSet(b: unknown): Result<Pick<ReviewSet, "title" | "note" | "conversation_ids">> {
  if (!b || typeof b !== "object") return { ok: false, error: "expected an object" };
  const o = b as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.replace(/\s+/g, " ").trim() : "";
  if (!title || title.length > 120) return { ok: false, error: "give the review set a title (up to 120 characters)" };
  const note = typeof o.note === "string" ? o.note.trim() : "";
  if (note.length > 2000) return { ok: false, error: "the note is too long" };
  const ids = o.conversation_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || !ids.every(isId)) return { ok: false, error: "pick 1 to 20 runs" };
  return { ok: true, value: { title, note, conversation_ids: [...new Set(ids as string[])] } };
}
