import { describe, expect, it } from "vitest";
import { mergeInheritedGates, type DbGate, type DbInstrument } from "./corpus";
import { assessInstrument } from "./verdict";
import type { EligibilityAnswers } from "./types";

/**
 * THE FOUNDER THIS PINS: a Lombardy company, offered Lombardy's own programme.
 *
 * `satr_it_rnd` is not a regime. It is the string "all Italian R&D state aid",
 * a bucket of roughly 1,100 notified schemes with no shared document anywhere,
 * and `registerNamesTheRow()` already refuses to PUBLISH it for that reason.
 * It carries `g1-territorio`, read off ONE member's PDF: the applicant must be
 * in the less-developed regions (ITF2-ITG2). It is `llm_2pass`, so cited;
 * `region` is structural; so one failure was conclusive, `accessiblePool`
 * deleted the row, and the founder never learned the fund existed.
 *
 * All 67 children inherited it. Among them `satr_it_rnd__sa_114209__regione_
 * lombardia_...` — COLLABORA&INNOVA, whose own page requires "sede operativa in
 * Lombardia" and whose own `registered_region` gate is `region_within ITC4`.
 * Regione Lombardia's own programme, closed to Lombardy. Sixteen of the seventy
 * conclusive blocks in the 820-founder replay were this one gate row.
 *
 * The fixtures are hand-built from those two rows — same ids, same specs, same
 * verification levels — so a corpus refresh can neither fix nor break this
 * test, and the case it describes stays legible when the rows are repaired.
 */
const gate = (over: Partial<DbGate>): DbGate => ({
  id: "g", gateRole: "filter", requirement: "", value: "", valueSpec: null,
  intakeField: "none", quote: "", source: { file: "", locator: "" },
  verificationLevel: "llm_2pass", verified: true, ...over,
});

/** Read off `satr_it_rnd`, verbatim. */
const TERRITORIO = gate({
  id: "g1-territorio",
  requirement: "The applicant enterprise must be located in the target territories of the "
    + "Programme (less developed regions: Basilicata, Calabria, Campania, Molise, Puglia, "
    + "Sardegna, Sicilia).",
  valueSpec: {
    op: "region_within", field: "region",
    allowed: ["ITF2", "ITF3", "ITF4", "ITF5", "ITF6", "ITG1", "ITG2"],
  },
  verificationLevel: "llm_2pass",
});

/** Read off the child. `register_derived`, so it narrows and never condemns —
 *  and a Lombardy founder passes it anyway. */
const REGISTERED_REGION = gate({
  id: "registered_region",
  requirement: "Awards under this scheme are registered in Lombardy.",
  valueSpec: { op: "region_within", field: "region", allowed: ["ITC4"] },
  verificationLevel: "register_derived", verified: false,
});

const parent = (nameSource: string, gates: DbGate[]): DbInstrument => ({
  id: "satr_it_rnd", parentId: null, name: "SATR It Rnd", country: "IT",
  capitalType: "grant", isFramework: false, eventCount: 9802, companyCount: 4000,
  totalEur: 1e9, sourceFamilyBucket: "state_aid_satr", nameSource, gates,
} as DbInstrument);

const child = (gates: DbGate[]): DbInstrument => ({
  id: "satr_it_rnd__sa_114209__regione_lombardia", parentId: "satr_it_rnd",
  name: "PR FESR 2021-2027 MISURA COLLABORA&INNOVA", country: "IT",
  capitalType: "grant", isFramework: false, eventCount: 76, companyCount: 60,
  totalEur: 5e7, sourceFamilyBucket: "state_aid_satr", nameSource: "case_register", gates,
} as DbInstrument);

/** A Lombardy company. ITC4 IS Lombardy. */
const LOMBARDY: EligibilityAnswers = { region: "ITC4", entityCountries: ["IT"] } as EligibilityAnswers;

const judge = (p: DbInstrument, c: DbInstrument) =>
  assessInstrument({ ...c, gates: mergeInheritedGates(c.gates, p) }, LOMBARDY);

describe("a rule inherited from a register bucket may narrow, never condemn", () => {
  it("a Lombardy founder is not deleted from Lombardy's own programme", () => {
    // partition_key: nobody outside our loader named the parent row.
    const a = judge(parent("partition_key", [TERRITORIO]), child([REGISTERED_REGION]));
    expect(a.status).not.toBe("blocked");
  });

  it("RED IF INHERITANCE IS REINSTATED: the same rule from a NAMED parent still condemns", () => {
    // The control, and the thing that makes the test above mean something. Only
    // the parent's name evidence differs — same founder, same child, same gate.
    // If `mergeInheritedGates` ever stops asking whose row it is handing down
    // from, this expectation and the one above cannot both hold.
    const a = judge(parent("case_register", [TERRITORIO]), child([REGISTERED_REGION]));
    expect(a.status).toBe("blocked");
  });

  it("the demoted rule is still EVALUATED and still reported", () => {
    // The half the broad fix destroyed. Dropping bucket-inherited gates
    // outright took check_winner_not_gated's judgeable population from 6,167
    // pairs to 4,610, under its floor of 6,000 — a screen with nothing to say
    // about a third more of the corpus. A demoted rule is still checked, still
    // counted, and still handed to the founder as a named obstacle.
    const a = judge(parent("partition_key", [TERRITORIO]), child([REGISTERED_REGION]));
    expect(a.checked).toBe(2);
    expect(a.blockers.map((b) => b.field)).toEqual(["region"]);
    expect(a.blockers[0].requirement).toContain("less developed regions");
    // Reported WITHOUT the standing to end the conversation.
    expect(a.blockers[0].cited).toBe(false);
  });

  it("A CASE NOBODY HAS SEEN: it is the parent's name evidence, not the country, "
    + "the register or the field", () => {
    // Nothing about Italy, regions or SATR. A bucket in a register nobody has
    // loaded yet, handing down a cited establishment rule to a child whose
    // founder is established elsewhere: demoted, because the loader named the
    // parent and no source did.
    const rule = gate({
      id: "must-be-established-here", requirement: "Applicants must be established in Ruritania.",
      valueSpec: { op: "in", field: "entityCountries", allowed: ["FR"] },
      verificationLevel: "human_verified",
    });
    const kid = (p: DbInstrument) => assessInstrument(
      { ...child([]), gates: mergeInheritedGates([], p) },
      { entityCountries: ["DE"] } as EligibilityAnswers,
    );
    expect(kid(parent("partition_key", [rule])).status).not.toBe("blocked");
    expect(kid(parent("programme_feed", [rule])).status).toBe("blocked");
  });

  it("leaves every other inherited rule exactly as it was", () => {
    // Only the rules that could end a conversation alone are touched, so
    // nothing that merely narrows, explains or waits changes shape. A choice
    // field is not structural; an uncited rule was never conclusive; a
    // programme fact is not a filter.
    const untouched = [
      gate({ id: "g1-joint-project-limit", valueSpec: { op: "boolean_true", field: "consortium" } }),
      gate({ id: "llm_classified_0", verificationLevel: "llm_classified", verified: false,
        valueSpec: { op: "region_within", field: "region", allowed: ["ITF1"] } }),
      gate({ id: "gber_article_inferred", gateRole: "programme_fact",
        verificationLevel: "register_derived", verified: false,
        valueSpec: { op: "aid_intensity", cap: 80 } }),
      gate({ id: "g1-sector", verificationLevel: "llm_cited", valueSpec: null }),
    ];
    const merged = mergeInheritedGates([], parent("partition_key", untouched));
    expect(merged.map((g) => g.borrowed ?? false)).toEqual([false, false, false, false]);
    expect(merged.every((g) => g.inherited)).toBe(true);
  });

  it("a child's own rule is never demoted — the bucket only reaches what it hands down", () => {
    // TERRITORIO as the CHILD'S OWN gate. If the row genuinely describes this
    // scheme, re-encoding it onto the child is the repair, and the repair must
    // work: a fund's own text may still end the conversation.
    const a = judge(parent("partition_key", []), child([TERRITORIO]));
    expect(a.status).toBe("blocked");
  });
});
