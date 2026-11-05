import { describe, expect, it } from "vitest";
import { addresses, resolveRoute } from "./applicationRoute";

/**
 * The strings are REAL: every route text below is verbatim from
 * `instrument_application`, and every body is verbatim from the child row that
 * was publishing that text as its own instruction. They are here so the
 * property is tested against the corpus rather than against an example someone
 * invented to suit it.
 */
const ROUTE = {
  /** 89 children. A federal project agency's two-stage outline procedure. */
  skizze:
    "Applicants first submit an electronic project outline (Skizze) to the commissioned " +
    "project agency (VDI Technologiezentrum GmbH) via the easy-Online electronic application " +
    "system; if the outline is positively evaluated, the applicant is then invited to submit " +
    "a formal funding application (Förderantrag), also via easy-Online.",
  /** 24 children, two of them provincial. The brief that was rendered and read. */
  minister:
    "Application submitted to the Minister (Ministry of EZK/LNV) under the relevant title of " +
    "the Regeling nationale EZK- en LNV-subsidies, subject to allocation method and, where " +
    "applicable, advisory committee review.",
  /** 60 children, many of them regional agencies in other autonomous communities. */
  sede:
    "Electronic submission via the Ministerio de Ciencia e Innovación's electronic " +
    "headquarters (sede electrónica), using advanced electronic signature through the " +
    "electronic register.",
  /** 14 children, one of them a film and television scheme in another Land. */
  sab: "Applications submitted to Sächsische Aufbaubank – Förderbank – (SAB) as the competent approval authority",
  /** 44 children, and the agency it names really does run them. */
  ademe:
    "Written application (letter or electronic) or submission of a candidature dossier to a " +
    "call for projects/expressions of interest to ADEME, followed by a financing decision or convention.",
};

const BODY = {
  provinceZH: "provincie Zuid-Holland",
  provinceNB: "provincie Noord-Brabant",
  kansen: "Kansen voor West",
  vwsMinistry: "Ministerie van Volksgezondheid, Welzijn, Sport",
  ezk: "Ministerie van Economische Zaken en Klimaat",
  accio: "ACCIÓ (Catalonia Enterprise Agency)",
  gain: "GAIN (Galician Innovation Agency)",
  lfa: "LfA Förderbank Bayern",
  vdi: "VDI Technologiezentrum GmbH",
  ademe: "ADEME",
};

describe("addresses(): does this prose address that body", () => {
  it("is true where the text names the body that runs the scheme", () => {
    expect(addresses(ROUTE.skizze, BODY.vdi)).toBe(true);
    expect(addresses(ROUTE.ademe, BODY.ademe)).toBe(true);
  });

  it("is false where the text names a different body entirely", () => {
    expect(addresses(ROUTE.minister, BODY.provinceZH)).toBe(false);
    expect(addresses(ROUTE.minister, BODY.provinceNB)).toBe(false);
    expect(addresses(ROUTE.minister, BODY.kansen)).toBe(false);
    expect(addresses(ROUTE.sede, BODY.accio)).toBe(false);
    expect(addresses(ROUTE.sede, BODY.gain)).toBe(false);
    expect(addresses(ROUTE.sab, BODY.lfa)).toBe(false);
    expect(addresses(ROUTE.skizze, BODY.provinceNB)).toBe(false);
  });

  // The case a looser "any shared word" test gets wrong, and it is not
  // hypothetical: one Dutch child is run by a DIFFERENT ministry from the one
  // its inherited route addresses. Both names begin "Ministerie van".
  it("is false for a different body of the same KIND, which shares its form words", () => {
    expect(addresses(ROUTE.minister, BODY.vwsMinistry)).toBe(false);
  });

  it("is true where the addressed body is the one named, spelling aside", () => {
    // Diacritics and punctuation are noise. "Sächsische Aufbaubank – Förderbank –"
    // must still address "Sachsische Aufbaubank".
    expect(addresses(ROUTE.sab, "Sachsische Aufbaubank")).toBe(true);
  });
});

describe("resolveRoute(): whose route may this row publish", () => {
  const inherited = (over: Record<string, unknown> = {}) => ({
    application: { channel: ROUTE.minister, timeline: "8 to 22 weeks after receipt of application", url: null },
    applicationOwn: false,
    parentName: "Regeling nationale EZK- en LNV-subsidies",
    ...over,
  });

  // ── THE RED, PROVED FIRST ────────────────────────────────────────────────
  // This is what shipped: the resolved route published verbatim as the row's
  // own instruction, whoever it addressed. The assertion below is the OLD
  // behaviour written out, and it must NOT be what the resolver does.
  it("no longer publishes a parent's addressee as this scheme's instruction", () => {
    const legacy = inherited({ administeringBody: BODY.provinceZH }).application.channel;
    expect(legacy).toBe(ROUTE.minister); // what the corpus resolves to
    const r = resolveRoute(inherited({ administeringBody: BODY.provinceZH }));
    expect(r.provenance).toBe("withheld");
    expect(r.channel).toBeUndefined();
  });

  it("withholds the WINDOW with the addressee, because a deadline is planned around", () => {
    const r = resolveRoute(inherited({ administeringBody: BODY.provinceNB }));
    expect(r.timeline).toBeUndefined();
  });

  it("says why, in the terms the row itself carries", () => {
    const r = resolveRoute(inherited({ administeringBody: BODY.kansen }));
    expect(r.withheldBecause).toContain("Kansen voor West");
    expect(r.withheldBecause).toContain("Regeling nationale EZK- en LNV-subsidies");
  });

  it("publishes a fund's OWN route as its own instruction", () => {
    const r = resolveRoute({
      application: { channel: ROUTE.ademe, timeline: "rolling", url: null },
      applicationOwn: true,
      administeringBody: BODY.provinceZH, // irrelevant: the route is this fund's
    });
    expect(r.provenance).toBe("own");
    expect(r.channel).toBe(ROUTE.ademe);
  });

  it("publishes an inherited route the child does not contradict, ATTRIBUTED", () => {
    const r = resolveRoute({
      application: { channel: ROUTE.ademe, timeline: null, url: null },
      applicationOwn: false,
      administeringBody: BODY.ademe,
      parentName: "ADEME",
    });
    expect(r.provenance).toBe("programme");
    expect(r.channel).toBe(ROUTE.ademe);
    expect(r.recordedFor).toBe("ADEME");
  });

  it("does not withhold on no evidence: a child naming no body keeps the route", () => {
    const r = resolveRoute(inherited({ administeringBody: null, schemeOperators: null }));
    expect(r.provenance).toBe("programme");
    expect(r.channel).toBe(ROUTE.minister);
  });

  it("lets a scheme OPERATOR vouch for the route where the body does not", () => {
    const r = resolveRoute(inherited({
      administeringBody: "Some Other Body",
      schemeOperators: ["Ministry of EZK/LNV"],
    }));
    expect(r.provenance).toBe("programme");
  });

  // ── A withheld route removes a sentence, never a row ─────────────────────
  it("keeps the fund's OWN link even when the route text is withheld", () => {
    const r = resolveRoute(inherited({
      administeringBody: BODY.provinceZH,
      ownApplicationUrl: "https://www.zuid-holland.nl/subsidies",
    }));
    expect(r.provenance).toBe("withheld");
    expect(r.url).toBe("https://www.zuid-holland.nl/subsidies");
  });

  // 88 publishable rows carry their own submission link and NONE of them has a
  // curated route, so this column had never once reached a founder.
  it("prefers the fund's own link over the route's", () => {
    const r = resolveRoute({
      application: { channel: ROUTE.ademe, timeline: null, url: "https://parent.example/apply" },
      applicationOwn: false,
      administeringBody: BODY.ademe,
      ownApplicationUrl: "https://this-fund.example/apply",
    });
    expect(r.url).toBe("https://this-fund.example/apply");
  });

  it("reports nothing recorded as nothing recorded", () => {
    expect(resolveRoute({ application: null, applicationOwn: false }).provenance).toBe("none");
  });
});
