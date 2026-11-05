import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * THE BUG THIS PINS: the shortlist computed `judgementCriteria` and
 * `structuringNotes` for every instrument row, `InstitutionEntry` declared
 * both, and `InstitutionsTable` rendered both ("What we can check" / "How the
 * money works") — but `buildInstitutions` in pipeline.ts never copied them from
 * the row to the entry. Neither block had ever appeared in a memo.
 *
 * Nothing caught it. tsc cannot: both fields are optional on InstitutionEntry,
 * so omitting them is legal. The archetype checks assert on verdicts and row
 * counts, not on what the memo renders. It was found by generating a real brief
 * on the live site and reading it.
 *
 * The general rule this defends: a field the shortlist computes and the report
 * component renders must survive the row -> entry hop. Asserted structurally
 * against the source, because buildInstitutions is module-private and the
 * alternative — exporting it purely to test it — widens the API for the test's
 * convenience.
 *
 * If this test fails, do not delete the assertion. Either carry the field
 * through buildInstitutions, or stop rendering it.
 */
const pipeline = readFileSync(
  path.join(process.cwd(), "lib/intelligence/pipeline.ts"), "utf8");
const report = readFileSync(
  path.join(process.cwd(), "lib/intelligence/panelReport.tsx"), "utf8");

/** The body of buildInstitutions — the mapping under test. */
function buildInstitutionsBody(): string {
  const start = pipeline.indexOf("function buildInstitutions(");
  expect(start, "buildInstitutions not found; was it renamed?").toBeGreaterThan(-1);
  const rest = pipeline.slice(start);
  const end = rest.indexOf("\n}\n");
  return rest.slice(0, end);
}

describe("instrument row -> institution entry", () => {
  /**
   * A PUBLISHED ROW CAN BE SAID WHICH FUND IT IS.
   *
   * `instrumentId` is the one field on the entry that is not a description of
   * the fund but the NAME of it, and it is the only one this test can state as
   * a property rather than as a rendered-field sweep: the sweep below asks
   * "does everything the table renders survive the hop", and identity is
   * precisely the thing the table does NOT render. So it needs its own
   * assertion or nothing has one.
   *
   * What its absence cost, twice, on the same day: `scripts/prodcheck.ts` had
   * to match a founder's won fund against the published table by NAME, and
   * reported a hit on a different notified scheme six years apart because the
   * won fund's name sat inside the other's rendered label; and
   * `brief_records.institutions` recorded seven rows per brief with no way to
   * say which funds they were.
   */
  it("the row's identity survives the hop, so a published row can be named", () => {
    expect(buildInstitutionsBody(),
      "buildInstitutions drops instrumentId, so nothing downstream of the writer "
      + "can say which fund a published row is")
      .toContain("instrumentId: row.instrumentId");
    // And it is RECORDED, not merely computed: a brief record that cannot name
    // its own rows is the same defect one layer down.
    expect(pipeline,
      "brief_records stores the published rows without their instrument ids")
      .toMatch(/institutions: report\.institutions\.map\([\s\S]{0,60}?instrumentId: i\.instrumentId/);
  });

  it.each(["judgementCriteria", "structuringNotes"])(
    "%s survives the hop into the memo", (field) => {
      // It is rendered...
      expect(report, `${field} is not rendered; this test may be obsolete`)
        .toContain(`r.${field}`);
      // ...so it must be carried.
      expect(buildInstitutionsBody(),
        `buildInstitutions drops ${field}, so the memo renders nothing for it`)
        .toContain(`${field}: row.${field}`);
    });

  it("every field InstitutionsTable reads off a row is carried", () => {
    // Catches the NEXT one rather than only the two that bit us. Fields read as
    // `r.<name>` in the table must either be built in buildInstitutions or be
    // filled later by synthesize (whyEligible/nextStep) — anything else is a
    // field the renderer wants and the mapping forgot.
    // Scoped to InstitutionsTable's own body: panelReport.tsx also has
    // EligibilityTable, whose rows are a different type that also binds `r`.
    const tStart = report.indexOf("export function InstitutionsTable(");
    expect(tStart, "InstitutionsTable not found; was it renamed?").toBeGreaterThan(-1);
    const after = report.slice(tStart);
    const table = after.slice(0, after.indexOf("\nexport function ", 1));
    const rendered = new Set(
      [...table.matchAll(/\br\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]));
    // Searched across the whole pipeline, not just buildInstitutions: some
    // fields are legitimately filled by the .map() that follows it (verdict,
    // stale, whyEasy) and others by the writer. What must never happen is a
    // rendered field that NOTHING sets.
    const FILLED_BY_WRITER = new Set(["whyEligible", "nextStep"]);
    const missing = [...rendered].filter(
      (f) => !FILLED_BY_WRITER.has(f) && !new RegExp(`\\b${f}:`).test(pipeline));
    expect(missing, `InstitutionsTable reads these but buildInstitutions never sets them: ${missing.join(", ")}`)
      .toEqual([]);
  });
});
