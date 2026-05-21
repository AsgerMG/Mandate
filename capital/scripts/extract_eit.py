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

import csv
import re
import sqlite3
import sys
from difflib import SequenceMatcher
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "eit_projects.csv"
MATCH_CSV_PATH = OUT_DIR / "eit_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"

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
}

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
}

COUNTRY_NAME_TO_ISO: dict[str, str] = {
    "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Croatia": "HR",
    "Cyprus": "CY", "Czechia": "CZ", "Czech Republic": "CZ", "Denmark": "DK",
    "Estonia": "EE", "Finland": "FI", "France": "FR", "Germany": "DE",
    "Greece": "GR", "Hungary": "HU", "Iceland": "IS", "Ireland": "IE",
    "Italy": "IT", "Latvia": "LV", "Lithuania": "LT", "Luxembourg": "LU",
    "Malta": "MT", "Netherlands": "NL", "Norway": "NO", "Poland": "PL",
    "Portugal": "PT", "Romania": "RO", "Slovakia": "SK", "Slovenia": "SI",
    "Spain": "ES", "Sweden": "SE", "Switzerland": "CH",
    "United Kingdom": "GB", "UK": "GB",
    "Israel": "IL", "Turkey": "TR", "Ukraine": "UA",
}

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
)


def _build_events() -> list[dict]:
    rows: list[dict] = []
    for (company_name, country, description, grant_eur, equity_eur,
         notes, call_key, source_url) in _ALL_RAW_EVENTS:
        src_id, awarded_date = CALL_TO_SOURCE[call_key]

        # grant_amount_basis
        if src_id.startswith("eit_manufacturing_investments"):
            basis = "eit_kic_equity"
        elif src_id.startswith("eit_manufacturing_boostup"):
            basis = "eit_kic_grant"
        else:
            basis = "eit_kic_support"

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
    rows: list[dict], conn: sqlite3.Connection
) -> tuple[list[dict], list[dict]]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies")
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
                   VALUES (?, ?, ?, 'unknown', 'unmatched', 'none')""",
                (raw_name, raw_name, country or None),
            )
            company_id = cur.lastrowid
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

def load_events(rows: list[dict], conn: sqlite3.Connection) -> int:
    cur = conn.cursor()
    inserted = 0
    skipped_dup = 0

    for r in rows:
        company_id = r.get("company_id")
        if company_id is None:
            continue

        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
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
               VALUES (?, ?, 'portfolio_company', ?, ?, ?, ?, ?, ?, '', ?, 1, ?)""",
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

    conn.commit()
    if skipped_dup:
        print(f"  Skipped {skipped_dup} duplicate (source, call_id) pairs")
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

    conn = sqlite3.connect(DB_PATH)
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
    conn.close()
    print(f"\nInserted {inserted} events into public_funding_events")
    print("\nnext: run python3 classify.py")


if __name__ == "__main__":
    main()
