"""
Apply sector taxonomy and entity-type heuristics to companies.

Sector classification: deterministic rules over the priority order defined in
methodology.md. Each company gets exactly one of:
  life_sciences, defense, deeptech_hardware, cleantech, space, digital, other

Entity-type classification: conservative name-based heuristics for research
organisations; EIC Accelerator coordinators default to "startup" (programme is
SME-only). Everything else stays "unknown" pending future LLM enrichment.
"""

import sqlite3
import re
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter

# Innovation Fund sources are all cleantech by programme definition.
# Source of truth: CALL_TO_SOURCE in extract_innovation_fund.py.
from extract_innovation_fund import IF_SOURCE_SECTOR  # noqa: E402

# Chips JU / KDT JU sources are all deeptech_hardware (semiconductors).
# Source of truth: CALL_TO_SOURCE in extract_chips_ju.py.
from extract_chips_ju import CHIPS_JU_SOURCE_SECTOR  # noqa: E402

# EDF sources are all defense by programme definition.
# Source of truth: CALL_TO_SOURCE in extract_edf.py.
# Import is deferred below to avoid circular dependency before the file exists;
# replaced with a real import once extract_edf.py is created.
try:
    from extract_edf import EDF_SOURCE_SECTOR  # noqa: E402
except ImportError:
    EDF_SOURCE_SECTOR: dict[str, str] = {}

# EIT KIC sources — sector fallback per KIC programme.
# Source of truth: CALL_TO_SOURCE in extract_eit.py.
try:
    from extract_eit import EIT_KIC_SOURCE_SECTOR  # noqa: E402
except ImportError:
    EIT_KIC_SOURCE_SECTOR: dict[str, str] = {}

# Eurostars-3 — dead end (403 Forbidden + CORDIS 0 results); stub kept for future.
try:
    from extract_eurostars import EUROSTARS_SOURCE_SECTOR  # noqa: E402
except ImportError:
    EUROSTARS_SOURCE_SECTOR: dict[str, str] = {}

# Clean Hydrogen Partnership / IHI JU / EuroHPC JU — loaded Sprint 11 via CORDIS open data.
try:
    from extract_cordis import CHP_SOURCE_SECTOR, IHI_SOURCE_SECTOR, EUROHPC_SOURCE_SECTOR  # noqa: E402
except ImportError:
    CHP_SOURCE_SECTOR: dict[str, str] = {}
    IHI_SOURCE_SECTOR: dict[str, str] = {}
    EUROHPC_SOURCE_SECTOR: dict[str, str] = {}

# Horizon Europe Pillar II — Sprint 12 (CL1/CL3/CL4/CL5/CL6).
try:
    from extract_cordis_pillar_ii import (  # noqa: E402
        HORIZON_EU_CL1_SOURCE_SECTOR,
        HORIZON_EU_CL3_SOURCE_SECTOR,
        HORIZON_EU_CL4_SOURCE_SECTOR,
        HORIZON_EU_CL5_SOURCE_SECTOR,
        HORIZON_EU_CL6_SOURCE_SECTOR,
    )
except ImportError:
    HORIZON_EU_CL1_SOURCE_SECTOR: dict[str, str] = {}
    HORIZON_EU_CL3_SOURCE_SECTOR: dict[str, str] = {}
    HORIZON_EU_CL4_SOURCE_SECTOR: dict[str, str] = {}
    HORIZON_EU_CL5_SOURCE_SECTOR: dict[str, str] = {}
    HORIZON_EU_CL6_SOURCE_SECTOR: dict[str, str] = {}

# Sprint 13 Tier 1 NDBs.
try:
    from extract_invest_nl import INVEST_NL_SOURCE_SECTOR  # noqa: E402
    from extract_tesi import TESI_SOURCE_SECTOR  # noqa: E402
    from extract_almi_invest import ALMI_INVEST_SOURCE_SECTOR  # noqa: E402
    from extract_cdp_vc import CDP_VC_SOURCE_SECTOR  # noqa: E402
    from extract_sprind import SPRIND_SOURCE_SECTOR  # noqa: E402
    from extract_cdti import CDTI_SOURCE_SECTOR  # noqa: E402
    from extract_htgf import HTGF_SOURCE_SECTOR  # noqa: E402
    from extract_coparion import COPARION_SOURCE_SECTOR  # noqa: E402
    from extract_bpifrance import BPIFRANCE_SOURCE_SECTOR  # noqa: E402
    from extract_enterprise_ireland import EI_SOURCE_SECTOR  # noqa: E402
    from extract_fr_innov_grants import FR_INNOV_SOURCE_SECTOR  # noqa: E402
    from extract_innovationsfonden import INNOFOND_SOURCE_SECTOR  # noqa: E402
    from extract_eifo import EIFO_SOURCE_SECTOR  # noqa: E402
    from extract_ademe import ADEME_SOURCE_SECTOR  # noqa: E402
    from extract_sudop import SUDOP_SOURCE_SECTOR  # noqa: E402
    from extract_innovate_uk import IUK_SOURCE_SECTOR  # noqa: E402
    from extract_cordis_pillar_ii import JU_BATCH_SOURCE_SECTOR  # noqa: E402
    from extract_eic_fund import EIC_FUND_SOURCE_SECTOR  # noqa: E402
except ImportError:
    INVEST_NL_SOURCE_SECTOR: dict[str, str] = {}
    TESI_SOURCE_SECTOR: dict[str, str] = {}
    ALMI_INVEST_SOURCE_SECTOR: dict[str, str] = {}
    CDP_VC_SOURCE_SECTOR: dict[str, str] = {}
    SPRIND_SOURCE_SECTOR: dict[str, str] = {}
    CDTI_SOURCE_SECTOR: dict[str, str] = {}
    HTGF_SOURCE_SECTOR: dict[str, str] = {}
    COPARION_SOURCE_SECTOR: dict[str, str] = {}
    BPIFRANCE_SOURCE_SECTOR: dict[str, str] = {}
    EI_SOURCE_SECTOR: dict[str, str] = {}
    FR_INNOV_SOURCE_SECTOR: dict[str, str] = {}
    INNOFOND_SOURCE_SECTOR: dict[str, str] = {}
    EIFO_SOURCE_SECTOR: dict[str, str] = {}
    ADEME_SOURCE_SECTOR: dict[str, str] = {}
    SUDOP_SOURCE_SECTOR: dict[str, str] = {}
    IUK_SOURCE_SECTOR: dict[str, str] = {}
    JU_BATCH_SOURCE_SECTOR: dict[str, str] = {}
    EIC_FUND_SOURCE_SECTOR: dict[str, str] = {}

DB_PATH = Path(__file__).parent.parent / "db.sqlite"

# IPCEI sources don't tag rows like EIC does. Each IPCEI is a known sector;
# map the source directly. Kept in sync with PROGRAM_META in extract_ipcei.py
# and the IPCEI scope table in methodology.md.
IPCEI_SOURCE_SECTOR = {
    "ipcei_micro": "deeptech_hardware",
    "ipcei_mect": "deeptech_hardware",
    "ipcei_batteries": "cleantech",
    "ipcei_eubatin": "cleantech",
    "ipcei_hy2tech": "cleantech",
    "ipcei_hy2use": "cleantech",
    "ipcei_hy2infra": "cleantech",
    "ipcei_hy2move": "cleantech",
    "ipcei_cloud": "digital",
    "ipcei_med4cure": "life_sciences",
    "ipcei_tech4cure": "life_sciences",
}

# ---------------------------------------------------------------------------
# Sector taxonomy
# ---------------------------------------------------------------------------

SPACE_TAGS = {
    "Space",
    "Launch Vehicles & Spacecrafts",
    "Space Situational Awareness & Debris Tracking and Management",
    "In-Space Servicing",
    "Earth Observation & Global Satellite Navigation System (GNSS)",
    "Satellite Communications & Space-based Connectivity",
}

LIFE_SCIENCES_TAGS = {
    "Medical Technologies",
    "Health Biotechnology",
    "Therapeutic Drugs & Biologics",
    "Invasive Medical Devices",
    "Non-invasive Medical Devices",
    "Medical Imaging",
    "In Vitro and Molecular  Diagnostics",
    "Digital Health",
    "Regenerative Medicine",
    "Nutrition and Disease Prevention",
}

CLEANTECH_TAGS = {
    "Energy",
    "Energy Generation & Conversion",
    "Energy Storage",
    "Energy Efficiency",
    "Energy Transmission",
    "Distribution & Grids",
    "Climate & Environmental Tech",
    "Carbon & Greenhouse Gas",
    "Circular Economy & Recycling",
    "Waste",
    "Pollutants & Contaminants",
    "Water Management & Resilience",
    "Natural Resources & Biodiversity",
}

DEEPTECH_TAGS = {
    "Quantum",
    "Quantum Technologies",
    "Advanced Computing & Semiconductors",
    "Semiconductors & Integrated Circuits",
    "Semiconductors",  # Chips JU / KDT JU rows tag projects as "Semiconductors"
    "Photonics & Optoelectronics",
    "High Performance & Hybrid Computing",
    "Nanofabrication",
    "Microfabrication & Foundries",
    "Communication Hardware & Other Specialized Electronics",
    "Measurements & Metrology",
    "Advanced Materials",
    "Advanced Manufacturing & Advanced Materials",
    "Continuous & Discrete Manufacturing",
    "Digital Fabrication & Prototyping",
    "Industrial Automation",
    "Industrial Biotech & Biomanufacturing",
}

DIGITAL_TAGS = {
    "Artificial Intelligence",
    "AI",
    "Data & ICT",
    "Data & Advanced Analytics",
    "Software & Services",
    "Robotics",
    "Cybersecurity & Privacy",
}

DEFENSE_TAGS = {
    "Defense",   # leading tag emitted by extract_edf.py for all EDF rows
    "Defence",   # British spelling variant
    # EDF capability-area vocabulary (from factsheet call-title/topic fields)
    "Air Combat",
    "Air and Missile Defence",
    "Air and Missile Defense",
    "Airborne electronic warfare",
    "C4ISR",
    "CBRN",
    "Cyber Defence",
    "Cyber Defense",
    "Cyber",
    "Defence Space",
    "Defense Space",
    "Digital Transformation",   # EDF-specific (military digital transformation)
    "Disruptive Technologies",  # EDF capability area
    "Energy and Environment",   # EDF military energy resilience
    "Force Protection",
    "Ground Combat",
    "Information Superiority",
    "Materials and Components",
    "Medical Response and CBRN",
    "Naval Combat",
    "Naval",
    "Sensors",
    "Simulation and Training",
    "Underwater Warfare",
    "Space",                    # EDF space-based defence — note: `space` sector wins per priority order
}

# Keyword fallback for events with empty sector_tags_raw.
# Applied to project_title+summary (lowercased). Same priority order as tag rules.
SPACE_KEYWORDS = [
    "satellite", "spacecraft", "orbital", "space mission", "low earth orbit",
]
LIFE_SCIENCES_KEYWORDS = [
    "medic", "biomed", "biotech", "surgical", "surgery", "drug ", "drugs",
    "therapeut", "therapy", "cancer", "oncolog", "tumor", "tumour",
    "sepsis", "neural", "neuro", "seizure", "epileps", "fertility", "neonatal",
    "preimplantation", "transcriptomic", "bioprint", "cryo-em", "diagnostic",
    "vaccine", "gene therap", "protein", "cell therap", "tissue", "mechanobiolog",
    "mechanomedic", "minimally-invasive", "biolog",
    # EIB-sourced additions
    "catheter",          # catheter-based medical devices
    "cardiovascular",    # cardiovascular interventions
    "clinical trial",    # clinical-stage therapeutics
    "mental health",     # digital mental healthcare
    "health param",      # wearable health-parameter monitoring
    "antibod",           # polyclonal / monoclonal antibodies
    "rnai",              # RNA interference biocontrol / therapeutics
    "nutraceutical",     # functional food ingredients (food-biotech crossover)
    "drought resist",    # plant-biotech seed improvements
    "poultry",           # poultry health / incubation technology
    "long covid",        # post-acute sequelae therapeutics
    # SATR NACE additions (Sprint 15)
    "pharmaceutical",        # NACE C21 manufacturing of pharmaceuticals
    "pharma ",               # short form
    "in vitro diagnost",     # NACE C26.6 / 32.5 IVD
    "medical instrument",    # NACE C26.6 / 32.5
    "medical device",
    "veterinary",            # veterinary medicines
    "experimental development on biotech",  # NACE M72.11
    "human health",          # NACE Q86
]
CLEANTECH_KEYWORDS = [
    "depollut", "remediat", "solar", "photovoltaic", "wind energy", "wind turbine",
    "battery storage", "energy storage", "carbon captur", "greenhouse gas",
    "circular econom", "recycl", "climate", "weather forecast",
    "green hydrog", "renewable", "ammonia synth", "electrocatalyt",
    "biorefiner", "bioremediation",
    # EIB-sourced additions
    "fuel cell",           # HT-PEM / hydrogen fuel cells
    "electric vehicle",    # EV charging networks; also covers "electric vehicles"
    "electric trailer",    # electric trailer technology
    "ev charg",            # EV charging (abbreviation form)
    "charging station",    # EV / H2 charging infrastructure
    "e-fuel",              # carbon-neutral electrofuel
    "power-to-x",          # Power-to-X synthesis
    "hydrogen refuel",     # hydrogen refuelling stations
    "plant-based",         # plant-based / alternative protein food
    "precision ferment",   # precision fermentation for dairy / protein
    "aquaculture",         # sustainable aquaculture
    "moulded fibre",       # dry-moulded fibre sustainable packaging
    "insulation material", # building insulation / energy efficiency
    "mycelium",            # mycelium biobased materials
    "biobased material",   # bio-based materials (circular economy)
    "silicon anode",       # silicon-anode battery materials
    "lithium-ion",         # lithium-ion battery technology
    "battery pack",        # battery pack assembly / production
    "zero-emission",       # zero-emission vehicles / services
    "wooden module",       # prefabricated wooden modular construction
]
DEEPTECH_KEYWORDS = [
    "photonic", "quantum", "semiconductor", "asic", "integrated circuit",
    "mems", "spectromet", "spectroscop", "laser", "infrared", "x-ray",
    "nanofab", "microfab", "metrolog", "advanced material",
    "objective lens", "optical", "electron microscop",
    # SATR NACE additions (Sprint 15)
    "electronic component",   # NACE C26.1
    "electronic board",
    "navigation, measur",     # NACE C26.5 measuring instruments
    "industrial process control",
    "machine tool",           # NACE C28.4
    "special-purpose machinery",  # NACE C28.9
    # EIB-sourced additions
    "risc-v",              # RISC-V processor / EDA software
    "design automation",   # electronic design automation
    "3d print",            # 3D printing / additive manufacturing
    "additive manufactur", # additive manufacturing
    "3d scan",             # 3D scanning hardware
    "optics",              # optics industry / nano optics (covers "optics" not just "optical")
    "fibre optic",         # fibre optic sensing
    "power electronics",   # power conversion / power electronics hardware
    "exoskeleton",         # robotic exoskeletons
    "drone",               # cargo drones / UAV hardware
    "structural electronic", # injection-moulded structural electronics
    "nanotube",            # carbon nanotube advanced materials
    "autonomous vehicle",  # autonomous vehicle / shuttle technology
    "braking system",      # ABS / anti-lock braking systems
    "motorbik",            # electric motorbike development
]
DIGITAL_KEYWORDS = [
    "artificial intelligence", "machine learn", "deep learn", "foundation model",
    "software platform", "data analytics", "cybersecurity", "robotic", "robot",
    # EIB-sourced additions
    "cyber security",      # cyber security (space-separated variant)
    "fintech",             # fintech payments / CRM platforms
    "freight forwarder",   # digital freight forwarding
    "digital freight",     # digital freight platforms
    "ai-driven",           # AI-driven platforms
    "simulation platform", # engineering simulation SaaS
    "digital marketplace", # digital marketplace for direct-to-consumer
    "digital platform",    # general digital platform businesses
    # SATR NACE additions (Sprint 15)
    "computer programming",   # NACE J62.01 software development
    "software publish",       # NACE J58.2 software publishing
    "data processing",        # NACE J63.11 data hosting / cloud
    "web portal",             # NACE J63.12
    "computer consultancy",   # NACE J62.02
    "telecommunication",      # NACE J61
    "information service",    # NACE J63
    "digital technolog",   # advanced digital technologies (matches plural too)
    "software-enabl",      # software-enabled product platforms
    "cloud kitchen",       # virtual / cloud kitchen platforms
    "big data",            # big data / behavioural analytics
    "brand protect",       # brand protection / IP enforcement software
]

# Defense keyword fallback — fires ONLY for events with empty sector_tags_raw.
# Primary job: retroactive scan over EIC/IPCEI/EIB/IF/Chips JU rows that have
# no tags but whose project text reveals a defense use-domain.
# NOT the primary EDF classification path — EDF rows always have sector_tags_raw
# populated with "Defense, {capability_area}" so they hit DEFENSE_TAGS first.
# Tuned to avoid false positives: "defensive" omitted (immune defense →
# life_sciences), "cyber security" alone omitted (→ digital), "tank " trailing
# space avoids "tanker"/"tankless", "defence" requires domain context prefix.
DEFENSE_KEYWORDS = [
    "military application",   # explicit military use-domain
    "national defence",       # national defence programmes
    "national defense",
    "defence procurement",    # procurement-context defence
    "defense procurement",
    "weapons system",         # weapons system development
    "weapon system",
    "munition", "ammunition",
    "armoured vehicle", "armored vehicle",
    "tank ",                  # trailing space avoids "tanker", "tankless"
    "fighter aircraft", "combat aircraft", "fighter jet",
    "missile defence", "missile defense", "anti-missile",
    "warship", "naval combat", "submarine warfare",
    "battlefield ", "tactical communication",
    "european defence fund",  # retroactive hit if summary mentions EDF
    "cyber defence",          # domain-qualified cyber = defense (not plain cybersecurity)
]

# Manual sector overrides for known classification edge cases.
# Applied AFTER classify_sector (not as a fallback), so it can also correct
# cases where the keyword-fallback first-match-wins rule violates the
# methodology's "use-domain-over-technology" priority.
# Keep this list short — each entry is a documented exception, not a pattern
# to scale. If this grows past ~10 entries, refactor the classifier instead.
MANUAL_SECTOR_OVERRIDES = {
    "NOMAGIC INC": "digital",        # generic "RDI activities" description; sister entity NOMAGIC SP ZOO is also digital (warehouse robotics)
    "STARK FUTURE SL": "cleantech",  # electric off-road motorbikes; description omits "electric" so keyword caught only "motorbike" → deeptech
    "IN OVO HOLDING BV": "other",    # poultry incubation tech; agribusiness use-domain, not life_sciences
    "CROWDFARMING SL": "other",      # agrifood direct-to-consumer marketplace; agrifood use-domain, not pure digital
    # Multi-domain research orgs whose primary discipline IS the technology
    # enabler — first-EIC-tag-wins lands on a downstream use-domain (life_sciences
    # via bio-electronics, space via satellite-payload work) but the institution's
    # primary discipline is semiconductors. See methodology note on multi-domain
    # research-org classification.
    "INTERUNIVERSITAIR MICRO-ELECTRONICA CENTRUM": "deeptech_hardware",  # IMEC Belgium — flagship EU semiconductor R&D centre
    "STICHTING IMEC NEDERLAND": "deeptech_hardware",                     # IMEC Netherlands subsidiary
}


# ----------------------------------------------------------------------------
# NACE-code classifier (Sprint 15: SATR rows ship sector_tags_raw as NACE strings)
# ----------------------------------------------------------------------------
# SATR records use NACE Rev. 2 descriptions like "Computer programming activities"
# in the Sector (NACE) column, which we store in public_funding_events.sector_tags_raw.
# These don't match our CORDIS-style sector_tags_raw keywords ("AI", "DIGITAL", etc.),
# so SATR companies tend to fall to the keyword-fallback layer where most NACE
# strings don't match either. This NACE classifier runs BEFORE keyword classify
# and maps NACE descriptions directly to our 7-bucket taxonomy.
#
# Each entry is (substring_match, sector). Substring match is case-insensitive.
# Order matters: most specific first (e.g. "Manufacture of pharmaceutical" before
# "Manufacture of"). Strings should be unique within a NACE descriptor enough to
# avoid wrong sector assignment; broader descriptors fall through to keyword
# classify or end up "other".
NACE_TO_SECTOR: list[tuple[str, str]] = [
    # --- LIFE_SCIENCES ---
    ("Manufacture of pharmaceutical", "life_sciences"),
    ("Manufacture of basic pharmaceutical", "life_sciences"),
    ("Manufacture of medical and dental instruments", "life_sciences"),
    ("Manufacture of irradiation, electromedical", "life_sciences"),
    ("Research and experimental development on biotechnology", "life_sciences"),
    ("Human health activities", "life_sciences"),
    ("Hospital activities", "life_sciences"),
    ("General medical practice", "life_sciences"),
    ("Medical and dental practice", "life_sciences"),
    ("Veterinary activities", "life_sciences"),
    # --- DIGITAL ---
    ("Computer programming activities", "digital"),
    ("Computer programming, consultancy", "digital"),
    ("Computer consultancy", "digital"),
    ("Computer facilities management", "digital"),
    ("Other software publishing", "digital"),
    ("Software publishing", "digital"),
    ("Other information technology", "digital"),
    ("Data processing, hosting", "digital"),
    ("Web portals", "digital"),
    ("Information service activities", "digital"),
    ("Computing infrastructure, data processing, hosting", "digital"),
    ("Computer programming, consulting", "digital"),  # newer NACE wording (vs "consultancy")
    ("Rental and leasing of office machinery, equipment and computers", "digital"),
    ("Telecommunications", "digital"),
    ("Wireless telecommunications", "digital"),
    ("Wired telecommunications", "digital"),
    ("Satellite telecommunications", "digital"),   # could also be space; deferred to space rule below for primary match
    # --- SPACE ---
    ("Manufacture of air and spacecraft", "space"),
    ("Repair and maintenance of aircraft and spacecraft", "space"),
    # --- DEEPTECH_HARDWARE ---
    ("Manufacture of electronic components", "deeptech_hardware"),
    ("Manufacture of loaded electronic boards", "deeptech_hardware"),
    ("Manufacture of computers and peripheral", "deeptech_hardware"),
    ("Manufacture of communication equipment", "deeptech_hardware"),
    ("Manufacture of computer, electronic", "deeptech_hardware"),
    ("Manufacture of optical instruments", "deeptech_hardware"),
    ("Manufacture of instruments and appliances for measuring, testing and navigation", "deeptech_hardware"),
    ("Manufacture of magnetic and optical media", "deeptech_hardware"),
    ("Manufacture of consumer electronics", "deeptech_hardware"),
    ("Manufacture of electric motors, generators and transformers", "deeptech_hardware"),
    ("Manufacture of electrical equipment", "deeptech_hardware"),
    ("Manufacture of other electrical equipment", "deeptech_hardware"),
    ("Manufacture of batteries and accumulators", "cleantech"),  # batteries — cleantech via EV / energy storage angle
    ("Manufacture of other special-purpose machinery", "deeptech_hardware"),
    ("Manufacture of other general-purpose machinery", "deeptech_hardware"),
    ("Manufacture of machinery and equipment", "deeptech_hardware"),
    ("Manufacture of machine tools", "deeptech_hardware"),
    ("Manufacture of bearings, gears, gearing", "deeptech_hardware"),
    # --- CLEANTECH ---
    ("Steam and air conditioning supply", "cleantech"),
    ("Production of electricity", "cleantech"),
    ("Electric power generation, transmission and distribution", "cleantech"),
    ("Electricity, gas, steam and air conditioning supply", "cleantech"),
    ("Production of electricity from non-renewable", "cleantech"),
    ("Production of electricity from renewable", "cleantech"),
    ("Transmission of electricity", "cleantech"),
    ("Distribution of electricity", "cleantech"),
    ("Manufacture of gas", "cleantech"),
    ("Distribution of gaseous fuels through mains", "cleantech"),
    ("Trade of electricity", "cleantech"),
    ("Water collection, treatment and supply", "cleantech"),
    ("Sewerage", "cleantech"),
    ("Waste collection", "cleantech"),
    ("Waste treatment and disposal", "cleantech"),
    ("Materials recovery", "cleantech"),
    ("Remediation activities", "cleantech"),
    # --- SCIENTIFIC R&D (generic) — default to deeptech_hardware ---
    # Generic "Scientific R&D" without further qualification is most often
    # industrial / engineering R&D; biotech R&D has its own entry above.
    ("Research and experimental development on natural sciences and engineering", "deeptech_hardware"),
    ("Other research and experimental development on natural sciences and engineering", "deeptech_hardware"),
    ("Scientific research and development", "deeptech_hardware"),
    # --- OTHER (explicit — don't try to classify) ---
    # These NACE entries appear frequently and should NOT be guessed at.
    ("Hotels and similar accommodation", "other"),
    ("Accommodation", "other"),
    ("Restaurants", "other"),
    ("Mobile food service", "other"),
    ("Construction of residential", "other"),
    ("Construction of buildings", "other"),
    ("Civil engineering", "other"),
    ("Freight transport by road", "other"),
    ("Sea and coastal transport", "other"),
    ("Inland passenger water transport", "other"),
    ("Wholesale of", "other"),
    ("Retail sale of", "other"),
    ("Manufacture of furniture", "other"),
    ("Sawmilling", "other"),
    ("Motion picture, video and television programme production", "other"),
    ("Sound recording and music publishing", "other"),
    ("Manufacture of food products", "other"),
    ("Manufacture of beverages", "other"),
    ("Manufacture of bread", "other"),
    ("Manufacture of dairy products", "other"),
    ("Growing of cereals", "other"),
    ("Growing of vegetables", "other"),
    ("Mixed farming", "other"),
    ("AGRICULTURE, FORESTRY AND FISHING", "other"),
    ("Activities of head offices", "other"),
    ("Activities of holding companies", "other"),
    ("Rental and operating of own or leased real estate", "other"),
    ("Real estate activities", "other"),
    ("Business and other management consultancy", "other"),
    ("Management consultancy", "other"),
    ("Other specialised wholesale", "other"),
    ("Specialised wholesale", "other"),
    ("Buying and selling of own real estate", "other"),
    ("Tertiary education", "other"),
    ("Research and experimental development on social sciences and humanities", "other"),
    ("Electrical, plumbing and other construction installation", "other"),
    ("Support activities for transportation", "other"),
    ("Animal production", "other"),
    ("Crop and animal production", "other"),
    ("Public administration", "other"),
    ("Other monetary intermediation", "other"),
    ("Banking", "other"),
    ("Activities of insurance", "other"),
    ("Sale of motor vehicles", "other"),
    ("Sale, maintenance and repair of motor", "other"),
    # Civil engineering / general engineering consultancy — too broad to be
    # confidently "deeptech"; usually buildings / infrastructure.
    ("Engineering activities and related technical consultancy", "other"),
    ("Architectural and engineering activities", "other"),
    # --- Phase 1b (2026-06-15): close the unclassified gap with unambiguous codes ---
    # EIT/programme domain labels (numeric-prefixed taxonomy seen in register feeds).
    ("50 ICT", "digital"),
    ("60 Life Sciences", "life_sciences"),
    ("70 Engineering", "deeptech_hardware"),
    ("90 Social Sciences & Business Management", "other"),
    # Lower-tech industrial manufacturing: real, but not one of the tech buckets.
    # Honest "other" beats a guessed deeptech/cleantech label.
    ("Manufacture of plastic products", "other"),
    ("Manufacture of other plastic products", "other"),
    ("Manufacture of rubber and plastic products", "other"),
    ("Manufacture of fabricated metal products", "other"),
    ("Manufacture of other fabricated metal products", "other"),
    ("Manufacture of metal structures", "other"),
    ("Manufacture of structural metal products", "other"),
    ("Treatment and coating of metals", "other"),
    ("Machining", "other"),
    ("Other manufacturing", "other"),
    # Clearly non-tech services / primary sector.
    ("Other professional, scientific and technical activities", "other"),
    ("Raising of dairy cattle", "other"),
    ("Land transport and transport via pipelines", "other"),
    ("Publishing, broadcasting, and content production", "other"),
    # ── Comprehensive NACE-division coverage (2026-06-15) ───────────────────
    # Goal: classify register companies by their actual economic activity (NACE)
    # rather than the funding programme's theme, and close the unclassified gap.
    # Resolution within one string is first-match, so tech sectors are listed
    # before the broad "other" block; across a company's several events the sector
    # priority (cleantech > deeptech > digital > other) applies, and "other" is
    # lowest, so these can never override a genuine tech signal.
    #
    # CLEANTECH — energy, water, waste, environment (NACE D, E + green articles).
    ("80 Energy & Environment", "cleantech"),            # EIT/programme domain code
    ("Recovery of sorted materials", "cleantech"),
    ("Recovery and recycling", "cleantech"),
    ("Renewable", "cleantech"),
    # Spanish GBER environmental aid articles (BDNS) — the company's investment is
    # the activity (renewable energy, energy efficiency, decarbonisation). Generic
    # R&D / SME / innovation articles (ART. 22/25/28/29) are NOT mapped: no
    # business signal, they stay unclassified.
    ("energía procedente de fuentes renova", "cleantech"),
    ("hidrógeno renovable", "cleantech"),
    ("cogeneración de alta eficiencia", "cleantech"),
    ("protección del medio ambiente", "cleantech"),
    ("eficiencia energética", "cleantech"),
    ("eficiencia en el uso de los recursos", "cleantech"),
    ("descarboniz", "cleantech"),
    # DIGITAL — NACE section J.
    ("INFORMATION AND COMMUNICATION", "digital"),
    # DEEPTECH_HARDWARE — machinery and equipment (NACE C28 etc.).
    ("Manufacture of general-purpose machinery", "deeptech_hardware"),
    ("Manufacture of special-purpose machinery", "deeptech_hardware"),
    ("Manufacture of agricultural and forestry machinery", "deeptech_hardware"),
    ("Manufacture of metal forming machinery and machine tools", "deeptech_hardware"),
    # OTHER — primary sector, lower-tech manufacturing, trade, construction,
    # transport and business services. Real activities, just not a tech bucket.
    ("Raising of", "other"),                             # livestock (swine, poultry, cattle)
    ("Growing of", "other"),                             # crops
    ("Support activities for crop production", "other"),
    ("Support activities to agriculture", "other"),
    ("Crop and animal production", "other"),
    ("Processing and preserving of meat", "other"),
    ("Manufacture of other food products", "other"),
    ("Manufacture of bakery", "other"),
    ("Manufacture of beverages", "other"),
    ("Manufacture of products of wood", "other"),
    ("Manufacture of articles of paper", "other"),
    ("Manufacture of wearing apparel", "other"),
    ("Manufacture of plastic packing goods", "other"),
    ("Manufacture of plastic plates", "other"),
    ("Manufacture of basic metals", "other"),
    ("Manufacture of other non-metallic mineral products", "other"),
    ("Forging, pressing, stamping", "other"),
    ("Manufacture of cutlery, tools and general hardware", "other"),
    ("Manufacture of tools", "other"),
    ("Manufacture of locks and hinges", "other"),
    ("Manufacture of motor vehicles", "other"),
    ("parts and accessories for motor vehicles", "other"),
    ("Maintenance and repair of motor vehicles", "other"),
    ("Printing", "other"),
    ("Wholesale trade", "other"),
    ("Retail trade", "other"),
    ("Retail sale", "other"),
    ("Electrical installation", "other"),
    ("Specialised construction activities", "other"),
    ("Installation of industrial machinery and equipment", "other"),
    ("Technical testing and analysis", "other"),
    ("Manufacture of chemicals and chemical products", "other"),
    ("Other passenger land transport", "other"),
    ("Office administrative", "other"),
    ("Business support service activities", "other"),
    ("Other business support service activities", "other"),
    ("Other personal service activities", "other"),
    ("Activities of other membership organisations", "other"),
    ("PROFESSIONAL, SCIENTIFIC AND TECHNICAL ACTIVITIES", "other"),
    # ── NACE tail (2026-06-15, phase 3b): broad division families ───────────
    # cleantech — waste/recycling
    ("Collection of non-hazardous waste", "cleantech"),
    ("Collection of hazardous waste", "cleantech"),
    # deeptech — electrical machines (wording variant with "electricity distribution")
    ("Manufacture of electric motors, generators", "deeptech_hardware"),
    # other — construction, materials, consumer mfg, logistics, services. Broad
    # family patterns so future register rows in these divisions resolve too.
    # ("other" is lowest priority in multi-event resolution, so these never
    # override a tech signal a company also carries.)
    ("Construction of", "other"),
    ("Development of building projects", "other"),
    ("carpentry and joinery", "other"),
    ("Building completion and finishing", "other"),
    ("Plumbing, heat and air-conditioning installation", "other"),
    ("Warehousing and storage", "other"),
    ("Processing and preserving of", "other"),
    ("Manufacture of textiles", "other"),
    ("Manufacture of other textiles", "other"),
    ("Tanning and dressing of leather", "other"),
    ("Manufacture of articles of concrete", "other"),
    ("Manufacture of concrete", "other"),
    ("Cutting, shaping and finishing of stone", "other"),
    ("Manufacture of other transport equipment", "other"),
    ("Repair of fabricated metal", "other"),
    ("Food and beverage service", "other"),
    ("Rental and leasing of", "other"),
    ("Manufacture of beer", "other"),
    ("Manufacture of paper", "other"),
    ("Motion picture", "other"),
    ("passenger transport", "other"),
    ("Wholesale on a fee", "other"),
    ("Manufacture of basic chemicals", "other"),
    ("Manufacture of other chemical products", "other"),
    ("Manufacture of chemicals", "other"),
]


def _classify_by_nace(text):
    """If text contains a known NACE descriptor, return its mapped sector. Else None."""
    if not text:
        return None
    t = text.lower()
    for pattern, sector in NACE_TO_SECTOR:
        if pattern.lower() in t:
            return sector
    return None


def _keyword_classify(text):
    if not text:
        return None
    t = text.lower()
    if any(k in t for k in SPACE_KEYWORDS):
        return "space"
    if any(k in t for k in LIFE_SCIENCES_KEYWORDS):
        return "life_sciences"
    if any(k in t for k in DEFENSE_KEYWORDS):
        return "defense"
    if any(k in t for k in CLEANTECH_KEYWORDS):
        return "cleantech"
    if any(k in t for k in DEEPTECH_KEYWORDS):
        return "deeptech_hardware"
    if any(k in t for k in DIGITAL_KEYWORDS):
        return "digital"
    return None


def classify_sector(raw_tag_strings, fallback_text="", sources=()):
    """Apply priority rules to a list of raw sector_tags_raw strings.

    Resolution order: EIC tags → keyword fallback on title/summary →
    IPCEI source mapping (for IPCEI-only companies, which have no tags).
    """
    tags = set()
    for s in raw_tag_strings:
        if not s:
            continue
        for t in s.split(","):
            t = t.strip()
            if t:
                tags.add(t)

    if tags:
        if tags & SPACE_TAGS:
            return "space"
        if tags & LIFE_SCIENCES_TAGS:
            return "life_sciences"
        if tags & DEFENSE_TAGS:
            return "defense"
        if tags & CLEANTECH_TAGS:
            return "cleantech"
        if tags & DEEPTECH_TAGS:
            return "deeptech_hardware"
        if tags & DIGITAL_TAGS:
            return "digital"
        # Tags present but none recognised (e.g. CORDIS topic codes) — fall through
        # to keyword + source fallback rather than locking the company into "other".

    # Sprint 15: NACE-string classification for SATR rows (run before generic
    # keyword fallback because NACE is a stronger signal than aid-title text).
    # Collect ALL NACE hits across linked events, then apply the same priority
    # order as the tag classifier above (space > life_sciences > defense >
    # cleantech > deeptech > digital > other). This avoids order-dependency
    # on GROUP_CONCAT result order when a company has multiple events.
    nace_hits = set()
    for s in raw_tag_strings:
        h = _classify_by_nace(s)
        if h:
            nace_hits.add(h)
    if nace_hits:
        for priority in ("space", "life_sciences", "defense", "cleantech",
                         "deeptech_hardware", "digital", "other"):
            if priority in nace_hits:
                return priority

    fallback = _keyword_classify(fallback_text)
    if fallback:
        return fallback

    for src in sources:
        if src in IPCEI_SOURCE_SECTOR:
            return IPCEI_SOURCE_SECTOR[src]
        if src in IF_SOURCE_SECTOR:
            return IF_SOURCE_SECTOR[src]
        if src in CHIPS_JU_SOURCE_SECTOR:
            return CHIPS_JU_SOURCE_SECTOR[src]
        if src in EDF_SOURCE_SECTOR:
            return EDF_SOURCE_SECTOR[src]
        if src in EIT_KIC_SOURCE_SECTOR:
            return EIT_KIC_SOURCE_SECTOR[src]
        if src in CHP_SOURCE_SECTOR:
            return CHP_SOURCE_SECTOR[src]
        if src in IHI_SOURCE_SECTOR:
            return IHI_SOURCE_SECTOR[src]
        if src in EUROHPC_SOURCE_SECTOR:
            return EUROHPC_SOURCE_SECTOR[src]
        if src in HORIZON_EU_CL1_SOURCE_SECTOR:
            return HORIZON_EU_CL1_SOURCE_SECTOR[src]
        if src in HORIZON_EU_CL3_SOURCE_SECTOR:
            return HORIZON_EU_CL3_SOURCE_SECTOR[src]
        if src in HORIZON_EU_CL4_SOURCE_SECTOR:
            return HORIZON_EU_CL4_SOURCE_SECTOR[src]
        if src in HORIZON_EU_CL5_SOURCE_SECTOR:
            return HORIZON_EU_CL5_SOURCE_SECTOR[src]
        if src in HORIZON_EU_CL6_SOURCE_SECTOR:
            return HORIZON_EU_CL6_SOURCE_SECTOR[src]
        if src in INVEST_NL_SOURCE_SECTOR:
            return INVEST_NL_SOURCE_SECTOR[src]
        if src in TESI_SOURCE_SECTOR:
            return TESI_SOURCE_SECTOR[src]
        if src in ALMI_INVEST_SOURCE_SECTOR:
            return ALMI_INVEST_SOURCE_SECTOR[src]
        if src in CDP_VC_SOURCE_SECTOR:
            return CDP_VC_SOURCE_SECTOR[src]
        if src in SPRIND_SOURCE_SECTOR:
            return SPRIND_SOURCE_SECTOR[src]
        if src in CDTI_SOURCE_SECTOR:
            return CDTI_SOURCE_SECTOR[src]
        # CDTI sources use a year-suffix template — also try the bare prefix
        if src.startswith("cdti_"):
            stem = "_".join(src.split("_")[:-1])
            if stem in CDTI_SOURCE_SECTOR:
                return CDTI_SOURCE_SECTOR[stem]
        if src in HTGF_SOURCE_SECTOR:
            return HTGF_SOURCE_SECTOR[src]
        if src in COPARION_SOURCE_SECTOR:
            return COPARION_SOURCE_SECTOR[src]
        if src in BPIFRANCE_SOURCE_SECTOR:
            return BPIFRANCE_SOURCE_SECTOR[src]
        if src in EI_SOURCE_SECTOR:
            return EI_SOURCE_SECTOR[src]
        if src in FR_INNOV_SOURCE_SECTOR:
            return FR_INNOV_SOURCE_SECTOR[src]
        if src in INNOFOND_SOURCE_SECTOR:
            return INNOFOND_SOURCE_SECTOR[src]
        if src in IUK_SOURCE_SECTOR:
            return IUK_SOURCE_SECTOR[src]
        if src in JU_BATCH_SOURCE_SECTOR:
            return JU_BATCH_SOURCE_SECTOR[src]
        if src in EIC_FUND_SOURCE_SECTOR:
            return EIC_FUND_SOURCE_SECTOR[src]
        if src in EIFO_SOURCE_SECTOR:
            return EIFO_SOURCE_SECTOR[src]
        if src in ADEME_SOURCE_SECTOR:
            return ADEME_SOURCE_SECTOR[src]
        if src in SUDOP_SOURCE_SECTOR:
            return SUDOP_SOURCE_SECTOR[src]

    return "unclassified"


# ---------------------------------------------------------------------------
# Entity type heuristics — 3-bucket scheme: research_org / company / other
# (granular startup/sme/large_corp split deferred to future enrichment pass)
# ---------------------------------------------------------------------------

RESEARCH_PATTERNS = [
    # Universities — "universi" stem covers most language variants.
    # No leading word boundary, so Nordic compounds (Storbyuniversitetet) match.
    r"universi",
    r"\buniwers|\buniverz",                   # Polish (Uniwersytet), Slovak (Univerzita)
    r"\bpanepistimi",                         # Greek (Panepistimio)
    r"\bhögsk|\bhogsk|\bhøgsk|\bhoegsk",      # Swedish/Norwegian higher ed (covers -skola, -skole, -skulen; OE transliteration for CORDIS-style names)
    r"\bháskól|\bhaskol",                     # Icelandic
    r"\bkorkeakoulu|\btudományegyetem|\btudomanyegyetem|\begyetem\b",  # Finnish, Hungarian
    r"\bhochschule\b|\bhoch[- ]schule\b",     # German Hochschule
    r"\bvysoká škola\b|\bvysoka skola\b",     # Czech/Slovak "Vysoká škola" = university
    r"\bpolytechn|\bpolitechn|\bpolitecnico", # polytechnic / polytechnique / polytechnion / politechnika
    r"\bcollege\b",                           # King's College, etc.
    r"\bcatapult\b",                          # UK Catapult RTO network (Innovate UK core-delivery)
    r"\binteruniversita|\binteruniversite|\binteruniversitair",
    # Institutes — match anywhere (catches compound names like AgroBioInstitute)
    r"institut|istitut|\binstytut|\bústav\b|\bustav\b",
    r"\bforschung|\bstudiecentrum\b",         # German research / Belgian study centre
    r"\biaisbl\b|\baisbl\b|\bivzw\b|\bvzw\b",   # Belgian non-profit (Vereniging zonder Winstoogmerk)
    r"\beric\b",                              # European Research Infrastructure Consortium
    # Foundations
    r"\bfondation\b|\bfundac[ií]|\bfondazione\b|\bfundaca|\bstichting\b",
    r"\bstiftung\b|\bfoundation\b",
    # Research / academy patterns
    r"\bacademy\b|\bacademia\b|\bakadem",
    r"\bnational research\b",
    r"\bresearch (?:center|centre|council|institute|foundation)\b",
    r"\b(?:centre|center|centro) (?:de |para )?(?:recherch|investigac|ricerc)",
    r"\bkutató|\bkutato",                     # Hungarian research
    r"\bcerceta|\bcercetare",                 # Romanian research
    r"\bonderzoek\b|\bwetenschap",            # Dutch research/science
    r"\bsynchrotron\b|\bsincrotron|\bbiocentrum\b",   # sincrotron without end-boundary catches Italian "Sincrotrone"
    # Hospitals / clinical research
    r"\bhospital\b|\bhôpital\b|\bhopital\b|\bhopitaux\b|\bhospice",
    r"\bospedale\b|\bazienda ospedale|\bazienda socio-sanitar",
    r"\bkrankenhaus\b|\bklinik|\bclinique\b|\bclinical\b|\bcentre hospitalier",
    # Named major research bodies (acronyms / proper names)
    r"\bfraunhofer\b|\bmax[- ]planck\b|\bhelmholtz\b|\bleibniz\b",
    r"\bcnrs\b|\bcsic\b|\bcea\b|\btno\b|\bvito\b|\bciemat\b|\binserm\b",
    r"\bdkfz\b|\bmrc\b|\bbarcelona supercomputing\b|\bimec\b",
    # Sprint 8 audit additions — non-English research-org markers surfaced by B2
    r"\bziekenhuis\b",                                        # Dutch hospital
    r"\bnemocnice\b",                                         # Czech hospital
    r"\byliopisto\b",                                         # Finnish university (already partial via korkeakoulu)
    r"\bidryma\b|\bidrima\b|\bethniko\b|\bethnikon\b|\bkentro\b|\biatrobiologikon\b|\bepistimon\b|\bepistimi\b",
    r"\berevnas\b|\berevnon\b",                               # Greek "research"
    r"\bdeutsches (?:zentrum|herzzentrum|krebsforschungszentrum)\b",
    r"\bconsiglio nazionale delle ricerche\b|\bconsejo superior de investigaciones\b",
    r"\bconsorcio\b|\bconsorzio\b",                           # research consortia
    r"\bcentre (?:technique|technologique|national)\b|\bcentro (?:nacional|tecnologic|tecnologico|de ciencias|de salud)\b|\bcentre tecnologic\b|\bcentre tecnol[oò]gic\b",
    r"\bhellenic centre\b|\bhellenic foundation\b|\bhellenic university\b",
    r"\bcommissariat\b",                                      # CEA long form
    r"\beuropean molecular biology\b|\bhadassah\b",
    r"\bassociacao\b|\basociacion\b|\bassociation\b|\bassociazione\b|\bassociatie\b|\bvereniging\b|\basociacio\b|\bassociacio\b",
    r"\bfundacja\b|\bvyzkumn|\bceske vysoke\b",
    r"\bcolegio\b|\bécole\b|\becole\b|\bescola\b|\bscuola\b",
    r"\brecherches?\b",                                       # ONERA pattern
    r"\bresearch (?:and )?development (?:center|centre)\b",   # EDF TECES pattern
    r"\bnational center for scientific research\b|\bdemokritos\b",
    # Sprint 19 hygiene — RTOs surfaced by the investor-page champion lists
    r"\bsintef\b",                                            # Norwegian RTO group (SINTEF AS, SINTEF Energi, ...)
    r"\btutkimuskeskus\b|\btutkimuslaitos\b",                 # Finnish research centre/institute (VTT, Luke)
    r"[uü]likool",                                            # Estonian university compounds (Tallinna Tehnikaülikool)
    r"\bcentre for process innovation\b|\buk agri tech centre\b|\brothamsted\b|\bbuilding research establishment\b",
    r"\bifp energies nouvelles\b|\bvirtual vehicle research\b",
    r"\bsilicon austria labs\b|\biii-v lab\b",                # Austrian COMET centre; Thales/Nokia joint research lab
    r"\bassociacion\b",                                       # Catalan associació + N (LEITAT / Acondicionamiento Tarrasense)
]
RESEARCH_RE = re.compile("|".join(RESEARCH_PATTERNS), re.IGNORECASE)

# Public bodies / NGOs / consortia → "other"
PUBLIC_BODY_PATTERNS = [
    r"\bminister(?:io|ium|e|ie|y|o)\b|\bministero\b",   # Ministerio, Ministerium, Ministère, Ministero
    r"\bagence\b|\bagencia\b|\bagentur\b|\bagency\b|\bagenzia\b",  # incl. Italian Agenzia
    r"\bcomune di\b|\bmunicip|\bgemeinde\b",
    r"\bregion[ea]?\b",                                 # Regional authorities
    r"\bgovern(?:ment|o|amento)\b",
    r"\bcommission europea\b|\beuropean commission\b",
    r"\bservicio\s+\w+\s+de salud\b|\bservizio sanitario",  # Spanish/Italian health services
    # Sprint 8 audit additions
    r"\bayuntamiento\b|\bayuntament\b",                     # Spanish municipality
    r"\bdiputaci[oó]n\b",                                   # Spanish provincial council
    # Sprint 19 hygiene — funders / NGO networks that polluted champion lists
    r"\bunited kingdom research and innovation\b",          # UKRI is a funding agency, not a beneficiary company
    r"\biclei\b",                                           # ICLEI city network secretariat
    # 2026-06-15 — French local government / intercommunal bodies. ADEME funds
    # these heavily for local energy/waste projects; they are not companies and
    # were defaulting to cleantech. Excluding them cleans company-level analyses.
    r"\bcommunaut[eé]\b",                                   # Communauté de communes / d'agglomération / urbaine
    r"^cc d[eu] ",                                          # "CC DE …" abbreviation for Communauté de communes
    r"\bcommune d",                                         # Commune de / d'
    r"\bmairie\b",                                          # town hall
    r"\bsyndicat\b",                                        # intercommunal syndicate (water/waste/energy)
    r"\bd[eé]partement\b|\bconseil d[eé]partemental\b",     # French département / departmental council
    r"\bs(ictom|mictom|ivom|ivu|deee?)\b",                 # SICTOM/SMICTOM/SIVOM/SIVU/SDE intercommunal syndicates
    r"\bm[eé]tropole\b",                                    # Métropole (metropolitan authority)
]
PUBLIC_BODY_RE = re.compile("|".join(PUBLIC_BODY_PATTERNS), re.IGNORECASE)

# Corporate legal-form suffixes → "company"
COMPANY_SUFFIX_PATTERNS = [
    r"\bGmbH\b|\bmbH\b|\bgGmbH\b|gmbh\b|\bAG\b|\bKG\b|\bUG\b|\bgesellschaft\b",  # German (incl. embedded gGmbH)
    r"\bBV\b|\bNV\b|\bB\.V\.|\bN\.V\.",                          # Dutch/Belgian
    r"\bSAS\b|\bSARL\b|\bSASU\b|\bSCA\b",                        # French
    r"\bSA\b|\bS\.A\.",                                          # SA — Sociedade/Sociedad/Société Anónima (PT/ES/FR)
    r"\bSRL\b|\bS\.r\.l\.|\bSpA\b|\bS\.p\.A\.|\bSrls\b|\bSCPA\b|\bSRO\b|\bs\.r\.o\.",  # Italian + Czech
    r"societ[àa] a responsabilit[àa] limitata|societ[àa] per azioni",      # Italian SRL/SpA long form
    r"\bSL\b|\bSLU\b|\bSLL\b|\bSLNE\b|\bS\.L\.",                 # Spanish
    r"\bLtd\b|\bLimited\b|\bPLC\b|\bLLC\b|\bLLP\b|\bInc\b|\bInc\.|\bCorp\b",  # Anglo / US
    r"\bAB\b|\bApS\b|\bA/S\b|\bAS\b",                            # Nordic
    r"\bOy\b|\bOyj\b|\bhf\b|\behf\b",                            # Finnish / Icelandic
    r"\bDOO\b|\bd\.o\.o\.|\bDD\b|\bUAB\b|\bOOO\b",               # Slovenian / Lithuanian / Russian
    r"\bsp\.?\s*z\.?\s*o\.?\s*o\.?",                             # Polish sp. z o.o. (with dots/spaces between)
    r"\bLda\b|\bL\.da|\bCRL\b|\bScrl\b",                         # Portuguese / cooperative
    r"\bEE\b|\bIKE\b|\bI\.K\.E\.|\bidiotiki kefalaiouchiki",    # Greek limited / private capital co
    r"\bspolka akcyjna\b|\bspolka z ograniczon",                 # Polish SA / sp. z o.o. (full form)
    r"\bSAU\b",                                                  # Spanish SAU
    r"\bzrt\b|\bzartkoruen|\bzártkörűen|\breszvenytarsasag|\brészvénytársaság|\bkft\b|\bnyrt\b",  # Hungarian
    r"\bSE\b",                                                   # Societas Europaea
    r"\btechnologies\b|\bsolutions\b|\bsystems\b|\bsystème\b",   # Common company-name terms
    r"\bbiotech\b|\bbioscience\b|\bpharm",                       # Biotech/pharma sector terms
    r"\bholding\b|\bholdco\b|\bgroup\b",
    # Sprint 8 audit additions
    r"\bsirketi\b|\bsanayi\b|\bticaret\b|\banonim\b",            # Turkish corporate
    r"\betaireia\b|\betairia\b|\baepiri\b|\baeperiorismeni\b",   # Greek SA/private capital
    r"\bbvba\b|\bsprl\b",                                        # Belgian corporate
    r"defenceandspacesas\b|defenceandspaceltd\b",                # Squashed Airbus DS variants
    r"\btechnology\b",                                           # singular trailing brand
    r"\b(?:tech|energy|industry|industries|materials|robotics|optics|photonics|battery|batteries|fuels?|cells?|networks?|digital|software|automation|aerospace|aviation|chemie|pharma|medic|therapeutics|genetics|biosciences?|genomics?|diagnostics?|imaging|nano|semic|semi|computing|cloud|works|wear|wave|grid|motors?|automotive|hydrogen|electrolyzer|innovations?|enterprises?|ai|labs?)\b\s*$",  # trailing brand-y noun
    r"\b[A-Za-z]{3,}\s+(?:DE|FR|IT|ES|NL|BE|AT|PT|SE|FI|DK|NO|IE|GR|EL|CH|UK|US)\s*$",  # trailing country tag
    r"\belectricite de france\b|\beurofins\b|\bhewlett packard enterprise\b",
]
COMPANY_RE = re.compile("|".join(COMPANY_SUFFIX_PATTERNS), re.IGNORECASE)

# Programme-driven fallback. These funding streams accept only corporate
# beneficiaries by design (IPCEI = state-aid to direct industrial partners,
# IF = industrial decarbonisation projects, EIT KIC = curated startup
# portfolio, KDT/Chips JU = SME / industrial coordinators). When name
# patterns alone cannot resolve a row, the source family is decisive.
# EDF is intentionally absent — defense calls include research orgs (ONERA,
# CERTH, Demokritos) that need name-level matches.
# innovate_uk: business-led by programme design; universities and Catapult
# RTOs resolve via the research patterns first (incl. the \bcatapult\b rule),
# so the fallback only sees suffix-less trading names.
SOURCE_FAMILY_COMPANY = {"ipcei", "innovation_fund", "eit", "chips_ju", "innovate_uk"}


def _source_family(source: str) -> str:
    if source.startswith("eic_"): return "eic"
    if source.startswith("ipcei_"): return "ipcei"
    if source.startswith("edf_"): return "edf"
    if source.startswith("innovation_fund"): return "innovation_fund"
    if source.startswith("eib_"): return "eib"
    if source.startswith("eit_"): return "eit"
    if source.startswith("chips") or source.startswith("kdt"): return "chips_ju"
    if source.startswith("innovate_uk"): return "innovate_uk"
    return source


def classify_entity_type(name, is_accelerator_coordinator, sources=()):
    # Priority order: research_org > public body (other) > company > unknown
    if RESEARCH_RE.search(name):
        return "research_org"
    if PUBLIC_BODY_RE.search(name):
        return "other"
    if COMPANY_RE.search(name):
        return "company"
    if is_accelerator_coordinator:
        return "company"  # Accelerator is SME-only — safe default if no suffix detected
    # Source-family fallback — programme defines the beneficiary type
    fams = {_source_family(s) for s in sources if s}
    if fams & SOURCE_FAMILY_COMPANY:
        return "company"
    return "unknown"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Single run_id tag for this classify.py invocation; lets us group all
    # flips from one re-classify in classify_audit.
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")

    cur.execute("""
        SELECT c.id, c.canonical_name,
               c.sector_inferred AS old_sector,
               c.entity_type AS old_entity,
               GROUP_CONCAT(e.sector_tags_raw, '||') AS all_tags,
               GROUP_CONCAT(e.project_title || ' ' || COALESCE(e.project_summary, ''), '||') AS all_text,
               GROUP_CONCAT(e.source, '||') AS all_sources,
               MAX(CASE WHEN e.source = 'eic_accelerator' AND e.role = 'coordinator'
                        THEN 1 ELSE 0 END) AS is_accel_coord
        FROM companies c
        LEFT JOIN public_funding_events e ON e.company_id = c.id
        GROUP BY c.id
    """)
    rows = cur.fetchall()

    sector_counts = Counter()
    entity_counts = Counter()
    sector_flips = []   # (company_id, old, new)
    entity_flips = []   # (company_id, old, new)
    sector_updates = []
    entity_updates = []
    for r in rows:
        raw_strings = (r["all_tags"] or "").split("||")
        fallback_text = r["all_text"] or ""
        sources = (r["all_sources"] or "").split("||")
        sector = classify_sector(raw_strings, fallback_text, sources)
        if r["canonical_name"] in MANUAL_SECTOR_OVERRIDES:
            sector = MANUAL_SECTOR_OVERRIDES[r["canonical_name"]]
        entity = classify_entity_type(r["canonical_name"], bool(r["is_accel_coord"]), sources)
        sector_counts[sector] += 1
        entity_counts[entity] += 1

        # Only stamp updated_at + log audit on actual change. NULL old_value
        # (first classify-touch on a freshly inserted row) counts as a change.
        if sector != r["old_sector"]:
            sector_flips.append((r["id"], r["old_sector"], sector))
            sector_updates.append((sector, now_iso, r["id"]))
        if entity != r["old_entity"]:
            entity_flips.append((r["id"], r["old_entity"], entity))
            entity_updates.append((entity, now_iso, r["id"]))

    if sector_updates:
        cur.executemany(
            "UPDATE companies SET sector_inferred = ?, sector_inferred_updated_at = ? WHERE id = ?",
            sector_updates,
        )
    if entity_updates:
        cur.executemany(
            "UPDATE companies SET entity_type = ?, entity_type_updated_at = ? WHERE id = ?",
            entity_updates,
        )

    # Audit-log every change (including first-time NULL → value transitions)
    audit_rows = (
        [(cid, "sector_inferred", old, new, run_id) for cid, old, new in sector_flips]
        + [(cid, "entity_type", old, new, run_id) for cid, old, new in entity_flips]
    )
    if audit_rows:
        cur.executemany(
            """INSERT INTO classify_audit (company_id, field, old_value, new_value, run_id)
               VALUES (?, ?, ?, ?, ?)""",
            audit_rows,
        )

    conn.commit()

    print("Sector distribution:")
    for label, n in sector_counts.most_common():
        print(f"  {label:<22} {n:>5}")
    print(f"  {'TOTAL':<22} {sum(sector_counts.values()):>5}")

    print("\nEntity type distribution:")
    for label, n in entity_counts.most_common():
        print(f"  {label:<22} {n:>5}")
    print(f"  {'TOTAL':<22} {sum(entity_counts.values()):>5}")

    # Audit summary — what changed vs. previous DB state
    real_sector_flips = [(o, n) for _, o, n in sector_flips if o is not None]
    real_entity_flips = [(o, n) for _, o, n in entity_flips if o is not None]
    first_sector = sum(1 for _, o, _ in sector_flips if o is None)
    first_entity = sum(1 for _, o, _ in entity_flips if o is None)
    print(f"\nClassifier audit (run_id={run_id}):")
    print(f"  Sector: {len(real_sector_flips)} flips, {first_sector} first-time assignments")
    print(f"  Entity: {len(real_entity_flips)} flips, {first_entity} first-time assignments")
    if real_sector_flips:
        flip_pairs = Counter(real_sector_flips)
        print("  Top sector transitions:")
        for (o, n), ct in flip_pairs.most_common(8):
            print(f"    {o or 'NULL':<18} → {n:<18} {ct:>4}")
    if real_entity_flips:
        flip_pairs = Counter(real_entity_flips)
        print("  Top entity_type transitions:")
        for (o, n), ct in flip_pairs.most_common(8):
            print(f"    {o or 'NULL':<18} → {n:<18} {ct:>4}")

    conn.close()


if __name__ == "__main__":
    main()
