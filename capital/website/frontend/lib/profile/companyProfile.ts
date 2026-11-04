/**
 * ONE company profile, two engines.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * Wincent answers "what public money could this company go for". Regina
 * (`~/Regina`, regina-ai.eu) answers "what rules are landing on it". They were
 * built separately and they ask a company to describe itself TWICE, in two
 * vocabularies, on two websites. A founder experiences that as two products,
 * which is the opposite of the thing we are now building.
 *
 * This is the shared contract that sits ABOVE both. Neither engine changes:
 * each one maps this profile down to the input it already expects.
 *
 * ── Why it is not an extension of FIELD_REACH ─────────────────────────────
 * `FIELD_REACH` in `lib/intelligence/types.ts` is keyed on `EligibilityAnswers`
 * — facts that decide whether a company may RECEIVE aid. Whether an AI system
 * makes decisions about people is not an eligibility fact and putting it there
 * would make `check_answer_reach` right to complain: no gate resolves to it.
 * The profile is a layer up, and eligibility is one of the things derived FROM
 * it.
 *
 * ── The thing that proves the merge is worth doing ────────────────────────
 * Regina asks the founder to self-declare `company_size` as micro/small/medium/
 * large, and its own docstring says SME status "gates many obligations". Wincent
 * already asks the three facts the EU definition is actually made of — headcount,
 * turnover, balance sheet — in bands that ARE the statutory thresholds. So the
 * merged profile does not ask the question at all: it DERIVES it, from answers
 * a founder gives for a different reason. See `deriveSmeStatus`.
 *
 * That is the pattern to repeat. A field one engine has to ask for is often a
 * field the other already holds.
 */

import type { EligibilityAnswers } from "../intelligence/types";

// ── WHO CONSUMES A FIELD ────────────────────────────────────────────────────
// Stated per field so that adding a question has to name what it changes. A
// field consumed by nobody is a question we are asking for free, and this
// project has shipped several: `check_request_surface` exists because three
// request fields were read by routes no founder could send them to.
export type Consumer = "funding" | "policy" | "both";

/** Where a fact comes from. `derived` is never asked — see `deriveSmeStatus`. */
export type Source = "opening_form" | "follow_up" | "derived";

export interface ProfileField {
  /** What the founder is actually asked, in their words. Empty for derived. */
  readonly ask: string;
  /** What it changes for them. Not what it changes in the code. */
  readonly why: string;
  readonly consumer: Consumer;
  readonly source: Source;
  /** The key this maps to in Wincent's eligibility answers, where it maps. */
  readonly funding?: keyof EligibilityAnswers;
  /** The attribute this maps to on Regina's `CompanyProfile`, where it maps. */
  readonly policy?: string;
}

/**
 * The four things a profile is for, and they are not arbitrary: they are the
 * four questions an operating system for public affairs has to answer.
 *
 *   identity  who you are          — name, words, where you are
 *   shape     what size and stage  — the facts thresholds turn on
 *   exposure  what lands on you    — what makes a rule YOURS
 *   intent    what you want        — what you would do with public money
 *
 * `exposure` is the half Wincent has never had, and `intent` is the half Regina
 * has never had. Each is useless to its own engine and load-bearing for the
 * other's.
 */
export const PROFILE: Record<string, ProfileField> = {
  // ── identity ──────────────────────────────────────────────────────────────
  name: {
    ask: "Company name",
    why: "So we can find what has already been published about you.",
    consumer: "both", source: "opening_form", policy: "name",
  },
  description: {
    ask: "What are you building? (a sentence or two)",
    why: "The single most useful thing you can tell us. It is how we match you "
       + "to funds and to the rules that turn on what a product actually does.",
    consumer: "both", source: "opening_form", policy: "description",
  },
  sector: {
    ask: "What sector are you in?",
    why: "Narrows both the funds you can apply for and the rules aimed at your "
       + "industry.",
    consumer: "both", source: "opening_form",
    funding: "sector", policy: "sectors",
  },
  entityCountries: {
    ask: "Where is the company established?",
    why: "Most public money is national before it is European, and obligations "
       + "attach to where you are established.",
    consumer: "both", source: "opening_form",
    funding: "entityCountries", policy: "markets",
  },
  region: {
    ask: "Which region?",
    why: "A large share of European funding is regional, not national.",
    consumer: "funding", source: "opening_form", funding: "region",
  },

  // ── shape: the facts statutory thresholds turn on ─────────────────────────
  fteBand: {
    ask: "How many people work there?",
    why: "Headcount is the first test in the EU's SME definition, and SME status "
       + "gates both funding schemes and regulatory obligations.",
    consumer: "both", source: "opening_form", funding: "fteBand",
  },
  turnoverBand: {
    ask: "Annual turnover?",
    why: "The second half of the SME test, and a condition on many schemes.",
    consumer: "both", source: "follow_up", funding: "turnoverBand",
  },
  balanceBand: {
    ask: "Balance sheet total?",
    why: "An alternative to turnover in the SME test — either one can satisfy it.",
    consumer: "both", source: "follow_up", funding: "balanceBand",
  },
  developmentStage: {
    ask: "How far along is the product?",
    why: "Funds are written for particular stages, and several obligations only "
       + "bite once something is placed on the market.",
    consumer: "both", source: "opening_form", funding: "developmentStage",
  },
  customerType: {
    ask: "Do you sell to businesses, consumers, or both?",
    why: "Consumer-facing rules are a different regime, and some funds are "
       + "restricted by who you sell to.",
    consumer: "both", source: "opening_form", policy: "customer_type",
  },
  smeStatus: {
    ask: "",
    why: "Derived from headcount, turnover and balance sheet — we do not ask it.",
    consumer: "both", source: "derived", policy: "company_size",
  },

  // ── exposure: what makes a rule yours. Wincent has never asked any of this ─
  usesAi: {
    ask: "Do you build or deploy AI systems?",
    why: "Decides whether the AI Act is your problem at all.",
    consumer: "both", source: "opening_form", policy: "uses_ai",
  },
  aiRole: {
    ask: "Do you build the AI, use someone else's, or both?",
    why: "The AI Act assigns different duties to providers and deployers.",
    consumer: "policy", source: "follow_up", policy: "ai_role",
  },
  aiUseCases: {
    ask: "Does the system make or inform decisions about people?",
    why: "This, not whether you built it, is what makes a system high-risk.",
    consumer: "policy", source: "follow_up", policy: "ai_use_cases",
  },
  handlesPersonalData: {
    ask: "Do you process personal data?",
    why: "Opens or closes a whole body of obligations.",
    consumer: "both", source: "opening_form", policy: "handles_personal_data",
  },
  dataCategories: {
    ask: "Any sensitive data — health, biometric, children, location?",
    why: "Special categories carry duties ordinary personal data does not.",
    consumer: "policy", source: "follow_up", policy: "data_categories",
  },
  monthlyEuUsers: {
    ask: "Roughly how many monthly users in the EU?",
    why: "Several platform obligations are tiered purely on user numbers.",
    consumer: "policy", source: "follow_up", policy: "monthly_eu_users",
  },

  // ── intent: what you want from the public sector. Regina has never asked ───
  useOfFunds: {
    ask: "What would the money pay for?",
    why: "Funds are written for particular costs — hiring, capex, trials, IP.",
    consumer: "funding", source: "opening_form", funding: "useOfFunds",
  },
  ticketBand: {
    ask: "How much are you looking for?",
    why: "Schemes write cheques in a range, and most of the range is wrong for you.",
    consumer: "funding", source: "opening_form", funding: "ticketBand",
  },
  consortium: {
    ask: "Would you apply with partners?",
    why: "Some of the largest European programmes are only open to consortia.",
    consumer: "funding", source: "follow_up", funding: "consortium",
  },
  needBy: {
    ask: "When do you need it?",
    why: "Deadlines and decision times vary by a year or more.",
    consumer: "funding", source: "follow_up", funding: "needBy",
  },
};

// ── THE DERIVATION ──────────────────────────────────────────────────────────

export type SmeStatus = "micro" | "small" | "medium" | "large";

/**
 * EU SME status, from Recommendation 2003/361/EC Article 2: a headcount
 * ceiling AND one of two financial ceilings — turnover OR balance sheet,
 * either satisfies it.
 *
 *   micro    < 10   staff  and  turnover ≤ €2m   or balance ≤ €2m
 *   small    < 50   staff  and  turnover ≤ €10m  or balance ≤ €10m
 *   medium   < 250  staff  and  turnover ≤ €50m  or balance ≤ €43m
 *
 * Wincent's bands were drawn on exactly these thresholds, which is why this is
 * arithmetic rather than a judgement: `fteBand` is 1-9 / 10-49 / 50-249 / 250+,
 * `turnoverBand` is <2M / 2-10M / 10-50M / >50M, `balanceBand` is <2M / 2-43M /
 * >43M.
 *
 * TWO HONEST LIMITS, stated rather than hidden:
 *
 *  1. The balance-sheet ladder has no €10m rung, so at the SMALL tier only
 *     turnover can satisfy the financial test. A company with 30 staff and a
 *     €9m balance sheet is small in law and reads MEDIUM here unless it also
 *     answered turnover. Returning `medium` understates nothing a founder is
 *     entitled to — SME-only schemes still admit it — so this errs safe.
 *  2. Headcount alone can only ever prove a company is LARGE. Without a
 *     financial answer we return `undefined` rather than guess, because a
 *     wrong SME claim in a funding application is worse than an absent one.
 *
 * The linked-enterprise rules (a parent over 25% consolidates) are NOT applied
 * here. Wincent asks `ownerOver25` for exactly that reason; wiring it in is a
 * separate change and must not be smuggled into a function this small.
 */
export function deriveSmeStatus(a: {
  fteBand?: string; turnoverBand?: string; balanceBand?: string;
}): SmeStatus | undefined {
  const { fteBand, turnoverBand, balanceBand } = a;
  if (!fteBand) return undefined;
  if (fteBand === "250+") return "large";

  // Either financial test may satisfy a tier; absence of one is not a failure.
  const turnoverAtMost = (m: number) =>
    turnoverBand === undefined ? undefined
      : m >= 50 ? turnoverBand !== ">50M"
      : m >= 10 ? turnoverBand === "<2M" || turnoverBand === "2-10M"
      : turnoverBand === "<2M";
  const balanceAtMost = (m: number) =>
    balanceBand === undefined ? undefined
      : m >= 43 ? balanceBand !== ">43M"
      : balanceBand === "<2M";

  const meets = (m: number) => {
    const t = turnoverAtMost(m), b = balanceAtMost(m);
    if (t === true || b === true) return true;
    if (t === undefined && b === undefined) return undefined;  // nothing to go on
    return false;
  };

  if (fteBand === "1-9") {
    const m = meets(2);
    if (m === undefined) return undefined;
    if (m) return "micro";
  }
  if (fteBand === "1-9" || fteBand === "10-49") {
    const m = meets(10);
    if (m === undefined) return undefined;
    if (m) return "small";
  }
  const m = meets(50);
  if (m === undefined) return undefined;
  return m ? "medium" : "large";
}

/** Every field one engine consumes that the other does not ask for. The reason
 *  the merge is worth doing, computed rather than asserted. */
export function crossFeed(): { toFunding: string[]; toPolicy: string[] } {
  const toFunding: string[] = [], toPolicy: string[] = [];
  for (const [k, f] of Object.entries(PROFILE)) {
    if (f.consumer === "both" && !f.funding && f.source !== "derived") toFunding.push(k);
    if (f.consumer === "both" && !f.policy && f.source !== "derived") toPolicy.push(k);
  }
  return { toFunding, toPolicy };
}
