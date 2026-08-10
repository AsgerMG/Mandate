import { describe, expect, it } from "vitest";

import {
  COMPOUND_PREFIX_MIN,
  designatesDepartment,
  directsAtDepartment,
  issuerAnnotation,
  namesAnApplyableBody,
  splitDoor,
  stripIssuerAnnotation,
  whyNotApplyable,
  withDoor,
} from "./applyableBody";
import { checkBrief } from "./briefChecks";
import type { InstitutionEntry, IntelligenceReport } from "./types";

/**
 * THE PREDICATE THIS REPLACED, verbatim, so every case below is red-then-green
 * rather than green-and-asserted. A test that only shows the new code passing
 * cannot tell you the old code was broken, and FUND-7's whole finding is that
 * a correct contract had a check which never fired on the real case.
 */
const OLD_REGEX =
  /^(minist\w*|department|departement|dipartimento|direction g[eé]n[eé]rale)\b/i;

/** Real strings, taken from the live corpus by scripts/_wscx_names.ts. */
const REAL = {
  germanMinistry: "Bundesministerium für Wirtschaft und Klimaschutz",
  germanResearchMinistry: "Bundesministerium für Bildung und Forschung",
  bavarianMinistry: "Bayerisches Staatsministerium für Wirtschaft, Landesentwicklung und Energie",
  finnishMinistry: "Työ- ja elinkeinoministeriö",
  hungarianMinistry: "Pénzügyminisztérium Gazdaságfejlesztési Programokért Felelős Helyettes Államtitkárság",
  lithuanianMinistry: "Lietuvos Respublikos ekonomikos ir inovacijų ministerija",
  catalanDepartment: "DEPARTAMENT D'EMPRESA I TREBALL",
  italianDepartment: "Regione Puglia - Dipartimento Sviluppo Economico, Innovazione, Istruzione, Formazione e Lavoro",
  // Already caught by the old anchored form; must stay caught.
  dutchMinistry: "Ministerie van Economische Zaken en Klimaat",
  czechMinistry: "Ministerstvo průmyslu a obchodu",
  // Scheme titles carrying the register's note of the issuing unit.
  bmwkScheme: "Förderrichtlinie „Digitalisierung der Fahrzeughersteller und Zulieferindustrie und industrieller Lieferketten“ [BMWK, IVA3]",
  bmbfScheme: "Richtlinie zur Förderung der „6G-Industrieprojekte“ im Forschungsprogramm für Kommunikationssysteme [BMBF]",
  bmdvScheme: "Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk [BMDV]",
  landScheme: "RL EFRE/JTF-Technologieförderung 2021 bis 2027 [SN]",
  // Real bodies that must keep passing.
  vinnova: "Vinnova",
  ademe: "ADEME (France)",
  icf: "INSTITUT CATALÀ DE FINANCES (ICF)",
  igape: "INSTITUTO GALLEGO DE PROMOCIÓN ECONÓMICA (IGAPE)",
  invitalia: "Invitalia - Agenzia nazionale per l'attrazione degli investimenti e lo sviluppo d'impresa S.p.A.",
  kfw: "KfW",
  eic: "EIC Accelerator",
  vdi: "VDI Technologiezentrum",
};

describe("FUND-7 · TEST 1, designation: a department designator anywhere, compounds included", () => {
  const departments = [
    REAL.germanMinistry, REAL.germanResearchMinistry, REAL.bavarianMinistry,
    REAL.finnishMinistry, REAL.hungarianMinistry, REAL.lithuanianMinistry,
    REAL.catalanDepartment, REAL.italianDepartment,
    REAL.dutchMinistry, REAL.czechMinistry,
  ];

  it.each(departments)("rejects %s", (name) => {
    expect(designatesDepartment(name)).toBe(true);
    expect(namesAnApplyableBody(name)).toBe(false);
  });

  // RED: the compound languages are precisely where the old predicate was blind.
  it.each([
    REAL.germanMinistry, REAL.germanResearchMinistry, REAL.bavarianMinistry,
    REAL.finnishMinistry, REAL.hungarianMinistry, REAL.lithuanianMinistry,
    REAL.catalanDepartment, REAL.italianDepartment,
  ])("the start-anchored predicate this replaced could NOT see %s", (name) => {
    expect(OLD_REGEX.test(name)).toBe(false);
  });

  it("keeps seeing the ones the anchored form already saw", () => {
    expect(OLD_REGEX.test(REAL.dutchMinistry)).toBe(true);
    expect(OLD_REGEX.test(REAL.czechMinistry)).toBe(true);
  });

  it.each([
    REAL.vinnova, REAL.ademe, REAL.icf, REAL.igape, REAL.invitalia, REAL.kfw,
    REAL.eic, REAL.vdi,
  ])("admits %s", (name) => {
    expect(namesAnApplyableBody(name)).toBe(true);
  });

  // The rule that makes TEST 1 a rule and not a lexicon: a designator sitting
  // behind fewer than COMPOUND_PREFIX_MIN letters is inside a bound morpheme,
  // not on the end of a compound. This is the ONLY thing separating
  // "Bundesministerium" from "administration", and it must hold for a language
  // nobody here has looked at.
  it("does not fire on the Latin root that embeds the same stem", () => {
    expect(COMPOUND_PREFIX_MIN).toBe(3);
    for (const s of [
      "Estudios y auditorías administración local de Euskadi",
      "Administration of the Fund",
      "administrative agency",
      "Agencia administradora",
    ]) {
      expect(designatesDepartment(s)).toBe(false);
    }
  });

  it("fires on an unseen compound built the same way", () => {
    // No language, country or fund is named in the rule, so a word nobody has
    // met composes correctly.
    expect(designatesDepartment("Landwirtschaftsministerium")).toBe(true);
    expect(designatesDepartment("Klimaministeriet")).toBe(true);
    expect(designatesDepartment("Näringsdepartementet")).toBe(true);
  });
});

describe("FUND-7 · TEST 2, annotation: the register's note of who issued a document", () => {
  it.each([REAL.bmwkScheme, REAL.bmbfScheme, REAL.bmdvScheme, REAL.landScheme])(
    "rejects %s", (name) => {
      expect(issuerAnnotation(name)).not.toBeNull();
      expect(namesAnApplyableBody(name)).toBe(false);
      // RED: this is the shape the browser walk actually found on the page, and
      // the old predicate returned clean on every one of them.
      expect(OLD_REGEX.test(name)).toBe(false);
    });

  it("strips the annotation and leaves the name that identifies the same thing", () => {
    expect(stripIssuerAnnotation(REAL.bmdvScheme))
      .toBe("Richtlinie zur Förderung innovativer Netzarchitekturen im Mobilfunk");
    expect(stripIssuerAnnotation(REAL.vinnova)).toBe(REAL.vinnova);
  });

  it("leaves a bracket that contains an ordinary word alone, because that is a name", () => {
    expect(issuerAnnotation("Regional Fund [Agency for Trade]")).toBeNull();
    expect(namesAnApplyableBody("Regional Fund [Agency for Trade]")).toBe(true);
  });

  it("never reads a parenthesised trading acronym as an annotation", () => {
    // Square brackets are the register's annotation convention; parentheses
    // carry the body's own short form and are part of its name.
    expect(issuerAnnotation(REAL.icf)).toBeNull();
    expect(issuerAnnotation(REAL.igape)).toBeNull();
  });
});

describe("FUND-7 · a row that names its door is judged on the door", () => {
  it("passes a scheme whose own title quotes a ministry when a real body grants it", () => {
    const name = withDoor(
      "Verwaltungsvorschrift des Wirtschaftsministeriums zur Förderung von Innovationsvorhaben",
      REAL.vdi);
    expect(splitDoor(name).body).toBe(REAL.vdi);
    expect(namesAnApplyableBody(name)).toBe(true);
  });

  it("still fails when the door itself is a department", () => {
    const name = withDoor("Some notified scheme", REAL.germanMinistry);
    expect(namesAnApplyableBody(name)).toBe(false);
  });

  it("still fails when the half before the door is a document with an issuer note", () => {
    expect(namesAnApplyableBody(withDoor(REAL.bmdvScheme, REAL.vdi))).toBe(false);
  });
});

describe("FUND-7 · TEST 3, direction: prose that sends a founder at a department", () => {
  it("fires on the failing bullet the contract itself writes down", () => {
    expect(directsAtDepartment("Start with the federal ministry for a first conversation.")).toBe(true);
  });

  it("does not fire on prose that merely says who notified the regime", () => {
    expect(directsAtDepartment(
      "The regime is notified by the federal ministry. Apply to the project agency that runs it.",
    )).toBe(false);
  });

  it("does not fire on prose with no department in it at all", () => {
    expect(directsAtDepartment("Contact Vinnova about the next utlysning.")).toBe(false);
  });
});

// ── checkBrief, end to end ─────────────────────────────────────────────────

const row = (over: Partial<InstitutionEntry>): InstitutionEntry => ({
  institution: REAL.vinnova, channel: "vinnova_grant", supportType: "Grant",
  ticket: "EUR 0.1-2M", comparableFirms: [],
  whyEligible: "Your project cost sits inside its band.",
  nextStep: "Open a dossier for the next call.",
  ...over,
});

const report = (over: Partial<IntelligenceReport>): Partial<IntelligenceReport> => ({
  bottomLine: ["one", "two", "three", "four"],
  institutions: [row({})],
  positioning: "p", stateOfPlay: "s", caveats: "c",
  ...over,
} as Partial<IntelligenceReport>);

describe("checkBrief now fires FUND-7 on the brief that was rendered and read", () => {
  it("catches the scheme title with the ministry's file reference on the end", () => {
    const v = checkBrief(report({ institutions: [row({ institution: REAL.bmwkScheme })] }));
    expect(v.map((x) => x.ruleId)).toContain("FUND-7");
  });

  it("catches a German ministry named as the institution", () => {
    const v = checkBrief(report({ institutions: [row({ institution: REAL.germanMinistry })] }));
    expect(v.map((x) => x.ruleId)).toContain("FUND-7");
  });

  it("catches the ministry the contract's own example puts in a bullet", () => {
    const v = checkBrief(report({
      bottomLine: ["Start with the federal ministry.", "two", "three", "four"],
    }));
    expect(v.map((x) => x.ruleId)).toContain("FUND-7");
  });

  it("stays quiet on a clean brief", () => {
    expect(checkBrief(report({}))).toEqual([]);
  });
});

describe("FUND-5 is violated first by nothing being written", () => {
  it("catches an empty whyEligible, which the schema's `required` permits", () => {
    const v = checkBrief(report({ institutions: [row({ whyEligible: "" })] }));
    expect(v.map((x) => x.ruleId)).toContain("FUND-5");
  });

  it("catches an empty nextStep", () => {
    const v = checkBrief(report({ institutions: [row({ nextStep: "   " })] }));
    expect(v.map((x) => x.ruleId)).toContain("FUND-5");
  });
});
