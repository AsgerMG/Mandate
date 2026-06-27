"""Single source of truth for sector display labels (build side).

Every site-data build script and the taxonomy.json emitter label sectors through
here, so the two-tier taxonomy (companies.sector_top / subsector) renders
consistently everywhere. Adding or renaming a sub-sector needs no code change:
unknown slugs are humanised automatically; only the 11 broad Tier-1 names are
curated for nicer prose.
"""
from __future__ import annotations

# Curated display names for the 11 broad Tier-1 sectors. Anything not listed
# (every Tier-2 sub-sector, any future sector) falls back to humanise().
TIER1_LABELS: dict[str, str] = {
    "health_life_sciences": "Health & life sciences",
    "energy_cleantech": "Energy & cleantech",
    "mobility_transport": "Mobility & transport",
    "industrial_manufacturing": "Industrial & manufacturing",
    "semiconductors_electronics": "Semiconductors & electronics",
    "software_data_ai": "Software, data & AI",
    "space": "Space",
    "defense_security": "Defence & security",
    "agrifood": "Agrifood",
    "materials_chemicals": "Materials & chemicals",
    "other": "Other",
}

# Tokens that should stay upper-cased when humanising a slug.
_ACRONYMS = {"ai", "ev", "pv", "hvac", "iot", "pcb", "ccs", "uav", "rd", "iot"}


def humanise(slug: str) -> str:
    if not slug:
        return ""
    parts = slug.split("_")
    return " ".join(p.upper() if p in _ACRONYMS else p.capitalize() for p in parts)


def label(slug: str) -> str:
    """Display label for any sector_top or subsector slug."""
    return TIER1_LABELS.get(slug) or humanise(slug)
