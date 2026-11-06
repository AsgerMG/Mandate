/**
 * The property in bodyNamedRow.ts, tested on cases NOBODY HERE HAS SEEN.
 *
 * The instances that provoked this are three SA numbers in two languages. A
 * suite built out of those three would pass forever and catch nothing new, so
 * most of what follows is deliberately invented: a Bulgarian agency in
 * Cyrillic, a Finnish compound, an initialism, a script this corpus does not
 * hold. The rule is relational and knows no language, so it must decide every
 * one of them correctly WITHOUT the register of words `applyableBody.ts` needs.
 *
 * Run: npx vitest run lib/intelligence/bodyNamedRow.test.ts
 */
import { describe, expect, it } from "vitest";

import {
  bodyNamedRows,
  namedAfterItsGrantingBody,
  officiallyNamed,
  whyBodyNamed,
  type BodyNamedFacts,
} from "./bodyNamedRow";
import { namesAnApplyableBody } from "./applyableBody";
import { NAME_SOURCE } from "./nameEvidence";

const row = (o: Partial<BodyNamedFacts>): BodyNamedFacts => ({
  nameSource: NAME_SOURCE.deterministic,
  ...o,
});

describe("the property: a row may not be offered under its granting body's name", () => {
  it("catches the real instances, in each of their languages", () => {
    for (const [name, body] of [
      ["Ministère de l'économie et des finances", "Ministère de l'économie et des finances"],
      ["Finanzamt Aachen-Stadt", "Finanzamt Aachen-Stadt"],
      ["MFW SL", "MFW SL"],
      [
        "Ministero delle Imprese e del Made in Italy - Direzione generale per gli incentivi alle imprese",
        "Ministero delle Imprese e del Made in Italy - Direzione generale per gli incentivi alle imprese",
      ],
    ] as const) {
      expect(namedAfterItsGrantingBody(row({ name, administeringBody: body })), name).toBe(true);
    }
  });

  it("catches bodies in scripts and languages this corpus does not hold", () => {
    // None of these is in any word list anywhere in the repo, and two are in a
    // script applyableBody.ts states outright that it cannot read. The relation
    // does not care.
    for (const s of [
      "Изпълнителна агенция за насърчаване на малките и средните предприятия", // BG
      "Innovaatiorahoituskeskus", // FI compound, no designator morpheme
      "Valsts ieņēmumu dienests", // LV tax authority
      "経済産業省", // no Latin script at all
      "NUTEK", // a bare initialism
      "Skatteetaten avd. 4", // punctuation and a unit number
    ]) {
      expect(namedAfterItsGrantingBody(row({ name: s, administeringBody: s })), s).toBe(true);
    }
  });

  it("is the reason this is a relation and not a word list", () => {
    // The load-bearing claim in the header, asserted rather than asserted-in-prose:
    // the repo's best department register is blind to most of the real instances.
    expect(namesAnApplyableBody("Ministère de l'économie et des finances")).toBe(false);
    for (const blind of ["Finanzamt Aachen-Stadt", "Zentralfinanzamt Nürnberg", "MFW SL"]) {
      expect(namesAnApplyableBody(blind), blind).toBe(true); // i.e. NOT caught as a body
      expect(
        namedAfterItsGrantingBody(row({ name: blind, administeringBody: blind })),
        blind,
      ).toBe(true); // but caught here
    }
  });

  it("folds accents, case, punctuation and spacing before comparing", () => {
    expect(
      namedAfterItsGrantingBody(
        row({ name: "MINISTÈRE  DE L'ÉCONOMIE", administeringBody: "ministere de l economie" }),
      ),
    ).toBe(true);
    expect(
      namedAfterItsGrantingBody(
        row({ name: "Finanzamt München Abt. 3", administeringBody: "Finanzamt Munchen Abt 3" }),
      ),
    ).toBe(true);
  });
});

describe("what it must NOT call a defect", () => {
  it("clears a scheme whose registered title happens to be its agency's name", () => {
    // The three Greek leaves. The register's own title for the notified scheme
    // is the same string the filing carries as granting authority. An official
    // source named it, so it is named.
    const greek = "Ταμείο Επιχειρηματικότητας ΙΙΙ - (Ταμείο εγγυήσεων)";
    expect(
      namedAfterItsGrantingBody({
        name: greek,
        administeringBody: greek,
        nameSource: NAME_SOURCE.caseRegister,
      }),
    ).toBe(false);
    for (const src of [NAME_SOURCE.curated, NAME_SOURCE.programmeFeed]) {
      expect(
        namedAfterItsGrantingBody({ name: greek, administeringBody: greek, nameSource: src }),
        src,
      ).toBe(false);
    }
  });

  it("clears a row whose name merely resembles or contains its body's name", () => {
    for (const [name, body] of [
      ["Forschungszulage", "Finanzamt Aachen-Stadt"],
      ["Bpifrance Innov'up Leader", "Bpifrance"], // contains it — silent, by design
      ["Ministère de l'économie et des finances — appel 2026", "Ministère de l'économie et des finances"],
    ] as const) {
      expect(namedAfterItsGrantingBody(row({ name, administeringBody: body })), name).toBe(false);
    }
  });

  it("is silent, never true, when a column it needs is missing", () => {
    // Withholding a row is a claim. A corpus that has not filled in
    // administering_body must not have every row in it called a defect.
    expect(namedAfterItsGrantingBody(row({ name: "Finanzamt Erlangen" }))).toBe(false);
    expect(namedAfterItsGrantingBody(row({ administeringBody: "Finanzamt Erlangen" }))).toBe(false);
    expect(namedAfterItsGrantingBody(row({ name: "", administeringBody: "" }))).toBe(false);
    expect(namedAfterItsGrantingBody(row({ name: "   ", administeringBody: "!!!" }))).toBe(false);
  });
});

describe("the escape clause defaults CLOSED", () => {
  it("does not excuse a nameSource nobody has declared", () => {
    // A vocabulary added tomorrow must not silently start excusing collisions.
    const s = "Agenția pentru Finanțarea Investițiilor Rurale";
    for (const src of ["llm_guess", "inferred_2027", "", null, undefined]) {
      expect(
        namedAfterItsGrantingBody({ name: s, administeringBody: s, nameSource: src }),
        String(src),
      ).toBe(true);
    }
    expect(officiallyNamed({ nameSource: "llm_guess" })).toBe(false);
    expect(officiallyNamed({ nameSource: NAME_SOURCE.caseRegister })).toBe(true);
  });

  it("does not excuse `deterministic`, which is us composing the string", () => {
    const s = "Wirtschaftsförderungsgesellschaft";
    expect(officiallyNamed({ nameSource: NAME_SOURCE.deterministic })).toBe(false);
    expect(namedAfterItsGrantingBody(row({ name: s, administeringBody: s }))).toBe(true);
  });
});

describe("the helpers", () => {
  it("bodyNamedRows selects exactly the failing rows and preserves them", () => {
    const rows = [
      row({ name: "Finanzamt Erlangen", administeringBody: "Finanzamt Erlangen" }),
      row({ name: "Forschungszulage", administeringBody: "Finanzamt Erlangen" }),
      { name: "X", administeringBody: "X", nameSource: NAME_SOURCE.caseRegister },
    ];
    expect(bodyNamedRows(rows)).toEqual([rows[0]]);
  });

  it("whyBodyNamed explains a failure and stays null for a pass", () => {
    expect(whyBodyNamed(row({ name: "MFW SL", administeringBody: "MFW SL" })))
      .toContain("MFW SL");
    expect(whyBodyNamed(row({ name: "Forschungszulage", administeringBody: "MFW SL" }))).toBeNull();
  });
});
