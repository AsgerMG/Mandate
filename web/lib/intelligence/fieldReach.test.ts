// The red proof for `productionCannotPopulate`.
//
// The rule it enforces — a replay may answer a field only if production can
// populate it — is worth nothing unless its FAILING case has been seen. So the
// cases below are written against a SYNTHETIC field that does not exist in the
// intake, which is the "added next month" case the property has to survive,
// and only then against the real table. A test that only asserted today's
// answer for today's fields would pass on an enumeration and is exactly what
// this replaces.
import { describe, expect, it } from "vitest";

import {
  productionCannotPopulate, unofferableValues, unpopulatedFields, unpopulatedNote,
} from "./fieldReach";
import { FIELD_ENUM_HINTS, FIELD_REACH } from "./types";
import type { EligibilityAnswers } from "./types";
import type { FieldReachability } from "./types";

type Field = keyof EligibilityAnswers;

/** A field the intake does not have. Injected into the real Record so the
 *  predicate is exercised on a declaration nobody has written yet. */
const FUTURE = "aFieldAddedNextMonth" as Field;
const withFuture = (reach: FieldReachability) => {
  const table = FIELD_REACH as unknown as Record<string, FieldReachability>;
  table[FUTURE as string] = reach;
  return () => { delete table[FUTURE as string]; };
};

describe("a field nobody has added yet", () => {
  it("is answerable when a control on a screen sets it", () => {
    const undo = withFuture({ via: "first_page" });
    try { expect(productionCannotPopulate(FUTURE, {})).toBeNull(); } finally { undo(); }
  });

  it("is answerable when the adaptive round may ask it", () => {
    const undo = withFuture({ via: "adaptive" });
    try { expect(productionCannotPopulate(FUTURE, {})).toBeNull(); } finally { undo(); }
  });

  it("is answerable when the product pins it to a constant", () => {
    // Production supplies the same value to everyone, so a replay that pins
    // the same value agrees with production by construction.
    const undo = withFuture({ via: "constant" });
    try { expect(productionCannotPopulate(FUTURE, {})).toBeNull(); } finally { undo(); }
  });

  it("is answerable when the server derives it from another answer", () => {
    const undo = withFuture({ via: "derived" });
    try { expect(productionCannotPopulate(FUTURE, {})).toBeNull(); } finally { undo(); }
  });

  // ── THE FAILING CASES. This is the whole point of the file. ──────────────
  it("is REFUSED when nothing can answer it", () => {
    const undo = withFuture({ via: "unreachable" });
    try {
      expect(productionCannotPopulate(FUTURE, {})).toEqual({ why: "unreachable" });
    } finally { undo(); }
  });

  it("is REFUSED while its arm is off, and allowed the moment it is on", () => {
    const undo = withFuture({ via: "staged", armEnv: "SOME_FUTURE_ARM" });
    try {
      expect(productionCannotPopulate(FUTURE, {}))
        .toEqual({ why: "staged_off", armEnv: "SOME_FUTURE_ARM" });
      expect(productionCannotPopulate(FUTURE, { SOME_FUTURE_ARM: "off" }))
        .toEqual({ why: "staged_off", armEnv: "SOME_FUTURE_ARM" });
      // Any value that is not "on" is off — the arm modules read it the same
      // way, so a typo'd "true" does not quietly switch a question on.
      expect(productionCannotPopulate(FUTURE, { SOME_FUTURE_ARM: "true" }))
        .toEqual({ why: "staged_off", armEnv: "SOME_FUTURE_ARM" });
      expect(productionCannotPopulate(FUTURE, { SOME_FUTURE_ARM: "on" })).toBeNull();
    } finally { undo(); }
  });

  it("FAILS CLOSED on a staged field that names no arm", () => {
    const undo = withFuture({ via: "staged" });
    try {
      expect(productionCannotPopulate(FUTURE, {})).toEqual({ why: "staged_unnamed" });
    } finally { undo(); }
  });

  it("refuses a field with no reach declaration at all", () => {
    expect(productionCannotPopulate("neverDeclared" as Field, {}))
      .toEqual({ why: "unreachable" });
  });
});

describe("the real intake, read through the same predicate", () => {
  it("agrees with FIELD_REACH on every field, with no list of its own", () => {
    for (const f of Object.keys(FIELD_REACH) as Field[]) {
      const reach = FIELD_REACH[f];
      const armOn = reach.via === "staged" && reach.armEnv
        && process.env[reach.armEnv] === "on";
      const expectBlocked = reach.via === "unreachable"
        || (reach.via === "staged" && !armOn);
      expect(productionCannotPopulate(f) !== null, `${f} (via=${reach.via})`)
        .toBe(expectBlocked);
    }
  });

  it("is not vacuous — the intake really does hold fields production leaves empty", () => {
    // If this ever reads zero, either every field became answerable (good, and
    // the harness should be re-measured) or the predicate stopped working
    // (bad). Either way it is a change somebody must look at, and a silent
    // pass is what this repo's dead counters looked like.
    const found = unpopulatedFields();
    expect(found.length).toBeGreaterThan(0);
    for (const { field, reason } of found) {
      expect(unpopulatedNote(String(field), reason)).toContain(String(field));
    }
  });

  // ── The same rule one level down: is the ANSWER on the menu? ─────────────
  it("accepts a value the founder's own control offers, and refuses one it does not", () => {
    // Read the menu from production rather than naming a value, so this case
    // survives a vocabulary change that would make any literal here stale.
    const [f, hint] = Object.entries(FIELD_ENUM_HINTS)
      .find(([, h]) => !h.optionsFor && h.options.length && !h.multi) as
        [string, { options: { value: string }[] }];
    const field = f as Field;
    expect(unofferableValues(field, hint.options[0].value, {})).toEqual([]);
    expect(unofferableValues(field, "not-on-any-menu", {}))
      .toEqual(["not-on-any-menu"]);
  });

  it("names ONLY the offending members of a multi-answer", () => {
    const [f, hint] = Object.entries(FIELD_ENUM_HINTS)
      .find(([, h]) => !h.optionsFor && h.options.length && h.multi) as
        [string, { options: { value: string }[] }];
    expect(unofferableValues(f as Field, [hint.options[0].value, "invented"], {}))
      .toEqual(["invented"]);
  });

  it("judges an answer-dependent menu against THIS founder's answers", () => {
    // `region`'s options are derived from the country, so the same value is
    // offerable to one founder and not to another. A predicate that read a
    // fixed list could not tell the two apart, which is the whole reason
    // `optionsFor` takes the answers.
    const withOptions = Object.entries(FIELD_ENUM_HINTS)
      .find(([, h]) => Boolean(h.optionsFor));
    expect(withOptions, "no answer-dependent field left to exercise").toBeTruthy();
    const [f, hint] = withOptions as [string, {
      optionsFor?: (a: Record<string, unknown>) => { value: string }[] }];
    const answers = { entityCountries: ["France"] };
    const menu = hint.optionsFor?.(answers) ?? [];
    expect(menu.length, "the probe country offers no options").toBeGreaterThan(0);
    expect(unofferableValues(f as Field, menu[0].value, answers as never)).toEqual([]);
    // A value that IS on some other founder's menu, and not on this one's.
    const elsewhere = hint.optionsFor?.({ entityCountries: ["Spain"] }) ?? [];
    const alien = elsewhere.find((o) => !menu.some((m) => m.value === o.value));
    expect(alien, "the two countries share every region code").toBeTruthy();
    expect(unofferableValues(f as Field, alien!.value, answers as never))
      .toEqual([alien!.value]);
  });

  it("claims nothing about a field with no enumerable menu", () => {
    // Free text and country lists. "Cannot judge" must not read as "fine" by
    // accident, so it is asserted rather than left implicit.
    expect(unofferableValues("entityCountries" as Field, ["Atlantis"], {})).toEqual([]);
  });

  it("holds the arm state, not a field name — flipping every arm on unblocks the staged half", () => {
    const env: Record<string, string> = {};
    for (const reach of Object.values(FIELD_REACH)) {
      if (reach.via === "staged" && reach.armEnv) env[reach.armEnv] = "on";
    }
    const stillBlocked = unpopulatedFields(env);
    for (const { reason } of stillBlocked) expect(reason.why).toBe("unreachable");
  });
});
