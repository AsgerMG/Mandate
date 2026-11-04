// Live, per-request reach scoring — the TS twin of
// ETL/terms/aggregate_intake_usage.py's formula, but scoped to a single
// founder's actual candidate-instrument shortlist instead of the whole
// corpus. This is what grounds the adaptive round (Phase 3C) in gates that
// are genuinely still open for THIS founder, not a blind sweep of 320
// instruments' worth of requirements.
import { loadDbInstruments, type DbInstrument } from "./corpus";
import { FIELD_ENUM_HINTS, FIRST_PAGE_FIELDS, type EligibilityAnswers } from "./types";
import { deliveryRegionOf } from "./regionPrior";
// ONE name for a fund, wherever the page names it. The table appended the
// granting body and this file did not, so a founder read one leaf under two
// names on one screen. See doorLabel.ts -- and note it is the SAME function the
// table calls, not a second spelling of the same intention.
import { doorLabelFor } from "./doorLabel";
/** The fund's name as the founder will see it in the table above the question.
 *  Unconditional: a question that cites a fund by a name the table above it does
 *  not use is the defect this exists to make impossible, and a fix behind a
 *  switch is a fix that never runs. */
const shownName = (inst: DbInstrument) => doorLabelFor(inst);
import { regionNameFor } from "./regions.generated";
import {
  MIN_SUBSTANTIVE_LEN, normaliseRequirement, requirementClassOf,
  OPEN_QUESTION_ARM, OPEN_QUESTION_BUDGET,
} from "./openQuestions";

// Fields already resolved on the deterministic first page — never re-asked
// adaptively, regardless of how much gate reach they still carry. The set is
// now DERIVED from FIELD_REACH in types.ts, which is the one declaration of
// how every intake field gets answered; it used to be a second hand-kept list
// of the same fact, sitting one import away from the first.
//
// Shrunk from 11 to 5 on 2026-07-29. The first screen now asks only what is
// needed to BUILD a shortlist at all — where you are, what you build, how big
// you are, how much you want, how far along you are. Everything else moved
// into the adaptive round, where it is asked only when a fund on THIS
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

export interface OpenFieldEvidence {
  field: string;
  /** Share of the shortlist's event_count still gated on this field, 0-100. */
  reachPct: number;
  /** Share of the gates on this field that demand something DIFFERENT, 0-1.
   *  1.0 = every fund wants something else; near 0 = they all want the same
   *  thing, so the answer separates nobody. */
  distinctness: number;
  /** reachPct * distinctness — how much a founder's answer can actually
   *  narrow THIS shortlist. The ranking key; see the note at the sort. */
  infoScore: number;
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

  const byField = new Map<string, {
    events: number;
    instruments: Set<string>;
    examples: { instrument: string; requirement: string }[];
    /** Distinct demands made on this field across the shortlist. */
    specs: Set<string>;
    /** Gates asking about this field, the denominator for distinctness. */
    gateCount: number;
  }>();
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
      // A field whose options are derived (region) is only askable once we can
      // actually derive them. With no country on record there is nothing to
      // offer, and an empty question is worse than none.
      const hintFor = FIELD_ENUM_HINTS[field];
      if (hintFor.optionsFor && hintFor.optionsFor(answers ?? {}).length === 0) continue;
      // A field whose fact is already an option on another field's question
      // does not earn a second slot. A live screen asked whether accumulated
      // losses exceeded half of share capital as its own question while the
      // exclusions question above it already offered exactly that as an
      // option, so the founder answered the same thing twice.
      const covered = FIELD_ENUM_HINTS[field].coveredBy;
      if (covered && !isAnswered(answers, covered)) continue;
      if (isAnswered(answers, field)) continue;
      const entry = byField.get(field)
        ?? { events: 0, instruments: new Set<string>(), examples: [], specs: new Set<string>(), gateCount: 0 };
      // Every gate on this field contributes its demand, even a second one on
      // an instrument already counted: distinctness is about how many
      // DIFFERENT things the shortlist asks for, not how many funds ask.
      entry.gateCount += 1;
      entry.specs.add(JSON.stringify(gate.valueSpec ?? gate.value ?? gate.requirement ?? ""));
      if (!entry.instruments.has(inst.id)) {
        entry.events += inst.eventCount || 1;
        entry.instruments.add(inst.id);
        if (entry.examples.length < 3 && gate.requirement) {
          entry.examples.push({ instrument: shownName(inst), requirement: gate.requirement });
        }
      }
      byField.set(field, entry);
    }
  }

  // ── Region, which the gate layer cannot see ──────────────────────────────
  // Everything above is driven by encoded gates, and region is the one field
  // where that is a dead end rather than a coverage gap: only 148 of 958
  // instruments carry a `region_within` rule, and the sibling groups where
  // region is the ONLY discriminator have none at all (ademe 0/75, vinnova
  // 0/49, satr_fr_rnd 0/42). They are one notified scheme delivered by many
  // bodies, so they inherit one set of gates by construction. Waiting for the
  // gate layer to describe them is waiting for an encoding that cannot exist.
  //
  // The award record describes them instead. regionPrior.generated.json holds
  // each fund's measured recipient footprint, so "would knowing the region
  // narrow this shortlist" is answerable without a single rule being written:
  // reach is the share of the shortlist that has a regional claim at all, and
  // distinctness is how many DIFFERENT places those claims point to. A
  // shortlist of national schemes therefore still scores near zero, which is
  // correct -- there the question genuinely separates nobody.
  if (!isAnswered(answers, "region")
      && (FIELD_ENUM_HINTS.region?.optionsFor?.(answers ?? {}) ?? []).length > 0) {
    let events = 0;
    const places = new Set<string>();
    const examples: { instrument: string; requirement: string }[] = [];
    for (const inst of shortlist) {
      const where = deliveryRegionOf(inst.id);
      if (!where) continue;
      events += inst.eventCount || 1;
      places.add(where);
      if (examples.length < 3) {
        examples.push({
          instrument: shownName(inst),
          requirement: `its recipients are in ${regionNameFor(where) ?? where}`,
        });
      }
    }
    if (places.size > 1) {
      const existing = byField.get("region");
      byField.set("region", {
        events: Math.max(events, existing?.events ?? 0),
        instruments: new Set([...(existing?.instruments ?? []),
          ...shortlist.filter((i) => deliveryRegionOf(i.id)).map((i) => i.id)]),
        examples: existing?.examples.length ? existing.examples : examples,
        // One "demand" per distinct delivery region, so distinctness comes out
        // as the share of the regional shortlist pointing somewhere different
        // -- the same quantity the gate path computes, from evidence instead of
        // from rules.
        specs: new Set([...(existing?.specs ?? []), ...places]),
        gateCount: (existing?.gateCount ?? 0) + places.size,
      });
    }
  }

  return [...byField.entries()]
    .map(([field, v]) => {
      const reachPct = Math.round((1000 * v.events) / totalEvents) / 10;
      // How many DIFFERENT demands the shortlist makes on this field, as a
      // share of the gates asking about it. 1.0 means every fund wants
      // something different; near 0 means they all want the same thing.
      const distinctness = v.gateCount ? v.specs.size / v.gateCount : 0;
      return {
        field,
        reachPct,
        distinctness: Math.round(distinctness * 100) / 100,
        // ── Rank on INFORMATION, not coverage ──────────────────────────────
        // This used to sort on reachPct alone, and that is why the adaptive
        // round could not separate siblings. Measured across 25 holdout
        // replays, reach and discrimination are INVERSELY correlated:
        //
        //   field            reach%   distinct-spec ratio
        //   exclusionFlags    82.8         0.11
        //   nonEuControl      55.1         0.18
        //   ownerOver25       30.9         0.55
        //   needBy            12.6         1.00
        //   region             2.9         0.57
        //   turnoverBand       1.1         1.00
        //
        // The six fields that won every slot reach almost the whole shortlist
        // and demand the SAME thing of nearly all of it -- every fund wants a
        // founder not in crisis and not under a recovery order. Asking
        // eliminates nobody. Meanwhile the fields where every fund differs
        // (needBy, turnoverBand, and region, which is the one input that
        // genuinely splits siblings sharing a notified framework) ranked 7th
        // and below against a 6-slot cap, so they were never asked.
        //
        // A question everyone answers identically carries no information. So
        // the score is reach WEIGHTED BY how much the answer can actually
        // split the shortlist. Reach still matters -- a discriminating
        // question about one tiny fund is not worth a founder's attention --
        // which is why this is a product, not a replacement.
        infoScore: Math.round(reachPct * distinctness * 10) / 10,
        nInstruments: v.instruments.size,
        examples: v.examples,
      };
    })
    .sort((a, b) => b.infoScore - a.infoScore || b.reachPct - a.reachPct);
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

// MIN_SUBSTANTIVE_LEN and normaliseRequirement moved to openQuestions.ts and
// are imported at the top of this file. They used to be declared here and
// again, verbatim, in the emitter that classifies the same sentences — the
// exact "keep in sync" shape this repo has been burned by three times. One
// declaration, three readers.

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
            prev.instrumentName = shownName(inst);
            prev.gateKey = gate.id;
          }
        }
        continue;
      }
      byText.set(key, {
        requirement: req,
        quote: gate.quote || req,
        instrumentId: inst.id,
        instrumentName: shownName(inst),
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

// ── Open questions (wsCD) ──────────────────────────────────────────────────
//
// Everything above can only ask about a requirement that already has a fixed
// answer set. This asks about the ones that never will: requirements whose
// satisfaction is a judgement about what THIS project is, classified
// `judgeable` by `emit_open_question_class.ts`. See `openQuestions.ts` for the
// property, the test that decides it, and the two structural guarantees that
// stop a wrong judgement from becoming a rejection.

export interface OpenQuestionCandidate {
  /** `normaliseRequirement` of the gate text. The judgement key. */
  key: string;
  /** Verbatim requirement text — what the question must be written FROM, and
   *  what the judge reads the founder's answer against. Never shown as an
   *  option: a phrase lifted from a legal text fails Q-1. */
  requirement: string;
  /** Highest-ranked carrier, the citation anchor. */
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  locator?: string;
  /** The regime (parent, or the leaf itself) whose siblings this splits. */
  regimeId: string;
  /** Leaves in that regime, and how many of them carry this requirement. */
  regimeSize: number;
  carriers: number;
  /** How much answering this would separate THIS founder's shortlist. */
  score: number;
}

/**
 * Rank the open questions worth a slot on THIS founder's screen, and cap them.
 *
 * ── Why the ranking is about SIBLINGS and not about reach ─────────────────
 * The answer to an open question lands in `openFitScorer`, which is multiplied
 * into `pref` in `materialiseInstrumentTable`. That site is rank-preserving:
 * a channel keeps its multiset of row scores and only the assignment among its
 * siblings changes. So a requirement carried by EVERY sibling of a regime
 * cannot move anything, however much of the shortlist it reaches, and a
 * requirement carried by NO sibling group at all is worth exactly zero. Reach
 * is the wrong quantity here; the right one is how evenly the requirement
 * splits the sibling groups that are actually in play.
 *
 * That is the same lesson `openFieldsForShortlist` learned when it stopped
 * sorting on `reachPct` — a question everyone answers identically carries no
 * information — applied to the site where this particular answer lands.
 *
 * ── Why there is a budget at all ──────────────────────────────────────────
 * "95% if we ask forty things" is not a product. The screen's whole purpose is
 * to keep stage 2 to the few questions that matter, so open questions are
 * capped and must compete: `OPEN_QUESTION_BUDGET` of the screen's six slots,
 * one per regime, so the questions asked point at DIFFERENT forks rather than
 * three ways of asking about the same one.
 *
 * Returns [] with the arm off, so nothing downstream needs to know about it.
 */
export function openQuestionsForShortlist(
  rankedInstrumentIds: string[],
  answers: EligibilityAnswers | undefined,
  opts: { budget?: number } = {},
): OpenQuestionCandidate[] {
  void answers; // an open question is about the PROJECT; no intake field settles it
  if (OPEN_QUESTION_ARM !== "on") return [];
  const budget = opts.budget ?? OPEN_QUESTION_BUDGET;
  if (budget <= 0) return [];

  const rankOf = new Map(rankedInstrumentIds.map((id, i) => [id, i]));
  const shortlist = loadDbInstruments().filter((i) => rankOf.has(i.id));
  if (!shortlist.length) return [];

  // Group the shortlist the way the scorer will: by regime. A leaf standing
  // alone in its regime is skipped here for the same reason the scorer skips
  // it — nothing it carries can reorder anything.
  const byRegime = new Map<string, typeof shortlist>();
  for (const inst of shortlist) {
    const r = inst.parentId ?? inst.id;
    (byRegime.get(r) ?? byRegime.set(r, []).get(r)!).push(inst);
  }

  interface Acc {
    requirement: string; instrumentId: string; instrumentName: string;
    gateKey: string; locator?: string; regimeId: string;
    regimeSize: number; carriers: number; bestRank: number; score: number;
  }
  const best = new Map<string, Acc>();

  for (const [regimeId, group] of byRegime) {
    if (group.length < 2) continue;
    // How high this regime sits for this founder. A fork between two funds
    // nobody would pursue is worth little; a fork at the top of the table is
    // the question an analyst would actually ask.
    const regimeRank = Math.min(...group.map((i) => rankOf.get(i.id) ?? 999));
    const weight = 1 / (1 + regimeRank);

    const carriers = new Map<string, { n: number; anchor: typeof group[number]; gate: { id: string; requirement: string; source?: { locator?: string } } }>();
    for (const inst of group) {
      const seen = new Set<string>();
      for (const gate of inst.gates) {
        if (gate.gateRole && gate.gateRole !== "filter") continue;
        const req = gate.requirement?.trim();
        if (!req || req.length < MIN_SUBSTANTIVE_LEN) continue;
        // The whole point of the module: only requirements that are fuzzy BY
        // NATURE. A threshold nobody has encoded is an encoding debt, and
        // asking a founder to answer it in prose is worse than a comparator.
        if (requirementClassOf(req) !== "judgeable") continue;
        const key = normaliseRequirement(req);
        if (seen.has(key)) continue;
        seen.add(key);
        const prev = carriers.get(key);
        if (prev) {
          prev.n += 1;
          if ((rankOf.get(inst.id) ?? 999) < (rankOf.get(prev.anchor.id) ?? 999)) {
            prev.anchor = inst;
            prev.gate = gate as never;
          }
        } else {
          carriers.set(key, { n: 1, anchor: inst, gate: gate as never });
        }
      }
    }

    for (const [key, c] of carriers) {
      const p = c.n / group.length;
      // Parabolic split: 1.0 where the requirement halves the regime, 0 where
      // every sibling carries it (or none does). A demand every sibling makes
      // separates nobody, which is exactly the case this must score at zero.
      const split = 4 * p * (1 - p);
      if (split <= 0) continue;
      const score = split * weight;
      const prev = best.get(key);
      if (prev && prev.score >= score) {
        // Same sentence, another regime: keep the better fork but let the
        // score accumulate, because a requirement that splits two regimes is
        // worth more than one that splits one.
        prev.score += score;
        continue;
      }
      best.set(key, {
        requirement: c.gate.requirement.trim(),
        instrumentId: c.anchor.id,
        instrumentName: shownName(c.anchor),
        gateKey: c.gate.id,
        locator: c.gate.source?.locator || undefined,
        regimeId,
        regimeSize: group.length,
        carriers: c.n,
        bestRank: regimeRank,
        score: (prev?.score ?? 0) + score,
      });
    }
  }

  const scored = [...best.entries()]
    .map(([key, a]) => ({
      key,
      requirement: a.requirement,
      instrumentId: a.instrumentId,
      instrumentName: a.instrumentName,
      gateKey: a.gateKey,
      locator: a.locator,
      regimeId: a.regimeId,
      regimeSize: a.regimeSize,
      carriers: a.carriers,
      score: Math.round(a.score * 1000) / 1000,
    }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  // One question per regime, so the budget buys coverage of DIFFERENT forks
  // rather than three phrasings of one. Overflow backfills only if there are
  // fewer distinct regimes than slots.
  const picked: OpenQuestionCandidate[] = [];
  const usedRegimes = new Set<string>();
  const overflow: OpenQuestionCandidate[] = [];
  for (const cand of scored) {
    if (picked.length >= budget) break;
    if (usedRegimes.has(cand.regimeId)) { overflow.push(cand); continue; }
    usedRegimes.add(cand.regimeId);
    picked.push(cand);
  }
  for (const cand of overflow) {
    if (picked.length >= budget) break;
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
      out.push({ instrumentId: inst.id, name: shownName(inst), country: inst.country, open });
    }
  }
  return out;
}
