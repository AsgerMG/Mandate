/**
 * A mission: Mandate (the orchestrator) frames the founder's question, consults
 * Wincent and Regina (specialist sub-agents with their own tools), and saves
 * flags, decisions, actions, plan steps and watches to the workspace, ending in
 * a written deliverable. Every step is a MissionEvent (../workspace.ts), so the
 * owner's workspace UI renders a live mission exactly as it renders the demo.
 *
 * GROUNDED OR LABELLED. Evidence enters only through tools, which register the
 * citation mandate-api resolved in a per-mission ledger and show the model an
 * id ([c3]). Every save goes to mandate-api with the claims and the citations
 * they name; mandate-api refuses an unlabelled claim or a citation that does
 * not resolve (mandate/api/workspace.py, the one place the rule is written),
 * and the refusal comes back to the model as a tool error to fix.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { currentCost } from "@/lib/intelligence/cost";
import type { CompanyProfile } from "../profile";
import type {
  Claim, EvidenceRef, MissionEvent, Specialist, WorkspaceAction, WorkspaceDecision,
} from "../workspace";
import { assess, findInstruments, precedents, requirements, route, type CapitalPort } from "./capital";
import { CitationLedger, type Specialist as Sp } from "./ledger";
import { runLoop, type ModelClient, type ToolHandler } from "./loop";
import {
  MISSION_BUDGET_EUR, ORCHESTRATOR_EFFORT, ORCHESTRATOR_MODEL, SPECIALIST_EFFORT,
  SPECIALIST_MODEL, WRAP_UP_SHARE,
} from "./models";
import { PLAYBOOKS } from "./playbooks.generated";
import { research } from "./research";
import type { MandateApi, PolicyApi, PolicyHit } from "./services";

export interface MissionDeps {
  client: ModelClient;
  mandate: MandateApi;
  policy: PolicyApi;
  capital: CapitalPort;
  budgetEur?: number;
  now?: () => Date;
}

export interface MissionInput {
  workspaceId: string;
  profileId: string;
  profileVersion: number;
  objective: string;
  job?: string;
  /** Continue a mission paused on the founder (ask_founder). */
  missionId?: string;
}

type Emit = (e: MissionEvent) => void;

/** Exported for the bench (web/scripts/brain_tool.ts), which runs these same handlers without a model. */
export interface Ctx {
  deps: MissionDeps;
  ledger: CitationLedger;
  missionId: string;
  profileId: string;
  profile: { version: number; payload: CompanyProfile };
  emit: Emit;
  playbook?: string;
  budget: { wrapUpAt: number; stopAt: number; note: string };
}

// ── tool definition helpers ───────────────────────────────────────────────

type Schema = Record<string, unknown>;
const str = (description: string): Schema => ({ type: "string", description });
const strs = (description: string): Schema => ({ type: "array", items: { type: "string" }, description });
const tool = (name: string, description: string, properties: Record<string, Schema>, required: string[]): Anthropic.Tool => ({
  name, description, input_schema: { type: "object", properties, required, additionalProperties: false } as Anthropic.Tool.InputSchema,
});
const CLAIMS: Schema = {
  type: "array",
  description: "Every factual statement as a claim. basis 'cited' needs citation_ids from the evidence ([cN] without brackets); 'judgement' and 'unverified' carry none.",
  items: {
    type: "object", additionalProperties: false, required: ["text", "basis", "citation_ids"],
    properties: {
      text: str("one claim"),
      basis: { type: "string", enum: ["cited", "judgement", "unverified"] },
      citation_ids: strs("e.g. [\"c3\"]; empty unless basis is cited"),
    },
  },
};
const BY: Schema = { type: "string", enum: ["mandate", "wincent", "regina"], description: "whose finding this is" };

const idsOf = (claims: unknown): string[] =>
  Array.isArray(claims) ? claims.flatMap((c) => (Array.isArray(c?.citation_ids) ? c.citation_ids : [])) : [];

function toClaims(claims: unknown): Claim[] {
  return (Array.isArray(claims) ? claims : []).map((c) => ({
    text: String(c?.text ?? ""), basis: c?.basis, citationIds: Array.isArray(c?.citation_ids) ? c.citation_ids : [],
  }));
}

function prose(claims: Claim[]): string {
  return claims.map((c) => c.basis === "cited" ? `${c.text} [${c.citationIds.join(", ")}]` : `${c.text} (${c.basis})`).join(" ");
}

function evidence(ledger: CitationLedger, ids: Iterable<string>): EvidenceRef[] {
  return [...new Set(ids)].map((id) => ledger.evidence(id)).filter((e): e is EvidenceRef => !!e);
}

function cite(ctx: Ctx, specialist: Sp, via: string) {
  return async (sha256: string | null, url: string | null, quote: string, label: string, span?: [number, number]) => {
    try {
      const c = await ctx.deps.mandate.cite({ quote, ...(sha256 ? { sha256 } : { url: url ?? undefined }), ...(span ? { span } : {}) });
      return ctx.ledger.add(c, specialist, via, label);
    } catch {
      return null;
    }
  };
}

async function citeHits(ctx: Ctx, specialist: Sp, via: string, hits: PolicyHit[], keep: number) {
  const c = cite(ctx, specialist, via);
  const out = [];
  for (const h of hits.slice(0, keep)) {
    const span = h.char_start != null && h.char_end != null ? [h.char_start, h.char_end] as [number, number] : undefined;
    const id = h.text ? await c(h.grounding_sha256 ?? null, h.grounding_sha256 ? null : h.url ?? null, h.text,
      h.title ?? h.url ?? "policy document", h.grounding_sha256 ? span : undefined) : null;
    out.push({
      citation: id, title: h.title, jurisdiction: h.jurisdiction, stage: h.stage, document_id: h.document_id,
      url: h.url, text: h.text.length > 900 ? `${h.text.slice(0, 900)}...` : h.text,
      ...(id ? {} : { note: "could not be resolved in grounding: UNVERIFIED" }),
    });
  }
  return out;
}

// ── shared specialist tools ──────────────────────────────────────────────

function shared(ctx: Ctx, me: Sp): { tools: Anthropic.Tool[]; handlers: Record<string, ToolHandler> } {
  const tools = [
    tool("research", "Research the open web. Every source used is stored and returned cited [cN]; anything that could not be verified is returned as UNVERIFIED.",
      { question: str("a precise research question"), domains: strs("optional: restrict to these domains (e.g. bpifrance.fr)") }, ["question"]),
    tool("actors_register_find", "Search Mandate's register of institutions, coalitions, media and public-role people, with their PUBLISHED contact points and address formats.",
      { q: str("name or topic"), kind: str("optional kind, e.g. promotional_bank, trade_association, media_outlet"), jurisdiction: str("optional ISO2 or EU") }, ["q"]),
    tool("actors_register_add", "Add an institution, a public role, or a PUBLISHED contact point to the register. Needs a citation id whose quote shows it (for a contact point, the quote must contain the value). Never a guessed address.", {
      entity: { type: "string", enum: ["organisation", "role", "contact_point"] },
      citation_id: str("the [cN] id (without brackets) of the passage that publishes it"),
      name: str("organisation name, or the person's name for a role"),
      kind: str("organisation kind (e.g. promotional_bank, regulator, trade_association, media_outlet) or contact kind (press_office, desk, switchboard, institutional_email, masthead_email, contact_form, phone, postal)"),
      jurisdiction: str("ISO2 or EU"), organisation_id: str("for a role or contact point"), title: str("for a role: the title"),
      beat: str("for a role: beat or portfolio"), channel: { type: "string", enum: ["email", "phone", "url", "postal"] }, value: str("for a contact point"),
      topics: strs("for an organisation: what it works on"),
    }, ["entity", "citation_id"]),
    tool("suggest_email", "For a person whose address is NOT published: apply the organisation's registered address format. The result is UNVERIFIED ADVICE for this conversation only; it is never stored and must be presented as such.", {
      format_id: str("an email_formats id from actors_register_find"), first: str("first name"), last: str("last name"),
    }, ["format_id", "first", "last"]),
    tool("profile_get", "The company profile the mission runs on.", {}, []),
    tool("profile_append", "Record facts about the company that the founder stated or that you established with evidence. Never a guess.",
      { changes: { type: "object", description: "profile fields to set (the shared CompanyProfile vocabulary)" }, note: str("where the fact came from") }, ["changes", "note"]),
  ];
  const handlers: Record<string, ToolHandler> = {
    research: { required: ["question"], run: (i) => research({ client: ctx.deps.client, mandate: ctx.deps.mandate, ledger: ctx.ledger, specialist: me },
      { question: String(i.question), domains: i.domains as string[] | undefined }) },
    actors_register_find: { required: ["q"], run: async (i) => {
      const { actors } = await ctx.deps.mandate.findActors({ q: String(i.q), kind: i.kind as string, jurisdiction: i.jurisdiction as string });
      return actors.map((a) => {
        const c = a.citation as never;
        const id = c ? ctx.ledger.add(c, me, "actors_register", String(a.name)) : undefined;
        return { ...a, citation: id };
      });
    } },
    actors_register_add: { required: ["entity", "citation_id"], run: async (i) => {
      const e = ctx.ledger.get(String(i.citation_id));
      if (!e) throw new Error(`unknown citation ${i.citation_id}: register only what a cited passage publishes`);
      const citation = e.citation;
      if (i.entity === "organisation") {
        return ctx.deps.mandate.addActor("organisations", { name: i.name, kind: i.kind, jurisdiction: i.jurisdiction,
          topics: i.topics ?? [], citation, created_by: me });
      }
      if (i.entity === "role") {
        return ctx.deps.mandate.addActor("roles", { person_name: i.name, organisation_id: i.organisation_id, title: i.title,
          beat: i.beat ?? "", citation, created_by: me });
      }
      return ctx.deps.mandate.addActor("contact_points", { organisation_id: i.organisation_id, kind: i.kind, channel: i.channel,
        value: i.value, citation, created_by: me });
    } },
    suggest_email: { required: ["format_id", "first", "last"], run: (i) =>
      ctx.deps.mandate.applyEmailFormat(String(i.format_id), String(i.first), String(i.last)) },
    profile_get: { run: async () => ctx.profile },
    profile_append: { required: ["changes", "note"], run: async (i) => {
      const payload = { ...ctx.profile.payload, ...(i.changes as Record<string, unknown>) };
      const r = await ctx.deps.mandate.appendProfile(ctx.profileId, { payload, source: me, expected: ctx.profile.version, note: String(i.note) });
      ctx.profile = { version: r.version, payload: payload as CompanyProfile };
      return { recorded: true, version: r.version };
    } },
  };
  return { tools, handlers };
}

export function wincentTools(ctx: Ctx) {
  const p = () => ctx.profile.payload;
  const c = ctx.deps.capital;
  const s = shared(ctx, "wincent");
  return {
    tools: [
      tool("find_instruments", "Candidate public-capital instruments from the corpus. Uncited starting list.", {
        objective: str("what the money is for, in the company's terms"),
        instrument_types: strs("any of grant, loan, guarantee, recoverable_advance, equity, tax_credit. A guarantee question is guarantee, not loan."),
        jurisdictions: strs("ISO2 codes or EU"),
        name_query: str("optional: words in the instrument's name or administering body, e.g. 'Fondo di Garanzia', 'InvestEU'"),
      }, ["objective"]),
      tool("assess_instrument", "One instrument against the company profile: status, blockers, gates with cited quotes, the deciding question.",
        { instrument_id: str("from find_instruments") }, ["instrument_id"]),
      tool("find_precedents", "Precedents (playbook 1c): companies this instrument, or this institution for this kind of move, already backed in a similar situation. Use them for every main route and in outreach drafts. Says explicitly when none is found.", {
        instrument_id: str("scope by instrument"), institution: str("or scope by institution name (e.g. 'Bpifrance', 'Mediocredito Centrale')"),
        move: { type: "string", enum: ["guarantee", "loan", "raise", "equity", "grant", "export", "rnd"] },
        situation: { type: "object", description: "{stage, sector, subsector, country (ISO2), raise_size_eur}" },
        k: { type: "integer", description: "how many, default 5" },
      }, []),
      tool("fund_requirements", "The instrument's requirement texts that bear most on a focus.",
        { instrument_id: str("id"), focus: str("e.g. 'financial intermediary', 'banking licence', 'SME'") }, ["instrument_id", "focus"]),
      tool("application_route", "How a founder actually applies: channel, window, link, and whose route it is.",
        { instrument_id: str("id") }, ["instrument_id"]),
      ...s.tools,
    ],
    handlers: {
      find_instruments: { required: ["objective"], run: (i: Record<string, unknown>) => findInstruments(c, p(), i as never) },
      assess_instrument: { required: ["instrument_id"], run: (i: Record<string, unknown>) =>
        assess(c, p(), String(i.instrument_id), (sha, url, quote, label) => cite(ctx, "wincent", "assess_instrument")(sha, url, quote, label)) },
      find_precedents: { run: (i: Record<string, unknown>) => precedents(c, i as never,
        async (url, quote, label) => {
          try {
            const v = await ctx.deps.mandate.fetch(url, { title: label });
            if (!v.citable) return null;
            return ctx.ledger.add(await ctx.deps.mandate.cite({ sha256: v.sha256, quote }), "wincent", "find_precedents", label);
          } catch { return null; }
        }) },
      fund_requirements: { required: ["instrument_id", "focus"], run: (i: Record<string, unknown>) => requirements(c, String(i.instrument_id), String(i.focus)) },
      application_route: { required: ["instrument_id"], run: (i: Record<string, unknown>) => route(c, String(i.instrument_id)) },
      ...s.handlers,
    } as Record<string, ToolHandler>,
  };
}

export function reginaTools(ctx: Ctx) {
  const pol = ctx.deps.policy;
  const s = shared(ctx, "regina");
  return {
    tools: [
      tool("search_law", "Passages from Regina's corpus closest to a question, each cited [cN].",
        { query: str("the legal question, in the words a statute would use"), jurisdictions: strs("optional: EU, DE, FR, IT ...") }, ["query"]),
      tool("document", "One document in depth: its record and the passages bearing on a question, cited.",
        { document_id: { type: "integer", description: "from search_law" }, question: str("what to look for in it") }, ["document_id"]),
      tool("consultations", "Open consultations a company could still respond to, soonest deadline first.",
        { jurisdiction: str("optional"), closing_within_days: { type: "integer" } }, []),
      tool("actors", "Named people on a file (rapporteurs first), from Regina's corpus.",
        { document_id: { type: "integer" }, topic: str("a file or topic name") }, []),
      ...s.tools,
    ],
    handlers: {
      search_law: { required: ["query"], run: async (i: Record<string, unknown>) => {
        const { results } = await pol.search(String(i.query), 12);
        const j = ((i.jurisdictions as string[]) ?? []).map((x) => x.toUpperCase());
        const hits = j.length ? results.filter((h) => !h.jurisdiction || j.includes(h.jurisdiction.toUpperCase())) : results;
        return { passages: await citeHits(ctx, "regina", "search_law", hits, 6) };
      } },
      document: { required: ["document_id"], run: async (i: Record<string, unknown>) => {
        const id = Number(i.document_id);
        const doc = await pol.document(id);
        let passages: PolicyHit[] = [];
        try { passages = (await pol.passages(id, i.question ? String(i.question) : undefined, 5)).passages; }
        catch { /* endpoint not deployed yet: the record and its excerpt still stand */ }
        const { excerpt, ...record } = doc as Record<string, unknown> & { excerpt?: string };
        return { document: record, passages: await citeHits(ctx, "regina", "document", passages, 5),
          ...(passages.length ? {} : { excerpt_uncited: String(excerpt ?? "").slice(0, 1500) }) };
      } },
      consultations: { run: async (i: Record<string, unknown>) => {
        const r = await pol.consultations({ jurisdiction: i.jurisdiction as string, closing_within_days: i.closing_within_days as number });
        return { ...r, consultations: r.consultations.slice(0, 12), note: "Consultation records, uncited: research the url to cite." };
      } },
      actors: { run: async (i: Record<string, unknown>) => {
        if (i.document_id === undefined && !i.topic) throw new Error("give document_id or topic");
        try {
          const r = await pol.actors({ document_id: i.document_id as number, q: i.topic as string });
          return { ...r, note: "Corpus record of who spoke on or holds the file; uncited." };
        } catch (e) {
          return { actors: [], note: `actors endpoint unavailable (${String(e).slice(0, 80)}); use research` };
        }
      } },
      ...s.handlers,
    } as Record<string, ToolHandler>,
  };
}

// ── specialists ──────────────────────────────────────────────────────────

function profileBlock(ctx: Ctx): string {
  return `COMPANY PROFILE (version ${ctx.profile.version}):\n${JSON.stringify(ctx.profile.payload, null, 1)}`;
}

async function consult(ctx: Ctx, who: Sp, question: string): Promise<string> {
  const scope = question.length > 140 ? `${question.slice(0, 137)}...` : question;
  ctx.emit({ type: "specialist_started", missionId: ctx.missionId, specialist: who, scope });
  const t = who === "wincent" ? wincentTools(ctx) : reginaTools(ctx);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: PLAYBOOKS.core[who] },
    ...(ctx.playbook ? [{ type: "text" as const, text: `THE JOB PLAYBOOK FOR THIS MISSION (the owner's practice; follow it):\n\n${ctx.playbook}` }] : []),
    { type: "text", text: profileBlock(ctx), cache_control: { type: "ephemeral" } },
  ];
  const r = await runLoop({
    client: ctx.deps.client, model: SPECIALIST_MODEL, effort: SPECIALIST_EFFORT, system,
    tools: t.tools, handlers: t.handlers, maxTurns: 10, maxTokens: 16000,
    messages: [{ role: "user", content: `Question from Mandate:\n${question}` }],
    budget: { ...ctx.budget, note: "[runtime] The mission budget is nearly spent. Stop researching and write your report now with what you have." },
    onToolCall: (name, input) => ctx.emit({ type: "tool_used", missionId: ctx.missionId, specialist: who, tool: name,
      summary: JSON.stringify(input).slice(0, 200) }),
  });
  const report = r.text || `(${who} returned no report: ${r.stop}${r.error ? `, ${r.error}` : ""})`;
  await ctx.deps.mandate.addMessage(ctx.missionId, { created_by: who, content: report,
    payload: { question, stop: r.stop, turns: r.turns } }).catch(() => {});
  ctx.emit({ type: "message", missionId: ctx.missionId, specialist: who, text: report });
  ctx.emit({ type: "specialist_completed", missionId: ctx.missionId, specialist: who,
    summary: report.split("\n").find((l) => l.trim())?.slice(0, 240) ?? "" });
  const known = ctx.ledger.all().filter((e) => e.specialist === who).map((e) => ctx.ledger.line(e.id));
  return `${who.toUpperCase()}'S REPORT (stop: ${r.stop}):\n${report}\n\nEVIDENCE ${who} registered (cite these ids exactly):\n${known.join("\n") || "(none)"}`;
}

// ── the orchestrator's tools ─────────────────────────────────────────────

function orchestratorTools(ctx: Ctx, done: { finished: boolean; awaiting: boolean }) {
  const m = ctx.deps.mandate;
  const now = () => (ctx.deps.now?.() ?? new Date()).toISOString();
  const jobIndex = Object.entries(PLAYBOOKS.jobs).map(([k, v]) => `${k}: ${v.title}`).join("; ");
  const tools: Anthropic.Tool[] = [
    tool("load_playbook", `Load a job playbook. Available: ${jobIndex}`, { job: str("playbook name") }, ["job"]),
    tool("consult_wincent", "Ask Wincent (public capital) a precise question. Returns Wincent's report and the evidence ids.", { question: str("the question, with the context Wincent needs") }, ["question"]),
    tool("consult_regina", "Ask Regina (policy, law, regulators, files and people) a precise question. Returns Regina's report and the evidence ids.", { question: str("the question, with the context Regina needs") }, ["question"]),
    tool("save_flag", "Save a gap in the company's position that blocks or weakens a route.", {
      title: str("short"), severity: { type: "string", enum: ["blocker", "major", "minor"] }, fix: str("the concrete fix"), claims: CLAIMS, on_behalf_of: BY,
    }, ["title", "severity", "fix", "claims"]),
    tool("save_decision", "Save a decision the founder must take, with your recommendation.", {
      title: str("the decision"), recommendation: str("what you recommend"), claims: CLAIMS,
      confidence: { type: "string", enum: ["low", "medium", "high"] }, due_at: str("optional ISO date"), on_behalf_of: BY,
    }, ["title", "recommendation", "claims", "confidence"]),
    tool("save_action", "Save a concrete next step for the founder, with a ready-to-send draft where useful. The founder always sends.", {
      title: str("the action"), detail: str("what exactly to do"), draft: str("optional: the email/message, formal, short, in the recipient's language"),
      stakeholder: { type: "object", description: "optional: {name, organisation, role, channel, contact, contactVerified}. contactVerified is true ONLY for a published contact point from the register." },
      decision_title: str("optional: the saved decision this carries out"), due_at: str("optional ISO date"), on_behalf_of: BY,
    }, ["title", "detail"]),
    tool("save_plan_step", "Append one step to the ordered plan.", {
      title: str("the step"), detail: str("what it involves"), horizon: { type: "string", enum: ["this_week", "this_month", "this_quarter", "later"] },
    }, ["title", "detail", "horizon"]),
    tool("save_watch", "Put a route or a rule on the workspace watchlist: every recommended, probed or parked route, and every rule change that could reopen or close one.", {
      kind: { type: "string", enum: ["route", "rule", "institution", "consultation", "case", "agenda"] }, subject: str("what is watched"),
      route_status: { type: "string", enum: ["pursue", "probe", "parked", "closed"] }, trigger: str("what change would alter the advice"),
      jurisdiction: str("ISO2 or EU"), citation_ids: strs("optional evidence ids"),
    }, ["kind", "subject", "trigger"]),
    tool("ask_founder", "Ask the founder the diagnostic questions you need BEFORE advising, when the ask is too vague to advise on. The mission pauses until they answer. Do not use it to defer work you can do.", {
      questions: { type: "array", items: { type: "object", additionalProperties: false, required: ["question", "why"],
        properties: { question: str("plain words"), why: str("what the answer changes") } } },
      preamble: str("one or two sentences to the founder: what you understood and why you ask"),
    }, ["questions", "preamble"]),
    tool("finish_mission", "Once, last: the written deliverable. Every claim labelled.", {
      title: str("title"), summary: str("3-5 sentences: the answer"),
      sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "claims"],
        properties: { heading: str("section heading"), claims: CLAIMS } } },
      questions: { type: "array", description: "what only the founder can answer, and why it changes the advice",
        items: { type: "object", additionalProperties: false, required: ["question", "why"], properties: { question: str("q"), why: str("why") } } },
    }, ["title", "summary", "sections", "questions"]),
  ];
  const decisions = new Map<string, string>();
  const by = (i: Record<string, unknown>) => (i.on_behalf_of as Specialist) ?? "mandate";
  const handlers: Record<string, ToolHandler> = {
    load_playbook: { required: ["job"], run: async (i) => {
      const p = PLAYBOOKS.jobs[String(i.job)];
      if (!p) throw new Error(`no playbook ${i.job}; available: ${jobIndex}`);
      ctx.playbook = p.text;
      return p.text;
    } },
    consult_wincent: { required: ["question"], run: (i) => consult(ctx, "wincent", String(i.question)) },
    consult_regina: { required: ["question"], run: (i) => consult(ctx, "regina", String(i.question)) },
    save_flag: { required: ["title", "severity", "fix", "claims"], run: async (i) => {
      const row = await m.save(ctx.missionId, "flags", { title: i.title, severity: i.severity, fix: i.fix, claims: i.claims,
        citations: ctx.ledger.pick(idsOf(i.claims)), created_by: by(i) });
      const claims = toClaims(i.claims);
      ctx.emit({ type: "flag", missionId: ctx.missionId, flag: { id: row.id, missionId: ctx.missionId, title: String(i.title),
        severity: i.severity as never, fix: String(i.fix), claims, evidence: evidence(ctx.ledger, idsOf(i.claims)),
        createdBy: by(i), createdAt: String(row.created_at ?? now()) } });
      return { saved: row.id };
    } },
    save_decision: { required: ["title", "recommendation", "claims", "confidence"], run: async (i) => {
      const row = await m.save(ctx.missionId, "decisions", { title: i.title, recommendation: i.recommendation, claims: i.claims,
        citations: ctx.ledger.pick(idsOf(i.claims)), confidence: i.confidence, due_at: i.due_at, created_by: by(i) });
      decisions.set(String(i.title), row.id);
      const claims = toClaims(i.claims);
      const d: WorkspaceDecision = { id: row.id, missionId: ctx.missionId, title: String(i.title),
        recommendation: String(i.recommendation), rationale: prose(claims), confidence: i.confidence as never,
        ...(i.due_at ? { dueAt: String(i.due_at) } : {}), createdAt: String(row.created_at ?? now()),
        evidence: evidence(ctx.ledger, idsOf(i.claims)), claims, createdBy: by(i) };
      ctx.emit({ type: "decision", missionId: ctx.missionId, decision: d });
      return { saved: row.id };
    } },
    save_action: { required: ["title", "detail"], run: async (i) => {
      const decisionId = i.decision_title ? decisions.get(String(i.decision_title)) : undefined;
      const row = await m.save(ctx.missionId, "actions", { title: i.title, detail: i.detail, draft: i.draft,
        stakeholder: i.stakeholder, decision_id: decisionId, due_at: i.due_at, created_by: by(i) });
      const a: WorkspaceAction = { id: row.id, ...(decisionId ? { decisionId } : {}), title: String(i.title), status: "open",
        ...(i.due_at ? { dueAt: String(i.due_at) } : {}), createdAt: String(row.created_at ?? now()),
        detail: String(i.detail), ...(i.draft ? { draft: String(i.draft) } : {}),
        ...(i.stakeholder ? { stakeholder: i.stakeholder as never } : {}) };
      ctx.emit({ type: "action", missionId: ctx.missionId, action: a });
      return { saved: row.id };
    } },
    save_plan_step: { required: ["title", "detail", "horizon"], run: async (i) => {
      const row = await m.save(ctx.missionId, "plan_steps", { title: i.title, detail: i.detail, horizon: i.horizon, created_by: "mandate" });
      ctx.emit({ type: "plan_step", missionId: ctx.missionId, step: { id: row.id, missionId: ctx.missionId,
        ordinal: Number(row.ordinal ?? 0), title: String(i.title), detail: String(i.detail), horizon: i.horizon as never,
        createdAt: String(row.created_at ?? now()) } });
      return { saved: row.id, ordinal: row.ordinal };
    } },
    save_watch: { required: ["kind", "subject", "trigger"], run: async (i) => {
      const row = await m.save(ctx.missionId, "watchlist", { kind: i.kind, subject: i.subject, route_status: i.route_status,
        trigger: i.trigger, jurisdiction: i.jurisdiction, citations: ctx.ledger.pick((i.citation_ids as string[]) ?? []), created_by: "mandate" });
      ctx.emit({ type: "watch", missionId: ctx.missionId, watch: { id: row.id, missionId: ctx.missionId, kind: i.kind as never,
        subject: String(i.subject), ...(i.route_status ? { routeStatus: i.route_status as never } : {}), trigger: String(i.trigger),
        ...(i.jurisdiction ? { jurisdiction: String(i.jurisdiction) } : {}), createdAt: String(row.created_at ?? now()) } });
      return { saved: row.id };
    } },
    ask_founder: { required: ["questions", "preamble"], run: async (i) => {
      const questions = (i.questions as { question: string; why: string }[]) ?? [];
      await m.addMessage(ctx.missionId, { created_by: "mandate", content: String(i.preamble),
        payload: { questions, awaiting_founder: true } });
      ctx.emit({ type: "message", missionId: ctx.missionId, specialist: "mandate", text: String(i.preamble) });
      ctx.emit({ type: "questions", missionId: ctx.missionId, questions });
      done.awaiting = true;
      return { asked: questions.length, note: "The mission pauses for the founder's answers. Stop now." };
    } },
    finish_mission: { required: ["title", "summary", "sections", "questions"], run: async (i) => {
      const sections = (i.sections as { heading: string; claims: unknown }[]) ?? [];
      const ids = sections.flatMap((s) => idsOf(s.claims));
      await m.save(ctx.missionId, "deliverable", {
        title: i.title, summary: i.summary, sections, questions: i.questions, citations: ctx.ledger.pick(ids) });
      ctx.emit({ type: "deliverable", missionId: ctx.missionId, deliverable: {
        title: String(i.title), summary: String(i.summary),
        sections: sections.map((s) => ({ heading: s.heading, claims: toClaims(s.claims) })),
        questions: (i.questions as { question: string; why: string }[]) ?? [], evidence: evidence(ctx.ledger, ids) } });
      done.finished = true;
      return { saved: true, note: "Mission finished. Stop now." };
    } },
  };
  return { tools, handlers };
}

function orchestratorSystem(ctx: Ctx): Anthropic.TextBlockParam[] {
  const jobs = Object.entries(PLAYBOOKS.jobs).map(([k, v]) => `- ${k}: ${v.title}`).join("\n");
  return [
    { type: "text", text: PLAYBOOKS.core.method },
    { type: "text", text: `JOB PLAYBOOKS AVAILABLE (load_playbook):\n${jobs}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: profileBlock(ctx) },
  ];
}

/** Run one mission to completion, emitting events. Never throws: a failure is
 *  an `error` event. */
export async function runMission(input: MissionInput, deps: MissionDeps, emit: Emit): Promise<{ missionId?: string; finished: boolean; awaiting?: boolean }> {
  let missionId: string | undefined;
  try {
    const prior = input.missionId ? await deps.mandate.getMission(input.missionId) : undefined;
    if (prior && (prior.workspace_id !== input.workspaceId || prior.profile_id !== input.profileId)) {
      throw new Error("that mission belongs to another workspace or profile");
    }
    const prof = await deps.mandate.profile(input.profileId);
    if (prof.version !== input.profileVersion) {
      throw new Error(`profile ${input.profileId} is at version ${prof.version}, the mission pinned ${input.profileVersion}`);
    }
    const wanted = input.job ?? prior?.job ?? undefined;
    const job = wanted && PLAYBOOKS.jobs[wanted] ? wanted : undefined;
    missionId = prior ? prior.id : (await deps.mandate.createMission({ workspace_id: input.workspaceId,
      objective: input.objective, profile_id: input.profileId, profile_version: input.profileVersion, job,
      created_by: "founder" })).id;
    emit({ type: "mission_started", missionId, objective: input.objective });
    await deps.mandate.addMessage(missionId, { created_by: "founder", content: input.objective }).catch(() => {});
    const budget = deps.budgetEur ?? (Number(process.env.MANDATE_MISSION_BUDGET_EUR) || MISSION_BUDGET_EUR);
    const ctx: Ctx = {
      deps, ledger: new CitationLedger(), missionId, profileId: input.profileId,
      profile: { version: prof.version, payload: prof.payload as unknown as CompanyProfile }, emit,
      playbook: job ? PLAYBOOKS.jobs[job].text : undefined,
      budget: { wrapUpAt: budget * WRAP_UP_SHARE, stopAt: budget,
        note: "[runtime] The mission budget is nearly spent. Consult no one else: save what you have and call finish_mission now." },
    };
    const done = { finished: false, awaiting: false };
    const t = orchestratorTools(ctx, done);
    const history = (prior?.messages ?? []).filter((x) => x.content?.trim())
      .map((x) => `${x.created_by.toUpperCase()}: ${x.content}${x.payload?.questions ? `\n(questions asked: ${JSON.stringify(x.payload.questions)})` : ""}`);
    const opening = [
      history.length ? `THE MISSION SO FAR (earlier turns; the evidence ids from them are not carried over, consult again to cite):\n${history.join("\n\n")}\n\nThe founder now replies:\n${input.objective}`
        : `The founder's question:\n${input.objective}`,
      job ? `The ${job} playbook is already loaded:\n\n${ctx.playbook}` : "Load the matching job playbook first if one fits.",
      "Work the method. End with finish_mission.",
    ].join("\n\n");
    const r = await runLoop({
      client: deps.client, model: ORCHESTRATOR_MODEL, effort: ORCHESTRATOR_EFFORT, system: orchestratorSystem(ctx),
      tools: t.tools, handlers: t.handlers, maxTurns: 16, maxTokens: 32000, budget: ctx.budget,
      messages: [{ role: "user", content: opening }],
      onToolCall: (name, i) => { if (!name.startsWith("consult_")) emit({ type: "tool_used", missionId: ctx.missionId,
        specialist: "mandate", tool: name, summary: String(i.title ?? i.subject ?? i.job ?? "").slice(0, 160) }); },
      onText: (text) => emit({ type: "message", missionId: ctx.missionId, specialist: "mandate", text }),
      stopWhen: () => done.finished || done.awaiting,
    });
    await deps.mandate.addMessage(missionId, { created_by: "mandate", content: r.text,
      payload: { stop: r.stop, turns: r.turns, citations: ctx.ledger.all().length, eur: currentCost() } }).catch(() => {});
    if (done.awaiting) {
      emit({ type: "mission_completed", missionId });
      return { missionId, finished: false, awaiting: true };
    }
    if (!done.finished) {
      emit({ type: "error", missionId, recoverable: true,
        message: `The mission ended without a deliverable (${r.stop}${r.error ? `: ${r.error}` : ""}). What was saved stands.` });
    }
    emit({ type: "mission_completed", missionId });
    return { missionId, finished: done.finished };
  } catch (e) {
    emit({ type: "error", missionId, recoverable: false, message: e instanceof Error ? e.message : String(e) });
    return { missionId, finished: false };
  }
}
