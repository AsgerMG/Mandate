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
    r"\bhögsk|\bhogsk|\bhøgsk",               # Swedish/Norwegian higher ed (covers -skola, -skole, -skulen)
    r"\bháskól|\bhaskol",                     # Icelandic
    r"\bkorkeakoulu|\btudományegyetem|\btudomanyegyetem|\begyetem\b",  # Finnish, Hungarian
    r"\bhochschule\b|\bhoch[- ]schule\b",     # German Hochschule
    r"\bvysoká škola\b|\bvysoka skola\b",     # Czech/Slovak "Vysoká škola" = university
    r"\bpolytechn|\bpolitechn|\bpolitecnico", # polytechnic / polytechnique / polytechnion / politechnika
    r"\bcollege\b",                           # King's College, etc.
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
SOURCE_FAMILY_COMPANY = {"ipcei", "innovation_fund", "eit", "chips_ju"}


def _source_family(source: str) -> str:
    if source.startswith("eic_"): return "eic"
    if source.startswith("ipcei_"): return "ipcei"
    if source.startswith("edf_"): return "edf"
    if source.startswith("innovation_fund"): return "innovation_fund"
    if source.startswith("eib_"): return "eib"
    if source.startswith("eit_"): return "eit"
    if source.startswith("chips") or source.startswith("kdt"): return "chips_ju"
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
