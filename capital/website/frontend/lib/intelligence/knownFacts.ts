// What we already know about this founder, in one place.
//
// ── Why this is shared ─────────────────────────────────────────────────────
// This block used to be a private helper of the memo writer. Every question
// generator ran without it, so nothing that decided WHAT TO ASK could see what
// the founder had already told us on screen 1.
//
// The cost was visible in a live run. The founder had answered
// `developmentStage: scaling_revenue`, and the round-2 screen still asked for
// the product's technology readiness level — twice, in two different framings,
// getting TRL 6 to one and TRL 7-8 to the other. The brief then published both
// numbers about the same product.
//
// A stage that re-asks a settled fact is now a bug in one place rather than an
// omission repeated in three.
import { askLine } from "./money";
import { BORROWER_MODELS, ORGANISATION_TYPE_OPTIONS, SECTOR_OPTIONS, TICKET_BANDS, USE_OF_FUNDS_OPTIONS } from "./types";
import type { EligibilityAnswers, IntelligenceRequest } from "./types";

const label = (options: readonly { value: string; label: string }[], v?: string) =>
  options.find((o) => o.value === v)?.label ?? v ?? "";

/**
 * The founder's own answers, formatted for a model prompt.
 *
 * `heading` lets the writer keep its established "Scoping profile" wording
 * while the planner introduces the block as what it must not re-ask.
 */
export function knownFacts(
  req: Pick<IntelligenceRequest, "company" | "country" | "description" | "companyType" | "targetMarkets">,
  e?: EligibilityAnswers,
  heading = "## What the founder has already told us (AUTHORITATIVE)",
): string {
  const lines = [
    req.company ? `Company: ${req.company}` : "",
    req.country ? `Incorporated in: ${req.country}` : "",
    req.companyType ? `Self-described type: ${req.companyType}` : "",
    // The three that were missing and that the question stage most needed.
    // The kind of body, which decides who may apply at all. Kept beside the
    // company line and NOT beside team size, because a model that reads them
    // together starts treating "SME" as an organisation type, which is the
    // exact confusion that lost this demand for a year.
    e?.organisationType ? `Kind of organisation: ${label(ORGANISATION_TYPE_OPTIONS, e.organisationType)}` : "",
    e?.sector ? `Sector: ${label(SECTOR_OPTIONS, e.sector)}` : "",
    e?.developmentStage ? `Development stage: ${e.developmentStage.replace(/_/g, " ")}` : "",
    e?.useOfFunds?.length
      ? `What the money would pay for: ${e.useOfFunds.map((u) => label(USE_OF_FUNDS_OPTIONS, u)).join(", ")}`
      : "",
    // NOT `Ticket sought: <band>`. That named a quantity without naming its
    // subject, and every stage that read it invented one. See `money.ts` for
    // what the recorded briefs did with it and why the label is one string
    // both prompt sites read rather than two that agree.
    e?.ticketBand ? askLine(label(TICKET_BANDS, e.ticketBand)) : "",
    e?.borrowerModel ? `Borrower model: ${label(BORROWER_MODELS, e.borrowerModel)}` : "",
    req.targetMarkets?.length ? `Target markets for public capital: ${req.targetMarkets.join(", ")}` : "",
    e?.entityCountries?.length ? `Entities/establishments in: ${e.entityCountries.join(", ")}` : "",
    e?.wouldOpenEntity ? `Would open a local entity where required: ${e.wouldOpenEntity}` : "",
    e?.fteBand ? `Team size: ${e.fteBand} FTE` : "",
    e?.turnoverBand ? `Turnover: ${e.turnoverBand}` : "",
    e?.activities?.length ? `Regulated activities: ${e.activities.join(", ")}` : "",
    e?.ownerOver25 === "yes" ? "Has an owner holding 25% or more (SME test needs the linked-enterprise check)" : "",
    e?.nonEuControl === "yes" ? "Majority non-EU controlled (defence lanes restricted)" : "",
    e?.cofinancingBand ? `Co-financing capacity: ${e.cofinancingBand} of project cost` : "",
    e?.lossesOverHalfCapital === "yes"
      ? "FLAG: accumulated losses may exceed half of share capital (undertaking-in-difficulty risk: most GBER aid blocked until equity is restored)"
      : "",
    e?.conditionality?.length ? `Accepts conditions: ${e.conditionality.join(", ")}` : "",
    e?.activityCountries?.length ? `Funded activity will sit in: ${e.activityCountries.join(", ")}` : "",
    e?.consortium ? `Consortium-ready (3+ partners): ${e.consortium}` : "",
    e?.bankRelationship ? `Bank relationship that would lend if guaranteed: ${e.bankRelationship}` : "",
    e?.institutionalBacking ? `Institutional investors aboard or anchoring: ${e.institutionalBacking}` : "",
    e?.needBy ? `Capital needed: ${e.needBy.replace(/_/g, " ")}` : "",
  ].filter(Boolean);
  return lines.length ? `${heading}\n${lines.join("\n")}` : "";
}
