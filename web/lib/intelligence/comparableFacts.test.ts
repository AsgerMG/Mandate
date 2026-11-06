import { describe, expect, it } from "vitest";

import {
  ANSWER_TELLS_COMPARABLE, COMPARABLE_FIELDS, comparableFactLines,
} from "./comparableFacts";
import { intakeFactLines } from "./knownFacts";
import { comparableSearchContext } from "./research";
import { ANSWER_LABEL, type EligibilityAnswers, type IntelligenceRequest } from "./types";

/** One answer for every field, so a rendering that drops one is visible. */
const ALL: EligibilityAnswers = {
  sector: "energy_cleantech",
  useOfFunds: ["capex_plant_equipment"],
  developmentStage: "pilot_customers",
  fteBand: "10-49",
  turnoverBand: "2-10M",
  balanceBand: "2-43M",
  ticketBand: "b2m5_15m",
  organisationType: "company",
  entityCountries: ["Denmark"],
  region: "DK01",
  consortium: "yes",
  lossesOverHalfCapital: "yes",
  exclusionFlags: ["none"],
  institutionalBacking: "yes",
  needBy: "months_6",
};

/** `fence()` stamps a `Math.random()` nonce into the description block as an
 *  injection defence, so NO two renders of one request are byte-identical --
 *  the fact that made wsII's textual prompt diff score 76 of 76 founders as
 *  "changed" and measure nothing. Every comparison here is on the nonce-free
 *  string, which is what "byte-identical" can honestly mean for this stage. */
const stable = (s: string) => s.replace(/id="[a-z0-9]+"/g, 'id="N"');

const req = (eligibility?: EligibilityAnswers) => ({
  company: "Probe ApS", country: "Denmark",
  description: "We build electrolysers.", eligibility,
} as IntelligenceRequest);

describe("the comparable-fact property", () => {
  // The compiler already forces an entry per field; this forces the entry to
  // SAY something. A refusal whose reason is blank is a field somebody skipped.
  it("gives every refused field a reason", () => {
    for (const [f, d] of Object.entries(ANSWER_TELLS_COMPARABLE)) {
      if (!d.tells) expect(d.reason.length, `${f} refused with no reason`).toBeGreaterThan(20);
    }
  });

  it("admits strictly fewer fields than the full intake block", () => {
    expect(COMPARABLE_FIELDS.length).toBeLessThan(Object.keys(ANSWER_LABEL).length);
    expect(COMPARABLE_FIELDS.length).toBeGreaterThan(0);
  });

  // The whole point of the parameter on `intakeFactLines`: one renderer, and
  // the narrowed block is a SUBSET of the full one line for line. A second
  // renderer would pass every other test in this file and fail this one the
  // day a label is reworded.
  it("renders through the one renderer, so its lines are a subset", () => {
    const full = intakeFactLines(ALL);
    const narrow = comparableFactLines(ALL);
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.length).toBeLessThan(full.length);
    for (const line of narrow) expect(full).toContain(line);
  });

  it("states every admitted field the founder answered, and no refused one", () => {
    const block = comparableFactLines(ALL).join("\n");
    for (const f of COMPARABLE_FIELDS) {
      if ((ALL as Record<string, unknown>)[f] === undefined) continue;
      expect(block, `admitted ${f} missing`).toContain(`${ANSWER_LABEL[f]}:`);
    }
    for (const [f, d] of Object.entries(ANSWER_TELLS_COMPARABLE)) {
      if (d.tells || (ALL as Record<string, unknown>)[f] === undefined) continue;
      expect(block, `refused ${f} present`)
        .not.toContain(`${ANSWER_LABEL[f as keyof EligibilityAnswers]}:`);
    }
  });
});

describe("the comparable-search context", () => {
  // The arm defaults to the control, so an unset environment serves what it
  // has always served. This is the assertion that keeps the default honest.
  it("is unchanged by the founder's answers on the control arm", () => {
    expect(stable(comparableSearchContext(req(ALL), "description")))
      .toBe(stable(comparableSearchContext(req(undefined), "description")));
  });

  it("adds the admitted answers, and only those, on the treatment arm", () => {
    const control = stable(comparableSearchContext(req(ALL), "description"));
    const treatment = stable(comparableSearchContext(req(ALL), "answers"));
    expect(treatment.startsWith(control)).toBe(true);
    const added = treatment.slice(control.length);
    expect(added).toContain(ANSWER_LABEL.developmentStage);
    expect(added).not.toContain(ANSWER_LABEL.lossesOverHalfCapital);
    // Said to be judged on, not filtered on. A search that narrows finds fewer
    // DB-matchable peers, which is how this arm loses.
    expect(added).toContain("NOT a filter");
  });

  it("is byte-identical on both arms for a founder who answered nothing", () => {
    expect(stable(comparableSearchContext(req(undefined), "answers")))
      .toBe(stable(comparableSearchContext(req(undefined), "description")));
  });
});
