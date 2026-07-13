// The deterministic eligibility evaluator — advisory_pipeline Stage D, v1.
//
// Pure functions over the exported term records (public/data/instrument_terms.json,
// written by website/build/instrument_terms_export.py from the two-pass-verified
// YAML gates). NO model call anywhere in this file — this is the trust anchor:
// the memo's verdict rows are computed, cited, and reproducible. The writer may
// narrate them; it can never mint or edit one.
//
// v1 scope: framework-level checks grounded in the EU texts we hold verified
// (GBER Annex I SME test, Art. 2(18) in-difficulty, Art. 25 intensities, the
// IPCEI Communication, InvestEU intermediary architecture, de minimis).
// Instrument-level rows (KfW, Bpifrance, Fondo di Garanzia…) join as their
// primary documents get fetched and verified.
import { readFileSync } from "fs";
import path from "path";
import type { EligibilityAnswers, EligibilityCheck } from "./types";

interface TermGate {
  id: string;
  requirement: string;
  value: string;
  intakeField: string;
  quote: string;
  source: { file: string; locator: string };
  verified: boolean;
}
interface TermRecord {
  id: string;
  name: string;
  gates: TermGate[];
}

let termsCache: TermRecord[] | null | undefined;

function loadTerms(): TermRecord[] | null {
  if (termsCache === undefined) {
    try {
      const file = path.join(process.cwd(), "public", "data", "instrument_terms.json");
      termsCache = (JSON.parse(readFileSync(file, "utf8")) as { records: TermRecord[] }).records;
    } catch {
      termsCache = null;
    }
  }
  return termsCache;
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
export function evaluateEligibility(e?: EligibilityAnswers): EligibilityCheck[] {
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

  return out;
}
