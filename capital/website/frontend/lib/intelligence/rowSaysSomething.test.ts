// wsFG — A ROW THAT SAYS NOTHING CAN ONLY BE CHOSEN BY ITS POSITION.
//
// A candidate row carries a title, a facts line WE compose, and then the
// sentences that come from the fund itself: what it funds, who may apply, what
// it assesses. Strip all three and the selector has nothing to select ON — it
// can only keep the order it was handed, which is the empirical ranker's answer
// restated. Measured on the real menu before this workstream (`_wsfg_silence`):
// one founder moved across fourteen markets read 252 rows and 56 of them said
// nothing at all, 17 of 18 in Czechia and 15 of 18 in Estonia against zero in
// Germany and France.
//
// Two properties, both stated over an ARBITRARY menu rather than over the
// requirements this corpus happens to hold, so a fund nobody has seen yet is
// covered by the same rules:
//
//   1. A row that holds any requirement prints one, and the one it prints is
//      the least widely shared it holds.
//   2. What the fund says it PAYS FOR and what it says about WHO MAY APPLY are
//      two labelled lines, never one.
//
// Every case is PAIRED — an input that must speak beside the nearest input that
// must not — because a rule that always prints everything would pass a
// one-sided test as happily as a correct one.
//
// No database and no corpus: these are the rules, not the data.
import { describe, expect, it } from "vitest";

import { buildPrompt, distinctive } from "./agentSelect";
import type { InstrumentRow } from "./types";

const row = (over: Partial<InstrumentRow> = {}): InstrumentRow => ({
  instrument: "A programme",
  instrumentId: `i${Math.random().toString(36).slice(2)}`,
  channel: "some_channel",
  ...over,
} as InstrumentRow);

/** A requirement every row on the menu makes. Boilerplate by construction. */
const SHARED = "Aid is not available to an undertaking in difficulty.";
/** A second one, also universal, and MORE widely shared than SHARED so the
 *  "least shared" half of the property has something to be wrong about. */
const SHARED_MORE = "Tobacco, gambling and weapons are outside the scope.";

/** A menu of `n` rows that all say the same two things, plus whatever `head`
 *  adds to the first row. Long enough that the 0.35 cutoff is well above 2. */
function menu(n: number, head: string[] = []): InstrumentRow[] {
  return Array.from({ length: n }, (_, i) => row({
    instrument: `Programme ${i}`,
    judgementCriteria: i === 0 && head.length
      ? [...head, SHARED, SHARED_MORE]
      : [SHARED_MORE, SHARED],
  }));
}

describe("a row that holds a requirement prints one", () => {
  it("prints the row's own requirement when it has one nobody shares", () => {
    const rows = menu(20, ["Applicants must be located in Pays de la Loire."]);
    const pick = distinctive(rows);
    expect(pick(rows[0])).toEqual(["Applicants must be located in Pays de la Loire."]);
  });

  it("prints the LEAST SHARED one when every requirement it holds is common", () => {
    // The case that was printing nothing. Every row on this menu holds only the
    // two universal requirements, so the 0.35 cutoff excludes both — and the
    // row still has to say something.
    const rows = menu(20);
    const pick = distinctive(rows);
    // SHARED_MORE is on all 20 rows; SHARED is on 20 too, so make one strictly
    // rarer and assert THAT is the one chosen.
    rows[19].judgementCriteria = [SHARED_MORE];
    const pick2 = distinctive(rows);
    expect(pick2(rows[0])).toEqual([SHARED]);
    expect(pick(rows[0]).length).toBe(1);
  });

  it("prints NOTHING for a row that holds nothing — the paired case", () => {
    const rows = menu(20);
    rows[0].judgementCriteria = [];
    expect(distinctive(rows)(rows[0])).toEqual([]);
    expect(distinctive(rows)(row())).toEqual([]);
  });

  it("does not cap below what the row was given: no second slice", () => {
    // `JUDGEMENT_CAP` in shortlist.ts is the ONE place that decides how many
    // requirements a row holds. A smaller cut here silently discarded
    // requirements that stage had already selected as the row's best.
    const three = ["Rule A, unique.", "Rule B, unique.", "Rule C, unique."];
    const rows = menu(20, three);
    expect(distinctive(rows)(rows[0])).toEqual(three);
  });

  it("keeps the incoming order on a tie, which is own-before-inherited", () => {
    // shortlist.ts emits a scheme's OWN criteria before its regime's, and that
    // ordering is a correctness property there, not a presentation one.
    const rows = menu(20, []);
    const own = "The scheme's own rule.";
    const inherited = "State aid regime: the framework's rule.";
    for (const r of rows) r.judgementCriteria = [own, inherited];
    expect(distinctive(rows)(rows[0])[0]).toBe(own);
  });
});

describe("what it funds and who may apply are two lines, never one", () => {
  const FUNDS = "Finances collaborative R&D projects in industrial competitiveness.";
  const WHO = "Entreprises industrielles de toutes tailles situées en Hauts-de-France.";

  const promptFor = (over: Partial<InstrumentRow>) => buildPrompt(
    [row(over), ...menu(9)], {}, 0, 3);

  it("labels each separately when the fund answered both questions", () => {
    const p = promptFor({ description: FUNDS, eligibilityText: WHO });
    expect(p).toContain(`     funds: ${FUNDS}`);
    expect(p).toContain(`     who may apply: ${WHO}`);
    // And they are on different lines — a row that runs them together makes the
    // reader work out which half of a sentence is which.
    expect(p.split("\n").some((l) => l.includes(FUNDS) && l.includes(WHO))).toBe(false);
  });

  it("prints the who-may-apply line for a row with no description at all", () => {
    // The 115 rows this was worth: they had no `funds:` line, so before this
    // field the row's only sentences were requirements it might not hold.
    const p = promptFor({ description: undefined, eligibilityText: WHO });
    expect(p).toContain(`     who may apply: ${WHO}`);
    expect(p).not.toContain("     funds:");
  });

  it("prints neither label when the fund has said neither thing", () => {
    const p = promptFor({ description: undefined, eligibilityText: undefined });
    expect(p).not.toContain("     who may apply:");
    // The row is still rendered — it is silent, not absent, which is exactly
    // the state this workstream measured 56 of 252 rows in.
    expect(p).toContain("[0] A programme");
  });
});
