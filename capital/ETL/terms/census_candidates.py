"""THE CENSUS, step 2 input: per market, the budget owners and the ARMS whose remit is to be judged,
from capital.register_entries (structure only, no model). Writes capital/reference/census/<m>_candidates.csv.

    python3 capital/ETL/terms/census_candidates.py --database-url URL --market FR

Budget owners are found by the register's own type (FR ministries and regions, UK ministerial and
non-ministerial departments and devolved governments, IT ministries/PCM and regions, EU the
Commission); every unit below an owner belongs to it (kept whole for the trees, not judged). Arms
are the bodies outside the owners whose remit decides whether they are in scope.
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import psycopg

OUT = Path(__file__).resolve().parents[3] / "capital" / "reference" / "census"


def latest(con, market: str) -> dict:
    rows = con.execute("""SELECT DISTINCT ON (register, register_id) register_id, name, kind, status, parent_ids, child_ids
                            FROM capital.register_entries WHERE market = %s
                           ORDER BY register, register_id, recorded_at DESC""", (market,)).fetchall()
    return {r[0]: {"name": r[1], "kind": r[2] or "", "status": r[3], "par": r[4], "ch": r[5]} for r in rows}


def below(d: dict, roots: list[str]) -> set[str]:
    kids: dict[str, set] = {}
    for rid, e in d.items():
        for p in e["par"]:
            kids.setdefault(p, set()).add(rid)
        for c in e["ch"]:
            kids.setdefault(rid, set()).add(c)
    seen, stack = set(roots), list(roots)
    while stack:
        for c in kids.get(stack.pop(), ()):
            if c in d and c not in seen:
                seen.add(c)
                stack.append(c)
    return seen


def owners(market: str, d: dict) -> list[str]:
    low = lambda e: e["name"].lower()  # noqa: E731
    if market == "FR":
        return [r for r, e in d.items() if (e["kind"] == "Administration centrale (ou Ministère)" and low(e).startswith(("ministère", "premier ministre")))
                or (e["kind"] == "Collectivité locale" and low(e).startswith(("région", "conseil régional", "collectivité territoriale", "collectivité de corse")))]
    if market == "UK":
        return [r for r, e in d.items() if e["status"] == "open" and e["kind"] in ("Ministerial department", "Devolved government", "Non-ministerial department")]
    if market == "IT":
        return [r for r, e in d.items() if e["kind"] in ("ente:C1", "ente:L4")]
    if market == "EU":
        return [r for r, e in d.items() if e["name"] == "European Commission"]
    raise SystemExit(f"no rule for {market}")


def arms(market: str, d: dict, owned: set[str]) -> list[str]:
    """Separate BODIES are judged on their own remit wherever they sit (a funding arm under a
    ministry, e.g. the British Business Bank under BIST, is judged, not swallowed by its owner);
    an owner's INTERNAL units (directorates, offices) stay with the owner and are not judged."""
    if market == "FR":   # national bodies by their legal type; central-administration entries are internal units
        return [r for r, e in d.items() if e["kind"] in (
            "Établissement public", "Service à compétence nationale", "Groupement d'intérêt public",
            "Autorité administrative indépendante", "Autorité publique indépendante")]
    if market == "UK":   # every open body that is not a court, a tribunal or an owner itself
        own = set(owners(market, d))
        return [r for r, e in d.items() if e["status"] == "open" and r not in own and e["kind"] not in ("Court", "Tribunal")]
    if market == "IT":   # the administrations (enti) that are not ministries/PCM or regions; their units go with them
        return [r for r, e in d.items() if e["kind"].startswith("ente:") and e["kind"] not in ("ente:C1", "ente:L4")]
    if market == "EU":   # the Commission's DGs and services (its first level) and the EU's other top-level bodies
        com = set(owners(market, d))
        first = {r for r, e in d.items() if any(p in com for p in e["par"])}
        top = {r for r, e in d.items() if any(p not in d for p in e["par"]) and r not in com}
        return sorted(first | top)
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--market", required=True)
    a = ap.parse_args()
    m = a.market.upper()
    with psycopg.connect(a.database_url) as con:
        d = latest(con, m)
    own = owners(m, d)
    owned = below(d, own)
    arm = arms(m, d, owned)
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f"{m.lower()}_candidates.csv"
    with f.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["role", "register_id", "name", "kind", "parent_names"])
        for r in sorted(own, key=lambda r: d[r]["name"]):
            w.writerow(["owner", r, d[r]["name"], d[r]["kind"], ""])
        for r in sorted(arm, key=lambda r: d[r]["name"]):
            w.writerow(["arm", r, d[r]["name"], d[r]["kind"], " | ".join(d[p]["name"] for p in d[r]["par"] if p in d)])
    print(f"{m}: {len(own)} owners ({len(owned)} with their units), {len(arm)} arms to judge -> {f.relative_to(OUT.parents[2])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
