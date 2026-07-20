"""Collapse public_funding_events.source into instrument FAMILIES, and the
hand-curated parent/child overlay for the multi-track EU instruments whose
internal structure `source` already encodes but no other layer surfaces.

Validated live against data/db.sqlite (2026-07-20): 992 distinct raw `source`
values collapse to 321 families via YEAR_SUFFIX_RE alone. Spot-checked against
the one known trap — Norway's `nfr_biotek2021_2021`/`nfr_biotek2021_2023`
correctly collapse to `nfr_biotek2021` (the embedded "2021" is part of the
programme's real name, BIOTEK2021, not a load year) — because the regex only
strips a TRAILING run of `_YYYY` groups, never an interior one.
"""
from __future__ import annotations

import re

YEAR_SUFFIX_RE = re.compile(r"(?:_(?:19|20)\d{2})+$")


def source_to_family(source: str) -> str:
    """Collapse a raw `source` value to its instrument family by stripping a
    trailing run of `_YYYY` suffixes. Never returns an empty string."""
    fam = YEAR_SUFFIX_RE.sub("", source)
    return fam or source


# Hand-curated overlay for the known multi-track EU instruments, checked
# against real distinct `source`/family values in the corpus (not derivable
# by regex alone — e.g. IPCEI's 11 waves share no common further-stripping
# rule, and EIT's KIC structure isn't encoded in a uniform prefix depth).
# A parent id with no direct events of its own (a pure rollup node) is fine —
# funding_instruments.event_count is computed independently per row.
PARENT_MAP: dict[str, str] = {
    # EIC — 3 tracks + the equity-vehicle side (eic_fund)
    "eic_pathfinder": "eic",
    "eic_accelerator": "eic",
    "eic_transition": "eic",
    "eic_fund": "eic",

    # IPCEI — 11 approved waves
    "ipcei_micro": "ipcei",
    "ipcei_mect": "ipcei",
    "ipcei_batteries": "ipcei",
    "ipcei_eubatin": "ipcei",
    "ipcei_hy2tech": "ipcei",
    "ipcei_hy2use": "ipcei",
    "ipcei_hy2infra": "ipcei",
    "ipcei_hy2move": "ipcei",
    "ipcei_cloud": "ipcei",
    "ipcei_med4cure": "ipcei",
    "ipcei_tech4cure": "ipcei",

    # EU Innovation Fund — lot types
    "innovation_fund_lsp": "innovation_fund",
    "innovation_fund_ssp": "innovation_fund",
    "innovation_fund_msp": "innovation_fund",
    "innovation_fund_mfg": "innovation_fund",
    "innovation_fund_plt": "innovation_fund",
    "innovation_fund_battery": "innovation_fund",
    "innovation_fund_hbank": "innovation_fund",
    "innovation_fund_hbank_2024_maritime": "innovation_fund",  # year-strip misses (trailing "_maritime"); mapped explicitly

    # Horizon Europe Pillar II — 5 loaded clusters (no CL2 in corpus) + missions/EIE/CBE + ERC PoC
    "horizon_eu_cl1": "horizon_eu_pillar_ii",
    "horizon_eu_cl3": "horizon_eu_pillar_ii",
    "horizon_eu_cl4": "horizon_eu_pillar_ii",
    "horizon_eu_cl5": "horizon_eu_pillar_ii",
    "horizon_eu_cl6": "horizon_eu_pillar_ii",
    "horizon_eu_cbe": "horizon_eu_pillar_ii",
    "horizon_eu_eie": "horizon_eu_pillar_ii",
    "horizon_eu_miss": "horizon_eu_pillar_ii",
    "erc_poc": "horizon_eu_pillar_ii",

    # Horizon Europe partnerships / Joint Undertakings (non-Chips)
    "chp": "horizon_eu_partnership",
    "ihi": "horizon_eu_partnership",
    "eurohpc": "horizon_eu_partnership",
    "clean_aviation": "horizon_eu_partnership",
    "sns_ju": "horizon_eu_partnership",
    "sesar_ju": "horizon_eu_partnership",
    "europes_rail": "horizon_eu_partnership",
    "euspa": "horizon_eu_partnership",
    "gh_edctp3": "horizon_eu_partnership",

    # Chips JU / KDT JU
    "chips_ju_kdt": "chips_ju",
    "chips_ju_kdt_unknown": "chips_ju",

    # European Defence Fund — RA/DA tracks
    "edf_ra": "edf",
    "edf_da": "edf",

    # EIT — per-KIC synthetic mid-tier, each with its observed sub-programmes.
    # eit_urban_mobility is unusual: it has direct events of its own AND a
    # child (eit_urban_mobility_portfolio) — both are valid simultaneously.
    "eit_climate_kic_asa": "eit_climate_kic",
    "eit_climate_kic_cdr": "eit_climate_kic",
    "eit_climate_kic_clean_cities_spain": "eit_climate_kic",
    "eit_climate_kic": "eit",
    "eit_digital_champions": "eit_digital",
    "eit_digital_vap": "eit_digital",
    "eit_digital": "eit",
    "eit_food_rfs": "eit_food",
    "eit_food": "eit",
    "eit_health_catapult": "eit_health",
    "eit_health": "eit",
    "eit_innoenergy_highway": "eit_innoenergy",
    "eit_innoenergy": "eit",
    "eit_manufacturing_boostup": "eit_manufacturing",
    "eit_manufacturing_investments": "eit_manufacturing",
    "eit_manufacturing": "eit",
    "eit_rawmaterials_portfolio": "eit_rawmaterials",
    "eit_rawmaterials": "eit",
    "eit_urban_mobility_portfolio": "eit_urban_mobility",
    "eit_urban_mobility": "eit",
}

# Synthetic parent ids referenced above that are pure rollup nodes — they
# never appear as a real `source`/family value themselves, so
# populate_funding_instruments.py must seed them explicitly (zero event_count
# unless a bare-name family coincidentally also exists, e.g. eit_urban_mobility).
SYNTHETIC_PARENTS = {
    "eic", "ipcei", "innovation_fund", "horizon_eu_pillar_ii",
    "horizon_eu_partnership", "chips_ju", "edf", "eit",
    "eit_climate_kic", "eit_digital", "eit_food", "eit_health",
    "eit_innoenergy", "eit_manufacturing", "eit_rawmaterials",
}
