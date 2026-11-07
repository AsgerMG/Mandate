"""Write / check mandate/profile/fixtures.json: the cross-language contract.

    python3 mandate/profile/fixtures.py           # rewrite from the Python implementation
    python3 mandate/profile/fixtures.py --check   # exit 1 if Python no longer produces it

The file records what the PYTHON implementation computes for every band
combination and for a spread of profiles and old inputs. mandate/tests/
test_profile.py asserts Python still produces it; web/lib/mandate/profile.test.ts
asserts TypeScript produces the same. Two implementations of one contract, held
equal by one file rather than by a "keep in sync" comment.
"""
from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from mandate.profile import FIELDS, size_class, sme_status, validate  # noqa: E402
from mandate.profile.adapters import (  # noqa: E402
    from_capital_request, from_policy_request, to_capital_request, to_policy_profile,
)
from mandate.vocabulary import (  # noqa: E402
    BALANCE_BANDS, ENUMS, FTE_BANDS, POLICY_SECTORS, SIZE_CLASSES, TURNOVER_BANDS,
)

OUT = Path(__file__).resolve().parent / "fixtures.json"

# Policy requests exactly as web/app/regina/brief/page.tsx builds them: seeded
# slugs, jurisdiction chips, and questions.py option labels.
_SLUGS = [s for s, _ in POLICY_SECTORS]
_SIZES = [c["policyValue"] for c in SIZE_CLASSES.values()]
_PV = {f: [e["policyValue"] for e in ENUMS[f]] for f in ENUMS}


def policy_requests() -> list[dict]:
    reqs = []
    for i in range(30):
        req = {
            "name": f"Policy founder {i}",
            "description": "" if i % 4 == 0 else f"What company {i} builds.",
            "sectors": [_SLUGS[(i + j * 3) % 10] for j in range(i % 3)],
            "markets": [["EU"], ["EU", "FR"], ["EU", "DE"], ["DE"], [], ["EU", "FR", "DE"]][i % 6],
            "uses_ai": i % 2 == 0,
            "handles_personal_data": i % 3 != 0,
        }
        if i % 6:
            req["company_size"] = _SIZES[i % 6 - 1]
        if i % 2 == 0 and i % 7:
            req["ai_role"] = [v for v in _PV["aiRole"] if v != "provider"][i % 5]
            req["ai_use_cases"] = _PV["aiUseCases"][i % 7: i % 7 + 1 + i % 2]
        if i % 3:
            req["monthly_eu_users"] = _PV["monthlyEuUsers"][i % 5]
            req["customer_type"] = _PV["customerType"][i % 3]
        if i % 3 != 0 and i % 4:
            req["data_categories"] = _PV["dataCategories"][i % 6: i % 6 + 2]
        if i % 6 == 1:
            req["answers"] = {"competitive_context": "A bigger rival with more compliance resources"}
        reqs.append(req)
    return reqs


# Capital request bodies in the shape panel.tsx's basePayload() sends, covering
# the archetypes' fields (web/lib/intelligence/__archetypes.ts) and every band.
def capital_requests() -> list[dict]:
    countries = ["Germany", "Netherlands", "Sweden", "Spain", "France", "Italy",
                 "Czechia", "Norway", "United Kingdom", "Poland"]
    sectors = ["industrial_manufacturing", "semiconductors_electronics", "software_data_ai",
               "health_life_sciences", "mobility_transport", "energy_cleantech", "other"]
    fte = ["1-9", "10-49", "50-249", "250+"]
    turn = [None, "<2M", "2-10M", "10-50M", ">50M"]
    bal = [None, "<2M", "2-43M", ">43M"]
    out = []
    for i in range(24):
        elig = {
            "fteBand": fte[i % 4],
            "ticketBand": ["b500k_2m5", "b100k_500k", "b2m5_15m"][i % 3],
            "developmentStage": ["research", "prototype", "pilot_customers", "scaling_revenue"][i % 4],
            "cofinancingBand": ">50%",
            "consortium": ["unsure", "yes", "no"][i % 3],
            "exclusionFlags": ["none"],
            "useOfFunds": ["experimental_development", "industrial_research"],
            "sector": sectors[i % 7],
        }
        if turn[i % 5]:
            elig["turnoverBand"] = turn[i % 5]
        if bal[i % 4]:
            elig["balanceBand"] = bal[i % 4]
        if i % 3 == 0:
            elig["entityCountries"] = [countries[(i + 1) % 10]]
        if i % 4 == 1:
            elig["activities"] = ["financial_services"]
            elig["borrowerModel"] = "balance_sheet_lender"
        if i % 5 == 2:
            elig["region"] = "DE21"
            elig["organisationType"] = "company"
        body = {"company": f"Capital founder {i}", "country": countries[i % 10],
                "description": f"What company {i} builds.", "eligibility": elig}
        if i % 2:
            body["capitalSought"] = ["grant", "loan"][: 1 + i % 2]
        out.append(body)
    return out


def band_grid() -> list[dict]:
    rows = []
    for f, t, b in itertools.product(FTE_BANDS, [None, *TURNOVER_BANDS], [None, *BALANCE_BANDS]):
        p = {"fteBand": f, **({"turnoverBand": t} if t else {}), **({"balanceBand": b} if b else {})}
        rows.append({**p, "sme": sme_status(p), "sizeClass": size_class(p)})
    return rows


def build() -> dict:
    preqs, creqs = policy_requests(), capital_requests()
    profiles = [from_policy_request(r) for r in preqs] + [from_capital_request(b) for b in creqs]
    profiles.append(validate({"name": "Fine bands", "fteBand": "10-49", "balanceBand": "2-10M",
                              "subsectors": ["ecommerce_marketplaces", "gaming_media"],
                              "incorporationCountry": "FR", "entityCountries": ["GB"]}))
    profiles.append(validate({"name": "Outside EU", "incorporationCountry": "CH",
                              "fteBand": "1000+", "turnoverBand": "50-450M"}))
    return {
        "_comment": "GENERATED by mandate/profile/fixtures.py. Python and TypeScript must both reproduce it.",
        "fields": {k: v[0] for k, v in FIELDS.items()},
        "bandGrid": band_grid(),
        "policyLifts": [{"request": r, "profile": from_policy_request(r)} for r in preqs],
        "capitalLifts": [{"request": b, "profile": from_capital_request(b)} for b in creqs],
        "derivations": [{"profile": p, "policy": to_policy_profile(p), "capital": to_capital_request(p)}
                        for p in profiles],
    }


def render() -> str:
    return json.dumps(build(), indent=1, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    if "--check" in sys.argv:
        ok = OUT.exists() and OUT.read_text() == render()
        print("fixtures current" if ok else "STALE: run python3 mandate/profile/fixtures.py")
        sys.exit(0 if ok else 1)
    OUT.write_text(render())
    print(f"wrote {OUT.relative_to(ROOT)}")
