// The case board: the structured half of a brain's answer. Pure (no node
// imports), shared by the page and its tests.
//
// A brain appends, from the options stage onward, one fenced block to its prose:
//
//   ```mandate-board
//   { "answer": {...}, "routes": {...}, "roadmap": {...}, ... }
//   ```
//
// Every section is optional; a block carries only what is known or changed.
// The app folds the blocks of a conversation in order: `answer` is replaced by
// a later one, list sections are merged by id (a later item with the same id
// replaces the earlier one, a new id is added), so a later turn updates the
// board instead of restating it. Nothing is dropped by a later block; a door
// that closes is marked `shut`, not removed.
//
// The reader is lenient by item: an item that does not fit the schema is left
// out and named in `warnings` (the board says so), never silently repaired.
import { z } from "zod";

export const BOARD_FENCE = "mandate-board";

// ── vocabulary ─────────────────────────────────────────────────────────────

export const CONFIDENCE = ["high", "medium", "low"] as const;
export const LEVELS = ["eu", "national", "regional", "customer", "lobby"] as const;
export const DOOR_STATUS = ["open", "probe", "park", "shut"] as const;
export const OWNERS = ["client", "us", "institution"] as const;
export const STEP_STATUS = ["done", "active", "planned", "blocked"] as const;
export const SIDES = ["political", "public-capital", "market"] as const;
export const PRIORITY = ["P1", "P2"] as const;
export const REACH_STATUS = ["to_approach", "engaged"] as const;
export const FUNDING_TYPES = ["equity", "public_coinvest", "guarantee_debt", "loan", "grant", "customer_side"] as const;
export const FUNDING_STATUS = ["secured", "in_progress", "probe", "planned", "parked"] as const;
export const NODE_KINDS = ["client", "us", "institution", "bank", "customer", "fund", "asset", "other"] as const;
export const EDGE_KINDS = ["money", "risk", "asset", "info"] as const;
export const RISK_KINDS = ["deal_breaker", "flag"] as const;
export const SEVERITY = ["high", "medium", "low"] as const;
export const STAGES = ["diagnose", "options", "next_steps", "write_up"] as const;

export const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = {
  eu: "EU", national: "National", regional: "Regional", customer: "Customer side", lobby: "Policy and lobby",
};
export const DOOR_LABEL: Record<(typeof DOOR_STATUS)[number], string> = { open: "Open", probe: "Probe", park: "Parked", shut: "Shut" };
export const OWNER_LABEL: Record<(typeof OWNERS)[number], string> = { client: "Client", us: "Us", institution: "Institution" };
export const STEP_LABEL: Record<(typeof STEP_STATUS)[number], string> = { done: "Done", active: "Under way", planned: "Planned", blocked: "Blocked" };
export const SIDE_LABEL: Record<(typeof SIDES)[number], string> = { political: "Political", "public-capital": "Public capital", market: "Market" };
export const FUNDING_LABEL: Record<(typeof FUNDING_TYPES)[number], string> = {
  equity: "Equity", public_coinvest: "Public co-invest", guarantee_debt: "Guarantee-backed debt", loan: "Loan", grant: "Grant", customer_side: "Customer side",
};
export const FUNDING_STATUS_LABEL: Record<(typeof FUNDING_STATUS)[number], string> = {
  secured: "Secured", in_progress: "In progress", probe: "To probe", planned: "Planned", parked: "Parked",
};
export const STAGE_LABEL: Record<(typeof STAGES)[number], string> = { diagnose: "Diagnosis", options: "Options", next_steps: "Next steps", write_up: "Write-up" };

// ── schema ─────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().min(1).max(max);
const Id = z.string().trim().min(1).max(64);
/** Citation ids ([c3], [w1]) or a label: "judgement", "unverified". */
const Cite = z.array(z.string().trim().min(1).max(24)).max(16).optional();
/** A month offset from the roadmap's origin (0 = now; 0.25 = a week), or a "YYYY-MM" / "YYYY-MM-DD" date. */
const When = z.union([z.number().min(-24).max(120), z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/)]);

export const AnswerSchema = z.object({
  lines: z.array(text(240)).min(1).max(3),
  confidence: z.enum(CONFIDENCE),
  confidence_why: text(240).optional(),
  open_question: text(300),
  cite: Cite,
});
export const DoorSchema = z.object({
  id: Id,
  name: text(120),
  institution: text(120).optional(),
  /** an intermediary the money flows through (a bank, a lessor, a VC fund) */
  via: text(120).optional(),
  status: z.enum(DOOR_STATUS),
  why: text(240),
  conditions: z.array(text(200)).max(8).optional(),
  cite: Cite,
});
export const LevelSchema = z.object({
  id: Id,
  level: z.enum(LEVELS),
  label: text(80),
  country: z.string().trim().max(8).optional(),
  doors: z.array(z.unknown()).max(30),
});
export const StepSchema = z.object({
  id: Id,
  label: text(120),
  start: When,
  end: When.optional(),
  milestone: z.boolean().optional(),
  depends_on: z.array(Id).max(8).optional(),
  owner: z.enum(OWNERS),
  status: z.enum(STEP_STATUS),
  note: text(200).optional(),
  cite: Cite,
});
export const TrackSchema = z.object({ id: Id, label: text(60), steps: z.array(z.unknown()).max(30) });
export const RoadmapSchema = z.object({
  /** the date month 0 stands for, "YYYY-MM"; without it the axis reads "Month 1, 2, ..." */
  origin: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  horizon: z.number().min(1).max(120).optional(),
  tracks: z.array(z.unknown()).max(12),
});
export const RoleSchema = z.object({
  id: Id,
  role: text(140),
  priority: z.enum(PRIORITY),
  /** how to reach them, by function or channel; never a guessed address */
  reach: text(200),
  status: z.enum(REACH_STATUS),
  note: text(200).optional(),
  cite: Cite,
});
export const UnitSchema = z.object({ id: Id, name: text(140), roles: z.array(z.unknown()).max(12) });
export const InstitutionSchema = z.object({
  id: Id,
  name: text(120),
  side: z.enum(SIDES),
  country: z.string().trim().max(8).optional(),
  units: z.array(z.unknown()).max(12),
});
export const InstrumentSchema = z.object({
  id: Id,
  name: text(120),
  type: z.enum(FUNDING_TYPES),
  amount: z.number().nonnegative().optional(),
  amount_max: z.number().nonnegative().optional(),
  terms: text(200),
  status: z.enum(FUNDING_STATUS),
  via: text(120).optional(),
  cite: Cite,
});
export const FundingSchema = z.object({
  need: z.object({ amount: z.number().positive(), label: text(120) }).optional(),
  currency: z.string().trim().length(3).optional(),
  instruments: z.array(z.unknown()).max(20),
});
export const NodeSchema = z.object({
  id: Id, label: text(60), sub: text(80).optional(), kind: z.enum(NODE_KINDS).optional(),
  /** optional placement: column (left to right) and row (top to bottom) */
  col: z.number().int().min(0).max(6).optional(), row: z.number().int().min(0).max(6).optional(),
});
export const EdgeSchema = z.object({ from: Id, to: Id, label: text(80), kind: z.enum(EDGE_KINDS).optional() });
export const ProcessSchema = z.object({
  id: Id,
  title: text(120),
  caption: text(300).optional(),
  nodes: z.array(z.unknown()).min(2).max(10),
  edges: z.array(z.unknown()).max(16),
  cite: Cite,
});
export const RiskSchema = z.object({
  id: Id,
  kind: z.enum(RISK_KINDS),
  severity: z.enum(SEVERITY),
  title: text(140),
  detail: text(300).optional(),
  fix: text(240),
  cite: Cite,
});

export type Answer = z.infer<typeof AnswerSchema>;
export type Door = z.infer<typeof DoorSchema>;
export type Level = Omit<z.infer<typeof LevelSchema>, "doors"> & { doors: Door[] };
export type Step = z.infer<typeof StepSchema>;
export type Track = Omit<z.infer<typeof TrackSchema>, "steps"> & { steps: Step[] };
export type Roadmap = Omit<z.infer<typeof RoadmapSchema>, "tracks"> & { tracks: Track[] };
export type Role = z.infer<typeof RoleSchema>;
export type Unit = Omit<z.infer<typeof UnitSchema>, "roles"> & { roles: Role[] };
export type Institution = Omit<z.infer<typeof InstitutionSchema>, "units"> & { units: Unit[] };
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Funding = Omit<z.infer<typeof FundingSchema>, "instruments"> & { instruments: Instrument[] };
export type FlowNode = z.infer<typeof NodeSchema>;
export type FlowEdge = z.infer<typeof EdgeSchema>;
export type Process = Omit<z.infer<typeof ProcessSchema>, "nodes" | "edges"> & { nodes: FlowNode[]; edges: FlowEdge[] };
export type Risk = z.infer<typeof RiskSchema>;

export type Board = {
  title?: string;
  stage?: (typeof STAGES)[number];
  answer?: Answer;
  routes?: { levels: Level[] };
  roadmap?: Roadmap;
  stakeholders?: { institutions: Institution[] };
  funding_stack?: Funding;
  process?: Process[];
  risks_flags?: Risk[];
};
export const SECTIONS = ["answer", "routes", "roadmap", "stakeholders", "funding_stack", "process", "risks_flags"] as const;
export type Section = (typeof SECTIONS)[number];

// ── reading one block ──────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "item";

/** An item without an id gets one from its name, so a later turn can still update it. */
function withId(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  if (typeof o.id === "string" && o.id.trim()) return o;
  const name = [o.name, o.label, o.title, o.role].find((x) => typeof x === "string" && x.trim()) as string | undefined;
  return name ? { ...o, id: slug(name) } : o;
}

function one<T>(schema: z.ZodType<T>, v: unknown, where: string, warnings: string[]): T | null {
  const r = schema.safeParse(withId(v));
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  warnings.push(`${where}: ${issue ? `${issue.path.join(".") || "item"} ${issue.message}` : "unreadable"}`.slice(0, 200));
  return null;
}
function many<T>(schema: z.ZodType<T>, list: unknown, where: string, warnings: string[]): T[] {
  if (!Array.isArray(list)) { if (list !== undefined) warnings.push(`${where}: expected a list`); return []; }
  return list.map((v, i) => one(schema, v, `${where}[${i}]`, warnings)).filter((x): x is T => x !== null);
}

/** One block's JSON as a (partial) board. Unknown keys are ignored. */
export function readBoard(raw: unknown, warnings: string[] = []): Board {
  const out: Board = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) { warnings.push("the block is not a JSON object"); return out; }
  const b = raw as Record<string, unknown>;
  if (typeof b.title === "string" && b.title.trim()) out.title = b.title.trim().slice(0, 140);
  if (STAGES.includes(b.stage as Board["stage"] & string)) out.stage = b.stage as Board["stage"];
  if (b.answer !== undefined) { const a = one(AnswerSchema, b.answer, "answer", warnings); if (a) out.answer = a; }
  if (b.routes !== undefined) {
    const src = Array.isArray(b.routes) ? { levels: b.routes } : (b.routes as Record<string, unknown>);
    out.routes = {
      levels: many(LevelSchema, src?.levels, "routes.levels", warnings)
        .map((l) => ({ ...l, doors: many(DoorSchema, l.doors, `routes.${l.id}.doors`, warnings) })),
    };
  }
  if (b.roadmap !== undefined) {
    const r = one(RoadmapSchema, b.roadmap, "roadmap", warnings);
    if (r) out.roadmap = { ...r, tracks: many(TrackSchema, r.tracks, "roadmap.tracks", warnings).map((t) => ({ ...t, steps: many(StepSchema, t.steps, `roadmap.${t.id}.steps`, warnings) })) };
  }
  if (b.stakeholders !== undefined) {
    const src = Array.isArray(b.stakeholders) ? { institutions: b.stakeholders } : (b.stakeholders as Record<string, unknown>);
    out.stakeholders = {
      institutions: many(InstitutionSchema, src?.institutions, "stakeholders", warnings).map((inst) => ({
        ...inst,
        units: many(UnitSchema, inst.units, `stakeholders.${inst.id}.units`, warnings)
          .map((u) => ({ ...u, roles: many(RoleSchema, u.roles, `stakeholders.${inst.id}.${u.id}.roles`, warnings) })),
      })),
    };
  }
  if (b.funding_stack !== undefined) {
    const f = one(FundingSchema, b.funding_stack, "funding_stack", warnings);
    if (f) out.funding_stack = { ...f, instruments: many(InstrumentSchema, f.instruments, "funding_stack.instruments", warnings) };
  }
  if (b.process !== undefined) {
    const list = Array.isArray(b.process) ? b.process : [b.process];
    out.process = many(ProcessSchema, list, "process", warnings).map((p) => {
      const nodes = many(NodeSchema, p.nodes, `process.${p.id}.nodes`, warnings);
      const ids = new Set(nodes.map((n) => n.id));
      const edges = many(EdgeSchema, p.edges, `process.${p.id}.edges`, warnings).filter((e) => {
        const ok = ids.has(e.from) && ids.has(e.to);
        if (!ok) warnings.push(`process.${p.id}: an edge names a node that is not there (${e.from} to ${e.to})`);
        return ok;
      });
      return { ...p, nodes, edges };
    });
  }
  if (b.risks_flags !== undefined) out.risks_flags = many(RiskSchema, b.risks_flags, "risks_flags", warnings);
  return out;
}

// ── finding blocks in a reply ──────────────────────────────────────────────

const BLOCK_RE = new RegExp(String.raw`^(\`{3,}|~{3,})[ \t]*${BOARD_FENCE}[^\n]*\n([\s\S]*?)^\1[ \t]*$`, "gm");
const OPEN_RE = new RegExp(String.raw`^(\`{3,}|~{3,})[ \t]*${BOARD_FENCE}[^\n]*\n[\s\S]*$`, "m");

/** The JSON bodies of every complete board block in a reply, in order. */
export function boardBlocks(text: string): string[] {
  return [...text.matchAll(BLOCK_RE)].map((m) => m[2]);
}

/** The reply without its board blocks (they show on the Board tab). A block
 *  still being written (no closing fence yet) is folded too. */
export function withoutBoard(text: string, marker = "*The board is updated: see the Board tab.*"): string {
  const done = text.replace(BLOCK_RE, () => marker);
  return done.replace(OPEN_RE, "*Drawing the board…*").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** A model sometimes leaves a trailing comma; nothing more is forgiven. */
function parseJson(body: string): unknown {
  try { return JSON.parse(body); } catch { /* try once more */ }
  return JSON.parse(body.replace(/,(\s*[}\]])/g, "$1"));
}

// ── folding a conversation ─────────────────────────────────────────────────

export type Folded = {
  board: Board;
  /** how many blocks were read, and the reply index of the latest */
  blocks: number;
  latest: number | null;
  /** keys ("routes:eu:eifo-guarantee", "answer") the latest block set: shown as new */
  fresh: Set<string>;
  warnings: string[];
};

const byId = <T extends { id: string }>(a: T[] = [], b: T[], fresh: Set<string> | null, prefix: string, inner?: (x: T, y: T) => T): T[] => {
  const out = [...a];
  for (const item of b) {
    const at = out.findIndex((x) => x.id === item.id);
    fresh?.add(`${prefix}:${item.id}`);
    if (at < 0) out.push(item);
    else out[at] = inner ? inner(out[at], item) : item;
  }
  return out;
};

/** Merge a later (partial) board into an earlier one. */
export function mergeBoard(base: Board, next: Board, fresh: Set<string> | null = null): Board {
  const out: Board = { ...base };
  if (next.title) out.title = next.title;
  if (next.stage) out.stage = next.stage;
  if (next.answer) { out.answer = next.answer; fresh?.add("answer"); }
  if (next.routes) {
    out.routes = { levels: byId(base.routes?.levels, next.routes.levels, null, "level", (x, y) => ({ ...x, ...y, doors: byId(x.doors, y.doors, fresh, `routes:${x.id}`) })) };
    for (const l of next.routes.levels) for (const d of l.doors) fresh?.add(`routes:${l.id}:${d.id}`);
  }
  if (next.roadmap) {
    const r = next.roadmap;
    out.roadmap = {
      ...base.roadmap, ...r,
      tracks: byId(base.roadmap?.tracks, r.tracks, null, "track", (x, y) => ({ ...x, ...y, steps: byId(x.steps, y.steps, null, "") })),
    };
    for (const t of r.tracks) for (const s of t.steps) fresh?.add(`roadmap:${s.id}`);
  }
  if (next.stakeholders) {
    out.stakeholders = {
      institutions: byId(base.stakeholders?.institutions, next.stakeholders.institutions, null, "inst", (x, y) => ({
        ...x, ...y, units: byId(x.units, y.units, null, "unit", (u, v) => ({ ...u, ...v, roles: byId(u.roles, v.roles, null, "") })),
      })),
    };
    for (const i of next.stakeholders.institutions) for (const u of i.units) for (const r of u.roles) fresh?.add(`stakeholders:${i.id}:${u.id}:${r.id}`);
  }
  if (next.funding_stack) {
    const f = next.funding_stack;
    out.funding_stack = { ...base.funding_stack, ...f, instruments: byId(base.funding_stack?.instruments, f.instruments, fresh, "funding") };
  }
  if (next.process) out.process = byId(base.process, next.process, fresh, "process");
  if (next.risks_flags) out.risks_flags = byId(base.risks_flags, next.risks_flags, fresh, "risk");
  return out;
}

/** The board of a conversation: every block of every agent reply, in order. */
export function foldBoard(messages: { role: string; text: string }[]): Folded {
  let board: Board = {};
  let blocks = 0;
  let latest: number | null = null;
  let fresh = new Set<string>();
  const warnings: string[] = [];
  messages.forEach((m, i) => {
    if (m.role !== "agent" || !m.text) return;
    for (const body of boardBlocks(m.text)) {
      let raw: unknown;
      try { raw = parseJson(body); } catch { warnings.push(`reply ${i + 1}: the board block is not valid JSON`); continue; }
      const w: string[] = [];
      const part = readBoard(raw, w);
      warnings.push(...w.map((x) => `reply ${i + 1}: ${x}`));
      if (latest !== i) fresh = new Set();
      board = mergeBoard(board, part, fresh);
      blocks++;
      latest = i;
    }
  });
  return { board, blocks, latest, fresh, warnings };
}

export const boardIsEmpty = (b: Board) => SECTIONS.every((s) => {
  const v = b[s];
  if (!v) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (s === "routes") return !b.routes?.levels.length;
  if (s === "roadmap") return !b.roadmap?.tracks.length;
  if (s === "stakeholders") return !b.stakeholders?.institutions.length;
  if (s === "funding_stack") return !b.funding_stack?.instruments.length;
  return false;
});

// ── helpers the views share ────────────────────────────────────────────────

const monthIndex = (s: string) => { const [y, m] = s.split("-").map(Number); return y * 12 + (m - 1); };

/** A roadmap time as a month offset from the origin. A date before any origin
 *  is known uses the earliest date in the roadmap as month 0. */
export function monthsOf(when: number | string, origin: string | undefined): number {
  if (typeof when === "number") return when;
  const day = when.length > 7 ? Number(when.slice(8, 10)) : 1;
  const frac = (day - 1) / 30;
  return origin ? monthIndex(when) - monthIndex(origin) + frac : frac;
}

/** The roadmap's origin: as given, else the earliest date it uses. */
export function roadmapOrigin(r: Roadmap): string | undefined {
  if (r.origin) return r.origin;
  const dates = r.tracks.flatMap((t) => t.steps.flatMap((s) => [s.start, s.end])).filter((x): x is string => typeof x === "string").sort();
  return dates[0]?.slice(0, 7);
}

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", DKK: "DKK ", CHF: "CHF " };
/** €1.5M, €400K, €12M: compact, for labels. */
export function money(n: number, currency = "EUR"): string {
  const s = SYMBOL[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  const fmt = (v: number) => (v >= 10 || Number.isInteger(v) ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ""));
  if (n >= 1e9) return `${s}${fmt(n / 1e9)}B`;
  if (n >= 1e6) return `${s}${fmt(n / 1e6)}M`;
  if (n >= 1e3) return `${s}${fmt(n / 1e3)}K`;
  return `${s}${Math.round(n)}`;
}
export function moneyRange(i: Pick<Instrument, "amount" | "amount_max">, currency = "EUR"): string | null {
  if (i.amount === undefined && i.amount_max === undefined) return null;
  if (i.amount !== undefined && i.amount_max !== undefined && i.amount_max > i.amount) {
    const hi = money(i.amount_max, currency);
    const lo = money(i.amount, currency);
    const unit = hi.slice(-1);
    return lo.endsWith(unit) && /[KMB]/.test(unit) ? `${lo.slice(0, -1)}–${hi.replace(/^[^0-9]+/, "")}` : `${lo}–${hi}`;
  }
  return money(i.amount ?? i.amount_max!, currency);
}
/** The amount a bar draws: the midpoint of a range. */
export const barAmount = (i: Pick<Instrument, "amount" | "amount_max">) =>
  i.amount !== undefined && i.amount_max !== undefined ? (i.amount + i.amount_max) / 2 : i.amount ?? i.amount_max ?? 0;

/** Citation entries split into chips (c/w ids) and labels (judgement, unverified). */
export function splitCite(cite: string[] | undefined): { ids: string[]; labels: string[] } {
  const ids: string[] = [], labels: string[] = [];
  for (const c of cite ?? []) {
    const t = c.replace(/^\[|\]$/g, "").replace(/^\(|\)$/g, "").trim();
    if (/^[cw]\d+$/i.test(t)) ids.push(t.toLowerCase()); else if (t) labels.push(t.toLowerCase());
  }
  return { ids, labels };
}

/** Layers for a left-to-right flow: a node sits one column right of the
 *  furthest node that feeds it; edges that point back (a cycle) stay edges,
 *  drawn as return arcs. */
export function flowLayers(nodes: FlowNode[], edges: FlowEdge[]): { col: Record<string, number>; row: Record<string, number>; cols: number; rows: number; back: Set<number> } {
  const ids = nodes.map((n) => n.id);
  const order = new Map(ids.map((id, i) => [id, i]));
  // forward edges: from a node listed earlier to one listed later, or a DAG edge found by DFS
  const back = new Set<number>();
  const adj = new Map<string, { to: string; i: number }[]>(ids.map((id) => [id, []]));
  edges.forEach((e, i) => adj.get(e.from)?.push({ to: e.to, i }));
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const { to, i } of adj.get(id) ?? []) {
      const s = state.get(to) ?? 0;
      if (s === 1) back.add(i);
      else if (s === 0) visit(to);
    }
    state.set(id, 2);
  };
  // the author's order decides where a cycle is cut: the first node listed is the start
  for (const id of ids) if (!state.get(id)) visit(id);
  const col: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    edges.forEach((e, i) => {
      if (back.has(i) || e.from === e.to) return;
      if (col[e.to] < col[e.from] + 1) { col[e.to] = col[e.from] + 1; moved = true; }
    });
    if (!moved) break;
  }
  // a node may pin its own place (col, row): the author knows the picture
  for (const n of nodes) if (n.col !== undefined) col[n.id] = n.col;
  const cols = Math.max(0, ...Object.values(col)) + 1;
  const row: Record<string, number> = {};
  const used = new Set<string>();
  for (const n of nodes) if (n.row !== undefined) { row[n.id] = n.row; used.add(`${col[n.id]}:${n.row}`); }
  for (const id of [...ids].sort((a, b) => col[a] - col[b] || order.get(a)! - order.get(b)!)) {
    if (row[id] !== undefined) continue;
    let r = 0;
    while (used.has(`${col[id]}:${r}`)) r++;
    row[id] = r; used.add(`${col[id]}:${r}`);
  }
  return { col, row, cols, rows: Math.max(1, ...Object.values(row).map((r) => r + 1)), back };
}
