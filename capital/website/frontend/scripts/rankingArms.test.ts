/** A run may not assert its own shipped default.
 *
 *  `measure_funnel.ts` declares each ranking arm with the value it is running
 *  and the value production ships. The second one was a STRING LITERAL, and on
 *  2026-08-17 the owner flipped `AWARD_TERM`'s default to `oneside` while the
 *  literal here went on saying `shipped`. Every funnel run for two days printed
 *  a full-width "NOT THE SHIPPED ORDER — an arm no founder receives" banner
 *  about the order every founder receives, and wsIQ discounted a correct 38.91%
 *  because of it.
 *
 *  The defect is not the stale value. It is that a literal CAN be stale: the
 *  default lives in the parser, and anything that restates it is a second copy
 *  free to drift. Same shape as `_wsho_strata.ts` printing "this run is at
 *  `medium`" while running at `low`, and as the row-cap that was stated in a
 *  contract nothing read.
 *
 *  So the property is about the SHAPE, not the value: every `shipped` in that
 *  table is a call, and the test for an arm nobody has written yet is that it
 *  cannot be added as a literal without failing here. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const SRC = path.join(__dirname, "measure_funnel.ts");

describe("a ranking arm's shipped default is read, not typed", () => {
  const src = readFileSync(SRC, "utf8");
  // From `= [` rather than from `const`, so the TYPE ANNOTATION on the line
  // above -- which legitimately reads `shipped: string` -- is not mistaken for
  // a typed default. The first version of this test failed on it.
  const start = src.indexOf("const RANKING_ARMS");
  const table = src.slice(
    src.indexOf("= [", start) + 3,
    src.indexOf("];", start),
  );

  it("finds the table at all", () => {
    expect(table).toContain("label:");
    expect(table.match(/shipped:/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it("declares no `shipped` as a string literal", () => {
    // `shipped: "off"` is the defect; `shipped: parsePoolBlend(undefined)` is
    // the repair. Quote characters after the colon are the whole test.
    const typed = [...table.matchAll(/shipped:\s*(["'`])/g)];
    expect(
      typed.map((m) => m[0]),
      "a shipped default typed as a literal is a second copy of the parser's "
        + "default, and it is free to drift the day somebody flips it",
    ).toEqual([]);
  });

  it("gives every arm a shipped default that calls something", () => {
    const arms = [...table.matchAll(/shipped:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
    expect(arms.length).toBeGreaterThan(0);
    for (const a of arms) expect(a, `shipped: ${a}`).toMatch(/\(\s*undefined\s*\)$/);
  });
});
