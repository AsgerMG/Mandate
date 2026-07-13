// Classifies each ingestion adapter (etl/adapters/, registered in
// data/seeds.py) by the kind of content it collects, so the About page can
// group /api/sources output by content type instead of hand-maintaining a
// coverage description that drifts from what's actually running.
//
// This mapping is a structural fact about the codebase (which adapter
// collects what kind of content), not a corpus statistic — it only needs an
// update when an adapter is added or repurposed, at which point whoever is
// already editing etl/adapters/ can add one line here. Unclassified keys
// fall back to "press" (see `categoryFor`) rather than silently disappearing
// from the About page.

export type SourceCategory = "law" | "regulator" | "press" | "consultation";

export const CATEGORY_LABELS: Record<SourceCategory, string> = {
  law: "Law & legislative pipeline",
  regulator: "Regulators & courts",
  press: "Press & specialist media",
  consultation: "Consultations",
};

export const CATEGORY_NOTES: Record<SourceCategory, string> = {
  law: "Official legal texts, legislative procedure trackers, consolidated statutes, and verbatim parliamentary proceedings.",
  regulator: "Press releases and decisions straight from the regulators, data-protection authorities, and courts themselves.",
  press: "Specialist tech and policy journalism, analysis, and cross-outlet news monitors.",
  consultation: "Public consultation platforms — where a proposal is open for input before it's law.",
};

// Legislative/legal-text pipeline, plus verbatim parliamentary proceedings
// (the record of what was actually said while a text moved through it).
const LAW_KEYS = new Set([
  "eurlex",
  "eurlex_com_proposals",
  "eurlex_ep_council_legislation",
  "eurlex_key_acts",
  "eurlex_oj_l",
  "oeil",
  "law_tracker",
  "an_dossiers",
  "an_verbatim",
  "senat_dossiers",
  "senat_textes",
  "bundestag_hib",
  "bundesrat_neueingaenge",
  "bgbl1",
  "gesetze_aktudienst",
  "ep_texts_adopted",
  "ep_verbatim",
  "ep_written_questions",
  "conseil_etat_avis",
  "de_verbatim",
]);

// Official bodies speaking for themselves: regulators, DPAs, competition
// authorities, standards bodies, courts, ombudsman.
const REGULATOR_KEYS = new Set([
  "adlc_decisions",
  "cnil_news",
  "anssi_news",
  "arcom_news",
  "bfdi_news",
  "bkarta_news",
  "bnetza_presse",
  "bsi_presse",
  "bmi_presse",
  "bmwe_presse",
  "amf_presse",
  "arcep_presse",
  "defenseurdesdroits_actu",
  "hmbbfdi_news",
  "stiftung_datenschutz",
  "berec_news",
  "edpb_news",
  "eba_news",
  "esma_news",
  "eiopa_news",
  "ecb_press",
  "eu_ombudsman",
  "ec_press",
  "ec_digital",
  "ep_press",
  "etsi_news",
  "bag_presse",
  "bgh_presse",
  "bverwg_presse",
  "conseil_etat_actu",
  "ccomptes_rapports",
  "eprs_blog",
]);

// Public consultation platforms.
const CONSULTATION_KEYS = new Set(["have_your_say"]);

// Everything else — independent/specialist press, industry-association
// comms, research-institute news, cross-outlet monitors — falls through to
// "press" via categoryFor's default.

export function categoryFor(sourceKey: string): SourceCategory {
  if (LAW_KEYS.has(sourceKey)) return "law";
  if (REGULATOR_KEYS.has(sourceKey)) return "regulator";
  if (CONSULTATION_KEYS.has(sourceKey)) return "consultation";
  return "press";
}

export const CATEGORY_ORDER: SourceCategory[] = ["law", "regulator", "press", "consultation"];
