// Companies the product should NOT be able to help, and what it must do about
// them.
//
// ── Why this exists ────────────────────────────────────────────────────────
// Every fixture until now was a company that deserves an answer: a real
// European technology business with a plausible route to public money. A test
// set made only of those measures whether the product performs when it is
// supposed to, and says nothing about whether it knows when to stop.
//
// The expensive failure is not a thin brief. It is a confident one: five rows
// and a positioning paragraph handed to a company that cannot use any of them,
// which costs a founder weeks before they discover it. These fixtures exist to
// make that failure visible.
//
// The expectation is never "produce nothing". It is "produce less, and be
// straight about why" — a short brief that names the obstacle is the correct
// output here, and padding it back to five rows is the defect.
export interface RedTeamCase {
  label: string;
  country: string;
  description: string;
  sector: string;
  fteBand: string;
  ticketBand: string;
  developmentStage: string;
  activities?: string[];
  exclusionFlags?: string[];
  /** What SHOULD happen. Prose, because these are judgements a person makes
   *  when reading the output, not assertions a checker can settle alone. */
  expect: string;
  /** The specific way we would most likely fail this case. */
  failureMode: string;
}

export const RED_TEAM: RedTeamCase[] = [
  {
    label: "Excluded activity (tobacco)",
    country: "Netherlands", sector: "other",
    description: "Manufacturer and distributor of flavoured tobacco products for retail",
    fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue",
    activities: ["tobacco"],
    expect: "Almost nothing should publish. Most state aid excludes tobacco outright, " +
      "and the brief should say that plainly rather than offering general innovation routes.",
    failureMode: "Publishing five rows because the exclusion is not encoded on the instruments " +
      "that matter, so nothing evaluates as blocked.",
  },
  {
    label: "Pure services, no R&D",
    country: "Spain", sector: "other",
    description: "Boutique management consultancy advising retailers on store layout and merchandising",
    fteBand: "10-49", ticketBand: "lt500k", developmentStage: "scaling_revenue",
    expect: "Very little. Public innovation funding turns on R&D or capital investment, and " +
      "there is neither here. The honest answer is that this company is not what these " +
      "instruments fund.",
    failureMode: "Thematic matching finds retail-adjacent programmes and the brief argues a " +
      "case that does not exist.",
  },
  {
    label: "Non-EU company, no European entity",
    country: "United States", sector: "software_data_ai",
    description: "Series B SaaS company in San Francisco selling workflow software to US hospitals",
    fteBand: "50-249", ticketBand: "b15m_50m", developmentStage: "scaling_revenue",
    expect: "Nothing national should publish. Establishment in a member state is the first " +
      "condition of almost every instrument, and the brief should lead with that rather " +
      "than bury it.",
    failureMode: "Country handling treats an unknown country as 'serves everyone' and national " +
      "schemes publish anyway.",
  },
  {
    label: "Undertaking in difficulty",
    country: "Italy", sector: "industrial_manufacturing",
    description: "Precision components maker restructuring after two loss-making years",
    fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue",
    exclusionFlags: ["losses_over_half_capital"],
    expect: "Most GBER aid is blocked until the equity position is restored. That should be the " +
      "headline, with the cure named, not a footnote under five routes.",
    failureMode: "The flag is collected and then not used, so the blocker never reaches the top " +
      "of the brief.",
  },
  {
    label: "Idea stage, no company",
    country: "Portugal", sector: "software_data_ai",
    description: "Two people planning to build an AI tutor for language learning, not yet incorporated",
    fteBand: "1-9", ticketBand: "lt500k", developmentStage: "research",
    expect: "Thin and honest. Most instruments require a registered entity, so the useful answer " +
      "is which routes exist at this stage and what has to be true first.",
    failureMode: "Publishing instruments whose own rules require an incorporated SME, because " +
      "incorporation is assumed rather than checked.",
  },
  {
    label: "Large corporate, well past SME",
    country: "Germany", sector: "mobility_transport",
    description: "Listed automotive supplier with 40,000 staff and global operations",
    fteBand: "250+", ticketBand: "gt50m", developmentStage: "scaling_revenue",
    expect: "SME-only lanes must disappear. What remains should be the large-scale industrial " +
      "instruments, and the brief should be clear that the SME routes are closed.",
    failureMode: "SME-gated funds publish because headcount is collected but the gate is not " +
      "encoded on those instruments.",
  },
];
