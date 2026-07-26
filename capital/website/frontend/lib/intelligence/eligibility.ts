// The deterministic eligibility evaluator — advisory_pipeline Stage D.
//
// Pure functions over the exported term records (public/data/instrument_terms.json,
// written by website/build/eligibility_export.py from the DB-native
// funding_instruments/eligibility_gates tables — migration 011. NO model call
// anywhere in this file — this is the trust anchor: the memo's verdict rows
// are computed, cited, and reproducible. The writer may narrate them; it can
// never mint or edit one.
//
// Two layers, additive:
//  1. Hand-written framework checks (below) — genuinely bespoke multi-field
//     branching (e.g. the SME-status check combines four fields into one
//     nuanced finding) that doesn't compress into a generic comparator.
//  2. A generic loop (bottom of the file) over every gate that carries a
//     machine-evaluable valueSpec — the mechanism that scales past the ~10
//     hand-written instruments to the full 320+-instrument inventory as
//     Tier 1 (llm_classified) and Tier 2 (llm_2pass) research populates
//     valueSpec. A gate below llm_2pass/human_verified can only ever produce
//     "likely_met"/"likely_not_met", never an asserted "met"/"not_met".
import { loadDbInstruments, type DbInstrument } from "./corpus";
import type { EligibilityAnswers, EligibilityCheck } from "./types";

type ValueSpec =
  | { op: "band_max"; field: string; maxAllowed: string; order: string[] }
  // band_min added 2026-07-26 with ETL/terms/encode_gates.py: floors are as
  // common as ceilings in real rules ("must already show a prototype",
  // "minimum TRL 4") and could not be expressed before.
  | { op: "band_min"; field: string; minAllowed: string; order: string[] }
  | { op: "in"; field: string; allowed: string[] }
  // not_in: exclusion lists are pervasive in EU rules ("entities established
  // in Russia, Belarus... are not eligible") and inverting them by hand into
  // an `in` list of every permitted country is both lossy and unmaintainable.
  | { op: "not_in"; field: string; allowed: string[] }
  | { op: "equals"; field: string; value: string }
  | { op: "boolean_true" | "boolean_false"; field: string }
  | { op: "numeric_gte" | "numeric_lte"; field: string; threshold: number };

// TermGate/TermRecord are gone — this file now reads DbInstrument/DbGate
// straight from corpus.ts's shared loader (one parse of instrument_terms.json
// per warm invocation, not one per module). ValueSpec stays local: corpus.ts
// carries it as `unknown` since it's just a data-transport type there.
type TermRecord = DbInstrument;

function loadTerms(): TermRecord[] | null {
  const records = loadDbInstruments();
  return records.length ? records : null;
}

/** Best citation for a check: a verified gate on the given record matching one
 *  of the intake fields (order matters: first match wins). */
function cite(
  records: TermRecord[],
  recordId: string,
  fields: string[],
): { source: { file: string; locator: string }; verified: boolean } {
  const rec = records.find((r) => r.id === recordId);
  for (const f of fields) {
    const g = rec?.gates.find((g) => g.verified && g.intakeField === f);
    if (g) return { source: g.source, verified: true };
  }
  const any = rec?.gates.find((g) => g.verified) ?? rec?.gates[0];
  return { source: any?.source ?? { file: "", locator: "" }, verified: Boolean(any?.verified) };
}

/**
 * Evaluate the intake profile against the verified framework gates.
 * Every row: computed status + declarative finding + cure when failing +
 * primary-text citation. Rows whose citation is unverified render as
 * "verify:" downstream and are never asserted.
 */
export function evaluateEligibility(
  e?: EligibilityAnswers,
  /** Restrict the per-instrument half of the screen to these instruments.
   *
   *  Before value_spec was populated the generic loop produced nothing, so
   *  scope did not matter. It now produces ~350 rows across all 322
   *  instruments, which rendered as a 35,000-pixel wall and buried the memo.
   *  Per-instrument qualification belongs on the institution rows (verdict.ts);
   *  this screen should show the framework checks plus the rules behind the
   *  funds actually being recommended. Omit to keep the old whole-corpus
   *  behaviour. */
  scopeInstrumentIds?: string[],
): EligibilityCheck[] {
  const records = loadTerms();
  if (!records || !e) return [];
  const out: EligibilityCheck[] = [];

  // ── EU SME status (GBER Annex I) ────────────────────────────────────────
  if (e.fteBand || e.turnoverBand || e.balanceBand) {
    const c = cite(records, "eu_sme_definition", ["fteBand", "turnoverBand", "balanceBand"]);
    const fteFail = e.fteBand === "250+";
    const finFail = e.turnoverBand === ">50M" && e.balanceBand === ">43M";
    let status: EligibilityCheck["status"];
    let finding: string;
    let cure: string | undefined;
    if (fteFail || finFail) {
      status = "not_met";
      finding = fteFail
        ? "At 250+ staff the company exceeds the EU SME headcount ceiling; SME-only lanes (EIC, SME windows, SME aid bonuses) are closed."
        : "Turnover above EUR 50M and balance sheet above EUR 43M together exceed the SME financial ceilings.";
      cure = "Mid-cap and large-company lanes remain (EIB growth, Innovation Fund, IPCEI); no realistic cure to SME status itself.";
    } else if (e.ownerOver25 === "yes") {
      status = "unknown";
      finding =
        "Headcount and financials sit within SME ceilings, but an owner at 25%+ means linked or partner enterprises may count toward the thresholds; the consolidated test decides.";
      cure = "Run the Annex I linked-enterprise computation on the group chart before any SME-gated application.";
    } else {
      status = "met";
      finding = "Within the EU SME definition on the stated bands (headcount under 250 and financial ceilings respected).";
    }
    out.push({ check: "EU SME status", status, finding, cure, ...c });
  }

  // ── Undertaking in difficulty (GBER Art. 2(18)) ─────────────────────────
  if (e.lossesOverHalfCapital) {
    const c = cite(records, "eu_undertaking_in_difficulty", ["lossesOverHalfCapital", "conditionality"]);
    if (e.lossesOverHalfCapital === "yes") {
      out.push({
        check: "Undertaking-in-difficulty exclusion",
        status: "not_met",
        finding:
          "Accumulated losses exceeding half of subscribed share capital place the company in the GBER in-difficulty definition; most state aid is blocked while this holds.",
        cure: "Restore equity (conversion of shareholder loans, a capital increase) before applying under GBER schemes.",
        ...c,
      });
    } else if (e.lossesOverHalfCapital === "no") {
      out.push({
        check: "Undertaking-in-difficulty exclusion",
        status: "met",
        finding: "Not in difficulty on the share-capital limb; the GBER exclusion does not bite.",
        ...c,
      });
    } else {
      out.push({
        check: "Undertaking-in-difficulty exclusion",
        status: "unknown",
        finding: "The in-difficulty test is unresolved; it silently blocks most GBER aid when failed.",
        cure: "Have the accountant confirm accumulated losses against subscribed capital before any state-aid application.",
        ...c,
      });
    }
  }

  // ── Grant co-financing (GBER Art. 25 intensities) ────────────────────────
  if (e.cofinancingBand) {
    const c = cite(records, "eu_gber_rd_intensities", ["cofinancingBand", "developmentStage"]);
    if (e.cofinancingBand === "<25%") {
      out.push({
        check: "Grant co-financing capacity",
        status: "not_met",
        finding:
          "R&D aid intensities cap public support (industrial research 50%, experimental development 25%, plus SME bonuses); below 25% own funding the major grant lanes do not close financially.",
        cure: "Pair a grant with a loan/guarantee leg or equity to carry the own-share, or target de minimis-scale schemes.",
        ...c,
      });
    } else {
      out.push({
        check: "Grant co-financing capacity",
        status: "met",
        finding:
          "Stated co-financing capacity covers the own-share that R&D aid-intensity ceilings leave with the company.",
        ...c,
      });
    }
  }

  // ── Consortium instruments ───────────────────────────────────────────────
  if (e.consortium) {
    const c = cite(records, "eu_gber_rd_intensities", ["consortium"]);
    if (e.consortium === "no") {
      out.push({
        check: "Consortium-based instruments",
        status: "not_met",
        finding:
          "Without consortium participation, the collaboration-based lanes (Horizon consortia, Joint Undertakings, collaboration bonuses) drop out of the shortlist.",
        cure: "Single-applicant lanes remain (EIC, national grants, guarantees, venture debt); revisit if a consortium invitation appears.",
        ...c,
      });
    } else if (e.consortium === "yes") {
      out.push({
        check: "Consortium-based instruments",
        status: "met",
        finding: "Consortium-ready: the Horizon/JU family and collaboration bonuses stay on the table.",
        ...c,
      });
    }
  }

  // ── IPCEI scale & stage (2021 Communication) ─────────────────────────────
  if (e.ticketBand || e.developmentStage) {
    const c = cite(records, "eu_ipcei", ["developmentStage", "ticketBand", "consortium"]);
    const bigTicket = e.ticketBand === "b15m_50m" || e.ticketBand === "gt50m";
    const beyondResearch = e.developmentStage !== "research";
    if (bigTicket && beyondResearch) {
      out.push({
        check: "IPCEI-class projects",
        status: "unknown",
        finding:
          "Scale and stage are IPCEI-compatible (first industrial deployment beyond research, large ticket); qualification then turns on member-state sponsorship and a demonstrable funding gap.",
        cure: "Sound out the national ministry running the next relevant IPCEI wave; sponsorship is the entry ticket.",
        ...c,
      });
    } else if (e.ticketBand && !bigTicket) {
      out.push({
        check: "IPCEI-class projects",
        status: "not_met",
        finding: "The stated ticket sits below IPCEI scale; the instrument is not a realistic lane for this raise.",
        ...c,
      });
    }
  }

  // ── Intermediary route (InvestEU architecture) ───────────────────────────
  if (e.borrowerModel === "balance_sheet_lender" || e.borrowerModel === "originator") {
    const c = cite(records, "eu_investeu_intermediary", ["borrowerModel", "bankRelationship"]);
    out.push({
      check: "Financial-intermediary route (InvestEU/EIF)",
      status: "info",
      finding:
        e.borrowerModel === "originator"
          ? "As an originator, the working routes are a partner bank holding an EIF/InvestEU guarantee and the securitisation window; the partner's accreditation matters as much as your own profile."
          : "As a balance-sheet lender, portfolio counter-guarantees and accreditation as a financial intermediary under the SME window are the structural fit.",
      cure:
        e.bankRelationship === "no"
          ? "First step: establish the lending-bank or intermediary relationship; every guarantee product routes through one."
          : undefined,
      ...c,
    });
  }

  // ── De minimis headroom (always, informational) ──────────────────────────
  {
    const c = cite(records, "eu_de_minimis", ["ownerOver25"]);
    out.push({
      check: "De minimis headroom",
      status: "info",
      finding:
        "Small national schemes typically run under the de minimis ceiling of EUR 300,000 over three years, counted across the whole group; prior aid in our register counts toward it.",
      ...c,
    });
  }

  const scoped = scopeInstrumentIds?.length
    ? records.filter((r) => scopeInstrumentIds.includes(r.id))
    : records;
  out.push(...evaluateGenericGates(scoped, e));

  return out;
}

/** Ordinal comparison helper for band_max: is `answer` at or below `maxAllowed` in `order`? */
function bandAtOrBelow(order: string[], answer: string, maxAllowed: string): boolean | null {
  const ai = order.indexOf(answer);
  const mi = order.indexOf(maxAllowed);
  if (ai === -1 || mi === -1) return null;
  return ai <= mi;
}

function bandAtOrAbove(order: string[], answer: string, minAllowed: string): boolean | null {
  const ai = order.indexOf(answer);
  const mi = order.indexOf(minAllowed);
  if (ai === -1 || mi === -1) return null;
  return ai >= mi;
}

/**
 * Does the founder's answer hit any of `allowed`? Handles both shapes an
 * EligibilityAnswers field can take: a single value (developmentStage) and a
 * list (entityCountries, activityCountries, conditionality). Case-insensitive,
 * because encoded country lists are written as full English names while intake
 * values arrive however the picker supplied them.
 *
 * Returns null — "unknown", never "fails" — when the founder simply hasn't
 * answered, so an unanswered question can never read as a disqualification.
 */
/**
 * Values that mean "I don't know", not an answer. They MUST evaluate to null.
 *
 * Every yes/no intake field offers "Not sure", and comparing it literally
 * returned false — so hedging on one question read as FAILING it. That single
 * behaviour produced a false blocker on 12 of 12 test archetypes: the honest
 * answer was punished, and funds were hidden from founders who simply had not
 * decided yet.
 */
const NON_ANSWERS = new Set(["unsure", "not sure", "unknown", "n/a", "na", "depends"]);

function matchesAny(answer: unknown, allowed: string[]): boolean | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const wanted = new Set(allowed.map(norm));
  if (typeof answer === "string") {
    if (!answer.trim() || NON_ANSWERS.has(norm(answer))) return null;
    return wanted.has(norm(answer));
  }
  if (Array.isArray(answer)) {
    const vals = answer.filter(
      (a): a is string => typeof a === "string" && Boolean(a.trim()) && !NON_ANSWERS.has(norm(a)),
    );
    return vals.length ? vals.some((a) => wanted.has(norm(a))) : null;
  }
  return null;
}

/** Evaluate one gate's valueSpec against the founder's answer. Returns null
 *  when the spec references a field the answer doesn't have a usable form
 *  for (renders as "unknown" upstream, never guessed). */
function evalComparator(spec: ValueSpec, answer: unknown): boolean | null {
  switch (spec.op) {
    case "band_max":
      return typeof answer === "string" ? bandAtOrBelow(spec.order, answer, spec.maxAllowed) : null;
    case "band_min":
      return typeof answer === "string" ? bandAtOrAbove(spec.order, answer, spec.minAllowed) : null;
    // Several intake fields are multi-value (entityCountries, activityCountries,
    // conditionality). Treating only strings meant the single most common
    // encoded gate — "must be established in <country>" — silently returned
    // "unknown" for every founder, because their answer is an array.
    case "in":
      return matchesAny(answer, spec.allowed);
    case "not_in": {
      const hit = matchesAny(answer, spec.allowed);
      return hit === null ? null : !hit;
    }
    case "equals":
      return typeof answer === "string" ? answer === spec.value : null;
    case "boolean_true":
      return answer === "yes" ? true : answer === "no" ? false : null;
    case "boolean_false":
      return answer === "no" ? true : answer === "yes" ? false : null;
    case "numeric_gte":
      return typeof answer === "number" ? answer >= spec.threshold : null;
    case "numeric_lte":
      return typeof answer === "number" ? answer <= spec.threshold : null;
    default:
      return null;
  }
}

/**
 * The generic loop: scales the evaluator past the ~10 hand-written framework
 * checks above to every instrument in the DB-native inventory (320+ and
 * growing) without a new out.push() block per instrument. Only fires for
 * gates that are BOTH machine-evaluable (a populated valueSpec) AND answered
 * by the founder — a gate with no valueSpec yet (the norm today: Tier 0/0.5
 * inventory rows and most Tier 1 classifications are prose-only) is silently
 * skipped here rather than rendered as a global "unknown" row, since nothing
 * yet scopes 320 instruments down to the ones actually relevant to a given
 * founder's country/instrument fit — that scoping is future work once
 * funding_instruments.source_family_bucket is wired into the memo pipeline.
 */
function evaluateGenericGates(records: TermRecord[], e?: EligibilityAnswers): EligibilityCheck[] {
  if (!e) return [];
  const out: EligibilityCheck[] = [];
  for (const inst of records) {
    for (const gate of inst.gates) {
      // Only a triaged FILTER may decide a verdict. Obligations ("works must
      // not start before the grant decision") and programme facts ("aid
      // intensity capped at 20%") are real information, but they say nothing
      // about who qualifies — and roughly half the corpus is one of those two.
      // Gates not yet triaged (gateRole undefined) still evaluate, so this
      // degrades safely while encoding is in progress.
      if (gate.gateRole && gate.gateRole !== "filter") continue;
      // intakeFieldResolved is the curated field; intakeField is the
      // extractor's guess and was measured wrong on ~half to two-thirds of a
      // sample. Prefer the curated one, fall back only when untriaged.
      const field = gate.intakeFieldResolved || gate.intakeField;
      if (!field || field === "none" || !gate.valueSpec) continue;
      const answer = (e as Record<string, unknown>)[field];
      if (answer === undefined || answer === null || answer === "") continue;
      const result = evalComparator(gate.valueSpec as ValueSpec, answer);
      const level = gate.verificationLevel ?? "inventory_inferred";
      const hard = level === "llm_2pass" || level === "human_verified";
      const status: EligibilityCheck["status"] =
        result === null ? "unknown" : hard ? (result ? "met" : "not_met") : (result ? "likely_met" : "likely_not_met");
      out.push({
        check: `${inst.name} — ${gate.requirement}`,
        instrumentId: inst.id,
        status,
        finding: gate.requirement,
        source: gate.source,
        verified: hard && result !== null,
      });
    }
  }
  return out;
}
