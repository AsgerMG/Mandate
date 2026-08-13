/**
 * A FUND WHOSE PROGRAMME RECURS MAY NOT BE SUPPRESSED ON THE EXPIRY OF ONE CALL.
 *
 * Two halves, and neither is sufficient alone.
 *
 * ── 1. THE PROPERTY, over rows nobody has seen ────────────────────────────
 * The rows are GENERATED — ids, feeds, countries and dates built from a
 * counter — so nothing here can pass by naming one of the fifteen instruments
 * the audit happened to cover. A fund loaded next month, from a register in a
 * language this repo has never met, is judged by the same three assertions with
 * no edit in this file. That is the test `check_contracts` demands in place of
 * an enumeration, and it is why the population is synthetic.
 *
 * The three assertions are the whole state machine, and the second and third
 * are as load-bearing as the first:
 *
 *   recurs recorded      -> the closure clause does NOT fire.  The recovery.
 *   nothing recorded     -> it DOES.  Unexamined is not neutral; it is today's
 *                           behaviour, and a change that quietly widened it
 *                           would be the inference the axis exists to refuse.
 *   single_call recorded -> it DOES.  The row is withheld on the FUNDER's
 *                           statement instead of ours, which is the whole
 *                           difference between the four retired rows and the
 *                           eleven live ones.
 *
 * ── 2. THE FOUNDER, and the failure is simulated rather than described ────
 * A property test proves the predicate. It cannot prove that the predicate is
 * WIRED to anything, which is the defect class this repo keeps paying for — a
 * check that reported `ok — every value carried by the 0 publishable
 * instruments is reachable`, a counter whose pattern matched nothing and
 * returned zero on every run ever made.
 *
 * So the second half runs a real founder through `computeVerdict` against the
 * committed corpus and asserts the fund reaches their pool — and then runs the
 * SAME founder with the recurrence record removed, which is exactly what
 * reinstating the suppression does, and asserts the fund is gone. A test that
 * only asserts the good arm cannot tell "the fix works" from "this fund was
 * never suppressed in the first place".
 *
 * FREE and hermetic: no key, no database, no network. Both credentials are
 * destroyed rather than assumed absent, so a developer with a live shell grades
 * the same system CI does.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

import { publishabilityContext, publishabilityFailures, type DbInstrument } from "./corpus";
import { CALL_RECURRENCE, SCHEME_END_BASIS, callStatus, isBetweenCalls, isClosed } from "./liveness";
import { betweenCallsCaveat, recurrenceRecord } from "./callRecurrence";
import { checkBrief } from "./briefChecks";

/** The reason string `publishabilityFailures` pushes for a shut window, matched
 *  on its distinguishing words rather than restated in full: this file is
 *  asserting WHICH clause fired, not proofreading its wording. */
const CLOSURE = /window has shut/;

const AS_OF = "2026-08-13";

/** A row carrying only what publishability reads, built from a counter so the
 *  population is generated and not listed. Every field that could cause a
 *  DIFFERENT clause to fire is filled in, because a row dropped for having no
 *  amounts would pass a closure test vacuously. */
function generatedRow(n: number): DbInstrument {
  const yr = 2019 + (n % 6);
  const mo = String(1 + (n % 12)).padStart(2, "0");
  const dd = String(1 + (n % 28)).padStart(2, "0");
  return {
    id: `generated_feed_${n % 5}__row_${n}`,
    parentId: null,
    name: `Generated Programme ${n}`,
    country: ["FR", "ES", "PL", "FI", "EL"][n % 5],
    capitalType: "grant",
    isFramework: false,
    eventCount: 10 + n,
    companyCount: 5 + n,
    totalEur: 1_000_000 + n,
    sourceFamilyBucket: "national_dev_banks",
    administeringBody: `Generated Body ${n % 5}`,
    administeringBodyShare: 0.9,
    lastYear: yr + 1,
    schemeCode: null,
    // A window that has passed, labelled a call deadline: the exact shape that
    // suppressed 11 live programmes.
    schemeEndDate: `${yr}-${mo}-${dd}`,
    schemeEndBasis: SCHEME_END_BASIS.callDeadline,
    nameSource: "register",
    applicationUrl: `https://example.invalid/${n}`,
    awardP50: 250_000,
    awardN: 20,
    gates: [],
  } as unknown as DbInstrument;
}

const POPULATION = Array.from({ length: 40 }, (_, n) => generatedRow(n));

function failuresFor(row: DbInstrument): string[] {
  // The context is built over the row's own population, so `hasChildren` and
  // `liveCodes` are the real thing rather than an empty stub.
  return publishabilityFailures(row, publishabilityContext([...POPULATION, row]));
}

describe("the property: a recurring programme survives one call's expiry", () => {
  it("suppresses a passed call deadline when NOBODY HAS ASKED the funder", () => {
    for (const row of POPULATION) {
      expect(isClosed(row, AS_OF)).toBe(true);
      expect(callStatus(row, AS_OF)).toBe("shut");
      expect(failuresFor(row).join(" ")).toMatch(CLOSURE);
    }
  });

  it("does NOT suppress it once the funder's own source says the programme recurs", () => {
    for (const row of POPULATION) {
      const recurring = { ...row, callRecurrence: CALL_RECURRENCE.recurs };
      // The window is still shut. That fact is not softened, it is REPORTED —
      // it is what the caveat is about.
      expect(isClosed(recurring, AS_OF)).toBe(true);
      expect(callStatus(recurring, AS_OF)).toBe("between_calls");
      expect(failuresFor(recurring).join(" ")).not.toMatch(CLOSURE);
    }
  });

  it("suppresses it again when the funder's own source says it was the whole programme", () => {
    for (const row of POPULATION) {
      const oneOff = { ...row, callRecurrence: CALL_RECURRENCE.singleCall };
      expect(callStatus(oneOff, AS_OF)).toBe("shut");
      expect(failuresFor(oneOff).join(" ")).toMatch(CLOSURE);
    }
  });

  it("changes nothing for a row whose window has not passed", () => {
    // The axis may only ever lift a row OUT of suppression. A recurrence value
    // on an open row must be inert, or the axis has become a second, weaker
    // definition of open.
    for (const row of POPULATION) {
      const open = { ...row, schemeEndDate: "2099-01-01" };
      for (const rec of [undefined, CALL_RECURRENCE.recurs, CALL_RECURRENCE.singleCall]) {
        expect(callStatus({ ...open, callRecurrence: rec }, AS_OF)).toBe("open");
        expect(failuresFor({ ...open, callRecurrence: rec } as DbInstrument).join(" "))
          .not.toMatch(CLOSURE);
      }
    }
  });
});

describe("the caveat says the window shut and never says when it reopens", () => {
  const ROW = { ...generatedRow(1), callRecurrence: CALL_RECURRENCE.recurs };

  it("is null for anything that is not between calls", () => {
    expect(betweenCallsCaveat(generatedRow(1), AS_OF)).toBeNull();
    expect(betweenCallsCaveat({ ...ROW, schemeEndDate: "2099-01-01" }, AS_OF)).toBeNull();
  });

  it("states the window that shut, and the date it states is that one", () => {
    const text = betweenCallsCaveat(ROW, AS_OF);
    expect(text).toBeTruthy();
    expect(text).toContain(String(ROW.schemeEndDate));
    // THE ONE THING IT MAY NOT DO. `liveness.ts` forbids the copy supplying a
    // declaration the funder never made, and a reopening date is the easiest
    // one to supply by accident. Every ISO date in the sentence must be a date
    // we hold — the window that shut, or the day the funder's page was read.
    const held = new Set([String(ROW.schemeEndDate), recurrenceRecord(ROW.id)?.checkedAt]);
    for (const d of text!.match(/\d{4}-\d{2}-\d{2}/g) ?? []) expect(held.has(d)).toBe(true);
    // And no future date at all, under any format.
    expect(text).not.toMatch(/\b20[3-9]\d\b/);
  });
});

// ── THE FOUNDER ────────────────────────────────────────────────────────────
//
// ADEME's DECARB IND. Our row holds the 2024 relève and kills it at 2024-03-07;
// ADEME's own catalogue was running `DECARB IND 25 - 2e relève` from 07 May to
// 07 September 2026 when the page was read. A French founder decarbonising
// industrial process heat is exactly who that programme is for.
const ADEME = "ademe_aid__aap_decarb_ind_pdr_fdi_43019f";

const FOUNDER = {
  company: "Verkor",
  country: "FR",
  eligibility: { entityCountries: ["FR"], companyAgeYears: 4, headcount: 60 },
  opts: {
    capitalSought: ["grant"],
    description:
      "We build and operate industrial decarbonisation equipment for heavy " +
      "manufacturing sites in France, cutting process heat emissions.",
  },
};

async function poolFor(): Promise<string[]> {
  const { computeVerdict } = await import("./pipeline");
  const v = await computeVerdict(
    FOUNDER.company, FOUNDER.country, FOUNDER.eligibility as never, FOUNDER.opts);
  return (v as unknown as { candidateInstrumentIds: string[] }).candidateInstrumentIds ?? [];
}

describe("the founder ADEME's programme was being kept from", () => {
  beforeAll(() => {
    // Destroyed, not assumed absent. Without these the corpus is the committed
    // snapshot and the ranking is lexical — which is what this asserts about,
    // since the question is PRESENCE in the pool, not position in it.
    delete process.env.DATABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VOYAGE_KEY;
    process.env.NO_PG = "1";
  });

  it("reaches their pool, and the corpus still says the window we hold has shut", async () => {
    vi.resetModules();
    const pool = await poolFor();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool).toContain(ADEME);

    const { loadDbInstruments } = await import("./corpus");
    const row = loadDbInstruments().find((i) => i.id === ADEME)!;
    expect(row).toBeTruthy();
    expect(isClosed(row)).toBe(true);          // the window we hold HAS shut
    expect(isBetweenCalls(row)).toBe(true);    // and it is offered anyway
    expect(betweenCallsCaveat(row)).toBeTruthy();
  });

  it("LOSES it the moment the suppression is reinstated", async () => {
    // Reinstating the suppression IS removing the recorded recurrence: it is
    // the only thing standing between this row and the closure clause. Mocked
    // at the leaf, so the whole production path below it — hydration,
    // publishability, the screen — runs unchanged and unaware.
    vi.resetModules();
    vi.doMock("./callRecurrence", async (orig) => ({
      ...(await orig() as object),
      recordedCallRecurrence: () => null,
    }));
    try {
      const pool = await poolFor();
      expect(pool.length).toBeGreaterThan(0);
      expect(pool).not.toContain(ADEME);
    } finally {
      vi.doUnmock("./callRecurrence");
      vi.resetModules();
    }
  });
});

// ── FUND-15 ────────────────────────────────────────────────────────────────
//
// The check exists because publishing a between-calls row is only better than
// suppressing it while the prose does not hand the founder a date. The one
// thing we do not hold for these rows is the next window, so a date offered as
// when to apply is invented — and the founder cannot tell the difference.
describe("FUND-15: the prose may not name a date the row does not carry", () => {
  const CAVEAT = betweenCallsCaveat(
    { ...generatedRow(3), callRecurrence: CALL_RECURRENCE.recurs }, AS_OF)!;

  function fund15(row: Record<string, unknown>): string[] {
    // The real checker over a minimal report. Only FUND-15 findings are
    // returned; the fixture is not a valid brief in other respects and this
    // file is not the place to assert that it is.
    return checkBrief({ institutions: [{
      institution: "Generated Body", channel: "x", supportType: "grant",
      ticket: "", comparableFirms: [], whyEligible: "", nextStep: "",
      ...row,
    }] } as never).filter((x) => x.ruleId === "FUND-15").map((x) => x.detail);
  }

  it("passes a between-calls row whose copy names no date", () => {
    expect(fund15({ betweenCalls: CAVEAT, nextStep: "Open a dossier with the regional office." }))
      .toEqual([]);
  });

  it("passes a date the row itself carries", () => {
    // The window that shut is ON the row and is the one date the founder can
    // be told, so repeating it is not an invention.
    const held = CAVEAT.match(/\d{4}-\d{2}-\d{2}/)![0];
    expect(fund15({ betweenCalls: CAVEAT, nextStep: `The last round closed ${held}; prepare now.` }))
      .toEqual([]);
  });

  it("FAILS a date nobody here holds, whatever the row's own dates are", () => {
    // Generated rather than quoted: the rule is about the shape of the token,
    // so any year outside the row's own is the same violation.
    for (const yr of [2027, 2031, 2044]) {
      expect(fund15({ betweenCalls: CAVEAT, nextStep: `Apply in the ${yr} round.` }))
        .toHaveLength(1);
      expect(fund15({ betweenCalls: CAVEAT, whyEligible: `Reopens ${yr}-03-01.` }))
        .toHaveLength(1);
    }
  });

  it("is silent on a row that is not between calls, whatever it says", () => {
    // The rule is scoped to rows whose window has shut. An ordinary row naming
    // its own live deadline is doing exactly what it should.
    expect(fund15({ nextStep: "Submit before 2044-01-01." })).toEqual([]);
  });
});
