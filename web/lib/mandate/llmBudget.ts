// THE model-budget switch, TypeScript side. Same env name and same rule as
// mandate/llm/budget.py (the Python side): LLM_BUDGET unset or "on" means paid
// calls run; "off" (or 0/false/no/paused) means they do not. A typo is ON, so it
// cannot silently stop the product. Flip it everywhere: mandate/ops/set_llm_budget.sh.
//
// Two ways to have no budget, one outcome: the switch is off, or Anthropic
// answers 400 "Your credit balance is too low". Both read as ADVISOR_PAUSED.

const OFF_VALUES = new Set(["off", "0", "false", "no", "paused"]);
const CREDIT_PHRASE = "credit balance is too low";

export const ADVISOR_PAUSED = "The advisor is paused: no model budget.";

export function llmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !OFF_VALUES.has((env.LLM_BUDGET ?? "").trim().toLowerCase());
}

/** Is this Anthropic's credit-exhausted error (anywhere in its message or cause)? */
export function isBudgetExhausted(error: unknown): boolean {
  const seen = new Set<unknown>();
  let e: unknown = error;
  while (e != null && !seen.has(e)) {
    seen.add(e);
    const text = typeof e === "string" ? e
      : e instanceof Error ? `${e.message} ${JSON.stringify((e as { error?: unknown }).error ?? "")}`
      : JSON.stringify(e);
    if (text.toLowerCase().includes(CREDIT_PHRASE)) return true;
    e = typeof e === "object" ? (e as { cause?: unknown }).cause : undefined;
  }
  return false;
}
