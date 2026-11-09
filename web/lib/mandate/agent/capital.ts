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

export interface GateGrounding { gateKey: string; instrumentId: string; sha256: string }

/** Everything the capital tools read, behind one seam so tests can fake it. */
export interface CapitalPort {
  hydrate(): Promise<void>;
  instruments(): DbInstrument[];
  hydrateGates(ids: string[]): Promise<void>;
  verdict(profile: CompanyProfile, objective: string, capitalSought: string[]): ReturnType<typeof computeVerdict>;
  demands(id: string, focus: string, k: number): ReturnType<typeof retrieveDemands>;
  gateGrounding(instrumentIds: string[]): Promise<GateGrounding[]>;
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
  const verdict = await port.verdict(profile, input.objective, input.instrument_types ?? []);
  for (const row of verdict.instrumentTable) {
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
    withheld: verdict.withheld?.note,
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
