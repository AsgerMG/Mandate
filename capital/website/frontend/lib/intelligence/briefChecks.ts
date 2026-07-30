// The mechanically checkable half of the brief contracts.
//
// Every rule here has an ID that also appears in contracts/*.md. That shared
// ID is the point: the contract is what the writer is told, this is what the
// output is measured against, and a check with no contract rule (or a contract
// rule with no check) fails the build in scripts/check_contracts.ts.
//
// ── Hard rules only ────────────────────────────────────────────────────────
// A rule belongs here when a machine can decide it: counts, caps, forbidden
// substrings, structural duplication. Rules that need judgement ("is this
// bullet decision-relevant?") stay in the contract as soft rules and are
// scored by a model reading that same contract, never duplicated here as a
// keyword heuristic. A check that cries wolf trains you to ignore the report.
//
// ── House rule ─────────────────────────────────────────────────────────────
// A rule names a property, never an instance. Nothing below names a company,
// fund, sector or country.
import { WATCH_ONLY_COPY } from "./watchOnly";
import type { IntelligenceReport } from "./types";

export interface CheckViolation {
  ruleId: string;
  /** What went wrong, in terms a PM reading the scoreboard can act on. */
  detail: string;
}

const words = (s: unknown) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

/** Text the pipeline emits about its own machinery. None of it is an
 *  observation about the founder's company, so none of it belongs in a brief.
 *  Matched as phrases rather than keywords so ordinary prose cannot trip it. */
const BACKEND_LEAKAGE: { pattern: RegExp; what: string }[] = [
  { pattern: /documented eligibility rules/i, what: "gate-coverage metric" },
  { pattern: /nothing in its documented rules rules you out/i, what: "internal verdict phrasing" },
  { pattern: /\byour answers speak to\b/i, what: "gate-coverage metric" },
  { pattern: /\bnot yet verified\b/i, what: "encoding-coverage status" },
  { pattern: /#p\.\d+|\.pdf\b/i, what: "source-document locator" },
  { pattern: /\bchunk \d+/i, what: "extractor artifact" },
];

/** Fallback strings the pipeline substitutes when the writer says nothing.
 *  Their presence means a published row carries no actual judgement. */
const BOILERPLATE = /verify eligibility directly with the fund|review the fund's current call/i;

/** A row whose own justification argues against it. Only meaningful on rows
 *  with no declared blocker: a blocker row is SUPPOSED to name the obstacle. */
const SELF_CONTRADICTION = /\b(targets|aimed at|reserved for|designed for|focus(?:es|ed)? on)\b[^.]{0,80}\bnot\b/i;

/** An institution a founder cannot approach as a funder. A government
 *  department administers schemes; it is not itself a door to knock on, and
 *  naming one as the institution sends the reader nowhere. */
export const NOT_AN_APPLYABLE_BODY =
  /^(ministry|minist[eè]re|ministerium|ministero|ministerie|department|direction g[eé]n[eé]rale)\b/i;

export interface BriefLimits {
  bulletMin: number; bulletMax: number; bulletWords: number;
  institutionsMax: number;
  positioningWords: number;
  stateOfPlayWords: number;
  bodyWords: number;
}

/** The numeric limits, in one place so the contracts, the prompt and the
 *  checks cannot disagree about them. */
export const BRIEF_LIMITS: BriefLimits = {
  bulletMin: 4, bulletMax: 5, bulletWords: 25,
  institutionsMax: 5,
  positioningWords: 200,
  stateOfPlayWords: 200,
  bodyWords: 700,
};

/**
 * Every hard-rule violation in a finished brief.
 *
 * `plug` is the fixed closing copy appended in code; it is passed in rather
 * than imported so the check cannot silently pass by comparing the string to
 * itself if the pipeline stops appending it.
 */
export function checkBrief(
  report: Partial<IntelligenceReport>,
  plug?: string,
): CheckViolation[] {
  const v: CheckViolation[] = [];
  const bullets = report.bottomLine ?? [];
  const institutions = report.institutions ?? [];

  // ── bottom line ────────────────────────────────────────────────────────
  if (bullets.length < BRIEF_LIMITS.bulletMin || bullets.length > BRIEF_LIMITS.bulletMax) {
    v.push({ ruleId: "BL-1", detail: `${bullets.length} bullets, expected ${BRIEF_LIMITS.bulletMin}-${BRIEF_LIMITS.bulletMax}` });
  }
  for (const [i, b] of bullets.entries()) {
    if (words(b) > BRIEF_LIMITS.bulletWords) {
      v.push({ ruleId: "BL-2", detail: `bullet ${i + 1} is ${words(b)} words (max ${BRIEF_LIMITS.bulletWords})` });
    }
  }

  // ── the funds ──────────────────────────────────────────────────────────
  if (institutions.length === 0) v.push({ ruleId: "FUND-1", detail: "no institutions published" });
  if (institutions.length > BRIEF_LIMITS.institutionsMax) {
    v.push({ ruleId: "FUND-2", detail: `${institutions.length} rows (max ${BRIEF_LIMITS.institutionsMax})` });
  }
  // Two rows resolving to the same institution under the same legal basis are
  // one route shown twice, which spends a scarce row on nothing.
  const seen = new Set<string>();
  for (const r of institutions) {
    const key = `${(r.institution ?? "").toLowerCase()}|${(r.legalBasis ?? "").toLowerCase()}`;
    if (seen.has(key)) {
      v.push({ ruleId: "FUND-3", detail: `duplicate route: ${r.institution}${r.legalBasis ? ` (${r.legalBasis})` : ""}` });
    }
    seen.add(key);
  }
  for (const r of institutions) {
    if (WATCH_ONLY_COPY.test(String(r.nextStep ?? ""))) {
      v.push({ ruleId: "FUND-4", detail: `next step is a thing to watch, not do: ${r.institution}` });
    }
    if (BOILERPLATE.test(String(r.whyEligible ?? "")) || BOILERPLATE.test(String(r.nextStep ?? ""))) {
      v.push({ ruleId: "FUND-5", detail: `fallback boilerplate published: ${r.institution}` });
    }
    if (!r.blocker && SELF_CONTRADICTION.test(String(r.whyEligible ?? ""))) {
      v.push({ ruleId: "FUND-6", detail: `row argues against itself: ${r.institution}` });
    }
    if (NOT_AN_APPLYABLE_BODY.test(String(r.institution ?? ""))) {
      v.push({ ruleId: "FUND-7", detail: `not a body a founder can apply to: ${r.institution}` });
    }
  }

  // ── positioning and state of play ──────────────────────────────────────
  if (words(report.positioning) > BRIEF_LIMITS.positioningWords) {
    v.push({ ruleId: "POS-1", detail: `${words(report.positioning)} words (max ${BRIEF_LIMITS.positioningWords})` });
  }
  const sop = String(report.stateOfPlay ?? "");
  if (words(sop) > BRIEF_LIMITS.stateOfPlayWords) {
    v.push({ ruleId: "SOP-1", detail: `${words(sop)} words (max ${BRIEF_LIMITS.stateOfPlayWords})` });
  }
  // The closing pitch is fixed copy with its own place in the layout. Inside
  // the analytical paragraph it reads as the analysis turning into a sales
  // line, which is what it did when the two were string-concatenated.
  if (plug && sop.includes(plug.slice(0, 40))) {
    v.push({ ruleId: "SOP-2", detail: "closing pitch is inside the analysis paragraph rather than its own block" });
  }

  // ── whole document ─────────────────────────────────────────────────────
  const body = words(bullets.join(" ")) + words(report.positioning) + words(sop);
  if (body > BRIEF_LIMITS.bodyWords) {
    v.push({ ruleId: "BRIEF-1", detail: `${body} words of prose (max ${BRIEF_LIMITS.bodyWords})` });
  }
  if (!String(report.caveats ?? "").trim()) {
    v.push({ ruleId: "BRIEF-2", detail: "no caveat" });
  }
  const allText = [
    ...bullets, report.positioning, sop, report.caveats,
    ...institutions.flatMap((r) => [r.whyEligible, r.nextStep, r.blocker, r.institution, r.ticket]),
  ].filter(Boolean).join(" \n ");
  if (/—/.test(allText)) v.push({ ruleId: "BRIEF-3", detail: "em-dash in founder-facing text" });
  for (const { pattern, what } of BACKEND_LEAKAGE) {
    if (pattern.test(allText)) v.push({ ruleId: "BRIEF-4", detail: `internal machinery in reader text (${what})` });
  }

  return v;
}

/** Every rule id this module can emit — checked against the contracts so a
 *  rule can never exist in only one of the two places. */
export const CHECK_RULE_IDS = [
  "BL-1", "BL-2",
  "FUND-1", "FUND-2", "FUND-3", "FUND-4", "FUND-5", "FUND-6", "FUND-7",
  "POS-1", "SOP-1", "SOP-2",
  "BRIEF-1", "BRIEF-2", "BRIEF-3", "BRIEF-4",
] as const;
