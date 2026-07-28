import { describe, expect, it } from "vitest";
import { isWatchOnly } from "./watchOnly";

/**
 * The rule: a brief NEVER shows a fund that is deprioritised or not relevant.
 * Enforcement cannot rest on the model's flag alone, which is what these
 * tests pin down.
 */
describe("watch-only detection", () => {
  it("honours an explicit false flag", () => {
    expect(isWatchOnly(false, "Apply to the next call")).toBe(true);
  });

  it("does not treat a missing flag as watch-only", () => {
    // An absent judgement must not silently demote a row — the same reasoning
    // as blockerPlain's default.
    expect(isWatchOnly(undefined, "Apply to the next open call")).toBe(false);
  });

  // THE BUG: the writer kept rows it had marked actionable while writing
  // "Monitor the next call" and "Deprioritise unless the grant pipeline falls
  // short" into their next step. Trusting the flag alone let those through.
  it.each([
    "Monitor the next IPCEI Micro call",
    "Deprioritise unless the grant pipeline falls short",
    "Treat as informational only",
    "Revisit later once you have partners",
    "Keep an eye on upcoming calls",
    "Only pursue if you can frame a breakthrough",
  ])('catches "%s" even when flagged actionable', (nextStep) => {
    expect(isWatchOnly(true, nextStep)).toBe(true);
  });

  it("leaves genuinely actionable steps alone", () => {
    // Consortium-building is work a founder can start, not a fund to monitor.
    // Getting this wrong stripped Horizon out of briefs wholesale and dropped
    // rows-per-brief from 4.3 to 3.8.
    for (const step of [
      "Recruit two EU partners and apply to Cluster 6",
      "Approach the Dutch ministry for sponsorship",
      "Apply for the EIC grant-only route first",
      "Scope a pilot-scale production line application",
    ]) {
      expect(isWatchOnly(true, step), step).toBe(false);
    }
  });

  it("also reads the justification, not only the next step", () => {
    expect(isWatchOnly(true, "Apply now", "Monitor this one for later")).toBe(true);
  });
});
