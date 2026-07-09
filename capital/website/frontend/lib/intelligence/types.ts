// Shared types for the competitive EU-funding intelligence agent.

/** Committed EUR on one funding channel, from the corpus. */
export interface ChannelAmount {
  channel: string;
  eur: number;
}

/** A competitor as matched against the EuroInvTracker corpus. */
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
  /** "web" = a web-found direct competitor; "corpus" = a same-sub-sector funded
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

/** Curated trade-off snapshot parsed from a fund brief's "At a glance" block. */
export interface FundSnapshot {
  ticket: string;
  speed: string;
  giveUp: string;
  bestFor: string;
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
}

export interface StakeholderEntry {
  funder: string; // e.g. "EIC Accelerator"
  competitorsUsing: string[];
  relevanceToYou: string;
  /** What this money costs you, named honestly and fund-specifically. */
  tradeoff: string;
  nextStep: string;
  nextDeadline: string | null;
}

export interface TodoEntry {
  priority: 1 | 2 | 3;
  action: string;
  rationale: string;
  timeframe: string;
}

export interface IntelligenceReport {
  company: string;
  generatedAt: string;
  /** The founder's own funding footprint in the corpus. */
  self: SelfRecord;
  overview: OverviewSection;
  /** The capital on the table: instruments relevant to this founder, side by side. */
  instrumentTable: InstrumentRow[];
  stakeholderMap: StakeholderEntry[];
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
  /** Answers to the tailored intake questions (phase 1), folded into the memo
   *  context. Each is a question the agent asked and the option the founder picked. */
  clarifications?: { question: string; answer: string }[];
}

/** One tailored multiple-choice question the intake stage asks before the memo. */
export interface IntakeQuestion {
  /** Stable id for client state. */
  id: string;
  /** The question, in plain English. */
  question: string;
  /** 2–4 answer options. The client appends its own "Not sure / skip". */
  options: string[];
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
