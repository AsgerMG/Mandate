// What a founder's capital preference may and may not remove.
//
// THE PROPERTY, stated once and tested here rather than enumerated anywhere:
// a stated preference removes a fund only on evidence that the fund does not
// provide what was asked for. `capital_type` is a single label chosen by a
// majority vote over the fund's own awards, and some of its values record that
// the vote produced no answer. Those values are silence, and a filter must not
// read silence as contradiction.
//
// No instrument id, scheme code, country or fund name appears in this file.
// The tests are written against the classification, so a capital type nobody
// has seen yet is covered by the same rules as the ones in the corpus today.
import { describe, expect, it } from "vitest";

import { DILUTIVE_FOR_TEST, passesCapitalPreference } from "./accessMode";
import type { DbInstrument } from "./corpus";
import {
  CAPITAL_SOUGHT_TO_DB, INDEFINITE_CAPITAL, KNOWN_CAPITAL_TYPES,
  instrumentServesCapital,
} from "./shortlist";
import { CAPITAL_OPTIONS } from "./types";

const OPTIONS = CAPITAL_OPTIONS.map((o) => o.value);

const inst = (capitalType: string): DbInstrument =>
  ({ id: "x", capitalType, gates: [] } as unknown as DbInstrument);

describe("a label that names no kind cannot remove a fund", () => {
  it("admits every indefinite capital type, whatever the founder asked for", () => {
    for (const type of INDEFINITE_CAPITAL) {
      for (const option of OPTIONS) {
        expect(instrumentServesCapital(type, [option]),
          `${type} must survive a founder who asked only for ${option}`).toBe(true);
      }
    }
  });

  it("does NOT extend that to a capital type nobody has classified", () => {
    // The tempting generalisation, and the wrong one. An UNRECORDED capital
    // type is not an unresolved mixture: there is nothing to enumerate, so
    // there is no evidence it is safe to show. Among the instruments carrying
    // `unknown` are vehicles named "portfolio" and "investments" whose typed
    // siblings carry equity, and admitting those to a grant-seeker is the exact
    // harm `passesCapitalPreference` exists to prevent (workstream AE).
    //
    // Keeping them excluded is also what keeps `check_capital_reach.ts` armed:
    // if an unclassified value were silently admitted, the ratchet that counts
    // funds no founder can reach would count zero forever.
    const unseen = "a_capital_type_no_option_has_been_mapped_to";
    expect(KNOWN_CAPITAL_TYPES.has(unseen)).toBe(false);
    expect(INDEFINITE_CAPITAL.has(unseen)).toBe(false);
    for (const option of OPTIONS) {
      expect(instrumentServesCapital(unseen, [option])).toBe(false);
    }
  });

  it("keeps `unknown` unreachable, which is workstream AE's ratchet", () => {
    // Pinned rather than assumed. This test exists because the first version of
    // the change made `unknown` reachable, which would have re-opened the harm
    // above and silently disarmed the ratchet at the same time.
    expect(INDEFINITE_CAPITAL.has("unknown")).toBe(false);
    for (const option of OPTIONS) {
      expect(instrumentServesCapital("unknown", [option])).toBe(false);
    }
  });

  it("still removes a fund whose label names a kind that was not asked for", () => {
    // The guard must not have been softened into a no-op: a definite label
    // that contradicts the founder still cuts.
    const definite = [...KNOWN_CAPITAL_TYPES];
    let contradictions = 0;
    for (const type of definite) {
      for (const option of OPTIONS) {
        const admits = (CAPITAL_SOUGHT_TO_DB[option] ?? []).includes(type);
        if (!admits) {
          expect(instrumentServesCapital(type, [option])).toBe(false);
          contradictions++;
        }
      }
    }
    expect(contradictions).toBeGreaterThan(0);
  });

  it("removes nothing when the founder stated no preference", () => {
    for (const type of [...KNOWN_CAPITAL_TYPES, ...INDEFINITE_CAPITAL]) {
      expect(instrumentServesCapital(type, [])).toBe(true);
    }
  });
});

describe("dilution is opt-in, and only a label that asserts dilution triggers it", () => {
  it("withholds a dilutive fund from a founder who did not ask for equity", () => {
    for (const type of DILUTIVE_FOR_TEST) {
      expect(passesCapitalPreference(inst(type), [])).toBe(false);
      expect(passesCapitalPreference(inst(type), ["grant", "loan"])).toBe(false);
      expect(passesCapitalPreference(inst(type), ["equity"])).toBe(true);
    }
  });

  it("never treats an indefinite label as evidence of dilution", () => {
    // A fund whose capital type records an unresolved vote is not thereby a
    // cap-table investor. Treating it as one took the corpus's largest debt
    // programme away from every founder who asked for debt, and offered it to
    // the founders who asked for the one thing it does not provide.
    for (const type of INDEFINITE_CAPITAL) {
      expect(DILUTIVE_FOR_TEST.has(type),
        `${type} names no kind of capital, so it cannot assert dilution`).toBe(false);
      expect(passesCapitalPreference(inst(type), [])).toBe(true);
    }
  });

  it("keeps the two rules consistent: nothing dilutive is also indefinite", () => {
    for (const type of DILUTIVE_FOR_TEST) {
      expect(INDEFINITE_CAPITAL.has(type)).toBe(false);
      expect(KNOWN_CAPITAL_TYPES.has(type)).toBe(true);
    }
  });
});

describe("every classification is deliberate", () => {
  it("no capital type is both mapped to an option and declared indefinite", () => {
    for (const type of INDEFINITE_CAPITAL) {
      expect(KNOWN_CAPITAL_TYPES.has(type),
        `${type} cannot both name a kind and name none`).toBe(false);
    }
  });

  it("every option admits at least one capital type", () => {
    // An option that maps to nothing is a question the founder answers and the
    // product then discards — the defect that was found once already, when an
    // option mapped to a capital type no instrument carried and the graded
    // fallback silently relaxed the whole filter.
    for (const option of OPTIONS) {
      expect((CAPITAL_SOUGHT_TO_DB[option] ?? []).length,
        `${option} admits no capital type at all`).toBeGreaterThan(0);
    }
  });
});
