/**
 * THE SILENCE-BREAKER, PUT WHERE THE TRAFFIC IS.
 *
 * `check_red_debt.ts` can only end the silence if something actually runs it,
 * and the whole finding behind it is that the two places a check normally lives
 * do not reach anybody here:
 *
 *   CI              runs on every push and is UNOBSERVABLE. The repository is
 *                   private and no checkout in this project carries a GitHub
 *                   token, so `gh run list` fails and the Actions API 404s for
 *                   every agent. Six checks were red in CI across 139
 *                   consecutive commits on main and nothing said so.
 *   npm run check   is twelve minutes and needs DATABASE_URL, so it is run at
 *                   the end of a workstream, if at all.
 *
 * `npx vitest run` is four seconds, needs nothing, and is in the verification
 * block of every agent brief this repo writes. It is the one command that is
 * genuinely always run. So the property lives here too.
 *
 * This is not a second definition of the rule — `judgeSuite` is imported, and
 * the CLI imports the same function. It is the same judgement, in the place
 * where somebody will see it.
 */
import { describe, expect, it } from "vitest";
import {
  judgeSuite, loadAccepted, loadRecord, loadTiers, suiteLabels, report,
  MAX_OBSERVATION_AGE_DAYS,
} from "./lib/suiteStatus";
import { selfTest, SELF_TEST_CASES } from "./lib/suiteStatus.selftest";

describe("a red check is owned, and a green one is not accepted", () => {
  it("its own detector still fails on every clause", () => {
    expect(SELF_TEST_CASES.length).toBeGreaterThanOrEqual(12);
    expect(() => selfTest()).not.toThrow();
  });

  it("every check says who experiences its failure", () => {
    const suite = suiteLabels();
    const tiers = loadTiers();
    // The question that was never asked while the suite went from 0 checks on
    // 14 July to 59 on 18 August. A check with no answer cannot be in the suite.
    expect(suite.filter((l) => !tiers[l])).toEqual([]);
    expect(Object.keys(tiers).filter((l) => !suite.includes(l))).toEqual([]);
  });

  it("reads the suite off the runner, not off a second list", () => {
    // Non-vacuity: a parse that quietly returned nothing would make every
    // assertion below pass by having no subject.
    expect(suiteLabels().length).toBeGreaterThanOrEqual(40);
  });

  it(`every check is observed, no older than ${MAX_OBSERVATION_AGE_DAYS}d, and green or owned`, () => {
    const j = judgeSuite(
      suiteLabels(), loadRecord(), loadAccepted(), Date.now(), loadTiers());
    // The failure carries the WHOLE report, not a count. This file exists
    // because thirteen reds printed as one fact is a fact nobody reads, and a
    // test that says "3 problems" would repeat that at one remove. Held
    // failures are printed too, on every run, because an acceptance nobody
    // sees is indistinguishable from a check that never looked.
    expect(j.problems.map((p) => `${p.label}: ${p.why}`), report(j)).toEqual([]);
  });
});
