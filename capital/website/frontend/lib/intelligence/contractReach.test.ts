import { describe, expect, it } from "vitest";
import { checkBrief, readerText } from "./briefChecks";
import { checkSelection } from "./selectionChecks";
import { UNENFORCED_RULES } from "./unenforcedRules";
import { loadContracts } from "./contracts";

/**
 * These tests exist to prove the new checks CAN FIRE. This repo's defining
 * defect is a check that runs and cannot fail, and four of the rules touched
 * here were instances of it. Each block therefore states the case the OLD
 * predicate returned clean on, and asserts the new one does not.
 */

const row = (over: Record<string, unknown> = {}) => ({
  institution: "Some Agency", channel: "x", supportType: "Grant",
  ticket: "EUR 1M to 5M", country: "DE", comparableFirms: [],
  whyEligible: "Your project cost sits inside this scheme's band.",
  nextStep: "Open a dossier with the regional office.",
  ...over,
});
const report = (over: Record<string, unknown> = {}) => ({
  bottomLine: ["a", "b", "c", "d"],
  institutions: [row()],
  positioning: "p", stateOfPlay: "s", caveats: "c",
  ...over,
});

// ── BRIEF-3 / VOI-B1: the fields nobody was scanning ───────────────────────
// The old predicate joined NINE named fields. The report renders far more, and
// every one of the fields below is on the page.
describe("BRIEF-3 reaches every field a founder reads, not nine of them", () => {
  const OUTSIDE_THE_OLD_UNION = [
    "legalBasis", "supportType", "descriptor", "familyName",
    "applicationChannel", "registeredPurpose",
  ];

  it("the old nine-field union did not include these", () => {
    // The union that shipped, written out. If any of these were in it, the
    // case below would not be a new one and this test would be theatre.
    const OLD_UNION = ["bottomLine", "positioning", "stateOfPlay", "caveats",
      "whyEligible", "nextStep", "blocker", "institution", "ticket"];
    for (const f of OUTSIDE_THE_OLD_UNION) expect(OLD_UNION).not.toContain(f);
  });

  for (const field of OUTSIDE_THE_OLD_UNION) {
    it(`fires on an em-dash in ${field}`, () => {
      const v = checkBrief(report({ institutions: [row({ [field]: "Some text — with a dash" })] }));
      expect(v.map((x) => x.ruleId)).toContain("BRIEF-3");
    });
  }

  it("fires on an em-dash nested in an array of strings", () => {
    const v = checkBrief(report({
      institutions: [row({ judgementCriteria: ["fine", "not — fine"] })],
    }));
    expect(v.map((x) => x.ruleId)).toContain("BRIEF-3");
  });

  it("does not fire on a URL, which is an identifier and not prose", () => {
    const v = checkBrief(report({
      institutions: [row({ link: { url: "https://x.example/a—b", kind: "apply", label: "Apply" } })],
    }));
    expect(v.map((x) => x.ruleId)).not.toContain("BRIEF-3");
  });

  it("VOI-B1 fires where the product describes its own machinery to the reader", () => {
    const v = checkBrief(report({ positioning: "Two encoded gates pass, so your gate coverage is good." }));
    expect(v.map((x) => x.ruleId)).toContain("VOI-B1");
  });

  it("VOI-B1 does not fire on ordinary prose about funds", () => {
    const v = checkBrief(report({ positioning: "The programme reopens in the fourth quarter." }));
    expect(v.map((x) => x.ruleId)).not.toContain("VOI-B1");
  });
});

describe("readerText walks the report rather than a list", () => {
  it("finds a string at any depth", () => {
    expect(readerText({ a: { b: [{ c: "deep" }] } })).toContain("deep");
  });
  it("skips machine identifiers", () => {
    expect(readerText({ url: "https://x", channel: "eic", instrumentId: "abc" })).toEqual([]);
  });
});

// ── FUND-B1, a Banned rule, which had never been checked ──────────────────
describe("FUND-B1: the table's own facts, restated in prose", () => {
  it("fires when a bullet repeats the ticket the column already shows", () => {
    const v = checkBrief(report({
      bottomLine: ["Target the regional grant at EUR 1M to 5M.", "b", "c", "d"],
    }));
    expect(v.map((x) => x.ruleId)).toContain("FUND-B1");
  });

  it("fires when positioning names a firm the comparables column already names", () => {
    const v = checkBrief(report({
      institutions: [row({ comparableFirms: [{ name: "Kappelhoff Systems", amount: "EUR 2M" }] })],
      positioning: "Kappelhoff Systems took the same route two years ago.",
    }));
    expect(v.map((x) => x.ruleId)).toContain("FUND-B1");
  });

  it("does not fire on a short value that is an ordinary word", () => {
    const v = checkBrief(report({
      institutions: [row({ supportType: "Grant" })],
      positioning: "Grant funding is the right shape here.",
    }));
    expect(v.map((x) => x.ruleId)).not.toContain("FUND-B1");
  });
});

// ── SELECT-1 / SELECT-2, in a contract nothing loaded ─────────────────────
describe("checkSelection", () => {
  it("fires when the model returns more than asked for", () => {
    const v = checkSelection([0, 1, 2, 3, 4, 5], 40, 5);
    expect(v.map((x) => x.ruleId)).toContain("SELECT-1");
  });
  it("fires when the model repeats an index", () => {
    expect(checkSelection([0, 1, 2, 3, 3], 40, 5).map((x) => x.ruleId)).toContain("SELECT-1");
  });
  it("fires on an index outside the list, in either direction", () => {
    expect(checkSelection([0, 1, 2, 3, 40], 40, 5).map((x) => x.ruleId)).toContain("SELECT-2");
    expect(checkSelection([-1, 1, 2, 3, 4], 40, 5).map((x) => x.ruleId)).toContain("SELECT-2");
  });
  it("is clean on a well-formed selection", () => {
    expect(checkSelection([7, 0, 22, 3, 19], 40, 5)).toEqual([]);
  });
  // The harness repaired both of these before measuring, which is why neither
  // rule had ever been observed to break.
  it("sees what `.slice(0,5)` and a range filter would have hidden", () => {
    const raw = [0, 1, 2, 3, 4, 99];
    const repaired = raw.slice(0, 5).filter((i) => i >= 0 && i < 40);
    expect(checkSelection(repaired, 40, 5)).toEqual([]);       // the old view
    expect(checkSelection(raw, 40, 5).length).toBeGreaterThan(0); // the truth
  });
});

// ── The register is a build gate, not documentation ───────────────────────
describe("every contract rule is enforced or declared unenforced", () => {
  it("holds over every contract, including the ones the loader used to skip", () => {
    const ids = loadContracts().flatMap((c) => c.ruleIds);
    expect(ids.length).toBeGreaterThan(80);
    // The Banned rules the enforcement regex could not see, and the SELECT
    // rules the loader never read, are all in the population now.
    expect(ids).toContain("FUND-B1");
    expect(ids).toContain("SELECT-1");
    expect(ids.filter((i) => /-B\d+$/.test(i)).length).toBe(15);
  });

  it("every declared entry says what would decide it", () => {
    for (const [id, r] of Object.entries(UNENFORCED_RULES)) {
      expect(r.predicate.length, `${id} has no predicate`).toBeGreaterThan(20);
    }
  });
});
