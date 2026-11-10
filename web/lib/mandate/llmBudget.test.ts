import { describe, expect, it } from "vitest";
import { isBudgetExhausted, llmEnabled } from "./llmBudget";

describe("LLM_BUDGET switch (same rule as mandate/llm/budget.py)", () => {
  it("is on by default and on for anything but an off value", () => {
    expect(llmEnabled({})).toBe(true);
    expect(llmEnabled({ LLM_BUDGET: "on" })).toBe(true);
    expect(llmEnabled({ LLM_BUDGET: "of" })).toBe(true);
  });

  it("is off for off, in any case", () => {
    expect(llmEnabled({ LLM_BUDGET: "off" })).toBe(false);
    expect(llmEnabled({ LLM_BUDGET: " OFF " })).toBe(false);
  });

  it("classifies Anthropic's credit-exhausted 400 and nothing else", () => {
    const err = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}');
    expect(isBudgetExhausted(err)).toBe(true);
    expect(isBudgetExhausted(new Error("wrapped", { cause: err }))).toBe(true);
    expect(isBudgetExhausted("Your credit balance is too low")).toBe(true);
    expect(isBudgetExhausted(new Error("529 overloaded"))).toBe(false);
    expect(isBudgetExhausted(undefined)).toBe(false);
  });
});
