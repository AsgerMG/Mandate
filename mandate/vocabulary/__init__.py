"""The ONE vocabulary every Mandate brain describes a company in.

The source is vocabulary.json (read its `decisions` before changing a mapping);
generated.py is its projection, and this module is the lookup layer both brains
import. web/lib/mandate/vocabulary.ts is the same layer for the site, over the
same generated data.

    from mandate.vocabulary import SECTOR_FAMILIES, policy_sectors_for, band
"""
from __future__ import annotations

from .generated import VOCABULARY, VOCABULARY_VERSION

V = VOCABULARY

# ── sectors ──────────────────────────────────────────────────────────────────
SECTOR_FAMILIES: tuple[str, ...] = tuple(f["id"] for f in V["sectors"])
FAMILY: dict[str, dict] = {f["id"]: f for f in V["sectors"]}
SUBSECTOR_FAMILY: dict[str, str] = {
    s["id"]: f["id"] for f in V["sectors"] for s in f["subsectors"]}
SUBSECTOR: dict[str, dict] = {
    s["id"]: s for f in V["sectors"] for s in f["subsectors"]}
UNNAMED_RESIDUAL_FAMILIES: frozenset[str] = frozenset(
    f["id"] for f in V["sectors"] if f.get("unnamedResidual"))

# capital's classifier vocabulary: the shared subsectors capital originated, in
# capital's order. Values added for another brain (origin "mandate") are not in
# it, so adding one never moves a corpus label.
CAPITAL_TAXONOMY: dict[str, list[str]] = {
    f["id"]: [s["id"] for s in f["subsectors"] if s["origin"] == "capital"]
    for f in V["sectors"]}

POLICY_SECTORS: tuple[tuple[str, str], ...] = tuple(
    (p["slug"], p["name"]) for p in V["policySectors"])
POLICY_SECTOR_LIFT: dict[str, tuple[str, str]] = {
    p["slug"]: (p["family"], p["subsector"]) for p in V["policySectors"]}


def policy_sector_of_subsector(sub: str) -> str | None:
    """A subsector's policy slug: its own, else its family's (decision D2)."""
    s = SUBSECTOR[sub]
    if "policySector" in s:
        return s["policySector"]
    return FAMILY[SUBSECTOR_FAMILY[sub]].get("policySector")


def policy_sectors_for(family: str | None, subsectors: list[str] | None) -> list[str]:
    """Policy's sector slugs, DERIVED: each subsector's in order, then the
    family's if no subsector of that family was given. Unique, order kept."""
    out: list[str] = []
    subs = list(subsectors or [])
    for s in subs:
        slug = policy_sector_of_subsector(s)
        if slug and slug not in out:
            out.append(slug)
    if family and not any(SUBSECTOR_FAMILY[s] == family for s in subs):
        slug = FAMILY[family].get("policySector")
        if slug and slug not in out:
            out.append(slug)
    return out


# ── size ─────────────────────────────────────────────────────────────────────
SIZE = V["size"]
FTE_BANDS: dict[str, dict] = {b["id"]: b for b in SIZE["fteBands"]}
TURNOVER_BANDS: dict[str, dict] = {b["id"]: b for b in SIZE["turnoverBands"]}
BALANCE_BANDS: dict[str, dict] = {b["id"]: b for b in SIZE["balanceBands"]}
SIZE_CLASSES: dict[str, dict] = {c["id"]: c for c in SIZE["sizeClasses"]}

# capital's own band lists, in capital's order: the `capital` projections.
def _capital_order(bands: list[dict]) -> list[str]:
    out: list[str] = []
    for b in bands:
        if b["capital"] not in out:
            out.append(b["capital"])
    return out


CAPITAL_FTE_BANDS = _capital_order(SIZE["fteBands"])
CAPITAL_TURNOVER_BANDS = _capital_order(SIZE["turnoverBands"])
CAPITAL_BALANCE_BANDS = _capital_order(SIZE["balanceBands"])

# ── places ───────────────────────────────────────────────────────────────────
COUNTRIES: dict[str, dict] = {c["iso2"]: c for c in V["countries"]}
_NAME_TO_ISO = {c["name"].lower(): c["iso2"] for c in V["countries"]}
POLICY_JURISDICTIONS: tuple[str, ...] = tuple(V["policyJurisdictions"])
MARKETS: tuple[str, ...] = ("EU", *COUNTRIES)


def iso_for_name(name: str) -> str | None:
    """capital's spelling (or an ISO2 code) -> ISO2, else None."""
    n = name.strip()
    if len(n) == 2 and n.upper() in COUNTRIES:
        return n.upper()
    return _NAME_TO_ISO.get(n.lower())


# ── the plain enumerations ──────────────────────────────────────────────────
DEVELOPMENT_STAGES: tuple[str, ...] = tuple(s["id"] for s in V["developmentStages"])

ENUMS: dict[str, list[dict]] = {
    "customerType": V["customerTypes"],
    "aiRole": V["aiRoles"],
    "aiUseCases": V["aiUseCases"],
    "dataCategories": V["dataCategories"],
    "monthlyEuUsers": V["monthlyEuUsers"],
}


def ids(field: str) -> tuple[str, ...]:
    return tuple(e["id"] for e in ENUMS[field])


def policy_value(field: str, id_: str) -> str:
    return next(e["policyValue"] for e in ENUMS[field] if e["id"] == id_)


def lift_policy_value(field: str, raw: str) -> str | None:
    """A string policy's intake sent -> the shared id: its policyValue, an
    alias, or the id itself. None if it is none of them."""
    r = raw.strip()
    for e in ENUMS[field]:
        if r == e["policyValue"] or r == e["id"] or r in e.get("aliases", []):
            return e["id"]
    return None


__all__ = [
    "VOCABULARY", "VOCABULARY_VERSION", "SECTOR_FAMILIES", "FAMILY", "SUBSECTOR",
    "SUBSECTOR_FAMILY", "UNNAMED_RESIDUAL_FAMILIES", "CAPITAL_TAXONOMY",
    "POLICY_SECTORS", "POLICY_SECTOR_LIFT", "policy_sector_of_subsector",
    "policy_sectors_for", "FTE_BANDS", "TURNOVER_BANDS", "BALANCE_BANDS",
    "SIZE_CLASSES", "CAPITAL_FTE_BANDS", "CAPITAL_TURNOVER_BANDS",
    "CAPITAL_BALANCE_BANDS", "COUNTRIES", "POLICY_JURISDICTIONS", "MARKETS",
    "iso_for_name", "DEVELOPMENT_STAGES", "ENUMS", "ids", "policy_value",
    "lift_policy_value",
]
