"""THE CENSUS, step 2 output: the in-scope NETWORK per market, against today's knowledge map. No model.

    python3 capital/ETL/terms/census_network.py --database-url URL --market UK

For every body judged `in` (capital/reference/census/<m>_scope.csv): its path up the register's
hierarchy to a budget owner, the heads the register names, its status and successor, and whether
the knowledge map already holds it (matched by normalised name or abbreviation). Writes
capital/reference/census/<m>_network.csv and prints the diff summary the owner reviews.
"""
from __future__ import annotations

import argparse
import csv
import re
import unicodedata
from pathlib import Path

import psycopg
import yaml

ROOT = Path(__file__).resolve().parents[3]
REF = ROOT / "capital" / "reference" / "census"
MAP = ROOT / "mandate" / "brains" / "wincent" / "knowledge_map.yaml"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def abbrevs(s: str) -> set[str]:
    return {a.lower() for a in re.findall(r"\(([A-Za-z0-9&\-]{2,12})\)", s or "")} | \
           {w.lower() for w in re.findall(r"\b[A-Z][A-Z0-9&]{2,9}\b", s or "")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--market", required=True)
    a = ap.parse_args()
    m = a.market.upper()
    scope = {r["register_id"]: r for r in csv.DictReader((REF / f"{m.lower()}_scope.csv").open())}
    with psycopg.connect(a.database_url) as con:
        rows = con.execute("""SELECT DISTINCT ON (register_id) register_id, name, kind, status, parent_ids, successor_ids, heads
                                FROM capital.register_entries WHERE market = %s ORDER BY register_id, recorded_at DESC""", (m,)).fetchall()
    d = {r[0]: {"name": r[1], "kind": r[2], "status": r[3], "par": r[4], "succ": r[5], "heads": r[6]} for r in rows}
    owners = {rid for rid, s in scope.items() if s["function"] == "budget_owner"}
    kmap = (yaml.safe_load(MAP.read_text())["markets"].get(m) or {}).get("institutions") or []
    known = [(n["key"], norm(n["name"]), abbrevs(n["name"])) for n in kmap]

    def in_map(name: str) -> str:
        nn, ab = norm(name), abbrevs(name)
        for key, kn, kab in known:
            if nn and (nn == kn or (len(nn) > 12 and (nn in kn or kn in nn))) or (ab and ab & kab):
                return key
        return ""

    def path(rid: str) -> list[str]:
        out, seen = [], set()
        cur = rid
        while cur in d and cur not in seen:
            seen.add(cur)
            ps = [p for p in d[cur]["par"] if p in d]
            if not ps:
                break
            cur = ps[0]
            out.append(d[cur]["name"])
            if cur in owners:
                break
        return out

    out = []
    for rid, s in scope.items():
        if s["verdict"] != "in" or rid not in d:
            continue
        e = d[rid]
        heads = e["heads"] or []
        out.append({"register_id": rid, "name": e["name"], "function": s["function"], "status": e["status"],
                    "successor": "|".join(e["succ"] or []), "path_up": " > ".join(path(rid)),
                    "heads": len(heads), "top_head": f"{heads[0]['name']} ({heads[0]['role']})" if heads else "",
                    "in_map": in_map(e["name"])})
    f = REF / f"{m.lower()}_network.csv"
    with f.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0].keys()) if out else ["register_id"])
        w.writeheader()
        w.writerows(out)
    new = [r for r in out if not r["in_map"]]
    print(f"{m}: {len(out)} in scope; {len(out) - len(new)} already in the map, {len(new)} new; "
          f"{sum(r['heads'] > 0 for r in out)} with named heads; {sum(r['status'] == 'closed' for r in out)} closed; "
          f"{sum(bool(r['path_up']) for r in out)} placed under a parent -> {f.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
