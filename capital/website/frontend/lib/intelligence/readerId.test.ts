// NOTHING A FOUNDER READS MAY CONTAIN AN INTERNAL IDENTIFIER (BRIEF-5).
//
// The recorded failure, verbatim: a production brief's first substantive
// bullet told a founder to start with a named regional scheme and printed our
// storage key for it in brackets. Every offline guard passed, because
// `check_row_name_not_id` grades ROWS and this was prose.
//
// Every case below is red before the property exists and green after, and the
// two that matter most are the ones nobody has seen: a key whose every word is
// accounted for by the fund's own title (so the word test cannot see it), and a
// key spelled with a separator and a case convention this repo has never used.
import { describe, expect, it } from "vitest";
import { checkBrief } from "./briefChecks";
import { internalIdTokensIn, redactInternalIds } from "./rowIdentity";
import { mapReaderText, readerText } from "./readerSurface";

const ID = "satr_fr_rnd__sa_111728__region_grand_est";
const NAME = "Régime cadre exempté de notification relatif aux aides en faveur "
  + "des PME pour la période 2024-2026";
/** What a caller can defend showing about this fund. */
const HUMAN = [NAME, "SA.111728", "FR", "Grants", "Grand Est"];
const RULES = [{ id: ID, name: NAME }];

/** The bullet as the founder received it. */
const BULLET = "Start with the Grand Est regional scheme "
  + `(${ID}): it is delivered by REGION GRAND EST, which is your own region.`;

describe("an id in prose is found, whatever it spells", () => {
  it("finds the key the founder actually read", () => {
    const hits = internalIdTokensIn(BULLET, [ID], HUMAN);
    expect(hits).toHaveLength(1);
    expect(hits[0].whole).toBe(true);
  });

  it("finds a FRAGMENT of a key, which is still not a name", () => {
    expect(internalIdTokensIn("Apply under satr_fr_rnd this year.", [ID], HUMAN))
      .toHaveLength(1);
  });

  it("finds a key whose every word the fund's own title accounts for", () => {
    // The word test alone cannot see this one: nothing in it came from the
    // store rather than from the register. It is still an identifier on the
    // page, and the whole-key test is what catches it.
    const id = "regime_cadre_exempte_pme_2024_2026";
    const human = ["Régime cadre exempté PME 2024 2026"];
    expect(internalIdTokensIn(`Start with ${id}.`, [id], human)).toHaveLength(1);
  });

  it("finds a key in a spelling this repo has never used", () => {
    // An id shape introduced next year: a different separator and a different
    // case convention. The test asks the corpus what the ids ARE rather than
    // what they look like, so it needs no edit to cover this.
    const future = "SATR:FR/RND#SA-111728";
    const written = "satrFrRndSa111728";
    expect(internalIdTokensIn(`See ${written}.`, [future], HUMAN)).toHaveLength(1);
  });

  it("says nothing about the fund's name written out as prose", () => {
    // "Horizon EU CL4" is three tokens and can never be the single token
    // `horizon_eu_cl4`. This is the false positive that would make the rule
    // unusable, and the token basis is what rules it out.
    const hits = internalIdTokensIn(
      "Horizon EU CL4's own record leans toward semiconductors and electronics.",
      ["horizon_eu_cl4"], ["Horizon EU CL4"]);
    expect(hits).toEqual([]);
  });

  it("says nothing about ordinary hyphenated prose", () => {
    expect(internalIdTokensIn(
      "ADEME's incentive-effect rule requires a not-yet-started phase.",
      [ID], HUMAN)).toEqual([]);
  });
});

describe("the repair leaves prose a founder can read", () => {
  it("puts the fund's name where the key was", () => {
    const { text } = redactInternalIds(BULLET, RULES, HUMAN);
    expect(text).not.toContain(ID);
    expect(text).toContain(`(${NAME}):`);
    expect(internalIdTokensIn(text, [ID], HUMAN)).toEqual([]);
  });

  it("takes the emptied aside with it when there is nothing to name", () => {
    // A key for a row that does not publish names nothing, so it goes; the
    // bracket around it existed to add something and there is nothing left.
    const { text } = redactInternalIds(BULLET, [{ id: ID, name: "" }], HUMAN);
    expect(text).toBe("Start with the Grand Est regional scheme: it is "
      + "delivered by REGION GRAND EST, which is your own region.");
  });

  it("changes nothing in prose that carries no key", () => {
    const clean = "Bpifrance inov is the right first move: it is a national "
      + "grant and soft-loan line open to French SMEs.";
    expect(redactInternalIds(clean, RULES, HUMAN).text).toBe(clean);
  });
});

describe("the walk reaches every field, and only the reader's", () => {
  it("rewrites prose and carries identifiers through untouched", () => {
    const report = {
      bottomLine: [BULLET],
      institutions: [{ institution: NAME, instrumentId: ID, nextStep: `Ask about ${ID}.`,
                       link: { url: `https://x/${ID}` } }],
    };
    const out = mapReaderText(report, (t) => redactInternalIds(t, RULES, HUMAN).text);
    expect(out.institutions[0].instrumentId).toBe(ID);
    expect(out.institutions[0].link.url).toBe(`https://x/${ID}`);
    expect(out.institutions[0].nextStep).not.toContain(ID);
    expect(readerText(out).some((s) => s.includes(ID))).toBe(false);
  });
});

describe("the walk knows a machine list from prose", () => {
  it("does not treat the founder's own source-family codes as text", () => {
    // FOUND BY THE FIRST LIVE RUN OF THE REPAIR. `self.channels` is the list of
    // source-family codes a company's awards came through; `panelReport` prints
    // `euCapital`, `channelBreakdown` and `activeYears` from that block and
    // never this one. The key set carried the singular `channel` and not the
    // plural, so two rules had been grading a value nobody reads -- and the
    // repair rewrote one, which is how it surfaced.
    const self = { euCapital: "EUR 1.0M", channelBreakdown: "state aid, EUR 1.0M",
                   channels: ["state_aid_satr"], activeYears: "2021" };
    expect(readerText({ self })).not.toContain("state_aid_satr");
    const out = mapReaderText({ self }, () => "REWRITTEN");
    expect(out.self.channels).toEqual(["state_aid_satr"]);
    expect(out.self.euCapital).toBe("REWRITTEN");
  });
});

describe("BRIEF-5 — the rule, on a whole brief", () => {
  const report = (over: Record<string, unknown>) => ({
    bottomLine: ["one", "two", "three", "four"],
    positioning: "p", stateOfPlay: "s", caveats: "c",
    institutions: [{
      institution: NAME, instrumentId: ID, channel: "state_aid_satr",
      supportType: "Grants", ticket: "EUR 100k to EUR 2M", schemeCode: "SA.111728",
      country: "FR", whyEligible: "why", nextStep: "next", comparableFirms: [],
    }],
    ...over,
  }) as never;

  it("fires on the bullet the founder actually received", () => {
    const v = checkBrief(report({ bottomLine: [BULLET, "two", "three", "four"] }), undefined, []);
    expect(v.map((x) => x.ruleId)).toContain("BRIEF-5");
  });

  it("fires on a next step, not only on the bottom line", () => {
    // The whole memo surface, not the first thing anybody looked at.
    const v = checkBrief(report({
      institutions: [{
        institution: NAME, instrumentId: ID, channel: "state_aid_satr",
        supportType: "Grants", ticket: "EUR 100k to EUR 2M", schemeCode: "SA.111728",
        country: "FR", whyEligible: "why", nextStep: `Quote ${ID} in your application.`,
        comparableFirms: [],
      }],
    }), undefined, []);
    expect(v.map((x) => x.ruleId)).toContain("BRIEF-5");
  });

  it("stays quiet on a brief that names funds and never keys them", () => {
    const v = checkBrief(report({}), undefined, []);
    expect(v.map((x) => x.ruleId)).not.toContain("BRIEF-5");
  });
});
