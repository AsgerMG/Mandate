"""Author the gate-encoding corrections, joined to the published snapshot.

WHY THIS IS A GENERATOR AND NOT A HAND-WRITTEN FILE
---------------------------------------------------
Every correction has to quote the spec it replaces, and a spec typed out by
hand is a spec that can be typed wrong -- which is the whole failure this
workstream is about. So the DECISION is authored here, one line per gate, and
the CURRENT state is read from `web/public/data/instrument_terms.json`
and joined in. A gate that has moved, or whose key no longer exists, fails this
script rather than producing a correction against a row that is not there.

The quote and the requirement are never touched. They are the funder's own
words and they are right. Only the comparator moves.

  python3 ETL/terms/_wsgu_corrections.py            # emit + report
  python3 ETL/terms/_wsgu_corrections.py --check     # fail if any row is stale
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
import sys  # noqa: E402
sys.path.insert(0, str(ROOT / "ETL" / "lib"))
from web_path import WEB  # noqa: E402  (the web app, <monorepo>/web)
SNAPSHOT = WEB / "public" / "data" / "instrument_terms.json"
OUT = (ROOT / "project-mgmt" / "evidence"
       / "wsgu_gate_encoding_corrections_2026-08-13.jsonl")
# NOT `data/`. The whole of `data/` is gitignored in an agent worktree (it is a
# symlink in the wsN2 layout), and this file is READ by a check -- so it would
# be a CI step reading gitignored data, which is exactly the failure this repo
# has already paid for once. Evidence lives where evidence is committed.

# ── THE CLAUSES ─────────────────────────────────────────────────────────────
# Each names the property the encoding breaks. They are the vocabulary the
# check and the encoder refusal share; nothing here is a fact about one fund.
CLAUSES = {
    "subject_disagreement":
        "the sentence constrains the PROJECT (its topic, market, technology "
        "domain or consortium); the comparator is keyed to a field whose "
        "answer describes the APPLICANT",
    "residual_required":
        "a positive operator requires the enumeration's residual value, so the "
        "rule asserts a fact about the gaps in our vocabulary rather than "
        "about the fund",
    "direction_inverted":
        "the sentence EXCLUDES a named category; the comparator admits a "
        "chosen subset and so rejects everything our vocabulary happens not to "
        "name",
    "scoped_to_a_substream":
        "the sentence binds one call, sub-scheme or participating state; the "
        "comparator binds the whole instrument",
    "permission_not_restriction":
        "the sentence EXTENDS eligibility; the comparator turns it into a "
        "requirement",
    "open_ended_set":
        "the sentence names a set it does not close ('or related...'); the "
        "comparator enumerates part of it, and the omitted part is excluded",
    "wrong_field":
        "the sentence turns on an attribute the keyed field does not name",
    "closed_route_encoded_as_a_gate":
        "the requirement is true and no founder can satisfy it: the fund is "
        "not approached by an operating company at all. That is a fact about "
        "the ROUTE, and a gate deletes the row in silence where the route "
        "layer would explain it",
    "one_branch_of_a_disjunction":
        "the sentence is one alternative in a list of ways to qualify; the "
        "comparator makes that branch the only way",
    "metadata_not_eligibility":
        "the text is a source catalogue's classification of the CALL, in a "
        "field the catalogue keeps separate from its beneficiary field; it "
        "restricts nobody",
    "operator_cannot_read_its_field":
        "the operator cannot act on the field's type at all, so the rule has "
        "never produced a verdict for anyone",
}

# ── THE DECISIONS ───────────────────────────────────────────────────────────
# (instrument_id, gate_key, clause, action, proposed_spec, funder_evidence)
#
# action:
#   quarantine  drop the comparator, keep the requirement. The convention
#               audit_encoding_vs_reality.py and verify_encodings.py already
#               use: the text still shows, the machine verdict stops.
#   rekey       the same sentence, encoded against the field that names what
#               it turns on.
#   narrow      the comparator stays on its field and is corrected in place.
#   route       the fund admits no founder at all; that is a route fact
#               (offerRoute.ts), not a gate, and the gate silently deletes the
#               row instead of explaining it.
DECISIONS: list[dict] = []


def d(instrument, gate, clause, action, spec=None, url="", quote="", trans="", says=""):
    DECISIONS.append(dict(instrument=instrument, gate=gate, clause=clause,
                          action=action, spec=spec,
                          funder=dict(url=url, quote=quote, translation=trans, says=says)))


# ── Vinnova ─────────────────────────────────────────────────────────────────
d("vinnova_grant__nationella_flygtekniska_forskningsprogrammet_nff_974d86",
  "scheme_text_1", "subject_disagreement", "quarantine",
  url="https://www.vinnova.se/e/utlysning-2023-00898/starkt-svensk-flygteknisk-forskning-och-2024-01423/",
  quote="Utlysningen riktar sig till alla organisationer inom flygområdet eller sådana som är i behov av att stärka sin kunskap",
  trans="The call is aimed at all organisations within the aviation field, or those needing to strengthen their knowledge",
  says="the funder names companies, research institutes and universities/university "
       "colleges as eligible party types, and restricts only to a Swedish "
       "driftställe. The aviation domain is the PROJECT's; no sentence confines "
       "applicants to firms already trading in aviation.")

d("vinnova_grant__6g_615e28", "scheme_text_1", "subject_disagreement", "quarantine",
  url="https://www.vinnova.se/e/foi-samverkansprojekt/6g-forskning-och-innovation-2025/",
  quote="Utlysningen riktar sig till konsortier bestående av flera projektparter, med minst ett eller fler företag och minst ett eller flera universitet eller högskolor.",
  trans="The call is aimed at consortia consisting of several project parties, with at least one or more companies and at least one or more universities or university colleges.",
  says="the AI / edge / 6G / cybersecurity list is the set of CALL TOPICS the "
       "project must address. The applicant-side rules are consortium shape and "
       "legal personality. A chip company is a natural 6G participant and the "
       "call says nothing to exclude it.")

d("vinnova_grant__avancerad_digitalisering_eb7eab", "scheme_text_1",
  "scoped_to_a_substream", "quarantine",
  url="https://www.vinnova.se/e/avancerad-digitalisering-industriell-2024-04161/industriell-flexibel-energistyrning/",
  quote="konsortier med minst två projektparter där minst en behovsägare från elintensiv industri ingår",
  trans="consortia with at least two project parties in which at least one need-owner from electricity-intensive industry is included",
  says="the requirement exists in ONE call of the programme and is a rule about "
       "the CONSORTIUM, not the coordinator. Three sibling calls under the same "
       "programme carry no such rule. The funder names software vendors, "
       "startups, grid operators and universities as the other members, and "
       "puts no sector test on the coordinator at all.")

# ── Innovasjon Norge ────────────────────────────────────────────────────────
d("innovasjon_norge_grant_innovation", "g9", "subject_disagreement", "quarantine",
  url="https://www.innovasjonnorge.no/tjeneste/tilskudd-til-miljoteknologi",
  quote="Bedrifter som utvikler miljøteknologi",
  trans="Businesses that develop environmental technology",
  says="the test is what the PROJECT develops -- 'utvikling, pilotering og "
       "demonstrasjon av ny miljøteknologi' -- and whether the product solves a "
       "significant environmental problem. Any Norwegian company in "
       "Brønnøysundregistrene may apply; nothing confines applicants to firms "
       "already trading in cleantech.")

for gate in ("g5", "g6"):
    d("innovasjon_norge_grant_sector", gate, "scoped_to_a_substream", "quarantine",
      url="https://www.innovasjonnorge.no/tjeneste/bedriftsutvikling-i-reindriftsbaserte-naeringer",
      quote="Reineiere og foredlingsbedrifter i tilknytning til reindrift kan søke om tilskudd.",
      trans="Reindeer owners and processing businesses connected to reindeer herding may apply for grants.",
      says="the restriction is real, and it binds two discrete services inside "
           "the 'Støtte til landbruk og reindrift' umbrella. Its binding "
           "attribute is narrower than any sector -- reindeer OWNERSHIP, or "
           "ownership of a landbrukseiendom -- and it must not propagate to the "
           "instrument's other schemes, which carry no sector test.")

# ── Norges forskningsråd: the requirement is about LEGAL FORM ───────────────
d("nfr_inno", "g1-sole-proprietorships-excluded", "wrong_field", "rekey",
  spec={"op": "not_in", "field": "organisationType", "allowed": ["sole_trader"]},
  url="https://www.forskningsradet.no/finansiering/naringsliv/innovasjonsprosjekt-i-naringslivet/",
  quote="Enkeltpersonforetak og forskningsorganisasjoner kan ikke søke",
  trans="Sole proprietorships and research organisations cannot apply",
  says="two exclusions, neither by sector and neither by borrowing model: a "
       "LEGAL FORM (enkeltpersonforetak) and an ORGANISATION TYPE "
       "(forskningsorganisasjon). 'Bedrifter som er registrert i det norske "
       "foretaksregisteret ... kan søke' -- ordinary incorporated companies are "
       "the intended applicants.")

d("nfr_inno", "g1-research-organisations-excluded", "wrong_field", "rekey",
  spec={"op": "not_in", "field": "organisationType", "allowed": ["research_org"]},
  url="https://www.forskningsradet.no/finansiering/naringsliv/innovasjonsprosjekt-i-naringslivet/",
  quote="Enkeltpersonforetak og forskningsorganisasjoner kan ikke søke",
  trans="Sole proprietorships and research organisations cannot apply",
  says="same sentence, its other half. Research organisations may still "
       "participate as contracted R&D suppliers, so the exclusion is on the "
       "APPLICANT role.")

d("nfr_petroleum", "g1_sole_proprietor_excluded", "wrong_field", "rekey",
  spec={"op": "not_in", "field": "organisationType", "allowed": ["sole_trader"]},
  url="https://www.forskningsradet.no/utlysninger/2026/innovasjonsprosjekt-naringslivet-energi-og-transport/",
  quote="Enkeltpersonforetak kan ikke være prosjektansvarlige, men de kan være samarbeidspartnere.",
  trans="Sole proprietorships cannot be project owners, but they can be collaboration partners.",
  says="a legal-form rule on the project-responsible entity.")

for gate in ("g1-nexus-entity-type", "g2"):
    d("nfr_energiforskning", gate, "wrong_field", "rekey",
      spec={"op": "not_in", "field": "organisationType", "allowed": ["sole_trader"]},
      url="https://www.forskningsradet.no/utlysninger/2026/innovasjonsprosjekt-naringslivet-energi-og-transport/",
      quote="må være enten en privat bedrift, eller et offentlig foretak som driver virksomhet av industriell eller forretningsmessig karakter",
      trans="must be either a private company, or a public undertaking carrying out activity of an industrial or commercial character",
      says="the applicant-side rule turns on legal form and the economic "
           "character of the entity -- a private undertaking versus a "
           "non-economic public body versus a sole trader. The "
           "energy/petroleum/maritime/transport list constrains the project "
           "theme, not the applicant.")

# ── Innovationsfonden ───────────────────────────────────────────────────────
d("innovationsfonden_innobooster", "g5-theme-alignment",
  "subject_disagreement", "quarantine",
  url="https://innovationsfonden.dk/sites/default/files/2026-01/Innobooster%20retningslinjer%20under%20Gruppefritagelsesforordningen%202026.pdf",
  quote="Innobooster kan kun investere i innovationsprojekter, der falder inden for minimum ét af nedenstående temaer. ... I ansøgningsblanketten vil I blive bedt om at beskrive, hvordan projektets løsning bidrager til det valgte tema.",
  trans="Innobooster can only invest in innovation projects that fall within at least one of the themes below. ... In the application form you will be asked to describe how the project's solution contributes to the chosen theme.",
  says="the theme test is on the PROJECT's solution, stated twice and in the "
       "application form itself. §1.2.1 restricts applicants only to companies "
       "with a Danish CVR number; the exclusions are by status (insolvency, "
       "public ownership, recovery order) and by SME size, never by industry. "
       "The green theme's own scope spans energy, agriculture, food, transport, "
       "construction, biodiversity, bioeconomy and AI.")

d("innovationsfonden_innobooster", "g1-legal-form", "wrong_field", "rekey",
  spec={"op": "in", "field": "organisationType", "allowed": ["company", "sole_trader"]},
  url="https://innovationsfonden.dk/sites/default/files/2026-01/Innobooster%20retningslinjer%20under%20Gruppefritagelsesforordningen%202026.pdf",
  quote="Det kan være i selskabsform, fx et A/S, ApS eller personligt ejet selskab.",
  trans="It may be in company form, e.g. an A/S, ApS or a personally owned company.",
  says="a legal-form rule. It admits the personally owned business as well as "
       "the incorporated one, which is the opposite of what a borrowerModel "
       "comparator can say.")

# ── Chips JU: Annex 4 is a table of PER-STATE conditions ────────────────────
CHIPS_URL = "https://www.fundingprogrammesportal.gov.cy/en/call/chips-joint-undertaking-horizon-ju-chips-2024-2-ria/"
CHIPS_QUOTE = ("Eligibility criteria are described in Annex 1 (page 79) and Annex 4 "
               "(National/Regional specific eligibility conditions, page 84) of the Chips "
               "Joint Undertaking (Chips JU) Work Programme 2023-2025. ... There are "
               "specific eligibility criteria relevant to each Participating State")
CHIPS_SAYS = (
    "Annex 4 is a table whose columns are Country | National eligibility | "
    "National contact person. Each row is one Participating State's condition "
    "for co-funding ITS OWN participants out of ITS OWN budget -- Malta "
    "Enterprise states it directly: 'Even if an applicant within a consortium is "
    "approved by the Chips JU, the national eligibility criteria must still be "
    "met to qualify for co-funding support.' Encoded as three instrument-wide "
    "entityCountries filters they are mutually contradictory -- no applicant is "
    "registered in Slovakia, Norway and Poland at once -- and wrong for the "
    "~28 other Participating States.")
for gate in ("G1-03", "scheme_text_0", "scheme_text_1"):
    d("chips_ju_kdt_unknown", gate, "scoped_to_a_substream", "quarantine",
      url=CHIPS_URL, quote=CHIPS_QUOTE, trans="(English source)", says=CHIPS_SAYS)

d("chips_ju_kdt", "G1-03", "wrong_field", "rekey",
  spec={"op": "not_in", "field": "organisationType", "allowed": ["sole_trader"]},
  url="https://www.chips-ju.europa.eu/",
  quote="Natural persons are NOT eligible (with the exception of self-employed persons, i.e. sole traders, where the company does not have legal personality separate from that of the natural person).",
  trans="(English source)",
  says="the sentence excludes NATURAL PERSONS and then carves the sole trader "
       "back IN. Encoded as borrowerModel not_in ['operating'] it excludes "
       "every incorporated company -- the exact inverse of what it says, and "
       "borrowerModel is pinned to 'operating' for every founder, so the fund "
       "is deleted from all of them. Encoding the carve-out as a restriction "
       "would be a second error; the eligible set is 'a legal entity', which "
       "our organisationType vocabulary states as the exclusion of nobody. The "
       "narrowest faithful reading is that no organisationType we collect is "
       "excluded, so the correction is the sole-trader clause the funder "
       "actually names as the boundary case.")

# ── EIT KICs: the constraint is on the SOLUTION ─────────────────────────────
for gate in ("g1-target-market", "g5-core-topics"):
    d("eit_urban_mobility_portfolio", gate, "subject_disagreement", "quarantine",
      url="https://www.eiturbanmobility.eu/what-we-offer/support-to-startups/accelerate-startup/",
      quote="For-profit startups across a wide range of mobility verticals, including energy, decarbonisation, urban logistics, space tech, data and AI-driven mobility solutions, and health and mobility.",
      trans="(English source)",
      says="the funder ENUMERATES energy, space tech, data/AI and health "
           "companies as eligible. A comparator requiring sector == "
           "mobility_transport rejects four of the verticals the funder names.")

for gate in ("g1-sector", "g1-tech-domain"):
    d("eit_manufacturing_boostup", gate, "subject_disagreement", "quarantine",
      url="https://www.eit.europa.eu/news-events/news/statement-eit-manufacturing-and-support-beneficiaries",
      quote="(EIT Manufacturing ASBL filed for liquidation on 25 March 2026 and ceased operations on 10 April 2026; eitmanufacturing.eu returns HTTP 530 on every path.)",
      trans="(English source)",
      says="the criterion was a B2B business model serving manufacturing "
           "companies as CUSTOMERS -- a fact about the buyer, not about the "
           "applicant's own industry; the portfolio held a SaaS company and a "
           "biomaterials company. The instrument itself should be retired "
           "rather than re-encoded: flagged to the liveness workstream, out of "
           "scope here.")

for gate in ("g1-sector", "scheme_text_1"):
    d("eit_manufacturing_investments", gate, "subject_disagreement", "quarantine",
      url="https://www.eit.europa.eu/news-events/news/statement-eit-manufacturing-and-support-beneficiaries",
      quote="(EIT Manufacturing ASBL filed for liquidation on 25 March 2026 and ceased operations on 10 April 2026.)",
      trans="(English source)",
      says="same programme, same defect, same disposal. 'Addressing critical "
           "challenges in the manufacturing sector' is what the solution must "
           "do, not what the applicant must be.")

for gate in ("g1-sector", "llm_classified_0"):
    d("eit_innoenergy_highway", gate, "subject_disagreement", "quarantine",
      url="https://innoenergy.com/startups/apply-form/",
      quote="Energy for circular economy; Energy for transport and mobility; Renewable Energies; Smart Electric Grid; Energy Storage; Smart and efficient buildings and cities; Nuclear instrumentation; Energy Efficiency",
      trans="(English source)",
      says="the applicant selects a technology AREA OF IMPACT, and two of the "
           "eight are mobility and the built environment. 'Fields related to "
           "clean tech' is a domain of impact, not an incumbent line of "
           "business.")

for gate in ("g1", "llm_classified_0"):
    d("eit_rawmaterials_portfolio", gate, "subject_disagreement", "quarantine",
      url="https://eitrawmaterials.eu/erma-booster-call",
      quote="Relevant to the EU's critical and strategic raw materials supply chain",
      trans="(English source)",
      says="the operative project criterion is relevance to the supply chain. A "
           "software or industrial-tech company whose innovation serves "
           "exploration, processing or recycling meets the stated test.")

for gate in ("g1-startup-eligibility", "g1-thematic-scope"):
    d("eit_climate_kic_clean_cities_spain", gate, "subject_disagreement", "quarantine",
      url="https://cleancities-accelerator.com/applications/",
      quote="Our accelerator program focuses on key challenges in urban environments, including community retrofitting, green spaces, mobility, renewable energy, and data and information systems",
      trans="(English source)",
      says="one sentence spanning construction, ecology, mobility, energy and "
           "data. 'Data and information systems' as a named challenge area is a "
           "direct invitation to software companies, which the comparator "
           "rejects.")

d("eit_climate_kic_cdr", "g5_sector", "subject_disagreement", "quarantine",
  url="https://www.climate-kic.org/programmes/climate-entrepreneurship/climaccelerator/",
  quote="The ClimAccelerator curriculum was designed for early-stage start-up founders developing solutions that have a positive impact on climate change.",
  trans="(English source)",
  says="'founders developing SOLUTIONS that...' -- the constraint is on what is "
       "built, not on the industry the builder already sits in.")

d("eit_digital_champions", "g4-thematic-area", "subject_disagreement", "quarantine",
  url="https://28digital.eu/venture-incubation-program/",
  quote="(the five thematic areas are published at eitdigital.eu/champions/thematic-areas/, which returns HTTP 403; the wording is NOT VERIFIED verbatim)",
  trans="(English source)",
  says="the corpus's own requirement text settles the subject without needing "
       "the page: 'Applicants must APPLY WITHIN one of the five defined "
       "thematic areas' is a rule about the submission, not about the "
       "applicant's industry. Quarantined on the corpus's own wording; the "
       "thematic list is not asserted either way.")

d("eit_digital_vap", "g1_domain_fit", "subject_disagreement", "quarantine",
  url="https://28digital.eu/venture-incubation-program/",
  quote="(same page; the five-domain list is NOT VERIFIED verbatim)",
  trans="(English source)",
  says="same shape as the sibling gate above.")

d("eit_digital_vap", "g1_vip_location", "open_ended_set", "narrow",
  spec={"op": "in", "field": "entityCountries", "allowed": [
      "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark",
      "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland",
      "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
      "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
      "Montenegro", "North Macedonia", "Serbia", "Turkey", "Ukraine"]},
  url="https://28digital.eu/venture-incubation-program/",
  quote="Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, and Sweden ... Montenegro, North Macedonia, Serbia, Türkiye, Ukraine",
  trans="(English source)",
  says="the funder publishes a NAMED CLOSED LIST of 32, not the open 'EU "
       "Member State or Horizon Europe Associated Country' formula. So Norway, "
       "Iceland, Switzerland, the UK and Israel are CORRECTLY absent and "
       "widening would be wrong -- the single omission is Türkiye. Note "
       "separately that this list belongs to the Venture Incubation Program; "
       "if the gate's own instrument is the Venture Acceleration Programme it "
       "is attached to the wrong row, which is an attribution question and not "
       "an encoding one.")

for gate in ("g2", "llm_classified_0", "scheme_text_0"):
    d("eit_health_catapult", gate, "subject_disagreement", "quarantine",
      url="https://eithealth.eu/programmes/eit-health-catapult/",
      quote="Active in Life Sciences (Drugs, biologics, gene therapies, synthetic biology, drug discovery platforms) or HealthTech (Digital health or Medtech)",
      trans="(English source)",
      says="the only genuinely incumbent phrasing in the EIT set -- and the "
           "categories it names still cross industries. 'Digital health' and "
           "'Medtech' put a software or electronics company in scope BY ITS "
           "PRODUCT. A sector == health_life_sciences test rejects exactly the "
           "digital-health company the funder's own category admits.")

# The regime-level twin of the two leaf gates above. It is INHERITED by the
# portfolio row, so correcting only the leaf would leave the same rule in place
# one level up.
d("eit_urban_mobility", "G1-2", "subject_disagreement", "quarantine",
  url="https://www.eiturbanmobility.eu/what-we-offer/support-to-startups/accelerate-startup/",
  quote="For-profit startups across a wide range of mobility verticals, including energy, decarbonisation, urban logistics, space tech, data and AI-driven mobility solutions, and health and mobility.",
  trans="(English source)",
  says="the regime-level statement of the same rule the two leaf gates carry.")

# ── Funds an operating company does not approach at all ─────────────────────
# Each requirement below is TRUE and cited, and each is encoded so that
# `assessInstrument` returns `blocked` for every founder who will ever ask --
# because `borrowerModel` is pinned to 'operating' and every one of these
# demands something else. The verdict is right and the mechanism is wrong: a
# blocked row is deleted from the table with no explanation, where offerRoute.ts
# exists precisely to say "you do not apply to this directly". These are the
# eight `check_comparator_admits` now names, less the two above that are the
# funder's sentence inverted.
ROUTE_SAYS = (
    "the requirement is accurate. What it is not is a gate: with borrowerModel "
    "pinned to 'operating', the comparator is decided at encode time and "
    "decides FALSE for every founder, so `accessiblePool` deletes the row "
    "rather than the product saying who does apply. Move the fact to the offer "
    "route and drop the comparator.")
for inst, gate, url in (
    ("enterprise_ireland_seed", "g1",
     "https://www.enterprise-ireland.com/en/funding/seed-and-venture-capital"),
    ("enterprise_ireland_seed", "scheme_text_0",
     "https://www.enterprise-ireland.com/en/funding/seed-and-venture-capital"),
    ("invest_nl_equity", "g4-borrower-model", "https://www.invest-nl.nl/en/funds"),
    ("invest_nl_equity", "scheme_text_3", "https://www.invest-nl.nl/en/funds"),
    ("satr_ee_equity", "llm_classified_3", ""),
    ("satr_lt_equity", "llm_classified_2", ""),
):
    d(inst, gate, "closed_route_encoded_as_a_gate", "route",
      url=url, quote="(the gate's own cited quote, unchanged)",
      trans="", says=ROUTE_SAYS)

# ── A condition whose operator cannot read its field ────────────────────────
# `boolean_false` returns true for "no", false for "yes" and null for anything
# else. `borrowerModel` holds an enum, so these three have returned null for
# every founder since they were written: a real condition, invisible.
for inst in ("innovation_fund_msp", "innovation_fund_plt", "innovation_fund_ssp"):
    gate = {"innovation_fund_msp": "g4-financial-close-condition",
            "innovation_fund_plt": "G4-01",
            "innovation_fund_ssp": "g2-financial-close"}[inst]
    d(inst, gate, "operator_cannot_read_its_field", "quarantine",
      url="https://climate.ec.europa.eu/eu-action/eu-funding-climate-action/innovation-fund_en",
      quote="Only projects that have not reached financial close at proposal submission date can be funded.",
      trans="(English source)",
      says="a true condition about the PROJECT's financing stage, encoded as "
           "`boolean_false` against an enum field. The operator returns null "
           "for every value borrowerModel can hold, so the rule has never "
           "produced a verdict for anyone. There is no intake field for "
           "financial close; the honest state is a requirement with no "
           "comparator, which is what the memo already knows how to show.")

d("htgf_equity", "g2", "open_ended_set", "quarantine",
  url="https://www.htgf.de/en/venture-capital-investor-2/",
  quote="Your startup should be active in the fields of digital tech, industrial tech, life sciences, chemistry or related business areas.",
  trans="(English source)",
  says="'should be', not 'must be'; 'or related business areas' does not close "
       "the set; and the sentence sits under a heading reading 'Our investment "
       "criteria - Your chance', which is guidance to founders rather than a "
       "disqualification. The encoder's own rule already covers this: a set the "
       "text does not close must be skipped, because a partial list becomes a "
       "wrongful exclusion of everyone omitted.")



# ══ FRANCE, SPAIN, ESTONIA, LATVIA, IRELAND ════════════════════════════════
# Fetched from the funders' own pages and cahiers des charges. ADEME sits
# behind Cloudflare, so its pages were read through Internet Archive snapshots
# of ADEME's own URLs and its own PDF cahiers des charges -- never an
# aggregator.

d("ademe_aid__etudes_prealables_a_la_construction_d_une_instal_e19b03",
  "scheme_text_0", "subject_disagreement", "quarantine",
  url="https://agirpourlatransition.ademe.fr/entreprises/aides-financieres/catalogue/2025/etudes-prealables-la-construction-dune-installation-de-methanisation",
  quote="L'aide s'adresse aux collectivités, aux entreprises du secteur agricole et du secteur agroalimentaire, ainsi qu'aux associations (sauf celles bénéficiant du crédit d'impôt).",
  trans="The aid is addressed to local authorities, to companies of the agricultural sector and of the agri-food sector, and to associations (except those benefiting from the tax credit).",
  says="the eligible set is THREE kinds of applicant and the comparator keeps "
       "one. Collectivités and associations are dropped entirely, and the "
       "project subject -- méthanisation -- is not captured at all. Two of the "
       "three eligible classes are organisationType, not sector.")

d("ademe_aid__industrialisation_performante_des_produits_bois__6d0c88",
  "scheme_text_1", "subject_disagreement", "quarantine",
  url="https://agirpourlatransition.ademe.fr/entreprises/sites/default/files/IPPB%20-%20Cahier%20des%20charges%20-%202024.pdf",
  quote="Les acteurs économiques attachés à d'autres codes NAF et autres structures (organismes de recherche, associations, collectivités…) devront préciser, dans l'Annexe 2, en quoi leur activité est en lien avec la filière bois.",
  trans="Economic actors attached to OTHER NAF codes and other structures (research bodies, associations, local authorities…) must specify in Annex 2 how their activity relates to the wood sector.",
  says="the call is 'réservé aux PROJETS ... en lien avec les entreprises de la "
       "filière bois' and the applicant set is explicitly OPEN: a firm outside "
       "the NAF list qualifies on justification, and the stated route is to "
       "partner with a wood-sector industry. A closed comparator is stricter "
       "than ADEME. It blocked eleven industrial manufacturers -- the sawmills "
       "and joinery firms the scheme is for.")

d("ademe_aid__exploitation_forestiere_et_sylviculture_performa_416bcf",
  "scheme_text_1", "residual_required", "quarantine",
  url="https://agirpourlatransition.ademe.fr/entreprises/aides-financieres/20240321/exploitation-forestiere-sylviculture-performantes-resilientes-volet-1",
  quote="Ce dispositif s'adresse à toute entreprise ou structure qui pourrait être opérante dans : Un projet collectif visant à la structuration et modernisation du travail des entreprises de travaux forestiers…",
  trans="This scheme is addressed to any company or structure that could be operative in: a collective project aimed at structuring and modernising the work of forestry-work companies…",
  says="the NAF list belongs to VOLET 2 and this row is VOLET 1, which has no "
       "applicant-activity gate at all -- 'toute entreprise ou structure'. One "
       "requirement text was written across two schemes whose own texts "
       "differ. Encoded as `sector equals other` it also requires the "
       "residual, which no sentence can mean.")

d("ademe_aid__exploitation_forestiere_et_sylviculture_performa_a2e420",
  "scheme_text_2", "residual_required", "quarantine",
  url="https://agirpourlatransition.ademe.fr/entreprises/aides-financieres/catalogue/aap/exploitation-forestiere-et-sylviculture-performantes-et-resilientes-volet-2",
  quote="Ayant une activité de sylviculture et/ou d'exploitation forestière ou de sciage, caractérisées notamment par un code NAF parmi les suivants : 0210Z ... N'ayant pas un des codes NAF listés supra mais réalisant au moins 50 % de leur chiffre d'affaires dans des activités d'exploitation forestière ou de sylviculture.",
  trans="Having an activity of forestry and/or forest exploitation or sawing, characterised notably by one of the following NAF codes: 0210Z ... OR not having one of the NAF codes listed above but earning at least 50% of turnover from forest exploitation or forestry activities.",
  says="a genuine applicant-activity rule, and 'notamment' plus the 50%-of-"
       "turnover alternative make even ADEME's own code list rebuttable. The "
       "comparator says `sector equals other` -- 'Something else' -- while the "
       "taxonomy's `agrifood` label reads 'Agritech, food or FORESTRY'. It "
       "deleted four agrifood companies from a forestry scheme. There is no "
       "value that means 'forestry contractor', so the honest state is no "
       "comparator.")

d("ademe_aid__infrastructures_de_recharge_pour_les_vehicules_e_3a1708",
  "scheme_text_0", "residual_required", "quarantine",
  url="https://agirpourlatransition.ademe.fr/entreprises/sites/default/files/ADEME%20-%20Cahier%20des%20charges%20-%20Programme%20IRVE%20Stations-Service%20Ind%C3%A9pendantes%20-%20V2.pdf",
  quote="Le dispositif concerne les entreprises distribuant du carburant, disposant d'un numéro de SIRET, dont les exploitants sont propriétaires de leur fonds de commerce ... et vendant moins de 2 500 m3 de carburant ... par an et par station-service.",
  trans="The scheme concerns fuel-distributing businesses, holding a SIRET number, whose operators own their own goodwill ... and selling less than 2,500 m3 of fuel per year per station.",
  says="a real and very narrow applicant rule -- and NAF 47.30Z appears nowhere "
       "in ADEME's text; it is our own inference presented as the funder's "
       "criterion. The two tests that actually bind (under 2,500 m3 a year, "
       "and a location outside the INSEE grid's large urban centres) are "
       "dropped by the comparator, which instead admits `other` and blocked "
       "eleven cleantech companies.")

d("ademe_aid__industrie_zero_fossile_volet_3_decarb_flash_96ff6f",
  "scheme_text_1", "direction_inverted", "rekey",
  spec={"op": "not_in", "field": "activities", "allowed": ["fisheries_aquaculture"]},
  url="https://agirpourlatransition.ademe.fr/sites/default/files/DECARB%20FLASH%202025-2027%20-%20Cahier%20des%20charges%20-%202025.pdf",
  quote="Les secteurs suivants sont exclus de cet AAP : les activités tertiaires, agricoles (sauf celles relevant de l'industrie agro-alimentaire), de la pêche et de l'aquaculture, ...",
  trans="The following sectors are excluded from this call: tertiary activities, agricultural (except those falling under the agri-food industry), fisheries and aquaculture, ...",
  says="an EXCLUSION, encoded as `sector in ['agrifood','other']` -- a positive "
       "over a chosen pair that rejects nine of eleven sectors the funder "
       "never named, including the industrial manufacturers this call is FOR. "
       "`activities` is the field aid law's own exclusion lists are written "
       "in, and the encoder's own prompt already says so. Caveat recorded and "
       "not resolved here: the fisheries clause appears only in the 2025-2027 "
       "edition, and this row is titled for the 2022 one.")

d("ademe_aid__industrie_zero_fossile_volet_3_decarb_flash_96ff6f",
  "scheme_text_4", "subject_disagreement", "quarantine",
  url="https://agirpourlatransition.ademe.fr/sites/default/files/DECARB%20FLASH%202025-2027%20-%20Cahier%20des%20charges%20-%202025.pdf",
  quote="... et les entités industrielles dont l'activité est la production et la mise sur le marché d'énergie sur réseaux (électrique, de gaz etc.).",
  trans="... and industrial entities whose activity is the production and placing on the market of energy on networks (electricity, gas etc.).",
  says="the exclusion names UTILITIES -- entities selling energy onto a grid. "
       "`energy_cleantech` is 'Energy, cleantech or environment', which is what "
       "a decarbonising industrial site building the funded project answers. "
       "The comparator excludes exactly the applicants the call targets: five "
       "cleantech companies the register says won it.")

d("ademe_aid__investissements_de_recyclage_des_dechets_dont_or_2bc04f",
  "scheme_text_0", "residual_required", "quarantine",
  url="https://agirpourlatransition.ademe.fr/entreprises/dispositif-aide/financement-investissements-recyclage-dechets",
  quote="L'aide s'adresse aux entreprises de recyclage des déchets, souhaitant structurer de nouvelles filières et améliorer les performances de recyclage.",
  trans="The aid is addressed to waste recycling companies, wishing to structure new value chains and improve recycling performance.",
  says="the requirement is a faithful reading of the funder. The comparator is "
       "not: it names three values of which one is the residual, and OMITS "
       "energy_cleantech -- 'Energy, cleantech or ENVIRONMENT' -- which is "
       "where six of the eight companies the register says won it had placed "
       "themselves. Substituting our own better guess for the encoder's is the "
       "same mistake one value over, so the comparator goes rather than moves.")

for inst in ("bdns_es_ayudas__orden_de_la_consejeria_de_desarrollo_sostenible__dd1007",
             "bdns_es_ayudas__idi_proyectos_de_i_d_i_orientados_al_mercado_reg_e7b82d"):
    d(inst, "scheme_text_3", "metadata_not_eligibility", "quarantine",
      url="https://www.infosubvenciones.es/bdnstrans/api/convocatorias?vpd=GE&numConv=599422",
      quote='"sectores":[{"descripcion":"SUMINISTRO DE ENERGIA ELECTRICA, GAS, VAPOR Y AIRE ACONDICIONADO","codigo":"D"}] ... "tiposBeneficiarios":[{"descripcion":"GRAN EMPRESA"},{"descripcion":"PYME Y PERSONAS FISICAS QUE DESARROLLAN ACTIVIDAD ECONOMICA"}]',
      trans="(the BDNS record's own two fields, side by side)",
      says="BDNS keeps `sectores` -- a CNAE SECTION tag on what the call is "
           "about -- in a different field from `tiposBeneficiarios`, which is "
           "who may apply. The bases reguladoras behind these two say "
           "'personas jurídicas, personas físicas ... que realicen una "
           "actividad económica' and 'las empresas ... que cuenten con "
           "establecimiento operativo en La Rioja'. Neither restricts a "
           "sector. This is systemic: any requirement whose text is a bare "
           "CNAE section name is this field, not a gate.")

for inst in ("eis_turismisektori_tarkvarad", "eis_loomeettev_tjate_arengup",
             "eis_loomeettev_tjate_ekspord"):
    gate = ("g2-tourism-provider" if inst == "eis_turismisektori_tarkvarad"
            else "scheme_text_1")
    if inst == "eis_turismisektori_tarkvarad":
        url = "https://eis.ee/teenused/turismi-tarkvara-toetus/"
        quote = ("Toetust saab taotleda turismiteenuse pakkuja, kes on kas: Eestis "
                 "registreeritud juriidiline isik (ettevõtjad, mittetulundusühingud, "
                 "sihtasutused), Eesti riigiasutus, kohaliku omavalitsuse üksus ja selle asutus.")
        trans = ("Support can be applied for by a PROVIDER OF A TOURISM SERVICE, who is "
                 "either: a legal person registered in Estonia (companies, NGOs, "
                 "foundations), an Estonian state agency, a local government unit or its "
                 "institution.")
        says = ("the requirement is RIGHT and the encoding still cannot be. The "
                "applicant is the hotel, restaurant, spa, museum or tour operator "
                "buying the software -- not a software company serving them -- and "
                "the qualifying categories are majutus, toitlustus, spaa- ja "
                "taastusravi, konverentsi, reisiettevõtja, giidi, aktiivse puhkuse, "
                "muuseumi, atraktsiooni. EIS states explicitly that the EMTAK code "
                "is NOT the test. No value in an eleven-bucket innovation taxonomy "
                "names any of that, and `other` does not approximate it -- it "
                "asserts something else. Note what the register shows: the five "
                "companies deleted here answer `health_life_sciences`, which is "
                "where a spa- ja taastusravi provider lands. The comparator was "
                "wrong about them and so was our own classification.")
    else:
        url = "https://eis.ee/wp-content/uploads/2025/11/regulation.pdf"
        quote = ("The fields of creative industries include architecture, audiovisual "
                 "work, design, performing arts, publishing, art, cultural heritage, "
                 "entertainment software, music and advertising; ... an area related to "
                 "creative industries is an economic sector that is located at the "
                 "creation, production, distribution, intermediation and availability "
                 "links in the value chain")
        trans = "(the Minister for Culture's regulation, §3, in its own English text)"
        says = ("the regulation names no EMTAK codes; the test is the field list "
                "PLUS 'related areas' in the creative value chain, read off the "
                "Commercial Register. 'Entertainment software' is inside the "
                "definition, so a games company answering software_data_ai is "
                "eligible and the comparator deletes it. The gates that really "
                "bind here are the turnover floors, the three-year track record "
                "and the two-employee minimum -- all of them encodable, and none "
                "of them a sector.")
    d(inst, gate, "residual_required", "quarantine",
      url=url, quote=quote, trans=trans, says=says)

d("altum_mvu_izaugsmes_aizdevumi", "g2-sector-carveout", "direction_inverted", "quarantine",
  url="https://www.altum.lv/wp-content/uploads/2026/07/MVU-Cenradis_2026_07-2.pdf",
  quote="Aizdevumi lauksaimnieku, zvejas un akvakultūras nozares komersantiem — fiksētā daļa no 3,32%",
  trans="Loans to businesses in the farming, fishing and aquaculture sectors — fixed component from 3.32%",
  says="an inversion. This programme's own price list sets a dedicated interest "
       "rate for farming, fishing and aquaculture businesses, under the "
       "agriculture and fisheries GBERs. The website footnote the requirement "
       "was read from -- 'lauksaimniecības vai zivsaimniecības nozarēm "
       "pieejamas citas atbalsta programmas' -- is a SIGNPOST that other "
       "programmes exist too, not an exclusion from this one.")

d("enterprise_ireland_rd", "scheme_text_1", "subject_disagreement", "quarantine",
  url="https://www.enterprise-ireland.com/documents/tor-research-and-development150925-pdf-en-115620.pdf",
  quote="Companies must operate in the Manufacturing or internationally traded services areas of business ... developing new products, processes or services, including digital products, processes or services, in any area, technology, industry or sector",
  trans="(English source)",
  says="'internationally traded services' is a policy category meaning services "
       "sold across borders, not a sector -- Enterprise Ireland runs a "
       "dedicated Digital Tech programme and its client mix spans ICT, "
       "engineering, medtech, food and energy. The project side of the same "
       "document is explicitly sector-agnostic: 'in any area, technology, "
       "industry or sector'. `in ['industrial_manufacturing','mobility_transport']` "
       "is a reading no sentence on that page supports, and the SAME quote is "
       "encoded a second time on this instrument as all eleven values, which "
       "is the encoder disagreeing with itself about one sentence.")

d("ademe_aid__structuration_de_filieres_de_valorisation_durabl_cfacf8",
  "scheme_text_2", "one_branch_of_a_disjunction", "quarantine",
  url="https://agirpourlatransition.ademe.fr/entreprises/aides-financieres/catalogue/aap/structuration-de-filieres-de-valorisation-durable",
  quote="Ayant une activité dans les secteurs de la transformation et de la commercialisation de produits agricoles.",
  trans="Having an activity in the sectors of processing and marketing of agricultural products.",
  says="the gate's OWN requirement text says it: 'Applicant may ALTERNATIVELY "
       "qualify if active in ...'. It is one bullet of a list of ways to be "
       "eligible, and `sector equals agrifood` makes it the only one. A branch "
       "of a disjunction encoded as a conjunctive filter cannot be right for "
       "any founder who qualifies through a different branch -- here, seven "
       "cleantech companies the register says did.")

# ── join, validate, emit ────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if any authored row no longer matches the snapshot")
    args = ap.parse_args()

    snap = json.loads(SNAPSHOT.read_text())
    by_id = {r["id"]: r for r in snap.get("records", [])}

    rows, stale = [], []
    for dec in DECISIONS:
        inst = by_id.get(dec["instrument"])
        if inst is None:
            stale.append(f"{dec['instrument']}: no such instrument in the snapshot")
            continue
        gate = next((g for g in (inst.get("gates") or []) if g["id"] == dec["gate"]), None)
        if gate is None:
            stale.append(f"{dec['instrument']} [{dec['gate']}]: no such gate")
            continue
        if not gate.get("valueSpec"):
            stale.append(f"{dec['instrument']} [{dec['gate']}]: already carries no comparator")
            continue
        rows.append({
            "instrument_id": dec["instrument"],
            "instrument_name": inst.get("name"),
            "gate_key": dec["gate"],
            "requirement": gate.get("requirement"),
            "quote": gate.get("quote"),
            "verification_level": gate.get("verificationLevel"),
            "gate_role": gate.get("gateRole"),
            "current_value_spec": gate.get("valueSpec"),
            "clause": dec["clause"],
            "clause_says": CLAUSES[dec["clause"]],
            "action": dec["action"],
            "proposed_value_spec": dec["spec"],
            "funder": dec["funder"],
        })

    if stale:
        print("STALE — the corpus has moved under these authored rows:")
        for s in stale:
            print(f"  {s}")
        if args.check:
            return 1
    if args.check and not stale:
        print(f"ok — all {len(rows)} authored corrections still match the snapshot")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True)
                             for r in rows) + "\n")
    by_action: dict[str, int] = {}
    by_clause: dict[str, int] = {}
    for r in rows:
        by_action[r["action"]] = by_action.get(r["action"], 0) + 1
        by_clause[r["clause"]] = by_clause.get(r["clause"], 0) + 1
    print(f"wrote {len(rows)} corrections -> {OUT.relative_to(ROOT)}")
    print("  by action: " + ", ".join(f"{k} {v}" for k, v in sorted(by_action.items())))
    print("  by clause: " + ", ".join(f"{k} {v}" for k, v in sorted(by_clause.items())))
    return 1 if stale else 0


if __name__ == "__main__":
    raise SystemExit(main())
