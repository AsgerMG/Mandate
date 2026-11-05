import { describe, expect, it } from "vitest";

import { schemeSiblings } from "./agentSelect";
import type { InstrumentRow } from "./types";

const row = (over: Partial<InstrumentRow>): InstrumentRow => ({
  channel: "satr", instrument: "a scheme", ticket: "", usedInField: false, fit: "",
  ...over,
});

describe("schemeSiblings", () => {
  it("is silent for a row whose scheme code no other row on the menu shares", () => {
    const rows = [row({ schemeCode: "SA.1" }), row({ schemeCode: "SA.2" })];
    const s = schemeSiblings(rows);
    expect(s(0)).toBe("");
    expect(s(1)).toBe("");
  });

  it("names every other index in the group, and never itself", () => {
    const rows = [
      row({ schemeCode: "SA.111723" }),
      row({ schemeCode: "SA.999" }),
      row({ schemeCode: "SA.111723" }),
      row({ schemeCode: "SA.111723" }),
    ];
    const s = schemeSiblings(rows);
    expect(s(0)).toBe("notified under the same scheme (SA.111723) as [2], [3]");
    expect(s(2)).toBe("notified under the same scheme (SA.111723) as [0], [3]");
    expect(s(1)).toBe("");
  });

  it("is silent where there is no code at all, and does not group the blanks", () => {
    // The failure this pins: keying on `schemeCode ?? ""` puts every row that
    // has no notified scheme into one enormous group, and the menu then tells
    // the model that eighteen unrelated funds are one option.
    const rows = [row({}), row({ schemeCode: "" }), row({ schemeCode: "  " })];
    const s = schemeSiblings(rows);
    expect([s(0), s(1), s(2)]).toEqual(["", "", ""]);
  });

  it("states a fact about a pair and issues no instruction", () => {
    // A rule would suppress a fund. `applyPeerPrecedence` measured that trade:
    // pool recall 97% -> 83% when the notified-scheme repeat was made a filter,
    // and the dedupe that collapsed SA.111723's leaves was 50% of all misses.
    // So the line may say WHO shares a regime and may not say which to take.
    const rows = [row({ schemeCode: "SA.1" }), row({ schemeCode: "SA.1" })];
    const line = schemeSiblings(rows)(0);
    expect(line).toContain("[1]");
    expect(line).not.toMatch(/\b(pick|choose|only|at most|instead|do not|skip)\b/i);
  });
});
