"""Fail when any copy of the company vocabulary disagrees with the one source.

    python3 mandate/vocabulary/check.py

FREE: reads files only (no database, no network, no third-party imports), so it
runs in mandate-ci next to check_boundary.py. Exit 1 on any problem.

What it holds, and why each is a separate assertion rather than a comment:

  1. the generated projections are current (emit.py --check);
  2. the source is internally sound: every mapping names real ids, every policy
     slug lifts to a subsector that derives the same slug back, every fine band
     sits inside the capital band it projects onto;
  3. each brain's OWN copy still equals the shared one where the shared one is
     its source of truth or claims to project it:
       capital  classify_taxonomy.TAXONOMY            == CAPITAL_TAXONOMY
       capital  capital/data/vocabularies.json        sector, the three bands,
                (generated from types.ts)             developmentStage
       capital  panel.tsx COUNTRIES                   all named in `countries`
       policy   data/seeds.py SECTORS                 == POLICY_SECTORS
       policy   etl/intelligence/questions.py options == the policyValues

A brain's copy is read by parsing its source (ast / regex), never by importing
it, so this needs neither brain's dependencies installed.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from mandate.vocabulary import emit  # noqa: E402
from mandate.vocabulary import (  # noqa: E402
    CAPITAL_BALANCE_BANDS, CAPITAL_FTE_BANDS, CAPITAL_TAXONOMY,
    CAPITAL_TURNOVER_BANDS, DEVELOPMENT_STAGES, ENUMS, FAMILY, POLICY_SECTORS,
    SIZE, SUBSECTOR, SUBSECTOR_FAMILY, V, policy_sectors_for,
)

problems: list[str] = []


def fail(msg: str) -> None:
    problems.append(msg)


SOURCED = object()  # the brain's definition is computed from mandate.vocabulary


def _literal(path: Path, name: str):
    """The literal value `name` is assigned in `path`, or SOURCED when the file
    takes it from mandate.vocabulary (then the import IS the agreement)."""
    text = path.read_text()
    tree = ast.parse(text)
    for node in ast.walk(tree):
        target = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
        elif isinstance(node, ast.AnnAssign):
            target = node.target
        if isinstance(target, ast.Name) and target.id == name:
            try:
                return ast.literal_eval(node.value)
            except ValueError:
                if "from mandate.vocabulary import" in text:
                    return SOURCED
                raise
    raise KeyError(f"{name} not found in {path}")


def check_generated() -> None:
    for p in emit.stale():
        fail(f"{p.relative_to(ROOT)} is stale: run python3 mandate/vocabulary/emit.py")


def check_internal() -> None:
    decisions = {d["id"] for d in json.loads(emit.SOURCE.read_text())["decisions"]}
    slugs = {s for s, _ in POLICY_SECTORS}
    for f in V["sectors"]:
        if f.get("policySector") and f["policySector"] not in slugs:
            fail(f"family {f['id']} derives unknown policy slug {f['policySector']}")
        if f["subsectors"][-1]["origin"] != "capital":
            fail(f"family {f['id']}: the *_general escape must stay last (capital's rule)")
        for s in f["subsectors"]:
            if s.get("policySector") and s["policySector"] not in slugs:
                fail(f"subsector {s['id']} derives unknown policy slug {s['policySector']}")
            if s["origin"] not in ("capital", "mandate"):
                fail(f"subsector {s['id']}: origin must be capital or mandate")
    if len(SUBSECTOR) != sum(len(f["subsectors"]) for f in V["sectors"]):
        fail("a subsector id appears under two families")
    for p in V["policySectors"]:
        if p["decision"] not in decisions:
            fail(f"policy slug {p['slug']} cites missing decision {p['decision']}")
        if SUBSECTOR_FAMILY.get(p["subsector"]) != p["family"]:
            fail(f"policy slug {p['slug']} lifts to {p['subsector']}, not in {p['family']}")
            continue
        back = policy_sectors_for(p["family"], [p["subsector"]])
        if back != [p["slug"]]:
            fail(f"policy slug {p['slug']} does not round-trip: lifts and derives {back}")
    for axis in ("fteBands", "turnoverBands", "balanceBands"):
        bands = {b["id"]: b for b in SIZE[axis]}
        coarse = {b["id"]: b for b in SIZE[axis] if not b.get("covers")}
        for b in SIZE[axis]:
            cap = bands.get(b["capital"])
            if cap is None:
                fail(f"{axis}.{b['id']}: capital band {b['capital']} is not itself a band")
                continue
            hi = lambda x: float("inf") if x["max"] is None else x["max"]  # noqa: E731
            if b["min"] < cap["min"] or hi(b) > hi(cap):
                fail(f"{axis}.{b['id']} is not inside the capital band {b['capital']}")
            for c in b.get("covers", []):
                if c not in coarse or coarse[c]["capital"] != b["capital"]:
                    fail(f"{axis}.{b['id']} covers {c}, which is not a fine band of {b['capital']}")
    seen: set[str] = set()
    for c in V["countries"]:
        if c["iso2"] in seen:
            fail(f"country {c['iso2']} listed twice")
        seen.add(c["iso2"])
    for j in V["policyJurisdictions"]:
        if j != "EU" and j not in seen:
            fail(f"policy jurisdiction {j} is not a country")


def check_capital() -> None:
    tax = _literal(ROOT / "capital/ETL/events/transform/classify_taxonomy.py", "TAXONOMY")
    if tax is not SOURCED and tax != CAPITAL_TAXONOMY:
        fail("capital classify_taxonomy.TAXONOMY differs from the shared sectors "
             "(origin=capital subsectors, in order)")
    vj = json.loads((ROOT / "capital/data/vocabularies.json").read_text())
    want = {
        "sector": list(FAMILY),
        "fteBand": CAPITAL_FTE_BANDS,
        "turnoverBand": CAPITAL_TURNOVER_BANDS,
        "balanceBand": CAPITAL_BALANCE_BANDS,
        "developmentStage": list(DEVELOPMENT_STAGES),
    }
    for field, values in want.items():
        got = vj["enumValues"].get(field)
        if got != values:
            fail(f"capital vocabularies.json {field} = {got}, shared = {values}")
        if field in vj.get("bandOrders", {}) and vj["bandOrders"][field] != values:
            fail(f"capital vocabularies.json bandOrders.{field} differs from shared")
    panel = (ROOT / "web/lib/intelligence/panel.tsx").read_text()
    m = re.search(r"const COUNTRIES = \[(.*?)\];", panel, re.S)
    if not m:
        fail("could not find COUNTRIES in web/lib/intelligence/panel.tsx")
    else:
        names = {c["name"] for c in V["countries"]}
        for n in re.findall(r'"([^"]+)"', m.group(1)):
            if n not in names:
                fail(f"capital's country picker offers {n!r}, which the shared vocabulary lacks")


def check_policy() -> None:
    seeds = _literal(ROOT / "policy/data/seeds.py", "SECTORS")
    if seeds is not SOURCED and [tuple(x) for x in seeds] != list(POLICY_SECTORS):
        fail("policy data/seeds.py SECTORS differs from the shared policySectors")
    q = ROOT / "policy/etl/intelligence/questions.py"
    pairs = {
        "SIZE_QUESTION": [c["policyValue"] for c in SIZE["sizeClasses"]],
        "CUSTOMER_TYPE_QUESTION": [e["policyValue"] for e in ENUMS["customerType"]],
        "EU_USERS_QUESTION": [e["policyValue"] for e in ENUMS["monthlyEuUsers"]],
        "AI_USE_CASE_QUESTION": [e["policyValue"] for e in ENUMS["aiUseCases"]],
        "DATA_CATEGORIES_QUESTION": [e["policyValue"] for e in ENUMS["dataCategories"]],
        # `provider` (unspecified) is a valid stored answer policy's form never offers
        "AI_ROLE_QUESTION": [e["policyValue"] for e in ENUMS["aiRole"] if e["id"] != "provider"],
    }
    for name, values in pairs.items():
        got = _literal(q, name)
        got = got if got is SOURCED else got["options"]
        if got is not SOURCED and got != values:
            fail(f"policy questions.py {name} options {got} != shared {values}")


def main() -> int:
    check_generated()
    check_internal()
    check_capital()
    check_policy()
    for p in problems:
        print(f"VOCABULARY DRIFT: {p}")
    if not problems:
        print(f"vocabulary sound: {len(FAMILY)} families, {len(SUBSECTOR)} subsectors, "
              f"{len(POLICY_SECTORS)} policy slugs, {len(V['countries'])} countries")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
