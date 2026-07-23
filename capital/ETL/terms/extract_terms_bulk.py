"""Terms engine, bulk mode (Phase 5 of the eligibility plan): comprehensive,
text-first extraction at instrument-corpus scale.

extract_terms.py's JOBS dict is hand-tuned per record (keyword lists, focus
text) — appropriate for the 7 framework-level records where authoring cost
amortises across the whole corpus, not for ~290 distinct real instruments
where per-instrument authoring, not API cost, would dominate.

This script generalises the same primitives (target_pages, _norm, the free
mechanical verbatim-match check) but replaces hand-tuned focus text with:
  - a FIXED keyword checklist (the G1-G6 gate families + obligations/
    cumulation/application/ticket terms) instead of a per-instrument list
  - a single comprehensive prompt per instrument requesting the full
    _SCHEMA.md record shape (8-15 gates, not 3-7; plus obligations,
    cumulation, application) in one call
  - the free mechanical verbatim check on every quote (fabrication of the
    quote itself is ruled out)
  - the paid entailment second pass (extract_terms.py's verify_gate step
    (b)) is DELIBERATELY SKIPPED here — these gates land at the new
    'llm_cited' tier, not 'llm_2pass'. Promotion to llm_2pass is a later,
    targeted, "verify-on-demand" pass for whatever a real founder shortlist
    surfaces (see the Phase 5 plan's maintenance section), not a blanket
    upfront cost.

The only genuinely per-instrument human input is DOC_MAP: which fetched
document(s) in data/raw/instrument_docs/ ground this instrument. Everything
else reuses INTAKE_FIELDS/GATE_FAMILIES/target_pages/_norm from
extract_terms.py unmodified.

Usage:
  python3 ETL/terms/extract_terms_bulk.py plan
  python3 ETL/terms/extract_terms_bulk.py run [--instrument ID] [--dry-run]
  python3 ETL/terms/extract_terms_bulk.py status
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import sqlite3

from extract_terms import (  # noqa: E402
    DOCS, GATE_FAMILIES, INTAKE_FIELDS, MODEL, TERMS,
    _norm, load_doc, target_pages,
)

# Fixed checklist — NOT per-instrument hand-tuning. Every bulk job is scored
# against the same terms; target_pages() picks whichever pages actually
# score, so a short scheme page and a 100-page regulation both work.
BULK_KEYWORDS = [
    # English
    "eligib", "SME", "small and medium", "applicant", "beneficiary",
    "criteria", "requirement", "threshold", "ceiling", "maximum",
    "minimum", "must", "shall", "shall not", "obligation", "cumulation",
    "application", "deadline", "co-financ", "own contribution",
    "registered", "established", "headquarter", "TRL", "readiness level",
    # French (ADEME, Bpifrance, and other FR sources are pure-French text —
    # cognates like "application"/"maximum" alone under-select the pages
    # that actually carry eligibility/obligation content)
    "éligib", "bénéficiaire", "PME", "critère", "exigence", "plafond",
    "seuil", "doit", "obligation", "cumul", "candidature", "demande",
    "cofinanc", "siège social", "immatricul",
    # German (KfW, future DE sources)
    "förderfähig", "antragsteller", "begünstigt", "KMU", "voraussetzung",
    "höchstbetrag", "obergrenze", "muss", "verpflichtung", "antrag",
    # Italian / Spanish (Fondo di Garanzia, Invitalia, further ES sources)
    "ammissib", "beneficiario", "PMI", "requisito", "massimale", "domanda",
    "elegib", "solicitante", "límite máximo", "solicitud",
    # Norwegian / Danish / Swedish (Innovasjon Norge, NFR, Innovationsfonden,
    # Vinnova) -- short scheme pages score 0 on every other-language list
    # above and get silently skipped without these
    "vilkår", "krav", "bedrift", "søke", "søknad", "tilskudd", "lån",
    "virksomhed", "ansøg", "betingelser", "företag", "ansökan", "villkor",
    # Slovak / Czech (satr_sk_*, tacr_fw) and Greek (satr_gr_*)
    "oprávnen", "žiadateľ", "podmienky", "maximáln", "žiadosť", "podnik",
    "επιλεξιμ", "δικαιούχος", "προϋποθέσεις", "αίτηση", "επιχείρηση",
    # Polish (sudop_rnd_purpose's ministerial rozporządzenia are pure-Polish
    # legal text -- same missing-language-coverage class of bug as SK/GR)
    "kwalifikowaln", "beneficjent", "wnioskodawca", "przedsiębiorc",
    "pomoc publiczna", "wymagania", "warunki", "maksymaln", "wniosek",
]

# instrument_id -> list of filenames already in data/raw/instrument_docs/
# The only per-instrument human curation this script needs. Extend as more
# documents are fetched (see MANIFEST.md's Tier A/B/C/D acquisition log).
DOC_MAP: dict[str, list[str]] = {
    "innovate_uk": ["innovate_uk_smart_grants_apr2024.html"],
    "vinnova_grant": ["vinnova_state_aid_rules.html"],
    "business_finland": ["business_finland_rd_funding.html"],
    "innovationsfonden_innobooster": ["innovationsfonden_innobooster_guidelines_2021.pdf"],
    "altum_mvu_izaugsmes_aizdevumi": ["altum_growth_loan_sme.html"],
    "htgf_equity": ["htgf_investment_criteria.html"],
    "almi_invest_equity": ["almi_invest_criteria.html"],
    "tacr_fw": ["tacr_trend_program.html"],
    "cdti_idi": ["cdti_bases_reguladoras_orden_cnu_161_2025.pdf"],
    "cdti_neotec": ["cdti_neotec_boe_convocatoria_2026_extracto.html",
                     "cdti_bases_reguladoras_orden_cnu_161_2025.pdf"],
    "cdti_misiones": ["cdti_misiones_boe_convocatoria_2025_extracto.html",
                       "cdti_bases_reguladoras_orden_cnu_161_2025.pdf"],
    "eis_starditoetus": ["eis_starditoetus_terms_eis.html"],
    "eis_innovatsiooniosak_arendu": ["eis_innovatsiooniosak_arendu_terms_eis.html"],
    "eis_digitaliseerimise_teekaa": ["eis_digitaliseerimise_teekaa_terms_eis.html"],
    "eis_ettev_tja_teadus_ja_aren": ["eis_ettev_tja_teadus_ja_aren_terms_eis_en.html"],
    "eis_e_veoselehe_liidestamise": ["eis_e_veoselehe_liidestamise_news_eis.html"],
    "innovationsfonden_erhvervsforsker": ["innovationsfonden_erhvervsforsker_industrial_phd_guidelines_2026.pdf"],
    "innovationsfonden_innofounder": ["innovationsfonden_innofounder_guidelines_2026.pdf"],
    "innovationsfonden_other": ["innovationsfonden_other_general_terms_international_projects_2018.pdf"],
    "nfr_pes": ["nfr_pes_horisont_europa_call_2025.html", "nfr_pes_rammebevilgning_2025_2027.html"],
    "nfr_pesordning": ["nfr_pes_horisont_europa_call_2025.html", "nfr_pes_rammebevilgning_2025_2027.html"],
    "nfr_inno": ["nfr_inno_innovasjonsprosjekt_naeringslivet_overview.html"],
    "eic_pathfinder": ["eic_pathfinder_eligibility.html"],
    "eic_transition": ["eic_transition_eligibility.html"],
    "eic_accelerator": ["eic_accelerator_eligibility.html"],
    "eic_fund": ["eic_fund_eligibility.html", "eic_fund_about.html"],
    "altum_starta_izaugsmes_aizdevu": ["altum_starta_izaugsmes_aizdevu_start_loan_en.html"],
    "altum_garantijas_pilna_cikla_u": ["altum_garantijas_pilna_cikla_u_credit_guarantees_en.html"],
    "altum_garantijas_3_1_1_1_pas_k": ["altum_garantijas_3_1_1_1_pas_k_kredita_garantijas_2022_wayback.html"],
    # altum_anm_kepa deliberately OMITTED — the agent that found it flagged the
    # instrument identity itself as an unconfirmed circumstantial guess (filename
    # prefixed CANDIDATE). Extracting eligibility text against an unconfirmed
    # instrument mapping risks attaching real-sounding requirements to the wrong
    # scheme, which is worse than no coverage. Needs a stronger primary source
    # (Altum annual report / RRF programme index spelling out "KEPA") before this
    # is safe to run.
    "eis_ettev_tete_digip_rde_toe": ["eis_ettev_tete_digip_rde_toe_digipoorde_toetus.html"],
    "eis_ettev_tja_varustuskindlu": ["eis_ettev_tja_varustuskindlu_wayback_2025.html"],
    "eis_ettev_tjate_k_berturvali": ["eis_ettev_tjate_k_berturvali_innovation_dev_en.html"],
    "eis_ida_viru_v_ike_ja_keskmi": ["eis_ida_viru_v_ike_ja_keskmi_investeeringute_toetus.html"],
    "eis_rakendusuuringute_toetus": ["eis_rakendusuuringute_toetus_programme_en.html"],
    "eis_turismisektori_tarkvarad": ["eis_turismisektori_tarkvarad_liitumis_liidestamistoetus_en.html"],
    "innovationsfonden_grand_solutions": ["innovationsfonden_grand_solutions_guidelines_2026_phase1.pdf",
                                           "innovationsfonden_grand_solutions_guidelines_2026_phase2.pdf"],
    "innovationsfonden_innoexplorer": ["innovationsfonden_innoexplorer_guidelines_2026.pdf"],
    "eifo_coinvest": ["eifo_matchloan_coinvest.html"],
    "nfr_energiforskning": ["nfr_energiforskning_innovasjonsprosjekt_energi_transport_2026.html"],
    "nfr_eurostars": ["nfr_eurostars_overview.html", "nfr_eurostars_utlysning_2026.html"],
    "nfr_rekruttering": ["nfr_rekruttering_100mill_ny_ordning_2025.html",
                          "nfr_rekruttering_talentfulle_forskere_utlysning_2025.html"],
    "tesi_equity": ["tesi_equity_our_approach.html", "tesi_equity_investment_process.html",
                     "tesi_equity_for_companies.html"],
    "ademe_aid": ["ademe_regime_exempte_sa59358.pdf", "ademe_regles_generales_attribution_aides_2014.pdf"],
    "cdp_vc_equity": ["cdp_vc_equity_term_sheet_guidelines.pdf"],  # skip the 6.4MB brochure — low eligibility-text density
    "cdti_cervera": ["cdti_cervera_boe_bases_reguladoras_2025.html", "cdti_cervera_boe_convocatoria_2025.html"],
    "fr_relance_industrie": ["fr_relance_industrie_aides_territoires.html",
                              "fr_relance_industrie_rebond_bpifrance_subdomain.html"],
    # Finding: rebond-industriel.bpifrance.fr (a subdomain) is NOT behind the
    # same Cloudflare wall as the main bpifrance.fr site — worth trying
    # subdomains for the other Bpifrance instruments (bpifrance_inov,
    # bpifrance_innovup_leader_idf, bpifrance_pmup_idf) before writing them
    # off as Tier D.
    "bpifrance_inov": ["bpifrance_inov_cahier_des_charges_vague14.pdf",
                        "bpifrance_inov_catalogue_offres_page.html"],
    "bpifrance_innovup_leader_idf": ["bpifrance_innovup_leader_idf_appel_a_projets_2025.pdf",
                                      "bpifrance_innovup_leader_idf_iledefrance_page.html"],
    "bpifrance_pmup_idf": ["bpifrance_pmup_idf_guide_candidat_2024.pdf",
                            "bpifrance_pmup_idf_iledefrance_page.html"],
    "innovasjon_norge_grant_cluster": ["innovasjon_norge_grant_cluster_bedriftsnettverk.html",
                                        "innovasjon_norge_grant_cluster_nic.html",
                                        "innovasjon_norge_grant_cluster_seksjon_nettverk.html"],
    "innovasjon_norge_grant_innovation": ["innovasjon_norge_grant_innovation_tilskudd_innovasjonskontrakter.html",
                                           "innovasjon_norge_grant_innovation_tilskudd_innovasjonsradgivning.html",
                                           "innovasjon_norge_grant_innovation_tilskudd_miljoteknologi.html"],
    "innovasjon_norge_grant_international": ["innovasjon_norge_grant_international_eos_midlene.html",
                                              "innovasjon_norge_grant_international_seksjon_eos.html"],
    "innovasjon_norge_grant_regional": ["innovasjon_norge_grant_regional_regionale_distriktsmidler.html"],
    "innovasjon_norge_grant_sector": ["innovasjon_norge_grant_sector_tilskudd_overview.html"],
    "innovasjon_norge_grant_startup": ["innovasjon_norge_grant_startup_oppstartstilskudd_1.html",
                                        "innovasjon_norge_grant_startup_oppstartstilskudd_2.html"],
    "innovasjon_norge_loan_lowrisk": ["innovasjon_norge_loan_lowrisk_lavrisikolan.html"],
    "innovasjon_norge_loan_risk": ["innovasjon_norge_loan_risk_gront_risikolan.html",
                                    "innovasjon_norge_loan_risk_seksjon_lan.html"],
    "fondo_di_garanzia": ["fondo_di_garanzia_disposizioni_operative_2023.pdf"],  # no funding_instruments row yet — see note
    "invitalia_smart_start": ["invitalia_smart_start_regolamento_dm2014.pdf",
                               "invitalia_smart_start_dm2022_modifiche.pdf"],  # no funding_instruments row yet — see note
    # fondo_di_garanzia / invitalia_smart_start: Italy's funding_instruments
    # rows are currently only satr_it_equity/satr_it_rnd/cdp_vc_equity — these
    # two real, named Italian schemes don't have their own instrument row yet.
    # Running extraction against a non-existent instrument_id will still
    # produce a usable YAML record, but sync_gates_from_yaml.py will SKIP it
    # (no matching funding_instruments row) until one is added — either via
    # populate_funding_instruments.py picking them up from real event data, or
    # a manual curated row like the framework records use.
    "satr_fr_rnd": ["satr_fr_rnd_sa111723_regime_cadre_2024_2026.pdf",
                     "satr_fr_rnd_sa58995_regime_cadre_2014_2023.pdf"],
    # Poland (NCBR Ścieżka SMART, PFR starter, BGK KIT POIR) deliberately NOT
    # wired here yet — Poland's DB rows are SUDOP-sourced generic categories
    # (sudop_rnd_purpose/sudop_parp_rd) that don't obviously correspond to
    # these specific named programmes; files saved, ready once that mapping
    # is confirmed. Logged in MANIFEST.md.
    "de_kfw_erp_foerderkredit_kmu": ["kfw_merkblatt_365_erp_foerderkredit_kmu.pdf",
                                      "kfw_merkblatt_366_erp_foerderkredit_kmu_haftungsfreistellung.pdf",
                                      "kfw_anlage_datenliste_365_366.pdf"],
    # Germany has no single consolidated R&D-aid framework like France's
    # régime cadre (confirmed structural finding, not a search gap — each
    # ministry self-certifies GBER Art. 25 independently per programme) —
    # these 5 Bundesanzeiger Richtlinie docs are a representative sample
    # across ministries/topics, all citing the same GBER Art. 25 legal basis.
    "satr_de_rnd": ["satr_de_rnd_bmftr_richtlinie_sicherheit_2025.pdf",
                     "satr_de_rnd_bmwk_dlr_richtlinie_weltraum_2022.pdf",
                     "satr_de_rnd_bmbf_richtlinie_energieforschung_nuklear_2024.pdf",
                     "satr_de_rnd_bmwk_richtlinie_dns_mobilitaet_2024.pdf",
                     "satr_de_rnd_bmbf_richtlinie_oestliche_partnerschaft_2023.pdf"],
    "satr_ie_rnd": ["ie_smes_startups_aid_scheme.pdf", "enterprise_ireland_tor_rd_2024.pdf"],
    "enterprise_ireland_rd": ["enterprise_ireland_rdi_fund_reference_doc.pdf", "enterprise_ireland_tor_rd_2024.pdf"],
    "enterprise_ireland_dtif": ["enterprise_ireland_dtif_call5_guide.pdf"],
    "enterprise_ireland_seed": ["enterprise_ireland_seed_vc_scheme_2025_2029.pdf"],
    "enterprise_ireland_ip": ["enterprise_ireland_ipp_guidelines_2025.pdf"],
    "satr_be_rnd": ["be_wallonie_decret_rdi_2008_wallex.html", "be_wallonie_agw_rdi_application.html",
                     "be_vlaanderen_besluit_ontwikkeling_innovatie.html", "be_vlaanderen_besluit_consortia_oo.html"],
    "satr_be_equity": ["be_screenflanders_criteria.html", "be_wallimage_entreprises.html"],
    "satr_nl_rnd": ["nl_rnes_wetten_overheid_2023.html", "nl_kaderbesluit_ezk_lnv_subsidies.html"],
    "satr_nl_equity": ["nl_rnes_wetten_overheid_2023.html"],
    "invest_nl_fof": ["nl_invest_nl_fund_investments.html"],
    "invest_nl_equity": ["nl_invest_nl_fund_investments.html"],
    "satr_at_rnd": ["at_ffg_kmu_richtlinie_2024_2026.pdf", "at_ffg_industrie_richtlinie_2024_2026.pdf"],
    "satr_at_equity": ["at_aws_erp_kredit_richtlinie.pdf"],
    # satr_se_rnd is an 11-granting-authority rollup, not one programme —
    # representative sample of the top authorities by event count
    "satr_se_rnd": ["satr_se_rnd_klimatklivet_forutsattningar.html",
                     "satr_se_rnd_klimatklivet_regler.html",
                     "satr_se_rnd_energimyndigheten_allmanna_villkor_forskning_innovation.pdf",
                     "satr_se_rnd_formas_stodnivaer.pdf",
                     "satr_se_rnd_formas_generella_villkor_bidrag.pdf"],
    # bdns_es_ayudas: no single national framework (fragmented by call/order,
    # confirmed finding) -- representative sample of the largest recurring
    # sub-schemes' own bases reguladoras
    "bdns_es_ayudas": ["bdns_es_orden_cin_1502_2021_bases_cpp.html",
                        "bdns_es_orden_ict_738_2022_perte_agroalimentario.html",
                        "bdns_es_orden_cin_1025_2022_aei_bases.html"],
    "tacr_fw": ["cz_tacr_vseobecne_podminky_v8_2024.pdf", "cz_act_130_2002_rd_support_law.html"],
    "satr_cz_rnd": ["cz_mpo_twist_program_call_2025.pdf", "cz_act_130_2002_rd_support_law.html"],
    "business_finland": ["fi_business_finland_rd_funding_terms_2026.pdf"],
    "satr_fi_rnd": ["fi_business_finland_rd_funding_terms_2026.pdf"],
    "satr_fi_equity": ["fi_business_finland_rd_funding_terms_2026.pdf"],
    # fi_act_758_2021_*.html deliberately SKIPPED: Finlex serves it as a
    # Next.js page with the real statute text embedded as JSON inside
    # <script> blocks -- load_doc()'s HTML path strips <script> content
    # entirely as noise, so this file currently extracts to ~nothing. The
    # Business Finland PDF above covers the same ground; a JSON-aware parser
    # for this pattern is a real future improvement, not fixed here.
    "satr_pt_rnd": ["pt_portaria_103a_2023_compete2030_id_regulation.pdf"],
    "satr_pt_equity": ["pt_portaria_103a_2023_compete2030_id_regulation.pdf"],
    # altum_anm_kepa: identity confirmed (3 independent sources agree: the
    # source workbook's own ANM_KEPA sheet, the MK Nr.594 regulation defining
    # "kapitāla atlaide", Altum's own press release) -- the literal "KEPA"
    # abbreviation expansion is still unconfirmed (flagged, not asserted),
    # but the instrument mapping itself is now safe to extract against.
    "altum_anm_kepa": ["altum_anm_kepa_CONFIRM_likumi_lv_mk594_regulation.html",
                        "altum_anm_kepa_CONFIRM_altum_news_118_companies.html"],
    # satr_it_rnd/equity: fragmented pattern like Germany, no single régime
    # cadre (confirmed finding) -- representative multi-scheme sample
    "satr_it_rnd": ["satr_it_rnd_accordi_innovazione_scheda.pdf",
                     "satr_it_rnd_mimit_fcs_landing.html",
                     "satr_it_rnd_credito_imposta_mezzogiorno_governo.html"],
    "satr_it_equity": ["satr_it_equity_pnric_investimenti_sostenibili_40_scheda.pdf",
                        "satr_it_equity_fondo_rotativo_turismo_pnrr.html",
                        "satr_it_equity_dm_29gen2015_fondo_venture_capital.pdf"],
    "satr_sk_rnd": ["satr_sk_rnd_component9_scheme.pdf"],
    "satr_sk_equity": ["satr_sk_equity_seed_startup_capital.pdf"],
    "satr_gr_rnd": ["satr_gr_rnd_erevno_kainotomo_call.pdf"],
    "satr_gr_equity": ["satr_gr_equity_hdb_equifund_page.html"],
    # satr_hu_rnd/equity: fragmented like Germany/Italy -- representative
    # sample across the real sub-programmes identified via project_title
    "satr_hu_rnd": ["hu_nkfi_alap_380_2014_korm_rendelet.html",
                     "hu_ginop_plusz_213_24_felhivas.pdf",
                     "hu_demjan_sandor_program_kormany_page.html"],
    "satr_hu_equity": ["hu_avhga_uzletszabalyzat_2019.pdf"],
    # EIF has no separate trackable instrument row in the corpus (its role is
    # architectural/intermediary -- guarantees flow through national banks,
    # already captured indirectly in those instruments), but its real
    # touchpoint is the InvestEU intermediary framework record -- strengthen
    # it with the actual EIF product docs (fetched back in Wave 2) instead of
    # the generic InvestEU regulation text alone.
    "eu_investeu_intermediary": ["eif_investeu_guarantee_products.html", "eif_guarantees_overview.html",
                                  "investeu_regulation_2021_523.pdf"],
    "chips_ju_kdt": ["chips_ju_mawp_2023_2027_main.pdf", "chips_ju_mawp_general_annexes.pdf"],
    "chp": ["chp_clean_hydrogen_awp2026.pdf"],
    "edf_ra": ["edf_work_programme_2025_partII.pdf", "edf_work_programme_2026.pdf"],
    "edf_da": ["edf_work_programme_2025_partII.pdf", "edf_work_programme_2026.pdf"],
    "eib_venture": ["eib_venture_debt_impact_assessment.pdf", "eib_venture_debt_page.html"],
    "eit_health_catapult": ["eit_health_catapult_programme_page.html"],
    "eit_urban_mobility": ["eit_urban_mobility_startup_investment_page.html",
                            "eit_urban_mobility_startups_call_manual.pdf"],
    "ihi": ["ihi_call12_calltext.pdf", "ihi_guide_for_applicants.pdf"],
    "ipcei_mect": ["ipcei_mect_commission_decision_SA101129.pdf", "ipcei_mect_ec_project_page.html"],
    "sns_ju": ["sns_ju_bawp_2026_2027.pdf"],
    # Horizon Europe General Annexes: the shared base-eligibility document
    # for ALL Pillar II clusters (admissibility, legal-entity eligibility,
    # standard consortium composition rules) -- one document, grounds all 7.
    "horizon_eu_cl5": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "horizon_eu_cl4": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "horizon_eu_cl6": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "horizon_eu_cl1": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "horizon_eu_miss": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "horizon_eu_cl3": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "horizon_eu_cbe": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "erc_poc": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "horizon_eu_eie": ["horizon_eu_general_annexes_2026_2027.pdf"],
    "clean_aviation": ["clean_aviation_amended_wpb_2026_2027.pdf"],
    "europes_rail": ["europes_rail_wp2026_full.pdf", "europes_rail_wp2026_amendment1.pdf"],
    "sesar_ju": ["sesar_ju_qa_document_v1.pdf", "sesar_ju_bawp_2026_2027.pdf"],
    "eurohpc": ["eurohpc_ju_work_programme_2026.pdf"],
    "gh_edctp3": ["gh_edctp3_work_programme_2026.pdf"],
    "euspa": ["euspa_horizon_wp7_digital_industry_space_2026_2027.pdf"],
    "ipcei_hy2tech": ["ipcei_hy2tech_commission_decision_SA64647.pdf"],
    "ipcei_hy2use": ["ipcei_hy2use_commission_decision_SA64650.pdf"],
    "ipcei_hy2infra": ["ipcei_hy2infra_commission_decision_SA102825.pdf"],
    "ipcei_eubatin": ["ipcei_eubatin_commission_decision_SA55831.pdf"],
    "eit_food_rfs": ["eit_food_rfs_info_page.html", "eit_food_rfs_faq_page.html"],
    "eit_digital_champions": ["eit_digital_champions_faq_page.html"],
    "eit_innoenergy_highway": ["eit_innoenergy_highway_forstartups_page.html"],
    "eit_urban_mobility_portfolio": ["eit_urban_mobility_portfolio_startup_investment_page.html"],
    "eit_climate_kic_cdr": ["eit_climate_kic_cdr_climaccelerator_page.html"],
    "eit_climate_kic_asa": ["eit_climate_kic_asa_amazon_sustainability_accelerator_page.html"],
    "eit_manufacturing_investments": ["eit_manufacturing_investments_page_wayback20260313.html"],
    "eit_manufacturing_boostup": ["eit_manufacturing_boostup_north2023_call_wayback20260420.html"],
    "satr_lu_rnd": ["satr_lu_rnd_guichet_aides_rdi.html"],
    "satr_ee_rnd": ["satr_ee_rnd_riigiteataja_maarus_wayback.html"],
    "satr_lv_rnd": ["satr_lv_rnd_mk_noteikumi_350042.html"],
    "satr_cz_equity": ["satr_cz_equity_zakonyprolidi_107_2023.html"],
    "innovation_fund_lsp": ["innovfund_2025_nzt_call_document_lsp_msp_ssp_mfg_plt.pdf"],
    "innovation_fund_msp": ["innovfund_2025_nzt_call_document_lsp_msp_ssp_mfg_plt.pdf"],
    "innovation_fund_ssp": ["innovfund_2025_nzt_call_document_lsp_msp_ssp_mfg_plt.pdf"],
    "innovation_fund_mfg": ["innovfund_2025_nzt_call_document_lsp_msp_ssp_mfg_plt.pdf"],
    "innovation_fund_plt": ["innovfund_2025_nzt_call_document_lsp_msp_ssp_mfg_plt.pdf"],
    "innovation_fund_battery": ["innovfund_2024_battery_call_document.pdf"],
    "innovation_fund_hbank": ["innovfund_2025_hydrogen_auction_call_document.pdf"],
    "innovation_fund_hbank_2024_maritime": ["innovfund_2024_hydrogen_auction_general_maritime_call_document.pdf"],
    # satr_fr_equity: DB cross-check found 86% of this bucket's events are
    # actually the SAME régime cadre already grounding satr_fr_rnd (the
    # equity/rnd split buckets by instrument form -- loan vs grant -- not
    # legal aid category), so reuse those docs; only ~7% (SA.111729 chain)
    # is genuinely risk-finance-specific and needed new grounding.
    "satr_fr_equity": ["satr_fr_equity_regime_cadre_sa111729.pdf",
                        "satr_fr_rnd_sa111723_regime_cadre_2024_2026.pdf"],
    # satr_de_equity: confirmed fragmented at Land/Landesförderbank level
    # (107 SA numbers, 35 authorities) -- representative regional sample,
    # same honesty discipline as satr_de_rnd's ministry-level fragmentation.
    "satr_de_equity": ["satr_de_equity_sachsen_frl_bab.pdf"],
    "satr_gb_equity": ["satr_gb_equity_english_aid_access_finance_smes.pdf"],
    "satr_ie_equity": ["satr_ie_equity_ec_case_irish_film_support_scheme.pdf"],
    "satr_lv_equity": ["satr_lv_equity_mk_noteikumi_284072_seed_growth_kapitals.html",
                        "satr_lv_equity_mk_noteikumi_333889_digitala_transformacija.html"],
    "altum_mvu_ia_3_1_1_7_un_13_1_1": ["altum_mvu_ia_3_1_1_7_un_13_1_1_inovativu_produktu_izstradei.html"],
    "altum_starta_aizdevumi_3_1_1_4": ["altum_starta_aizdevumi_3_1_1_4_starta_aizdevums_lv.html"],
    "altum_covid_19_kr_zes_aizdevum": ["altum_covid_19_kr_zes_aizdevum_mk_noteikumi_313370.html"],
    "altum_mikro_aizdevumi_3_1_1_4_": ["altum_mikro_aizdevumi_3_1_1_4_apgrozamiem_investicijam.html"],
    "altum_anm_digi": ["altum_anm_digi_digitalizacija_lv.html"],
    "nfr_forny20": ["nfr_forny20_programplan_2019.pdf"],
    "nfr_petroleum": ["nfr_petroleum_innovasjonsprosjekt_energi_transport_2026.html"],
    "altum_aizdevumi_produktivit_te": ["altum_aizdevumi_produktivit_te_em_gov_lv_sam_1212.html"],
    "altum_anm_elektroauto_garantij": ["altum_anm_elektroauto_garantij_em_gov_lv.html"],
    "altum_kult_ras_komersantu_atba": ["altum_kult_ras_komersantu_atba_mk_noteikumi_320816.html"],
    "nfr_maritimforsk": ["nfr_maritimforsk_samarbeidsprosjekt_2026.html", "nfr_maritimforsk_125mill_nyhet_2024.html"],
    # altum_aui: unconfirmed CANDIDATE mapping, deliberately not wired (same
    # discipline as altum_anm_kepa's earlier resolution -- needs a stronger
    # source before it's safe to extract against).
    # altum_ua: genuinely BLOCKED, no identity found despite multiple angles.
    "ipcei_med4cure": ["ipcei_med4cure_sa104974_decision_2024.pdf"],
    "ipcei_tech4cure": ["ipcei_tech4cure_sa113212_decision_2025.pdf"],
    "ipcei_batteries": ["ipcei_batteries_first_sa54794_decision_2019.pdf"],
    "ipcei_micro": ["ipcei_microelectronics_first_de_decision_2018.pdf"],
    "ipcei_hy2move": ["ipcei_hy2move_commission_decision_SA104676.pdf"],
    "ipcei_cloud": ["ipcei_cloud_commission_decision_SA102517.pdf"],
    "chips_ju_kdt_unknown": ["chips_ju_kdt_work_programme_2021.pdf"],
    "eit_health_catapult": ["eit_health_catapult_eligibility_page_wayback.html"],
    "eit_climate_kic_asa": ["eit_climate_kic_asa_news_article.html"],
    "eit_climate_kic_clean_cities_spain": ["eit_climate_kic_clean_cities_spain_news_article_wayback.html",
                                            "eit_climate_kic_clean_cities_network_wayback2023.html"],
    "eit_digital_vap": ["eit_digital_vap_venture_program_page.html", "eit_digital_vap_call_2022.pdf"],
    "eit_rawmaterials_portfolio": ["eit_rawmaterials_portfolio_startup_2025.pdf",
                                    "eit_rawmaterials_accelerator_eligibility_page.html"],
    # Poland: combining NCBR (100% grounded, 1,043/1,753 events) + PARP +
    # OPI-PIB + ABM umbrella regulations found in this final push -- together
    # 1,043+295+125+80 = 1,543 of 1,753 events (88%), only the 206
    # unattributed + 4 BGK rows remain ungrounded. Safe to extract now.
    "sudop_rnd_purpose": ["pl_ncbr_rozporzadzenie_mnisw_2020_pomoc_publiczna_poir.pdf",
                           "pl_ncbr_rozporzadzenie_mfipr_2023_pomoc_finansowa_feng.pdf",
                           "PL_PARP_rozporzadzenie_FENG_2021-2027_DzU2022poz2510.pdf",
                           "PL_OPI-PIB_rozporzadzenie_FENG_2021-2027_DzU2023poz2132.pdf",
                           "PL_ABM_rozporzadzenie_pomoc_publiczna_amendment_DzU2024poz990.pdf"],
    # Poland (sudop_rnd_purpose/sudop_parp_rd) deliberately NOT wired here --
    # the researching agent found the existing docs (NCBR Ścieżka SMART, BGK
    # KIT POIR) cover only a small fragment of a genuine 5-agency composite
    # bucket (NCBR/PARP/OPI-PIB/ABM/BGK) and explicitly warned against
    # building a single term sheet off a partial slice, since that would
    # misrepresent coverage for the other ~70% of events. Left undone rather
    # than risk overstating confidence -- see MANIFEST.md "Pass: Poland".
}

BULK_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "gates": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "gate_family": {"type": "string", "enum": GATE_FAMILIES},
                    "requirement": {"type": "string"},
                    "value": {"type": "string"},
                    "quote": {"type": "string"},
                    "locator": {"type": "string"},
                    "intake_field": {"type": "string", "enum": INTAKE_FIELDS},
                },
                "required": ["id", "gate_family", "requirement", "value",
                             "quote", "locator", "intake_field"],
            },
        },
        "obligations": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "requirement": {"type": "string"},
                    "quote": {"type": "string"},
                    "locator": {"type": "string"},
                },
                "required": ["requirement", "quote", "locator"],
            },
        },
        "cumulation": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "text": {"type": "string"},
                "quote": {"type": "string"},
                "locator": {"type": "string"},
            },
            "required": ["text", "quote", "locator"],
        },
        "application": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "channel": {"type": "string"},
                "typical_timeline": {"type": "string"},
                "quote": {"type": "string"},
                "locator": {"type": "string"},
            },
            "required": ["channel", "typical_timeline", "quote", "locator"],
        },
    },
    "required": ["gates", "obligations"],
}

SYSTEM_PROMPT = (
    "You extract ELIGIBILITY GATES and related clauses from official EU/"
    "national funding programme text for a qualification engine, aiming for "
    "COMPREHENSIVE coverage (8-15 gates where the text supports it, not a "
    "shallow 3-4). The source document may be in ANY European language: "
    "extract from it regardless of language. The requirement sentence is "
    "always English, but the quote itself STAYS IN THE SOURCE DOCUMENT'S "
    "ORIGINAL LANGUAGE (exact verbatim span, never translated), matching "
    "extract_terms.py's established it_startup_innovativa precedent, so it "
    "can still be mechanically verified against the source text. For each "
    "gate/obligation/clause: a precise English "
    "requirement sentence, an EXACT verbatim quote (copy characters exactly, "
    "no paraphrase, no ellipses, one contiguous span, max 60 words), and the "
    "page/section locator it came from (the === marker). Only extract what "
    "the text ACTUALLY establishes — never invent a requirement the source "
    "doesn't support; skip a category entirely (e.g. leave obligations "
    "empty) rather than fabricate one. gate_family follows the same G1-G6 "
    "taxonomy as extract_terms.py: G1_nexus (who/where can apply), "
    "G2_size_ownership (SME/size/ownership tests), G3_financial "
    "(ceilings/intensities/amounts), G4_borrower_model (grant vs loan vs "
    "equity mechanics), G5_use_of_funds (what the money may/must fund), "
    "G6_conditionality (obligations, cumulation, exclusions)."
)


def extract_instrument(client, instrument_id: str, docs: list[str]) -> dict:
    all_pages = []
    for doc in docs:
        all_pages.extend((f"{doc}#{loc}", text) for loc, text in load_doc(doc))
    pages = target_pages(all_pages, BULK_KEYWORDS, cap_chars=80000)
    if not pages:
        print(f"  {instrument_id}: no matching pages in {docs} — check DOC_MAP")
        return {"gates": [], "obligations": []}
    body = "\n\n".join(f"=== {loc} ===\n{text}" for loc, text in pages)
    res = client.messages.create(
        model=MODEL, max_tokens=8192, thinking={"type": "disabled"},
        output_config={"format": {"type": "json_schema", "schema": BULK_SCHEMA}},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content":
                   f"Instrument: {instrument_id}\nSource document(s): {', '.join(docs)}\n\n{body}"}])
    text = next((b.text for b in res.content if b.type == "text"), "{}")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        if res.stop_reason == "max_tokens":
            # Rich document, response got cut off mid-gate. Rather than
            # discard a near-complete extraction, salvage every complete
            # {...} object inside "gates": [...] up to the truncation point
            # -- still real, mechanically-checkable quotes, just fewer of
            # them than the model would have produced with more room.
            print(f"  {instrument_id}: response truncated at max_tokens — salvaging partial gates")
            return _salvage_truncated_json(text)
        return {"gates": [], "obligations": []}


def _salvage_truncated_json(text: str) -> dict:
    """Best-effort recovery for a response cut off mid-stream: walk the
    top-level "gates" array and keep only objects with balanced braces,
    dropping the one mid-write when truncation hit. Same treatment for
    "obligations". cumulation/application (single objects, not arrays) are
    dropped if truncation reached them incomplete -- they're worth re-running
    for specifically rather than guessing at a partial object."""
    import re as _re

    REQUIRED = {
        "gates": {"gate_family", "requirement", "quote"},
        "obligations": {"requirement", "quote"},
    }

    def _complete_objects(array_text: str, required_keys: set[str]) -> list[dict]:
        out, depth, start = [], 0, None
        for i, ch in enumerate(array_text):
            if ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start is not None:
                    try:
                        obj = json.loads(array_text[start:i + 1])
                        if required_keys.issubset(obj):
                            out.append(obj)
                    except json.JSONDecodeError:
                        pass
                    start = None
            elif ch == "]" and depth == 0:
                # end of THIS array — stop before bleeding into whatever
                # top-level key comes next (this was the actual bug: without
                # this, scanning "gates" objects ran past the array's own
                # closing bracket straight into "obligations" and mislabeled
                # those as gates, crashing write_record on a missing
                # gate_family key).
                break
        return out

    result = {"gates": [], "obligations": []}
    for key in ("gates", "obligations"):
        m = _re.search(rf'"{key}"\s*:\s*\[', text)
        if m:
            result[key] = _complete_objects(text[m.end():], REQUIRED[key])
    return result


def mechanical_check(quote: str, doc_text_norm: str) -> tuple[bool, str]:
    """Same fragment-based check as extract_terms.py's verify_gate step (a),
    standalone (no import needed — pure string logic)."""
    import re
    fragments = [f for f in re.split(r"\s*(?:\.\.\.|…|\[…\]|\[\.\.\.\])\s*", quote) if f.strip()]
    if not fragments:
        return False, "empty quote"
    for frag in fragments:
        if _norm(frag) not in doc_text_norm:
            return False, f"fragment not found verbatim: {frag[:50]!r}"
    return True, ""


def write_record(instrument_id: str, docs: list[str], result: dict) -> None:
    import yaml as _yaml

    def tag(items, is_list=True):
        """Runs the mechanical check on every quote, tags verified: llm_cited
        or drops it with a note. No paid entailment call here by design."""
        doc_norm = _norm(" ".join(t for _, t in load_doc(docs[0])))
        # multi-doc instruments: check against the union of all docs' text
        if len(docs) > 1:
            doc_norm = _norm(" ".join(
                t for d in docs for _, t in load_doc(d)))
        out = []
        seq = items if is_list else [items]
        for it in seq:
            if not it or not it.get("quote"):
                continue
            ok, note = mechanical_check(it["quote"], doc_norm)
            it = dict(it)
            it["verified"] = "llm_cited" if ok else False
            if not ok:
                it["verify_note"] = note
            out.append(it)
        return out if is_list else (out[0] if out else None)

    gates = tag(result.get("gates", []))
    obligations = tag(result.get("obligations", []))
    cumulation = tag(result.get("cumulation"), is_list=False)
    application = tag(result.get("application"), is_list=False)

    rec = {
        "id": instrument_id,
        "name": instrument_id,  # overwritten below if a prior record exists
        "administering_body": "see source document",
        "country": "",
        "capital_type": "unknown",
        "status": "draft",
        "gates": [{
            "id": g.get("id") or f"g{i}", "gate_family": g["gate_family"],
            "requirement": g["requirement"], "value": g.get("value", ""),
            "intake_field": g.get("intake_field", "none"),
            "quote": g["quote"],
            "source": {"file": docs[0], "locator": g.get("locator", "")},
            "verified": g["verified"],
            **({} if g["verified"] else {"verify_note": g.get("verify_note", "")}),
        } for i, g in enumerate(gates)],
        "obligations": [{
            "requirement": o["requirement"], "quote": o["quote"],
            "source": {"file": docs[0], "locator": o.get("locator", "")},
            "verified": o["verified"],
            **({} if o["verified"] else {"verify_note": o.get("verify_note", "")}),
        } for o in obligations],
        "verify_by": "2027-07-21",
        "notes": f"Extracted by ETL/terms/extract_terms_bulk.py "
                 f"({sum(1 for g in gates if g['verified'])}/{len(gates)} gates, "
                 f"{sum(1 for o in obligations if o['verified'])}/{len(obligations)} obligations "
                 f"passed mechanical check -> llm_cited).",
    }
    if cumulation:
        rec["cumulation"] = {
            "text": cumulation["text"], "quote": cumulation["quote"],
            "source": {"file": docs[0], "locator": cumulation.get("locator", "")},
            "verified": cumulation["verified"],
        }
    if application:
        rec["application"] = {
            "channel": application.get("channel", ""),
            "typical_timeline": application.get("typical_timeline", ""),
            "quote": application["quote"],
            "source": {"file": docs[0], "locator": application.get("locator", "")},
            "verified": application["verified"],
        }

    out_path = TERMS / f"{instrument_id}.yaml"
    existing = {}
    if out_path.exists():
        existing = _yaml.safe_load(out_path.read_text()) or {}
    # Preserve country/capital_type/name/founder_fit if a prior (e.g. Tier 0
    # populate_funding_instruments-seeded) record already set them.
    for k in ("name", "country", "capital_type", "founder_fit", "fit_rationale",
              "borrower_models", "ticket"):
        if existing.get(k):
            rec[k] = existing[k]
    out_path.write_text(_yaml.safe_dump(rec, sort_keys=False, allow_unicode=True, width=88))
    n_cited = sum(1 for g in gates if g["verified"]) + sum(1 for o in obligations if o["verified"])
    n_total = len(gates) + len(obligations)
    print(f"  -> {out_path.name}: {n_cited}/{n_total} gates+obligations reached llm_cited "
          f"({len(gates)} gates, {len(obligations)} obligations, "
          f"cumulation={'y' if cumulation else 'n'}, application={'y' if application else 'n'})")


def cmd_plan(_args) -> None:
    if not DOC_MAP:
        print("DOC_MAP is empty — nothing to plan. Add instrument_id -> [docs] entries first.")
        return
    for instrument_id, docs in DOC_MAP.items():
        missing = [d for d in docs if not (DOCS / d).exists()]
        status = f"MISSING: {missing}" if missing else "ready"
        print(f"{instrument_id:<40} docs={docs}  [{status}]")


def cmd_run(args) -> None:
    import anthropic
    client = anthropic.Anthropic()
    targets = {args.instrument: DOC_MAP[args.instrument]} if args.instrument else DOC_MAP
    for instrument_id, docs in targets.items():
        missing = [d for d in docs if not (DOCS / d).exists()]
        if missing:
            print(f"{instrument_id}: SKIPPED — missing doc(s) {missing}")
            continue
        print(f"{instrument_id} ({', '.join(docs)})")
        result = extract_instrument(client, instrument_id, docs)
        print(f"  extracted {len(result.get('gates', []))} gate proposals, "
              f"{len(result.get('obligations', []))} obligation proposals")
        if args.dry_run:
            continue
        write_record(instrument_id, docs, result)


def cmd_status(_args) -> None:
    import yaml as _yaml
    conn = sqlite3.connect(str(ROOT / "data" / "db.sqlite"))
    rows = conn.execute(
        "SELECT instrument_id, verification_level, COUNT(*) FROM eligibility_gates "
        "WHERE instrument_id IN ({}) GROUP BY 1, 2".format(
            ",".join("?" * len(DOC_MAP)))
        if DOC_MAP else
        "SELECT instrument_id, verification_level, COUNT(*) FROM eligibility_gates WHERE 0",
        list(DOC_MAP),
    ).fetchall() if DOC_MAP else []
    by_instrument: dict[str, dict[str, int]] = {}
    for iid, level, n in rows:
        by_instrument.setdefault(iid, {})[level] = n
    for instrument_id in DOC_MAP:
        levels = by_instrument.get(instrument_id, {})
        print(f"{instrument_id:<40} {levels or '(not synced yet)'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("plan").set_defaults(fn=cmd_plan)
    r = sub.add_parser("run")
    r.add_argument("--instrument")
    r.add_argument("--dry-run", action="store_true")
    r.set_defaults(fn=cmd_run)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
