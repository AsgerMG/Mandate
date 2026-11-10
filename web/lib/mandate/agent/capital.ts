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
import { MARKET_TIER, type MarketTier } from "./marketTiers.generated";

/** One award record that is a precedent. */
export interface PrecedentRow {
  company: string; company_country: string | null; subsector: string | null; sector_top: string | null;
  amount_eur: number | null; kind: string; started: string | null; programme: string | null;
  granting_authority: string | null; source: string; raw_source_url: string | null;
  /** award (public_funding_events) or equity_stake (public_equity_stakes). Absent = award. */
  record?: "award" | "equity_stake";
  holder_type?: string | null; stake?: string | null; exited?: boolean;
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

/** One located quote in a status-layer row (capital migration 039). */
export interface LayerCitation {
  sha256: string; url: string; quote: string; char_start?: number; char_end?: number; located: boolean;
}
export interface StatusKeyRow { key: string; label: string; kind: string; country: string | null; how_obtained: string; citations: LayerCitation[] }
export interface StatusRuleRow {
  rule_key: string; country: string; level: string; nuts: string | null; product_family: string;
  instrument_ids: string[]; role: string; status_key: string; effect: string; any_of: string | null;
  activity_tags: string[]; statement: string; verify_note: string | null; citations: LayerCitation[];
}
export interface RegionPriorityRow {
  nuts: string; country: string; region: string; strategy: string; priority: string;
  activity_tags: string[]; citations: LayerCitation[];
}
/** An instrument whose own region gate names a NUTS region (eligibility_gates, op region_within). */
export interface RegionGatedRow { instrument_id: string; name: string; capital_type: string | null; allowed: string[] }

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
  /** The status layer (capital migration 039). Empty when the tables are not there yet. */
  statusLayer(countries: string[]): Promise<{ keys: StatusKeyRow[]; rules: StatusRuleRow[]; regions: RegionPriorityRow[] }>;
  regionGated(nuts: string[]): Promise<RegionGatedRow[]>;
  /** Public equity stakes (capital.public_equity_stakes): who holds whom. Optional: a port without it has none. */
  equityStakes?(q: EquityQuery): Promise<PrecedentRow[]>;
  /** The relevant signals articles (capital.signals_articles, is_relevant = 1). Optional. */
  agenda?(q: AgendaQuery): Promise<AgendaRow[]>;
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
  equityStakes: (q) => equityStakesSql(q),
  agenda: (q) => agendaSql(q),
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
  statusLayer: async (countries) => {
    const cc = countries.map((c) => c.toUpperCase());
    try {
      const [keys, rules, regions] = await Promise.all([
        pgQuery<StatusKeyRow>(`SELECT key, label, kind, country, how_obtained, citations FROM status_keys ORDER BY key`, []),
        pgQuery<StatusRuleRow>(
          `SELECT rule_key, country, level, nuts, product_family, instrument_ids, role, status_key, effect,
                  any_of, activity_tags, statement, verify_note, citations
             FROM status_rules r
            WHERE (cardinality($1::text[]) = 0 OR country = ANY($1))
              AND NOT EXISTS (SELECT 1 FROM status_rules s WHERE s.supersedes = r.rule_key)
            ORDER BY product_family, role, rule_key`, [cc]),
        pgQuery<RegionPriorityRow>(
          `SELECT nuts, country, region, strategy, priority, activity_tags, citations FROM region_priorities
            WHERE cardinality($1::text[]) = 0 OR country = ANY($1) ORDER BY nuts, id`, [cc]),
      ]);
      return { keys, rules, regions };
    } catch (e) {
      // migration 039 not applied here yet: say so through empty results, never crash the tool
      console.error("[mandate/capital] status layer unavailable:", String(e));
      return { keys: [], rules: [], regions: [] };
    }
  },
  regionGated: async (nuts) => {
    if (!nuts.length) return [];
    try {
      const rows = await pgQuery<{ instrument_id: string; name: string; capital_type: string | null; value_spec: string }>(
        `SELECT g.instrument_id, i.name, i.capital_type, g.value_spec
           FROM eligibility_gates g JOIN funding_instruments i ON i.id = g.instrument_id
          WHERE g.value_spec LIKE '%region_within%' AND g.gate_role = 'filter'
            AND EXISTS (SELECT 1 FROM unnest($1::text[]) n WHERE g.value_spec LIKE '%"' || n || '%')
          ORDER BY i.event_count DESC NULLS LAST LIMIT 60`, [nuts]);
      return rows.map((r) => {
        let allowed: string[] = [];
        try { allowed = (JSON.parse(r.value_spec).allowed ?? []).map(String); } catch { /* keep empty */ }
        return { instrument_id: r.instrument_id, name: r.name, capital_type: r.capital_type, allowed };
      });
    } catch (e) {
      console.error("[mandate/capital] region-gated lookup failed:", String(e));
      return [];
    }
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

/** The corpus's guarantee capital types. The screen's vocabulary folds them
 *  into "loan" (CAPITAL_SOUGHT_TO_DB), where the far more numerous loans crowd
 *  them out of its pool: asked as "loan", a guarantee question saw none of the
 *  corpus's guarantee instruments (alignment run, 2026-11-10). */
const GUARANTEE_TYPES = new Set(["guarantee", "counter_guarantee"]);
const GUARANTEE_ASK = /(guarant|b(ü|ue|u)rgsch|garanz|garanti)/i;

/** What the question asks for. A guarantee question is a guarantee question
 *  whether the caller typed "guarantee" or, as the screen's vocabulary taught
 *  it, "loan": "loan" alone with a guarantee objective reads as guarantee. */
export function interpretTypes(objective: string, types: string[]): { types: string[]; guarantee: boolean; inferred: boolean } {
  const t = types.map((x) => x.toLowerCase());
  if (t.some((x) => GUARANTEE_TYPES.has(x))) return { types: t, guarantee: true, inferred: false };
  if (GUARANTEE_ASK.test(objective) && (!t.length || t.every((x) => x === "loan"))) {
    return { types: ["guarantee"], guarantee: true, inferred: true };
  }
  return { types: t, guarantee: false, inferred: false };
}

export async function findInstruments(port: CapitalPort, profile: CompanyProfile, input: {
  objective: string; instrument_types?: string[]; jurisdictions?: string[]; name_query?: string; limit?: number;
  /** "national" keeps instruments with no delivery region; "regional" keeps those with one. */
  level?: string;
  /** A NUTS code or an Italian region name: keeps that region's instruments (and, unless
   *  level is "regional", the national ones a company there can also use). */
  region?: string;
}) {
  await port.hydrate();
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 15);
  const juris = (input.jurisdictions ?? []).map((j) => j.toUpperCase());
  const market = offeredMarkets(profile, juris);
  const level = input.level?.toLowerCase();
  const nuts = input.region ? toNuts(input.region) : undefined;
  const byId = new Map(port.instruments().map((i) => [i.id, i]));
  // Where the money is delivered: national (no delivery region) or a region's own.
  const placeOk = (id?: string | null) => {
    if (!level && !input.region) return true;
    const r = (id ? byId.get(id)?.deliveryRegion : null) ?? null;
    if (level === "national" && r) return false;
    if (level === "regional" && !r) return false;
    if (input.region && r && !(nuts && (r.startsWith(nuts) || nuts.startsWith(r)))) return false;
    return true;
  };
  const namedJuris = (c?: string, id?: string | null) =>
    (!juris.length || (c ? juris.includes(c.toUpperCase()) : false)) && placeOk(id);
  // a lookup by name is explicit, so it is not held to the market default
  const inJuris = (c?: string, id?: string | null) => namedJuris(c, id) && market.offered(c);
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const asked = interpretTypes(input.objective, input.instrument_types ?? []);
  // The screen knows no guarantee type: it is asked for "loan" and its rows are
  // then kept to guarantees unless loans were asked for too.
  const screenTypes = [...new Set(asked.types.map((t) => (GUARANTEE_TYPES.has(t) ? "loan" : t)))];
  const loansToo = asked.types.includes("loan");
  if (asked.guarantee) {
    const g = port.instruments()
      .filter((i) => GUARANTEE_TYPES.has(String(i.capitalType)) && inJuris(i.country, i.id))
      .sort((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0));
    for (const i of g) {
      if (out.length >= limit) break;
      seen.add(i.id);
      out.push({ ...summarise(i), matched: "guarantee" });
    }
  }
  if (input.name_query?.trim()) {
    const terms = norm(input.name_query).split(/\s+/).filter((t) => t.length > 2);
    for (const i of port.instruments()) {
      const hay = norm(`${i.name} ${i.administeringBody ?? ""} ${i.description ?? ""}`);
      if (terms.every((t) => hay.includes(t)) && namedJuris(i.country, i.id) && !seen.has(i.id)) {
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
    verdict = await port.verdict(profile, input.objective, screenTypes);
  } catch (e) {
    screenError = e instanceof Error ? e.message.slice(0, 160) : String(e);
    console.error("[mandate/capital] the screen failed; returning name matches only:", screenError);
  }
  for (const row of verdict?.instrumentTable ?? []) {
    if (out.length >= limit * 2) break;
    if (!row.instrumentId || seen.has(row.instrumentId) || !inJuris(row.country, row.instrumentId)) continue;
    if (asked.guarantee && !loansToo && !GUARANTEE_TYPES.has(String(row.capitalType))) continue;
    seen.add(row.instrumentId);
    out.push({
      instrument_id: row.instrumentId, name: row.instrument, country: row.country,
      capital_type: row.capitalType, administering_body: row.administeringBody,
      ticket: row.ticket, fit: row.fit || undefined, application_url: row.applicationUrl,
      matched: "screen",
    });
  }
  return {
    instruments: out.map((o): Record<string, unknown> => {
      const r = byId.get(String(o.instrument_id))?.deliveryRegion;
      return { ...o, level: r ? "regional" : "national", ...(r ? { region: r } : {}) };
    }),
    ...(input.region && !nuts ? { region_unrecognised: `${input.region}: give a NUTS code (e.g. ITC4) or an Italian region name` } : {}),
    ...(asked.guarantee ? { interpreted_as: asked.inferred
      ? "guarantee (the objective asks for a guarantee; 'loan' alone was read as guarantee)" : "guarantee" } : {}),
    note: "Corpus rows, uncited. Use assess_instrument for cited gates before relying on any.",
    withheld: verdict?.withheld?.note,
    ...market.note(),
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
  const rows = [
    ...await port.precedents({ instrument: scope, institution: scope ? undefined : input.institution,
      move: input.move, limit: 300 }),
    ...await equityPrecedentRows(port, { scope, institution: scope ? undefined : input.institution, move: input.move }),
  ];
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
      evidence: citation ? "cited (register page names the company)"
        : r.record === "equity_stake" ? "equity-stake register record (raw_source_url), not grounded"
          : "register record (raw_source_url), not grounded" });
  }
  return { scope: scopeLabel, precedents: out, none_found: false,
    note: "Award records, and equity stakes (record: equity_stake: who invested in whom), from Wincent's corpus. Cite [cN] where given; otherwise say 'register record' with the source URL, and do not present it as cited." };
}


// ── Data wiring (data_audit.md, 10 Nov): market tiers, equity stakes, the agenda ──

/** core | hub | out for an instrument's country (EU is core). Unknown is out. */
export function marketTier(code?: string | null): MarketTier {
  if (!code) return "out";
  const c = code.trim().toUpperCase();
  return MARKET_TIER[c === "UK" ? "GB" : c === "EL" ? "GR" : c] ?? "out";
}

/** OUT-market instruments are frozen context: not offered unless the company is
 *  established there (incorporation or an entity country) or the caller named
 *  the country. Counts what it held back, so the agent can say so. */
export function offeredMarkets(profile: CompanyProfile, jurisdictions: string[]) {
  const here = new Set([profile.incorporationCountry, ...(profile.entityCountries ?? []), ...jurisdictions]
    .filter((c): c is string => !!c).map((c) => c.toUpperCase()));
  const held = new Map<string, number>();
  return {
    offered(c?: string | null): boolean {
      if (marketTier(c) !== "out" || (c && here.has(c.toUpperCase()))) return true;
      const k = (c ?? "unknown").toUpperCase();
      held.set(k, (held.get(k) ?? 0) + 1);
      return false;
    },
    note(): { not_offered?: string } {
      if (!held.size) return {};
      const list = [...held.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", ");
      return { not_offered: `Instruments in markets outside Mandate's core and hubs were held back (${list}): frozen context, not refreshed. Name the country in jurisdictions to see them.` };
    },
  };
}

export interface EquityQuery { sources?: string[]; holder?: string; limit: number }

const EQUITY_MOVES = new Set(["equity", "raise"]);

/** Equity stakes as precedents: for an equity or raise move (or no move), the
 *  companies the same holder (by its register source, or by name) holds. */
export async function equityPrecedentRows(port: CapitalPort, q: {
  scope?: PrecedentQuery["instrument"]; institution?: string; move?: string;
}): Promise<PrecedentRow[]> {
  if (!port.equityStakes || (q.move && !EQUITY_MOVES.has(q.move))) return [];
  if (q.scope?.sources.length) return port.equityStakes({ sources: q.scope.sources, limit: 200 });
  if (q.institution?.trim()) return port.equityStakes({ holder: q.institution.trim(), limit: 200 });
  return [];
}

async function equityStakesSql(q: EquityQuery): Promise<PrecedentRow[]> {
  const where = ["c.canonical_name IS NOT NULL"];
  const params: unknown[] = [];
  if (q.sources?.length) { params.push(q.sources); where.push(`s.source = ANY($${params.length})`); }
  else if (q.holder) { params.push(`%${q.holder}%`); where.push(`(s.holder ILIKE $${params.length} OR s.via_fund ILIKE $${params.length})`); }
  else return [];
  return pgQuery<PrecedentRow>(
    `SELECT c.canonical_name AS company, c.country AS company_country, c.subsector, c.sector_top,
            s.ticket_eur AS amount_eur, 'equity stake' AS kind, coalesce(s.as_of, s.first_seen) AS started,
            coalesce(s.via_fund, s.holder) AS programme, s.holder AS granting_authority, s.source, s.raw_source_url,
            'equity_stake' AS record, s.holder_type,
            CASE WHEN s.stake_pct_min IS NULL THEN NULL
                 WHEN s.stake_pct_max IS NULL OR s.stake_pct_max = s.stake_pct_min THEN s.stake_pct_min || '%'
                 ELSE s.stake_pct_min || '-' || s.stake_pct_max || '%' END AS stake,
            s.exited = 1 AS exited
       FROM public_equity_stakes s JOIN companies c ON c.id = s.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY coalesce(s.as_of, s.first_seen) DESC NULLS LAST
      LIMIT ${Math.min(Math.max(q.limit, 1), 400)}`, params);
}

export interface AgendaQuery {
  institution?: string; region?: string; topic?: string; since?: string; limit: number;
}

export interface AgendaRow {
  article_id: number; title: string; url: string; published_at: string | null;
  source: string; source_tier: string; country: string | null; language: string | null;
  signals: { type: string; summary: string }[] | null; excerpt: string | null;
}

async function agendaSql(q: AgendaQuery): Promise<AgendaRow[]> {
  const where = ["a.is_relevant = 1"];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (q.institution?.trim()) {
    const pat = p(`%${q.institution.trim()}%`);
    where.push(`(a.title ILIKE ${pat} OR a.raw_text ILIKE ${pat} OR EXISTS (SELECT 1 FROM signals_article_entities e
      WHERE e.article_id = a.id AND e.entity_type IN ('investor', 'program') AND e.mention_text ILIKE ${pat}))`);
  }
  if (q.topic?.trim()) {
    const pat = p(`%${q.topic.trim()}%`);
    where.push(`(a.title ILIKE ${pat} OR a.raw_text ILIKE ${pat} OR EXISTS (SELECT 1 FROM signals_article_signals g
      WHERE g.article_id = a.id AND g.summary ILIKE ${pat}))`);
  }
  if (q.region?.trim()) {
    const r = q.region.trim().toUpperCase();
    where.push(`(src.country = ${p(r === "UK" ? "GB" : r)} OR src.country IS NULL AND $${params.length} = 'EU')`);
  }
  if (q.since?.trim()) where.push(`coalesce(a.published_at, a.fetched_at) COLLATE "C" >= ${p(q.since.trim())}`);
  return pgQuery<AgendaRow>(
    `SELECT a.id AS article_id, a.title, coalesce(a.resolved_url, a.url) AS url, a.published_at,
            src.name AS source, src.tier AS source_tier, src.country, a.language,
            (SELECT json_agg(json_build_object('type', g.signal_type, 'summary', g.summary) ORDER BY g.confidence DESC)
               FROM signals_article_signals g WHERE g.article_id = a.id) AS signals,
            left(a.raw_text, 400) AS excerpt
       FROM signals_articles a JOIN signals_sources src ON src.id = a.source_id
      WHERE ${where.join(" AND ")}
      ORDER BY coalesce(a.published_at, a.fetched_at) COLLATE "C" DESC NULLS LAST, a.id DESC
      LIMIT ${Math.min(Math.max(q.limit, 1), 50)}`, params);
}

/** The agenda: what the press Wincent's corpus follows (the 3,984 articles its
 *  classifier marked relevant) says about an institution, a region or a topic
 *  since a date. The first few are cited through grounding when the article's
 *  page is already stored (by URL); otherwise the article URL is the source. */
export async function agenda(port: CapitalPort, input: {
  institution?: string; region?: string; topic?: string; since?: string; k?: number;
}, cite: (url: string, quote: string, label: string) => Promise<string | null>) {
  if (!input.institution && !input.region && !input.topic) throw new Error("give institution, region or topic");
  if (input.since && !/^\d{4}-\d{2}(-\d{2})?$/.test(input.since)) throw new Error("since is an ISO date, e.g. 2026-06-01");
  if (!port.agenda) return { articles: [], note: "The agenda store is not available here." };
  const k = Math.min(Math.max(input.k ?? 8, 1), 20);
  const rows = await port.agenda({ ...input, limit: k });
  const articles = [];
  for (const [i, r] of rows.entries()) {
    const citation = i < 3 ? await cite(r.url, r.title, `${r.source}: ${r.title}`.slice(0, 160)) : null;
    articles.push({ ...r, excerpt: r.excerpt ? r.excerpt.slice(0, 400) : null, citation,
      evidence: citation ? "cited (stored article page)" : "news article (url), not grounded" });
  }
  return {
    articles, none_found: !articles.length,
    note: articles.length
      ? "News the corpus marked relevant, newest first. It says what was reported, not what the rules are: cite [cN] where given, otherwise name the outlet and URL as unverified."
      : "Nothing in the relevant news matches. Use research for current coverage.",
  };
}

// ── Status matching and economic geography (playbook §4d.2, §4e) ───────────

/** Italy's NUTS-2 regions by name, for a caller who says "Lombardia" rather than ITC4. */
export const IT_NUTS2: Record<string, string> = {
  piemonte: "ITC1", "valle d'aosta": "ITC2", liguria: "ITC3", lombardia: "ITC4", bolzano: "ITH1",
  trento: "ITH2", veneto: "ITH3", "friuli-venezia giulia": "ITH4", "emilia-romagna": "ITH5",
  toscana: "ITI1", umbria: "ITI2", marche: "ITI3", lazio: "ITI4", abruzzo: "ITF1", molise: "ITF2",
  campania: "ITF3", puglia: "ITF4", basilicata: "ITF5", calabria: "ITF6", sicilia: "ITG1", sardegna: "ITG2",
};

/** A region as a NUTS code: a code passes through, an Italian region name is looked up. */
export function toNuts(region: string): string | undefined {
  const r = region.trim();
  if (/^[A-Za-z]{2}[A-Za-z0-9]{1,3}$/.test(r) && /\d/.test(r)) return r.toUpperCase();
  const flat = (s: string) => norm(s).replace(/[-\s]+/g, " ").trim();
  return Object.entries(IT_NUTS2).find(([k]) => flat(k) === flat(r))?.[1];
}

/** Common names for the status vocabulary, so a caller need not know the keys. The keys
 *  themselves always pass; anything unrecognised is returned as unknown, never guessed. */
const STATUS_ALIASES: [RegExp, string][] = [
  [/^(lic\.it\.)?tub_?106$|^art\.? ?106|^106$|106 tub|^art106/i, "lic.it.tub106"],
  [/^(lic\.it\.)?bank(_tub13)?$|^banca$|banking licen[cs]e/i, "lic.it.bank_tub13"],
  [/confidi/i, "lic.it.confidi"],
  [/leasing/i, "lic.it.leasing_intermediary"],
  [/start-?up[ _]innovativ|innovative start-?up/i, "status.it.startup_innovativa"],
  [/pmi[ _]innovativ|innovative sme/i, "status.it.pmi_innovativa"],
  [/^(status\.eu\.)?sme(_annex_i)?$|^pmi$/i, "status.eu.sme_annex_i"],
  [/^estab(lished)?[._ ]it$|^italian (entity|establishment|company)$/i, "estab.it"],
];

export function normaliseStatus(s: string): { key?: string; nuts?: string } {
  const t = s.trim();
  const estab = t.match(/^estab\.it\.([A-Za-z0-9]{3,5})$/);
  if (estab) return { key: "estab.it", nuts: estab[1].toUpperCase() };
  for (const [re, key] of STATUS_ALIASES) if (re.test(t)) return { key };
  if (/^(lic|status|estab|age|reg|raise)\.[a-z0-9_.]+$/.test(t)) return { key: t };
  return {};
}

/** Words an activity is described in -> the activity tags region_priorities and
 *  status_rules carry. A caller may also pass the tags themselves. */
const ACTIVITY_TAGS: [RegExp, string[]][] = [
  [/robot|cobot|automat|mechatron|meccatron/i, ["robotics", "automation", "advanced_manufacturing"]],
  [/manufactur|manifattur|industr(y|ia) ?4|factory|fabbrica|machin|macchin/i, ["advanced_manufacturing", "industry_4_0", "machinery"]],
  [/defen[cs]e|difesa|security|sicurezza|dual.?use/i, ["defence", "security"]],
  [/aero|space|spazi/i, ["aerospace", "space"]],
  [/automotive|vehicle|mobility|mobilit/i, ["automotive", "mobility"]],
  [/\bai\b|artificial intelligence|software|digital|data|cloud/i, ["digital", "ai"]],
  [/logistic|warehouse|magazzin/i, ["logistics"]],
  [/health|medic|life ?science|salute|biotech/i, ["health", "life_sciences", "medtech"]],
  [/agri|food|alimentar/i, ["agrifood"]],
  [/energy|energia|clean|climate|green|circular/i, ["energy", "cleantech"]],
  [/construct|edilizi|building/i, ["construction"]],
  [/lend|loan|credit|guarant|fintech/i, ["lending", "guarantee", "sme_finance"]],
  [/equity|raise|round|invest/i, ["equity_raise"]],
  [/lease|leasing|as.a.service|raas/i, ["leasing", "robots_as_a_service"]],
];

export function activityTags(activity?: string): string[] {
  if (!activity?.trim()) return [];
  const out = new Set<string>();
  for (const [re, tags] of ACTIVITY_TAGS) if (re.test(activity)) tags.forEach((t) => out.add(t));
  for (const w of activity.toLowerCase().split(/[\s,;]+/)) if (/^[a-z0-9]+_[a-z0-9_]+$/.test(w)) out.add(w);
  return [...out];
}

type LayerCite = (sha256: string, quote: string, label: string, span?: [number, number]) => Promise<string | null>;

async function citeAll(cs: LayerCitation[], label: string, cite: LayerCite) {
  const ids: string[] = [];
  const uncited: string[] = [];
  for (const c of cs) {
    const span: [number, number] | undefined = c.char_start != null && c.char_end != null ? [c.char_start, c.char_end] : undefined;
    const id = c.located ? await cite(c.sha256, c.quote, label, span) : null;
    if (id) ids.push(id);
    else uncited.push(c.quote.slice(0, 200));
  }
  return { citations: ids, ...(uncited.length ? { uncited_quotes: uncited } : {}) };
}

const sumTags = (rows: { activity_tags: string[] }[], tags: string[]) =>
  rows.reduce((n, r) => n + r.activity_tags.filter((t) => tags.includes(t)).length, 0);

/**
 * match_status: the products a set of statuses opens, at each level, in each role, cited.
 *
 * The statuses are what the company HOLDS OR PLANS: a planned status is matched like a held
 * one, and its how-to-obtain comes back cited, because getting it is a plan step (§4d.2).
 * Per product family and role it says whether the door is open, which status opens it and
 * what is still required. A rule whose quote does not resolve in grounding comes back with
 * `uncited_quotes`, never as cited.
 */
export async function matchStatus(port: CapitalPort, input: {
  status: string[]; level?: string; activity?: string; country?: string; region?: string;
}, cite: LayerCite) {
  const country = (input.country ?? "IT").toUpperCase();
  const parsed = (input.status ?? []).map((s) => ({ asked: s, ...normaliseStatus(String(s)) }));
  const unknown = parsed.filter((p) => !p.key).map((p) => p.asked);
  const held = new Set(parsed.flatMap((p) => (p.key ? [p.key] : [])));
  const nutsHeld = new Set(parsed.flatMap((p) => (p.nuts ? [p.nuts] : [])));
  const regionNuts = input.region ? toNuts(input.region) : undefined;
  if (regionNuts) nutsHeld.add(regionNuts);
  if (nutsHeld.size) held.add("estab.it");
  const level = input.level?.toLowerCase();
  const tags = activityTags(input.activity);

  const layer = await port.statusLayer([country]);
  if (!layer.rules.length && !layer.keys.length) {
    return { error: `no status rules are loaded for ${country} (capital migration 039 and its batch load). Research the statute and cite it.` };
  }
  const keyInfo = new Map(layer.keys.map((k) => [k.key, k]));

  const byFamily = new Map<string, StatusRuleRow[]>();
  for (const r of layer.rules) {
    if (level && r.level !== level) continue;
    const k = `${r.product_family}|${r.role}`;
    byFamily.set(k, [...(byFamily.get(k) ?? []), r]);
  }
  const doors = [];
  for (const [k, rules] of byFamily) {
    const [family, role] = k.split("|");
    const bearing = rules.filter((r) => held.has(r.status_key));
    if (!bearing.length) continue;                       // nothing the company holds bears on it
    const required = rules.filter((r) => r.effect === "required");
    const groups = new Map<string, StatusRuleRow[]>();
    for (const r of rules) if (r.effect === "one_of" && r.any_of) groups.set(r.any_of, [...(groups.get(r.any_of) ?? []), r]);
    const missing = [
      ...required.filter((r) => !held.has(r.status_key)).map((r) => r.status_key),
      ...[...groups.values()].filter((g) => !g.some((r) => held.has(r.status_key))).map((g) => g.map((r) => r.status_key).join(" | ")),
    ];
    const excluded = rules.filter((r) => r.effect === "excludes" && held.has(r.status_key)).map((r) => r.status_key);
    const gated = required.length > 0 || groups.size > 0;
    const door = excluded.length ? "shut by a held status"
      : !gated ? "status helps (priority), does not open a door"
      : missing.length ? "not yet: still required" : "open for this role";
    const evidence = [];
    for (const r of bearing) {
      evidence.push({
        rule: r.rule_key, status: r.status_key, effect: r.effect, statement: r.statement,
        ...(r.verify_note ? { verify: r.verify_note } : {}),
        ...(await citeAll(r.citations, `${family} (${role}): ${r.status_key}`, cite)),
      });
    }
    doors.push({
      product_family: family, level: rules[0].level, ...(rules[0].nuts ? { nuts: rules[0].nuts } : {}), role, door,
      instruments_held: [...new Set(rules.flatMap((r) => r.instrument_ids))],
      ...(missing.length ? { still_required: missing } : {}),
      ...(excluded.length ? { excluded_by: excluded } : {}),
      // an uncited rule narrows, never decides (evidence tiers): say which this door rests on
      evidence_tier: evidence.every((e) => e.citations.length) ? "cited" : evidence.some((e) => e.citations.length) ? "partly uncited" : "uncited: research and cite before relying on it",
      activity_relevance: tags.length ? sumTags(rules, tags) : 0, evidence,
    });
  }
  doors.sort((a, b) => (Number(b.door === "open for this role") - Number(a.door === "open for this role"))
    || b.activity_relevance - a.activity_relevance);

  const statuses = [];
  for (const key of held) {
    const info = keyInfo.get(key);
    if (!info) continue;
    statuses.push({ status: key, label: info.label, how_obtained: info.how_obtained,
      ...(await citeAll(info.citations, `status ${key}`, cite)) });
  }

  const regional = nutsHeld.size && (!level || level === "regional")
    ? (await port.regionGated([...nutsHeld])).map((r) => ({ ...r, note: "the instrument's own region gate; assess_instrument cites it" }))
    : [];

  const region_fit = [];
  if (tags.length) {
    const fit = new Map<string, RegionPriorityRow[]>();
    for (const p of layer.regions) if (p.activity_tags.some((t) => tags.includes(t))) fit.set(p.nuts, [...(fit.get(p.nuts) ?? []), p]);
    const ranked = [...fit.values()].sort((a, b) => sumTags(b, tags) - sumTags(a, tags));
    for (const ps of ranked) {
      const priorities = [];
      for (const p of ps) {
        priorities.push({ priority: p.priority, matched_tags: p.activity_tags.filter((t) => tags.includes(t)),
          ...(await citeAll(p.citations, `${p.region} S3: ${p.priority}`, cite)) });
      }
      region_fit.push({ region: ps[0].region, nuts: ps[0].nuts, strategy: ps[0].strategy, fit_score: sumTags(ps, tags), priorities });
    }
  }

  return {
    country, statuses_matched: [...held],
    ...(unknown.length ? { unknown_statuses: unknown, known_statuses: [...keyInfo.keys()] } : {}),
    activity_tags: tags, doors, statuses,
    ...(regional.length ? { regional_instruments: regional } : {}),
    ...(tags.length ? { region_fit } : {}),
    note: "Rules from the status layer, each cited [cN] to the statute or operating rules. 'open for this role' means the status requirement is met, not that a deal is approved. A product family missing here is a gap in the layer, not proof the door is shut: research the institution's own rules and cite them.",
  };
}
