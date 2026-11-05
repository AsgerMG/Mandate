"""Extract EIT KIC funding/support events from EIT Digital and EIT Manufacturing.

Data sources:
  EIT Digital (rebranded 28digital.eu in 2025):
    - Annual Champions cohorts 2021–2025 (formerly "EIT Digital Challenge" 2021–2023,
      renamed "EIT Digital Champions" from 2024).
    - EIC–EIT Digital Venture Acceleration Programme (VAP) 2022 cohort.
  EIT Manufacturing (ASBL — ceased operations 10 April 2026, pages still online):
    - Investment portfolio page (23 companies as of 2026-05-21).
    - BoostUp! competition winners 2021, 2023, 2024.

Scope:
  Time window: 2021–2026-05-21.
  Deferred (Sprint 9): EIT InnoEnergy, EIT Health (both via Dealroom).
  Deferred (future): EIT Climate-KIC, Food, Raw Materials, Urban Mobility, Culture.
  EIT Manufacturing BoostUp 2022 grand final: 8 winners at €20K each, but winner
  names were not published on the website — excluded with documentation.

Run modes:
  python extract_eit.py             → CSV output only (no DB write)
  python extract_eit.py --load-db   → match + load into db.sqlite
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from europe_scope import COUNTRY_NAME_TO_ISO2  # noqa: E402
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
from store import connect  # noqa: E402
from europe_scope import canonicalise_country  # noqa: E402
# --- end ETL path bootstrap ---

import csv
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

BASE_DIR = _ETL_ROOT
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "eit_projects.csv"
MATCH_CSV_PATH = OUT_DIR / "eit_match_summary.csv"
DB_PATH = _ETL_DB

# ---------------------------------------------------------------------------
# Source ID catalogue + sector fallback
# ---------------------------------------------------------------------------

# All call → (source_id, awarded_date) entries.
# EIT Digital 2021–2023 used the name "EIT Digital Challenge";
# renamed "EIT Digital Champions" from 2024. Unified as champions_<year> here.
CALL_TO_SOURCE: dict[str, tuple[str, str]] = {
    "eit_digital_2021":         ("eit_digital_champions_2021", "2021-11-01"),
    "eit_digital_2022":         ("eit_digital_champions_2022", "2022-11-01"),
    "eit_digital_vap_2022":     ("eit_digital_vap_2022",       "2022-06-01"),
    "eit_digital_2023":         ("eit_digital_champions_2023", "2023-11-01"),
    "eit_digital_2024":         ("eit_digital_champions_2024", "2025-02-28"),
    "eit_digital_2025":         ("eit_digital_champions_2025", "2025-02-28"),
    "eit_mfg_investments":      ("eit_manufacturing_investments", "2023-01-01"),
    "eit_mfg_boostup_2021":     ("eit_manufacturing_boostup_2021", "2021-10-01"),
    "eit_mfg_boostup_2023":     ("eit_manufacturing_boostup_2023", "2023-12-01"),
    "eit_mfg_boostup_2024":     ("eit_manufacturing_boostup_2024", "2024-12-01"),
    # EIT InnoEnergy Highway — equity portfolio additions (cleantech)
    "eit_innoenergy_2021":        ("eit_innoenergy_highway_2021",   "2021-12-01"),
    "eit_innoenergy_2022":        ("eit_innoenergy_highway_2022",   "2022-12-01"),
    "eit_innoenergy_2023":        ("eit_innoenergy_highway_2023",   "2023-12-01"),
    "eit_innoenergy_2024":        ("eit_innoenergy_highway_2024",   "2024-12-01"),
    # EIT Health Catapult — competition finalists/winners (life_sciences)
    "eit_health_catapult_2021":   ("eit_health_catapult_2021",      "2021-05-01"),
    "eit_health_catapult_2022":   ("eit_health_catapult_2022",      "2022-05-24"),
    "eit_health_catapult_2023":   ("eit_health_catapult_2023",      "2023-11-09"),
    "eit_health_catapult_2024":   ("eit_health_catapult_2024",      "2024-06-05"),
    "eit_health_catapult_2025":   ("eit_health_catapult_2025",      "2025-06-17"),
    # EIT Climate-KIC — multiple ClimAccelerator programmes (cleantech)
    "eit_climate_cdr_2022":       ("eit_climate_kic_cdr_2022",      "2022-10-01"),
    "eit_climate_cdr_2023":       ("eit_climate_kic_cdr_2023",      "2023-09-01"),
    "eit_climate_asa_2024":       ("eit_climate_kic_asa_2024",      "2024-04-01"),
    "eit_climate_ccs_2024":       ("eit_climate_kic_clean_cities_spain_2024", "2024-05-01"),
    # EIT Urban Mobility — annual cohorts + portfolio (other)
    "eit_urban_mobility_portfolio": ("eit_urban_mobility_portfolio","2022-01-01"),
    "eit_urban_mobility_2022":    ("eit_urban_mobility_2022",       "2022-07-01"),
    "eit_urban_mobility_2023":    ("eit_urban_mobility_2023",       "2023-07-01"),
    "eit_urban_mobility_2024":    ("eit_urban_mobility_2024",       "2024-07-01"),
    # EIT RawMaterials — startup portfolio (deeptech_hardware)
    "eit_rawmaterials_portfolio": ("eit_rawmaterials_portfolio",    "2022-01-01"),
    # EIT Food RisingFoodStars — annual cohort (other)
    "eit_food_rfs_2021":          ("eit_food_rfs_2021",             "2021-09-01"),
    "eit_food_rfs_2022":          ("eit_food_rfs_2022",             "2022-09-01"),
    "eit_food_rfs_2023":          ("eit_food_rfs_2023",             "2023-05-31"),
    "eit_food_rfs_2024":          ("eit_food_rfs_2024",             "2024-06-11"),
    "eit_food_rfs_2025":          ("eit_food_rfs_2025",             "2025-06-01"),
}

# ── What each cohort actually hands out ─────────────────────────────────────
#
# ── The fault this replaces ────────────────────────────────────────────────
# This used to be a four-branch if/elif over source-id PREFIXES with a
# fall-through: three named programmes were equity, BoostUp was a grant, a row
# carrying a euro amount was a grant, and everything else got `eit_kic_support`
# -- a label that names no kind of capital at all. 477 of the 583 EIT events in
# this corpus took that last branch.
#
# Downstream, `unknown` is reachable by no intake option, so eight publishable
# EIT instruments were removed from the pool of every founder in every country
# however they answered. Nothing went red. The funds were simply never offered.
#
# The fall-through is what made it silent, and it is the thing being removed:
# a cohort absent from this dict now raises a KeyError at extract time, when
# somebody is looking at the KIC's page anyway, rather than producing a fund
# nobody can see.
#
# ── Why per COHORT and not per KIC ─────────────────────────────────────────
# "EIT gives grants" is false and "EIT takes equity" is false. The KICs run
# both, and which one applies is a property of the cohort year and the stage,
# not of the KIC:
#
#   * EIT Digital paid cash prizes ONCE, in 2021 (EUR 250,000 across three
#     winners). From 2022 the same competition awards places in an accelerator
#     and no money at all.
#   * EIT Urban Mobility's accelerator grant shrank 15,000 -> 5,000 -> 2,500
#     EUR across cohorts while its "EUR 30,000 worth of support services"
#     headline stayed fixed. It has signed no SAFEs in any cohort here; the
#     Techstars SAFE dates from July 2026 and any SAFE flag on a pre-2026 row
#     would be wrong.
#   * EIT RawMaterials' startup list reads like a directory and is an EQUITY
#     PORTFOLIO: "Each featured company has received funding and tailored
#     support from EIT RawMaterials and forms part of our active equity
#     portfolio", under a "services-against-equity framework" in which equity
#     participation is a condition of selection.
#
# ── Three traps in the page text, all real ────────────────────────────────
# Anything reading these pages by keyword gets each of them wrong:
#   * EIT Health Catapult calls its prize pot an "investment prize fund". It is
#     promotional wording for a cash prize, not an equity instrument.
#   * RisingFoodStars cites "$15 million in investment from the EIT Food Impact
#     Fund" -- a cumulative alumni figure from a separate vehicle, not a
#     disbursement to that cohort.
#   * 28DIGITAL publishes an equity portfolio. It comes from its venture-building
#     tracks, not from the Challenge/Champions or VAP rows here.
#
# Sources are cited per entry. Anything not settled by an official page is
# `eit_kic_undetermined`, which is a real answer and better than a guess: the
# product withholds those rows deliberately rather than pretending to know.
COHORT_CAPITAL_BASIS: dict[str, str] = {
    # ── Cash, equity-free ──────────────────────────────────────────────────
    # EIT Digital Challenge 2021: "The 3 best companies receive prizes
    # totalling EUR 250.000", first prize "a cash prize of EUR 100,000".
    "eit_digital_champions_2021":      "eit_kic_grant",
    # BoostUp: prize cash, and the only EIT rows that ever carried an amount.
    "eit_manufacturing_boostup_2021":  "eit_kic_grant",
    "eit_manufacturing_boostup_2023":  "eit_kic_grant",
    "eit_manufacturing_boostup_2024":  "eit_kic_grant",
    # Amazon Sustainability Accelerator, run as an EIT Climate-KIC
    # ClimAccelerator: "a EUR 12 000 cash grant", programme described as
    # "equity-free". (eit.europa.eu/our-activities/opportunities/
    # amazon-sustainability-accelerator)
    "eit_climate_kic_asa_2024":        "eit_kic_grant",
    # Carbon Removal ClimAccelerator: "supported the startups financially with
    # non-dilutive grants" -- stated by ETH Zurich's sus.lab, a programme
    # co-lead, because climate-kic.org's own cohort pages are silent on the
    # instrument. Second-party rather than first-party, and recorded as such in
    # project-mgmt/findings/workstream_av_capital_type.md.
    "eit_climate_kic_cdr_2022":        "eit_kic_grant",
    "eit_climate_kic_cdr_2023":        "eit_kic_grant",
    # EIT Urban Mobility accelerators: a small equity-free grant (EUR 15,000 in
    # 2021, 5,000 in 2022, 2,500 later) alongside services. Cash, and no stake.
    "eit_urban_mobility_2022":         "eit_kic_grant",
    "eit_urban_mobility_2023":         "eit_kic_grant",
    "eit_urban_mobility_2024":         "eit_kic_grant",

    # ── Equity ─────────────────────────────────────────────────────────────
    "eit_manufacturing_investments":   "eit_kic_equity",   # investment portfolio
    "eit_innoenergy_highway_2021":     "eit_kic_equity",   # "equity portfolio"
    "eit_innoenergy_highway_2022":     "eit_kic_equity",
    "eit_innoenergy_highway_2023":     "eit_kic_equity",
    "eit_innoenergy_highway_2024":     "eit_kic_equity",
    "eit_urban_mobility_portfolio":    "eit_kic_equity",   # startup portfolio
    # Reclassified from `eit_kic_support`. EIT RawMaterials Start-up Portfolio
    # 2025 (PDF): "forms part of our active equity portfolio"; Booster call
    # guidelines: "EIT RawMaterials shall be entitled to acquire interest in the
    # equity of the venture". The webpage this was harvested from carries none
    # of that framing, which is why reading the page alone produced no type.
    "eit_rawmaterials_portfolio":      "eit_kic_equity",

    # ── Support, and no capital ────────────────────────────────────────────
    # EIT Digital Challenge/Champions from 2022: winners "join the EIT Digital
    # Accelerator program" / "get access to the EIT Digital Growth Services
    # programme consisting of 12 months of support". No money.
    "eit_digital_champions_2022":      "eit_kic_nonfinancial",
    "eit_digital_champions_2023":      "eit_kic_nonfinancial",
    "eit_digital_champions_2024":      "eit_kic_nonfinancial",
    "eit_digital_champions_2025":      "eit_kic_nonfinancial",
    # EIC/EIT Digital Venture Acceleration Programme: "free access to the
    # 12-month EIT Digital Accelerator Programme worth EUR 50,000".
    "eit_digital_vap_2022":            "eit_kic_nonfinancial",
    # RisingFoodStars is an ASSOCIATION, not a disbursement: mentorship,
    # workshops, corporate access and "access to EIT Food funding mechanisms".
    # Members historically paid a fee to join.
    "eit_food_rfs_2021":               "eit_kic_nonfinancial",
    "eit_food_rfs_2022":               "eit_kic_nonfinancial",
    "eit_food_rfs_2023":               "eit_kic_nonfinancial",
    "eit_food_rfs_2024":               "eit_kic_nonfinancial",
    "eit_food_rfs_2025":               "eit_kic_nonfinancial",
    # EIT Health Catapult pays at the FINAL and nowhere else: semi-finalists
    # "receive high-quality training", the two winners take EUR 30,000 each.
    # These rows are overwhelmingly semi-finalists -- the cohorts harvested are
    # the 42, 30 and 29 semi-finalist announcements -- so what the row records
    # is entry to a training competition, not a payment. 2023 is the exception
    # and is the winners' announcement.
    "eit_health_catapult_2021":        "eit_kic_nonfinancial",
    "eit_health_catapult_2022":        "eit_kic_nonfinancial",
    "eit_health_catapult_2023":        "eit_kic_grant",
    "eit_health_catapult_2024":        "eit_kic_nonfinancial",
    "eit_health_catapult_2025":        "eit_kic_nonfinancial",

    # ── The official source does not say ───────────────────────────────────
    # Clean Cities Spain ClimAccelerator 2024. The ClimAccelerator format is two
    # stage: Stage 1 is cash up to EUR 25,000, Stage 2 is a Climate-SAFE -- "a
    # simple agreement for future equity". The 2024 cohort page names neither
    # the stage nor the instrument, so this cohort is genuinely ambiguous
    # between a grant and a convertible. Guessing it grant would be the failure
    # `passesCapitalPreference` exists to prevent, in the direction that costs a
    # founder the most.
    "eit_climate_kic_clean_cities_spain_2024": "eit_kic_undetermined",
}

_undeclared_cohorts = sorted(
    {src for src, _ in CALL_TO_SOURCE.values()} - set(COHORT_CAPITAL_BASIS))
if _undeclared_cohorts:
    raise SystemExit(
        "extract_eit: cohort(s) with no capital declaration: "
        + ", ".join(_undeclared_cohorts)
        + "\n  Read the KIC's own page for this cohort and add it to "
          "COHORT_CAPITAL_BASIS.\n  There is no default: the default is what "
          "made eight funds invisible.")

# Sector fallback — used by classify.py when sector_tags_raw is empty.
# Import is: `from extract_eit import EIT_KIC_SOURCE_SECTOR`
EIT_KIC_SOURCE_SECTOR: dict[str, str] = {
    "eit_digital_champions_2021": "digital",
    "eit_digital_champions_2022": "digital",
    "eit_digital_vap_2022":       "digital",
    "eit_digital_champions_2023": "digital",
    "eit_digital_champions_2024": "digital",
    "eit_digital_champions_2025": "digital",
    "eit_manufacturing_investments":   "deeptech_hardware",
    "eit_manufacturing_boostup_2021":  "deeptech_hardware",
    "eit_manufacturing_boostup_2023":  "deeptech_hardware",
    "eit_manufacturing_boostup_2024":  "deeptech_hardware",
    # EIT InnoEnergy (cleantech — energy transition equity investments)
    "eit_innoenergy_highway_2021":     "cleantech",
    "eit_innoenergy_highway_2022":     "cleantech",
    "eit_innoenergy_highway_2023":     "cleantech",
    "eit_innoenergy_highway_2024":     "cleantech",
    # EIT Health Catapult (life_sciences — competition finalists)
    "eit_health_catapult_2021":        "life_sciences",
    "eit_health_catapult_2022":        "life_sciences",
    "eit_health_catapult_2023":        "life_sciences",
    "eit_health_catapult_2024":        "life_sciences",
    "eit_health_catapult_2025":        "life_sciences",
    # EIT Climate-KIC ClimAccelerator programmes (cleantech — carbon removal / clean cities / consumer sustainability)
    "eit_climate_kic_cdr_2022":        "cleantech",
    "eit_climate_kic_cdr_2023":        "cleantech",
    "eit_climate_kic_asa_2024":        "cleantech",
    "eit_climate_kic_clean_cities_spain_2024": "cleantech",
    # EIT Urban Mobility (other — urban transport portfolio + annual cohorts)
    "eit_urban_mobility_portfolio":    "other",
    "eit_urban_mobility_2022":         "other",
    "eit_urban_mobility_2023":         "other",
    "eit_urban_mobility_2024":         "other",
    # EIT RawMaterials (deeptech_hardware — materials & mining)
    "eit_rawmaterials_portfolio":      "deeptech_hardware",
    # EIT Food RisingFoodStars (other — agrifoodtech)
    "eit_food_rfs_2021":               "other",
    "eit_food_rfs_2022":               "other",
    "eit_food_rfs_2023":               "other",
    "eit_food_rfs_2024":               "other",
    "eit_food_rfs_2025":               "other",
}

# COUNTRY_NAME_TO_ISO moved to ETL/lib/europe_scope.py. Four extractors each carried
# their own copy of this dict and they had drifted in coverage -- eight
# names were missing from at least one, and an unresolvable name writes a
# NULL country rather than raising. One copy now, imported.
COUNTRY_NAME_TO_ISO = COUNTRY_NAME_TO_ISO2

# ---------------------------------------------------------------------------
# Hardcoded company data
# All data collected 2026-05-21 from the source URLs listed below.
# ---------------------------------------------------------------------------

# Each record: company_name, country_iso, description, grant_amount_eur,
#   equity_amount_eur, notes, call_key (→ CALL_TO_SOURCE), source_url
# grant_amount_eur: prize cash (BoostUp) or NULL (Champions support / investments)
# equity_amount_eur: only for investment portfolio (but undisclosed → NULL)

EIT_DIGITAL_CHAMPIONS_2021 = [
    # Source: https://28digital.eu/newsroom/news/2021/eit-digital-challenge-awards-3-best-european-digital-deep-tech-scaleups-2021/
    ("Connecting Food", "FR",
     "Leverages blockchain technology to make food systems more transparent.",
     None, None, "", "eit_digital_2021",
     "https://28digital.eu/newsroom/news/2021/eit-digital-challenge-awards-3-best-european-digital-deep-tech-scaleups-2021/"),
    ("Cubbit", "IT",
     "Transforms underutilized resources at the edge of the Internet into next-generation b2b cloud services: zero-knowledge encryption, 2x more cost-efficient and 10x greener.",
     None, None, "", "eit_digital_2021",
     "https://28digital.eu/newsroom/news/2021/eit-digital-challenge-awards-3-best-european-digital-deep-tech-scaleups-2021/"),
    ("Nect", "DE",
     "Highly converting and compliant remote Identity Verification solution using Robo-Ident, an AI-powered, patent-pending technology.",
     None, None, "", "eit_digital_2021",
     "https://28digital.eu/newsroom/news/2021/eit-digital-challenge-awards-3-best-european-digital-deep-tech-scaleups-2021/"),
]

EIT_DIGITAL_CHAMPIONS_2022 = [
    # Source: https://28digital.eu/newsroom/news/2022/the-jury-has-spoken-meet-the-2022-winners-of-the-eit-digital-challenge/
    ("Covision Quality", "IT",
     "AI and machine learning for automating and scaling the quality control process in the manufacturing industry.",
     None, None, "", "eit_digital_2022",
     "https://28digital.eu/newsroom/news/2022/the-jury-has-spoken-meet-the-2022-winners-of-the-eit-digital-challenge/"),
    ("Jentis", "AT",
     "Server-side tracking tool that helps businesses extract complete, accurate, and consistent raw data — GDPR-compliant and unaffected by cookie deletion or ad blockers.",
     None, None, "", "eit_digital_2022",
     "https://28digital.eu/newsroom/news/2022/the-jury-has-spoken-meet-the-2022-winners-of-the-eit-digital-challenge/"),
    ("Loupedeck", "FI",
     "Custom consoles designed to make the creative process faster and more intuitive for photo/video editing, audio, design, and streaming workflows.",
     None, None, "", "eit_digital_2022",
     "https://28digital.eu/newsroom/news/2022/the-jury-has-spoken-meet-the-2022-winners-of-the-eit-digital-challenge/"),
    ("Vottun", "ES",
     "Develops platforms providing blockchain 'ready-to-use' solutions and APIs including NFTs, digital credentials, payments, certificates, and supply chain traceability.",
     None, None, "", "eit_digital_2022",
     "https://28digital.eu/newsroom/news/2022/the-jury-has-spoken-meet-the-2022-winners-of-the-eit-digital-challenge/"),
    ("WSense", "IT",
     "Spinoff from Sapienza University specializing in underwater monitoring and communication systems — pioneer of Internet of Underwater Things technology.",
     None, None, "", "eit_digital_2022",
     "https://28digital.eu/newsroom/news/2022/the-jury-has-spoken-meet-the-2022-winners-of-the-eit-digital-challenge/"),
    # Special sponsorship prize winner (Indraventures pitch opportunity + mentoring)
    ("Multiverse Computing", "ES",
     "Quantum computing software for the financial industry — portfolio optimization, risk analysis, and market simulation.",
     None, None, "special sponsorship prize (Indraventures)", "eit_digital_2022",
     "https://28digital.eu/newsroom/news/2022/the-jury-has-spoken-meet-the-2022-winners-of-the-eit-digital-challenge/"),
]

EIT_DIGITAL_VAP_2022 = [
    # EIC–EIT Digital Venture Acceleration Programme 2022 (10 winners)
    # Source: https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/
    ("Activity Stream", "DK",
     "Data-driven analytics and marketing solutions for organizations to plan experiences and build customer relationships.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("Atlant 3D", "DK",
     "Advanced manufacturing platform enabling flexible, digital, cost-efficient production of new materials and electronics with atomic precision.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("ExactCure", "FR",
     "Personalized medication solutions using digital twin technology to simulate drug effectiveness and prevent medication errors.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("FutureOn", "NO",
     "Creates FieldTwin, a centralized data platform for collaborative development and management of offshore energy projects.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("GrayMatters Health", "IL",
     "Offers Prism, an EEG neurofeedback tool for mental health professionals to enhance clinical outcomes, particularly for PTSD treatment.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("Mitiga Solutions", "ES",
     "AI-powered insurtech platform that forecasts and mitigates impacts of natural hazards using machine learning and blockchain.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("RoBoTEC", "DE",
     "Automated robotics and 3D imaging technology for industrial-scale plant propagation with autonomous decision-making capabilities.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("ScanTrust", "CH",
     "Generates secure QR codes for product packaging to enable supply chain traceability, anti-counterfeiting, and customer engagement.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("Sensoneo", "SK",
     "Smart waste management solutions combining IoT sensors and software for efficient waste collection and environmental optimization.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
    ("Velco", "FR",
     "Connected solutions for electric bikes to enhance urban mobility and sustainability through improved user experience.",
     None, None, "", "eit_digital_vap_2022",
     "https://28digital.eu/newsroom/news/2022/eic-eit-digital-venture-acceleration-programme-10-winners-that-will-receive-scaleup-support/"),
]

EIT_DIGITAL_CHAMPIONS_2023 = [
    # Source: https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/
    ("Threedy", "DE",
     "Accelerating digital transformation with scalable 3D apps.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("SkillLab", "NL",
     "Software for the next generation of career guidance and matching.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Fermata", "IL",
     "AI pest and disease detection for agriculture.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Plexigrid", "ES",
     "Reinventing electricity grids for the energy transition.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Tru.ID", "GB",
     "Trusted digital identity for a mobile world.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Vizcab", "FR",
     "The most powerful SaaS accounting and visualization platform for net-zero construction.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Buddy Healthcare", "FI",
     "Automated patient care pathways reducing post-surgery complications.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Healthplus.ai", "NL",
     "Reduce post-surgery infections with AI-powered prediction platform.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Iconicchain", "FI",
     "Platform for regulatory compliance automation.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    ("Born Digital", "CZ",
     "AI-powered customer care SaaS platform.",
     None, None, "", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
    # Special sponsorship prize
    ("Ekkono", "SE",
     "Edge AI solutions for industrial predictive maintenance.",
     None, None, "special sponsorship prize (Indraventures)", "eit_digital_2023",
     "https://28digital.eu/newsroom/news/2023/shaping-the-future-of-tech-eit-digital-challenge-2023-winners-announced/"),
]

EIT_DIGITAL_CHAMPIONS_2024 = [
    # Source: https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/
    ("Aeromon", "FI",
     "Provides Energy and Chemical industries with quantified emissions data through unique mobile measurement system.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Fifth Ingenium", "IT",
     "Develops mixed reality solutions that leverage machine learning to help clients' digital transformation across Industry 4.0, Healthcare, Training, Education.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Fizimed", "FR",
     "Developing medical devices for women's health to improve their daily life through smart and powerful solutions.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Nano Corp", "FR",
     "Developing a cloud-native threat detection investigation and response solution to help cloud service providers comply with stringent data protection regulations.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("FlightOps", "IL",
     "Developing a scalable, cloud-based flight automation software to help commercial drone operators enhance operational efficiency and safety.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Ikue", "GB",
     "A customer data platform (CDP) that helps telecom operators increase customer lifetime value by collecting and analysing customer data in real time.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("MyPocketSkill", "GB",
     "Developing a digital financial education platform to help 1 million young people aged 13-24 become financially empowered.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Recruitment Smart Technologies", "GB",
     "Developing Enterprise Talent AI SaaS to help global enterprise clients improve candidate diversity in sourcing and screening.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Orange Quantum Systems", "NL",
     "Provides the test equipment required by quantum computing companies to transition to industry-grade quantum chip development.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Partex", "DE",
     "Developing an AI-based solution to solve the inefficiencies in drug discovery and development process.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("PARTORY", "CZ",
     "Developing AI-based app to help companies enhance the efficiency of the procurement process with artificial intelligence to manage complex supply chains.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("Saventic", "PL",
     "Developing AI-driven algorithms to support patients, hospitals, and industry companies in diagnosis of rare diseases.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
    ("SettleMint", "BE",
     "The Blockchain Transformation Company that connects the dots between people, processes and technology to accelerate value creation.",
     None, None, "", "eit_digital_2024",
     "https://28digital.eu/newsroom/news/2024/the-eit-digital-champions-have-arisen/"),
]

EIT_DIGITAL_CHAMPIONS_2025 = [
    # Source: https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/
    ("CINFO", "ES",
     "A leader in multimedia content solutions, CINFO delivers innovative technology to broadcasters and media companies, enhancing viewer experiences.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
    ("Excalibur", "SK",
     "Transforming cybersecurity by democratizing Privileged Access Management with an intuitive, passwordless authentication system.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
    ("Hopp", "IS",
     "Redefining urban mobility with its locally owned and sustainable electric scooter-sharing service.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
    ("Latitudo 40", "IT",
     "Specializing in geospatial data analytics, empowering urban planners and environmental agencies with insights for smarter cities.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
    ("Macaron", "FR",
     "Revolutionizing urban mobility by unifying on-street and off-street parking information into a single platform.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
    ("Peroptyx", "IE",
     "Through advanced location-based data annotation and model evaluation, enhancing AI and machine learning applications.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
    ("Reltime", "NO",
     "Leading in AI and Web3 innovation, offering a customizable SuperApp for digital banking, payments, and identity management.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
    ("XPDeep", "FR",
     "Offering the first self-explainable deep learning framework, enabling stakeholders to understand AI model decisions.",
     None, None, "", "eit_digital_2025",
     "https://28digital.eu/newsroom/news/2025/the-eit-digital-champions-arise-once-more/"),
]

EIT_MFG_INVESTMENTS = [
    # Source: https://www.eitmanufacturing.eu/investment-portfolio/
    # 21 portfolio companies as of 2026-05-21. Countries derived from website domains
    # and public knowledge where available; NULL where uncertain.
    # All equity_amount_eur=NULL (undisclosed per EIT Manufacturing policy).
    ("5thIndustry", "DE",
     "Revolutionising factory floors with plug-and-play SaaS solutions for manufacturing transparency and operational efficiency.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Adaxis", "FR",
     "Simplifies industrial robotics, enhancing additive and subtractive manufacturing for aerospace and automotive.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("aiomatic", "DE",
     "Optimising machine performance with AI-driven predictive analytics for maintenance cost reduction and downtime prevention.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("ANTACON", "DE",
     "Enhancing industrial tool durability with advanced DLC 2.0 coatings for component lifespan extension in automotive and semiconductor sectors.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("CERPRO", "",
     "Digital platform that connects OEMs and suppliers for quality automation and manufacturing compliance.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("ChainTraced", "DE",
     "Digital product passports that track essential data on quality, materials, and carbon for supply chain digitization in the metal industry.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("DigiClean Solutions", "",
     "AI-powered technology to optimise fluid monitoring, reduce waste, and cut costs for chemical cleaning processes.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("DREV", "SE",
     "Safely recover black dust from high-tech manufacturing processes for battery and recycling industry safety and efficiency.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("DTE", "DE",
     "Real-time, high-precision elemental analysis using LP-LIBS technology for metal production process control.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Frisimos", "IL",
     "Automating cable assembly with modular robotic lines for labour cost reduction and production quality improvement.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Holy Technologies", "FR",
     "Automated fibre placement that slashes waste and cuts costs by up to 50% for composite manufacturing in aerospace and orthopaedics.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Linqcase", "BE",
     "Electromagnetic inspection for non-destructive testing targeting zero-defect manufacturing in the steel industry.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Litech", "NO",
     "AI and magnetic sensing to detect hidden lithium batteries in waste for recycling facility fire prevention.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Ondosense", "DE",
     "High-precision radar sensors that perform in harsh industrial conditions for industrial monitoring and operational efficiency.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Phine.Tech", "",
     "Virtual 5G Lab as a Service allows innovators to test and deploy applications for 5G integration in robotics and manufacturing connectivity.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Plasmotion", "PL",
     "Rapid, selective plasma polishing with JETPEP technology for metal finishing in automotive and medical technology.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("RESONIKS", "DE",
     "AI-powered acoustic analysis that detects defects in production for zero-defect manufacturing in automotive and aerospace.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Robotwin", "CZ",
     "Simplifies industrial automation with no-code, motion-imitating robot teaching for spray painting, grinding, and polishing.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Salesqueze", "NL",
     "Visual CPQ platform automating quoting for dealers in construction and medical equipment manufacturing.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("STILFOLD", "SE",
     "Industrial origami approach folding sheet metal robotically for energy-efficient structures with minimal waste.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
    ("Woamy", "FI",
     "100% cellulose-based, biodegradable biofoam alternative to plastic for sustainable packaging solutions.",
     None, None, "equity amount undisclosed", "eit_mfg_investments",
     "https://www.eitmanufacturing.eu/investment-portfolio/"),
]

EIT_MFG_BOOSTUP_2021 = [
    # BoostUp! Bridge 2021 Grand Final — 4 winners, €50,000 each
    # Source: https://www.eitmanufacturing.eu/news-events/news/boostup-bridge-grand-final-2021/
    ("Prenomics", "",
     "Optimizing product shelf life for manufacturing supply chains. BoostUp! Bridge 2021 winner (EROSKI challenge).",
     50000.0, None, "BoostUp! Bridge 2021 winner; challenge partner: EROSKI", "eit_mfg_boostup_2021",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-bridge-grand-final-2021/"),
    ("GridMetrics", "",
     "Net zero manufacturing operations for Whirlpool EMEA. BoostUp! Bridge 2021 winner.",
     50000.0, None, "BoostUp! Bridge 2021 winner; challenge partner: Whirlpool EMEA", "eit_mfg_boostup_2021",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-bridge-grand-final-2021/"),
    ("ChainTraced", "DE",
     "Measuring and modelling CO2 emissions for steel supply chains. BoostUp! Bridge 2021 winner.",
     50000.0, None, "BoostUp! Bridge 2021 winner; challenge partner: voestalpine GmbH", "eit_mfg_boostup_2021",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-bridge-grand-final-2021/"),
    ("Roboception", "DE",
     "TrustScan reliable quality inspection using AI vision for KUKA robots. BoostUp! Bridge 2021 winner.",
     50000.0, None, "BoostUp! Bridge 2021 winner; challenge partner: KUKA", "eit_mfg_boostup_2021",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-bridge-grand-final-2021/"),
]

EIT_MFG_BOOSTUP_2023 = [
    # BoostUp! Europe 2023 — 5 winners, €30,000 each
    # Source: https://www.eitmanufacturing.eu/news-events/news/boostup-europe-2023-winners-selected/
    ("incon.ai", "",
     "Technological solutions for improving factory floor worker processes. BoostUp! Europe 2023 winner (Talgo challenge).",
     30000.0, None, "BoostUp! Europe 2023 winner; region: Europe; challenge partner: Talgo", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-europe-2023-winners-selected/"),
    ("Convergent Information Technologies", "",
     "Manufacturing solutions for aerospace including voestalpine BÖHLER Aerospace. BoostUp! Europe 2023 winner.",
     30000.0, None, "BoostUp! Europe 2023 winner; region: Europe; challenge partner: voestalpine BÖHLER Aerospace", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-europe-2023-winners-selected/"),
    ("QualiSense", "",
     "Enhancing quality assurance processes in manufacturing to free up time for significant value initiatives. BoostUp! Europe 2023 winner.",
     30000.0, None, "BoostUp! Europe 2023 winner; region: Europe; challenge partner: DANA", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-europe-2023-winners-selected/"),
    ("Sleeve", "",
     "Adaptable connectivity solutions that transform marine industry operations. BoostUp! Europe 2023 winner.",
     30000.0, None, "BoostUp! Europe 2023 winner; region: Europe; challenge partner: Berg Propulsion", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-europe-2023-winners-selected/"),
    ("Mavarick", "",
     "Energy optimisation enabling more flexibility in production. BoostUp! Europe 2023 winner (Volkswagen challenge).",
     30000.0, None, "BoostUp! Europe 2023 winner; region: Europe; challenge partner: Volkswagen", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-europe-2023-winners-selected/"),
    # BoostUp! North 2023 — 3 winners, €5,000 each
    # Source: https://www.eitmanufacturing.eu/news-events/news/boostup-north-2023-winners-selected/
    ("Litech AS", "NO",
     "Develops magnetic field sensors to detect improperly sorted lithium batteries and prevent waste stream fires. BoostUp! North 2023 winner.",
     5000.0, None, "BoostUp! North 2023 winner; region: North", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-north-2023-winners-selected/"),
    ("DREV", "SE",
     "Dry-cleaning technology for battery manufacturing that improves waste management and recovers microparticle materials. BoostUp! North 2023 winner.",
     5000.0, None, "BoostUp! North 2023 winner; region: North", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-north-2023-winners-selected/"),
    ("NSS Water Enhancement Technology AB", "SE",
     "Produces high-purity water (NPW®) for semiconductor manufacturing and industrial applications using the Water Enhancement Tool (WET). BoostUp! North 2023 winner.",
     5000.0, None, "BoostUp! North 2023 winner; region: North", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-north-2023-winners-selected/"),
    # BoostUp! France 2023 — 3 winners, €7,000 / €5,000 / €3,000
    # Source: https://www.eitmanufacturing.eu/news-events/news/boostup-france-winners-selected/
    ("Fairmat", "FR",
     "Second-generation carbon fiber composites recycling for sustainable manufacturing. BoostUp! France 2023 winner (1st).",
     7000.0, None, "BoostUp! France 2023 1st prize; region: France/West; theme: circular economy", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-france-winners-selected/"),
    ("Trinov", "FR",
     "IoT and AI for waste reduction in manufacturing processes. BoostUp! France 2023 winner (2nd).",
     5000.0, None, "BoostUp! France 2023 2nd prize; region: France/West; theme: circular economy", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-france-winners-selected/"),
    ("Neolitik", "FR",
     "EcoLithe construction material from recycled materials for sustainable building. BoostUp! France 2023 winner (3rd).",
     3000.0, None, "BoostUp! France 2023 3rd prize; region: France/West; theme: circular economy", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-france-winners-selected/"),
    # BoostUp! South-East 2023 — 3 winners, €7,500 / €5,000 / €2,500
    # Source: https://www.eitmanufacturing.eu/news-events/news/phee-wisersense-bilgi-and-ottobo-robotik-the-winners-of-eit-manufacturings-boostup-south-east-2023-competition/
    ("PHEE", "",
     "Circular manufacturing processes for thermoset biocomposite architectural surfaces with low-embodied carbon and zero waste. BoostUp! South-East 2023 winner (1st).",
     7500.0, None, "BoostUp! South-East 2023 1st prize; region: South-East; location: Athens", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/phee-wisersense-bilgi-and-ottobo-robotik-the-winners-of-eit-manufacturings-boostup-south-east-2023-competition/"),
    ("WiserSense Bilgi", "TR",
     "Cross-sectorial smart machine health monitoring solutions for Industry 4.0, leveraging AI and Digital Twins. BoostUp! South-East 2023 winner (2nd).",
     5000.0, None, "BoostUp! South-East 2023 2nd prize; region: South-East", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/phee-wisersense-bilgi-and-ottobo-robotik-the-winners-of-eit-manufacturings-boostup-south-east-2023-competition/"),
    ("Ottobo Robotik", "TR",
     "Collaborative autonomous robots designed to enhance warehouse and manufacturing plant operations. BoostUp! South-East 2023 winner (3rd).",
     2500.0, None, "BoostUp! South-East 2023 3rd prize; region: South-East", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/phee-wisersense-bilgi-and-ottobo-robotik-the-winners-of-eit-manufacturings-boostup-south-east-2023-competition/"),
    # BoostUp! Ireland 2023 — 3 winners, €7,500 / €5,000 / €2,500
    # Source: https://www.eitmanufacturing.eu/news-events/news/winners-selected-boostup-2023-ireland-edition/
    ("DataMinfo", "IE",
     "Builds data-driven solutions to help manufacturers increase plant capacity. BoostUp! Ireland 2023 winner (1st).",
     7500.0, None, "BoostUp! Ireland 2023 1st prize; region: Ireland", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/winners-selected-boostup-2023-ireland-edition/"),
    ("Infraprint Ltd", "IE",
     "Contract manufacturer specializing in advanced polymers and composites via additive manufacturing for aerospace and space. BoostUp! Ireland 2023 winner (2nd).",
     5000.0, None, "BoostUp! Ireland 2023 2nd prize; region: Ireland", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/winners-selected-boostup-2023-ireland-edition/"),
    ("Mersus", "IE",
     "Virtual Reality training platform automating creation of VR experiences with hand-tracking mobile hardware. BoostUp! Ireland 2023 winner (3rd).",
     2500.0, None, "BoostUp! Ireland 2023 3rd prize; region: Ireland", "eit_mfg_boostup_2023",
     "https://www.eitmanufacturing.eu/news-events/news/winners-selected-boostup-2023-ireland-edition/"),
]

EIT_MFG_BOOSTUP_2024 = [
    # BoostUp! Iberia 2024 — 3 winners; monetary amounts not disclosed
    # Source: https://www.eitmanufacturing.eu/news-events/news/boostup-iberia-has-its-winners/
    ("InBiot", "ES",
     "Smart solutions for monitoring and improving indoor air quality. BoostUp! Iberia 2024 winner (1st).",
     None, None, "BoostUp! Iberia 2024 1st prize; prize amount undisclosed; region: Iberia/West; theme: Net Zero", "eit_mfg_boostup_2024",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-iberia-has-its-winners/"),
    ("Bromalgae", "ES",
     "Innovative technology that designs and develops high-precision chemical and biological solutions for the reduction of CO2 and NOx. BoostUp! Iberia 2024 winner (2nd).",
     None, None, "BoostUp! Iberia 2024 2nd prize; prize amount undisclosed; region: Iberia/West", "eit_mfg_boostup_2024",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-iberia-has-its-winners/"),
    ("Blue Circular Innovation", "ES",
     "Startup enhancing traceability and sustainability across industries, fostering environmental sustainability and disruptive innovation. BoostUp! Iberia 2024 winner (3rd).",
     None, None, "BoostUp! Iberia 2024 3rd prize; prize amount undisclosed; region: Iberia/West", "eit_mfg_boostup_2024",
     "https://www.eitmanufacturing.eu/news-events/news/boostup-iberia-has-its-winners/"),
    # BoostUp! Ukraine 2024 — 3 winners, €7,500 / €5,000 / €2,500
    # Source: https://www.eitmanufacturing.eu/news-events/news/winners-of-the-boostup-ukraine-2024-selected/
    ("Sorbiforce", "UA",
     "Metal-free renewable energy storage batteries (Clean Energy Technologies). BoostUp! Ukraine 2024 winner (1st).",
     7500.0, None, "BoostUp! Ukraine 2024 1st prize; region: Ukraine; company also known as Clean Energy Technologies", "eit_mfg_boostup_2024",
     "https://www.eitmanufacturing.eu/news-events/news/winners-of-the-boostup-ukraine-2024-selected/"),
    ("Optysun", "UA",
     "UV sterilization water bottles for safe hydration. BoostUp! Ukraine 2024 winner (2nd).",
     5000.0, None, "BoostUp! Ukraine 2024 2nd prize; region: Ukraine", "eit_mfg_boostup_2024",
     "https://www.eitmanufacturing.eu/news-events/news/winners-of-the-boostup-ukraine-2024-selected/"),
    ("Geodesic.Life", "UA",
     "Sustainable geodesic dome homes with prefabricated panels. BoostUp! Ukraine 2024 winner (3rd).",
     2500.0, None, "BoostUp! Ukraine 2024 3rd prize; region: Ukraine", "eit_mfg_boostup_2024",
     "https://www.eitmanufacturing.eu/news-events/news/winners-of-the-boostup-ukraine-2024-selected/"),
]

# ---------------------------------------------------------------------------
# EIT InnoEnergy Highway — equity portfolio additions (cleantech)
# Source: innoenergy.com quarterly portfolio news articles, 2026-05-25
# equity_amount_eur always NULL (undisclosed per InnoEnergy policy)
# ---------------------------------------------------------------------------

EIT_INNOENERGY_HIGHWAY_2021 = [
    # H1 2021 additions — 6 new companies
    # Source: https://innoenergy.com/news-resources/new-entries-in-eit-innoenergys-portfolio-h1-2021/
    ("The Batteries", "PL",
     "Produces thin-film lithium-ion batteries outperforming conventional lithium-ion batteries at significantly lower production cost using proprietary plasma-based deposition technology.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2021",
     "https://innoenergy.com/news-resources/new-entries-in-eit-innoenergys-portfolio-h1-2021/"),
    ("Home Power Solutions", "DE",
     "Provides integrated electricity and heat solutions for residential properties that are 100% autarkic and CO2-free all year round using hydrogen storage.",
     None, None, "equity amount undisclosed; also known as HPS", "eit_innoenergy_2021",
     "https://innoenergy.com/news-resources/new-entries-in-eit-innoenergys-portfolio-h1-2021/"),
    ("H2GreenSteel", "SE",
     "Eliminates nearly all carbon emissions from steel manufacturing through hydrogen-based direct reduction processes. Plant located in Boden, northern Sweden. Rebranded as Stegra.",
     None, None, "equity amount undisclosed; rebranded as Stegra in 2024", "eit_innoenergy_2021",
     "https://innoenergy.com/news-resources/new-entries-in-eit-innoenergys-portfolio-h1-2021/"),
    ("DUCKT", "",
     "Universal adaptor and plug-and-play charge solution for enhancing public EV charging infrastructure.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2021",
     "https://innoenergy.com/news-resources/new-entries-in-eit-innoenergys-portfolio-h1-2021/"),
    ("Volytica", "DE",
     "Battery diagnosis as a service using cloud-based algorithms to evaluate field data and battery performance for EV and stationary storage operators.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2021",
     "https://innoenergy.com/news-resources/new-entries-in-eit-innoenergys-portfolio-h1-2021/"),
    ("Camelina", "",
     "Cultivates sustainable camelina oil crop feedstock on marginal European land without competing with food production, for aviation biofuels.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2021",
     "https://innoenergy.com/news-resources/new-entries-in-eit-innoenergys-portfolio-h1-2021/"),
]

EIT_INNOENERGY_HIGHWAY_2022 = [
    # 18 new companies across Q1–Q4 2022 (17 unique — Nevomo spans Q2/Q3 and Q4)
    # Source: https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/
    # Q1 2022
    ("Pure Battery Technologies", "DE",
     "Refines intermediate raw materials (MHP/black mass from recycled batteries) into clean precursor cathode active material for lithium-ion batteries, reducing CO2 by up to 85%.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Minestorage", "SE",
     "Develops large-scale energy storage plants in abandoned underground mines using proven pumped-hydro technology for long-duration fossil-free energy storage.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Novatron", "SE",
     "Develops compact nuclear fusion reactors for large-scale clean energy production. Previously known as Jäderberg Future Power.",
     None, None, "equity amount undisclosed; previously known as Jäderberg Future Power", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Suena", "",
     "Uses AI to make renewable energy supply predictable, empowering energy storage integration and grid stability.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Phynix", "",
     "First independent green hydrogen producer in Europe, offering funded migration solutions for sustainability-minded companies to achieve carbon neutrality.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Seaqurrent", "NL",
     "Develops tidal energy systems using patented TidalKite technology — a multi-wing underwater kite generating clean electricity from shallow and deep ocean currents.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    # Q2/Q3 2022
    ("Basquevolt", "ES",
     "Develops solid-state batteries using solid polymer composite electrolytes for safer, more competitive energy storage.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q2-and-q3-2022/"),
    ("GravitHy", "FR",
     "Sustainable iron and steel producer utilizing green hydrogen to create low-CO2 direct reduced iron for decarbonized steel production.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q2-and-q3-2022/"),
    ("Norwegian Crystals", "NO",
     "Manufactures high-quality monocrystalline silicon ingots, bricks, and wafers for photovoltaic applications using clean hydropower.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q2-and-q3-2022/"),
    ("Avocargo", "DE",
     "Free-floating electric cargo bike sharing for sustainable goods and personal transportation in urban areas.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q2-and-q3-2022/"),
    ("Silbat", "",
     "Creates long-duration stationary energy storage using silicon battery technology targeting under $10/kWh capital cost.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q2-and-q3-2022/"),
    ("Nevomo", "PL",
     "Develops MagRail technology enabling hyperloop-inspired magnetic levitation transportation at up to 550 km/h within existing railroad infrastructure. Previously known as Hyper Poland.",
     None, None, "equity amount undisclosed; previously known as Hyper Poland", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q2-and-q3-2022/"),
    ("Soof", "ES",
     "Digital marketplace platform connecting property owners seeking solar installation proposals with engineering and installation specialists.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q2-and-q3-2022/"),
    # Q4 2022
    ("Prime Battery Technologies", "",
     "Enables the energy transition by providing the most affordable energy storage solutions.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Empyrio", "",
     "Develops compact mono-incinerator for sewage sludge and organic waste utilisation in a self-sustaining cyclical process.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Voltaro", "",
     "Digital end-to-end platform providing efficient on-site solar implementation for commercial customers.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
    ("Coat-it", "PL",
     "Develops nano-additives for protective metallic coatings and surface treatment for automotive and semiconductor sectors.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2022",
     "https://www.innoenergy.com/news-events/eit-innoenergy-keeps-growing-its-equity-portfolio-with-18-new-companies-in-2022/"),
]

EIT_INNOENERGY_HIGHWAY_2023 = [
    # H1 2023 — 9 companies
    # Source: https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/
    ("Phytonics", "",
     "Develops bio-inspired anti-reflective nano-coatings for photovoltaic module glass, capturing almost all incoming light to boost solar efficiency.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("Heliup", "FR",
     "Manufactures lightweight solar PV panels designed for large commercial and industrial building rooftops with structural weight constraints. Technology developed at CEA-LITEN.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("Holosolis", "FR",
     "Building Europe's largest PV module factory in France with 5 GW annual production capacity and 1,700 jobs.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("Solaqua", "",
     "Creates solar-powered irrigation systems without battery storage using innovative pay-as-you-grow financing for farmers.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("iON-Energy", "",
     "Converts atmospheric energy into electricity for residential use through its Energy Box product.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("FertigHy", "FR",
     "Produces affordable, low-carbon green ammonia-based fertilizers for European farmers to address food security and agricultural decarbonization.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("Beholder", "UA",
     "Applies AI to high-resolution satellite imagery for improved critical minerals exploration efficiency, reducing exploration costs and environmental impact.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("Incitis", "",
     "Designs H2SPEED hydrogen-powered urban delivery trucks with zero emissions and zero noise, with innovative loading systems.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    ("Navlandis", "",
     "Creates foldable shipping containers reducing empty transport space by 80% and lowering CO2 emissions in global logistics.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/news-events/new-entries-in-eit-innoenergys-equity-portfolio-h1-2023/"),
    # Q3 2023 — 6 companies
    # Source: innoenergy.com Q3 2023 portfolio announcement
    ("Circular Industries", "",
     "Develops patented hydrometallurgical process for recovery of high-purity raw materials from low-grade waste printed circuit boards.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/for-innovators/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q3-2023/"),
    ("Methaplanet", "NL",
     "Provides biogas upgrading and production technology boosting biogas output efficiency for the renewable gas sector.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2023",
     "https://www.innoenergy.com/for-innovators/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q3-2023/"),
    ("Nesetten", "",
     "Offers bio-LNG and LNG solutions, manufacturing 2nd-generation cryogenic micro-bulk tanks for sustainable transport fuel.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/for-innovators/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q3-2023/"),
    ("Renercycle", "ES",
     "Creates industrial circular economy solutions for the renewable energy sector, recycling wind turbine components.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2023",
     "https://www.innoenergy.com/for-innovators/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q3-2023/"),
    ("Tribonex", "SE",
     "Develops innovative surface treatments for friction and wear reduction in industrial applications, extending component lifetime.",
     None, None, "equity amount undisclosed", "eit_innoenergy_2023",
     "https://www.innoenergy.com/for-innovators/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q3-2023/"),
    ("Future Voltaics", "",
     "Develops Vechtor, an innovative photovoltaic system with vertical bifacial solar panels that increases power output regardless of solar radiation conditions.",
     None, None, "equity amount undisclosed; country not determined", "eit_innoenergy_2023",
     "https://www.innoenergy.com/for-innovators/news-events/new-entries-in-eit-innoenergys-equity-portfolio-q3-2023/"),
]

# ---------------------------------------------------------------------------
# EIT Health Catapult — annual competition (life_sciences)
# Editions correspond to award years. Countries from regional hub where individual
# country not confirmed; hub → country mapping: France=FR, Germany=DE, Spain=ES,
# Ireland-UK hub = "" (unknown), Belgium-Netherlands = "" (unknown),
# Innostars (CEE) = "" (unknown), Scandinavia = "" (unknown).
# ---------------------------------------------------------------------------

EIT_HEALTH_CATAPULT_2022 = [
    # Edition 6 — 42 semi-finalists selected autumn 2021; finals Stockholm May 24-25 2022
    # Source: https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/
    # Winners confirmed from: https://eithealth.eu/news-article/eit-health-catapult-2022-names-winners/
    # --- Biotech (14) ---
    ("myNEO", "",
     "Personalized cancer immunotherapy platform. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "regional hub: Belgium-Netherlands", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Asylia", "",
     "Molecular diagnostics for cancer immunotherapy stratification. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "regional hub: Belgium-Netherlands", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("BIOPHTA", "FR",
     "Ocular gel insert technology for sustained drug delivery to treat retinal diseases. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("SideROS", "FR",
     "Iron-interfering drug candidates targeting iron-dependent cancer cell proliferation. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Limula", "DE",
     "Cell and gene therapy manufacturing platform enabling scalable closed-system production. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("OmicEra", "DE",
     "Mass spectrometry-based proteomics for precision oncology biomarker discovery. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "later acquired by Exact Sciences", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("ADDAX Biosciences", "",
     "Formalin-free histological fixative improving tissue preservation for pathology. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "regional hub: Innostars (CEE)", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Enantis", "",
     "Innovative proteins and enzymes engineered for industrial and therapeutic applications. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "regional hub: Innostars (CEE)", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Finnadvance", "",
     "Human disease modeling organ-on-chip platform for drug discovery and testing. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "regional hub: Scandinavia", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("APLEX Bio", "",
     "Biomarker detection reagents for rapid, sensitive point-of-care diagnostics. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "regional hub: Scandinavia", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Arthex Biotech", "ES",
     "RNA therapy platform targeting Myotonic Dystrophy with antisense oligonucleotides. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Onena Medicines", "ES",
     "Antibody-based medicines for cancer treatment. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Renovos Biologics", "",
     "Regenerative medicine nanoclay gels for bone and cartilage repair. EIT Health Catapult 2022 Biotech semi-finalist.",
     None, None, "regional hub: Ireland-UK", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("SolasCure", "GB",
     "Aurase hydrogel treatment for chronic wounds inspired by maggot therapy principles. EIT Health Catapult 2022 Biotech WINNER.",
     None, None, "Edition 6 Biotech category winner", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2022-names-winners/"),
    # --- Medtech (14) ---
    ("ArthroSave", "",
     "Joint preservation device for knee osteoarthritis avoiding total knee replacement. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "regional hub: Belgium-Netherlands", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Kaminari Medical", "",
     "Coronary imaging catheter for real-time intravascular ultrasound guidance. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "regional hub: Belgium-Netherlands", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("BeFC", "FR",
     "Paper biofuel cell platform generating electricity from ambient glucose for disposable biosensors. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Orixha", "FR",
     "Lung Conservative Liquid Ventilation technology for acute respiratory distress syndrome. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Adiposs", "DE",
     "Body composition imaging using MRI-based fat quantification. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("ThinkSono", "DE",
     "DVT detection software using AI-guided ultrasound enabling nurses to detect deep vein thrombosis. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    (".lumen", "RO",
     "Assistive glasses using AI and robotics to empower visually impaired users to navigate independently. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "regional hub: Innostars (CEE); country Romania confirmed from EIT Urban Mobility listing", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("RECORNEA", "",
     "Bioengineered cornea implants for keratoconus treatment. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "regional hub: Innostars (CEE)", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("LS CancerDiag", "",
     "Lynch syndrome early detection test for hereditary colorectal cancer risk. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "regional hub: Scandinavia", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Medvasc", "",
     "Anaesthesia optimisation system for varicose vein treatment procedures. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "regional hub: Scandinavia", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Leuko", "ES",
     "PointCheck — non-invasive device enabling daily white blood cell monitoring from home without blood samples. EIT Health Catapult 2022 Medtech WINNER.",
     None, None, "Edition 6 Medtech category winner", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2022-names-winners/"),
    ("Innitius", "ES",
     "Preterm Labour diagnosis device for non-invasive cervical assessment. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("FeelTect", "",
     "Connected-health wound monitoring patch for continuous wound status assessment. EIT Health Catapult 2022 Medtech semi-finalist.",
     None, None, "regional hub: Ireland-UK", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Luminate Medical", "IE",
     "Lily — portable technology to prevent chemotherapy-induced hair loss. EIT Health Catapult 2022 Alex Casta Audience Award winner.",
     None, None, "Edition 6 Alex Casta Audience Award winner", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2022-names-winners/"),
    # --- Digital Health (14) ---
    ("IMedis", "",
     "AI-driven radiology quality management platform. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Belgium-Netherlands", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("BioStrand", "",
     "Omics data analysis and AI-powered drug discovery platform. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Belgium-Netherlands", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("AZmed", "FR",
     "AI-powered fracture detection tool for radiologists reducing missed diagnoses. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("AVATAR MEDICAL", "FR",
     "Virtual reality surgical visualization platform enabling 3D patient-specific anatomy review. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Ebenbuild", "DE",
     "AI software generating lung digital twins and personalised therapy recommendations for ARDS patients. EIT Health Catapult 2022 Digital Health WINNER.",
     None, None, "Edition 6 Digital Health category winner", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2022-names-winners/"),
    ("Mentalis", "DE",
     "Digital mental health aftercare platform for post-therapy support and relapse prevention. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Heaxel", "",
     "Robot-mediated rehabilitation devices for neurological patient recovery. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Innostars (CEE)", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Virtuleap", "",
     "VR neuroscience platform for pharmaceutical drug development and cognitive assessment. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Innostars (CEE)", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("KAMU Health", "",
     "Respiratory digital therapeutics platform for COPD and asthma management. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Scandinavia", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Cardiolyse", "",
     "Cloud-based heart health analytics enabling AI-powered ECG analysis at scale. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Scandinavia", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Exheus", "ES",
     "Gene expression health optimisation reports enabling personalised lifestyle interventions. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("HumanITcare", "ES",
     "AI-powered telemedicine platform for remote patient monitoring and chronic disease management. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Brightlobe", "",
     "Mobile games for neurodevelopment assessment in children. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Ireland-UK", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
    ("Amara Therapeutics", "",
     "RiSolve software platform for clinical decision support in Overactive Bladder treatment. EIT Health Catapult 2022 Digital Health semi-finalist.",
     None, None, "regional hub: Ireland-UK", "eit_health_catapult_2022",
     "https://eithealth.eu/news-article/eit-health-catapult-2021-selects-42-semi-finalists/"),
]

EIT_HEALTH_CATAPULT_2023 = [
    # Edition 7 — finals at Bits & Pretzels, June 2023
    # Source: https://sciencebusiness.net/network-updates/eit-health-announces-2023-winners-its-catapult-competition
    ("Deepeye", "DE",
     "Digital health solution using AI for eye disease screening and diabetic retinopathy detection. EIT Health Catapult 2023 Digital Health WINNER.",
     None, None, "Edition 7 Digital Health category winner", "eit_health_catapult_2023",
     "https://sciencebusiness.net/network-updates/eit-health-announces-2023-winners-its-catapult-competition"),
    ("Immunyx", "IL",
     "Immunotherapy platform for cancer treatment using next-generation cell engineering. EIT Health Catapult 2023 Biotech WINNER.",
     None, None, "Edition 7 Biotech category winner", "eit_health_catapult_2023",
     "https://www.ddw-online.com/israeli-start-up-wins-eit-health-catapult-2023-biotech-category-24253-202306/"),
    ("Time is Brain", "ES",
     "AI-powered platform for rapid stroke diagnosis and treatment decision support, reducing time-to-treatment. EIT Health Catapult 2023 Medtech WINNER.",
     None, None, "Edition 7 Medtech category winner", "eit_health_catapult_2023",
     "https://sciencebusiness.net/network-updates/eit-health-announces-2023-winners-its-catapult-competition"),
    ("Biome Dx", "",
     "Microbiome-based diagnostics platform for early disease detection. EIT Health Catapult 2023 Alex Casta Audience Award winner.",
     None, None, "Edition 7 Alex Casta Audience Award winner; country not determined", "eit_health_catapult_2023",
     "https://sciencebusiness.net/network-updates/eit-health-announces-2023-winners-its-catapult-competition"),
]

EIT_HEALTH_CATAPULT_2024 = [
    # Edition 8 — 30 semi-finalists (2023-24 cycle); finals at Bits & Pretzels, June 5-6 2024
    # Source: https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/
    # Winners: CELEX Oncology (Life Sciences), Acorai (Healthtech), Dymium (Alex Casta)
    # --- Life Sciences (10) ---
    ("CELEX Oncology", "GB",
     "Cancer immunotherapy using next-generation cell engineering to overcome tumour immune evasion. EIT Health Catapult 2024 Life Sciences WINNER.",
     None, None, "Edition 8 Life Sciences category winner", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Celtic Biotech", "IE",
     "Biotech platform developing novel antimicrobial and anti-cancer peptides. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("G.ST Antivirals", "AT",
     "Develops broad-spectrum antiviral compounds targeting conserved viral mechanisms. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Integra Therapeutics", "ES",
     "Gene editing platform for precise integration of therapeutic genes into the human genome. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Lactocore", "DE",
     "Bioactive peptides derived from human milk proteins for infant nutrition and gut health. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Orgavalue", "PT",
     "Organ preservation solution extending viability of donor organs for transplantation. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Pan Cancer T", "NL",
     "Pan-cancer T-cell therapy platform targeting shared tumour antigens across multiple cancer types. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("POLYGON Therapeutics", "FR",
     "Therapeutic platform using polygonal DNA nanostructures for targeted drug delivery. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("R-nuucell", "PT",
     "Cell therapy platform engineering regulatory T cells for autoimmune disease treatment. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Tezted", "FI",
     "AI-powered diagnostic test validation platform for clinical laboratory quality assurance. EIT Health Catapult 2024 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    # --- Healthtech (20) ---
    ("Acorai", "SE",
     "Non-invasive cardiac pressure monitoring device for heart failure management. EIT Health Catapult 2024 Healthtech WINNER.",
     None, None, "Edition 8 Healthtech category winner", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Bearcover", "DE",
     "Digital health platform for bear attack wound care and emergency response. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Digistain", "GB",
     "Label-free mid-infrared spectroscopic staining for cancer pathology digitization. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Dymium", "DE",
     "Smart rehabilitation platform combining AI and sensor technology for at-home physiotherapy. EIT Health Catapult 2024 Alex Casta Audience Award winner.",
     None, None, "Edition 8 Alex Casta Audience Award winner", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Exhalation Technology", "GB",
     "Breath analysis device for non-invasive lung disease diagnosis and monitoring. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Feyenally", "PL",
     "AI-powered ophthalmic screening platform for early detection of eye diseases in primary care. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Fideliomed", "IT",
     "Digital therapeutics platform for cardiac rehabilitation and chronic disease management. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Five Lives", "FR",
     "Digital health platform connecting cardiac arrest survivors with peer support networks. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("SpeakTX", "EE",
     "AI speech therapy platform for aphasia rehabilitation after stroke. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("iYoni", "PL",
     "Digital health platform for women's pelvic floor health and pelvic organ prolapse management. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Look HealSee", "FR",
     "AI-powered retinal imaging platform for systemic disease detection in primary care. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Lumetry Diagnostics", "AT",
     "Optical coherence tomography-based diagnostic platform for real-time tissue assessment. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Medicud", "IT",
     "Remote patient monitoring platform for post-operative wound care. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Nen", "ES",
     "Digital health platform for pediatric chronic disease management and family support. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("neuroClues", "BE",
     "AI-powered digital biomarker platform for neurodegenerative disease early detection. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Plio Surgical", "IE",
     "Augmented reality surgical navigation system for minimally invasive procedures. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Saphenus Medical Technology", "AT",
     "Vascular access device for improved venipuncture and vein visualization. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("TRAK", "ES",
     "Digital rehabilitation platform for musculoskeletal injury recovery and remote physiotherapy. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Verdify", "NL",
     "Personalised dietary guidance platform using AI to match nutrition to individual health needs. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
    ("Xtremedy Medical", "IE",
     "Smart wound care dressing with embedded sensors for continuous healing monitoring. EIT Health Catapult 2024 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2024",
     "https://eithealth.eu/news-article/eit-health-catapult-2023-24-selects-30-semifinalists/"),
]

EIT_HEALTH_CATAPULT_2025 = [
    # Edition 9 — 29 semi-finalists (2024-25 cycle); finals at HLTH Europe, June 17 2025
    # Source: https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/
    # Winners: Cellectric Biosciences (AT), Custom Surgical (DE), NimBio (IL, Alex Casta)
    # --- Life Sciences (10) ---
    ("Aptadel Therapeutics", "ES",
     "RNA-based cancer therapies using aptamer-drug conjugates for targeted tumour treatment. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("ArrayPatch Ltd", "IE",
     "Microneedle patch technology for painless transdermal drug delivery and vaccination. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Cellectric Biosciences", "AT",
     "Electric field-based cell automation platform for electrodynamic applications in biotechnology and bioelectric medicine. EIT Health Catapult 2025 Life Sciences WINNER.",
     None, None, "Edition 9 Life Sciences category winner", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/europes-top-health-start-ups-take-centre-stage-eit-health-catapult-winners-are-revealed-at-hlth-europe/"),
    ("Fusix Biotech", "DE",
     "Cancer immunotherapy platform engineering fusion proteins to redirect immune cells against tumours. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Immunofusion", "LT",
     "CAR T-cell therapy platform for B-cell blood cancers with improved manufacturing efficiency. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Nūmi", "FR",
     "Ex vivo human breast milk production platform for premature infant nutrition. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("PepKon", "FR",
     "Therapeutic peptide platform for refractory cancers using cell-penetrating peptide conjugates. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("PoliRNA", "IT",
     "Lipid nanoparticle platform for RNA-based therapies targeting rare genetic diseases. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Rejuversen", "ES",
     "Small molecule therapy for idiopathic pulmonary fibrosis targeting cellular senescence. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("URIMON", "NL",
     "Urine-based liquid biopsy test for early cancer and disease detection. EIT Health Catapult 2025 Life Sciences semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    # --- Healthtech (19) ---
    ("Antegenes", "EE",
     "Genetic cancer risk testing platform for personalised prevention and screening strategies. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("BrightComSol", "AT",
     "FLASH radiotherapy dosimetry system enabling ultra-high dose rate cancer treatment. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Brightmind.AI", "AT",
     "At-home non-invasive brain stimulation headset for mental health conditions. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("CC Diagnostics", "NL",
     "Cervical cancer screening test based on automated image analysis of cervical cells. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("CheckEye", "UA",
     "AI platform for automated eye disease screening from fundus photographs. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("CureVision", "DE",
     "AI-powered wound diagnostics platform enabling objective wound assessment and treatment planning. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Custom Surgical", "DE",
     "Versatile digitisation and AI tool transforming any microscope into a smart imaging system for ophthalmology. EIT Health Catapult 2025 Healthtech WINNER.",
     None, None, "Edition 9 Healthtech category winner", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/europes-top-health-start-ups-take-centre-stage-eit-health-catapult-winners-are-revealed-at-hlth-europe/"),
    ("FindAir", "PL",
     "Smart inhaler solution with connected device and app for asthma and COPD medication adherence tracking. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Galenband", "IE",
     "Continuous ECG armband for long-term cardiac monitoring and atrial fibrillation detection. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Healshape", "FR",
     "Injectable breast bioprosthesis providing a natural alternative to silicone implants. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Kinetic Cortex", "PL",
     "AI-based Cerebral Palsy detection and monitoring platform using computer vision analysis. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Lifebloom", "FR",
     "Mobility assistance technology for stroke rehabilitation and fall prevention. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("mjn-neuro", "ES",
     "Digital therapeutic platform for neurological disease management and patient engagement. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("NimBio", "IL",
     "Inflammatory disease detection device using breath analysis for non-invasive point-of-care diagnostics. EIT Health Catapult 2025 Alex Casta Audience Award winner.",
     None, None, "Edition 9 Alex Casta Audience Award winner", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/europes-top-health-start-ups-take-centre-stage-eit-health-catapult-winners-are-revealed-at-hlth-europe/"),
    ("NIMBLE Diagnostics", "ES",
     "Real-time stent monitoring system using miniaturised wireless sensors for cardiovascular patients. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Psycurio", "DE",
     "VR-based mental health platform for exposure therapy and anxiety disorder treatment. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("The Blue Box", "ES",
     "Breast cancer detection device using urine biomarker analysis for non-invasive early screening. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("Tympany Medical", "IE",
     "Surgical visualization technology providing real-time tissue characterization during ear surgery. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
    ("VitalSigns", "FI",
     "Digital diagnostic support tool using AI to assist clinicians in early sepsis and deterioration detection. EIT Health Catapult 2025 Healthtech semi-finalist.",
     None, None, "", "eit_health_catapult_2025",
     "https://eithealth.eu/news-article/eit-health-catapult-2024-25-selects-29-semi-finalists/"),
]

# ---------------------------------------------------------------------------
# EIT Climate-KIC — ClimAccelerator Carbon Removal cohort 2022 (cleantech)
# Source: https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/
# 9-month program; boot camp October 2022; all companies are early-stage CDR startups.
# Countries not published in the cohort announcement; country="" where not confirmed.
# ---------------------------------------------------------------------------

EIT_CLIMATE_KIC_CDR_2022 = [
    ("Airfix", "",
     "Early-stage carbon removal startup participating in the 2022 Carbon Removal ClimAccelerator programme.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Airbus Sinc", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Blue Horizon", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Carbonx Climate", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Carbon Atlantis", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("CEEZER", "DE",
     "Carbon marketplace platform connecting companies with high-quality carbon removal projects for corporate offsetting.",
     None, None, "Berlin-based carbon marketplace", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Cool", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("ENCHAR", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Green Sequest", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("GreenCap Solutions", "NO",
     "Carbon capture and storage solutions startup. 2022 ClimAccelerator CDR cohort participant.",
     None, None, "Norwegian company (AS suffix)", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("INVERTO", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Klimate.co", "",
     "Carbon removal investment and portfolio platform connecting corporates with carbon removal projects.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Maya Climate", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("MORFO", "",
     "Nature-based carbon removal through forest restoration using drone-seeding technology.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("NASKA robotics", "DE",
     "Robotics platform for automated nature-based carbon removal and reforestation operations.",
     None, None, "German company (GmbH suffix)", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Nellie Technologies", "",
     "Carbon removal technology startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Novocarbo", "",
     "Biochar production and carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Parallel Carbon", "",
     "Carbon removal and trading platform startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("PRONOE", "",
     "Carbon removal startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Sinkco Labs", "",
     "Carbon sink technology startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("SpiralBeam", "",
     "Carbon removal technology startup in the 2022 ClimAccelerator CDR cohort.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Tree.ly", "",
     "Platform connecting forest owners with corporate carbon buyers for nature-based carbon removal.",
     None, None, "country not confirmed in cohort announcement", "eit_climate_cdr_2022",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
]

# ---------------------------------------------------------------------------
# EIT Urban Mobility — investment portfolio (other)
# Source: https://www.eiturbanmobility.eu/our-impact/startup-portfolio/
# 127 companies in portfolio as of 2023; JS-filtered page limits to visible entries.
# equity_amount_eur always NULL (undisclosed).
# ---------------------------------------------------------------------------

EIT_URBAN_MOBILITY_PORTFOLIO = [
    ("A.D. Knight", "IL",
     "Improves pedestrian safety and traffic control by leveraging mobile phones and connected devices.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Äerd Lab", "LU",
     "Creates sustainable building materials by repurposing construction site waste into innovative products.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("AgeVolt", "SK",
     "Transforms public EV charging through a sharing economy approach for businesses.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Arxax", "GB",
     "Develops a digitally connected network of zero and low-carbon refuelling stations for heavy-duty vehicles.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("ASIMOB", "ES",
     "Provides data services evaluating road infrastructure conditions automatically for road authorities.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Asistobe", "NO",
     "AI-powered platform helping transit planners shift from reactive to predictive operations.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Asteroidea", "TN",
     "Delivers high-tech parking solutions across multiple facility types globally.",
     None, None, "equity amount undisclosed; Tunisia-based", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Autonomous Knight", "BE",
     "Develops camera systems to fast-track automation levels in time-critical manufacturing processes.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Beev", "FR",
     "Facilitates electric vehicle adoption without barriers, with complete transparency for fleet operators.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Bia Power", "ES",
     "Integrates renewable energy by connecting EVs as flexible grid capacity for demand response.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("BILMO", "BE",
     "Manufactures cargo bikes and trailers for professional last-mile delivery in urban areas.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Blike", "GB",
     "Offers flexible e-bike subscriptions with insurance and maintenance included for urban commuters.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Blowind", "ES",
     "Develops wind turbine generators integrated into vehicles enhancing electric vehicle range.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Bout", "FI",
     "Creates a centralised platform to connect passengers with water transportation services.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Bruntor", "LV",
     "Provides rapid last-mile urban delivery solutions using smart logistics.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Cargofive", "PT",
     "Enables freight forwarders to access digital evolution through cooperative quoting platform.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Cezigue", "FR",
     "Web platform connecting mobility-as-a-service providers with users for seamless transport booking.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Cyclecure", "BE",
     "Maintains electric two-wheelers through well-trained mechanics and data-driven operations.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("DeepVolt", "FR",
     "Uses AI for smart planning of electric vehicle charging infrastructure in cities.",
     None, None, "equity amount undisclosed; co-founded in France and Tunisia", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Delivery Couple", "PL",
     "Deploys autonomous courier robots for eco-friendly food and parcel delivery in cities.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("DIGAS", "LV",
     "Creates hydrogen and methane retrofit systems for heavy-duty and railway applications.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Don Cicleto", "ES",
     "Designs smart, modular bike and scooter parking solutions for cities and transit hubs.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
    ("Dreamwaves", "AT",
     "Offers audio-augmented reality navigation using spatial audio, eliminating the need to look at a map.",
     None, None, "equity amount undisclosed", "eit_urban_mobility_portfolio",
     "https://www.eiturbanmobility.eu/our-impact/startup-portfolio/"),
]

# ---------------------------------------------------------------------------
# EIT RawMaterials — startup portfolio (deeptech_hardware)
# Source: https://eitrawmaterials.eu/finance-fundraising/all-startups
# All equity_amount_eur=NULL (undisclosed); programme is KAVA Upscaling support.
# ---------------------------------------------------------------------------

EIT_RAWMATERIALS_PORTFOLIO = [
    ("AM 4 AM", "LU",
     "Develops and produces advanced metallic powders for 3D printing using eco-friendly cold plasma technology.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
    ("Blue Skies Minerals", "DE",
     "Transforms problematic mining waste into a scalable, permanent carbon sink via mineral carbonation.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
    ("Catalyco SIA", "LV",
     "Recovers high-purity raw materials from industrial waste, enabling circular reuse in catalysts and absorbents.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
    ("Circular Materials", "IT",
     "Specializes in recovery and valorization of heavy metals, precious metals and critical raw materials from waste.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
    ("Circular Silicon Europe", "DE",
     "Develops advanced recycling technologies to recover high-quality silicon from end-of-life solar panels.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
    ("CMMC", "DE",
     "Develops high-strength, wear-resistant aluminium matrix composites combining lightweight performance with durability.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
    ("Crystals Growing SIA", "LV",
     "Produces industrial crystals for laser applications using proprietary Low Temperature Gradient Technology.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
    ("Cybersolid", "SE",
     "Industrializes actively cooled 3D metal printing technology from academic research for complex component production.",
     None, None, "equity amount undisclosed", "eit_rawmaterials_portfolio",
     "https://eitrawmaterials.eu/finance-fundraising/all-startups/"),
]

# ---------------------------------------------------------------------------
# EIT Food RisingFoodStars — annual cohort (other / agrifoodtech)
# Source: eitfood.eu annual cohort announcements
# All grant_amount_eur=NULL (support programme, no cash prize).
# ---------------------------------------------------------------------------

EIT_FOOD_RFS_2021 = [
    # 16 companies — announced June 1, 2021
    # Source: https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family
    ("Kaffe Bueno", "DK",
     "Transforms coffee waste into bio-based ingredients for functional food, beverages, cosmetics and nutraceuticals.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("One Third", "NL",
     "Reduces supply chain food loss through AI-powered shelf-life forecasting for retailers and food producers.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("envoPAP", "GB",
     "Creates printing and packaging products from agricultural waste as a sustainable alternative to wood pulp.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Acoustic Extra Freezing", "FI",
     "Preserves frozen food with fresh-like quality using acoustic wave technology during the freezing process.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Nasekomo", "BG",
     "Manages insect farming for protein production using Black Soldier Fly genetics for sustainable animal feed.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("The Protein Brewery", "NL",
     "Novel microbial fermentation protein production methodology for sustainable alternative proteins.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Terra NutriTECH", "IE",
     "Delivers precision livestock nutrition via water systems, reducing antibiotic use in animal farming.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Computomics", "DE",
     "Develops climate-resilient crops through advanced plant breeding technology and genomic data analysis.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Vivent", "CH",
     "Provides early warning systems for crop stressors by measuring plant electrophysiology signals.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Fyteko", "BE",
     "Creates biobased molecules for crop protection and biostimulation in conventional and organic farming.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Soil Capital", "BE",
     "Digital platform incentivizing regenerative farming practices by monetizing soil carbon sequestration.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Farmforce", "NO",
     "Agricultural platform ensuring trust and traceability of food production for responsible sourcing.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Xnext", "IT",
     "Real-time industrial quality inspection technology using X-ray spectroscopy for food safety.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("OKO", "IL",
     "Climate insurance products for smallholder farmers using satellite data for parametric crop insurance.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("Plant Jammer", "DK",
     "AI-powered recipe system reducing food waste by suggesting recipes based on available ingredients.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
    ("EnginZyme", "SE",
     "Enzymatic biomanufacturing platform for prebiotic sugar production from renewable feedstocks.",
     None, None, "", "eit_food_rfs_2021",
     "https://www.eitfood.eu/news/risingfoodstars-welcomes-16-scaleups-to-its-family"),
]

EIT_FOOD_RFS_2022 = [
    # 14 companies — announced June 30, 2022
    # Source: https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association
    ("Verdify", "NL",
     "Creates personalised recipe platform using AI based on individual nutritional needs and health goals.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Complete Organics", "DE",
     "Produces fermented vegetables without preservatives or artificial additives for healthy gut nutrition.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Kern Tec", "AT",
     "Upcycles fruit pits (apricot, cherry, plum) into plant-based oils, proteins and flour ingredients.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Circular Food Technology", "DK",
     "Converts brewery spent grains into protein-rich flour for human consumption, reducing waste.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Farm21", "NL",
     "Provides data-driven farming optimization tools combining IoT sensors and satellite data for precision agriculture.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Bee Smart Technologies", "BG",
     "Develops IoT solutions for precision beekeeping and colony health monitoring.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Seed-X", "IL",
     "Uses AI and computer vision for seed quality prediction and sorting to improve agricultural yields.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Ace Aquatec", "GB",
     "Applies technology to improve welfare, productivity and sustainability in aquaculture operations.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Aliga", "DK",
     "Produces functional Chlorella algae ingredients for food and feed applications.",
     None, None, "also listed as Aliga Aps", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Happy Ocean Foods", "DE",
     "Makes plant-based whole-cut shrimp alternatives using seaweed and konjac.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Mushlabs", "DE",
     "Creates mushroom mycelium-based meat alternatives from food industry by-products.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("CUBIQ FOODS", "ES",
     "Develops foods enriched with accessible Omega-3 fat using structured lipid technology.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("NEMIS Technologies", "CH",
     "Offers lab-free microbiological detection for food safety using rapid biosensor technology.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
    ("Delicious Data", "DE",
     "Uses machine learning to predict catering sales and reduce food waste in professional kitchens.",
     None, None, "", "eit_food_rfs_2022",
     "https://www.eitfood.eu/news/eit-food-announces-newest-agrifood-tech-scaleups-to-join-the-risingfoodstars-association"),
]

EIT_FOOD_RFS_2023 = [
    # 13 companies — announced May 31, 2023; only 3 named in article
    # Source: https://www.eitfood.eu/news/new-cohort-agrifood-startups-2023
    ("Bosque Foods", "DE",
     "Creates next-generation whole-cut meat alternatives using fungus-derived mycelium for premium applications.",
     None, None, "", "eit_food_rfs_2023",
     "https://www.eitfood.eu/news/new-cohort-agrifood-startups-2023"),
    ("Onego Bio", "FI",
     "Developed a way to produce egg white protein without chickens using precision fermentation.",
     None, None, "", "eit_food_rfs_2023",
     "https://www.eitfood.eu/news/new-cohort-agrifood-startups-2023"),
    ("FreshSens", "TR",
     "AI-powered platform predicting and extending shelf life of fruits and vegetables after harvest to prevent food waste.",
     None, None, "", "eit_food_rfs_2023",
     "https://www.eitfood.eu/news/new-cohort-agrifood-startups-2023"),
]

EIT_FOOD_RFS_2024 = [
    # 14 companies — announced June 11, 2024
    # Source: https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability
    ("SeedForward", "DE",
     "Substitutes synthetic agrochemicals with bio-based seed treatments, biostimulants and bio-based plant protection products.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Notpla", "GB",
     "Creates sustainable packaging from seaweed and plant materials that biodegrades naturally within weeks.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Ficosterra", "ES",
     "Develops seaweed-based prebiotics and probiotics to enhance crop growth while sequestering carbon.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Carbone Farmers", "FR",
     "Platform enabling stakeholders to support farmers transitioning to low-carbon regenerative agricultural practices.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Meala Foodtech", "IL",
     "Creates innovative food ingredients and processes for cleaner, healthier products with reduced environmental footprint.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("MyEasyFarm", "FR",
     "Manages agricultural data from multiple sources (fields, satellites, drones) to optimize crop cycles and reduce inputs.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Neggst Foods", "DE",
     "Develops plant-based whole egg alternatives using legume-based recipes with biodegradable shell.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Matr Foods", "DK",
     "Produces microbial-based plant meat alternatives with natural umami flavour from local plant ingredients.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Evja", "IT",
     "Offers an agri-climatic intelligence system (OPI) for optimising irrigation, nutrition and crop protection.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Those Vegan Cowboys", "BE",
     "Manufactures animal-free milk and cheese products using precision fermentation of dairy proteins.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("AgroLeague", "FR",
     "Builds a social platform connecting farmers with real-time diagnostic services and agronomic expertise.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("NoPalm Ingredients", "NL",
     "Creates sustainable microbial oils as palm oil substitutes by fermenting food industry side streams.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Bon Vivant", "FR",
     "Uses precision fermentation to produce dairy proteins without animals for cheese and yogurt applications.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
    ("Cultivated Biosciences", "CH",
     "Develops creamy fat ingredients for animal-free cheese and yogurt products using yeast fermentation.",
     None, None, "", "eit_food_rfs_2024",
     "https://www.eitfood.eu/news/eit-food-risingfoodstars-announces-new-cohort-of-agrifood-scaleups-to-address-long-term-food-sustainability"),
]

EIT_FOOD_RFS_2025 = [
    # 16 companies — announced June 2025
    # Source: https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/
    ("FA Bio", "GB",
     "Develops biofungicides and biostimulants using soil microbiome diversity to discover fungal-based crop health products.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Resurrect Bio", "GB",
     "Engineers disease resistance in crops by leveraging AI and synthetic biology to restore native plant resistance genes.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("AgroSustain", "CH",
     "Provides biological crop protection solutions that extend shelf life and reduce post-harvest losses.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Hudson River Biotechnology", "NL",
     "Applies CRISPR technology to enhance crop resilience and nutritional quality for sustainable agriculture.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("CroBio", "GB",
     "Creates microbial soil amendments improving water retention and drought tolerance in crop production.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Clean Food Group", "GB",
     "Produces sustainable single-cell oils from food waste via fermentation as palm oil and fish oil alternatives.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("ImaginDairy", "IL",
     "Manufactures animal-free dairy proteins using AI-designed precision fermentation strains.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("PFx Biotech", "PT",
     "Leverages precision fermentation to produce specialty bioactive proteins for functional food applications.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Kokomodo", "IL",
     "Grows climate-resilient cacao in controlled environments using cellular agriculture for cocoa alternatives.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Celleste Bio", "IL",
     "Produces cocoa butter and powder from cell culture technology without deforestation.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("KÄÄPÄ Biotech", "FI",
     "Develops functional mushroom products and organic extracts for health and nutrition applications.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Perfat Technologies", "FI",
     "Creates healthy fat substitutes using oleogel technology structuring liquid oils into solid formats.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Adamo Foods", "GB",
     "Manufactures whole-cut meat from fungi using proprietary fiber alignment structures for realistic texture.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("ProteinDistillery", "DE",
     "Converts fermentation byproducts (brewer's yeast) into proteins for food and feed applications.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Greentech", "NO",
     "Transforms food processing by-products into high-value feed ingredients and organic fertilizers.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
    ("Kelpi", "GB",
     "Develops biodegradable seaweed-based coatings for food packaging to replace single-use plastics.",
     None, None, "", "eit_food_rfs_2025",
     "https://worldbiomarketinsights.com/eit-food-risingfoodstars-announces-its-2025-cohort/"),
]

# ---------------------------------------------------------------------------
# Sprint 10 backfill (2026-05-25): thin-source enrichment per user feedback
# ---------------------------------------------------------------------------

# EIT InnoEnergy 2024 — partial (only 2 of 14 named in public coverage)
# Source: https://innoenergy.com/news-events/a-look-back-at-2024-e4-3b-raised-for-cleantech-portfolio-and-other-key-achievements/
EIT_INNOENERGY_HIGHWAY_2024 = [
    ("Geolinks", "FR",
     "French deeptech start-up advancing carbon capture monitoring; €1.5M EIT InnoEnergy investment in 2024.",
     None, None, "equity amount: €1.5M EIT InnoEnergy share of round", "eit_innoenergy_2024",
     "https://innoenergy.com/news-events/a-look-back-at-2024-e4-3b-raised-for-cleantech-portfolio-and-other-key-achievements/"),
    ("Repono", "",
     "Energy storage operator targeting 100 GWh of energy storage deployment in Europe by 2030 to stabilise the renewable grid.",
     None, None, "country not determined; pan-European operating model", "eit_innoenergy_2024",
     "https://innoenergy.com/news-events/a-look-back-at-2024-e4-3b-raised-for-cleantech-portfolio-and-other-key-achievements/"),
]

# EIT Climate-KIC Carbon Dioxide Removal ClimAccelerator 2023 (22 startups)
# Source: https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/
EIT_CLIMATE_KIC_CDR_2023 = [
    ("Airfix", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Airbus Sinc", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Blue Horizon", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Carbonx Climate", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Carbon Atlantis", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("CEEZER", "DE", "Carbon credit marketplace platform.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Cool", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("ENCHAR", "", "Biochar-based carbon removal startup.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Green Sequest", "", "Carbon sequestration startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("GreenCap Solutions", "NO", "Direct air capture systems for indoor CO2 control combined with permanent carbon storage.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("INVERTO", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Klimate.co", "DK", "Carbon removal portfolio platform for corporates seeking net-zero pathways.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Maya Climate", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("MORFO", "FR", "Large-scale ecosystem restoration using drone-based seed dispersal and aerial reforestation.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("NASKA Robotics", "", "Robotic carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Nellie Technologies", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Novocarbo", "DE", "Biochar carbon removal at industrial scale.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Parallel Carbon", "GB", "Electrochemical direct air capture using low-cost mineral feedstocks.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("PRONOE", "FR", "Ocean-based carbon removal using electrochemical processes to enhance alkalinity.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Sinkco Labs", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("SpiralBeam", "", "Carbon removal startup in the CDR ClimAccelerator 2023 cohort.",
     None, None, "country not determined", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
    ("Tree.ly", "AT", "Forest carbon monetisation platform connecting European forest owners with carbon buyers.",
     None, None, "", "eit_climate_cdr_2023",
     "https://carbonherald.com/22-startups-join-the-carbon-removal-climaccelerator-program/"),
]

# EIT Climate-KIC Amazon Sustainability Accelerator 2024 (16 startups)
# Source: https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/
EIT_CLIMATE_KIC_ASA_2024 = [
    ("Descycle", "GB", "Metal processing technology company developing novel and low-impact solutions using revolutionary chemistry.",
     None, None, "ASA Recycling Technologies cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Induo", "FR", "Textile recycling technology turning used textiles into brand new apparel.",
     None, None, "ASA Recycling Technologies cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Matoha", "GB", "Material identification devices that help with efficient waste sorting.",
     None, None, "ASA Recycling Technologies cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Polyperception", "BE", "Platform providing real-time, end-to-end waste flow monitoring to plastics and material recovery facilities.",
     None, None, "ASA Recycling Technologies cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Sorted", "GB", "AI-powered solutions to help waste management companies sort their recyclable materials.",
     None, None, "ASA Recycling Technologies cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Terrawaste", "NL", "Chemical recycling technology turning non-recyclable dry, wet and mixed plastic waste into valuable, carbon-negative materials.",
     None, None, "ASA Recycling Technologies cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Bo", "GB", "Urban e-scooter company with world-first riding technology, building efficient commuter vehicles.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("FUNQ", "ES", "Syrup-based soft drink allowing tap water to be turned into a beverage, reducing shipping of water.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Infinite Athletica", "ES", "Circular sportswear company turning sport waste into garments for the same sport.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Nimbi", "GB", "Compostable razor using revolutionary biomaterials.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Milky Plant", "GB", "Device allowing people to create their own plant-based milk at home, reducing the need to ship cartons.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Open Funk", "DE", "Sustainable high-performance compact kitchen mixer designed for glass jars.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Papair", "DE", "Recycled paper bubble wrap providing a sustainable packaging alternative to conventional bubble wrap.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Seep", "GB", "Plastic-free sponges, cloths and other household essentials.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("Tangle", "GB", "Sustainable dog products such as collars, leashes and toys made from upcycled ghost fishing nets.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
    ("We Do Solar", "DE", "Smart solar set designed for balcony installation.",
     None, None, "ASA Consumer Products cohort", "eit_climate_asa_2024",
     "https://climaccelerator.climate-kic.org/news/new-start-ups-join-the-amazon-sustainability-accelerator/"),
]

# EIT Climate-KIC Clean Cities Spain ClimAccelerator 2024 (12 startups)
# Source: https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/
EIT_CLIMATE_KIC_CLEAN_CITIES_SPAIN_2024 = [
    ("LightMirror", "PL", "Reflective panels that bring sunlight into hospitals and nursing homes to reduce artificial lighting demand.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Danu Robotics", "GB", "Industrial-scale robotic waste management system using AI to automate the entire sorting process.",
     None, None, "Scotland-based", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Agua de Sol", "FR", "Transforms air into water using solar heat via a simple modular panel for water-scarce regions.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("STONE161", "ES", "Sustainable landscape development with nature-based designs following circular economy principles.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Tierra", "ES", "Sustainable kilometer-zero alternative for the production of vegetables and mushrooms using intelligent, automated vertical farms.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Folgrid", "ES", "Agrivoltaic technology using divergent lenses to maximise land use while generating clean energy.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Fluviq", "ES", "AI-powered sensor system optimising irrigation in parks, fields and crops to minimise drought impact.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Suntropy", "ES", "Operating system for renewable energy companies covering design, analysis, maintenance and project management.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Dedalo AI", "IT", "AI platform helping digital companies monitor, reduce and communicate energy use and CO2 emissions.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Carbonfields", "FR", "Conversion technology transforming biomass waste into bioproducts.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("Ecolation", "DE", "High-performance insulating materials that absorb CO2 emissions, for buildings and industry.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
    ("KlimaShift", "NL", "AI-powered decarbonisation platform for small businesses to reduce energy costs and emissions.",
     None, None, "", "eit_climate_ccs_2024",
     "https://climaccelerator.climate-kic.org/news/clean-cities-spain-climaccelerator-2024-cohort/"),
]

# EIT Urban Mobility 2022 — 62 startups across 5 accelerator programmes
# Source: https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/
EIT_URBAN_MOBILITY_2022 = [
    # 5G Turbo (20)
    ("AD Knight", "IL", "5G-based pedestrian safety and traffic control via mobile phones.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Andronebula", "ES", "5G connectivity for electric mobility.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Cezigue", "FR", "Connected services platform for in-vehicle providers and businesses.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("DotDot", "FR", "5G services for mobility.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("EOS Smart Connectivity", "ES", "Connectivity services for urban mobility.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("EVOURBE", "ES", "5G-enabled urban mobility technology.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("ITC Intelligent Traffic Control", "", "Traffic management via 5G.",
     None, None, "5G Turbo cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Lokit Technology", "IT", "5G connectivity solutions.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Longship IT Solutions", "NL", "5G technology platform for logistics.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Meredot", "", "5G-based wireless charging for e-mobility.",
     None, None, "5G Turbo cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Motoblockchain", "", "Blockchain and 5G integration for mobility.",
     None, None, "5G Turbo cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("OtoRobotics", "PL", "Autonomous delivery robotics.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("PANTOhealth", "DE", "Train parts efficiency software using IoT.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Park4Dis", "", "Accessible parking solutions.",
     None, None, "5G Turbo cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("roboGaze", "", "Computer vision for mobility.",
     None, None, "5G Turbo cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Runvido", "", "5G-based mobility platform.",
     None, None, "5G Turbo cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Scoobic Urban Mobility", "ES", "Modular light commercial e-vehicles for urban delivery.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Social Tech Projects", "DK", "Community-focused tech platform for urban mobility.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("YourParking", "HU", "Smart parking technology.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("ZenParking Smart Parking", "RO", "Parking management solutions.",
     None, None, "5G Turbo cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    # E+ Mobility (12)
    ("BAVERTIS", "", "E-mobility energy and battery-swap solutions.",
     None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("CityQ", "NO", "Car-bike: 4-wheel electric pedal-assist vehicle for urban transport.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("DeepDrive", "DE", "Dual-rotor in-wheel EV drive motor with higher efficiency and lower material use.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Deftpower", "NL", "Smart EV charging platform connecting drivers to dynamic energy tariffs.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("fronyx", "DE", "Predictive EV charging optimisation software.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Gocleer", "", "Shared mobility services platform.",
     None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Hergele Mobility", "TR", "Electric utility vehicle e-mobility solutions.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Honeycomb Network", "GB", "Connectivity infrastructure for shared mobility fleets.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Hydrogen First", "PL", "Hydrogen-powered urban mobility solutions.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("VI&GO", "", "Shared mobility platform.",
     None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Luna Systems", "IE", "Computer vision safety platform for shared e-scooters and micro-mobility.",
     None, None, "E+ Mobility cohort; trades as Zentrack Ltd", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Zipforce", "SE", "Aftermarket e-bike conversion kit.",
     None, None, "E+ Mobility cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    # Energy and Public Realm (10)
    ("Famous Crusade", "PT", "Urban energy and mobility integration platform.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Greenele", "FI", "Green energy services for urban mobility.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("IO-Dynamics", "DE", "Charging-as-a-service for fleets and public space EV deployments.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Karikrea", "ES", "Urban mobility and public realm design.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Levante", "", "Sustainable urban solutions for the public realm.",
     None, None, "Energy and Public Realm cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("MinervaS", "IT", "Energy-efficient driver behaviour analytics.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("MissCar", "ES", "Car-sharing solutions targeting women drivers.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("RoMobility", "RO", "Urban mobility services.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Tirn Technology", "SK", "Sustainable transportation technology.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("velow", "DE", "Electric cargo bikes and micro-mobility solutions.",
     None, None, "Energy and Public Realm cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    # Sustainable City Logistics (10)
    ("Everimpact", "FR", "CO2 measurement and offset platform for cities and freight operators.",
     None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Fast Trek", "", "Last-mile delivery solutions.",
     None, None, "Sustainable City Logistics cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Mily Technologies", "RS", "City logistics optimisation and route planning.",
     None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("MOBIQU", "", "Mobility and logistics platform.",
     None, None, "Sustainable City Logistics cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("NeWay", "", "Sustainable logistics network.",
     None, None, "Sustainable City Logistics cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Optiyol", "TR", "Route optimisation for last-mile deliveries.",
     None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("pickshare", "DE", "Shared logistics platform for community pick-up.",
     None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("RiDERgy", "DE", "AI-optimised EV charging schedules for delivery fleets.",
     None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Sensorita", "NO", "IoT-based waste logistics monitoring.",
     None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("tOURmix Delivery", "HU", "Delivery route optimisation for SMEs.",
     None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    # UAM Plazza – Urban Air Mobility (10)
    ("AldoraTech", "ES", "Cargo drone manufacturer for medical and industrial deliveries.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Cargo Drone", "FR", "Cargo delivery drones for urban air mobility.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("DELIVRONE", "FR", "Drone delivery services for the last mile.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("eMagic Aircraft", "DE", "Hybrid-electric aircraft technology for regional UAM.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Finova Aviation", "GB", "Hybrid-electric aviation propulsion for short-haul flights.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Fusion Engineering", "NL", "Drone flight control software for safer autonomous operations.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("H2 Dron Energy", "ES", "Hydrogen-powered drone propulsion systems.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("OmniOpti", "", "UAM optimisation software.",
     None, None, "UAM Plazza cohort; country not determined", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Sorair Technologies", "GB", "Urban air mobility software platform.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
    ("Weslax", "DE", "UAM technology and aircraft component manufacturing.",
     None, None, "UAM Plazza cohort", "eit_urban_mobility_2022",
     "https://www.eiturbanmobility.eu/discover-the-selected-startups-of-the-accelerator-programmes-2022/"),
]

# EIT Urban Mobility 2023 — 86 startups across 8 accelerator programmes
# Source: https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/
EIT_URBAN_MOBILITY_2023 = [
    # Scale-up Programme 2023 (12)
    ("IMPARGO", "DE", "Cargo logistics solutions for SMEs.", None, None, "Scale-up cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("SparkPARK", "", "Parking management technology.", None, None, "Scale-up cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Ridergy", "DE", "AI-optimised EV charging schedules.", None, None, "Scale-up cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Hybrid Lidar", "", "Lidar sensing technology.", None, None, "Scale-up cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Roadia", "", "Road infrastructure solutions.", None, None, "Scale-up cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Triply", "AT", "Multimodal trip planning for events.", None, None, "Scale-up cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Parkunload", "ES", "Smart loading-zone management for cities.", None, None, "Scale-up cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Comodif", "FR", "Freight logistics platform.", None, None, "Scale-up cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Lade", "DE", "Smart EV charging hardware and software.", None, None, "Scale-up cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Walking Talking", "", "Pedestrian wayfinding for visually impaired.", None, None, "Scale-up cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("AviBike (BLOCK)", "HU", "Micro-mobility battery platform.", None, None, "Scale-up cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    # Accelerate2MOVE Future Mobility 2023 (12)
    ("Asistobe", "NO", "AI public-transport planning frontend.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Boreal Bikes", "DE", "Off-road and gravel e-bikes.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("CycleAI", "PT", "Cycling safety analytics.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Drop DAO", "RO", "Decentralised courier delivery network.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Fruittorg", "", "Urban delivery platform.", None, None, "Future Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("GaiaHub", "EE", "Sustainable mobility hub for urban areas.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Link Robotik Teknolojileri", "TR", "Robotic urban mobility solutions.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Moveree", "", "Mobility sharing platform.", None, None, "Future Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("TechNovator", "", "Wireless power transfer for vehicles.", None, None, "Future Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("UDX Research", "CZ", "Mobility research and simulation.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Urban Monkeys", "DE", "Micro-mobility booking app.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Vivadrive", "PL", "Electric fleet TCO analytics for businesses.", None, None, "Future Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    # Better Mobility Accelerator – Inclusive 2023 (12)
    ("3FINERY", "GB", "Inclusive mobility design services.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Artificient Mobility Intelligence", "DE", "AI-driven mobility intelligence.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Bellavi Software", "SE", "Accessibility software for transport providers.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Cocoon Airbag Protection", "SE", "Wearable airbag protection for cyclists and riders.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Cyclebee", "DE", "Cycling app platform for safe routes.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("EOOS NEXT", "AT", "Inclusive design for shared mobility hardware.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("LendoCare", "", "Mobility-aid lending services.", None, None, "Inclusive Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Nemi Mobility Solutions", "ES", "Software for demand-responsive public transport in low-density areas.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Omni Audio", "", "Audio-based mobility assistance for visually impaired.", None, None, "Inclusive Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("White Jacket Global", "ES", "Accessible transport platform.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Workride", "DE", "Employee commute and bike-leasing solutions.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    # E+ Mobility Accelerator 2023 (10)
    ("Closebattery Logistics", "ES", "Battery delivery logistics (trading as full&fast).", None, None, "E+ Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("ecoDeliver", "", "Crowdsourced sustainable delivery network.", None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Electric Vehicle Ecosystem", "", "EV platform services.", None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Iomob", "ES", "Mobility-as-a-service platform.", None, None, "E+ Mobility cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("QOOB", "", "Compact urban EV concept.", None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("SWITCH", "", "EV charging network.", None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Wikimove", "", "Mobility information aggregation platform.", None, None, "E+ Mobility cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    # Energy & Public Realm 2023 (10)
    ("2C", "IT", "Public realm mobility integration.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Campfire Solutions", "DE", "Energy-mobility integration platform.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Cellgrid", "", "Energy grid solutions for EV charging.", None, None, "Energy & Public Realm cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Deveci Tech", "TR", "Smart mobility technology.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Future Power Fund", "DE", "Public-space charging infrastructure.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Go Rolloe", "GB", "Pollution-filtering bike wheels.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("INRES", "TR", "Renewable energy and mobility systems.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("RWInnoTec", "DE", "Innovation services for urban mobility.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("SurplusMap", "NO", "Mapping platform for renewable energy and grid capacity.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("WeCreate", "DE", "Public realm design solutions.", None, None, "Energy & Public Realm cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    # Smart Mobility – DMS 2023 (10)
    ("Carbmee", "DE", "Carbon accounting platform for industrial supply chains.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Brightmerge", "IL", "Smart microgrid mobility integration.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("i4drive", "", "Connected vehicle data platform.", None, None, "Smart Mobility DMS cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Luchs Security", "DE", "Mobility security and access control.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Anyroutes", "", "Route optimisation software.", None, None, "Smart Mobility DMS cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("The Tyre Collective", "GB", "Tyre wear capture device to reduce particulate pollution.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Terra", "PL", "Mobility analytics platform.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Clearly", "", "Emissions tracking platform.", None, None, "Smart Mobility DMS cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("XENSE Vision", "SE", "Vision-based mobility analytics.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Novac", "RO", "Supercapacitor mobility energy storage.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    # Sustainable City Logistics 2023 (10)
    ("ANET360", "HU", "Road safety solutions (British-Hungarian Road Safety PLC).", None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("BUDDY Service Iberia", "ES", "Last-mile delivery services.", None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("CommuteSaver", "", "Employer-led commute optimisation platform.", None, None, "Sustainable City Logistics cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Keet", "", "AI-driven logistics platform.", None, None, "Sustainable City Logistics cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("IntegrtiyKEY", "RO", "Supply chain access control solutions.", None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Omniloop", "SE", "Circular logistics platform.", None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Revoltz", "", "Electric vehicle logistics fleet.", None, None, "Sustainable City Logistics cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Sade", "", "Delivery route optimisation.", None, None, "Sustainable City Logistics cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("SHARE", "IT", "Shared mobility logistics platform.", None, None, "Sustainable City Logistics cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    # UAM Plazza 2023 (10)
    ("ABzero", "IT", "Autonomous medical-delivery drones.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("ARC Aerosystems", "GB", "Autonomous aerial systems.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Connect Robotics", "PT", "Autonomous robotics for last-mile drone delivery.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("DM-AirTech", "DE", "Air mobility technology integrator.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("PrimeCor Systems", "ES", "Urban air mobility systems.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("Skycharge", "DE", "Drone landing pad and contact-charging hardware.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("StratoWave Connect", "HR", "Stratospheric connectivity for UAM.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("The Edge Company", "IT", "Edge mobility computing solutions.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("UP&CHARGE", "", "Drone charging infrastructure.", None, None, "UAM Plazza cohort; country not determined", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
    ("VOLARE", "DE", "Urban air mobility platform.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2023",
     "https://www.eiturbanmobility.eu/discover-the-selected-start-ups-of-the-accelerators-and-scale-up-programmes-2023/"),
]

# EIT Urban Mobility 2024 — 63 startups across 6 programmes
# Source: https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/
EIT_URBAN_MOBILITY_2024 = [
    # Future Mobility – Accelerate2MOVE (13)
    ("Bikademy", "", "Mobility solutions provider.", None, None, "Future Mobility cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("HOBACA", "HR", "Advanced urban mobility technology.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Intellectra Technologies", "", "Smart mobility tech solutions.", None, None, "Future Mobility cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("IoMobility Solutions", "CZ", "IoT mobility platform.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Mass Master", "HR", "Urban mobility innovation.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("MERVE AYDINER INVAMAR", "TR", "Inclusive transportation solutions.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("OptiVlak", "EE", "Smart freight mobility.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Peak Energy", "SE", "Energy solutions for mobility.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Remea", "HR", "Mobility innovation startup.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Rhino R / Bruntor", "IS", "Stand-up last-mile urban delivery vehicle.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("SMARTIR Cozum Teknolojileri", "TR", "Smart mobility solutions.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Urban Vind", "NL", "Urban wind energy for mobility.", None, None, "Future Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("VOLTAAGE.IO", "", "EV charging infrastructure.", None, None, "Future Mobility cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    # Better Mobility Accelerator – Inclusive (12)
    ("BIEL GLASSES", "ES", "AR glasses for visually impaired pedestrians.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("DAAV", "CH", "Inclusive transportation services.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Dych Go", "ES", "Accessible mobility solutions.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Eightpins – Lupaan", "DE", "Adjustable seat-post technology for cycling accessibility.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Keita Mobility Factory", "ES", "Inclusive transport solutions.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Leezen Heroes", "DE", "Cycling mobility solutions.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Mobility Signage", "DE", "Inclusive mobility information signage.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("MOXI", "DE", "Urban inclusive mobility services.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Seventh Sense", "EE", "Mobility accessibility technology.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Smart Serial Number", "", "Asset tracking for mobility devices.", None, None, "Inclusive Mobility cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("velulo", "DE", "Cycling and micro-mobility solutions.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("vionmo", "AT", "Mobility platform.", None, None, "Inclusive Mobility cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    # Scale-up Programme 2024 (12)
    ("AgeVolt", "SK", "Sharing-economy public EV charging.", None, None, "Scale-up cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("AVIANT", "NO", "Advanced mobility technology.", None, None, "Scale-up cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("BIB BATTERIES", "FR", "Battery technology for vehicles.", None, None, "Scale-up cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("DeepVolt", "TN", "Smart EV charging infrastructure planning via AI.", None, None, "Scale-up cohort; FR/TN dual-HQ", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("DOTLUMEN", "RO", "Smart mobility lighting and assistive glasses.", None, None, "Scale-up cohort; also known as .lumen", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("E-CAFE BIKE (CITY COMMUTERS)", "CZ", "Electric bike sharing.", None, None, "Scale-up cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Flasher", "DE", "Smart mobility safety lighting.", None, None, "Scale-up cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("FlightOps", "", "Operational mobility solutions.", None, None, "Scale-up cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Make My Day", "", "Mobility planning application.", None, None, "Scale-up cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Rhyde.co", "ES", "Ride-sharing platform.", None, None, "Scale-up cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("SiPow", "NO", "Power solutions for mobility.", None, None, "Scale-up cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    # Smart Mobility – DMS 2024 (10)
    ("AIRY Automotive", "DK", "Smart automotive HVAC technology.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("APFIE CI", "", "Connected insurance solutions.", None, None, "Smart Mobility DMS cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("ivilion", "DE", "Smart mobility services.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Leo Drive", "TR", "AI-driven autonomous mobility software.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Maaind", "", "Smart mobility analytics.", None, None, "Smart Mobility DMS cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Nemodata", "", "Data solutions for mobility.", None, None, "Smart Mobility DMS cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Reefilla", "IT", "Mobile EV-charging power packs for sustainable on-demand charging.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Rider Dome", "IL", "Rider safety AI camera for two-wheelers.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("royos joining solutions", "AT", "Bonding and joining technology for lightweight mobility.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Ventus Technologies", "DE", "Smart mobility innovation.", None, None, "Smart Mobility DMS cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    # Sustainable Cities and Clean Mobility 2024 (10)
    ("Adiabat Technologies", "ES", "Sustainable temperature-controlled packaging for deliveries.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Basetrack", "EE", "Fleet tracking and optimisation.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Cellz", "FI", "Battery technology for clean mobility.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Ecoist", "SE", "Sustainable urban transport platform.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Green Independence", "", "Clean energy mobility solutions.", None, None, "Sustainable Cities cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Greenmile Mobility", "TR", "Sustainable urban logistics.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("INFINITE", "", "Clean mobility solutions.", None, None, "Sustainable Cities cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Latitudo 40", "IT", "Satellite geospatial analytics for urban logistics.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Peyk", "GB", "Last-mile crowdsourced delivery platform.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("RouteZero", "GB", "Sustainable urban logistics platform.", None, None, "Sustainable Cities cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    # Urban Air Mobility Plazza 2024 (6)
    ("432 Technologies", "", "Urban air mobility innovation.", None, None, "UAM Plazza cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Aerix Systems", "", "Aircraft technology for UAM.", None, None, "UAM Plazza cohort; country not determined", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Avy", "NL", "Hybrid VTOL aircraft for emergency and medical delivery.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("First Airborne", "IL", "Advanced air mobility infrastructure.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Maple Aviation", "DE", "Urban air mobility operations.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
    ("Skypuzzler", "DK", "Urban air mobility technology.", None, None, "UAM Plazza cohort", "eit_urban_mobility_2024",
     "https://www.eiturbanmobility.eu/63-startups-selected-for-the-accelerators-and-scale-up-programmes-2024/"),
]

# Combine all event data lists in call order
_ALL_RAW_EVENTS: list[tuple] = (
    EIT_DIGITAL_CHAMPIONS_2021
    + EIT_DIGITAL_CHAMPIONS_2022
    + EIT_DIGITAL_VAP_2022
    + EIT_DIGITAL_CHAMPIONS_2023
    + EIT_DIGITAL_CHAMPIONS_2024
    + EIT_DIGITAL_CHAMPIONS_2025
    + EIT_MFG_INVESTMENTS
    + EIT_MFG_BOOSTUP_2021
    + EIT_MFG_BOOSTUP_2023
    + EIT_MFG_BOOSTUP_2024
    + EIT_INNOENERGY_HIGHWAY_2021
    + EIT_INNOENERGY_HIGHWAY_2022
    + EIT_INNOENERGY_HIGHWAY_2023
    + EIT_HEALTH_CATAPULT_2022
    + EIT_HEALTH_CATAPULT_2023
    + EIT_HEALTH_CATAPULT_2024
    + EIT_HEALTH_CATAPULT_2025
    + EIT_CLIMATE_KIC_CDR_2022
    + EIT_URBAN_MOBILITY_PORTFOLIO
    + EIT_RAWMATERIALS_PORTFOLIO
    + EIT_FOOD_RFS_2021
    + EIT_FOOD_RFS_2022
    + EIT_FOOD_RFS_2023
    + EIT_FOOD_RFS_2024
    + EIT_FOOD_RFS_2025
    # Sprint 10 backfill (2026-05-25)
    + EIT_INNOENERGY_HIGHWAY_2024
    + EIT_CLIMATE_KIC_CDR_2023
    + EIT_CLIMATE_KIC_ASA_2024
    + EIT_CLIMATE_KIC_CLEAN_CITIES_SPAIN_2024
    + EIT_URBAN_MOBILITY_2022
    + EIT_URBAN_MOBILITY_2023
    + EIT_URBAN_MOBILITY_2024
)


def _build_events() -> list[dict]:
    rows: list[dict] = []
    for (company_name, country, description, grant_eur, equity_eur,
         notes, call_key, source_url) in _ALL_RAW_EVENTS:
        src_id, awarded_date = CALL_TO_SOURCE[call_key]

        # What kind of capital this cohort received, declared per cohort.
        # KeyError, deliberately unguarded: a new cohort must state what it
        # hands out before its rows can load. See COHORT_CAPITAL_BASIS.
        basis = COHORT_CAPITAL_BASIS[src_id]

        slug = re.sub(r"[^a-z0-9]+", "_", company_name.lower()).strip("_")
        # For BoostUp, include region from notes to keep call_ids unique across regions
        if "region:" in notes:
            region_slug = re.sub(r"[^a-z0-9]+", "_",
                                 notes.split("region:")[-1].split(";")[0].strip().lower()).strip("_")
            call_id = f"{src_id}_{slug}_{region_slug}"
        else:
            call_id = f"{src_id}_{slug}"

        rows.append({
            "source": src_id,
            "call_id": call_id,
            "company_name": company_name,
            "country": country.upper() if country else "",
            "description": description,
            "grant_eur": grant_eur,
            "equity_eur": equity_eur,
            "awarded_date": awarded_date,
            "source_url": source_url,
            "grant_amount_basis": basis,
            "project_summary": notes,
        })
    return rows


def extract_all() -> list[dict]:
    rows = _build_events()
    print(f"Extracted {len(rows)} EIT KIC events from hardcoded data")
    from collections import defaultdict
    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[r["source"]] += 1
    for src in sorted(counts):
        print(f"  {src:<45}  {counts[src]:>3}")
    return rows


# ---------------------------------------------------------------------------
# Name normalisation (mirrors extract_chips_ju.py)
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|"
    r"SAS|SARL|SASU|SCA|"
    r"SRL|S\.r\.l\.|SpA|S\.p\.A\.|Srls|SCPA|"
    r"SRO|s\.r\.o\.|"
    r"SL|SLU|SLL|SLNE|SAU|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|"
    r"AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|"
    r"DOO|d\.o\.o\.|DD|UAB|OOO|"
    r"Lda|CRL|Scrl|"
    r"EE|IKE|"
    r"Zrt|Kft|Nyrt|"
    r"SE|SA)\b",
    re.IGNORECASE,
)
_NORM_PAREN_RE = re.compile(r"\([^)]*\)")
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_PAREN_RE.sub(" ", s)
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# ---------------------------------------------------------------------------
# 5-tier company matching (mirrors extract_chips_ju.py)
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country", "matched_company_id",
    "matched_canonical_name", "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(
    rows: list[dict], conn
) -> tuple[list[dict], list[dict]]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies ORDER BY canonical_name COLLATE \"C\", country COLLATE \"C\" NULLS FIRST, id")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    by_name_only: dict[str, list[tuple[str, int, str]]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        cntry_up = (cntry or "").upper()
        existing[(norm, cntry_up)] = (row_id, cname)
        existing_list.append((norm, cntry_up, row_id, cname))
        by_name_only.setdefault(norm, []).append((cntry_up, row_id, cname))

    enriched: list[dict] = []
    summary: list[dict] = []

    for r in rows:
        raw_name = r["company_name"]
        country = (r["country"] or "").upper()
        # Canonicalise to Europe scope; a non-empty country that resolves to None
        # is a genuine out-of-scope KIC partner (IL/TR/TN) → skip so the scope
        # trigger doesn't abort the whole load. Empty country stays empty (allowed).
        canon = canonicalise_country(country)
        if canon is None and country:
            continue
        country = canon or ""
        norm = normalize_name(raw_name)

        company_id: int | None = None
        match_method = "none"
        match_confidence = "unmatched"
        matched_canonical = ""
        fuzzy_score: float | None = None

        # 1. Exact match (normalised name + country). Also fires for empty-country
        #    rows so that (name, "") matches a pre-existing (name, "") row on re-run.
        exact_key = (norm, country)
        if exact_key in existing:
            company_id, matched_canonical = existing[exact_key]
            match_method = "exact" if country else "exact_no_country"
            match_confidence = "high" if country else "medium"

        # 2. Exact name match ignoring country (when country is missing/unknown)
        if company_id is None and norm in by_name_only and not country:
            cands = by_name_only[norm]
            cands_with_country = [c for c in cands if c[0]]
            if cands_with_country:
                ex_country, ex_id, ex_cname = cands_with_country[0]
                company_id = ex_id
                matched_canonical = ex_cname
                match_method = "exact_name_only"
                match_confidence = "medium"

        # 3. Prefix match (same country, existing name is a prefix-word of new name)
        if company_id is None and norm and country:
            best_len = 0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country or len(ex_norm) < 4:
                    continue
                if norm.startswith(ex_norm + " "):
                    if len(ex_norm) > best_len:
                        best_len = len(ex_norm)
                        best_id = ex_id
                        best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "prefix"
                match_confidence = "medium"

        # 3b. Reverse-prefix match: existing canonical name starts with new short name
        #     (handles "Plexigrid" → "PLEXIGRID SOCIEDAD LIMITADA")
        if company_id is None and norm and country and len(norm) >= 5:
            best_len = 0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country:
                    continue
                if ex_norm.startswith(norm + " "):
                    if len(ex_norm) > best_len:
                        best_len = len(ex_norm)
                        best_id = ex_id
                        best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "reverse_prefix"
                match_confidence = "medium"

        # 4. Fuzzy match (same country, ≥ threshold)
        if company_id is None and norm and country:
            best_ratio = 0.0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio = ratio
                    best_id = ex_id
                    best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "fuzzy"
                match_confidence = "medium"
                fuzzy_score = round(best_ratio, 4)

        # 5. No match → insert new company (NULL sector_inferred so classify.py
        #    sets it on first run and stamps sector_inferred_updated_at)
        if company_id is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type,
                    match_confidence, match_method)
                   VALUES (%s, %s, %s, 'unknown', 'unmatched', 'none') RETURNING id""",
                (raw_name, raw_name, country or None),
            )
            company_id = cur.fetchone()[0]
            matched_canonical = raw_name
            match_method = "none"
            match_confidence = "unmatched"

            new_norm = normalize_name(raw_name)
            existing[(new_norm, country)] = (company_id, raw_name)
            existing_list.append((new_norm, country, company_id, raw_name))
            by_name_only.setdefault(new_norm, []).append((country, company_id, raw_name))

        enriched.append({**r, "company_id": company_id})
        summary.append({
            "source": r["source"],
            "call_id": r["call_id"],
            "published_name": raw_name,
            "country": country,
            "matched_company_id": company_id,
            "matched_canonical_name": matched_canonical,
            "match_method": match_method,
            "match_confidence": match_confidence,
            "fuzzy_score": fuzzy_score,
        })

    conn.commit()
    return enriched, summary


# ---------------------------------------------------------------------------
# Event loading
# ---------------------------------------------------------------------------

def load_events(rows: list[dict], conn) -> int:
    cur = conn.cursor()
    inserted = 0
    skipped_dup = 0

    for r in rows:
        company_id = r.get("company_id")
        if company_id is None:
            continue

        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=%s AND call_id=%s",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            skipped_dup += 1
            continue

        grant_eur = r.get("grant_eur")
        equity_eur = r.get("equity_eur")

        desc = (r.get("description") or "")[:500]
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id,
                project_title,
                project_summary,
                project_started,
                grant_amount_eur,
                equity_amount_eur,
                sector_tags_raw,
                raw_source_url,
                coordinator_only, grant_amount_basis)
               VALUES (%s, %s, 'portfolio_company', %s, %s, %s, %s, %s, %s, '', %s, 1, %s)""",
            (
                company_id,
                r["source"],
                r["call_id"],
                desc[:200],  # project_title (short form)
                desc,         # project_summary (full description + any notes)
                r["awarded_date"],
                grant_eur,
                equity_eur,
                r.get("source_url", ""),
                r["grant_amount_basis"],
            ),
        )
        inserted += 1

    # ── Reconcile the capital basis of rows already loaded ──────────────────
    # The insert above skips a (source, call_id) it has seen, so on a re-run it
    # writes nothing at all -- which means correcting a cohort's declaration
    # would never reach the rows it describes, and the correction would look
    # applied while the corpus still said the old thing. That is how the
    # `eit_kic_support` era survived a re-extraction.
    #
    # This is NOT a row-by-row patch, which is the thing that gets overwritten
    # on the next load. It is the opposite: the extractor asserts its own
    # declaration over its own sources, on every run, so the DECLARATION is what
    # persists and any manual edit to these rows is the thing that gets
    # overwritten. Idempotent by construction.
    corrected = 0
    for src_id, basis in COHORT_CAPITAL_BASIS.items():
        cur.execute(
            "UPDATE public_funding_events SET grant_amount_basis = %s "
            "WHERE source = %s AND grant_amount_basis IS NOT %s",
            (basis, src_id, basis))
        corrected += cur.rowcount
    conn.commit()
    if skipped_dup:
        print(f"  Skipped {skipped_dup} duplicate (source, call_id) pairs")
    if corrected:
        print(f"  Reconciled grant_amount_basis on {corrected} existing rows "
              f"to the per-cohort declaration")
    return inserted


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

CSV_FIELDNAMES = [
    "source", "call_id", "company_name", "country", "description",
    "grant_eur", "equity_eur", "awarded_date", "source_url",
    "grant_amount_basis", "project_summary",
]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args

    print("Building EIT KIC event list from hardcoded data ...")
    all_rows = extract_all()

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        w.writeheader()
        w.writerows(all_rows)
    print(f"\nCSV → {CSV_PATH}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        print("Reminder: run python3 classify.py after --load-db")
        return

    if not DB_PATH.exists():
        print(f"!! DB not found: {DB_PATH}")
        sys.exit(1)

    with connect() as conn:
        print(f"\nMatching {len(all_rows)} rows against {DB_PATH.name} ...")
        enriched, summary = match_companies(all_rows, conn)

        with MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
            w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
            w2.writeheader()
            w2.writerows(summary)

        from collections import defaultdict
        method_counts: dict[str, int] = defaultdict(int)
        for s in summary:
            method_counts[s["match_method"]] += 1
        print("Match results:")
        for method, count in sorted(method_counts.items()):
            print(f"  {method:<20}  {count:>4}")
        print(f"  Match summary → {MATCH_CSV_PATH}")

        inserted = load_events(enriched, conn)
    print(f"\nInserted {inserted} events into public_funding_events")
    print("\nnext: run python3 classify.py")


if __name__ == "__main__":
    main()
