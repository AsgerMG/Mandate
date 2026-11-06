"""THE company profile: one description of a company, read by every brain.

A profile is a JSON object (camelCase keys, the same keys and values as
web/lib/mandate/profile.ts) whose values come from mandate/vocabulary. It is
what `mandate.company_profile_versions.payload` stores. A brain never reads it
directly: it reads its OWN input, DERIVED from the profile by an adapter
(mandate/profile/adapters.py), so each brain keeps the input shape its engine
was built and measured on, and the profile is the one place a fact lives.

    from mandate.profile import validate, sme_status, size_class
    from mandate.profile.adapters import to_policy_profile, to_capital_request

The four groups are companyProfile.ts's: identity, shape, exposure, intent.

  identity  name, description, sector, subsectors, incorporationCountry,
            entityCountries, markets
  shape     fteBand, turnoverBand, balanceBand, developmentStage, customerType
            (company SIZE is not a field: it is derived, see sme_status)
  exposure  usesAi, aiRole, aiUseCases, handlesPersonalData, dataCategories,
            monthlyEuUsers
  intent    funding (capital's own answers, under capital's vocabulary: D20),
            answers (free-form scoping answers, question id -> text)
"""
from __future__ import annotations

from typing import Any

from mandate.vocabulary import (
    BALANCE_BANDS, COUNTRIES, DEVELOPMENT_STAGES, FAMILY, FTE_BANDS, MARKETS,
    SIZE, SUBSECTOR, SUBSECTOR_FAMILY, TURNOVER_BANDS, VOCABULARY_VERSION, ids,
)


class ProfileError(ValueError):
    """A profile that names a value the vocabulary does not have."""


# field -> (kind, allowed values or None). The one declaration of the shape;
# profile.ts declares the same table and test_profile.py holds them equal.
FIELDS: dict[str, tuple[str, Any]] = {
    "name": ("str", None),
    "description": ("str", None),
    "sector": ("enum", tuple(FAMILY)),
    "subsectors": ("enum[]", tuple(SUBSECTOR)),
    "incorporationCountry": ("enum", tuple(COUNTRIES)),
    "entityCountries": ("enum[]", tuple(COUNTRIES)),
    "markets": ("enum[]", MARKETS),
    "fteBand": ("enum", tuple(FTE_BANDS)),
    "turnoverBand": ("enum", tuple(TURNOVER_BANDS)),
    "balanceBand": ("enum", tuple(BALANCE_BANDS)),
    "developmentStage": ("enum", DEVELOPMENT_STAGES),
    "customerType": ("enum", ids("customerType")),
    "usesAi": ("bool", None),
    "aiRole": ("enum", ids("aiRole")),
    "aiUseCases": ("enum[]", ids("aiUseCases")),
    "handlesPersonalData": ("bool", None),
    "dataCategories": ("enum[]", ids("dataCategories")),
    "monthlyEuUsers": ("enum", ids("monthlyEuUsers")),
    "answers": ("map", None),
    "funding": ("object", None),
}


def validate(raw: dict) -> dict:
    """The canonical form of a profile, or ProfileError.

    Canonical means: only known keys; every value from the vocabulary; absent,
    None, "" and [] all mean UNANSWERED and are dropped, so one company has one
    serialisation. Subsectors may span families (a fintech marketplace is two
    things); `sector` is the one family capital asks for. `funding` is passed through as a dict: its values are
    capital's, and capital's sanitiser is what validates them (D20)."""
    if not isinstance(raw, dict):
        raise ProfileError("a profile is a JSON object")
    unknown = sorted(set(raw) - set(FIELDS))
    if unknown:
        raise ProfileError(f"unknown profile field(s): {', '.join(unknown)}")
    out: dict = {}
    for key, (kind, allowed) in FIELDS.items():
        v = raw.get(key)
        if v is None or v == "" or v == [] or v == {}:
            continue
        if kind == "str":
            if not isinstance(v, str):
                raise ProfileError(f"{key} must be a string")
            if key == "name":
                v = v.strip()
        elif kind == "bool":
            if not isinstance(v, bool):
                raise ProfileError(f"{key} must be true or false")
        elif kind == "enum":
            if v not in allowed:
                raise ProfileError(f"{key}: {v!r} is not in the vocabulary")
        elif kind == "enum[]":
            if not isinstance(v, list) or any(x not in allowed for x in v):
                raise ProfileError(f"{key}: {v!r} has a value not in the vocabulary")
            v = list(dict.fromkeys(v))  # unique, order kept
        elif kind == "map":
            if not isinstance(v, dict) or any(
                    not isinstance(k, str) or not isinstance(x, str) for k, x in v.items()):
                raise ProfileError(f"{key} must map question ids to text")
            v = dict(v)
        elif kind == "object":
            if not isinstance(v, dict):
                raise ProfileError(f"{key} must be an object")
            v = {k: x for k, x in v.items() if x is not None and x != [] and x != ""}
            if not v:
                continue
        out[key] = v
    if not out.get("name"):
        raise ProfileError("a profile needs a name")
    return out


# ── THE SIZE DERIVATIONS (decisions D12-D15) ────────────────────────────────
_TIERS = SIZE["smeTiers"]
_ENT = SIZE["enterprise"]


def _at_most(band: dict | None, ceiling: float) -> bool | None:
    """Does this band PROVE the value is <= ceiling? None if unanswered. A band
    that straddles the ceiling proves nothing, so it is False (D14)."""
    if band is None:
        return None
    return band["max"] is not None and band["max"] <= ceiling


def sme_status(p: dict) -> str | None:
    """EU SME status, Recommendation 2003/361/EC Art. 2: a headcount ceiling AND
    turnover OR balance sheet under the tier's ceiling. micro/small/medium/large,
    or None when the answers cannot support a status. Identical to capital's
    deriveSmeStatus on capital's bands (tested exhaustively); finer bands close
    its one documented hole (the missing EUR 10M balance rung)."""
    fte = FTE_BANDS.get(p.get("fteBand") or "")
    if fte is None:
        return None
    turnover = TURNOVER_BANDS.get(p.get("turnoverBand") or "")
    balance = BALANCE_BANDS.get(p.get("balanceBand") or "")
    for tier in _TIERS:
        if fte["max"] is not None and fte["max"] < tier["staffBelow"]:
            t = _at_most(turnover, tier["turnoverAtMost"])
            b = _at_most(balance, tier["balanceAtMost"])
            if t is None and b is None:
                return None  # nothing to go on: never guess an SME claim
            if t or b:
                return tier["id"]
    return "large"


def size_class(p: dict) -> str | None:
    """Policy's five classes: the SME tiers, with `large` split at 1,000 staff OR
    EUR 450M turnover into large / enterprise. None when it cannot be shown."""
    sme = sme_status(p)
    if sme != "large":
        return sme
    fte = FTE_BANDS[p["fteBand"]]
    turnover = TURNOVER_BANDS.get(p.get("turnoverBand") or "")
    if fte["min"] >= _ENT["staffAtLeast"] or (
            turnover is not None and turnover["min"] >= _ENT["turnoverAbove"]):
        return "enterprise"
    staff_below = fte["max"] is not None and fte["max"] < _ENT["staffAtLeast"]
    turnover_below = (turnover is not None and turnover["max"] is not None
                      and turnover["max"] <= _ENT["turnoverAbove"])
    return "large" if staff_below and turnover_below else None


def capital_sector(p: dict) -> str | None:
    """Capital's single sector: the family asked, else the first subsector's."""
    if p.get("sector"):
        return p["sector"]
    subs = p.get("subsectors") or []
    return SUBSECTOR_FAMILY[subs[0]] if subs else None


__all__ = ["FIELDS", "ProfileError", "VOCABULARY_VERSION", "validate", "sme_status",
           "size_class", "capital_sector"]
