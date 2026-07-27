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

export interface Archetype {
  label: string;
  country: string;
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
};

export const ARCHETYPES: Archetype[] = [
  {
    label: "Robotics", country: "Germany", sector: "industrial_manufacturing",
    description: "Autonomous mobile robots for warehouse order picking",
    expect: { minAccessible: 3 },
  },
  {
    label: "Hardware", country: "Netherlands", sector: "semiconductors_electronics",
    description: "Photonic chips for optical networking equipment",
    expect: { minAccessible: 3 },
  },
  {
    label: "FinTech (business lending)", country: "Sweden", sector: "software_data_ai",
    borrowerModel: "balance_sheet_lender", activities: ["financial_services"],
    description: "Working-capital lending to small businesses, underwritten from our own balance sheet",
    expect: { minAccessible: 3, someExclusionsExpected: true },
  },
  {
    label: "FinTech (consumer banking)", country: "Lithuania", sector: "software_data_ai", activities: ["financial_services"],
    description: "Licensed consumer neobank with current accounts and cards",
    expect: { minAccessible: 3, someExclusionsExpected: true },
  },
  {
    label: "AI B2C software", country: "Spain", sector: "software_data_ai",
    description: "Consumer mobile app using generative AI for language learning",
    expect: { minAccessible: 3 },
  },
  {
    label: "AI B2B software", country: "France", sector: "software_data_ai",
    description: "AI document automation for legal and insurance back offices",
    expect: { minAccessible: 3 },
  },
  {
    label: "GovTech", country: "Estonia", sector: "software_data_ai",
    description: "Digital identity and permitting software for municipal government",
    expect: { minAccessible: 3 },
  },
  {
    label: "Platform", country: "Poland", sector: "mobility_transport",
    description: "Marketplace platform connecting freight shippers and carriers",
    expect: { minAccessible: 3 },
  },
  {
    label: "Cloud / NeoCloud", country: "Finland", sector: "software_data_ai",
    description: "GPU cloud infrastructure for AI training workloads",
    expect: { minAccessible: 3 },
  },
  {
    label: "MedTech", country: "Denmark", sector: "health_life_sciences",
    description: "Wearable cardiac monitoring device with regulatory clearance pending",
    expect: { minAccessible: 3 },
  },
  {
    label: "Life sciences", country: "Belgium", sector: "health_life_sciences",
    description: "Immunotherapy platform for solid tumours, preclinical stage",
    expect: { minAccessible: 3 },
  },
  {
    label: "AgriTech", country: "Italy", sector: "agrifood",
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
    borrowerModel: a.borrowerModel ?? "operating",
  };
}
