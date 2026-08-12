import { describe, expect, it } from "vitest";
import { isWatchOnly } from "./watchOnly";

/**
 * ── WHAT THESE TESTS ARE NOW ABOUT (wsGK) ─────────────────────────────────
 * They used to open "the rule: a brief NEVER shows a fund that is deprioritised
 * or not relevant", and they were pinning a gate. The gate is gone: nothing
 * downstream of this function removes, demotes or reorders a row, because a
 * regex over one model's prose was overruling another model's ranking, and at
 * 8 candidates to 7 published it evicted the fund it matched on at any rank.
 *
 * What is left is a DETECTOR feeding two reports — FUND-4 on the scoreboard and
 * WRT-WATCH-ONLY in the exclusion log. So these cases are still worth holding
 * (a detector that misses is a report that lies), and the cost of each miss is
 * now a line, not a fund. The false-positive cases below matter for the same
 * reason and no longer cost a founder anything.
 *
 * The signature lost its first argument with wsDO: `WRT-NOT-WORTH` was deleted,
 * no writer schema carries an actionable flag, and every call site passed
 * `undefined` into the branch that read it.
 */
describe("watch-only detection", () => {
  it("does not treat empty copy as watch-only", () => {
    expect(isWatchOnly(undefined, undefined)).toBe(false);
    expect(isWatchOnly("Apply to the next open call")).toBe(false);
  });

  // The observation that built this: the writer marked rows actionable while
  // writing "Monitor the next call" and "Deprioritise unless the grant pipeline
  // falls short" into their next step. It was true then and is true now; what
  // changed is what the product does about it.
  it.each([
    "Monitor the next IPCEI Micro call",
    "Deprioritise unless the grant pipeline falls short",
    "Treat as informational only",
    "Revisit later once you have partners",
    "Keep an eye on upcoming calls",
    "Only pursue if you can frame a breakthrough",
  ])('reads "%s" as a thing to wait for', (nextStep) => {
    expect(isWatchOnly(nextStep)).toBe(true);
  });

  it("leaves genuinely actionable steps alone", () => {
    // Consortium-building is work a founder can start, not a fund to monitor.
    // Getting this wrong stripped Horizon out of briefs wholesale and dropped
    // rows-per-brief from 4.3 to 3.8 — back when a match still removed a row.
    for (const step of [
      "Recruit two EU partners and apply to Cluster 6",
      "Approach the Dutch ministry for sponsorship",
      "Apply for the EIC grant-only route first",
      "Scope a pilot-scale production line application",
    ]) {
      expect(isWatchOnly(step), step).toBe(false);
    }
  });

  it("also reads the justification, not only the next step", () => {
    expect(isWatchOnly("Apply now", "Monitor this one for later")).toBe(true);
  });

  // ── THE LIMIT OF A REGISTER, PINNED RATHER THAN LEFT TO BE DISCOVERED ────
  // Eleven phrasings is a list, not a property, and this is what a list does at
  // its edge: the same instruction in words it does not hold. The assertion is
  // `false` because that is what the code returns, and it is written down so
  // that anyone who wants this to decide something reads the miss first.
  it("misses the same instruction in words it does not list", () => {
    expect(isWatchOnly("Hold until a consortium forms")).toBe(false);
    expect(isWatchOnly("Come back to this after the Series A closes")).toBe(false);
  });
});
