/**
 * The advisor's models. One place, so the price table (lib/intelligence/cost.ts)
 * and the runtime cannot disagree about what is being paid for.
 *
 * Orchestration and judgement on Opus; the specialists' tool-heavy loops and
 * the research sub-calls on Sonnet. Both run adaptive thinking (neither model
 * accepts thinking disabled) and are steered with effort.
 */
export const ORCHESTRATOR_MODEL = "claude-opus-5-5";
export const SPECIALIST_MODEL = "claude-sonnet-5-5";
export const RESEARCH_MODEL = "claude-sonnet-5-5";

export const ORCHESTRATOR_EFFORT = "high" as const;
export const SPECIALIST_EFFORT = "medium" as const;
export const RESEARCH_EFFORT = "low" as const;

/** Server tools (Anthropic-hosted). The 2026-02-09 variants run dynamic
 *  filtering, available on both models above. */
export const WEB_SEARCH_TOOL = "web_search_20260209" as const;
export const WEB_FETCH_TOOL = "web_fetch_20260209" as const;

/** A mission's spend ceiling, in euros. Past WRAP_UP_SHARE of it the
 *  orchestrator is told to save what it has and finish; at the ceiling the loop
 *  stops. Override with MANDATE_MISSION_BUDGET_EUR. */
export const MISSION_BUDGET_EUR = 2.5;
export const WRAP_UP_SHARE = 0.7;
