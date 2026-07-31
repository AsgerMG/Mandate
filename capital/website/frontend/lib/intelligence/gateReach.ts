// Live, per-request reach scoring — the TS twin of
// ETL/terms/aggregate_intake_usage.py's formula, but scoped to a single
// founder's actual candidate-instrument shortlist instead of the whole
// corpus. This is what grounds the adaptive round (Phase 3C) in gates that
// are genuinely still open for THIS founder, not a blind sweep of 320
// instruments' worth of requirements.
import { loadDbInstruments } from "./corpus";
import { FIELD_ENUM_HINTS, type EligibilityAnswers } from "./types";

// Fields already resolved on the deterministic first page — never re-asked
// adaptively, regardless of how much gate reach they still carry.
// lossesOverHalfCapital is listed because it is now answered as one line of
// the exclusions checklist rather than as its own alarming question, and
// derived from it server-side (see sanitizeEligibility).
const FIRST_PAGE_FIELDS = new Set([
  // Shrunk from 11 to 5 on 2026-07-29. The first screen now asks only what is
  // needed to BUILD a shortlist at all — where you are, what you build, how
  // big you are, how much you want, how far along you are. Everything else
  // moved into the adaptive round, where it is asked only when a fund on THIS
  // founder's shortlist actually turns on it.
  //
  // The trade is deliberate: an eleven-question opener asks every founder about
  // co-financing, consortia and exclusion flags whether or not a single fund in
  // front of them cares. Four of those questions gate fewer than 50 instruments
  // each, so most people were answering them for nothing. A shorter opener that
  // earns its follow-ups is a funnel; a long one is an interrogation.
  // useOfFunds stays on the first screen despite the shrink: it decides 58
  // filters, more than any other single field, and "what would the money pay
  // for" is a leading question about the project rather than a follow-up.
  // Demoted, it was reaching only 2 founders in 12 because it competes for six
  // adaptive slots against fields that gate far less.
  "entityCountries", "sector", "useOfFunds", "fteBand", "ticketBand",
  "developmentStage",
]);

export interface OpenFieldEvidence {
  field: string;
  /** Share of the shortlist's event_count still gated on this field, 0-100. */
  reachPct: number;
  nInstruments: number;
  /** Up to 3 real (instrument name, requirement text) pairs for prompt grounding. */
  examples: { instrument: string; requirement: string }[];
}

function isAnswered(answers: EligibilityAnswers | undefined, field: string): boolean {
  if (!answers) return false;
  const v = (answers as Record<string, unknown>)[field];
  if (v === undefined || v === null || v === "" || v === "unsure") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Which intake fields are still worth asking for this founder's specific
 * shortlist: gate-eligible (in FIELD_ENUM_HINTS, so a real fixed answer set
 * exists), not already on the first page, not already answered, and backed
 * by at least one real gate on an instrument still in the running. Ranked by
 * live reach, highest first.
 */
export function openFieldsForShortlist(
  instrumentIds: string[],
  answers: EligibilityAnswers | undefined,
): OpenFieldEvidence[] {
  const ids = new Set(instrumentIds);
  const shortlist = loadDbInstruments().filter((i) => ids.has(i.id));
  if (!shortlist.length) return [];
  const totalEvents = shortlist.reduce((s, i) => s + i.eventCount, 0) || shortlist.length;

  const byField = new Map<string, { events: number; instruments: Set<string>; examples: { instrument: string; requirement: string }[] }>();
  for (const inst of shortlist) {
    for (const gate of inst.gates) {
      // Only triaged FILTERS, on the CURATED field. This path feeds the
      // deterministic verdict engine, so grounding it in the extractor's
      // intake_field (wrong on roughly half a sample) or in obligations and
      // programme facts (half the corpus) asks founders to resolve things that
      // could never decide anything. Untriaged gates still pass, so coverage
      // growth degrades safely.
      if (gate.gateRole && gate.gateRole !== "filter") continue;
      const field = gate.intakeFieldResolved || gate.intakeField;
      if (!field || field === "none") continue;
      if (FIRST_PAGE_FIELDS.has(field)) continue;
      if (!FIELD_ENUM_HINTS[field]) continue; // no real fixed answer set for it — out of scope here
      // A field whose fact is already an option on another field's question
      // does not earn a second slot. A live screen asked whether accumulated
      // losses exceeded half of share capital as its own question while the
      // exclusions question above it already offered exactly that as an
      // option, so the founder answered the same thing twice.
      const covered = FIELD_ENUM_HINTS[field].coveredBy;
      if (covered && !isAnswered(answers, covered)) continue;
      if (isAnswered(answers, field)) continue;
      const entry = byField.get(field) ?? { events: 0, instruments: new Set<string>(), examples: [] };
      if (!entry.instruments.has(inst.id)) {
        entry.events += inst.eventCount || 1;
        entry.instruments.add(inst.id);
        if (entry.examples.length < 3 && gate.requirement) {
          entry.examples.push({ instrument: inst.name, requirement: gate.requirement });
        }
      }
      byField.set(field, entry);
    }
  }

  return [...byField.entries()]
    .map(([field, v]) => ({
      field,
      reachPct: Math.round((1000 * v.events) / totalEvents) / 10,
      nInstruments: v.instruments.size,
      examples: v.examples,
    }))
    .sort((a, b) => b.reachPct - a.reachPct);
}

// ── Project-level gate text (brief_funnel_v2 Stage 2b) ──────────────────────
//
// The enum path above can only see gates whose intakeField is one of the ~12
// keys in FIELD_ENUM_HINTS, and collapsing a gate to an enum throws away the
// specificity that is already sitting in its `requirement` text. eic_accelerator
// is the proof: it has no intake_field='none' gates at all, yet its text reads
// "Technology must be at TRL 5-6 at entry with a credible path to market, not
// pure research" — which became a four-option developmentStage dropdown.
//
// So this path reads the requirement text of EVERY gate, whatever its
// intakeField. 3,991 of 4,018 gates carry substantive text, covering all 322
// instruments and 100% of corpus euros, so there is no coverage cliff here.

/** Requirement text is only worth a question above this length. Below it the
 *  text is almost always a restatement of the enum it maps to ("Must be an
 *  SME"); above it, it tends to carry real project detail. Tuned so the EIC
 *  TRL gate (89 chars) survives even though developmentStage is answered on
 *  the first page. */
const MIN_SUBSTANTIVE_LEN = 60;

export interface ProjectGateEvidence {
  /** Stable dedupe key: normalised requirement text. */
  key: string;
  /** Verbatim requirement text — what the question must be phrased from. */
  requirement: string;
  quote: string;
  /** Highest-ranked carrier, used as the citation anchor. */
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  gateFamily?: string;
  locator?: string;
  /** How many shortlist instruments carry this requirement. */
  nInstruments: number;
  /** Share of shortlist event-weight carried by those instruments, 0-100. */
  reachPct: number;
  score: number;
}

function normaliseRequirement(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * How much a gate family tells us about what the company actually DOES.
 * Without this the ranking fills up with size/geography boilerplate — the
 * first live test returned eight questions about being established in Russia,
 * Belarus, Hungary and China, all from one instrument. G5 (use of funds) IS
 * the project; G1 (nexus) is what the technology has to be. Those are the two
 * that make a memo specific.
 */
const FAMILY_WEIGHT: Record<string, number> = {
  G5_use_of_funds: 1.0,
  G1_nexus: 0.85,
  G6_conditionality: 0.7,
  G3_financial: 0.5,
  G4_borrower_model: 0.4,
  G2_size_ownership: 0.3,
};

/** Concrete detail (a TRL band, an ISO number, a percentage, a euro figure)
 *  makes for a far sharper question than abstract prose. Cheap proxy. */
const CONCRETE = /\b(TRL\s*\d|ISO\s*\d|\d+\s*%|EUR\s*[\d.]|\d{4}\/\d+|Article\s*\d|Annex)\b/i;

/** Countries are settled on the first page (incorporation + target markets);
 *  re-asking them here produces the exclusion-list boilerplate above. */
const FIRST_PAGE_GEOGRAPHY = new Set(["entityCountries"]);

/** One question per fund. At 2, EIC Accelerator produced two near-identical
 *  TRL questions from gates in different families (G1_nexus "must be at TRL 5-6
 *  at entry" and G5_use_of_funds "targets TRL 6-8"), which the per-family cap
 *  could not catch. With only ~5 questions in the round, one per fund also
 *  buys strictly better coverage of the shortlist. The overflow pass backfills
 *  if the shortlist is smaller than the limit. */
const MAX_PER_INSTRUMENT = 1;

/**
 * Rank the requirement texts worth turning into a project question for THIS
 * founder's shortlist.
 *
 * Scoring blends three things, because none alone is right:
 *  - `split`  — a requirement every candidate shares cannot help the founder
 *               choose a door. Parabolic proxy for entropy, peaking where half
 *               the shortlist weight carries it. This is the entropy rule from
 *               advisory_pipeline.md Stage C applied to prose, not enums.
 *  - `rank`   — a requirement on the top-ranked candidate is worth asking even
 *               if unique to it: that is the fund most likely to be recommended.
 *  - `reach`  — all else equal, prefer requirements that touch more weight.
 *
 * Weights are a tuning starting point, not a finding (see brief_funnel_v2.md
 * "Risks"). Re-tune against real runs before trusting the order.
 */
export function openProjectGatesForShortlist(
  rankedInstrumentIds: string[],
  answers: EligibilityAnswers | undefined,
  opts: { deprioritiseFields?: string[]; limit?: number } = {},
): ProjectGateEvidence[] {
  const rankOf = new Map(rankedInstrumentIds.map((id, i) => [id, i]));
  const shortlist = loadDbInstruments().filter((i) => rankOf.has(i.id));
  if (!shortlist.length) return [];
  const totalEvents = shortlist.reduce((s, i) => s + (i.eventCount || 1), 0);
  const deprioritise = new Set(opts.deprioritiseFields ?? []);

  interface Acc {
    requirement: string; quote: string; instrumentId: string; instrumentName: string;
    gateKey: string; gateFamily?: string; locator?: string;
    events: number; instruments: Set<string>; bestRank: number; deprioritised: boolean;
  }
  const byText = new Map<string, Acc>();

  for (const inst of shortlist) {
    const rank = rankOf.get(inst.id) ?? 999;
    for (const gate of inst.gates) {
      const req = gate.requirement?.trim();
      if (!req || req.length < MIN_SUBSTANTIVE_LEN) continue;
      // Programme facts and vague prose make poor questions about a company's
      // project; obligations are kept, because "funds must be used for X" is a
      // legitimate thing to ask a founder about their plan.
      if (gate.gateRole === "programme_fact" || gate.gateRole === "vague") continue;
      if (FIRST_PAGE_GEOGRAPHY.has(gate.intakeFieldResolved || gate.intakeField)) continue;
      // A short gate whose field the founder already answered is a pure enum
      // restatement; a long one is genuinely more specific than the checkbox
      // and stays in play (the EIC TRL case).
      if (isAnswered(answers, gate.intakeFieldResolved || gate.intakeField) && req.length < 80) continue;

      const key = normaliseRequirement(req);
      const prev = byText.get(key);
      if (prev) {
        if (!prev.instruments.has(inst.id)) {
          prev.instruments.add(inst.id);
          prev.events += inst.eventCount || 1;
          if (rank < prev.bestRank) {
            prev.bestRank = rank;
            prev.instrumentId = inst.id;
            prev.instrumentName = inst.name;
            prev.gateKey = gate.id;
          }
        }
        continue;
      }
      byText.set(key, {
        requirement: req,
        quote: gate.quote || req,
        instrumentId: inst.id,
        instrumentName: inst.name,
        gateKey: gate.id,
        gateFamily: gate.gateFamily,
        locator: gate.source?.locator || undefined,
        events: inst.eventCount || 1,
        instruments: new Set([inst.id]),
        bestRank: rank,
        deprioritised: deprioritise.has(gate.intakeFieldResolved || gate.intakeField),
      });
    }
  }

  const scored = [...byText.entries()].map(([key, a]) => {
    const p = a.events / totalEvents;                 // share of shortlist weight
    const split = 4 * p * (1 - p);                    // peaks at 1.0 when p = 0.5
    const rankBoost = 1 / (1 + a.bestRank);           // top candidate = 1.0
    const family = FAMILY_WEIGHT[a.gateFamily ?? ""] ?? 0.5;
    const concrete = CONCRETE.test(a.requirement) ? 1.15 : 1;
    let score = family * concrete * (0.4 * split + 0.35 * rankBoost + 0.25 * p);
    // Overlaps a question the generic round is already asking — keep it as a
    // fallback, never as a headline pick.
    if (a.deprioritised) score *= 0.5;
    return {
      key,
      requirement: a.requirement,
      quote: a.quote,
      instrumentId: a.instrumentId,
      instrumentName: a.instrumentName,
      gateKey: a.gateKey,
      gateFamily: a.gateFamily,
      locator: a.locator,
      nInstruments: a.instruments.size,
      reachPct: Math.round(1000 * p) / 10,
      score: Math.round(1000 * score) / 1000,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  if (!opts.limit) return scored;

  // Greedy pick with a per-instrument cap, so the highest-event fund cannot
  // sweep every slot. Falls back to filling any remaining slots from the
  // overflow rather than returning short.
  const picked: ProjectGateEvidence[] = [];
  const perInstrument = new Map<string, number>();
  // One question per instrument PER FAMILY: without this, an instrument with
  // several G5_use_of_funds gates yields two near-identical questions about
  // eligible project costs, which reads as a broken form.
  const perInstrumentFamily = new Set<string>();
  const overflow: ProjectGateEvidence[] = [];
  for (const cand of scored) {
    if (picked.length >= opts.limit) break;
    const n = perInstrument.get(cand.instrumentId) ?? 0;
    const famKey = `${cand.instrumentId}::${cand.gateFamily ?? "?"}`;
    if (n >= MAX_PER_INSTRUMENT || perInstrumentFamily.has(famKey)) { overflow.push(cand); continue; }
    perInstrument.set(cand.instrumentId, n + 1);
    perInstrumentFamily.add(famKey);
    picked.push(cand);
  }
  for (const cand of overflow) {
    if (picked.length >= opts.limit) break;
    picked.push(cand);
  }
  return picked;
}

/** Distinct source_family_bucket count among the shortlist — a proxy for
 *  "how many genuinely different families are still in play." Used by the
 *  stopping rule alongside reachPct. */
export function distinctFamilyCount(instrumentIds: string[]): number {
  const ids = new Set(instrumentIds);
  const buckets = new Set(
    loadDbInstruments()
      .filter((i) => ids.has(i.id) && i.sourceFamilyBucket)
      .map((i) => i.sourceFamilyBucket as string),
  );
  return buckets.size;
}

/** What is still unresolved about ONE candidate fund. */
export interface FundStake {
  instrumentId: string;
  name: string;
  country: string;
  /** Plain field names and verbatim requirements still open on THIS fund. */
  open: { field?: string; requirement: string }[];
}

/**
 * Regroup the open evidence by FUND rather than by field.
 *
 * Both existing builders answer "which fields are still open across the
 * shortlist", which is the right question for coverage and the wrong one for
 * choosing what to ask. An analyst does not ask about a field with high reach;
 * they ask the question that decides between the two funds actually in front
 * of the founder. That requires knowing which fund each open question belongs
 * to, which neither builder returns.
 *
 * Nothing new is extracted: this is the same evidence, pivoted.
 */
export function stakesByFund(
  instrumentIds: string[],
  answers: EligibilityAnswers | undefined,
  limit = 8,
): FundStake[] {
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const out: FundStake[] = [];
  for (const id of instrumentIds.slice(0, limit)) {
    const inst = byId.get(id);
    if (!inst) continue;
    const open: { field?: string; requirement: string }[] = [];
    for (const gate of inst.gates) {
      if (gate.gateRole && gate.gateRole !== "filter") continue;
      const field = gate.intakeFieldResolved || gate.intakeField;
      // Already answered, or not something an intake answer can settle.
      if (field && field !== "none" && isAnswered(answers, field)) continue;
      if (!gate.requirement) continue;
      open.push({ field: field && field !== "none" ? field : undefined, requirement: gate.requirement });
      if (open.length >= 4) break;
    }
    if (open.length) {
      out.push({ instrumentId: inst.id, name: inst.name, country: inst.country, open });
    }
  }
  return out;
}
