/**
 * Wincent's capital tools over the functions the brief already runs on. Nothing
 * here re-derives eligibility: it wraps computeVerdict (the model-free screen),
 * assessInstrument and evaluateEligibility (the decision boundary),
 * retrieveDemands and resolveRoute, after hydrateDbInstruments.
 *
 * Gate citations. A gate's quote is cited through grounding when capital has
 * linked it there (capital.eligibility_grounding, migration 034): the linked
 * version's sha256 plus the quote go to mandate-api, which locates the words in
 * the stored text. A gate that does not resolve comes back with `cited: null`
 * and the quote as corpus text: the agent may report it, never as cited, and
 * an uncited gate never disqualifies (evidence tiers).
 */
import { openPg } from "@/lib/db";
import { resolveRoute } from "@/lib/intelligence/applicationRoute";
import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, type DbInstrument,
} from "@/lib/intelligence/corpus";
import { retrieveDemands } from "@/lib/intelligence/demandRetrieval";
import { evaluateEligibility } from "@/lib/intelligence/eligibility";
import { computeVerdict } from "@/lib/intelligence/pipeline";
import { isCited, isFilter } from "@/lib/intelligence/evidenceTier";
import { assessInstrument } from "@/lib/intelligence/verdict";
import { toCapitalRequest, validateProfile, type CompanyProfile } from "../profile";

/** One award record that is a precedent. */
export interface PrecedentRow {
  company: string; company_country: string | null; subsector: string | null; sector_top: string | null;
  amount_eur: number | null; kind: string; started: string | null; programme: string | null;
  granting_authority: string | null; source: string; raw_source_url: string | null;
}

export interface PrecedentQuery {
  /** Scope by instrument: its own sources, and for a scheme child its parent's
   *  sources narrowed to the child's notified scheme and granting body. */
  instrument?: { sources: string[]; schemeCode?: string | null; body?: string | null };
  /** Or by institution + instrument type. */
  institution?: string;
  move?: string;
  country?: string;
  limit: number;
}

export interface GateGrounding { gateKey: string; instrumentId: string; sha256: string }

/** Everything the capital tools read, behind one seam so tests can fake it. */
export interface CapitalPort {
  hydrate(): Promise<void>;
  instruments(): DbInstrument[];
  hydrateGates(ids: string[]): Promise<void>;
  verdict(profile: CompanyProfile, objective: string, capitalSought: string[]): ReturnType<typeof computeVerdict>;
  demands(id: string, focus: string, k: number): ReturnType<typeof retrieveDemands>;
  gateGrounding(instrumentIds: string[]): Promise<GateGrounding[]>;
  /** The source families an instrument's awards are loaded under. */
  instrumentSources(id: string): Promise<string[]>;
  precedents(q: PrecedentQuery): Promise<PrecedentRow[]>;
}

// What each move looks like in the award records. SATR encodes the aid
// instrument (StateAidInstrumentG = guarantee, SL = soft loan, Lradv = loan or
// repayable advance, DG = direct grant, PRVRISKFIN = private risk finance,
// Taote = tax advantage); Norway's register writes Garanti / Lån / Tilskudd.
const MOVE_SQL: Record<string, string> = {
  guarantee: "(e.aid_instrument IN ('StateAidInstrumentG', 'Garanti') OR e.aid_instrument ~* '(guarant|garanz|bürgsch)' OR e.source ~* '(guarant|garanz)')",
  loan: "(e.debt_amount_eur > 0 OR e.aid_instrument IN ('StateAidInstrumentSL', 'StateAidInstrumentLradv', 'Lån', 'StateAidInstrumentG', 'Garanti'))",
  raise: "(e.equity_amount_eur > 0 OR e.instrument_class IN ('equity', 'quasi_equity', 'risk_finance') OR e.aid_instrument = 'StateAidInstrumentPRVRISKFIN')",
  equity: "(e.equity_amount_eur > 0 OR e.instrument_class IN ('equity', 'quasi_equity', 'risk_finance'))",
  grant: "(e.grant_amount_eur > 0 OR e.aid_instrument IN ('StateAidInstrumentDG', 'Tilskudd'))",
  export: "(e.aid_objective ~* '(export|internationali)' OR e.programme_name ~* '(export|internationali)' OR e.source ~* 'export')",
  rnd: "(e.aid_objective ~* '(research|innovation|R&D)' OR e.source ~* '(horizon|eic|cdti|innovate|_rnd)')",
};

async function pgQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url) return [];
  const client = await openPg(url, { connectMs: 3000, statementMs: 15000 });
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end().catch(() => {});
  }
}

export const realCapital: CapitalPort = {
  hydrate: () => hydrateDbInstruments(),
  instruments: () => loadDbInstruments(),
  hydrateGates: (ids) => hydrateGatesFor(ids),
  verdict: (profile, objective, capitalSought) => {
    const req = toCapitalRequest(validateProfile(profile));
    return computeVerdict(req.company, req.country, req.eligibility, {
      capitalSought: capitalSought.length ? capitalSought : req.capitalSought,
      description: [objective, req.description].filter(Boolean).join("\n\n"),
    });
  },
  demands: (id, focus, k) => retrieveDemands([id], focus, k),
  instrumentSources: async (id) => (await pgQuery<{ source: string }>(
    `SELECT source FROM funding_instrument_sources WHERE instrument_id = $1 ORDER BY 1`, [id])).map((r) => r.source),
  precedents: async (q) => {
    const where = ["e.is_duplicate = 0", "c.canonical_name IS NOT NULL"];
    const params: unknown[] = [];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    if (q.instrument) {
      if (!q.instrument.sources.length) return [];
      where.push(`e.source = ANY(${p(q.instrument.sources)})`);
      if (q.instrument.schemeCode) where.push(`(e.call_id = ${p(q.instrument.schemeCode)} OR e.satr_tm_id = $${params.length})`);
      if (q.instrument.body) where.push(`e.granting_authority = ${p(q.instrument.body)}`);
    } else if (q.institution) {
      const pat = p(`%${q.institution}%`);
      where.push(`(e.granting_authority ILIKE ${pat} OR e.entrusted_entity ILIKE ${pat} OR e.financial_intermediaries ILIKE ${pat} OR e.programme_name ILIKE ${pat})`);
    } else return [];
    if (q.move && MOVE_SQL[q.move]) where.push(MOVE_SQL[q.move]);
    if (q.country) where.push(`(c.country = ${p(q.country)} OR e.deployment_country = $${params.length} OR e.granting_authority_country = $${params.length})`);
    return pgQuery<PrecedentRow>(
      `SELECT c.canonical_name AS company, c.country AS company_country, c.subsector, c.sector_top,
              COALESCE(e.debt_amount_eur, e.equity_amount_eur, e.grant_amount_eur) AS amount_eur,
              CASE WHEN e.debt_amount_eur > 0 THEN 'debt/guarantee' WHEN e.equity_amount_eur > 0 THEN 'equity'
                   WHEN e.grant_amount_eur > 0 THEN 'grant' ELSE coalesce(e.instrument_class, e.aid_instrument, 'unknown') END AS kind,
              e.project_started AS started, coalesce(e.programme_name, e.aid_instrument, e.project_title) AS programme,
              e.granting_authority, e.source, e.raw_source_url
         FROM public_funding_events e JOIN companies c ON c.id = e.company_id
        WHERE ${where.join(" AND ")}
        ORDER BY e.project_started DESC NULLS LAST
        LIMIT ${Math.min(Math.max(q.limit, 1), 400)}`, params);
  },
  gateGrounding: async (ids) => {
    const url = process.env.DATABASE_URL;
    if (!url || !ids.length) return [];
    const client = await openPg(url, { connectMs: 3000, statementMs: 5000 });
    try {
      const r = await client.query(
        `SELECT eg.instrument_id, eg.source_key, v.sha256
           FROM eligibility_grounding eg
           JOIN grounding.document_versions v ON v.id = eg.grounding_version_id
          WHERE eg.source_type = 'gate' AND eg.instrument_id = ANY($1)`, [ids]);
      return r.rows.map((x: { instrument_id: string; source_key: string; sha256: string }) =>
        ({ instrumentId: x.instrument_id, gateKey: x.source_key, sha256: x.sha256 }));
    } catch (e) {
      console.error("[mandate/capital] eligibility_grounding lookup failed:", String(e));
      return [];
    } finally {
      await client.end().catch(() => {});
    }
  },
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function summarise(i: DbInstrument) {
  return {
    instrument_id: i.id, name: i.name, country: i.country, capital_type: i.capitalType,
    administering_body: i.administeringBody, parent_id: i.parentId,
    last_award_year: i.lastYear, awards_recorded: i.eventCount,
    description: i.description ? i.description.slice(0, 400) : undefined,
    who_may_apply: i.eligibilityText ? i.eligibilityText.slice(0, 400) : undefined,
  };
}

export async function findInstruments(port: CapitalPort, profile: CompanyProfile, input: {
  objective: string; instrument_types?: string[]; jurisdictions?: string[]; name_query?: string; limit?: number;
}) {
  await port.hydrate();
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 15);
  const juris = (input.jurisdictions ?? []).map((j) => j.toUpperCase());
  const inJuris = (c?: string) => !juris.length || (c ? juris.includes(c.toUpperCase()) : false);
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  if (input.name_query?.trim()) {
    const terms = norm(input.name_query).split(/\s+/).filter((t) => t.length > 2);
    for (const i of port.instruments()) {
      const hay = norm(`${i.name} ${i.administeringBody ?? ""} ${i.description ?? ""}`);
      if (terms.every((t) => hay.includes(t)) && inJuris(i.country) && !seen.has(i.id)) {
        seen.add(i.id);
        out.push({ ...summarise(i), matched: "name" });
        if (out.length >= limit) break;
      }
    }
  }
  // The screen is the richer half, but name matches already found must not be
  // lost if it fails (a missing generated index, a database timeout).
  let verdict: Awaited<ReturnType<CapitalPort["verdict"]>> | undefined;
  let screenError: string | undefined;
  try {
    verdict = await port.verdict(profile, input.objective, input.instrument_types ?? []);
  } catch (e) {
    screenError = e instanceof Error ? e.message.slice(0, 160) : String(e);
    console.error("[mandate/capital] the screen failed; returning name matches only:", screenError);
  }
  for (const row of verdict?.instrumentTable ?? []) {
    if (out.length >= limit * 2) break;
    if (!row.instrumentId || seen.has(row.instrumentId) || !inJuris(row.country)) continue;
    seen.add(row.instrumentId);
    out.push({
      instrument_id: row.instrumentId, name: row.instrument, country: row.country,
      capital_type: row.capitalType, administering_body: row.administeringBody,
      ticket: row.ticket, fit: row.fit || undefined, application_url: row.applicationUrl,
      matched: "screen",
    });
  }
  return {
    instruments: out,
    note: "Corpus rows, uncited. Use assess_instrument for cited gates before relying on any.",
    withheld: verdict?.withheld?.note,
    ...(screenError ? { screen_unavailable: "The eligibility screen did not run; only name matches are listed. Use name_query to look up instruments by name." } : {}),
  };
}

/** The one intake field that would settle this instrument for the founder. */
function decidingQuestion(inst: DbInstrument, answers: Record<string, unknown>): string | undefined {
  for (const g of inst.gates) {
    if (!isFilter(g)) continue;
    const field = (g.valueSpec as { field?: string } | null)?.field;
    if (field && answers[field] === undefined) return `${field}: ${g.requirement}`;
  }
  return undefined;
}

export async function assess(port: CapitalPort, profile: CompanyProfile, id: string,
  cite: (sha256: string | null, url: string | null, quote: string, label: string) => Promise<string | null>) {
  await port.hydrate();
  const inst = port.instruments().find((i) => i.id === id);
  if (!inst) return { error: `no instrument ${id} in the corpus` };
  await port.hydrateGates([id]);
  const fresh = port.instruments().find((i) => i.id === id) ?? inst;
  const answers = toCapitalRequest(validateProfile(profile)).eligibility ?? {};
  const a = assessInstrument(fresh, answers);
  const screen = evaluateEligibility(answers, [id]);
  const grounding = await port.gateGrounding([id, ...(fresh.parentId ? [fresh.parentId] : [])]);
  const sha = new Map(grounding.map((g) => [`${g.instrumentId}:${g.gateKey}`, g.sha256]));
  const gates = [];
  for (const g of fresh.gates.slice(0, 12)) {
    let citation: string | null = null;
    if (g.quote?.trim()) {
      const s = sha.get(`${id}:${g.id}`) ?? (fresh.parentId ? sha.get(`${fresh.parentId}:${g.id}`) : undefined);
      const url = /^https?:\/\//.test(g.source.file) ? g.source.file : null;
      if (s || url) citation = await cite(s ?? null, s ? null : url, g.quote, `${fresh.name}: ${g.requirement}`.slice(0, 160));
    }
    gates.push({
      requirement: g.requirement, role: g.gateRole, filter: isFilter(g),
      evidence_tier: isCited(g) ? "cited in the corpus" : "uncited (never disqualifies)",
      quote: g.quote ? g.quote.slice(0, 500) : undefined, citation,
      source: g.source.file ? `${g.source.file}${g.source.locator ? ` ${g.source.locator}` : ""}` : undefined,
    });
  }
  return {
    instrument: summarise(fresh),
    status: a.status, checked: a.checked, passed: a.passed,
    blockers: a.blockers.map((b) => ({ requirement: b.requirement, field: b.field, cited: b.cited, borrowed: b.borrowed })),
    deciding_question: decidingQuestion(fresh, answers as Record<string, unknown>),
    framework_checks: screen.map((c) => ({ check: c.check, status: c.status, finding: c.finding, cure: c.cure })),
    gates,
  };
}

export async function requirements(port: CapitalPort, id: string, focus: string) {
  const chunks = await port.demands(id, focus, 5);
  return {
    instrument_id: id, focus,
    requirements: chunks.map((c) => c.text),
    note: chunks.length ? "Corpus requirement text, uncited: assess_instrument cites the gates."
      : "No indexed requirement text for this instrument (or retrieval unavailable).",
  };
}

export async function route(port: CapitalPort, id: string) {
  await port.hydrate();
  const all = port.instruments();
  const leaf = all.find((i) => i.id === id);
  if (!leaf) return { error: `no instrument ${id} in the corpus` };
  const parent = leaf.parentId ? all.find((i) => i.id === leaf.parentId) : undefined;
  const r = resolveRoute({
    application: leaf.application, applicationOwn: leaf.applicationOwn,
    ownApplicationUrl: leaf.applicationUrl, administeringBody: leaf.administeringBody,
    schemeOperators: leaf.schemeOperators, parentName: parent?.name,
  });
  return {
    instrument_id: id, name: leaf.name, administering_body: leaf.administeringBody,
    scheme_operators: leaf.schemeOperators ?? [], channel: r.channel, timeline: r.timeline,
    url: r.url, provenance: r.provenance, recorded_for: r.recordedFor, withheld_because: r.withheldBecause,
    note: "Curated route, uncited. Research the url to cite the current process.",
  };
}


/** Precedents (owner's playbook 1c): companies the same instrument, or the
 *  same kind of instrument at the same institution, backed in a similar
 *  situation. Ranked by how close the situation is, never by name. Each row's
 *  register link is its source; the top few are cited through grounding when
 *  the register page names the company. */
export async function precedents(port: CapitalPort, input0: {
  instrument_id?: string; institution?: string; move?: string;
  situation?: { stage?: string; sector?: string; subsector?: string; country?: string; raise_size_eur?: number };
  k?: number;
}, cite: (url: string, quote: string, label: string) => Promise<string | null>) {
  let input = { ...input0 };
  const k = Math.min(Math.max(input.k ?? 5, 1), 10);
  const sit = input.situation ?? {};
  let scope: PrecedentQuery["instrument"];
  let scopeLabel = "";
  if (input.instrument_id) {
    await port.hydrate();
    const all = port.instruments();
    const inst = all.find((i) => i.id === input.instrument_id);
    if (!inst) return { error: `no instrument ${input.instrument_id} in the corpus` };
    const own = await port.instrumentSources(inst.id);
    const sources = own.length ? own : inst.parentId ? await port.instrumentSources(inst.parentId) : [];
    if (sources.length) {
      scope = { sources, schemeCode: own.length ? null : inst.schemeCode, body: own.length ? null : inst.administeringBody };
      scopeLabel = `awards under ${inst.name}${own.length ? "" : " (the parent programme's records, narrowed to this scheme and body)"}`;
    } else if (inst.administeringBody) {
      // No award source is loaded for this instrument itself: fall back to its
      // administering body, said so, so the agent does not read it as this fund's own record.
      input = { ...input, institution: inst.administeringBody.split("/")[0].trim() };
      scopeLabel = `no award records are loaded for ${inst.name} itself; showing awards by its administering body, ${input.institution}${input.move ? ` (${input.move})` : ""}`;
    } else {
      return { scope: `awards under ${inst.name}`, precedents: [], none_found: true,
        note: "NO award records are loaded for this instrument. Research the institution's own published transaction lists." };
    }
  } else if (input.institution) {
    scopeLabel = `awards by ${input.institution}${input.move ? ` (${input.move})` : ""}`;
  } else {
    throw new Error("give instrument_id, or institution (with a move)");
  }
  // Pull widely within scope, then rank by situation: a precedent need not be
  // a competitor, only the same situation (playbook 1c).
  const rows = await port.precedents({ instrument: scope, institution: scope ? undefined : input.institution,
    move: input.move, limit: 300 });
  const score = (r: PrecedentRow) => {
    let s = 0;
    if (sit.subsector && r.subsector === sit.subsector) s += 3;
    if (sit.sector && r.sector_top === sit.sector) s += 2;
    if (sit.country && r.company_country === sit.country.toUpperCase()) s += 2;
    if (sit.raise_size_eur && r.amount_eur) {
      const ratio = r.amount_eur / sit.raise_size_eur;
      if (ratio >= 0.25 && ratio <= 4) s += 1.5;
    }
    const year = Number(String(r.started ?? "").slice(0, 4));
    if (year >= 2021) s += 0.5;
    return s;
  };
  const ranked = rows.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s).slice(0, k);
  if (!ranked.length) {
    return { scope: scopeLabel, precedents: [], none_found: true,
      note: "NO PRECEDENT in Wincent's award records for this scope. That is itself information: a first-of-a-kind ask needs a stronger case. Research the institution's own published transaction lists before concluding there is none." };
  }
  const out = [];
  for (const [i, { r, s }] of ranked.entries()) {
    const citation = i < 3 && r.raw_source_url ? await cite(r.raw_source_url, r.company, `${r.company}: ${r.programme ?? r.source}`) : null;
    out.push({ ...r, similarity: Number(s.toFixed(1)), citation,
      evidence: citation ? "cited (register page names the company)" : "register record (raw_source_url), not grounded" });
  }
  return { scope: scopeLabel, precedents: out, none_found: false,
    note: "Award records from Wincent's corpus. Cite [cN] where given; otherwise say 'register record' with the source URL, and do not present it as cited." };
}
