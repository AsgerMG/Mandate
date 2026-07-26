// Shared types for the competitive EU-funding intelligence agent.

/** Committed EUR on one funding channel, from the corpus. */
export interface ChannelAmount {
  channel: string;
  eur: number;
}

/** A comparable company as matched against the Wincent corpus. */
export interface CompetitorRecord {
  name: string;
  /** ISO2 country of the richest matched entity, or "" if unknown. */
  country: string;
  /** Inferred sector tag, or "". */
  sector: string;
  /** Two-tier taxonomy of the matched company, "" if unclassified. */
  sectorTop: string;
  subsector: string;
  /** Total EUR committed across all traced events (grants + debt). */
  euCapitalEur: number;
  /** Distinct funding channels (source_family codes) the company used. */
  channels: string[];
  /** Per-channel committed EUR, largest first. Concrete signal for the memo. */
  channelAmounts: ChannelAmount[];
  /** First / last event year across the group, 0 when no dated event. */
  firstYear: number;
  lastYear: number;
  /** True when the name was found in our database; false = no public funding traced. */
  matched: boolean;
}

/** Web-research snapshot for one comparable company (open-web colour, never funding amounts). */
export interface CompetitorIntel {
  name: string;
  /** Country the peer operates from (helps disambiguate the DB match). */
  country?: string;
  product: string;
  positioning: string;
  /** Rough company maturity (lab-stage / scaling / listed …). Deliberately NOT
   *  a private-round figure: the study tracks public support, and "who raised
   *  what with which VC" is out of scope for the brief. */
  maturity: string;
  notes: string;
}

/** One row of the competitive-field table, finalised in code (never the model). */
export interface CompetitorRow {
  name: string;
  /** "web" = a web-found comparable; "corpus" = a same-sub-sector funded
   *  peer pulled straight from the database (guaranteed funding signal). */
  source: "web" | "corpus";
  country: string; // ISO2 or ""
  euCapital: string; // formatted total, e.g. "€1.2M" or "No public funding traced"
  channelBreakdown: string; // e.g. "€2.5M EIC · €1.8M dev banks", or ""
  channels: string[];
  activeYears: string; // e.g. "2021–2024", or ""
  stage: string; // company maturity (web colour, no private-round figures)
  positioning: string; // web colour
}

/** The founder's own company as traced in the corpus (drives the BLUF). */
export interface SelfRecord {
  matched: boolean;
  euCapital: string; // formatted total or "No public funding traced"
  channelBreakdown: string;
  channels: string[];
  activeYears: string;
}

/** Which founders an instrument is actually built for — drives ordering and
 *  the "not a default for solo founders" flag, so consortium/institutional
 *  and large-scale-industrial capital is never presented as equivalent to
 *  startup-ready capital. See data/instrument_terms/_SCHEMA.md. */
export type FounderFit = "startup_ready" | "consortium_institutional" | "large_scale_industrial";

/** The founder's self-reported archetype, one-tap on the core screen. Shared
 *  here (not just local wizard state) so the server-side free-text inference
 *  layer (Phase 4, pipeline.ts's inferProfileSignal()) and the client picker
 *  can never drift onto different literal strings for the same 4 values. */
export const COMPANY_TYPE_OPTIONS = [
  { value: "Deep-tech breakthrough", label: "Deep-tech breakthrough", hint: "novel science or hardware, real technical risk" },
  { value: "Applied innovation", label: "Applied innovation", hint: "a new product built on existing tech" },
  { value: "Application-layer software", label: "Application-layer software", hint: "a platform or app on top of existing models" },
  { value: "Services", label: "Services", hint: "consulting, agency or delivery" },
] as const;
export type CompanyTypeValue = (typeof COMPANY_TYPE_OPTIONS)[number]["value"];

/** The model's own read of the founder's free-text description, on the same
 *  4-point scale as their self-reported companyType — never the same field,
 *  never authoritative, never checked against any primary text. Strictly
 *  softer than the weakest eligibility_gates tier (inventory_inferred): it
 *  isn't grounded in law or a curated brief at all, only in the founder's own
 *  prose. `note` must be traceable to language actually present in that
 *  prose (same "grounded, not invented" discipline as GroundedRound). */
export interface ProfileSignal {
  techDepthRead: CompanyTypeValue;
  note: string;
}

/** Curated trade-off snapshot parsed from a fund brief's "At a glance" block. */
export interface FundSnapshot {
  ticket: string;
  speed: string;
  giveUp: string;
  bestFor: string;
  /** "" when a brief hasn't declared a Fit line yet (treated as startup_ready-neutral, never blocking). */
  fit: FounderFit | "";
}

/** One row of the instrument-comparison table, built in code from FundSnapshot. */
export interface InstrumentRow {
  channel: string;
  instrument: string; // display name, e.g. "EIC Accelerator"
  ticket: string;
  speed: string;
  giveUp: string;
  bestFor: string;
  /** True when a peer or the founder has actually drawn on this channel. */
  usedInField: boolean;
  fit: FounderFit | "";
  /** Set for non-startup_ready rows: a short, visible distinguishing annotation. */
  fitFlag?: string;
  /** The real DB-native instrument id this row resolves to within `channel`'s
   *  family (e.g. "eic_pathfinder" within the "eic" channel), when the
   *  320-instrument inventory could resolve one. Absent for rows still
   *  falling back to channel-only display. */
  instrumentId?: string;
  /** ISO2, or "EU" for pan-European instruments. */
  country?: string;
  capitalType?: string;
  eventCount?: number;
  /** Real granting authority for this leaf instrument (e.g. "Bundesamt für
   *  Wirtschaft und Ausfuhrkontrolle"), carried through from
   *  DbInstrument.administeringBody. Set when known — see
   *  displayInstitutionName() in pipeline.ts, which prefers this over
   *  `instrument` for generic auto-named buckets (the "SATR De Equity"
   *  problem: SATR is where the DATA comes from, not who is granting it). */
  administeringBody?: string;
  /** Short legal-basis label (e.g. "GBER Art. 25 (R&D aid)"), derived from
   *  this leaf's gber_article_inferred gate when present — see
   *  legalBasisFor() in pipeline.ts. */
  legalBasis?: string;
  /** Set only for a small, hardcoded set of tech-depth-sensitive channels
   *  (DEPTH_SENSITIVE_CHANNELS in pipeline.ts), and only when the model's
   *  read of the founder's own description (ProfileSignal) diverges from
   *  what they self-reported as companyType. Grounded in the founder's own
   *  words, never in a curated brief or primary legal text — render this
   *  visually distinct from fitFlag, never on the same footing. Only ever
   *  set by runIntelligence()'s full-memo path, never by computeVerdict(). */
  profileNote?: string;
}

/** One row of the "5 institutions to target" table — the brief's
 *  centrepiece. institution/channel/supportType/ticket/comparableFirms are
 *  finalised in code from the same ranking (buildInstrumentTable) and DB
 *  evidence (records/dbPeers) the old memo used; only whyEligible and
 *  nextStep are model-written, keyed back onto these rows by channel. */
export interface InstitutionEntry {
  institution: string;   // display name, e.g. "EIC Accelerator"
  channel: string;       // internal source_family code
  supportType: string;   // e.g. "Grant", "Loan / guarantee", "Equity stake"
  ticket: string;        // curated ticket size, from FundSnapshot
  /** ISO2, or "EU"/"" — where this specific vehicle operates. Answers
   *  "where do I go for this," alongside `institution` itself. */
  country?: string;
  /** The specific legal basis this vehicle is measured against, e.g. "GBER
   *  Art. 25 (R&D aid)" — derived from the leaf instrument's
   *  gber_article_inferred gate (see legalBasisFor() in pipeline.ts). Answers
   *  "what do we check eligibility against," never invented: absent when no
   *  such gate is on record for this instrument. */
  legalBasis?: string;
  /** Grounded in the eligibility screen + scoping profile, never invented. */
  whyEligible: string;
  /** Qualification call from the encoded eligibility rules (verdict.ts).
   *  'open' = nothing we can check rules you out. Deliberately never "you
   *  qualify": the median instrument has only two encoded filters, so passing
   *  them is not proof. 'blocked' rows never reach the client — they are
   *  dropped in the pipeline rather than shown. */
  verdict?: "open" | "one_blocker" | "blocked" | "unknown";
  /** The single requirement standing in the way when verdict is
   *  'one_blocker' — the "here is what I would change" line. Restated in plain
   *  English by the writer where possible, falling back to the verbatim rule so
   *  the obstacle is never silently dropped. */
  blocker?: string;
  /** How many encoded filters could actually be evaluated — the honest weight
   *  behind the verdict. */
  gatesChecked?: number;
  /** Code-built, never model-written: why this row ranks where it does on
   *  ease (brief_funnel_v2 Stage 3). Deliberately phrased as requirements
   *  ANSWERED, not cleared — see the honesty note in ease.ts. Empty when
   *  there is nothing honest to claim. */
  whyEasy?: string;
  /** Real comparable companies that drew on this exact channel, code-built. */
  comparableFirms: { name: string; amount: string }[];
  /** One concrete, actionable next step, model-written. */
  nextStep: string;
}

/** One row of the deterministic eligibility screen — code-evaluated against
 *  verified term records (never model-written). "likely_met"/"likely_not_met"
 *  are the honest middle tier: a gate below llm_2pass/human_verified can
 *  compute a comparator result but must never claim it as asserted fact. */
export interface EligibilityCheck {
  check: string;                       // e.g. "EU SME status"
  /** The instrument this row came from, when it is instrument-specific.
   *  Absent for the framework-level checks. Consumers MUST key on this and
   *  never on the display name: 322 instruments share only 143 names
   *  ("Norges Forskningsråd" alone covers 65), so name matching silently
   *  cross-contaminates siblings. */
  instrumentId?: string;
  status: "met" | "not_met" | "likely_met" | "likely_not_met" | "unknown" | "info";
  finding: string;                     // one declarative sentence
  cure?: string;                       // when not_met: what would clear it
  source: { file: string; locator: string };  // primary-text citation
  verified: boolean;                   // false → renders as "verify:"
}

/**
 * The whole brief. Word budget (house rubric, tested live): bottomLine +
 * positioning + stateOfPlay together stay at or under ~700 words; the
 * institutions table is excluded from that count. Replaces the old 9-section
 * memo shape (overview/instrumentTable/funderMap/landscape/todos) entirely
 * — see project-mgmt/plans/memo_vision.md for the retired design, and the
 * 2026-07-24 brief-rebuild plan for why.
 */
export interface IntelligenceReport {
  company: string;
  generatedAt: string;
  /** The founder's own funding footprint in the corpus. */
  self: SelfRecord;
  /** Deterministic eligibility screen: intake answers × verified term records.
   *  Framework-level v1 (EU law); instrument-level rows land as national
   *  documents are verified. Code-built — the writer narrates, never edits. */
  eligibilityScreen: EligibilityCheck[];
  /** 4-5 bullets, ≤25 words each: why this founder should care, which funds
   *  are the right step, what the commercial payoff looks like. */
  bottomLine: string[];
  /** Exactly 5 rows: the institutions/funds to target. */
  institutions: InstitutionEntry[];
  /** One paragraph: positioning against the current political moment,
   *  grounded in the news-derived people/agenda signals. */
  positioning: string;
  /** One paragraph: the most relevant recent news/upcoming funds, plus a
   *  fixed, code-authored Wincent plug appended (never modeled). */
  stateOfPlay: string;
  caveats: string;
}

/** Request body posted to /api/intelligence. */
export interface IntelligenceRequest {
  company: string;
  sector?: string;
  country?: string;
  description?: string;
  /** How the founder describes the company (deep-tech breakthrough, applied
   *  innovation, application-layer software, services). Free text — re-orders the
   *  instrument shortlist far more than sector does. */
  companyType?: string;
  /** Capital types the founder wants, from CAPITAL_OPTIONS. Empty = no preference
   *  (treat as "show everything"). Filters and ranks the instrument shortlist. */
  capitalSought?: string[];
  /** Countries where the founder wants to RAISE public capital (full English
   *  names). May differ from the HQ country — an Irish company can target
   *  German, Italian or French public capital. Empty = home market + EU-wide.
   *  Steers peer preference, the funder map and the landscape slices. */
  targetMarkets?: string[];
  /** Answers to the tailored intake questions (phase 1), folded into the memo
   *  context. Each is a question the agent asked and the option the founder picked. */
  clarifications?: { question: string; answer: string }[];
  /** Structured scoping answers (the wizard's deterministic screens). */
  eligibility?: EligibilityAnswers;
  /** The founder's current candidate instrument shortlist (from a prior
   *  verdict computation) — grounds the adaptive round in gates that are
   *  actually still open for THESE instruments, not the whole 320-row corpus. */
  candidateInstrumentIds?: string[];
  /** Answers to the project questions (brief_funnel_v2 Stage 2b). Grounds the
   *  writer in what this company actually does, and feeds ease scoring. Never
   *  read by computeVerdict() — see ProjectAnswer. */
  projectAnswers?: ProjectAnswer[];
  /** The model's own read of the founder's free-text description (Phase 4),
   *  computed once per session by inferProfileSignal() and passed straight
   *  through — a soft, additive annotation only, never re-derived here. */
  profileSignal?: ProfileSignal;
}

/**
 * Sector, asked directly rather than inferred. The corpus's own subsector
 * taxonomy cannot supply it — 19 values, present on 12% of companies, and it
 * labelled Clean Aviation's top sectors as "heat pumps hvac".
 *
 * The buckets mirror the exclusions aid law actually draws, NOT how founders
 * describe themselves. Measured across the triaged corpus: 82 instruments carry
 * rules about financial/insurance activity, 17 about agriculture/fisheries, 12
 * about tobacco/gambling/weapons, 8 about real estate. An earlier version
 * collapsed all of those into one "restricted" option, which meant a lending
 * fintech inherited blocks written for tobacco companies and vice versa —
 * silently hiding funds it was entitled to.
 *
 * `financial_services` is where a company's OWN main activity is finance (a
 * lender, an insurer, a licensed bank). Software sold TO banks is
 * `software_digital`: the rules exclude financial activity as a business, not
 * customers in that industry.
 *
 * Deliberately NOT split further by go-to-market or customer type — B2B vs
 * B2C, govtech vs platform, cloud vs AI all sit in `software_digital` because
 * no eligibility rule in the corpus distinguishes them. That differentiation
 * comes from semantic fund matching on the description (semantic.ts) and the
 * project questions, which is where it belongs.
 */
export const SECTOR_OPTIONS = [
  { value: "software_digital", label: "Software, AI, platforms or cloud" },
  { value: "hardware_robotics", label: "Robotics, hardware or manufacturing" },
  { value: "health_lifesciences", label: "Health, medtech or life sciences" },
  { value: "energy_cleantech", label: "Energy, cleantech or environment" },
  { value: "agrifood", label: "Agritech, food, forestry or fisheries" },
  { value: "financial_services", label: "Banking, lending, insurance or payments" },
  { value: "excluded_activities", label: "Gambling, tobacco, alcohol, weapons or real estate" },
] as const;
export type SectorValue = (typeof SECTOR_OPTIONS)[number]["value"];

/** The standard EU/national exclusion situations, as one multi-select. These
 *  are boilerplate across the corpus and gate hard: an outstanding recovery
 *  order or insolvency closes most state aid outright. Merging them with the
 *  undertaking-in-difficulty test (accumulated losses) makes ONE question
 *  decide roughly 104 rules — the single highest-yield question available,
 *  and far less alarming asked as a checklist than one at a time. */
export const EXCLUSION_OPTIONS = [
  { value: "none", label: "None of these apply" },
  { value: "insolvency", label: "In bankruptcy, insolvency or winding-up" },
  { value: "losses_over_half_capital", label: "Accumulated losses exceed half our share capital" },
  { value: "recovery_order", label: "Under an unpaid EU state-aid recovery order" },
  { value: "sanctions", label: "Subject to EU sanctions or an exclusion decision" },
  { value: "tax_arrears", label: "Overdue tax or social-security debt" },
] as const;
export type ExclusionValue = (typeof EXCLUSION_OPTIONS)[number]["value"];

/** Scale bands: which instrument universe the ask opens (advisory_pipeline §B2). */
export const TICKET_BANDS = [
  { value: "lt500k", label: "Under €500K", hint: "vouchers, micro-grants, de minimis schemes" },
  { value: "b500k_2m5", label: "€500K – €2.5M", hint: "innovation grants, guaranteed loans" },
  { value: "b2m5_15m", label: "€2.5M – €15M", hint: "blended finance, venture debt" },
  { value: "b15m_50m", label: "€15M – €50M", hint: "EIB growth capital, Innovation Fund, IPCEI" },
  { value: "gt50m", label: "Over €50M", hint: "large-scale project finance, IPCEI waves" },
] as const;
export type TicketBand = (typeof TICKET_BANDS)[number]["value"];

/** Who ends up owing the money — routes between entirely different funnels. */
export const BORROWER_MODELS = [
  { value: "operating", label: "We fund our own operations",
    hint: "R&D, plant, working capital for ourselves" },
  { value: "balance_sheet_lender", label: "We finance customers from our balance sheet",
    hint: "leasing, credit we carry ourselves" },
  { value: "originator", label: "We originate; a bank or vehicle carries the credit",
    hint: "partner bank, securitisation" },
  { value: "fund_manager", label: "We manage a fund others invest through",
    hint: "fund-of-funds routes" },
] as const;
export type BorrowerModel = (typeof BORROWER_MODELS)[number]["value"];

/** Structured scoping answers (advisory_pipeline Stage B; detail in
 *  intake_scoping.md). All bands/toggles — the deterministic layer the
 *  eligibility engine will evaluate. Every field optional: the memo degrades
 *  gracefully when a founder skips a screen. */
export interface EligibilityAnswers {
  ticketBand?: TicketBand;
  borrowerModel?: BorrowerModel;
  /** Countries (full English names) where an entity or permanent establishment exists. */
  entityCountries?: string[];
  wouldOpenEntity?: "yes" | "no" | "depends";
  fteBand?: string;            // "1-9" | "10-49" | "50-249" | "250+"
  turnoverBand?: string;       // "<2M" | "2-10M" | "10-50M" | ">50M"
  balanceBand?: string;        // "<2M" | "2-43M" | ">43M"
  ownerOver25?: "yes" | "no" | "unsure";
  institutionalOwner?: "yes" | "no" | "unsure";
  nonEuControl?: "yes" | "no" | "unsure";
  cofinancingBand?: string;    // "<25%" | "25-50%" | ">50%" | "unsure"
  foundedYear?: number;
  lossesOverHalfCapital?: "yes" | "no" | "unsure";
  conditionality?: string[];   // accepted strings: local_entity, geo_commitments, state_shareholder, job_commitments
  // Derived from the instrument-level reverse-engineering (intake_scoping §2b):
  developmentStage?: string;   // "research" | "prototype" | "pilot_customers" | "scaling_revenue"
  activityCountries?: string[]; // where the FUNDED activity will physically sit
  consortium?: "yes" | "no" | "unsure";      // willing/able to run in a 3+ partner consortium
  bankRelationship?: "yes" | "no" | "unsure"; // a bank that would lend if guaranteed
  institutionalBacking?: "yes" | "no" | "unsure"; // VC/institutional investors aboard or anchoring
  needBy?: string;             // "asap_weeks" | "months_6" | "months_18" | "flexible"
  /** SECTOR_OPTIONS value. Asked directly — see the constant for why. */
  sector?: string;
  /** EXCLUSION_OPTIONS values. "none" is a real answer, not an empty list:
   *  an empty array means unanswered, which must never read as a pass. */
  exclusionFlags?: string[];
}

/** The fixed founder-facing options for every EligibilityAnswers field that's
 *  deferred off the first page (Phase 3B) and eligible for the grounded
 *  adaptive round (Phase 3C) — excludes free-text/numeric fields
 *  (entityCountries, activityCountries, foundedYear), which stay out of this
 *  mechanism. The model picks WHICH fields to ask about and phrases the
 *  question from real gate text; it never invents the option labels — those
 *  come from here, so an answer is always a real, valid EligibilityAnswers
 *  value. Shared between the server (prompt/schema construction) and the
 *  client (rendering the picked answer). */
export const FIELD_ENUM_HINTS: Record<string, { multi: boolean; options: { value: string; label: string }[] }> = {
  consortium: { multi: false, options: [
    { value: "yes", label: "Yes, we could run a 3+ partner consortium" },
    { value: "no", label: "No, single applicant only" },
    { value: "unsure", label: "Not sure" },
  ] },
  cofinancingBand: { multi: false, options: [
    { value: ">50%", label: "Yes, more than half" },
    { value: "25-50%", label: "Yes, 25–50%" },
    { value: "<25%", label: "Below 25%" },
    { value: "unsure", label: "Not sure" },
  ] },
  conditionality: { multi: true, options: [
    { value: "local_entity", label: "Opening a local entity" },
    { value: "geo_commitments", label: "Committing investment to a specific country" },
    { value: "state_shareholder", label: "The state on the cap table" },
    { value: "job_commitments", label: "Job-creation commitments" },
  ] },
  wouldOpenEntity: { multi: false, options: [
    { value: "yes", label: "Yes, if it unlocks the right capital" },
    { value: "depends", label: "Depends on the terms" },
    { value: "no", label: "No" },
  ] },
  ownerOver25: { multi: false, options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  institutionalOwner: { multi: false, options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  nonEuControl: { multi: false, options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  lossesOverHalfCapital: { multi: false, options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  bankRelationship: { multi: false, options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  institutionalBacking: { multi: false, options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  needBy: { multi: false, options: [
    { value: "asap_weeks", label: "Weeks" },
    { value: "months_6", label: "Within 6 months" },
    { value: "months_18", label: "6–18 months" },
    { value: "flexible", label: "Flexible" },
  ] },
  turnoverBand: { multi: false, options: [
    { value: "<2M", label: "Under €2M" }, { value: "2-10M", label: "€2–10M" },
    { value: "10-50M", label: "€10–50M" }, { value: ">50M", label: "Over €50M" },
  ] },
  balanceBand: { multi: false, options: [
    { value: "<2M", label: "Under €2M" }, { value: "2-43M", label: "€2–43M" }, { value: ">43M", label: "Over €43M" },
  ] },
};

/** One question in a grounded adaptive round: the model picks which field
 *  (from the real open-gate evidence it was given) and phrases the question;
 *  the answer options always come from FIELD_ENUM_HINTS, never the model. */
export interface GroundedQuestion {
  field: string;
  question: string;
}

/**
 * A question about the founder's actual PROJECT, phrased from one fund's
 * verbatim requirement text (brief_funnel_v2 Stage 2b).
 *
 * Unlike GroundedQuestion above, the model writes the options too — the whole
 * point is to ask something a fixed twelve-field vocabulary cannot express
 * ("is your technology at TRL 5-6 at entry?"). That is only safe because the
 * answer is stored in ProjectAnswer, never in EligibilityAnswers, and
 * computeVerdict() never reads it: a hallucinated option can degrade memo
 * prose, but it cannot flip a legal eligibility verdict.
 */
export interface ProjectQuestion {
  /** Stable id, so an answer can be matched back to the question. */
  id: string;
  question: string;
  /** 3-5 model-written options derived from the requirement text. The client
   *  always appends its own "None of these" and a free-text box. */
  options: string[];
  /** Citation anchors, carried through to the writer. */
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  /** Verbatim requirement text the question was phrased from. */
  quote: string;
  locator?: string;
}

/** A founder's answer to one ProjectQuestion. Writer context and ease-scoring
 *  input only — deliberately NOT part of EligibilityAnswers. */
export interface ProjectAnswer {
  questionId: string;
  question: string;
  answer: string;
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  quote: string;
  locator?: string;
}

/** One themed adaptive round — Phase 3C generates exactly one at a time,
 *  grounded in the founder's actual candidate-instrument shortlist. Carries
 *  both halves of the brief_funnel_v2 panel: `questions` closes generic
 *  eligibility gates (fixed enums), `projectQuestions` asks about the project
 *  itself (model-written options). */
export interface GroundedRound {
  theme: string;
  questions: GroundedQuestion[];
  projectQuestions?: ProjectQuestion[];
}

/** The selectable capital types the founder can ask for. Order = display order. */
export const CAPITAL_OPTIONS = [
  { value: "grant", label: "Grants", hint: "non-dilutive, no payback" },
  { value: "loan", label: "Loans & guarantees", hint: "debt, repayable, no equity" },
  { value: "recoverable_advance", label: "Recoverable advances", hint: "repay only if it works" },
  { value: "equity", label: "Equity & blended finance", hint: "capital for a stake: dilutive" },
  { value: "tax_credit", label: "Tax credits & reliefs", hint: "R&D credits, payroll relief" },
] as const;

export type CapitalType = (typeof CAPITAL_OPTIONS)[number]["value"];

/** The pieces of the report that are code-computed and known well before the
 *  writer model call resolves (self footprint, eligibility screen, the 5
 *  institution rows minus their model-written whyEligible/nextStep). Streamed
 *  early so the client can show real content during generation instead of
 *  narration — see synthesize() in pipeline.ts. */
export interface PartialReport {
  self: SelfRecord;
  eligibilityScreen: EligibilityCheck[];
  institutions: InstitutionEntry[];
}

/** Server-sent progress event streamed to the client. */
export type ProgressEvent =
  | { type: "status"; step: PipelineStep; detail?: string }
  | { type: "partial"; data: PartialReport }
  | { type: "report"; data: IntelligenceReport }
  | { type: "error"; message: string };

export type PipelineStep =
  | "discovering"
  | "querying_db"
  | "researching"
  | "generating"
  | "done";
