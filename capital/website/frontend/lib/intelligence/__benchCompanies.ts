// Real European companies, one per next-generation archetype — the shared
// test set behind BOTH harnesses, so the free tracer and the paid bench can
// never drift apart on who they are testing.
//
// Chosen to be genuinely of that nature and plausibly present in the public
// funding record, so the memo has something real to work with. See
// __archetypes.ts for the synthetic profiles used by the assertion check.

export interface BenchCompany {
  archetype: string; company: string; country: string; description: string;
  sector: string; fteBand: string; ticketBand: string; developmentStage: string;
  borrowerModel?: string;
}

export const COMPANIES: BenchCompany[] = [
  { archetype: "Robotics", company: "Neura Robotics", country: "Germany",
    description: "Cognitive humanoid and cobot systems for industrial automation",
    sector: "hardware_robotics", fteBand: "250+", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "Hardware", company: "SMART Photonics", country: "Netherlands",
    description: "Indium phosphide photonic integrated circuits foundry",
    sector: "hardware_robotics", fteBand: "50-249", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "FinTech (business lending)", company: "Silvr", country: "France",
    description: "Revenue-based financing for e-commerce and SME businesses",
    sector: "financial_services", borrowerModel: "balance_sheet_lender",
    fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "FinTech (consumer banking)", company: "bunq", country: "Netherlands",
    description: "Licensed consumer neobank offering current accounts, cards and savings",
    sector: "financial_services", fteBand: "250+", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "AI B2C software", company: "Photoroom", country: "France",
    description: "Consumer generative AI app for product photography and image editing",
    sector: "software_digital", fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "AI B2B software", company: "Aleph Alpha", country: "Germany",
    description: "Sovereign large language models and AI infrastructure for enterprise and government",
    sector: "software_digital", fteBand: "50-249", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "GovTech", company: "Nortal", country: "Estonia",
    description: "Digital government platforms, e-identity and public sector data services",
    sector: "software_digital", fteBand: "250+", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "Platform", company: "sennder", country: "Germany",
    description: "Digital road freight forwarding platform matching shippers with carriers",
    sector: "software_digital", fteBand: "250+", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "Cloud / NeoCloud", company: "Nebius", country: "Netherlands",
    description: "GPU cloud infrastructure and managed services for AI training workloads",
    sector: "software_digital", fteBand: "250+", ticketBand: "gt50m", developmentStage: "scaling_revenue" },
  { archetype: "MedTech", company: "Corti", country: "Denmark",
    description: "Real-time AI copilot for clinical consultations and emergency triage",
    sector: "health_lifesciences", fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "pilot_customers" },
  { archetype: "Life sciences", company: "BioNTech", country: "Germany",
    description: "mRNA immunotherapies and vaccines, clinical and commercial stage",
    sector: "health_lifesciences", fteBand: "250+", ticketBand: "gt50m", developmentStage: "scaling_revenue" },
  { archetype: "AgriTech", company: "eAgronom", country: "Estonia",
    description: "Farm management software and soil carbon programmes for arable growers",
    sector: "agrifood", fteBand: "10-49", ticketBand: "b500k_2m5", developmentStage: "pilot_customers" },
];

