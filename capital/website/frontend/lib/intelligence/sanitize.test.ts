import { describe, expect, it } from "vitest";
import { sanitizeEligibility, sanitizeFreeText, MAX_DESCRIPTION_CHARS } from "./sanitize";
import { VOCABULARY } from "./vocabulary";

/**
 * The sanitiser is the only thing between a real request and the pipeline, and
 * it DROPS silently — an unrecognised value simply disappears with no error.
 * That is what made the worst bug of this project invisible for a day.
 */
describe("every offered answer survives the sanitiser", () => {
  // THE BUG: sanitize.ts kept a hand-copy of the sector list. When the
  // vocabulary was split, the copy went stale, so every live request through
  // /api/intelligence had its sector silently discarded — while memo_bench,
  // which calls the pipeline directly and bypasses the route, reported nothing
  // wrong. `activities` was never added at all.
  const fields = Object.entries(VOCABULARY).filter(([, v]) => v.values.length > 0);

  it.each(fields)("%s", (field, vocab) => {
    for (const value of vocab.values) {
      const input = vocab.multi ? { [field]: [value] } : { [field]: value };
      const out = (sanitizeEligibility(input) ?? {}) as Record<string, unknown>;
      const kept = vocab.multi
        ? Array.isArray(out[field]) && (out[field] as string[]).includes(value)
        : out[field] === value;
      expect(kept, `"${value}" is offered for ${field} but the sanitiser drops it`).toBe(true);
    }
  });
});

describe("rejecting what is not offered", () => {
  it("drops a value outside the vocabulary rather than passing it through", () => {
    const out = (sanitizeEligibility({ sector: "not_a_real_sector" }) ?? {}) as Record<string, unknown>;
    expect(out.sector).toBeUndefined();
  });

  it("drops a retired vocabulary value", () => {
    // The pre-split sector names must not quietly still work: a stale client
    // should fail visibly, not be silently accepted into a different meaning.
    for (const retired of ["software_digital", "hardware_robotics", "health_lifesciences"]) {
      const out = (sanitizeEligibility({ sector: retired }) ?? {}) as Record<string, unknown>;
      expect(out.sector).toBeUndefined();
    }
  });

  it("ignores a non-array for a list field", () => {
    const out = (sanitizeEligibility({ activities: "tobacco" }) ?? {}) as Record<string, unknown>;
    expect(out.activities).toBeUndefined();
  });
});

describe("free text bounds", () => {
  // THE BUG: the description reaches eight prompt sites and is the only
  // unbounded unauthenticated input. /verdict capped it at 400 chars; the two
  // PAID routes capped it at nothing, so one request could inflate every
  // prompt in a six-call run.
  it("truncates past the cap", () => {
    const out = sanitizeFreeText("x".repeat(MAX_DESCRIPTION_CHARS + 5_000));
    expect(out).toBeDefined();
    expect(out!.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
  });

  it("leaves ordinary input untouched", () => {
    const text = "Farm management software and soil carbon programmes for arable growers";
    expect(sanitizeFreeText(text)).toBe(text);
  });

  it("returns undefined for empty or non-string input", () => {
    expect(sanitizeFreeText("   ")).toBeUndefined();
    expect(sanitizeFreeText(undefined)).toBeUndefined();
    expect(sanitizeFreeText(42)).toBeUndefined();
  });
});
