// Shared types for the competitive EU-funding intelligence agent.

/** Committed EUR on one funding channel, from the corpus. */
export interface ChannelAmount {
  channel: string;
  eur: number;
}

/** A comparable company as matched against the EuroInvTracker corpus. */
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

export interface OverviewSection {
  /** The memo subject line — one factual sentence on the founder's position. */
  headline: string;
  /** Bottom line up front: the single most important takeaway, 1–2 sentences. */
  bottomLine: string;
  competitors: CompetitorRow[];
  yourPosition: string;
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
}

export interface FunderEntry {
  funder: string; // e.g. "EIC Accelerator"
  comparablesUsing: string[];
  relevanceToYou: string;
  /** What this money costs you, named honestly and fund-specifically. */
  tradeoff: string;
  nextStep: string;
  nextDeadline: string | null;
}

/** "The road ahead" — grounded ONLY in the curated signals digest. */
export interface LandscapeSection {
  /** ≤ 60 words tying current developments to this founder's raise. */
  outlook: string;
  watchItems: {
    item: string;              // the development to watch, ≤ 14 words
    why: string;               // what it changes for the founder, ≤ 25 words
    source: string;            // outlet/institution name from the digest
    timeframe: string | null;  // e.g. "H2 2026", null when unknown
  }[];
}

export interface TodoEntry {
  priority: 1 | 2 | 3;
  action: string;
  rationale: string;
  timeframe: string;
}

/** One row of the deterministic eligibility screen — code-evaluated against
 *  verified term records (never model-written). "likely_met"/"likely_not_met"
 *  are the honest middle tier: a gate below llm_2pass/human_verified can
 *  compute a comparator result but must never claim it as asserted fact. */
export interface EligibilityCheck {
  check: string;                       // e.g. "EU SME status"
  status: "met" | "not_met" | "likely_met" | "likely_not_met" | "unknown" | "info";
  finding: string;                     // one declarative sentence
  cure?: string;                       // when not_met: what would clear it
  source: { file: string; locator: string };  // primary-text citation
  verified: boolean;                   // false → renders as "verify:"
}

export interface IntelligenceReport {
  company: string;
  generatedAt: string;
  /** The founder's own funding footprint in the corpus. */
  self: SelfRecord;
  overview: OverviewSection;
  /** The capital on the table: instruments relevant to this founder, side by side. */
  instrumentTable: InstrumentRow[];
  funderMap: FunderEntry[];
  /** Deterministic eligibility screen: intake answers × verified term records.
   *  Framework-level v1 (EU law); instrument-level rows land as national
   *  documents are verified. Code-built — the writer narrates, never edits. */
  eligibilityScreen: EligibilityCheck[];
  /** What's moving in public funding that this founder should track. */
  landscape: LandscapeSection;
  todos: TodoEntry[];
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
}

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

/** One themed adaptive round — Phase 3C generates exactly one at a time,
 *  grounded in the founder's actual candidate-instrument shortlist. */
export interface GroundedRound {
  theme: string;
  questions: GroundedQuestion[];
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

/** Server-sent progress event streamed to the client. */
export type ProgressEvent =
  | { type: "status"; step: PipelineStep; detail?: string }
  | { type: "report"; data: IntelligenceReport }
  | { type: "error"; message: string };

export type PipelineStep =
  | "discovering"
  | "querying_db"
  | "researching"
  | "generating"
  | "done";
