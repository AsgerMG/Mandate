// Shared types for the competitive EU-funding intelligence agent.

/** A competitor as matched against the EuroInvTracker corpus. */
export interface CompetitorRecord {
  name: string;
  /** ISO2 country of the richest matched entity, or "" if unknown. */
  country: string;
  /** Inferred sector tag, or "". */
  sector: string;
  /** Total EUR committed across all traced events (grants + debt). */
  euCapitalEur: number;
  /** Distinct funding channels (source_family codes) the company used. */
  channels: string[];
  /** True when the name was found in our database; false = no public funding traced. */
  matched: boolean;
}

/** Web-research snapshot for one competitor (open-web colour, never funding amounts). */
export interface CompetitorIntel {
  name: string;
  product: string;
  positioning: string;
  lastPrivateRound: string;
  notes: string;
}

export interface OverviewSection {
  headline: string;
  competitors: {
    name: string;
    euCapital: string; // formatted, e.g. "€1.2M" or "No public funding traced"
    channels: string[];
    stage: string;
    positioning: string;
  }[];
  yourPosition: string;
}

export interface StakeholderEntry {
  funder: string; // e.g. "EIC Accelerator"
  competitorsUsing: string[];
  relevanceToYou: string;
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
  overview: OverviewSection;
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
}

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
