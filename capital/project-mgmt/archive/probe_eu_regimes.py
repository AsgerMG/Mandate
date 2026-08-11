"""Per-regime residual class size for every regime that holds an EU leaf.

The global scoreboard (`measure_sibling_coverage.ts`) is leaf-weighted over 797
leaves, and EU is ~8% of them, so a regime going from 10 siblings to 1 moves the
global mean by a tenth. That is the honest global number and it is reported as
such -- but it is useless for steering work inside the EU tier, where the
question is "which regime is still unresolved and by how much".

So this reports the same class computation, restricted to regimes containing at
least one EU leaf, per regime. The key is the one the scoreboard's headline row
uses (ALL THREE J OMITTED): administering_body | delivery_region |
eligibility_text. Reads POSTGRES, because Postgres is what the product and the
scoreboard read; a number read out of SQLite is a number about a store nobody
serves.

  python3 project-mgmt/probe_eu_regimes.py            # per-regime table
  python3 project-mgmt/probe_eu_regimes.py --leaves ID # every leaf of one regime
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

for _anc in Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "lib"))
        break
    if (_anc / "ETL" / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "ETL" / "lib"))
        break
from etl_env import ROOT  # noqa: E402


def load_env() -> None:
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def h(s) -> str:
    return str(s).strip().lower()[:400] if s else ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--leaves", metavar="REGIME_ID")
    args = ap.parse_args()

    load_env()
    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    with conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, parent_id, country, name, administering_body,
                   delivery_region, eligibility_text, eligibility_source_url
              FROM funding_instruments""")
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()

    regimes: dict[str, list[dict]] = {}
    for r in rows:
        regimes.setdefault(r["parent_id"] or r["id"], []).append(r)

    def key(r):
        return (h(r["administering_body"]) + "|" + h(r["delivery_region"])
                + "|" + h(r["eligibility_text"]))

    if args.leaves:
        g = regimes[args.leaves]
        cls: dict[str, int] = {}
        for r in g:
            cls[key(r)] = cls.get(key(r), 0) + 1
        for r in sorted(g, key=lambda x: x["id"]):
            n = cls[key(r)]
            txt = (r["eligibility_text"] or "")
            print(f"  class {n}  {r['id']:<44} {r['country']}  "
                  f"body={r['administering_body'] or '-'}")
            print(f"        name: {r['name']}")
            print(f"        text: {len(txt)} chars  "
                  f"{(txt[:110] + '...') if txt else '(none)'}")
            print(f"        url : {r['eligibility_source_url'] or '-'}")
        return

    eu_regimes = {k: g for k, g in regimes.items()
                  if len(g) > 1 and any(r["country"] == "EU" for r in g)}
    tot_leaves = tot_class = 0
    print(f"{'regime':<34}{'leaves':>7}{'EU':>4}{'covered':>9}{'meanclass':>11}")
    out = []
    for k, g in eu_regimes.items():
        cls: dict[str, int] = {}
        for r in g:
            cls[key(r)] = cls.get(key(r), 0) + 1
        s = sum(cls[key(r)] for r in g)
        cov = sum(1 for r in g if len((r["eligibility_text"] or "").strip()) > 40)
        tot_leaves += len(g)
        tot_class += s
        out.append((s / len(g), k, len(g),
                    sum(1 for r in g if r["country"] == "EU"), cov))
    for mc, k, n, eu, cov in sorted(out, reverse=True):
        print(f"{k:<34}{n:>7}{eu:>4}{cov:>9}{mc:>11.2f}")
    print(f"\nEU-containing regimes: {len(eu_regimes)} regimes, "
          f"{tot_leaves} leaves, local mean class {tot_class / tot_leaves:.2f}")

    eu = [r for r in rows if r["country"] == "EU"]
    print(f"EU rows: {len(eu)}   with eligibility_text>40: "
          f"{sum(1 for r in eu if len((r['eligibility_text'] or '').strip()) > 40)}"
          f"   with administering_body: "
          f"{sum(1 for r in eu if r['administering_body'])}")


if __name__ == "__main__":
    main()
