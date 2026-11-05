// Regression archetypes: the next-generation company shapes the product must
// serve well. Run by scripts/check_archetypes.ts.
//
// These exist to CONFIRM the general model works, not to special-case it.
// Nothing in the pipeline branches on an archetype — they are inputs, like any
// founder's answers. If a fix only works by naming one of these, the fix is
// wrong.
//
// They earn their place because each one stresses a different part of the
// system: two fintechs separate "we ARE a lender" from "we sell software to
// lenders" (the distinction an earlier sector taxonomy collapsed, which made a
// fintech inherit blocks written for tobacco companies); B2B vs B2C software
// and govtech vs platform check that we do NOT invent eligibility differences
// aid law does not draw; hardware and robotics check the industrial lane;
// medtech and life sciences check the health lane.
//
// COUNTRIES, 2026-08-03: all twelve sit in Italy, France, Germany, Spain, the
// Netherlands or Sweden. They used to spread across twelve markets including
// Lithuania, which holds ONE leaf instrument in this corpus -- so that archetype
// was measuring our coverage of Lithuania rather than whether the product
// retrieves well. An archetype should stress the pipeline, not the corpus's
// thinnest country.
//
// Spain is the weakest of the six (7 leaf instruments, EUR 10.0B) and is kept
// deliberately: it is a real market a founder will come from, and if the
// shortlist thins there we want a test that says so.
//
// Each also sits in a HUB rather than a country, TWO PER COUNTRY AND NEVER THE
// SAME HUB TWICE: Munich/Berlin, Amsterdam/Eindhoven, Stockholm/Gothenburg,
// Madrid/Barcelona, Paris/Lyon, Milan/Turin. Two archetypes in one city would
// test the same regional schemes twice and leave the other half of that
// country's regional lanes unexercised. Regional eligibility went from
// 10 instruments to 134 this week, and a country-only archetype exercises none
// of it -- a Munich company and a Berlin company face different German schemes,
// and only a region answer can tell them apart.

export interface Archetype {
  label: string;
  country: string;
  /** The hub the company actually sits in. Carried because 134 instruments now
   *  hold a NUTS region filter from the Commission's register, and a
   *  country-only archetype never exercises one: a Munich company and a Berlin
   *  company are eligible for different German schemes. */
  city?: string;
  /** NUTS code for `city`, checked against regions.generated.ts. */
  region?: string;
  description: string;
  sector: string;
  /** Set where the archetype's own activity implies it. */
  borrowerModel?: string;
  /** ACTIVITY_OPTIONS values — the regulated categories, separate from sector.
   *  The two fintechs carry `financial_services` here while their sector says
   *  what they actually build, which is the distinction the old single-field
   *  taxonomy could not express. */
  activities?: string[];
  /** What we expect to be true. Kept loose on purpose: these assert the system
   *  behaves sanely, not that a specific fund appears. */
  expect: {
    /** At least this many funds must remain reachable — a brief with fewer is
     *  not a brief. */
    minAccessible: number;
    /** True when this activity is genuinely excluded from a chunk of state aid,
     *  so we EXPECT some funds to be ruled out rather than treating it as a bug. */
    someExclusionsExpected?: boolean;
  };
}

const BASE = {
  fteBand: "10-49",
  ticketBand: "b500k_2m5",
  developmentStage: "prototype",
  cofinancingBand: ">50%",
  consortium: "unsure",
  exclusionFlags: ["none"],
  // What the money buys. Every archetype is an R&D-led company raising to build
  // the product, which is the common case and the one most rules are written
  // for; a founder raising purely for working capital is a different profile.
  useOfFunds: ["experimental_development", "industrial_research"],
};

export const ARCHETYPES: Archetype[] = [
  {
    label: "Robotics", country: "Germany", city: "Munich", region: "DE21", sector: "industrial_manufacturing",
    description: "Autonomous mobile robots for warehouse order picking",
    expect: { minAccessible: 3 },
  },
  {
    label: "Hardware", country: "Netherlands", city: "Amsterdam", region: "NL32", sector: "semiconductors_electronics",
    description: "Photonic chips for optical networking equipment",
    expect: { minAccessible: 3 },
  },
  {
    label: "FinTech (business lending)", country: "Sweden", city: "Stockholm", region: "SE11", sector: "software_data_ai",
    borrowerModel: "balance_sheet_lender", activities: ["financial_services"],
    description: "Working-capital lending to small businesses, underwritten from our own balance sheet",
    expect: { minAccessible: 3, someExclusionsExpected: true },
  },
  {
    label: "FinTech (consumer banking)", country: "Netherlands", city: "Eindhoven", region: "NL41", sector: "software_data_ai", activities: ["financial_services"],
    description: "Licensed consumer neobank with current accounts and cards",
    expect: { minAccessible: 3, someExclusionsExpected: true },
  },
  {
    label: "AI B2C software", country: "Spain", city: "Madrid", region: "ES3", sector: "software_data_ai",
    description: "Consumer mobile app using generative AI for language learning",
    expect: { minAccessible: 3 },
  },
  {
    label: "AI B2B software", country: "France", city: "Paris", region: "FR1", sector: "software_data_ai",
    description: "AI document automation for legal and insurance back offices",
    expect: { minAccessible: 3 },
  },
  {
    label: "GovTech", country: "Italy", city: "Milan", region: "ITC4", sector: "software_data_ai",
    description: "Digital identity and permitting software for municipal government",
    expect: { minAccessible: 3 },
  },
  {
    label: "Platform", country: "Spain", city: "Barcelona", region: "ES51", sector: "mobility_transport",
    description: "Marketplace platform connecting freight shippers and carriers",
    expect: { minAccessible: 3 },
  },
  {
    label: "Cloud / NeoCloud", country: "Sweden", city: "Gothenburg", region: "SE23", sector: "software_data_ai",
    description: "GPU cloud infrastructure for AI training workloads",
    expect: { minAccessible: 3 },
  },
  {
    label: "MedTech", country: "Germany", city: "Berlin", region: "DE3", sector: "health_life_sciences",
    description: "Wearable cardiac monitoring device with regulatory clearance pending",
    expect: { minAccessible: 3 },
  },
  {
    label: "Life sciences", country: "France", city: "Lyon", region: "FRK2", sector: "health_life_sciences",
    description: "Immunotherapy platform for solid tumours, preclinical stage",
    expect: { minAccessible: 3 },
  },
  {
    label: "AgriTech", country: "Italy", city: "Turin", region: "ITC1", sector: "agrifood",
    description: "Precision irrigation and crop sensing for arable farms",
    expect: { minAccessible: 3, someExclusionsExpected: true },
  },
];

/** Build the answer set a founder of this archetype would have submitted. */
export function archetypeAnswers(a: Archetype): Record<string, unknown> {
  return {
    ...BASE,
    sector: a.sector,
    activities: a.activities ?? ["none"],
    entityCountries: [a.country],
    ...(a.region ? { region: a.region } : {}),
    borrowerModel: a.borrowerModel ?? "operating",
  };
}
