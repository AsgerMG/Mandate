"""Each brain's OWN input, derived from the one profile. And the reverse lifts.

DIRECTION. The profile is the source; `to_policy_profile` and
`to_capital_request` derive each brain's input from it. The `from_*` lifts exist
so an old input can be turned into a profile once (an existing session, a
fixture, a test), and they are held to one property, tested on every fixture
each brain has:

    to_X(from_X(old)) == old        for every input X's own intake can send

so a brain fed through the profile computes exactly what it computed before.
A lift REFUSES (ProfileError) what it cannot represent rather than guessing.

web/lib/mandate/profile.ts implements the same four functions; the shared
fixture file mandate/profile/fixtures.json holds the two languages equal.
"""
from __future__ import annotations

from mandate.vocabulary import (
    BALANCE_BANDS, COUNTRIES, FTE_BANDS, POLICY_JURISDICTIONS, POLICY_SECTOR_LIFT,
    SIZE_CLASSES, TURNOVER_BANDS, iso_for_name, lift_policy_value, policy_sectors_for,
    policy_value,
)

from . import ProfileError, capital_sector, size_class, validate

# ── policy (Regina): etl/intelligence/profile.py CompanyProfile ─────────────


def policy_markets(p: dict) -> list[str]:
    """Decision D17: the markets asked, as far as policy covers them; when not
    asked, EU (established in a member state, or nowhere known) plus every
    policy jurisdiction the company is established in. Never empty: policy's
    own default is [EU]."""
    if p.get("markets"):
        out = [m for m in p["markets"] if m in POLICY_JURISDICTIONS]
    else:
        where = [c for c in [p.get("incorporationCountry"), *p.get("entityCountries", [])] if c]
        out = ["EU"] if not where or any(COUNTRIES[c]["eu"] for c in where) else []
        out += [c for c in dict.fromkeys(where) if c in POLICY_JURISDICTIONS]
    return out or ["EU"]


def to_policy_profile(profile: dict) -> dict:
    """The keyword arguments of policy's CompanyProfile (markets as plain
    jurisdiction strings; policy wraps them in its Jurisdiction enum)."""
    p = validate(profile)
    size = size_class(p)

    def one(field: str, key: str):
        return policy_value(field, p[key]) if key in p else None

    def many(field: str, key: str) -> list[str]:
        return [policy_value(field, x) for x in p.get(key, [])]

    return {
        "name": p["name"],
        "description": p.get("description", ""),
        "sectors": policy_sectors_for(p.get("sector"), p.get("subsectors")),
        "markets": policy_markets(p),
        "uses_ai": bool(p.get("usesAi", False)),
        "handles_personal_data": bool(p.get("handlesPersonalData", False)),
        "company_size": SIZE_CLASSES[size]["policyValue"] if size else None,
        "ai_role": one("aiRole", "aiRole"),
        "monthly_eu_users": one("monthlyEuUsers", "monthlyEuUsers"),
        "data_categories": many("dataCategories", "dataCategories"),
        "ai_use_cases": many("aiUseCases", "aiUseCases"),
        "customer_type": one("customerType", "customerType"),
        "answers": dict(p.get("answers", {})),
    }


def _lift_size(raw: str) -> dict:
    r = raw.strip()
    for c in SIZE_CLASSES.values():
        if r == c["policyValue"] or r == c["id"] or r in c.get("aliases", []):
            return dict(c["lift"])
    raise ProfileError(f"company_size {raw!r} is not a size class")


def from_policy_request(req: dict) -> dict:
    """A policy BriefRequest (or CompanyProfile.model_dump()) -> a profile."""
    p: dict = {"name": req.get("name", ""), "description": req.get("description", "")}
    subs: list[str] = []
    for slug in req.get("sectors") or []:
        if slug not in POLICY_SECTOR_LIFT:
            raise ProfileError(f"policy sector {slug!r} is not a seeded slug")
        family, sub = POLICY_SECTOR_LIFT[slug]
        subs.append(sub)
        p.setdefault("sector", family)
    p["subsectors"] = subs
    p["markets"] = [str(getattr(m, "value", m)) for m in req.get("markets") or []]
    p["usesAi"] = bool(req.get("uses_ai", False))
    p["handlesPersonalData"] = bool(req.get("handles_personal_data", False))
    if req.get("company_size"):
        p.update(_lift_size(req["company_size"]))
    for key, field in (("ai_role", "aiRole"), ("monthly_eu_users", "monthlyEuUsers"),
                       ("customer_type", "customerType")):
        if req.get(key):
            got = lift_policy_value(field, req[key])
            if got is None:
                raise ProfileError(f"{key} {req[key]!r} is not in the vocabulary")
            p[field] = got
    for key, field in (("data_categories", "dataCategories"), ("ai_use_cases", "aiUseCases")):
        vals = []
        for raw in req.get(key) or []:
            got = lift_policy_value(field, raw)
            if got is None:
                raise ProfileError(f"{key} {raw!r} is not in the vocabulary")
            vals.append(got)
        p[field] = vals
    p["answers"] = dict(req.get("answers") or {})
    return validate(p)


# ── capital (Wincent): the /api/intelligence request body ───────────────────

# EligibilityAnswers keys the profile owns; every other key is capital's own and
# rides in `funding` (D20). `capitalSought` is top-level in capital's request.
_SHARED_ELIGIBILITY = ("sector", "fteBand", "turnoverBand", "balanceBand",
                       "developmentStage", "entityCountries")


def to_eligibility_answers(profile: dict) -> dict:
    """Capital's EligibilityAnswers. Bands are projected onto capital's (D13)."""
    p = validate(profile)
    funding = {k: v for k, v in p.get("funding", {}).items() if k != "capitalSought"}
    out = dict(funding)
    sector = capital_sector(p)
    if sector:
        out["sector"] = sector
    for key, bands in (("fteBand", FTE_BANDS), ("turnoverBand", TURNOVER_BANDS),
                       ("balanceBand", BALANCE_BANDS)):
        if key in p:
            out[key] = bands[p[key]]["capital"]
    if "developmentStage" in p:
        out["developmentStage"] = p["developmentStage"]
    if p.get("entityCountries"):
        out["entityCountries"] = [COUNTRIES[c]["name"] for c in p["entityCountries"]]
    return out


def to_capital_request(profile: dict) -> dict:
    """The profile-derived part of capital's request body: company, country,
    description, capitalSought, eligibility. Session state (profileSignal,
    projectAnswers, eligibilityBeforeRound) is not the company and is not here."""
    p = validate(profile)
    out: dict = {"company": p["name"]}
    if "incorporationCountry" in p:
        out["country"] = COUNTRIES[p["incorporationCountry"]]["name"]
    if "description" in p:
        out["description"] = p["description"]
    sought = p.get("funding", {}).get("capitalSought")
    if sought:
        out["capitalSought"] = list(sought)
    elig = to_eligibility_answers(p)
    if elig:
        out["eligibility"] = elig
    return out


def _iso(name: str, field: str) -> str:
    iso = iso_for_name(name)
    if iso is None:
        raise ProfileError(f"{field}: {name!r} is not a country in the vocabulary")
    return iso


def from_capital_request(body: dict) -> dict:
    """A capital request body (company, country, description, capitalSought,
    eligibility) -> a profile."""
    elig = dict(body.get("eligibility") or {})
    p: dict = {"name": body.get("company", ""), "description": body.get("description") or ""}
    if body.get("country"):
        p["incorporationCountry"] = _iso(body["country"], "country")
    for key in ("sector", "fteBand", "turnoverBand", "balanceBand", "developmentStage"):
        if elig.get(key) is not None:
            p[key] = elig[key]
    p["entityCountries"] = [_iso(c, "entityCountries") for c in elig.get("entityCountries") or []]
    funding = {k: v for k, v in elig.items() if k not in _SHARED_ELIGIBILITY}
    if body.get("capitalSought"):
        funding["capitalSought"] = list(body["capitalSought"])
    p["funding"] = funding
    return validate(p)


__all__ = ["to_policy_profile", "from_policy_request", "policy_markets",
           "to_eligibility_answers", "to_capital_request", "from_capital_request"]
